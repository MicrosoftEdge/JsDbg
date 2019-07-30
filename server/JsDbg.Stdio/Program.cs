using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using JsDbg.Core;

namespace JsDbg.Stdio
{
    class Program
    {
        static void Main(string[] args) {
            if (args.Length < 1) {
                Console.Error.WriteLine("Usage: jsdbg [extensions directory]");
                return;
            }

            string extensionsDirectory = args[0];

            // This process has been started by python, stdio talks back to python and asks it
            // to look up type data, read memory, etc. It also receives events from Python
            // (e.g. program hit a break point).
            StdioDebugger debugger = new StdioDebugger();

            PersistentStore persistentStore = new PersistentStore();

            using (WebServer webServer = new WebServer(debugger, persistentStore, extensionsDirectory)) {
                // Turn off printing of debugger messages, because they fill up the gdb console too quick.
                webServer.PrintDebuggerMessages = false;
                webServer.LoadExtension("default");

                try {
                    // Because Ctrl+C is used by GDB to break into the program,
                    // we should not exit the server when that happens.
                    Console.CancelKeyPress += (sender, eventArgs) => { eventArgs.Cancel = true; };

                    var serverTask = webServer.Listen().ContinueWith(async (Task result) => {
                        await Task.Delay(500);
                    });

                    // Run the debugger.  If the debugger ends, kill the web server.
                    debugger.Run(webServer.Url).ContinueWith((Task result) => {
                        webServer.Abort();
                    });

                    serverTask.Wait();
                } catch (Exception ex) {
                    Console.Error.WriteLine("Shutting down due to exception: {0}\n{1}", ex.Message, ex.StackTrace);
                }
            }
        }
    }
}
