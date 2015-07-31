using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;

namespace JsDbg {
    class Debugger : IDisposable, JsDbg.IDebugger {
        public event EventHandler DebuggerBroke;
       
        public Debugger(string connectionString, Core.IConfiguration configuration) {
            this.client = new DebugClient(connectionString);
            this.client.OutputMask = OutputModes.Normal;
            this.control = new DebugControl(this.client);
            this.isPointer64Bit = (this.control.EffectiveProcessorType == Processor.Amd64);
            this.exitDispatchClient = new DebugClient(connectionString);
            this.symbolCache = new SymbolCache(this.client);
            this.dataSpaces = new DebugDataSpaces(this.client);
            this.symbols = new DebugSymbols(this.client);
            this.diaLoader = new Core.DiaSessionLoader(
                configuration,
                new Core.IDiaSessionSource[] { new DiaSessionPathSource(this.symbolCache), new DiaSessionModuleSource(this.symbolCache, this.dataSpaces) }
            );
            this.typeCache = new TypeCacheWithFallback(this.diaLoader, this.isPointer64Bit);
            this.isShuttingDown = false;
            this.didShutdown = true;
        }

        public async Task Shutdown() {
            if (!this.didShutdown) {
                this.isShuttingDown = true;

                // Wait for "Run" to finish.
                while (this.isShuttingDown) {
                    await Task.Yield();
                }
            }
        }

        public async Task Run()
        {
            this.didShutdown = false;
            bool isRestarting = false;

            System.EventHandler<EngineStateChangeEventArgs> engineStateChanged = (object sender, EngineStateChangeEventArgs args) => {
                if (args.Change == EngineStateChange.EffectiveProcessor) {
                    Processor processorType = (Processor)args.Argument;
                    if ((processorType == Processor.Amd64) == !(this.isPointer64Bit)) {
                        // Invalidate the type cache.
                        Console.Out.WriteLine("Effective processor changed, so invalidating type cache.  You may need to refresh the browser window.");
                        this.isPointer64Bit = !this.isPointer64Bit;
                        this.typeCache = new TypeCacheWithFallback(this.diaLoader, this.isPointer64Bit);
                    }
                } else if (args.Change == EngineStateChange.ExecutionStatus) {
                    bool insideWait = (args.Argument & (ulong)DebugStatus.InsideWait) == (ulong)DebugStatus.InsideWait;
                    DebugStatus executionStatus = (DebugStatus)(args.Argument & (~(ulong)DebugStatus.InsideWait));
                    if (executionStatus == DebugStatus.RestartTarget) {
                        isRestarting = true;
                    } else if (executionStatus == DebugStatus.NoDebuggee) {
                        if (isRestarting) {
                            isRestarting = false;
                            Console.Out.WriteLine("Process is restarting.");
                        } else {
                            Console.Out.WriteLine("Debugger has no target, shutting down.");
                            Task shutdownTask = this.Shutdown();
                        }
                    } else if (executionStatus == DebugStatus.Break) {
                        if (this.DebuggerBroke != null && !insideWait) {
                            this.DebuggerBroke(this, new EventArgs());
                        }
                    }
                }
            };

            this.client.EngineStateChanged += engineStateChanged;

            while (!this.isShuttingDown) {
                try {
                    this.client.DispatchCallbacks(TimeSpan.Zero);
                    await Task.Delay(100);
                } catch (Exception ex) {
                    Console.Out.WriteLine("Shutting down due to exception: {0}", ex.Message);
                    Task shutdownTask = this.Shutdown();
                }
            }

            try {
                this.client.DispatchCallbacks(TimeSpan.Zero);
                this.client.EngineStateChanged -= engineStateChanged;
            } finally {
                this.isShuttingDown = false;
                this.didShutdown = true;
            }
        }

        public async Task<uint> LookupTypeSize(string module, string typename) {
            await this.WaitForBreakIn();
            return this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename).Size;
        }

