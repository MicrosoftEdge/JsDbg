//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;
using JsDbg.Core;
using JsDbg.Windows;
using JsDbg.Windows.Dia;
using JsDbg.Windows.Dia.WinDbg;

namespace JsDbg.WinDbg {
    class DebuggerRunner : IDisposable {
        public DebuggerRunner(string connectionString) {
            this.client = new DebugClient(connectionString);
            this.control = new DebugControl(this.client);
            this.symbolCache = new SymbolCache(this.client);
            this.dataSpaces = new DebugDataSpaces(this.client);
            this.systemObjects = new DebugSystemObjects(this.client);
            this.diaLoader = new DiaSessionLoader(
                new IDiaSessionSource[] { new DiaSessionPathSource(this, this.symbolCache), new DiaSessionModuleSource(this, this.symbolCache, this.dataSpaces) }
            );
            this.isShuttingDown = false;
            this.didShutdown = true;
            this.engine = new DebuggerEngine(this, this.client, this.control, this.diaLoader);
            this.debugger = new DiaDebugger(this.engine);
            Debug.Assert(!this.IsDebuggerBusy);
            this.TargetProcessSystemId = this.systemObjects.CurrentProcessSystemId;
        }

        public void Dispose() {
            this.client.Dispose();
            this.symbolCache.Dispose();
            this.dataSpaces.Dispose();
            this.systemObjects.Dispose();
            this.debugger.Dispose();
        }

        public IDebugger Debugger {
            get { return this.debugger; }
        }

        public Task<ulong> TebAddress() {
            return this.AttemptOperation<ulong>(() => this.systemObjects.CurrentThreadTeb, String.Format("Unable to get TEB address."));

        }

        public async void SetTargetProcess(uint systemProcessId) {
            if (Array.IndexOf(await this.GetAttachedProcesses(), systemProcessId) == -1) {
                throw new DebuggerException("Invalid process ID");
            } else {
                if (this.TargetProcessSystemId != systemProcessId) {
                    this.TargetProcessSystemId = systemProcessId;
                    uint engineProcessId = await this.AttemptOperation<uint>(() => this.systemObjects.GetProcessIdBySystemId(systemProcessId), String.Format("Unable to set process ID."));
                    this.control.Execute("|" + engineProcessId + "s");
                    this.TargetThreadSystemId = await this.AttemptOperation<uint>(() => this.systemObjects.CurrentThreadSystemId, String.Format("Unable to set thread ID."));  // Process change also causes a thread change.
                    this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingProcess);
                }
            }
        }

        public async Task<uint[]> GetAttachedProcesses() {
            return await this.AttemptOperation<uint[]>(() => {
                uint numProcesses = this.systemObjects.NumberProcesses;
                uint[] ids;
                uint[] systemIds;
                this.systemObjects.GetProcessIdsByIndex(/*start*/0, /*count*/numProcesses, out ids, out systemIds);
                return systemIds;
            }, String.Format("Unable to get process IDs."));
        }

        public uint TargetProcessSystemId {
            get { return this.targetProcessSystemId; }
            set { this.targetProcessSystemId = value; }
        }

