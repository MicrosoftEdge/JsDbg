using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using JsDbg.Core.Xplat;
using JsDbg.Utilities;

namespace JsDbg.Gdb
{
    class Program
    {
        static void Main(string[] args)
        {
            GdbRunner runner = new GdbRunner();
            PersistentStore persistentStore = new PersistentStore("~/.jsdbg");
            UserFeedback userFeedback = new UserFeedback(Path.Combine("~/.jsdbg", "feedback"));

            using (WebServer webServer = new WebServer(runner.debugger, persistentStore, userFeedback, "/mnt/e/projects/chakra/jsdbg/extensions")) {
                webServer.LoadExtension("default");

                SynchronizationContext previousContext = SynchronizationContext.Current;
                try {
                    SingleThreadSynchronizationContext syncContext = new SingleThreadSynchronizationContext();
                    SynchronizationContext.SetSynchronizationContext(syncContext);

                    // Run the debugger.  If the debugger ends, kill the web server.
                    runner.Run().ContinueWith((Task result) => {
                        webServer.Abort();
                    });

                    // The web server ending kills the debugger and completes our SynchronizationContext which allows us to exit.
                    webServer.Listen().ContinueWith(async (Task result) => {
                        await runner.Shutdown();
                        await Task.Delay(500);
                        syncContext.Complete();
                    });

                    // Pressing ctrl-c kills the web server.
                    Task.Run(() => ReadInputUntilAbort(webServer.Url, runner.debugger)).ContinueWith((Task result) => {
                        Console.WriteLine("Shutting down...");
                        webServer.Abort();
                    });

                    // Process requests until the web server is taken down.
                    syncContext.RunOnCurrentThread();
                } catch (Exception ex) {
                    Console.WriteLine("Shutting down due to exception: {0}\n{1}", ex.Message, ex.StackTrace);
                } finally {
                    SynchronizationContext.SetSynchronizationContext(previousContext);
                }
            }
        }

        private static void ReadInputUntilAbort(string url, GdbDebugger debugger) {
            do {
                string input = Console.ReadLine();
                if (input == null) { 
                    return;
                }

                debugger.DebuggerUserInput(input);
                
            } while (true);
        }
    }
}
