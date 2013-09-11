using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;

namespace JsDbg {
    class Debugger : IDisposable {
        internal class DebuggerException : Exception {
            internal DebuggerException(string message)
                : base(message) {

            }
        }

        internal Debugger(string connectionString) {
            this.client = new DebugClient(connectionString);
            this.control = new DebugControl(this.client);
            this.exitDispatchClient = new DebugClient(connectionString);
            this.symbolCache = new SymbolCache(this.client);
            this.dataSpaces = new DebugDataSpaces(this.client);
            this.symbols = new DebugSymbols(this.client);
            this.isPointer64Bit = this.control.IsPointer64Bit;
        }

        // C++ fundamental types as per http://msdn.microsoft.com/en-us/library/cc953fe1.aspx
        static Dictionary<string, uint> BuiltInTypes = new Dictionary<string, uint>()
            {
                {"bool", 1},
                {"char", 1},
                {"__int8", 1},
                {"short", 2},
                {"__int16", 2},
                {"int", 4},
                {"long", 4},
                {"__int32", 4},
                {"float", 4},
                {"double", 8},
                {"long double", 8},
                {"long long", 8},
                {"__int64", 8}
            };


        internal struct SFieldResult {
            internal uint Offset;
            internal uint Size;
            internal string TypeName;
        }

        private bool CheckBuiltInTypeName(string type, IList<string> fields, out SFieldResult result) {
            string strippedType = type.Replace("unsigned", "").Replace("signed", "").Trim();
            result.Offset = 0;
            result.Size = 0;
            result.TypeName = type;

            if (BuiltInTypes.ContainsKey(strippedType) && fields.Count == 0) {
                result.Offset = 0;
                result.Size = BuiltInTypes[strippedType];
                result.TypeName = type;
                return true;
            }

            return false;
        }

        internal async Task<SFieldResult> LookupField(string module, string type, IList<string> fields) {
            // Check for built-in types first.
            SFieldResult result;
            if (CheckBuiltInTypeName(type, fields, out result)) {
                return result;
            }

            await this.WaitForBreakIn();

            // Get the module.
            ulong moduleBase;
            System.Diagnostics.Debug.WriteLine(String.Format("getting module: {0}", module));
            try {
                moduleBase = this.symbolCache.GetModuleBase(module);
            } catch {
                throw new DebuggerException(String.Format("Invalid module name: {0}", module));
            }

            // Get the type id of the initial type.
            System.Diagnostics.Debug.WriteLine(String.Format("getting initial type: {0}", type));
            uint typeId;
            try {
                typeId = this.symbolCache.GetTypeId(moduleBase, type);
            } catch {
                throw new DebuggerException(String.Format("Invalid type name: {0}", type));
            }

            result.Offset = 0;
            for (int i = 0; i < fields.Count; ++i) {
                System.Diagnostics.Debug.WriteLine(String.Format("getting field: {0}", fields[i]));
                try {
                    SymbolCache.SFieldTypeAndOffset fieldTypeAndOffset;
                    fieldTypeAndOffset = this.symbolCache.GetFieldTypeAndOffset(moduleBase, typeId, fields[i]);
                    result.Offset += fieldTypeAndOffset.Offset;
                    typeId = fieldTypeAndOffset.FieldTypeId;
                } catch {
                    throw new DebuggerException(String.Format("Invalid field name: {0}", fields[i]));
                }
            }

            System.Diagnostics.Debug.WriteLine("getting field size and name");
            try {
                result.TypeName = this.symbolCache.GetTypeName(moduleBase, typeId);
                result.Size = this.symbolCache.GetTypeSize(moduleBase, typeId);
            } catch {
                throw new DebuggerException("Internal Exception: Invalid field type.");
            }

            return result;
        }

        internal async Task<string> LookupConstantName(string module, string type, ulong constant) {
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

        internal async Task<string> LookupSymbol(ulong pointer) {
            await this.WaitForBreakIn();

            string name;
            ulong displacement;
            try {
                this.symbolCache.GetSymbolName(pointer, out name, out displacement);
            } catch {
                throw new DebuggerException(String.Format("Invalid symbol address: {0}", pointer.ToString()));
            }
            return name;
        }

        internal struct SSymbolResult {
            internal ulong Pointer;
            internal string Type;
            internal string Module;
        }

        internal async Task<SSymbolResult> LookupSymbol(string symbol) {
            await this.WaitForBreakIn();
            
            SSymbolResult result = new SSymbolResult();

            uint typeId;
            ulong module;
            try {
                this.symbols.GetSymbolTypeId(symbol, out typeId, out module);
                this.symbols.GetOffsetByName(symbol, out result.Pointer);
            } catch {
                throw new DebuggerException(String.Format("Invalid symbol: {0}", symbol));
            }

            // Now that we have type ids and an offset, we can resolve the names.
            try {
                result.Type = this.symbolCache.GetTypeName(module, typeId);
                string imageName, loadedImageName;
                this.symbols.GetModuleNamesByBaseAddress(module, out imageName, out result.Module, out loadedImageName);
            } catch {
                throw new DebuggerException(String.Format("Internal error with symbol: {0}", symbol));
            }

            return result;
        }

        internal async Task<T> ReadMemory<T>(ulong pointer) where T : struct {
            await this.WaitForBreakIn();

            T[] result = new T[1];
            try {
                this.dataSpaces.ReadVirtual<T>(pointer, result);
            } catch {
                throw new DebuggerException(String.Format("Invalid memory address: {0}", pointer.ToString()));
            }
            return result[0];
        }

        internal async Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct {
            await this.WaitForBreakIn();

            try {
                // TODO: can we ever have incomplete reads?
                T[] result = new T[size];
                this.dataSpaces.ReadVirtual<T>(pointer, result);
                return result;
            } catch {
                throw new DebuggerException(String.Format("Invalid memory address: {0}", pointer.ToString()));
            }
        }


        internal bool IsPointer64Bit {
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
        private bool isPointer64Bit;
    }
}
