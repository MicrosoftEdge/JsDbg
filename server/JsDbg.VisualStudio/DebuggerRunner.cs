using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Debugger.Interop;
using Microsoft.VisualStudio.Shell.Interop;
using JsDbg.Dia.VisualStudio;
using JsDbg.Core;
using JsDbg.Utilities;

namespace JsDbg.VisualStudio {
    class DebuggerRunner : IDebugEventCallback2 {
        internal DebuggerRunner() {
            this.engine = new DebuggerEngine(this);
            this.engine.DiaLoader = new Dia.DiaSessionLoader(new Dia.IDiaSessionSource[] { new DiaSessionPathSource(this), new DiaSessionModuleSource(this, this.engine) });
            this.debugger = new Core.TypeCacheDebugger(this.engine);

            IVsDebugger debugService = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SVsShellDebugger)) as IVsDebugger;
            if (debugService != null) {
                // Register for debug events.
                // Assumes the current class implements IVsDebuggerEvents.
                debugService.AdviseDebugEventCallback(this);
            }
        }

        public async Task WaitForBreakIn() {
            while (true) {
                if (this.dte == null) {
                    this.dte = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SDTE)) as EnvDTE80.DTE2;
                }

                if (this.dte != null &&
                    this.dte.Debugger.CurrentMode == EnvDTE.dbgDebugMode.dbgBreakMode &&
                    this.currentDebugProgram != null &&
                    this.currentThread != null &&
                    this.memoryBytes != null &&
                    this.memoryContext != null
                ) {
                    return;
                }

                this.engine.NotifyDebuggerChange(DebuggerChangeEventArgs.DebuggerStatus.Waiting);
                await Task.Delay(1000);
            }
        }

        #region IDebugEventCallback2 Members

        private const int S_OK = 0;

        public int Event(IDebugEngine2 engine, IDebugProcess2 process, IDebugProgram2 program, IDebugThread2 thread, IDebugEvent2 debugEvent, ref Guid riidEvent, uint attributes) {
            bool savedProgram = false;
            bool savedThread = false;

            if (this.currentDebugProgram != program && program != null && thread != null) {
                // Evaluate an expression get access to the memory context and the bitness.
                IDebugProperty2 debugProperty = this.EvaluateExpression(thread, "(void**)0x0 + 1");
                if (debugProperty != null) {
                    using (new DisposableComReference(debugProperty)) {
                        DEBUG_PROPERTY_INFO[] debugPropertyInfo = new DEBUG_PROPERTY_INFO[1];
                        if (debugProperty.GetPropertyInfo((uint)enum_DEBUGPROP_INFO_FLAGS.DEBUGPROP_INFO_VALUE, 16, evaluateExpressionTimeout, null, 0, debugPropertyInfo) == S_OK) {
                            IDebugMemoryContext2 memoryContext = null;
                            IDebugMemoryBytes2 memoryBytes = null;
                            if (debugProperty.GetMemoryContext(out memoryContext) == S_OK && debugProperty.GetMemoryBytes(out memoryBytes) == S_OK) {
                                DisposableComReference.SetReference(ref this.currentDebugProgram, program);
                                DisposableComReference.SetReference(ref this.currentThread, thread);
                                DisposableComReference.SetReference(ref this.memoryContext, memoryContext);
                                DisposableComReference.SetReference(ref this.memoryBytes, memoryBytes);
                                ulong offset = ulong.Parse(debugPropertyInfo[0].bstrValue.Substring("0x".Length), System.Globalization.NumberStyles.AllowHexSpecifier);

                                // Adjust the memory context and calculate the bitness.
                                this.memoryContext.Subtract(offset, out memoryContext);
                                DisposableComReference.SetReference(ref this.memoryContext, memoryContext);
                                this.isPointer64Bit = (offset == 8);

                                this.engine.NotifyBitnessChanged();
                                this.engine.DiaLoader.ClearSymbols();
                                this.debugger.ClearTypeCache();
                                savedProgram = true;
                                savedThread = true;
                            } else {
                                DisposableComReference.ReleaseIfNotNull(ref memoryContext);
                                DisposableComReference.ReleaseIfNotNull(ref memoryBytes);
                            }
                        }
                    }
                }
            } else if (riidEvent == stopDebugEvent) {
                // The debugger stopped.  Clear the references.
                DisposableComReference.ReleaseIfNotNull(ref this.currentDebugProgram);
                DisposableComReference.ReleaseIfNotNull(ref this.memoryContext);
                DisposableComReference.ReleaseIfNotNull(ref this.memoryBytes);
                DisposableComReference.ReleaseIfNotNull(ref this.dte);
                this.engine.DiaLoader.ClearSymbols();
                this.debugger.ClearTypeCache();
            } else if (riidEvent == breakInEvent) {
                // The debugger broke in, notify the client.
                this.engine.NotifyDebuggerChange(DebuggerChangeEventArgs.DebuggerStatus.Break);
            } else if (riidEvent == threadSwitchEvent) {
                // The user switched the current thread.
                DisposableComReference.SetReference(ref this.currentThread, thread);
                savedThread = true;
            }

            if (!savedProgram) {
                DisposableComReference.ReleaseIfNotNull(ref program);
            }
            if (!savedThread) {
                DisposableComReference.ReleaseIfNotNull(ref thread);
            }
            DisposableComReference.ReleaseIfNotNull(ref engine);
            DisposableComReference.ReleaseIfNotNull(ref process);
            DisposableComReference.ReleaseIfNotNull(ref debugEvent);

            return S_OK;
        }

        private IDebugProperty2 EvaluateExpression(IDebugThread2 thread, string expression) {
            // Capture a IDebugExpression2 interface inorder to do that.
            IEnumDebugFrameInfo2 debugFrameEnumerator;
            if (thread.EnumFrameInfo((uint)enum_FRAMEINFO_FLAGS.FIF_FRAME, decimalBaseRadix, out debugFrameEnumerator) != S_OK) {
                return null;
            }

            IDebugExpressionContext2 expressionContext = null;
            using (new DisposableComReference(debugFrameEnumerator)) {
                debugFrameEnumerator.Reset();

                uint frameCount;
                if (debugFrameEnumerator.GetCount(out frameCount) != S_OK) {
                    return null;
                }

                FRAMEINFO[] frameInfo = new FRAMEINFO[frameCount];
                if (debugFrameEnumerator.Next(frameCount, frameInfo, ref frameCount) != S_OK) {
                    return null;
                }

                for (int i = 0; i < frameInfo.Length; i++) {
                    if (frameInfo[i].m_pFrame != null && frameInfo[i].m_pFrame.GetExpressionContext(out expressionContext) == S_OK) {
                        break;
                    }
                }
            }

            using (new DisposableComReference(expressionContext)) {
                IDebugExpression2 debugExpression;
                string errorString;
                uint errorIndex;

                if (expressionContext.ParseText(expression, (uint)enum_PARSEFLAGS.PARSE_EXPRESSION, decimalBaseRadix, out debugExpression, out errorString, out errorIndex) != S_OK) {
                    return null;
                }

                using (new DisposableComReference(debugExpression)) {
                    IDebugProperty2 debugProperty;
                    if (debugExpression.EvaluateSync((uint)enum_EVALFLAGS.EVAL_NOSIDEEFFECTS, evaluateExpressionTimeout, null, out debugProperty) == S_OK) {
                        return debugProperty;
                    }
                }
            }

            return null;
        }

        internal void GetModuleInfo(string moduleName, out string modulePath, out string symbolPath) {
            modulePath = null;
            symbolPath = null;

            IEnumDebugModules2 debugModulesEnumerator;
            if (currentDebugProgram.EnumModules(out debugModulesEnumerator) != S_OK) {
                return;
            }

            using (new DisposableComReference(debugModulesEnumerator)) {
                debugModulesEnumerator.Reset();
                IDebugModule2[] debugModuleArray = new IDebugModule2[1];
                uint moduleCount = 0;
                while (debugModulesEnumerator.Next(1, debugModuleArray, ref moduleCount) == S_OK && moduleCount > 0) {
                    IDebugModule2 debugModule = debugModuleArray[0];
                    using (new DisposableComReference(debugModule)) {
                        MODULE_INFO[] moduleInfo = new MODULE_INFO[1];
                        if (debugModule.GetInfo((uint)(enum_MODULE_INFO_FIELDS.MIF_NAME | enum_MODULE_INFO_FIELDS.MIF_URLSYMBOLLOCATION | enum_MODULE_INFO_FIELDS.MIF_URL), moduleInfo) == S_OK) {
                            if (moduleName.ToLowerInvariant() == System.IO.Path.GetFileNameWithoutExtension(moduleInfo[0].m_bstrName).ToLowerInvariant()) {
                                modulePath = moduleInfo[0].m_bstrUrl;
                                symbolPath = moduleInfo[0].m_bstrUrlSymbolLocation;
                                return;
                            }
                        }
                    }
                }
            }
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
