using System;
using System.Diagnostics;
using System.Threading.Tasks;
using JsDbg.Core.Xplat;

namespace JsDbg.Gdb {
    class GdbRunner : IDisposable {
        public GdbRunner() {
            this.debugger = new GdbDebugger();
        }

        public GdbDebugger Debugger {
            get { return this.debugger; }
        }

        public void Dispose() {}
        
        public async Task Run() {
            this.debugger.Initialize();
            await this.debugger.Run();
        }

        public async Task Shutdown() {
            // TODO: close stdin/stdout to cause the Run method to terminate?
        }

        public GdbDebugger debugger;
        public Process gdbProc;
    }
}