using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;

namespace JsDbg {
    class WinDbgDebuggerEngine : Core.ITypeCacheDebuggerEngine {
        public WinDbgDebuggerEngine(WinDbgDebuggerRunner runner, DebugClient client, DebugControl control, Core.DiaSessionLoader diaLoader) {
            this.runner = runner;
            this.client = client;
            this.client.OutputMask = OutputModes.Normal;
            this.control = control;
            this.isPointer64Bit = (this.control.EffectiveProcessorType == Processor.Amd64);
            this.symbolCache = new SymbolCache(this.client);
            this.dataSpaces = new DebugDataSpaces(this.client);
            this.symbols = new DebugSymbols(this.client);
            this.diaLoader = diaLoader;
        }

        internal void NotifyDebuggerBroke() {
            if (this.DebuggerBroke != null) {
                this.DebuggerBroke(this, new EventArgs());
            }
        }

        #region ITypeCacheDebuggerEngine Members

        public Task WaitForBreakIn() {
            return this.runner.WaitForBreakIn();
        }

        public Core.DiaSessionLoader DiaLoader {
            get { return this.diaLoader; }
        }

        public bool IsPointer64Bit {
            get { return this.isPointer64Bit; }
            set {
                if (value != this.isPointer64Bit) {
                    this.isPointer64Bit = value;
                    this.BitnessChanged(this, new EventArgs());
                }
            }
        }

        private async Task<T> AttemptOperation<T>(Func<T> operation, string errorMessage) {
            bool retryAfterWaitingForBreak = false;
            do {
                try {
                    return operation();
                } catch (InvalidOperationException) {
                    if (!retryAfterWaitingForBreak) {
                        retryAfterWaitingForBreak = true;
                    } else {
                        throw new DebuggerException(errorMessage);
                    }
                } catch (DebuggerException) {
                    throw;
                } catch {
                    throw new DebuggerException(errorMessage);
                }

                await this.WaitForBreakIn();
            } while (true);
        }

        public Task<Core.SModule> GetModuleForAddress(ulong address) {
            return this.AttemptOperation<Core.SModule>(() => {
                Core.SModule result = new Core.SModule();
                this.symbolCache.GetModule(address, out result.BaseAddress, out result.Name);
                return result;
            }, String.Format("Unable to get module at address 0x{0:x8}", address));
        }

        public Task<Core.SModule> GetModuleForName(string module) {
            return this.AttemptOperation<Core.SModule>(() => {
                Core.SModule result = new Core.SModule();
                result.Name = module;
                result.BaseAddress = this.symbolCache.GetModuleBase(module);
                return result;
            }, String.Format("Unable to get module: ", module));
        }

        public Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct {
            return this.AttemptOperation<T[]>(() => {
                // TODO: can we ever have incomplete reads?
                T[] result = new T[size];
                this.dataSpaces.ReadVirtual<T>(pointer, result);
                return result;
            }, String.Format("Invalid memory address: 0x{0:x8}", pointer));
        }

        public Task<IEnumerable<Core.SStackFrameWithContext>> GetCurrentCallStack() {
            return this.AttemptOperation<IEnumerable<Core.SStackFrameWithContext>>(() => {
                List<Core.SStackFrameWithContext> stackFrames = new List<Core.SStackFrameWithContext>();

                DebugStackTrace stack = this.control.GetStackTrace(128);
                foreach (DebugStackFrame frame in stack) {
                    stackFrames.Add(new Core.SStackFrameWithContext() {
                        Context = frame,
                        StackFrame = new SStackFrame() {
                            FrameAddress = frame.FrameOffset,
                            StackAddress = frame.StackOffset,
                            InstructionAddress = frame.InstructionOffset
                        }
                    });
                }

                return stackFrames;
            }, "Unable to get callstack.");
        }

        public event EventHandler DebuggerBroke;

        public event EventHandler BitnessChanged;

        private void PrintDotOnDebugOutput(object sender, DebugOutputEventArgs e) {
            Console.Out.Write('.');
        }

