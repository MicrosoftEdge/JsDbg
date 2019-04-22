using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using JsDbg.Core;

namespace JsDbg.Gdb {
    class GdbDebugger : IDebugger {

        public GdbDebugger() {
        }


        public event DebuggerChangeEventHandler DebuggerChange;
        public event DebuggerMessageEventHandler DebuggerMessage;


        public void Dispose() {

        }

        public async Task Run() {
            while(true) {
                // Pump messages from python back to any waiting handlers
                string response = await Console.In.ReadLineAsync();
                if (response == null) {
                    return;
                }
                this.OutputDataReceived?.Invoke(this, response);
            }
        }

        public async Task<IEnumerable<SFieldResult>> GetAllFields(string module, string typename, bool includeBaseTypes) {
            string pythonResult = await this.QueryDebuggerPython(String.Format("GetAllFields(\"{0}\",\"{1}\",{2})",module, typename, includeBaseTypes ? "True" : "False"));

            List<SFieldResult> result = new List<SFieldResult>();

            int index = 0;
            Debug.Assert(pythonResult[index] == '[');
            ++index;
            while(pythonResult[index] != ']') {
                // '{%d#%d#%d#%d#%s#%s}' % (self.offset, self.size, self.bitOffset, self.bitCount, self.fieldName, self.typeName)
                Debug.Assert(pythonResult[index] == '{');
                ++index;
                int fieldEndIndex = pythonResult.IndexOf('}',index);
                string fieldString = pythonResult.Substring(index, fieldEndIndex-index);

                string[] properties = fieldString.Split('#');
                Debug.Assert(properties.Length == 6);
                SFieldResult field = new SFieldResult();
                Console.WriteLine("GetAllFields: {0}", fieldString);
                field.Offset = UInt32.Parse(properties[0]);
                field.Size = UInt32.Parse(properties[1]);
                field.BitOffset = Byte.Parse(properties[2]);
                field.BitCount = Byte.Parse(properties[3]);
                field.FieldName = properties[4];
                field.TypeName = properties[5];
                field.Module = module;
                result.Add(field);

                index = fieldEndIndex+1;
                if (pythonResult[index] == ',') {
                    ++index;
                    Debug.Assert(pythonResult[index] == ' ');
                    ++index;
                }
            }

            return result;
        }

        public async Task<IEnumerable<SBaseTypeResult>> GetBaseTypes(string module, string typeName) {
            string pythonResult = await this.QueryDebuggerPython(String.Format("GetBaseTypes(\"{0}\",\"{1}\")", module, typeName));

            List<SBaseTypeResult> result = new List<SBaseTypeResult>();
            int index = 0;
            Debug.Assert(pythonResult[index] == '[');
            ++index;
            while(pythonResult[index] != ']') {
                // return '{%s#%s#%d}' % (self.module, self.typeName, self.offset)
                Debug.Assert(pythonResult[index] == '{');
                ++index;
                int fieldEndIndex = pythonResult.IndexOf('}',index);
                string fieldString = pythonResult.Substring(index, fieldEndIndex - index);

                string[] properties = fieldString.Split('#');
                Debug.Assert(properties.Length == 3);
                SBaseTypeResult field = new SBaseTypeResult();
                field.Module = properties[0];
                field.TypeName = properties[1];
                field.Offset = Int32.Parse(properties[2]);

                result.Add(field);

                index = fieldEndIndex + 1;
                if (pythonResult[index] == ',') {
                    ++index;
                    Debug.Assert(pythonResult[index] == ' ');
                    ++index;
                }
            }

            return result;
        }

        // TODO: Determine whether the process is 64 bit or 32 bit        
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
            // Not currently aware of a way to find all constants with a given value from GDB
            // TODO:
            //   -var-create - * ((type)constantValue)
            //   may return a useful result; ^done,name="var1",numchild="0",value="ENUM_1",type="enum1",has_more="0"
            return new List<SConstantResult>();
        }
        
        public async Task<SConstantResult> LookupConstant(string module, string type, string constantName) {
            string response = await this.QueryDebuggerPython(String.Format("LookupConstant(\"{0}\",\"{1}\",\"{2}\")", module, type == null ? "None" : type , constantName));

            SConstantResult result = new SConstantResult();
            result.ConstantName = constantName;
            result.Value = UInt64.Parse(response);
            return result;
        }
        
