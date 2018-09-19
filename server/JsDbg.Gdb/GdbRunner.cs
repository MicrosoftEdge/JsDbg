using System;
using System.Diagnostics;
using System.Threading.Tasks;
using JsDbg.Core;

namespace JsDbg.Gdb {
    class GdbRunner : IDisposable {
        public GdbRunner() {
            ProcessStartInfo gdbStartInfo = new ProcessStartInfo();
            gdbStartInfo.UseShellExecute = false;
            gdbStartInfo.RedirectStandardOutput = true;
            gdbStartInfo.RedirectStandardInput = true;
            gdbStartInfo.RedirectStandardError = true;
            gdbStartInfo.FileName = "gdb";
            gdbStartInfo.Arguments = "--interpreter";

            this.gdbProc = new Process();
            gdbProc.StartInfo = gdbStartInfo;

            gdbProc.OutputDataReceived += new DataReceivedEventHandler((sender, e) =>
            {
                Console.WriteLine("gdb> " + e.Data);
            });
            gdbProc.ErrorDataReceived += new DataReceivedEventHandler((sender, e) =>
            {
                Console.WriteLine("gdb! " + e.Data);
            });
            
            this.debugger = new GdbDebugger(gdbProc);
        }

        public IDebugger Debugger {
            get { return this.debugger; }
        }

        public void Dispose() {}
        
        public async Task Run() {
            this.gdbProc.Start();
        }

        public async Task Shutdown() {
            this.gdbProc.Kill();
        }

        public IDebugger debugger;
        public Process gdbProc;
    }
}