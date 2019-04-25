//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.ComponentModel.Design;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Debugger.Interop;
using Microsoft.VisualStudio.Shell.Interop;
using JsDbg.Core;
using JsDbg.Utilities;
using JsDbg.Windows;
using JsDbg.Windows.Dia;
using JsDbg.Windows.Dia.VisualStudio;

namespace JsDbg.VisualStudio {
    class DebuggerRunner : IDebugEventCallback2 {
        internal DebuggerRunner() {
            this.engine = new DebuggerEngine(this);
            this.engine.DiaLoader = new DiaSessionLoader(new IDiaSessionSource[] { new DiaSessionPathSource(this), new DiaSessionModuleSource(this, this.engine) });
            this.debugger = new DiaDebugger(this.engine);
            this.EnsureDebuggerService();
            this.attachedProcesses = new List<uint>();
        }

        private bool EnsureDebuggerService() {
            if (this.vsDebuggerService != null) {
                return true;
            }

            this.vsDebuggerService = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SVsShellDebugger)) as IVsDebugger;
            if (this.vsDebuggerService != null) {
                // Register for debug events.
                // Assumes the current class implements IVsDebuggerEvents.
                this.vsDebuggerService.AdviseDebugEventCallback(this);
                return true;
            } else {
                return false;
            }
        }

        public ulong TebAddress() {
            IDebugProperty2 debugProperty = this.EvaluateExpression(this.CurrentThread, "@tib");
            if (debugProperty != null) {
                using (new DisposableComReference(debugProperty)) {
                    DEBUG_PROPERTY_INFO[] debugPropertyInfo = new DEBUG_PROPERTY_INFO[1];
                    if (debugProperty.GetPropertyInfo((uint)enum_DEBUGPROP_INFO_FLAGS.DEBUGPROP_INFO_VALUE, 16, evaluateExpressionTimeout, null, 0, debugPropertyInfo) == S_OK) {
                        IDebugMemoryContext2 memoryContext = null;
                        if (debugProperty.GetMemoryContext(out memoryContext) == S_OK) {
                            string hexString;
                            memoryContext.GetName(out hexString);
                            hexString = hexString.Substring(2);  // Strip '0x' for conversion to ulong
                            return ulong.Parse(hexString, NumberStyles.HexNumber);
                        }
                    }
                }
            }
            return 0;
        }

        public void SetTargetProcess(uint systemProcessId) {
            int targetProcessIndex = Array.IndexOf(this.GetAttachedProcesses(), systemProcessId);
            if (targetProcessIndex == -1) {
                throw new DebuggerException("Invalid process ID");
            } else {
                if (this.TargetProcessSystemId != systemProcessId) {
                    Guid setCurrentProcessCmdGroup;
                    uint setCurrentProcessCmdId;
                    IVsCmdNameMapping vsCmdNameMapping = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SVsCmdNameMapping)) as IVsCmdNameMapping;
                    vsCmdNameMapping.MapNameToGUIDID("Debug.SetCurrentProcess", out setCurrentProcessCmdGroup, out setCurrentProcessCmdId);
                    Microsoft.VisualStudio.Shell.OleMenuCommandService commandService = new Microsoft.VisualStudio.Shell.OleMenuCommandService(Microsoft.VisualStudio.Shell.ServiceProvider.GlobalProvider);
                    if (!commandService.GlobalInvoke(new CommandID(setCurrentProcessCmdGroup, (int)setCurrentProcessCmdId), Convert.ToString(targetProcessIndex + 1))) {
                        throw new DebuggerException("Unable to set the active process in the debugger.");
                    }
                }
            }
        }

        public uint[] GetAttachedProcesses() {
            return this.attachedProcesses.ToArray();
        }

        public void SetTargetThread(uint systemThreadId) {
            int targetThreadIndex = Array.IndexOf(this.GetCurrentProcessThreads(), systemThreadId);
            if (targetThreadIndex == -1) {
                throw new DebuggerException("Invalid thread ID");
            } else {
                if (this.TargetThreadSystemId != systemThreadId) {
                    Guid setCurrentThreadCmdGroup;
                    uint setCurrentThreadCmdId;
                    IVsCmdNameMapping vsCmdNameMapping = Microsoft.VisualStudio.Shell.Package.GetGlobalService(typeof(SVsCmdNameMapping)) as IVsCmdNameMapping;
                    vsCmdNameMapping.MapNameToGUIDID("Debug.SetCurrentThread", out setCurrentThreadCmdGroup, out setCurrentThreadCmdId);
                    Microsoft.VisualStudio.Shell.OleMenuCommandService commandService = new Microsoft.VisualStudio.Shell.OleMenuCommandService(Microsoft.VisualStudio.Shell.ServiceProvider.GlobalProvider);
                    if (!commandService.GlobalInvoke(new CommandID(setCurrentThreadCmdGroup, (int)setCurrentThreadCmdId), Convert.ToString(targetThreadIndex + 1))) {
                        throw new DebuggerException("Unable to set the active thread in the debugger.");
                    }
                }
            }
        }

        public uint[] GetCurrentProcessThreads() {
            if (this.TargetProcessSystemId != 0) {
                Process targetProcess = Process.GetProcessById((int)this.TargetProcessSystemId);
                ProcessThread[] targetProcessThreads = new ProcessThread[targetProcess.Threads.Count];
                targetProcess.Threads.CopyTo(targetProcessThreads, index: 0);
                return targetProcessThreads.Select((thread) => (uint)thread.Id).ToArray();
            }
            return null;
        }

        public uint TargetProcessSystemId {
            get { return this.targetProcessSystemId; }
            set { this.targetProcessSystemId = value; }
        }

        public uint TargetThreadSystemId {
            get { return this.targetThreadSystemId; }
            set { this.targetThreadSystemId = value; }
        }

        public async Task WaitForBreakIn() {
            while (true) {
                if (this.EnsureDebuggerService()) {
                    DBGMODE[] mode = new DBGMODE[1];
                    if (this.vsDebuggerService.GetMode(mode) == 0 &&
                        mode[0] == DBGMODE.DBGMODE_Break &&
                        this.currentDebugProgram != null &&
                        this.currentThread != null &&
                        this.memoryBytes != null &&
                        this.memoryContext != null
                    ) {
                        return;
                    }
                }

                this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.Waiting);
                await Task.Delay(1000);
            }
        }

        #region IDebugEventCallback2 Members

        private const int S_OK = 0;

        public int Event(IDebugEngine2 engine, IDebugProcess2 process, IDebugProgram2 program, IDebugThread2 thread, IDebugEvent2 debugEvent, ref Guid riidEvent, uint attributes) {
            bool savedProgram = false;
            bool savedThread = false;

            if (riidEvent == processCreateEvent) {
                AD_PROCESS_ID[] pdwProcessId = new AD_PROCESS_ID[1];
                process.GetPhysicalProcessId(pdwProcessId);
                Debug.Assert(!this.attachedProcesses.Contains(pdwProcessId[0].dwProcessId));
                this.attachedProcesses.Add(pdwProcessId[0].dwProcessId);
            } else if (riidEvent == processDestroyEvent) {
                AD_PROCESS_ID[] pdwProcessId = new AD_PROCESS_ID[1];
                process.GetPhysicalProcessId(pdwProcessId);
                Debug.Assert(this.attachedProcesses.Contains(pdwProcessId[0].dwProcessId));
                this.attachedProcesses.Remove(pdwProcessId[0].dwProcessId);
            } else if (riidEvent == breakInEvent && this.currentDebugProgram != program && program != null && thread != null) {
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

                                this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.Detaching);
                                this.engine.DiaLoader.ClearSymbols();
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
                this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.Detaching);
                this.engine.DiaLoader.ClearSymbols();
            } else if (riidEvent == breakInEvent) {
                // The debugger broke in, notify the client.
                this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.Break);
            } else if (riidEvent == threadSwitchEvent) {
                // The user switched the current thread.
                DisposableComReference.SetReference(ref this.currentThread, thread);
                savedThread = true;
                if (this.currentThread != null) {
                    uint threadId;
                    thread.GetThreadId(out threadId);
                    this.TargetThreadSystemId = threadId;
                }

                bool processChanged = false;
                if (process != null) {
                    AD_PROCESS_ID[] pdwProcessId = new AD_PROCESS_ID[1];
                    process.GetPhysicalProcessId(pdwProcessId);
                    if (this.TargetProcessSystemId != 0) {
                        if (pdwProcessId[0].dwProcessId != this.TargetProcessSystemId) {
                            this.TargetProcessSystemId = pdwProcessId[0].dwProcessId;
                            processChanged = true;
                        }
                    } else {
                        this.TargetProcessSystemId = pdwProcessId[0].dwProcessId;
                        if (this.TargetProcessSystemId != 0) {
                            processChanged = true;
                        }
                    }
                } else if (this.TargetProcessSystemId != 0) {
                    this.TargetProcessSystemId = 0;
                    processChanged = true;
                }

                if (processChanged) {
                    DisposableComReference.SetReference(ref this.currentDebugProgram, program);
                    savedProgram = true;

                    if (program != null) {
                        // Evaluate an expression get access to the memory context and the bitness.
                        IDebugProperty2 debugProperty = this.EvaluateExpression(thread, "(void**)0x0 + 1");
                        if (debugProperty != null) {
                            using (new DisposableComReference(debugProperty)) {
                                DEBUG_PROPERTY_INFO[] debugPropertyInfo = new DEBUG_PROPERTY_INFO[1];
                                if (debugProperty.GetPropertyInfo((uint)enum_DEBUGPROP_INFO_FLAGS.DEBUGPROP_INFO_VALUE, 16, evaluateExpressionTimeout, null, 0, debugPropertyInfo) == S_OK) {
                                    IDebugMemoryContext2 memoryContext = null;
                                    IDebugMemoryBytes2 memoryBytes = null;
                                    if ((debugProperty.GetMemoryContext(out memoryContext) == S_OK) && (debugProperty.GetMemoryBytes(out memoryBytes) == S_OK)) {
                                        DisposableComReference.SetReference(ref this.memoryContext, memoryContext);
                                        DisposableComReference.SetReference(ref this.memoryBytes, memoryBytes);
                                        ulong offset = ulong.Parse(debugPropertyInfo[0].bstrValue.Substring("0x".Length), System.Globalization.NumberStyles.AllowHexSpecifier);

                                        // Adjust the memory context and calculate the bitness.
                                        this.memoryContext.Subtract(offset, out memoryContext);
                                        DisposableComReference.SetReference(ref this.memoryContext, memoryContext);
                                        this.isPointer64Bit = (offset == 8);
                                    } else {
                                        DisposableComReference.ReleaseIfNotNull(ref memoryContext);
                                        DisposableComReference.ReleaseIfNotNull(ref memoryBytes);
                                    }
                                }
                            }
                        }

                        this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingProcess);
                    }
                } else {
                    this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingThread);
                }
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

        internal bool IsDebuggerBusy {
            get {
                if (this.EnsureDebuggerService()) {
                    DBGMODE[] mode = new DBGMODE[1];
                    return (this.vsDebuggerService.GetMode(mode) == 0) && (mode[0] != DBGMODE.DBGMODE_Break);
                }
                return true;
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

        DiaDebugger debugger;
        DebuggerEngine engine;
        IDebugProgram2 currentDebugProgram;
        IDebugMemoryContext2 memoryContext;
        IDebugMemoryBytes2 memoryBytes;
        IDebugThread2 currentThread;
        IVsDebugger vsDebuggerService;
        List<uint> attachedProcesses;
        private uint targetProcessSystemId;  // process being actively debugged
        private uint targetThreadSystemId;  // thread being actively debugged
        bool isPointer64Bit;

        static Guid debugModule3Guid = Guid.Parse("245f9d6a-e550-404d-82f1-fdb68281607a");
        static Guid startDebugEvent = Guid.Parse("2c2b15b7-fc6d-45b3-9622-29665d964a76");
        static Guid stopDebugEvent = Guid.Parse("f199b2c2-88fe-4c5d-a0fd-aa046b0dc0dc");
        static Guid breakInEvent = Guid.Parse("04bcb310-5e1a-469c-87c6-4971e6c8483a");
        static Guid threadSwitchEvent = Guid.Parse("8764364b-0c52-4c7c-af6a-8b19a8c98226");
        static Guid statementChangedEvent = Guid.Parse("ce6f92d3-4222-4b1e-830d-3ecff112bf22");
        static Guid processCreateEvent = Guid.Parse("bac3780f-04da-4726-901c-ba6a4633e1ca");
        static Guid processDestroyEvent = Guid.Parse("3e2a0832-17e1-4886-8c0e-204da242995f");
        static Guid threadCreateEvent = Guid.Parse("2090ccfc-70c5-491d-a5e8-bad2dd9ee3ea");
        static Guid threadDestroyEvent = Guid.Parse("2c3b7532-a36f-4a6e-9072-49be649B8541");
        const int evaluateExpressionTimeout = int.MaxValue;
        const int decimalBaseRadix = 10;
    }
}
