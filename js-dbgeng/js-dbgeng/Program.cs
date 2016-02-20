using System;

using Microsoft.Debuggers.DbgEng;
using System.Threading;
using System.Threading.Tasks;
using System.IO;

namespace JsDbg {
    public class Program {      

        [STAThread]
        static int Main(string[] args) {
            JsDbgConfiguration configuration = null;
            try {
                configuration = JsDbgConfiguration.Load();
            } catch {
                Console.WriteLine("The configuration.json file could not be read.  Please ensure that it is present in\n\n    {1}\n\nand has the following schema:\n\n{0}\n", JsDbgConfiguration.Schema, Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location));
                Console.Write("Press any key to exit...");
                Console.ReadKey();
                return -1;
            }

            string remoteString;
            if (args.Length < 1 || args[0] == "/ask") {
                // A debugger string wasn't specified.  Prompt for a debug string instead.
                Console.Write("Please specify a debug remote string (e.g. npipe:Pipe=foo,Server=bar):");
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

            WinDbgDebuggerRunner runner;
            try {
                Console.Write("Connecting to a debug session at {0}...", remoteString);
                runner = new WinDbgDebuggerRunner(remoteString, configuration);
                Console.WriteLine("Connected.");
            } catch (Exception ex) {
                Console.WriteLine("Failed: {0}", ex.Message);
                Console.Write("Press any key to exit...");
                Console.ReadKey();
                return -1;
            }

            string extensionRoot = System.IO.Path.Combine(configuration.SharedSupportDirectory, "extensions");
            PersistentStore persistentStore = new PersistentStore(configuration.PersistentStoreDirectory);
            UserFeedback userFeedback = new UserFeedback(Path.Combine(configuration.PersistentStoreDirectory, "feedback"));

            using (WebServer webServer = new WebServer(runner.Debugger, persistentStore, userFeedback, extensionRoot)) {
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

                    Core.BrowserLauncher.Launch(webServer.Url);

                    // Pressing ctrl-c kills the web server.
                    Task.Run(() => ReadKeysUntilAbort(webServer.Url)).ContinueWith((Task result) => {
                        Console.WriteLine("Shutting down...");
                        webServer.Abort();
                    });

                    // Process requests until the web server is taken down.
                    syncContext.RunOnCurrentThread();
                } finally {
                    SynchronizationContext.SetSynchronizationContext(previousContext);
                }
            }

            return 0;
        }

        static void ReadKeysUntilAbort(string url) {
            System.Console.TreatControlCAsInput = true;
            Console.WriteLine("Press enter to launch a browser or ctrl-c to shutdown.");
            do {
                ConsoleKeyInfo key = Console.ReadKey(/*intercept*/true);
                if (key.Key == ConsoleKey.Enter) {
                    Core.BrowserLauncher.Launch(url);
                } else if ((key.Modifiers & ConsoleModifiers.Control) == ConsoleModifiers.Control && key.Key == ConsoleKey.C) {
                    return;
                }
                // Otherwise keep going.
            } while (true);
        }
    }
}