        public async void SetTargetThread(uint systemThreadId) {
            if (Array.IndexOf(await this.GetCurrentProcessThreads(), systemThreadId) == -1) {
                throw new DebuggerException("Invalid thread ID");
            } else {
                if (this.TargetThreadSystemId != systemThreadId) {
                    this.TargetThreadSystemId = systemThreadId;
                    uint engineThreadId = await this.AttemptOperation<uint>(() => this.systemObjects.GetThreadIdBySystemId(systemThreadId), String.Format("Unable to set thread ID."));
                    this.control.Execute("~" + engineThreadId + "s");
                    this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingThread);
                }
            }
        }

        public async Task<uint[]> GetCurrentProcessThreads() {
            return await this.AttemptOperation<uint[]>(() => {
                uint numThreads = this.systemObjects.NumberThreads;
                uint[] ids;
                uint[] systemIds;
                this.systemObjects.GetThreadIdsByIndex(/*start*/0, /*count*/ numThreads, out ids, out systemIds);
                return systemIds;
            }, String.Format("Unable to get thread IDs."));
        }

        public uint TargetThreadSystemId {
            get { return this.targetThreadSystemId; }
            set { this.targetThreadSystemId = value; }
        }

        public bool IsDebuggerBusy {
            get { return this.control.ExecutionStatus != DebugStatus.Break; }
        }

        public async Task WaitForBreakIn() {
            if (this.IsDebuggerBusy) {
                Console.Out.WriteLine("Debugger is busy, waiting for break in.");
                while (this.IsDebuggerBusy) {
                    this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.Waiting);
                    await Task.Delay(1000);
                }
            }
        }

        public async Task Run() {
            this.didShutdown = false;
            bool isRestarting = false;

            System.EventHandler<EngineStateChangeEventArgs> engineStateChanged = (object sender, EngineStateChangeEventArgs args) => {
                if (args.Change == EngineStateChange.EffectiveProcessor) {
                    Processor processorType = (Processor)args.Argument;
                    this.engine.IsPointer64Bit = (processorType == Processor.Amd64) || (processorType == Processor.Arm64);
                } else if (args.Change == EngineStateChange.ExecutionStatus) {
                    bool insideWait = (args.Argument & (ulong)DebugStatus.InsideWait) == (ulong)DebugStatus.InsideWait;
                    DebugStatus executionStatus = (DebugStatus)(args.Argument & (~(ulong)DebugStatus.InsideWait));
                    if (executionStatus == DebugStatus.RestartTarget) {
                        isRestarting = true;
                    } else if (executionStatus == DebugStatus.NoDebuggee) {
                        this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.Detaching);
                        this.engine.DiaLoader.ClearSymbols();
                        if (isRestarting) {
                            isRestarting = false;
                        } else {
                            Task shutdownTask = this.Shutdown();
                        }
                    } else if (executionStatus == DebugStatus.Break) {
                        if (!insideWait) {
                            this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.Break);
                        }
                    }
                }
            };

            this.client.EngineStateChanged += engineStateChanged;

            while (!this.isShuttingDown) {
                try {
                    uint currentProcessSystemId = await this.AttemptOperation<uint>(() => this.systemObjects.CurrentProcessSystemId, String.Format("Unable to retrieve the current process system ID."));
                    uint currentThreadSystemId = await this.AttemptOperation<uint>(() => this.systemObjects.CurrentThreadSystemId, String.Format("Unable to retrieve the current thread system ID."));
                    if (this.TargetProcessSystemId == 0) {
                        this.TargetProcessSystemId = currentProcessSystemId;
                        if (this.TargetProcessSystemId != 0) {
                            this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingProcess);
                        }
                    } else if (this.TargetProcessSystemId != currentProcessSystemId) {
                        this.TargetProcessSystemId = currentProcessSystemId;
                        this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingProcess);
                    } else if (this.TargetThreadSystemId != currentThreadSystemId) {
                        this.TargetThreadSystemId = currentThreadSystemId;
                        this.engine.NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus.ChangingThread);
                    }

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

        public async Task<T> AttemptOperation<T>(Func<T> operation, string errorMessage) {
            do {
                try {
                    return operation();
                } catch (InvalidOperationException) {
                    // retry after waiting for break-in
                } catch (DebuggerException) {
                    throw;
                } catch {
                    throw new DebuggerException(errorMessage);
                }

                await this.WaitForBreakIn();
            } while (true);
        }

        public async Task Shutdown() {
            if (!this.didShutdown) {
                this.isShuttingDown = true;

                // Wait for "Run" to finish.
                while (this.isShuttingDown) {
                    await Task.Yield();
                }
            }
        }

        private Microsoft.Debuggers.DbgEng.DebugClient client;
        private Microsoft.Debuggers.DbgEng.DebugControl control;
        private Microsoft.Debuggers.DbgEng.DebugDataSpaces dataSpaces;
        private Microsoft.Debuggers.DbgEng.DebugSystemObjects systemObjects;
        private DebuggerEngine engine;
        private DiaDebugger debugger;
        private SymbolCache symbolCache;
        private DiaSessionLoader diaLoader;
        private uint targetProcessSystemId;  // process being actively debugged
        private uint targetThreadSystemId;  // thread being actively debugged
        private bool isShuttingDown;
        private bool didShutdown;
    }
}