        public Task<Type> GetTypeFromDebugger(string module, string typename) {
            return this.AttemptOperation<Type>(() => {
                uint typeSize = 0;

                ulong moduleBase;
                try {
                    moduleBase = this.symbolCache.GetModuleBase(module);
                } catch {
                    throw new JsDbg.DebuggerException(String.Format("Invalid module name: {0}", module));
                }

                // Get the type id.
                uint typeId;
                try {
                    typeId = this.symbolCache.GetTypeId(moduleBase, typename);
                } catch {
                    throw new JsDbg.DebuggerException(String.Format("Invalid type name: {0}", typename));
                }

                // Get the type size.
                try {
                    typeSize = this.symbolCache.GetTypeSize(moduleBase, typeId);
                } catch {
                    throw new JsDbg.DebuggerException("Internal Exception: Invalid type id.");
                }

                // The type is valid so we should be able to dt it without any problems.
                string command = String.Format("dt -v {0}!{1}", module, typename);
                System.Diagnostics.Debug.WriteLine(String.Format("Executing command: {0}", command));
                DumpTypeParser parser = new DumpTypeParser();
                this.client.DebugOutput += parser.DumpTypeOutputHandler;
                this.client.DebugOutput += PrintDotOnDebugOutput;
                this.control.Execute(OutputControl.ToThisClient, command, ExecuteOptions.NotLogged);
                this.client.FlushCallbacks();
                this.client.DebugOutput -= PrintDotOnDebugOutput;
                this.client.DebugOutput -= parser.DumpTypeOutputHandler;
                System.Diagnostics.Debug.WriteLine(String.Format("Done executing.", command));
                parser.Parse();

                if (parser.AnonymousEnums.Count > 0) {
                    List<string> anonymousEnums = parser.AnonymousEnums;
                    parser.AnonymousEnums = new List<string>();
                    parser.ClearBuffer();
                    foreach (string enumType in anonymousEnums) {
                        string enumCommand = String.Format("dt -v {0}!{1}", module, enumType);
                        System.Diagnostics.Debug.WriteLine(String.Format("Executing command: {0}", enumCommand));
                        this.client.DebugOutput += parser.DumpTypeOutputHandler;
                        this.client.DebugOutput += PrintDotOnDebugOutput;
                        this.control.Execute(OutputControl.ToThisClient, enumCommand, ExecuteOptions.NotLogged);
                        this.client.FlushCallbacks();
                        this.client.DebugOutput -= PrintDotOnDebugOutput;
                        this.client.DebugOutput -= parser.DumpTypeOutputHandler;
                        System.Diagnostics.Debug.WriteLine(String.Format("Done executing.", enumCommand));
                    }
                    parser.Parse();
                }
                Console.Out.WriteLine();

                // Construct the type.
                Dictionary<string, SField> fields = new Dictionary<string, SField>();
                foreach (DumpTypeParser.SField parsedField in parser.ParsedFields) {
                    string resolvedTypeName = parsedField.TypeName;
                    uint resolvedTypeSize = parsedField.Size;

                    if (resolvedTypeName == null) {
                        // We weren't able to parse the type name.  Retrieve it manually.
                        SymbolCache.SFieldTypeAndOffset fieldTypeAndOffset;
                        try {
                            fieldTypeAndOffset = this.symbolCache.GetFieldTypeAndOffset(moduleBase, typeId, parsedField.FieldName);

                            if (fieldTypeAndOffset.Offset != parsedField.Offset) {
                                // The offsets don't match...this must be a different field?
                                throw new Exception();
                            }

                            resolvedTypeName = this.symbolCache.GetTypeName(moduleBase, fieldTypeAndOffset.FieldTypeId);
                        } catch {
                            throw new JsDbg.DebuggerException(String.Format("Internal Exception: Inconsistent field name \"{0}\" when parsing type {1}!{2}", parsedField.FieldName, module, typename));
                        }
                    }

                    if (resolvedTypeSize == uint.MaxValue) {
                        if (!JsDbg.TypeCache.BuiltInTypes.TryGetValue(resolvedTypeName, out resolvedTypeSize)) {
                            try {
                                uint fieldTypeId = this.symbolCache.GetTypeId(moduleBase, resolvedTypeName);
                                resolvedTypeSize = this.symbolCache.GetTypeSize(moduleBase, fieldTypeId);
                            } catch {
                                throw new JsDbg.DebuggerException(String.Format("Internal Exception: Unknown type \"{0}\" found when parsing type {1}!{2}", resolvedTypeName, module, typename));
                            }
                        }
                    }

                    SField field = new SField(parsedField.Offset, resolvedTypeSize, resolvedTypeName, parsedField.BitField.BitOffset, parsedField.BitField.BitLength);
                    // A superclass can have a field with the same name as a field in the subclass.  We currently use the first one.
                    if (!fields.ContainsKey(parsedField.FieldName)) {
                        fields.Add(parsedField.FieldName, field);
                    }
                }

                List<SBaseTypeName> baseTypeNames = new List<SBaseTypeName>();
                foreach (DumpTypeParser.SBaseClass parsedBaseClass in parser.ParsedBaseClasses) {
                    baseTypeNames.Add(new SBaseTypeName(parsedBaseClass.TypeName, (int)parsedBaseClass.Offset));
                }

                Dictionary<string, ulong> constants = new Dictionary<string, ulong>();
                foreach (SConstantResult constant in parser.ParsedConstants) {
                    constants.Add(constant.ConstantName, constant.Value);
                }

                // Construct the type.  We don't need to fill base types because this approach embeds base type information directly in the Type.
                return new Type(module, typename, typeSize, parser.IsEnum, fields, constants, null, baseTypeNames);
            }, String.Format("Unable to lookup type from debugger: {0}!{1}", module, typename));
        }

