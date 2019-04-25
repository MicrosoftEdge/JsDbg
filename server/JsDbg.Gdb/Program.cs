using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using JsDbg.Core;

namespace JsDbg.Gdb
{
    class Program
    {
        static void Main(string[] args) {
            if (args.Length < 1) {
                Console.Error.WriteLine("Usage: jsdbg [extensions directory]");
                return;
            }

            string extensionsDirectory = args[0];

            // Inversion of control: Assume that this process has been started by python, stdio talks back to python and can ask it to do things.
            GdbDebugger debugger = new GdbDebugger();

            PersistentStore persistentStore = new PersistentStore();

            using (WebServer webServer = new WebServer(debugger, persistentStore, extensionsDirectory)) {
                webServer.LoadExtension("default");

                try {
                    var serverTask = webServer.Listen().ContinueWith(async (Task result) => {
                        await Task.Delay(500);
                    });

                    // Run the debugger.  If the debugger ends, kill the web server.
                    debugger.Run().ContinueWith((Task result) => {
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
