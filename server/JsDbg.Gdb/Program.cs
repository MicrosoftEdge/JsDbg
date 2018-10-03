using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using JsDbg.Core;
using JsDbg.Utilities;

namespace JsDbg.Gdb
{
    class Program
    {
        static void Main(string[] args)
        {
            // Inversion of control: Assume that this process has been started by python, stdio talks back to python and can ask it to do things.
            GdbRunner runner = new GdbRunner();
            
            PersistentStore persistentStore = new PersistentStore("~/.jsdbg"); // TODO: sort this out based on config / arguments
            UserFeedback userFeedback = new UserFeedback(Path.Combine("~/.jsdbg", "feedback"));

            string extensionPath = "/mnt/e/projects/chakra/jsdbg/extensions"; // TODO: have python pass its script directory and require jsdbg extension data is at known offset?
            using (WebServer webServer = new WebServer(runner.debugger, persistentStore, userFeedback, extensionPath)) {
                webServer.LoadExtension("default");

                try {
                    // The web server ending kills the debugger and completes our SynchronizationContext which allows us to exit.
                    webServer.Listen().ContinueWith(async (Task result) => {
                        await runner.Shutdown();
                        await Task.Delay(500);
                    });

                    // Run the debugger.  If the debugger ends, kill the web server.
                    runner.Run().ContinueWith((Task result) => {
                        webServer.Abort();
                    }).Wait();

                } catch (Exception ex) {
                    Console.WriteLine("Shutting down due to exception: {0}\n{1}", ex.Message, ex.StackTrace);
                }
            }
        }
    }
}
