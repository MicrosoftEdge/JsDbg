//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Threading;
using System.Threading.Tasks;
using System.IO;
using JsDbg.Core;
using JsDbg.Utilities;
using JsDbg.Windows;

namespace JsDbg.WinDbg {
    public class Program {

        [STAThread]
        static int Main(string[] args) {
            Configuration configuration = null;
            try {
                configuration = Configuration.Load();
            } catch {
                Console.WriteLine("The configuration.json file could not be read.  Please ensure that it is present in\n\n    {1}\n\nand has the following schema:\n\n{0}\n", Configuration.Schema, Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location));
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

            DebuggerRunner runner;
            try {
                Console.Write("Connecting to a debug session at {0}...", remoteString);
                runner = new DebuggerRunner(remoteString);
                Console.WriteLine("Connected.");
            } catch (Exception ex) {
                Console.WriteLine("Failed: {0}", ex.Message);
                Console.Write("Press any key to exit...");
                Console.ReadKey();
                return -1;
            }

            PersistentStore persistentStore = new PersistentStore();
            using (WebServer webServer = new WebServer(runner.Debugger, persistentStore, configuration.ExtensionRoot)) {
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

                    JsDbg.Remoting.RemotingServer.RegisterNewInstance(remoteString, () => { BrowserLauncher.Launch(webServer.Url); });

                    BrowserLauncher.Launch(webServer.Url);

                    // Pressing ctrl-c kills the web server.
                    Task.Run(() => ReadKeysUntilAbort(webServer.Url)).ContinueWith((Task result) => {
                        Console.WriteLine("Shutting down...");
                        webServer.Abort();
                    });

                    // Process requests until the web server is taken down.
                    syncContext.RunOnCurrentThread();
                } catch (Exception ex) {
                    Console.WriteLine("Shutting down due to exception: {0}", ex.Message);
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
                    BrowserLauncher.Launch(url);
                } else if ((key.Modifiers & ConsoleModifiers.Control) == ConsoleModifiers.Control && key.Key == ConsoleKey.C) {
                    return;
                }
                // Otherwise keep going.
            } while (true);
        }
    }
}
