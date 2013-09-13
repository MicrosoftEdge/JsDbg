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
            this.symbols = new DebugSymbols(this.client);
            this.isShuttingDown = false;
            this.didShutdown = true;
        }

        internal struct SFieldResult {
            internal uint Offset;
            internal uint Size;
            internal byte BitOffset;
            internal byte BitCount;
            internal string TypeName;

            internal bool IsBitField {
                get { return this.BitCount > 0; }
            }
        }

        internal async Task Shutdown() {
            if (!this.didShutdown) {
                this.isShuttingDown = true;

                // Wait for "Run" to finish.
                while (this.isShuttingDown) {
                    await Task.Yield();
                }
            }
        }

        internal async Task Run() {
            this.didShutdown = false;

            System.EventHandler<EngineStateChangeEventArgs> engineStateChanged = (object sender, EngineStateChangeEventArgs args) => {
                if (args.Change == EngineStateChange.EffectiveProcessor) {

                    Processor processorType = (Processor)args.Argument;
                    if ((processorType == Processor.Amd64) == !(this.isPointer64Bit)) {
                        // Invalidate the type cache.
                        Console.Out.WriteLine("Effective processor changed, so invalidating type cache.  You may need to refresh the browser window.");
                        this.isPointer64Bit = !this.isPointer64Bit;
                        this.typeCache = new TypeCache(this.isPointer64Bit);
                    }
                } else if (args.Change == EngineStateChange.ExecutionStatus) {
                    DebugStatus executionStatus = (DebugStatus)(args.Argument & (~(ulong)DebugStatus.InsideWait));
                    if (executionStatus == DebugStatus.NoDebuggee) {
                        Console.Out.WriteLine("Debugger has no target, shutting down.");
                        Task shutdownTask = this.Shutdown();
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

        internal async Task<SFieldResult> LookupField(string module, string typename, IList<string> fields) {
            await this.WaitForBreakIn();

            SFieldResult result = new SFieldResult();
            
            Type type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename);
            foreach (string fieldname in fields) {
                SField field;
                if (type.GetField(fieldname, out field)) {
                    result.Offset += field.Offset;
                    result.BitCount = field.BitCount;
                    result.BitOffset = field.BitOffset;
                    type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, field.TypeName);
                } else {
                    throw new DebuggerException(String.Format("Invalid field name: {0}", fieldname));
                }
            }

            result.TypeName = type.Name;
            result.Size = type.Size;

            return result;
        }

        internal async Task<int> GetBaseClassOffset(string module, string typename, string baseTypename) {
            await this.WaitForBreakIn();

            Type type = this.typeCache.GetType(this.client, this.control, this.symbolCache, module, typename);
            int offset;
            if (type.GetBaseTypeOffset(baseTypename, out offset)) {
                return offset;
            } else {
                throw new DebuggerException(String.Format("Invalid base type {0} of type {1}", baseTypename, typename));
            }
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
                if (displacement != 0) {
                    throw new Exception();
                }
            } catch {
                throw new DebuggerException(String.Format("Invalid symbol address: {0}", pointer.ToString()));
            }
            return name;
        }

        internal struct SSymbolResult {
            internal ulong Value;
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
                this.symbols.GetOffsetByName(symbol, out result.Value);
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
        private TypeCache typeCache;
        private bool isPointer64Bit;
        private bool isShuttingDown;
        private bool didShutdown;
    }
}
