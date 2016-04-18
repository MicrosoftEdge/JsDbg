using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;
using JsDbg.Dia.WinDbg;
using JsDbg.Core;

namespace JsDbg.WinDbg {
    class DebuggerRunner : IDisposable {
        public DebuggerRunner(string connectionString, Core.IConfiguration configuration) {
            this.client = new DebugClient(connectionString);
            this.control = new DebugControl(this.client);
            this.symbolCache = new SymbolCache(this.client);
            this.dataSpaces = new DebugDataSpaces(this.client);
            this.diaLoader = new Dia.DiaSessionLoader(
                configuration,
                new Dia.IDiaSessionSource[] { new DiaSessionPathSource(this, this.symbolCache), new DiaSessionModuleSource(this, this.symbolCache, this.dataSpaces) }
            );
            this.isShuttingDown = false;
            this.didShutdown = true;
            this.engine = new DebuggerEngine(this, this.client, this.control, this.diaLoader);
            this.debugger = new Core.TypeCacheDebugger(this.engine);
        }

        public void Dispose() {
            this.client.Dispose();
            this.symbolCache.Dispose();
            this.dataSpaces.Dispose();
            this.debugger.Dispose();
        }

        public IDebugger Debugger {
            get { return this.debugger; }
        }

        public async Task WaitForBreakIn() {
            if (this.control.ExecutionStatus != DebugStatus.Break) {
                Console.Out.WriteLine("Debugger is busy, waiting for break in.");
                while (this.control.ExecutionStatus != DebugStatus.Break) {
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
                        if (isRestarting) {
                            isRestarting = false;
                            Console.Out.WriteLine("Process is restarting.");
                        } else {
                            Console.Out.WriteLine("Debugger has no target, shutting down.");
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
        private DebuggerEngine engine;
        private TypeCacheDebugger debugger;
        private SymbolCache symbolCache;
        private Dia.DiaSessionLoader diaLoader;
        private bool isShuttingDown;
        private bool didShutdown;
    }
}
