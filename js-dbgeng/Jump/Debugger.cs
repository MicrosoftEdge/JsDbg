using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using JsDbg;
using Microsoft.VisualStudio.Debugger.Interop;
using Microsoft.VisualStudio.Shell.Interop;

namespace Sushraja.Jump
{
    class Debugger : JsDbg.IDebugger, IDebugEventCallback2
    {
        const int S_OK = 0;

        internal Debugger(Core.IConfiguration configuration)
        {
            this.configuration = configuration;
            IVsDebugger debugService = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SVsShellDebugger)) as IVsDebugger;
            if (debugService != null)
            {
                // Register for debug events.
                // Assumes the current class implements IVsDebuggerEvents.
                debugService.AdviseDebugEventCallback(this);
            }
        }

        #region Typecache Implemented Services
        public async Task<uint> LookupTypeSize(string module, string typename)
        {
            await this.WaitForBreakIn();
            return this.typeCache.GetType(module, typename).Size;
        }

        public async Task<SFieldResult> LookupField(string module, string typename, string fieldName)
        {
            await this.WaitForBreakIn();

            SFieldResult result = new SFieldResult();

            JsDbg.Type type = this.typeCache.GetType(module, typename);
            SField field;
            if (type.GetField(fieldName, out field))
            {
                result.Offset += field.Offset;
                result.BitCount = field.BitCount;
                result.BitOffset = field.BitOffset;
                result.TypeName = field.TypeName;
                result.Size = field.Size;
            }
            else
            {
                throw new DebuggerException(String.Format("Invalid field name: {0}", fieldName));
            }

            return result;
        }


        public async Task<IEnumerable<SFieldResult>> GetAllFields(string module, string typename)
        {
            await this.WaitForBreakIn();
            JsDbg.Type type = this.typeCache.GetType(module, typename);
            return type.Fields;
        }

        public async Task<IEnumerable<SBaseTypeResult>> GetBaseTypes(string module, string typename)
        {
            await this.WaitForBreakIn();
            JsDbg.Type type = this.typeCache.GetType(module, typename);
            return type.BaseTypes;
        }
        #endregion

        #region Other Services
        public async System.Threading.Tasks.Task<SConstantResult> LookupConstant(string module, string typename, ulong constant)
        {   
            await this.WaitForBreakIn();

            JsDbg.Type type = this.typeCache.GetType(module, typename);
            foreach (SConstantResult constantResult in type.Constants) {
                if (constantResult.Value == constant) {
                    return constantResult;
                }
            }

            throw new DebuggerException(String.Format("Failed to find constant {0} of type {1}", constant, typename));
        }

        public async System.Threading.Tasks.Task<SConstantResult> LookupConstant(string module, string typename, string constantName) {
            await this.WaitForBreakIn();

            JsDbg.Type type = this.typeCache.GetType(module, typename);
            ulong constantValue;
            if (type.GetConstantValue(constantName, out constantValue)) {
                return new SConstantResult() { ConstantName = constantName, Value = constantValue };
            } else {
                throw new DebuggerException(String.Format("Unknown constant name: {0} in type: {0}", constantName, typename));
            }
        }

        public async Task<SSymbolResult> LookupGlobalSymbol(string moduleName, string symbolName) {
            await this.WaitForBreakIn();

            string fullyQualifiedSymbol = "{,," + moduleName + ".dll}&" + symbolName;

            EnvDTE.Expression result = dte.Debugger.GetExpression(fullyQualifiedSymbol);
            SSymbolResult symbolResult = new SSymbolResult();
            if (result.IsValidValue) {
                symbolResult.Module = moduleName;
                string type = result.Type;
                // Strip out terminating *, if we have <typename> * *
                int index = type.LastIndexOf(" *");
                if (index > 0) {
                    type = type.Substring(0, index);
                }

                // Strip out the module name form the type.
                index = type.IndexOf('!');
                if (index > 0) {
                    type = type.Substring(index + 1);
                }

                symbolResult.Type = type;
                string hexValue = result.Value.Substring(2);
                symbolResult.Pointer = UInt64.Parse(hexValue, System.Globalization.NumberStyles.HexNumber);
            } else {
                throw new DebuggerException(String.Format("LookupSymbol: Failed to evaluate expression {0}!{1}", moduleName, symbolName));
            }
            return symbolResult;
        }

        public async System.Threading.Tasks.Task<string> LookupSymbol(ulong pointer)
        {            
            await this.WaitForBreakIn();
            string type = "void";
            //string expression = "((IUnknown*)" + pointer + ")->__vfptr";
            string expression = "((void**)" + pointer + ")";
            EnvDTE.Expression result = dte.Debugger.GetExpression(expression, true);
            if (result.IsValidValue)
            {
                // At this point result.Value is like {mshtml.dll!const Layout::FlowBox::`vftable'} {0x62c0a0f0 {mshtml.dll!__vtguard(void)}}
                // We need to emit mshtml!Layout::FlowBox::`vftable' but we actually emit mshtml.dll!Layout::FlowBox::`vftable'

                // Whatever is between the first {} is the type name
                int start = result.Value.IndexOf('{') + 1;
                string terminateString = "::`vftable'";
                int stop = result.Value.IndexOf(terminateString);
                if (start < stop && start < result.Value.Length && start > 0)
                {
                    type = result.Value.Substring(start, stop - start + terminateString.Length);
                    // Remove const because windbg API does not return const.
                    type = type.Replace("const ", "");
                }
                else
                {
                    throw new DebuggerException(String.Format("LookupSymbol (pointer): Failed to extract type {0}", result.Value));
                }
            }
            else
            {
                throw new DebuggerException(String.Format("LookupSymbol (pointer): Failed to evaluate expression {0}", expression));
            }
            return type;
        }

        public async System.Threading.Tasks.Task<byte[]> ReadByteArray(ulong pointer, ulong size)
        {
            await this.WaitForBreakIn();

            IDebugMemoryContext2 memoryContextTarget;
            memoryContext.Add(pointer, out memoryContextTarget);            

            uint dwRead;
            uint dwUnReadable = 0;
            byte[] memory = new byte[size];
            memoryBytes.ReadAt(memoryContextTarget, (uint)size, memory, out dwRead, ref dwUnReadable);
            if (dwRead != size)
            {
                throw new DebuggerException(String.Format("ReadArray: Failed read memory 0x{0:x8} - Size {0}", pointer, size));
            }
            return memory;
        }

        public async System.Threading.Tasks.Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct
        {
            ulong typeSize = (ulong)System.Runtime.InteropServices.Marshal.SizeOf(typeof(T));
            ulong byteSize = size * typeSize;
            byte[] memory = await this.ReadByteArray(pointer, byteSize);

            T[] result = new T[size];
            System.Runtime.InteropServices.GCHandle gcHandle = System.Runtime.InteropServices.GCHandle.Alloc(result, System.Runtime.InteropServices.GCHandleType.Pinned);
            IntPtr tPointer = gcHandle.AddrOfPinnedObject();
            for (ulong i = 0; i < byteSize; i++)
            {
                System.Runtime.InteropServices.Marshal.WriteByte(tPointer, memory[i]);
                // move tPointer by 1 byte.
                tPointer = IntPtr.Add(tPointer, 1);
            }
            gcHandle.Free();

            return result;
        }

        public async System.Threading.Tasks.Task<T> ReadMemory<T>(ulong pointer) where T : struct
        {
            await this.WaitForBreakIn();

            IDebugMemoryContext2 memoryContextTarget;
            memoryContext.Add(pointer, out memoryContextTarget);
            int size = System.Runtime.InteropServices.Marshal.SizeOf(typeof(T));

            byte[] memory = new byte[size];
            uint dwRead;
            uint dwUnReadable = 0;
            memoryBytes.ReadAt(memoryContextTarget, (uint)size, memory, out dwRead, ref dwUnReadable);
            if (dwRead != size)
            {
                throw new DebuggerException(String.Format("ReadArray: Failed read memory 0x{0:x8} - Size {0}", pointer, size));
            }

            System.Runtime.InteropServices.GCHandle gcHandle = System.Runtime.InteropServices.GCHandle.Alloc(memory, System.Runtime.InteropServices.GCHandleType.Pinned);
            T result = (T)System.Runtime.InteropServices.Marshal.PtrToStructure(gcHandle.AddrOfPinnedObject(), typeof(T));
            gcHandle.Free();
            return result;
        }

        private static string StripModuleSuffix(string symbolName, string suffix) {
            string strippedName = symbolName;

            suffix = "." + suffix + "!";
            int suffixIndex = symbolName.IndexOf(suffix);
            if (suffixIndex >= 0) {
                strippedName = strippedName.Substring(0, suffixIndex) + strippedName.Substring(suffixIndex + suffix.Length - 1);
            }

            return strippedName;
        }

        private static string StripModuleSuffix(string symbolName) {
            string strippedName = symbolName;

            strippedName = StripModuleSuffix(strippedName, "dll");
            strippedName = StripModuleSuffix(strippedName, "exe");

            return strippedName;
        }

        public async Task<IEnumerable<SSymbolResult>> LookupLocalSymbols(string module, string methodName, string symbol, int maxCount) {
            await this.WaitForBreakIn();

            List<SSymbolResult> results = new List<SSymbolResult>();

            IDebugThread2 thread = this.currentThread;
            if (thread == null) {
                throw new DebuggerException("No thread was recorded.");
            }
            IEnumDebugFrameInfo2 frameEnumerator;
            thread.EnumFrameInfo((uint)(enum_FRAMEINFO_FLAGS.FIF_FUNCNAME | enum_FRAMEINFO_FLAGS.FIF_FRAME | enum_FRAMEINFO_FLAGS.FIF_DEBUG_MODULEP | enum_FRAMEINFO_FLAGS.FIF_FUNCNAME_MODULE | enum_FRAMEINFO_FLAGS.FIF_STACKRANGE), decimalBaseRadix, out frameEnumerator);

            uint frameCount = 0;
            frameEnumerator.GetCount(out frameCount);
            FRAMEINFO[] frames = new FRAMEINFO[frameCount];

            string fullyQualifiedName = module + "!" + methodName;

            bool foundStackFrame = false;
            bool foundLocal = false;

            frameEnumerator.Reset();
            if (frameEnumerator.Next((uint)frames.Length, frames, ref frameCount) == S_OK) {
                for (int i = 0; i < frameCount; ++i) {
                    FRAMEINFO frame = frames[i];

                    if (StripModuleSuffix(frame.m_bstrFuncName) == fullyQualifiedName) {
                        foundStackFrame = true;

                        IDebugCodeContext2 codeContext;
                        frame.m_pFrame.GetCodeContext(out codeContext);
                        CONTEXT_INFO[] contextInfo = new CONTEXT_INFO[1];
                        codeContext.GetInfo((uint)enum_CONTEXT_INFO_FIELDS.CIF_ALLFIELDS, contextInfo);
                        ulong instructionAddress = ulong.Parse(contextInfo[0].bstrAddress.Substring(2), System.Globalization.NumberStyles.AllowHexSpecifier);

                        MODULE_INFO[] moduleInfo = new MODULE_INFO[1];
                        frame.m_pModule.GetInfo((uint)enum_MODULE_INFO_FIELDS.MIF_LOADADDRESS, moduleInfo);
                        ulong baseAddress = moduleInfo[0].m_addrLoadAddress;

                        IList<SLocalVariable> locals = this.typeCache.GetLocals(module, methodName, (uint)(instructionAddress - baseAddress), symbol);
                        if (locals != null && locals.Count > 0) {
                            foundLocal = true;

                            ulong address = locals[0].IsOffsetFromBottom ? frame.m_addrMax : (frame.m_addrMin - 8);
                            address = (ulong)((long)address + locals[0].FrameOffset);

                            // Currently the type cache can return multiple locals from the same method if they have the same name; we're just grabbing the first one.
                            results.Add(new SSymbolResult() { Module = module, Pointer = address, Type = locals[0].Type });
                        }
                    }
                }
            }

            if (!foundStackFrame) {
                throw new DebuggerException(String.Format("Could not find stack frame: {0}", methodName));
            } else if (!foundLocal) {
                throw new DebuggerException(String.Format("Could not find local symbol: {0}", symbol));
            } else {
                return results;
            }
        }

        public event EventHandler DebuggerBroke;
        #endregion

        #region Visual Studio Debugger Callbacks
        public int Event(IDebugEngine2 engine, IDebugProcess2 process, IDebugProgram2 program, IDebugThread2 thread, IDebugEvent2 debugEvent, ref Guid riidEvent, uint dwAttrib)
        {
            if (currentDebugProgram != program && program != null && thread != null)
            {
                // First we need to evaluate an expression to figure bitness and get a memory context.

                // Capture a IDebugExpression2 interface inorder to do that.
                IEnumDebugFrameInfo2 debugFrameEnumerator;
                if (thread.EnumFrameInfo((uint)enum_FRAMEINFO_FLAGS.FIF_FRAME, decimalBaseRadix, out debugFrameEnumerator) == S_OK)
                {
                    debugFrameEnumerator.Reset();
                    uint cFrames;
                    if (debugFrameEnumerator.GetCount(out cFrames) == S_OK)
                    {
                        FRAMEINFO[] frameInfo = new FRAMEINFO[cFrames];
                        if (debugFrameEnumerator.Next(cFrames, frameInfo, ref cFrames) == S_OK)
                        {
                            for (int i = 0; i < frameInfo.Length; i++)
                            {
                                if (frameInfo[i].m_pFrame != null)
                                {
                                    IDebugExpressionContext2 debugExpressionContext;
                                    if (frameInfo[i].m_pFrame.GetExpressionContext(out debugExpressionContext) == S_OK)
                                    {
                                        IDebugExpression2 debugExpression;
                                        string errorString;
                                        uint errorIndex;

                                        // Evaluate an expression to capture a memory context of 0x0000000 pointer.
                                        if (debugExpressionContext.ParseText("(int*)0x0", (uint)enum_PARSEFLAGS.PARSE_EXPRESSION, decimalBaseRadix, out debugExpression, out errorString, out errorIndex) == S_OK)
                                        {
                                            IDebugProperty2 debugProperty;
                                            if (debugExpression.EvaluateSync((uint)enum_EVALFLAGS.EVAL_NOSIDEEFFECTS, evaluateExpressionTimeout, null, out debugProperty) == S_OK)
                                            {                                                
                                                if (debugProperty.GetMemoryContext(out memoryContext) == S_OK &&
                                                    debugProperty.GetMemoryBytes(out memoryBytes) == S_OK)
                                                {
                                                    // Evaluate the expression for pointer size.
                                                    if (debugExpressionContext.ParseText("sizeof(int)", (uint)enum_PARSEFLAGS.PARSE_EXPRESSION, decimalBaseRadix, out debugExpression, out errorString, out errorIndex) == S_OK)
                                                    {
                                                        if (debugExpression.EvaluateSync((uint)enum_EVALFLAGS.EVAL_NOSIDEEFFECTS, evaluateExpressionTimeout, null, out debugProperty) == S_OK)
                                                        {                                                            
                                                            DEBUG_PROPERTY_INFO[] debugPropertyInfo = new DEBUG_PROPERTY_INFO[1];
                                                            if (debugProperty.GetPropertyInfo((uint)enum_DEBUGPROP_INFO_FLAGS.DEBUGPROP_INFO_VALUE, decimalBaseRadix, evaluateExpressionTimeout, null, 0, debugPropertyInfo) == S_OK)
                                                            {
                                                                // Initialize program/pointersize/typecache.
                                                                currentDebugProgram = program;
                                                                if (debugPropertyInfo[0].bstrValue == "4")
                                                                {
                                                                    this.isPointer64Bit = false;
                                                                }
                                                                else
                                                                {
                                                                    this.isPointer64Bit = true;
                                                                }
                                                                Core.DiaSessionLoader diaLoader = new Core.DiaSessionLoader(
                                                                    this.configuration,
                                                                    new Core.IDiaSessionSource[]{ new DiaSessionPathSource(this) }
                                                                );
                                                                this.typeCache = new TypeCache(diaLoader, this.isPointer64Bit);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }                                        
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            else if (riidEvent == stopDebugEvent)
            {
                Reset();
            } 
            else if (riidEvent == breakInEvent)
            {
                if (this.DebuggerBroke != null)
                {
                    this.DebuggerBroke(this, new EventArgs());
                }
            }
            else if (riidEvent == threadSwitchEvent)
            {
                this.currentThread = thread;
            }

            return S_OK;
        }

        private void Reset()
        {
            currentDebugProgram = null;
            memoryContext = null;
            memoryBytes = null;
            isPointer64Bit = false;            
            typeCache = null;
            dte = null;
        }
        #endregion
        
        #region Helpers
        private async Task WaitForBreakIn()
        {
            if (this.dte == null)
            {
                this.dte = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SDTE)) as EnvDTE80.DTE2;
                while (this.dte == null)
                {
                    await Task.Delay(1000);
                    this.dte = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SDTE)) as EnvDTE80.DTE2;
                }
            }

            while (dte.Debugger.CurrentMode != EnvDTE.dbgDebugMode.dbgBreakMode)
            {
                await Task.Delay(1000);
            }
        }

        internal string GetModuleSymbolPath(string moduleName)
        {
            // Fix up moduleName to have .dll in the end.
            if (!moduleName.EndsWith(".dll"))
            {
                moduleName = moduleName + ".dll";
            }

            string moduleSymbolPath = null;
            IEnumDebugModules2 debugModulesEnumerator;
            if (currentDebugProgram.EnumModules(out debugModulesEnumerator) == S_OK)
            {
                debugModulesEnumerator.Reset();
                IDebugModule2[] debugModuleArray = new IDebugModule2[1];
                uint cModules = 0;
                while (debugModulesEnumerator.Next(1, debugModuleArray, ref cModules) == S_OK && cModules > 0)
                {
                    IDebugModule2 debugModule2 = debugModuleArray[0];
                    MODULE_INFO[] moduleInfo = new MODULE_INFO[1];
                    if (debugModule2.GetInfo((uint)enum_MODULE_INFO_FIELDS.MIF_NAME, moduleInfo) == S_OK)
                    {
                        if (moduleInfo[0].m_bstrName == moduleName)
                        {
                            IDebugModule3 debugModule3 = null;
                            IntPtr debugModule2ComInterface = System.Runtime.InteropServices.Marshal.GetIUnknownForObject(debugModule2);
                            IntPtr debugModule3ComInterface;
                            if (System.Runtime.InteropServices.Marshal.QueryInterface(debugModule2ComInterface, ref debugModule3Guid, out debugModule3ComInterface) == S_OK)
                            {
                                debugModule3 = (IDebugModule3)System.Runtime.InteropServices.Marshal.GetObjectForIUnknown(debugModule3ComInterface);

                                MODULE_SYMBOL_SEARCH_INFO[] symbolSearchInfo = new MODULE_SYMBOL_SEARCH_INFO[1];
                                if (debugModule3.GetSymbolInfo((uint)enum_SYMBOL_SEARCH_INFO_FIELDS.SSIF_VERBOSE_SEARCH_INFO, symbolSearchInfo) == S_OK)
                                {
                                    string symbolInfo = symbolSearchInfo[0].bstrVerboseSearchInfo;
                                    int indexOfSymbolLoaded = symbolInfo.IndexOf(": Symbols loaded");
                                    if (indexOfSymbolLoaded >= 0 && indexOfSymbolLoaded < symbolInfo.Length)
                                    {
                                        moduleSymbolPath = symbolInfo.Substring(0, indexOfSymbolLoaded);
                                        moduleSymbolPath = moduleSymbolPath.Substring(moduleSymbolPath.LastIndexOf('\n') + 1);
                                    }
                                }
                            }
                            break;
                        }
                    }
                } 
            }

            if (moduleSymbolPath == null) {
                throw new JsDbg.DebuggerException(String.Format("Unable to find symbols for module {0}", moduleName));
            }

            return moduleSymbolPath;
        }

        public bool IsPointer64Bit 
        {
            get { return isPointer64Bit; } 
        }
        
        #endregion

        public void Dispose()
        {
            IVsDebugger debugService = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SVsShellDebugger)) as IVsDebugger;
            if (debugService != null)
            {
                // Register for debug events.
                // Assumes the current class implements IVsDebuggerEvents.
                debugService.UnadviseDebugEventCallback(this);
            }
        }       

        TypeCache typeCache;
        IDebugProgram2 currentDebugProgram;
        IDebugMemoryContext2 memoryContext;
        IDebugMemoryBytes2 memoryBytes;
        IDebugThread2 currentThread;
        bool isPointer64Bit;
        EnvDTE80.DTE2 dte;
        Core.IConfiguration configuration;

        static Guid debugModule3Guid = Guid.Parse("245F9D6A-E550-404D-82F1-FDB68281607A");
        static Guid startDebugEvent = Guid.Parse("2c2b15b7-fc6d-45b3-9622-29665d964a76");
        static Guid stopDebugEvent = Guid.Parse("f199b2c2-88fe-4c5d-a0fd-aa046b0dc0dc");
        static Guid breakInEvent = Guid.Parse("04bcb310-5e1a-469c-87c6-4971e6c8483a");
        static Guid threadSwitchEvent = Guid.Parse("8764364b-0c52-4c7c-af6a-8b19a8c98226");
        const int evaluateExpressionTimeout = int.MaxValue;
        const int decimalBaseRadix = 10;
    }
}