        public Task<SSymbolResult> LookupGlobalSymbol(string module, string symbol) {
            return this.AttemptOperation<SSymbolResult>(() => {
                SSymbolResult result = new SSymbolResult();

                uint typeId = 0;
                ulong moduleBase = 0;
                string fullyQualifiedSymbolName = module + "!" + symbol;
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
                    return result;
                } catch {
                    throw new DebuggerException(String.Format("Internal error with symbol: {0}", fullyQualifiedSymbolName));
                }
            }, String.Format("Unable to lookup global symbol: {0}!{1}", module, symbol));
        }

        public Task<IEnumerable<SSymbolResult>> LookupLocalsInStackFrame(Core.SStackFrameWithContext stackFrameWithContext, string symbolName) {
            return this.AttemptOperation<IEnumerable<SSymbolResult>>(() => {
                List<SSymbolResult> results = new List<SSymbolResult>();

                // Save the previous scope.
                ulong previousInstructionOffset;
                DebugStackFrame previousStackFrame;
                this.symbols.GetScope(out previousInstructionOffset, out previousStackFrame, null);

                // Jump to the scope in the context, and see if the symbol is there.
                this.symbols.SetScope(0, (DebugStackFrame)stackFrameWithContext.Context, null);
                DebugSymbolGroup symbolGroup = this.symbols.GetScopeSymbolGroup(GroupScope.Arguments | GroupScope.Locals);
                for (uint i = 0; i < symbolGroup.NumberSymbols; ++i) {
                    if (symbolName == symbolGroup.GetSymbolName(i)) {
                        DebugSymbolEntry entry = symbolGroup.GetSymbolEntryInformation(i);

                        SSymbolResult result = new SSymbolResult();
                        result.Module = this.symbols.GetModuleNameStringByBaseAddress(ModuleName.Module, entry.ModuleBase);
                        result.Type = this.symbolCache.GetTypeName(entry.ModuleBase, entry.TypeId);

                        if (entry.Offset != 0) {
                            // The variable is located in memory.
                            result.Pointer = entry.Offset;
                        } else {
                            // The variable is located in a register.  If the variable is a pointer, we can automatically dereference it, but otherwise we don't currently have a way to express the location.
                            if (result.Type.EndsWith("*")) {
                                // Trim off the last * because the offset we were given is the value itself (i.e. it is the pointer, not the pointer to the pointer).
                                result.Type = result.Type.Substring(0, result.Type.Length - 1);
                                this.symbols.GetOffsetByName(symbolName, out result.Pointer);
                            } else {
                                // Don't include it.  In the future, we could perhaps express this object as living in its own address space so that the client can at least dereference it.
                                break;
                            }
                        }
                        results.Add(result);
                        break;
                    }
                }

                // Restore the previous scope.
                this.symbols.SetScope(0, previousStackFrame, null);

                return results;
            }, String.Format("Unable to lookup local symbol: {0}", symbolName));
            
        }

        public Task<SSymbolNameResultAndDisplacement> LookupSymbolName(ulong pointer) {
            return this.AttemptOperation<SSymbolNameResultAndDisplacement>(() => {
                string fullyQualifiedSymbolName;
                ulong displacement;
                this.symbolCache.GetSymbolName(pointer, out fullyQualifiedSymbolName, out displacement);
                if (fullyQualifiedSymbolName.IndexOf("!") == -1) {
                    throw new Exception();
                }
                string[] parts = fullyQualifiedSymbolName.Split(new char[] { '!' }, 2);
                return new SSymbolNameResultAndDisplacement() { Symbol = new SSymbolNameResult() { Module = parts[0], Name = parts[1] }, Displacement = displacement };
            }, String.Format("Unable to lookup symbol at pointer: 0x{0:x8}", pointer));
        }

        #endregion

        private WinDbgDebuggerRunner runner;
        private Microsoft.Debuggers.DbgEng.DebugClient client;
        private Microsoft.Debuggers.DbgEng.DebugControl control;
        private Microsoft.Debuggers.DbgEng.DebugDataSpaces dataSpaces;
        private Microsoft.Debuggers.DbgEng.DebugSymbols symbols;
        private SymbolCache symbolCache;
        private Core.DiaSessionLoader diaLoader;
        private bool isPointer64Bit;
    }
}
