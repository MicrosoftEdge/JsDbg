using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;

namespace JsDbg {
    class WinDbgDebuggerEngine : Core.ITypeCacheDebuggerEngine {
        public WinDbgDebuggerEngine(DebugClient client, Core.DiaSessionLoader diaLoader) {
            this.client = client;
            this.client.OutputMask = OutputModes.Normal;
            this.control = new DebugControl(this.client);
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

        public async Task WaitForBreakIn() {
            if (this.control.ExecutionStatus != DebugStatus.Break) {
                Console.Out.WriteLine("Debugger is busy, waiting for break in.");
                while (this.control.ExecutionStatus != DebugStatus.Break) {
                    await Task.Delay(1000);
                }
            }
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

        public string GetModuleForAddress(ulong address, out ulong baseAddress) {
            string moduleName;
            this.symbolCache.GetModule(address, out baseAddress, out moduleName);
            return moduleName;
        }

        public ulong GetBaseAddressForModule(string module) {
            return this.symbolCache.GetModuleBase(module);
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

        public event EventHandler DebuggerBroke;

        public event EventHandler BitnessChanged;

        private void PrintDotOnDebugOutput(object sender, DebugOutputEventArgs e) {
            Console.Out.Write('.');
        }

        public Type GetTypeFromDebugger(string module, string typename) {
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
                fields.Add(parsedField.FieldName, field);
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
            return new Type(module, typename, typeSize, fields, constants, null, baseTypeNames);
        }

        public async Task<SSymbolResult> LookupGlobalSymbol(string module, string symbol) {
            await this.WaitForBreakIn(); // TODO: redundant

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
        }

        public Task<IEnumerable<SSymbolResult>> LookupLocalSymbols(string module, string methodName, string symbol, int maxCount) {
            throw new NotImplementedException();
        }

        public async Task<SSymbolNameResult> LookupSymbolName(ulong pointer) {
            await this.WaitForBreakIn(); // TODO: redundant

            string fullyQualifiedSymbolName;
            ulong displacement;

            this.symbolCache.GetSymbolName(pointer, out fullyQualifiedSymbolName, out displacement);
            if (displacement != 0 || fullyQualifiedSymbolName.IndexOf("!") == -1) {
                throw new Exception();
            }
            string[] parts = fullyQualifiedSymbolName.Split(new char[] { '!' }, 2);
            return new SSymbolNameResult() { Module = parts[0], Name = parts[1] };
        }

        #endregion

        private Microsoft.Debuggers.DbgEng.DebugClient client;
        private Microsoft.Debuggers.DbgEng.DebugControl control;
        private Microsoft.Debuggers.DbgEng.DebugDataSpaces dataSpaces;
        private Microsoft.Debuggers.DbgEng.DebugSymbols symbols;
        private SymbolCache symbolCache;
        private Core.DiaSessionLoader diaLoader;
        private bool isPointer64Bit;
    }
}