        public async Task<SFieldResult> LookupField(string module, string typename, string fieldName) {
            string pythonResult = await this.QueryDebuggerPython(String.Format("LookupField(\"{0}\",\"{1}\", \"{2}\")", module, typename, fieldName));
            // '{%d#%d#%d#%d#%s#%s}' % (self.offset, self.size, self.bitOffset, self.bitCount, self.fieldName, self.typeName)

            Debug.Assert(pythonResult[1] == '{');
            int fieldEndIndex = pythonResult.IndexOf('}');
            string fieldString = pythonResult.Substring(2, fieldEndIndex-2);

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
         
        public async Task<SSymbolResult> LookupGlobalSymbol(string module, string symbol) {
            string pythonResult = await this.QueryDebuggerPython(String.Format("LookupGlobalSymbol(\"{0}\",\"{1}\")", module, symbol));
            // '{%s#%d' % (self.type, self.pointer)

            Debug.Assert(pythonResult[1] == '{');
            int fieldEndIndex = pythonResult.IndexOf('}');
            string fieldString = pythonResult.Substring(2, fieldEndIndex-2);

            string[] properties = fieldString.Split("#");

            SSymbolResult result = new SSymbolResult();
            result.Module = module;
            result.Type = properties[0];
            result.Pointer = UInt64.Parse(properties[1]);

            return result;
        }
        
        public async Task<SModule> GetModuleForName(string module) {
            SModule result = new SModule();
            result.Name = module;
            result.BaseAddress = 0; // TODO
            return result;
        }
        
        public async Task<IEnumerable<SStackFrame>> GetCallStack(int frameCount) {
            // -stack-list-frames doesn't allow accessing the frame pointer and the stakc pointer. Have to use python
            //string queryResult = await this.QueryDebugger("-stack-list-frames");
            // ^done,stack=[frame={level="0",addr="0x00000000004004d4",func="twiddle",file="foo.cc",fullname="/mnt/e/z/foo.cc",line="32"},frame={level="1",addr="0x0000000000400504",func="main",file="foo.cc",fullname="/mnt/e/z/foo.cc",line="39"}]
            // NOTE that [] can and do appear in function names e.g. templates
            // NOTE that {} can also appear in filenames, so no cheating when parsing this unfortunately :(
            // NOTE that quotes can also appear in filenames, but they will be \ escaped

            string pythonResult = await this.QueryDebuggerPython(String.Format("GetCallStack({0})", frameCount));
            

            List<SStackFrame> result = new List<SStackFrame>();

            int index = 1; // Skip initial '"' character
            Debug.Assert(pythonResult[index] == '[');
            ++index;
            while(pythonResult[index] != ']') {
                // '{%d#%d#%d}' % (self.instructionAddress, self.stackAddress, self.frameAddress)
                Debug.Assert(pythonResult[index] == '{');
                ++index;

                int stackEndIndex = pythonResult.IndexOf('}',index);
                string stackString = pythonResult.Substring(index, stackEndIndex - index);

                string[] properties = stackString.Split("#");
                Debug.Assert(properties.Length == 3);
                SStackFrame frame = new SStackFrame();
                frame.InstructionAddress = UInt64.Parse(properties[0]);
                frame.StackAddress = UInt64.Parse(properties[1]);
                frame.FrameAddress = UInt64.Parse(properties[2]);

                result.Add(frame);
                
                index = stackEndIndex + 1;
                if (pythonResult[index] == ',') {
                    ++index;
                    Debug.Assert(pythonResult[index] == ' ');
                    ++index;
                }
            }

            return result;
        }
        
        public async Task<IEnumerable<SNamedSymbol>> GetSymbolsInStackFrame(ulong instructionAddress, ulong stackAddress, ulong frameAddress) {
            string pythonResult = await this.QueryDebuggerPython(String.Format("GetSymbolsInStackFrame({0},{1},{2})", instructionAddress, stackAddress, frameAddress));
            

            List<SNamedSymbol> result = new List<SNamedSymbol>();

            int index = 1;
            Debug.Assert(pythonResult[index] == '[');
            ++index;
            while(pythonResult[index] != ']') {
                // '{%s#%d#%s}' % (self.name, self.symbolResult.pointer, s.symbolResult.type)
                Debug.Assert(pythonResult[index] == '{');

                int symEndIndex = pythonResult.IndexOf('}', index);
                string symString = pythonResult.Substring(index, symEndIndex - index);

                string[] properties = symString.Split("#");
                Debug.Assert(properties.Length == 3);
                SNamedSymbol sym = new SNamedSymbol();
                sym.Name = properties[0];
                sym.Symbol = new SSymbolResult();
                sym.Symbol.Pointer = UInt64.Parse(properties[1]);
                sym.Symbol.Module = "N/A";
                sym.Symbol.Type = properties[2];

                result.Add(sym);

                index = symEndIndex + 1;
                if (pythonResult[index] == ',') {
                    ++index;
                    Debug.Assert(pythonResult[index] == ' ');
                    ++index;
                }
            }

            return result;
        }
        
        public async Task<SSymbolNameAndDisplacement> LookupSymbolName(ulong pointer) {
            // Rant:
            // GDB knows how to do this interactively:
            //   (gdb) info symbol 0x60102c
            //   gfoo in section .bss of /mnt/e/z/a.out
            // AND in the past the MI has supported -symbol-info-symbol <address>
            // BUT no more.
            // I see 3 options to pry this information out of gdb:
            // -interpreter-exec console "info symbol <address>"
            // or
            // -var-create v * "(void*)<address>"
            // or
            // 1. in python, get the global block,
            // 2. iterate all variables,
            // 3. get their size (from the type) 
            // 4. get their address (from the value)
            // 5. see if the given address falls within this symbol.

            // None of these options are great, but -var-create seems to be the simplest to parse

            // When switching to python:
            // v = gdb.parse_and_eval("(void*) 0x..."); str(v) produces something like
            // '0x4004f1 <twiddle<int []>(int)+17>'
            // which has the same informationas -var-create

            string response = await this.QueryDebuggerPython(String.Format("LookupSymbolName({0})",pointer));
            // '0x4004f1 <twiddle<int []>(int)+17>'
            // Symbol should be between the first '<' and the last '+', and the displacement is between the last '+' and the last '>'

            SSymbolNameAndDisplacement result = new SSymbolNameAndDisplacement();
            result.Module = "N/A";

            int firstLess = response.IndexOf('<')+1;
            int lastPlus = response.LastIndexOf('+');
            int lastGreater = response.LastIndexOf('>');
            if (firstLess < 0 || lastGreater < 0) {
                throw new DebuggerException(String.Format("Address {0} is not a symbol", pointer));
            }
            Debug.Assert(firstLess < lastGreater);

            if (lastPlus >= 0) {
                Debug.Assert(firstLess < lastPlus && lastPlus < lastGreater);
                string symName = response.Substring(firstLess, lastPlus - firstLess);
                result.Name = symName;
                string displacement = response.Substring(lastPlus+1, lastGreater - (lastPlus+1));
                result.Displacement = UInt64.Parse(displacement);
            } else {
                string symName = response.Substring(firstLess, lastGreater - firstLess);
                result.Name = symName;
                result.Displacement = 0;
            }


            if (result.Name.StartsWith("vtable for ")) {
                result.Name = result.Name.Substring("vtable for ".Length) + "::`vftable'";
                // TODO: If displacement = 2 pointers, assume RTTI and set displacement to 0?
            }

            return result;
        }
        
        public async Task<uint> LookupTypeSize(string module, string typename) {
            string pythonResponse = await this.QueryDebuggerPython(String.Format("LookupTypeSize(\"{0}\",\"{1}\")", module, typename));

            return UInt32.Parse(pythonResponse);
        }
        
        public async Task<T[]> ReadArray<T>(ulong pointer, ulong count) where T : struct {
            int size = (int)(count * (uint)System.Runtime.InteropServices.Marshal.SizeOf(typeof(T)));

            string response = await this.QueryDebuggerPython(String.Format("ReadMemoryBytes({0},{1})", pointer, size));
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

            string response = await this.QueryDebuggerPython(String.Format("WriteMemoryBytes({0},\"{1}\")", pointer, hexString));
        }

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

        private bool isPointer64Bit;
        private uint queryTag = 1;
        private uint varTag = 1;

        private delegate void PythonResponseEventHandler(object sender, string e);
        private event PythonResponseEventHandler OutputDataReceived;
    }
}