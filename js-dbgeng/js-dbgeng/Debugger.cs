using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;

namespace JsDbg {
    class Debugger : IDisposable, JsDbg.IDebugger {
       
        public Debugger(string connectionString) {
            this.client = new DebugClient(connectionString);
            this.client.OutputMask = OutputModes.Normal;
            this.control = new DebugControl(this.client);
            this.isPointer64Bit = this.control.IsPointer64Bit;
            this.exitDispatchClient = new DebugClient(connectionString);
            this.symbolCache = new SymbolCache(this.client);
            this.typeCache = new TypeCacheWithFallback(this.isPointer64Bit, this.symbolCache.GetModuleSymbolPath);
            this.dataSpaces = new DebugDataSpaces(this.client);
            this.symbols = new DebugSymbols(this.client);
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
                        this.typeCache = new TypeCacheWithFallback(this.isPointer64Bit, this.symbolCache.GetModuleSymbolPath);
                    }
                } else if (args.Change == EngineStateChange.ExecutionStatus) {
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
                throw new DebuggerException(String.Format("Invalid field name: {0}", fieldName));
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

        public async Task<string> LookupConstantName(string module, string type, ulong constant) {
            await this.WaitForBreakIn();

            // Get the module.
            ulong moduleBase;
            System.Diagnostics.Debug.WriteLine(String.Format("getting module: {0}", module));
            try {
                moduleBase = this.symbolCache.GetModuleBase(module);
            } catch {
                throw new DebuggerException(String.Format("Invalid module name: {0}", module));
            }

            // Get the type id of the type.
            System.Diagnostics.Debug.WriteLine(String.Format("getting type: {0}", type));
            uint typeId;
            try {
                typeId = this.symbolCache.GetTypeId(moduleBase, type);
            } catch {
                throw new DebuggerException(String.Format("Invalid type name: {0}", type));
            }

            // Lookup the constant name.
            string result;
            try {
                result = this.symbolCache.GetConstantName(moduleBase, typeId, constant);
            } catch {
                throw new DebuggerException(String.Format("Invalid constant: {0}", constant));
            }
            return result;
        }

        public async Task<string> LookupSymbol(ulong pointer) {
            await this.WaitForBreakIn();

            string name;
            ulong displacement;
            try {
                this.symbolCache.GetSymbolName(pointer, out name, out displacement);
                if (displacement != 0) {
                    throw new Exception();
                }
            } catch {
                throw new DebuggerException(String.Format("Invalid symbol address: 0x{0:x8}", pointer));
            }
            return name;
        }

        public async Task<SSymbolResult> LookupSymbol(string symbol, bool isGlobal) {
            await this.WaitForBreakIn();
            
            SSymbolResult result = new SSymbolResult();

            uint typeId = 0;
            ulong module = 0;
            bool isPointerToType = true;
            try {
                bool foundSymbolInScope = false;
                if (!isGlobal) {
                    DebugSymbolGroup group = this.symbols.GetScopeSymbolGroup(GroupScope.All);
                    for (uint i = 0; i < group.NumberSymbols; ++i) {
                        if (symbol == group.GetSymbolName(i)) {
                            DebugSymbolEntry entry = group.GetSymbolEntryInformation(i);
                            typeId = entry.TypeId;
                            module = entry.ModuleBase;
                            result.Pointer = entry.Offset;
                            foundSymbolInScope = (entry.Offset != 0);

                            isPointerToType = foundSymbolInScope && (Dia2Lib.SymTagEnum)entry.Tag == Dia2Lib.SymTagEnum.SymTagPointerType;
                            break;
                        }
                    }
                }

                if (!foundSymbolInScope) {
                    this.symbols.GetSymbolTypeId(symbol, out typeId, out module);
                    this.symbols.GetOffsetByName(symbol, out result.Pointer);
                }
            } catch {
                throw new DebuggerException(String.Format("Invalid symbol: {0}", symbol));
            }

            // Now that we have type ids and an offset, we can resolve the names.
            try {
                result.Type = this.symbolCache.GetTypeName(module, typeId);
                if (!isPointerToType && result.Type.EndsWith("*")) {
                    // Trim off the last * because the offset we were given is the value itself (i.e. it is the pointer, not the pointer
                    // to the pointer).
                    result.Type = result.Type.Substring(0, result.Type.Length - 1);
                }

                string imageName, loadedImageName;
                this.symbols.GetModuleNamesByBaseAddress(module, out imageName, out result.Module, out loadedImageName);
            } catch {
                throw new DebuggerException(String.Format("public error with symbol: {0}", symbol));
            }

            return result;
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
        private bool isPointer64Bit;
        private bool isShuttingDown;
        private bool didShutdown;
    }
}
