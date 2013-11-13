using System;

using Microsoft.Debuggers.DbgEng;
using System.Threading;
using System.Threading.Tasks;
using System.IO;

namespace JsDbg {
    public class Program {      

        [STAThread]
        static int Main(string[] args) {
            string remoteString;
            if (args.Length < 1 || args[0] == "/ask") {
                // A debugger string wasn't specified.  Prompt for a debug string instead.
                Console.Write("Please specify a debug remote string (e.g. npipe:Pipe=foo;Server=bar):");
                remoteString = Console.ReadLine().Trim();

                if (remoteString.StartsWith("-remote ")) {
                    remoteString = remoteString.Substring("-remote ".Length).Trim();
                }

                if (remoteString.Length == 0) {
                    return -1;
                }
            } else {
                remoteString = args[0];
            }

            string path;
            if (args.Length > 1) {
                path = args[1];
            } else {
                path = WebServer.SharedSupportDirectory;
            }

            Debugger debugger;
            try {
                Console.Write("Connecting to a debug session at {0}...", remoteString);
                debugger = new Debugger(remoteString);
                Console.WriteLine("Connected.");
            } catch (Exception ex) {
                Console.WriteLine("Failed: {0}", ex.Message);
                Console.Write("Press any key to exit...");
                Console.ReadKey();
                return -1;
            }

            string webRoot = System.IO.Path.Combine(path, "wwwroot");
            string extensionRoot = System.IO.Path.Combine(path, "extensions");
            PersistentStore persistentStore = new PersistentStore(WebServer.PersistentStoreDirectory);

            Console.Out.WriteLine("Serving from {0}", webRoot);
            using (WebServer webServer = new WebServer(debugger, persistentStore, webRoot, extensionRoot)) {
                webServer.LoadExtension("default");

                SynchronizationContext previousContext = SynchronizationContext.Current;
                try {
                    SingleThreadSynchronizationContext syncContext = new SingleThreadSynchronizationContext();
                    SynchronizationContext.SetSynchronizationContext(syncContext);

                    System.Console.TreatControlCAsInput = true;

                    // Run the debugger.  If the debugger ends, kill the web server.
                    debugger.Run().ContinueWith((Task result) => { 
                        webServer.Abort();
                    });

                    // Pressing enter kills the web server.
                    Task.Run(() => ReadKeyUntilEnter()).ContinueWith((Task result) => {
                        Console.WriteLine("Shutting down...");
                        webServer.Abort();
                    });

                    // The web server ending kills the debugger and completes our SynchronizationContext which allows us to exit.
                    webServer.Listen().ContinueWith(async (Task result) => {
                        await debugger.Shutdown();
                        await Task.Yield();
                        syncContext.Complete();
                    });

                    Console.WriteLine("Press enter or ctrl-c to stop.");

                    // Process requests until the web server is taken down.
                    syncContext.RunOnCurrentThread();
                } finally {
                    SynchronizationContext.SetSynchronizationContext(previousContext);
                }
            }

            return 0;
        }

        static void ReadKeyUntilEnter() {
            do {
                ConsoleKeyInfo key = Console.ReadKey(/*intercept*/true);
                if (key.Key == ConsoleKey.Enter || ((key.Modifiers & ConsoleModifiers.Control) == ConsoleModifiers.Control && key.Key == ConsoleKey.C)) {
                    return;
                }
                // Otherwise keep going.
            } while (true);
        }
    }
}
