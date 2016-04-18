using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Debugger.Interop;
using Microsoft.VisualStudio.Shell.Interop;
using JsDbg.Dia.VisualStudio;
using JsDbg.Core;

namespace JsDbg.VisualStudio {
    class DebuggerRunner : IDebugEventCallback2 {
        internal DebuggerRunner(Core.IConfiguration configuration) {
            Dia.DiaSessionLoader diaLoader = new Dia.DiaSessionLoader(configuration, new Dia.IDiaSessionSource[]{ new DiaSessionPathSource(this) });
            this.engine = new DebuggerEngine(this, diaLoader);
            this.debugger = new Core.TypeCacheDebugger(this.engine);

            IVsDebugger debugService = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SVsShellDebugger)) as IVsDebugger;
            if (debugService != null) {
                // Register for debug events.
                // Assumes the current class implements IVsDebuggerEvents.
                debugService.AdviseDebugEventCallback(this);
            }
        }

        public async Task WaitForBreakIn() {
            if (this.dte == null) {
                this.dte = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SDTE)) as EnvDTE80.DTE2;
                while (this.dte == null) {
                    this.engine.NotifyDebuggerChange(DebuggerChangeEventArgs.DebuggerStatus.Waiting);
                    await Task.Delay(1000);
                    this.dte = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SDTE)) as EnvDTE80.DTE2;
                }
            }

            while (this.currentDebugProgram == null ||
                this.currentThread == null ||
                this.memoryBytes == null ||
                this.memoryContext == null ||
                dte.Debugger.CurrentMode != EnvDTE.dbgDebugMode.dbgBreakMode
            ) {
                await Task.Delay(1000);
            }
        }

        #region IDebugEventCallback2 Members

        private const int S_OK = 0;

        public int Event(IDebugEngine2 pEngine, IDebugProcess2 pProcess, IDebugProgram2 pProgram, IDebugThread2 pThread, IDebugEvent2 pEvent, ref Guid riidEvent, uint dwAttrib) {
            if (currentDebugProgram != pProgram && pProgram != null && pThread != null) {
                // First we need to evaluate an expression to figure bitness and get a memory context.
                this.currentThread = pThread;

                // Capture a IDebugExpression2 interface inorder to do that.
                IEnumDebugFrameInfo2 debugFrameEnumerator;
                if (pThread.EnumFrameInfo((uint)enum_FRAMEINFO_FLAGS.FIF_FRAME, decimalBaseRadix, out debugFrameEnumerator) == S_OK) {
                    debugFrameEnumerator.Reset();
                    uint cFrames;
                    if (debugFrameEnumerator.GetCount(out cFrames) == S_OK) {
                        FRAMEINFO[] frameInfo = new FRAMEINFO[cFrames];
                        if (debugFrameEnumerator.Next(cFrames, frameInfo, ref cFrames) == S_OK) {
                            for (int i = 0; i < frameInfo.Length; i++) {
                                if (frameInfo[i].m_pFrame != null) {
                                    IDebugExpressionContext2 debugExpressionContext;
                                    if (frameInfo[i].m_pFrame.GetExpressionContext(out debugExpressionContext) == S_OK) {
                                        IDebugExpression2 debugExpression;
                                        string errorString;
                                        uint errorIndex;

                                        // Evaluate an expression to capture a memory context of 0x0000000 pointer.
                                        if (debugExpressionContext.ParseText("(int*)0x0", (uint)enum_PARSEFLAGS.PARSE_EXPRESSION, decimalBaseRadix, out debugExpression, out errorString, out errorIndex) == S_OK) {
                                            IDebugProperty2 debugProperty;
                                            if (debugExpression.EvaluateSync((uint)enum_EVALFLAGS.EVAL_NOSIDEEFFECTS, evaluateExpressionTimeout, null, out debugProperty) == S_OK) {
                                                if (debugProperty.GetMemoryContext(out memoryContext) == S_OK &&
                                                    debugProperty.GetMemoryBytes(out memoryBytes) == S_OK) {
                                                    // Evaluate the expression for pointer size.
                                                    if (debugExpressionContext.ParseText("sizeof(void*)", (uint)enum_PARSEFLAGS.PARSE_EXPRESSION, decimalBaseRadix, out debugExpression, out errorString, out errorIndex) == S_OK) {
                                                        if (debugExpression.EvaluateSync((uint)enum_EVALFLAGS.EVAL_NOSIDEEFFECTS, evaluateExpressionTimeout, null, out debugProperty) == S_OK) {
                                                            DEBUG_PROPERTY_INFO[] debugPropertyInfo = new DEBUG_PROPERTY_INFO[1];
                                                            if (debugProperty.GetPropertyInfo((uint)enum_DEBUGPROP_INFO_FLAGS.DEBUGPROP_INFO_VALUE, decimalBaseRadix, evaluateExpressionTimeout, null, 0, debugPropertyInfo) == S_OK) {
                                                                // Initialize program/pointersize/typecache.
                                                                currentDebugProgram = pProgram;
                                                                if (debugPropertyInfo[0].bstrValue == "4") {
                                                                    this.isPointer64Bit = false;
                                                                } else {
                                                                    this.isPointer64Bit = true;
                                                                }
                                                                this.engine.NotifyBitnessChanged();
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
            } else if (riidEvent == stopDebugEvent) {
                currentDebugProgram = null;
                memoryContext = null;
                memoryBytes = null;
                isPointer64Bit = false;
                dte = null;
            } else if (riidEvent == breakInEvent) {
                this.engine.NotifyDebuggerChange(DebuggerChangeEventArgs.DebuggerStatus.Break);
            } else if (riidEvent == threadSwitchEvent) {
                this.currentThread = pThread;
            }

            return S_OK;
        }

        internal string GetModuleSymbolPath(string moduleName) {
            string moduleSymbolPath = null;
            IEnumDebugModules2 debugModulesEnumerator;
            if (currentDebugProgram.EnumModules(out debugModulesEnumerator) == S_OK) {
                debugModulesEnumerator.Reset();
                IDebugModule2[] debugModuleArray = new IDebugModule2[1];
                uint cModules = 0;
                while (debugModulesEnumerator.Next(1, debugModuleArray, ref cModules) == S_OK && cModules > 0) {
                    IDebugModule2 debugModule2 = debugModuleArray[0];
                    MODULE_INFO[] moduleInfo = new MODULE_INFO[1];
                    if (debugModule2.GetInfo((uint)enum_MODULE_INFO_FIELDS.MIF_NAME, moduleInfo) == S_OK) {
                        string suffixedModuleName = moduleInfo[0].m_bstrName;
                        string bareModuleName = suffixedModuleName.Substring(0, suffixedModuleName.LastIndexOf('.'));
                        if (bareModuleName == moduleName) {
                            IDebugModule3 debugModule3 = null;
                            IntPtr debugModule2ComInterface = System.Runtime.InteropServices.Marshal.GetIUnknownForObject(debugModule2);
                            IntPtr debugModule3ComInterface;
                            if (System.Runtime.InteropServices.Marshal.QueryInterface(debugModule2ComInterface, ref debugModule3Guid, out debugModule3ComInterface) == S_OK) {
                                debugModule3 = (IDebugModule3)System.Runtime.InteropServices.Marshal.GetObjectForIUnknown(debugModule3ComInterface);

                                MODULE_SYMBOL_SEARCH_INFO[] symbolSearchInfo = new MODULE_SYMBOL_SEARCH_INFO[1];
                                if (debugModule3.GetSymbolInfo((uint)enum_SYMBOL_SEARCH_INFO_FIELDS.SSIF_VERBOSE_SEARCH_INFO, symbolSearchInfo) == S_OK) {
                                    string symbolInfo = symbolSearchInfo[0].bstrVerboseSearchInfo;
                                    int indexOfSymbolLoaded = symbolInfo.IndexOf(": Symbols loaded");
                                    if (indexOfSymbolLoaded >= 0 && indexOfSymbolLoaded < symbolInfo.Length) {
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
                throw new DebuggerException(String.Format("Unable to find symbols for module {0}", moduleName));
            }

            return moduleSymbolPath;
        }

        internal bool IsPointer64Bit {
            get { return this.isPointer64Bit; }
        }

        internal IDebugProgram2 CurrentDebugProgram {
            get { return this.currentDebugProgram; }
        }

        internal IDebugMemoryContext2 CurrentMemoryContext {
            get { return this.memoryContext; }
        }

        internal IDebugMemoryBytes2 CurrentMemoryBytes {
            get { return this.memoryBytes; }
        }

        internal IDebugThread2 CurrentThread {
            get { return this.currentThread; }
        }

        internal IDebugger Debugger {
            get { return this.debugger; }
        }

        #endregion

        Core.TypeCacheDebugger debugger;
        DebuggerEngine engine;
        IDebugProgram2 currentDebugProgram;
        IDebugMemoryContext2 memoryContext;
        IDebugMemoryBytes2 memoryBytes;
        IDebugThread2 currentThread;
        bool isPointer64Bit;
        EnvDTE80.DTE2 dte;

        static Guid debugModule3Guid = Guid.Parse("245F9D6A-E550-404D-82F1-FDB68281607A");
        static Guid startDebugEvent = Guid.Parse("2c2b15b7-fc6d-45b3-9622-29665d964a76");
        static Guid stopDebugEvent = Guid.Parse("f199b2c2-88fe-4c5d-a0fd-aa046b0dc0dc");
        static Guid breakInEvent = Guid.Parse("04bcb310-5e1a-469c-87c6-4971e6c8483a");
        static Guid threadSwitchEvent = Guid.Parse("8764364b-0c52-4c7c-af6a-8b19a8c98226");
        const int evaluateExpressionTimeout = int.MaxValue;
        const int decimalBaseRadix = 10;
    }
}
