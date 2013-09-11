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
            this.client.OutputMask = OutputModes.Normal;
            this.control = new DebugControl(this.client);
            this.isPointer64Bit = this.control.IsPointer64Bit;
            this.exitDispatchClient = new DebugClient(connectionString);
            this.symbolCache = new SymbolCache(this.client);
            this.typeCache = new TypeCache(this.isPointer64Bit);
            this.dataSpaces = new DebugDataSpaces(this.client);
        }

        internal struct SFieldResult {
            internal uint Offset;
            internal uint Size;
            internal string TypeName;
        }

        internal async Task<SFieldResult> LookupField(string module, string typename, IList<string> fields) {
            await this.WaitForBreakIn();

            SFieldResult result = new SFieldResult();
            
            Type type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename);
            foreach (string fieldname in fields) {
                SField field;
                if (type.GetField(fieldname, out field)) {
                    result.Offset += field.Offset;
                    type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, field.TypeName);
                } else {
                    throw new DebuggerException(String.Format("Invalid field name: {0}", fieldname));
                }
            }

            result.TypeName = type.Name;
            result.Size = type.Size;

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
        private SymbolCache symbolCache;
        private TypeCache typeCache;
        private bool isPointer64Bit;
    }
}
