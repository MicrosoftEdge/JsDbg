using System;
using System.Diagnostics;
using System.Threading.Tasks;
using JsDbg.Core.Xplat;

namespace JsDbg.Gdb {
    class GdbRunner : IDisposable {
        public GdbRunner() {

            this.gdbProc = new Process();
            gdbProc.StartInfo.UseShellExecute = false;
            gdbProc.StartInfo.RedirectStandardOutput = true;
            gdbProc.StartInfo.RedirectStandardInput = true;
            gdbProc.StartInfo.RedirectStandardError = true;
            gdbProc.StartInfo.FileName = "gdb";
            gdbProc.StartInfo.Arguments = "--interpreter=mi";

            gdbProc.OutputDataReceived += new DataReceivedEventHandler((sender, e) =>
            {
                if (e.Data?.Length > 0 && e.Data[0] != '~') {
                    Console.WriteLine("gdb> " + e.Data);
                }
            });
            gdbProc.ErrorDataReceived += new DataReceivedEventHandler((sender, e) =>
            {
                Console.WriteLine("gdb! " + e.Data);
            });
            
            this.debugger = new GdbDebugger(gdbProc);
        }

        public GdbDebugger Debugger {
            get { return this.debugger; }
        }

        public void Dispose() {}
        
        public async Task Run() {
            Console.WriteLine("Starting GDB");
            Console.WriteLine("Start returned {0}", this.gdbProc.Start());
            this.gdbProc.BeginOutputReadLine();
            this.gdbProc.EnableRaisingEvents = true;
            this.debugger.Initialize();

            TaskCompletionSource<object> exited = new TaskCompletionSource<object>();
            this.gdbProc.Exited += (sender, args) => exited.TrySetResult(args);

            await exited.Task;
        }

        public async Task Shutdown() {
            if (!this.gdbProc.HasExited) {
                Console.WriteLine("Killing GDB");
                this.gdbProc.Kill();
            }
        }

        public GdbDebugger debugger;
        public Process gdbProc;
    }
}