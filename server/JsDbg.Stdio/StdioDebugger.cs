using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using JsDbg.Core;

namespace JsDbg.Stdio {
    class StdioDebugger : IDebugger {

        public StdioDebugger() {
            OutputDataReceived += HandleGdbEvent;
        }


        public event DebuggerChangeEventHandler DebuggerChange;
        public event DebuggerMessageEventHandler DebuggerMessage;


        public void Dispose() {

        }

        public async Task Run(string url) {
            // We only assign this to a Task to avoid a compiler warning.
            // We intentionally do not await them because we want execution to
            // continue to the ReadLine loop.
            Task t = QueryDebuggerPython(String.Format("ServerStarted(\"{0}\")", url));
            t = LookupTypeSize("", "void*").ContinueWith((task) => {
                IsPointer64Bit = task.Result == 8 ? true : false;
            });
            t = QueryDebuggerPython("GetTargetProcess()").ContinueWith((task) => {
                this.targetProcess = UInt32.Parse(task.Result);
            });
            t = QueryDebuggerPython("GetTargetThread()").ContinueWith((task) => {
                this.targetThread = UInt32.Parse(task.Result);
            });

            while(true) {
                // Pump messages from python back to any waiting handlers
                string response = await Console.In.ReadLineAsync();
                if (response == null) {
                    return;
                }
                this.OutputDataReceived?.Invoke(this, response);
            }
        }

        void NotifyDebuggerChange(DebuggerChangeEventArgs.DebuggerStatus status) {
            this.DebuggerChange?.Invoke(this, new DebuggerChangeEventArgs(status));
        }

        void NotifyDebuggerMessage(string message) {
            this.DebuggerMessage?.Invoke(this, message);
        }