        public async Task<SFieldResult> LookupField(string module, string typename, string fieldName)
        {
            await this.WaitForBreakIn();

            SFieldResult result = new SFieldResult();
            
            Type type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename);
            SField field;
            if (type.GetField(fieldName, out field)) {
                result.Offset += field.Offset;
                result.BitCount = field.BitCount;
                result.BitOffset = field.BitOffset;
                result.TypeName = field.TypeName;
                result.Size = field.Size;
            } else {
                throw new DebuggerException(String.Format("Invalid field name: {0} of type: {1}", fieldName, typename));
            }

            return result;
        }


        public async Task<IEnumerable<SFieldResult>> GetAllFields(string module, string typename) {
            await this.WaitForBreakIn();
            Type type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename);
            return type.Fields;
        }

        public async Task<IEnumerable<SBaseTypeResult>> GetBaseTypes(string module, string typename) {
            await this.WaitForBreakIn();
            Type type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename);
            return type.BaseTypes;
        }

        public async Task<SConstantResult> LookupConstant(string module, string typename, ulong constant) {
            await this.WaitForBreakIn();

            Type type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename);
            foreach (SConstantResult constantResult in type.Constants) {
                if (constantResult.Value == constant) {
                    return constantResult;
                }
            }

            throw new DebuggerException(String.Format("Unknown constant value: {0} in type: {1}", constant, typename));
        }

        public async Task<SConstantResult> LookupConstant(string module, string typename, string constantName) {
            await this.WaitForBreakIn();

            Type type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename);
            ulong constantValue;
            if (type.GetConstantValue(constantName, out constantValue)) {
                return new SConstantResult() {ConstantName = constantName, Value = constantValue};
            } else {
                throw new DebuggerException(String.Format("Unknown constant name: {0} in type: {1}", constantName, typename));
            }
        }

        public async Task<SSymbolNameResult> LookupSymbolName(ulong pointer) {
            await this.WaitForBreakIn();

            try {
                string moduleName;
                ulong moduleBase;
                this.symbolCache.GetModule(pointer, out moduleBase, out moduleName);
                Dia2Lib.IDiaSession session = this.diaLoader.LoadDiaSession(moduleName);

                if (session != null) {
                    // We have a DIA session; use it.
                    Dia2Lib.IDiaSymbol symbol;
                    int displacement;
                    session.findSymbolByRVAEx((uint)(pointer - moduleBase), Dia2Lib.SymTagEnum.SymTagNull, out symbol, out displacement);
                    string name;
                    symbol.get_undecoratedNameEx(0x1000, out name);
                    if (displacement != 0) {
                        throw new Exception();
                    }

                    return new SSymbolNameResult() { Module = moduleName, Name = name };
                } else {
                    string fullyQualifiedSymbolName;
                    ulong displacement;

                    this.symbolCache.GetSymbolName(pointer, out fullyQualifiedSymbolName, out displacement);
                    if (displacement != 0 || fullyQualifiedSymbolName.IndexOf("!") == -1) {
                        throw new Exception();
                    }
                    string[] parts = fullyQualifiedSymbolName.Split(new char[] { '!' }, 2);
                    return new SSymbolNameResult() { Module = parts[0], Name = parts[1] };
                }
            } catch {
                throw new DebuggerException(String.Format("Invalid symbol address: 0x{0:x8}", pointer));
            }
        }

        public async Task<SSymbolResult> LookupGlobalSymbol(string moduleName, string symbolName) {
            await this.WaitForBreakIn();

            SSymbolResult result = new SSymbolResult();

            Dia2Lib.IDiaSession session = this.diaLoader.LoadDiaSession(moduleName);
            if (session != null) {
                // We have a DIA session, use that.
                try {
                    Dia2Lib.IDiaEnumSymbols symbols;
                    session.globalScope.findChildren(Dia2Lib.SymTagEnum.SymTagNull, symbolName, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out symbols);
                    foreach (Dia2Lib.IDiaSymbol diaSymbol in symbols) {
                        result.Module = moduleName;
                        result.Pointer = this.symbolCache.GetModuleBase(moduleName) + diaSymbol.relativeVirtualAddress;
                        result.Type = DiaHelpers.GetTypeName(diaSymbol.type);
                        return result;
                    }
                } catch { }
                throw new DebuggerException(String.Format("Invalid symbol: {0}!{1}", moduleName, symbolName));
            }

            // No DIA session, fallback to the debugger.

            uint typeId = 0;
            ulong moduleBase = 0;
            string fullyQualifiedSymbolName = moduleName + "!" + symbolName;
            try {
                this.symbols.GetSymbolTypeId(fullyQualifiedSymbolName, out typeId, out moduleBase);
                this.symbols.GetOffsetByName(fullyQualifiedSymbolName, out result.Pointer);
            } catch {
                throw new DebuggerException(String.Format("Invalid symbol: {0}", fullyQualifiedSymbolName));
            }

            // Now that we have type ids and an offset, we can resolve the names.
            try {
                result.Type = this.symbolCache.GetTypeName(moduleBase, typeId);
                result.Module = this.symbols.GetModuleNameStringByBaseAddress(ModuleName.Module, moduleBase);
            } catch {
                throw new DebuggerException(String.Format("Internal error with symbol: {0}", fullyQualifiedSymbolName));
            }

            return result;
        }

        public async Task<IEnumerable<SSymbolResult>> LookupLocalSymbols(string module, string methodName, string symbol, int maxCount) {
            await this.WaitForBreakIn();

            List<SSymbolResult> results = new List<SSymbolResult>();
            bool foundStackFrame = false;
            bool foundLocal = false;

            try {
                DebugStackTrace stack = this.control.GetStackTrace(128);
                string fullMethodName = module + "!" + methodName;

                ulong moduleBase = this.symbolCache.GetModuleBase(module);

                foreach (DebugStackFrame frame in stack) {
                    string frameName;
                    ulong displacement;

                    try {
                        this.symbolCache.GetSymbolName(frame.InstructionOffset, out frameName, out displacement);
                    } catch {
                        continue;
                    }

                    if (frameName == fullMethodName) {
                        foundStackFrame = true;

                        uint rva = (uint)(frame.InstructionOffset - moduleBase);

                        IList<SLocalVariable> locals = this.typeCache.GetLocals(module, methodName, rva, symbol);
                        if (locals != null) {
                            if (locals.Count > 0) {
                                // Currently the type cache can return multiple locals from the same method if they have the same name; we're just grabbing the first one.
                                foundLocal = true;
                                ulong address = locals[0].IsOffsetFromBottom ? frame.StackOffset : frame.FrameOffset;
                                address = (ulong)((long)address + locals[0].FrameOffset);
                                results.Add(new SSymbolResult() { Module = module, Pointer = address, Type = locals[0].Type });
                            }
                        } else {
                            // We couldn't get the locals from the type cache.  Try the debugger instead.

                            // Save the previous scope.
                            ulong previousInstructionOffset;
                            DebugStackFrame previousStackFrame;
                            this.symbols.GetScope(out previousInstructionOffset, out previousStackFrame, null);

                            // Jump to this scope, and see if the symbol is there.
                            this.symbols.SetScope(0, frame, null);
                            DebugSymbolGroup symbolGroup = this.symbols.GetScopeSymbolGroup(GroupScope.Arguments | GroupScope.Locals);
                            for (uint i = 0; i < symbolGroup.NumberSymbols; ++i) {
                                if (symbol == symbolGroup.GetSymbolName(i)) {
                                    foundLocal = true;

                                    DebugSymbolEntry entry = symbolGroup.GetSymbolEntryInformation(i);

                                    SSymbolResult result = new SSymbolResult();
                                    result.Module = module;
                                    result.Type = this.symbolCache.GetTypeName(entry.ModuleBase, entry.TypeId);

                                    if (entry.Offset != 0) {
                                        result.Pointer = entry.Offset;
                                    } else {
                                        this.symbols.GetOffsetByName(symbol, out result.Pointer);
                                        if (result.Type.EndsWith("*")) {
                                            // Trim off the last * because the offset we were given is the value itself (i.e. it is the pointer, not the pointer to the pointer).
                                            result.Type = result.Type.Substring(0, result.Type.Length - 1);
                                        }
                                    }
                                    results.Add(result);
                                    break;
                                }
                            }

                            // Restore the previous scope.
                            this.symbols.SetScope(0, previousStackFrame, null);
                        }

                        if (maxCount > 0 && results.Count == maxCount) {
                            break;
                        }
                    }
                }
            } catch {
                throw new DebuggerException(String.Format("Unexpected error occurred while retrieving local \"{0}\" in method \"{1}\".", symbol, methodName));
            }

            if (!foundStackFrame) {
                throw new DebuggerException(String.Format("Could not find stack frame: {0}", methodName));
            } else if (!foundLocal) {
                throw new DebuggerException(String.Format("Could not find local symbol: {0}", symbol));
            } else {
                return results;
            }
        }

        public async Task<T> ReadMemory<T>(ulong pointer) where T : struct {
            bool retryAfterWaitingForBreak = false;
            do {
                try {
                    T[] result = new T[1];
                    this.dataSpaces.ReadVirtual<T>(pointer, result);
                    return result[0];
                } catch (InvalidOperationException) {
                    if (!retryAfterWaitingForBreak) {
                        retryAfterWaitingForBreak = true;
                    } else {
                        throw new DebuggerException(String.Format("Invalid memory address: 0x{0:x8}", pointer));
                    }
                } catch {
                    throw new DebuggerException(String.Format("Invalid memory address: 0x{0:x8}", pointer));
                }

                await this.WaitForBreakIn();
            } while (true);
        }

        public async Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct {
            bool retryAfterWaitingForBreak = false;
            do {
                try {
                    // TODO: can we ever have incomplete reads?
                    T[] result = new T[size];
                    this.dataSpaces.ReadVirtual<T>(pointer, result);
                    return result;
                } catch (InvalidOperationException) {
                    if (!retryAfterWaitingForBreak) {
                        retryAfterWaitingForBreak = true;
                    } else {
                        throw new DebuggerException(String.Format("Invalid memory address: 0x{0:x8}", pointer));
                    }
                } catch {
                    throw new DebuggerException(String.Format("Invalid memory address: 0x{0:x8}", pointer));
                }

                await this.WaitForBreakIn();
            } while (true);
        }

        public bool IsPointer64Bit {
            get { return this.isPointer64Bit; }
        }

        private async Task WaitForBreakIn() {
            if (this.control.ExecutionStatus != DebugStatus.Break) {
                Console.Out.WriteLine("Debugger is busy, waiting for break in.");
                while (this.control.ExecutionStatus != DebugStatus.Break) {
                    await Task.Delay(1000);
                }
            }
        }
        
        #region IDisposable Members

        public void Dispose() {
            this.symbols.Dispose();
            this.dataSpaces.Dispose();
            this.symbolCache.Dispose();
            this.control.Dispose();
            this.exitDispatchClient.Dispose();
            this.client.Dispose();
        }

        #endregion

        private Microsoft.Debuggers.DbgEng.DebugClient client;
        private Microsoft.Debuggers.DbgEng.DebugClient exitDispatchClient;
        private Microsoft.Debuggers.DbgEng.DebugControl control;
        private Microsoft.Debuggers.DbgEng.DebugDataSpaces dataSpaces;
        private Microsoft.Debuggers.DbgEng.DebugSymbols symbols;
        private SymbolCache symbolCache;
        private TypeCacheWithFallback typeCache;
        private Core.DiaSessionLoader diaLoader;
        private bool isPointer64Bit;
        private bool isShuttingDown;
        private bool didShutdown;
    }
}