        void HandleGdbEvent(object sender, string ev) {
            if (ev[0] != '%')
                return;

            DebuggerChangeEventArgs.DebuggerStatus oldStatus = debuggerStatus;

            if (ev == "%cont")
                debuggerStatus = DebuggerChangeEventArgs.DebuggerStatus.Waiting;
            else if (ev == "%stop")
                debuggerStatus = DebuggerChangeEventArgs.DebuggerStatus.Break;
            else if (ev == "%exit")
                debuggerStatus = DebuggerChangeEventArgs.DebuggerStatus.Detaching;

            if (debuggerStatus != oldStatus)
                NotifyDebuggerChange(debuggerStatus);

            // Now check for process/thread events
            string processChange = "%proc ";
            string threadChange = "%thread ";
            if (ev.StartsWith(processChange)) {
                this.targetProcess = UInt32.Parse(ev.Substring(processChange.Length));
                NotifyDebuggerChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingProcess);
            } else if (ev.StartsWith(threadChange)) {
                this.targetThread = UInt32.Parse(ev.Substring(threadChange.Length));
                NotifyDebuggerChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingThread);
            }
        }

        // Input: [{foo#bar}, {foo2#bar2}, ..,]
        // Output: List containing "foo#bar", "foo2#bar2", ...
        static public List<string> ParsePythonObjectArrayToStrings(string pythonResult) {
            List<string> result = new List<string>();

            int index = 0;
            Debug.Assert(pythonResult[index] == '[');
            ++index;
            while(pythonResult[index] != ']') {
                Debug.Assert(pythonResult[index] == '{');
                ++index;
                int fieldEndIndex = pythonResult.IndexOf('}',index);
                result.Add(pythonResult.Substring(index, fieldEndIndex-index));

                index = fieldEndIndex+1;
                if (pythonResult[index] == ',') {
                    ++index;
                    Debug.Assert(pythonResult[index] == ' ');
                    ++index;
                }
            }
            return result;
        }

        public async Task Continue() {
            await this.QueryDebuggerPython("ExecuteGdbCommand(\"continue\")");
        }

        public async Task<IEnumerable<SFieldResult>> GetAllFields(string module, string typename, bool includeBaseTypes) {
            NotifyDebuggerMessage(String.Format("Looking up fields for {0}...", typename));

            string pythonResult = await this.QueryDebuggerPython(String.Format("GetAllFields(\"{0}\",\"{1}\",{2})",module, typename, includeBaseTypes ? "True" : "False"));

            List<string> objects = ParsePythonObjectArrayToStrings(pythonResult);
            List<SFieldResult> result = new List<SFieldResult>();

            foreach (string fieldString in objects) {
                // '{%d#%d#%d#%d#%s#%s}' % (self.offset, self.size, self.bitOffset, self.bitCount, self.fieldName, self.typeName)
                string[] properties = fieldString.Split('#');
                Debug.Assert(properties.Length == 6);
                SFieldResult field = new SFieldResult();
                field.Offset = UInt32.Parse(properties[0]);
                field.Size = UInt32.Parse(properties[1]);
                field.BitOffset = Byte.Parse(properties[2]);
                field.BitCount = Byte.Parse(properties[3]);
                field.FieldName = properties[4];
                field.TypeName = properties[5];
                field.Module = module;
                result.Add(field);
            }

            return result;
        }

        public async Task<IEnumerable<SBaseTypeResult>> GetBaseTypes(string module, string typeName) {
            NotifyDebuggerMessage(String.Format("Looking up base types for {0}...", typeName));

            string pythonResult = await this.QueryDebuggerPython(String.Format("GetBaseTypes(\"{0}\",\"{1}\")", module, typeName));

            List<string> objects = ParsePythonObjectArrayToStrings(pythonResult);
            List<SBaseTypeResult> result = new List<SBaseTypeResult>();
            foreach (string fieldString in objects) {
                // return '{%s#%s#%d}' % (self.module, self.typeName, self.offset)
                string[] properties = fieldString.Split('#');
                Debug.Assert(properties.Length == 3);
                SBaseTypeResult field = new SBaseTypeResult();
                field.Module = properties[0];
                field.TypeName = properties[1];
                field.Offset = Int32.Parse(properties[2]);

                result.Add(field);
            }

            return result;
        }

        public bool IsPointer64Bit {
            get {
                return this.isPointer64Bit;
            }

            private set {
                this.isPointer64Bit = value;
            }
        }

        public async Task<bool> IsTypeEnum(string module, string type) {
            string pythonResult = await this.QueryDebuggerPython(String.Format("IsTypeEnum(\"{0}\",\"{1}\")", module, type));
            // Check for "True" or "False"
            return pythonResult[0] == 'T';
        }

        public async Task<IEnumerable<SConstantResult>> LookupConstants(string module, string type, ulong constantValue) {
            NotifyDebuggerMessage(String.Format("Looking up name for {0}({1})...", type, constantValue));

            string pythonResult = await this.QueryDebuggerPython(String.Format("LookupConstants(\"{0}\", \"{1}\", {2})", module, type, constantValue));

            List<string> objects = ParsePythonObjectArrayToStrings(pythonResult);
            List<SConstantResult> result = new List<SConstantResult>();

            foreach (string fieldString in objects) {
                // '{%s#%d}' % (self.name, self.value)
                string[] properties = fieldString.Split('#');
                Debug.Assert(properties.Length == 2);
                SConstantResult field = new SConstantResult();
                field.ConstantName = properties[0];
                field.Value = UInt64.Parse(properties[1]);
                result.Add(field);
            }

            return result;
        }

        public async Task<SConstantResult> LookupConstant(string module, string type, string constantName) {
            NotifyDebuggerMessage(String.Format("Looking up value for constant {0}...", constantName));

            string response = await this.QueryDebuggerPython(String.Format("LookupConstant(\"{0}\",\"{1}\",\"{2}\")", module, type == null ? "None" : type , constantName));

            SConstantResult result = new SConstantResult();
            result.ConstantName = constantName;
            result.Value = UInt64.Parse(response);
            return result;
        }

        public async Task<SFieldResult> LookupField(string module, string typename, string fieldName) {
            NotifyDebuggerMessage(String.Format("Looking up field {0}::{1}...", typename, fieldName));

            string pythonResult = await this.QueryDebuggerPython(String.Format("LookupField(\"{0}\",\"{1}\", \"{2}\")", module, typename, fieldName));
            // '{%d#%d#%d#%d#%s#%s}' % (self.offset, self.size, self.bitOffset, self.bitCount, self.fieldName, self.typeName)

            if (pythonResult == "None")
                throw new DebuggerException(String.Format("No field {0} in type {1}!{2}", fieldName, module, typename));

            Debug.Assert(pythonResult[0] == '{');
            int fieldEndIndex = pythonResult.IndexOf('}');
            string fieldString = pythonResult.Substring(1, fieldEndIndex-1);

            string[] properties = fieldString.Split('#');

            SFieldResult field = new SFieldResult();
            field.Offset = UInt32.Parse(properties[0]);
            field.Size = UInt32.Parse(properties[1]);
            field.BitOffset = Byte.Parse(properties[2]);
            field.BitCount = Byte.Parse(properties[3]);
            field.FieldName = properties[4];
            field.TypeName = properties[5];
            field.Module = module;

            return field;
        }

        public async Task<SSymbolResult> LookupGlobalSymbol(string module, string symbol, string typename, string scope) {
            NotifyDebuggerMessage(String.Format("Looking up value of global {0}...", symbol));

            // For GDB, we use scope instead of typename to disambiguate globals.
            string symbolName = "";
            if (!String.IsNullOrEmpty(scope))
                symbolName = scope + "::";
            symbolName += symbol;
            string pythonResult = await this.QueryDebuggerPython(String.Format("LookupGlobalSymbol(\"{0}\",\"{1}\")", module, symbolName));
            // '{%s#%d}' % (self.type, self.pointer)

            if (pythonResult == "None")
                throw new DebuggerException(String.Format("Global symbol {0}!{1} with type {2} not found", module, symbol, typename));

            Debug.Assert(pythonResult[0] == '{');
            int fieldEndIndex = pythonResult.IndexOf('}');
            string fieldString = pythonResult.Substring(1, fieldEndIndex-1);

            string[] properties = fieldString.Split("#");

            SSymbolResult result = new SSymbolResult();
            result.Module = module;
            result.Type = properties[0];
            result.Pointer = UInt64.Parse(properties[1]);

            return result;
        }

        public async Task<SModule> GetModuleForName(string module) {
            string pythonResult = await this.QueryDebuggerPython(String.Format("GetModuleForName(\"{0}\")", module));

            Debug.Assert(pythonResult[0] == '{');
            int fieldEndIndex = pythonResult.IndexOf('}');
            string fieldString = pythonResult.Substring(1, fieldEndIndex-1);

            string[] properties = fieldString.Split("#");
            SModule result = new SModule();
            result.Name = properties[0];
            result.BaseAddress = UInt64.Parse(properties[1]);
            return result;
        }

        public async Task<IEnumerable<SStackFrame>> GetCallStack(int frameCount) {
            NotifyDebuggerMessage("Getting call stack...");

            // -stack-list-frames doesn't allow accessing the frame pointer and the stakc pointer. Have to use python
            //string queryResult = await this.QueryDebugger("-stack-list-frames");
            // ^done,stack=[frame={level="0",addr="0x00000000004004d4",func="twiddle",file="foo.cc",fullname="/mnt/e/z/foo.cc",line="32"},frame={level="1",addr="0x0000000000400504",func="main",file="foo.cc",fullname="/mnt/e/z/foo.cc",line="39"}]
            // NOTE that [] can and do appear in function names e.g. templates
            // NOTE that {} can also appear in filenames, so no cheating when parsing this unfortunately :(
            // NOTE that quotes can also appear in filenames, but they will be \ escaped

            string pythonResult = await this.QueryDebuggerPython(String.Format("GetCallStack({0})", frameCount));

            List<string> objects = ParsePythonObjectArrayToStrings(pythonResult);
            List<SStackFrame> result = new List<SStackFrame>();

            foreach (string stackString in objects) {
                // '{%d#%d#%d}' % (self.instructionAddress, self.stackAddress, self.frameAddress)
                string[] properties = stackString.Split("#");
                Debug.Assert(properties.Length == 3);
                SStackFrame frame = new SStackFrame();
                frame.InstructionAddress = UInt64.Parse(properties[0]);
                frame.StackAddress = UInt64.Parse(properties[1]);
                frame.FrameAddress = UInt64.Parse(properties[2]);

                result.Add(frame);
            }

            return result;
        }

        public async Task<IEnumerable<SNamedSymbol>> GetSymbolsInStackFrame(ulong instructionAddress, ulong stackAddress, ulong frameAddress) {
            NotifyDebuggerMessage("Getting symbols in call stack...");

            string pythonResult = await this.QueryDebuggerPython(String.Format("GetSymbolsInStackFrame({0},{1},{2})", instructionAddress, stackAddress, frameAddress));
            if (pythonResult == "None")
                throw new DebuggerException("Can't find stack frame");

            List<string> objects = ParsePythonObjectArrayToStrings(pythonResult);
            List<SNamedSymbol> result = new List<SNamedSymbol>();

            foreach (string symString in objects) {
                // '{%s#%d#%s}' % (self.name, self.symbolResult.pointer, s.symbolResult.type)
                string[] properties = symString.Split("#");
                Debug.Assert(properties.Length == 4);
                SNamedSymbol sym = new SNamedSymbol();
                sym.Name = properties[1];
                sym.Symbol = new SSymbolResult();
                sym.Symbol.Pointer = UInt64.Parse(properties[2]);
                sym.Symbol.Module = properties[0];
                sym.Symbol.Type = properties[3];

                result.Add(sym);
            }

            return result;
        }

        public async Task<SSymbolNameAndDisplacement> LookupSymbolName(ulong pointer) {
            NotifyDebuggerMessage(String.Format("Looking up symbol at 0x{0:x}...", pointer));

            string response = await this.QueryDebuggerPython(String.Format("LookupSymbolName(0x{0:x})",pointer));

            if (response == "None")
                throw new DebuggerException(String.Format("Address 0x{0:x} is not a symbol", pointer));

            // "{%s#%s#%d}" % (module, symbol, offset)
            Debug.Assert(response[0] == '{');
            Debug.Assert(response[response.Length - 1] == '}');
            string[] properties = response.Substring(1, response.Length - 2).Split("#");
            SSymbolNameAndDisplacement result = new SSymbolNameAndDisplacement();
            result.Module = properties[0];
            result.Name = properties[1];
            result.Displacement = UInt64.Parse(properties[2]);

            if (result.Name.StartsWith("vtable for ")) {
                result.Name = result.Name.Substring("vtable for ".Length) + "::`vftable'";
                ulong pointer_size = IsPointer64Bit ? 8UL : 4UL;
                // First two words of the vtable are reserved for RTTI.
                // http://refspecs.linuxbase.org/cxxabi-1.83.html#rtti-layout
                // For compatibility with Visual Studio, we pretend that the vtable
                // starts with the first function pointer.
                result.Displacement -= 2 * pointer_size;
            }

            return result;
        }

        public async Task<uint> LookupTypeSize(string module, string typename) {
            NotifyDebuggerMessage(String.Format("Looking up sizeof({0})...", typename));

            string pythonResponse = await this.QueryDebuggerPython(String.Format("LookupTypeSize(\"{0}\",\"{1}\")", module, typename));

            return UInt32.Parse(pythonResponse);
        }

        public async Task<T[]> ReadArray<T>(ulong pointer, ulong count) where T : struct {
            int size = (int)(count * (uint)System.Runtime.InteropServices.Marshal.SizeOf(typeof(T)));

            NotifyDebuggerMessage(String.Format("Reading {0} bytes at 0x{1:x}...", size, pointer));

            string response = await this.QueryDebuggerPython(String.Format("ReadMemoryBytes(0x{0:x},{1})", pointer, size));
            // Response will be hex encoding of the memory

            if (response.Length != 2* size) {
                throw new DebuggerException(String.Format("Unable to read memory; expected {0} but got {1} bytes", size, response.Length/2));
            }

            byte[] bytes = new byte[size];
            for (int i = 0; i < size; ++i) {
                bytes[i] = Convert.ToByte(response.Substring(i*2,2), 16);
            }

            T[] result = new T[count];

            Buffer.BlockCopy(bytes, 0, result, 0, size);

            return result;
        }

        public async Task<T> ReadMemory<T>(ulong pointer) where T : struct {
            T[] result = await this.ReadArray<T>(pointer, 1);
            return result[0];
        }

        public async Task WriteMemory<T>(ulong pointer, T value) where T : struct {
            int size = System.Runtime.InteropServices.Marshal.SizeOf(typeof(T));
            byte[] bytes = new byte[size];
            T[] from = new T[1];
            from[0] = value;
            Buffer.BlockCopy(from, 0, bytes, 0, size);

            // bytes is now a buffer of bytes we wish to write
            string hexString = BitConverter.ToString(bytes).Replace("-", string.Empty);

            string response = await this.QueryDebuggerPython(String.Format("WriteMemoryBytes(0x{0:x},\"{1}\")", pointer, hexString));
        }

        public List<uint> ParsePythonArrayToIntegers(string response) {
            List<uint> result = new List<uint>();
            // [1, 2, 3]
            Debug.Assert(response[0] == '[');
            int index = 1;
            while (index != response.Length - 1) {
                int endIndex = response.IndexOf(',', index);
                if (endIndex == -1)
                    endIndex = response.Length - 1;
                result.Add(UInt32.Parse(response.Substring(index, endIndex - index)));

                index = endIndex;
                if (response[index] == ',') {
                    ++index;
                    Debug.Assert(response[index] == ' ');
                    ++index;
                }
            }
            return result;
        }

        public async Task<uint[]> GetAttachedProcesses() {
            string response = await this.QueryDebuggerPython("GetAttachedProcesses()");
            return ParsePythonArrayToIntegers(response).ToArray();
        }

        public async Task<uint[]> GetCurrentProcessThreads() {
            string response = await this.QueryDebuggerPython("GetCurrentProcessThreads()");
            return ParsePythonArrayToIntegers(response).ToArray();
        }

        public Task<ulong> TebAddress() { return Task.FromResult(0UL); }

        public uint TargetProcess {
            get {
                return this.targetProcess;
            }
            set {
                Task t = this.QueryDebuggerPython(String.Format("SetTargetProcess({0})", value));
            }
        }
        public uint TargetThread {
            get {
                return this.targetThread;
            }
            set {
                Task t = this.QueryDebuggerPython(String.Format("SetTargetThread({0})", value));
            }
        }
        public bool IsDebuggerBusy { get { return false; } }

        // Return a string which can be interpreted as the output of a python script
        // e.g. the string might be the literal characters
        // "[1, 2, 3]\n"
        private async Task<string> QueryDebuggerPython(string query) {
            uint tag = this.queryTag++;
            string tagString = tag.ToString() + "~";
            string errString = tag.ToString() + "!";

            TaskCompletionSource<string> responseCompletionSource = new TaskCompletionSource<string>();
            PythonResponseEventHandler outputHandler = null;
            outputHandler = new PythonResponseEventHandler((sender, e) => {
                if (e != null && e.StartsWith(tagString)) {
                    responseCompletionSource.TrySetResult(e.Substring(tagString.Length).Trim());
                    this.OutputDataReceived -= outputHandler;
                } else if (e != null && e.StartsWith(errString)) {
                    responseCompletionSource.TrySetException(new DebuggerException(e.Substring(errString.Length)));
                    this.OutputDataReceived -= outputHandler;
                }

            });
            this.OutputDataReceived += outputHandler;
            Console.Out.WriteLine("DebuggerQuery({0},'{1}')", tag, query);

            string response = await responseCompletionSource.Task;
            return response;
        }

        // Assume 64-bit until we get a response from the debugger
        private bool isPointer64Bit = true;
        private uint queryTag = 1;
        private DebuggerChangeEventArgs.DebuggerStatus debuggerStatus =
            DebuggerChangeEventArgs.DebuggerStatus.Break;
        private uint targetProcess = 0;
        private uint targetThread = 0;

        private delegate void PythonResponseEventHandler(object sender, string e);
        private event PythonResponseEventHandler OutputDataReceived;
    }
}
