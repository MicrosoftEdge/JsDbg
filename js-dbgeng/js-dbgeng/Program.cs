//----------------------------------------------------------------------------
//
// Example of how to connect to a debugger server and execute
// a command when the server is broken in.
//
// Copyright (C) Microsoft Corporation, 2005.
//
//----------------------------------------------------------------------------

using System;

using Microsoft.Debuggers.DbgEng;
using System.Threading;
using System.Threading.Tasks;

namespace JsDbg {
    public class Program {
        [STAThread]
        static int Main(string[] args) {
            Debugger debugger = new Debugger(args[0]);
            using (WebServer webServer = new WebServer(debugger)) {
                SynchronizationContext previousContext = SynchronizationContext.Current;
                try {
                    SingleThreadSynchronizationContext syncContext = new SingleThreadSynchronizationContext();
                    SynchronizationContext.SetSynchronizationContext(syncContext);

                    System.Console.TreatControlCAsInput = true;

                    Task readlineTask = Task.Run(() => ReadKeyUntilEnter());
                    
                    // Pressing enter kills the web server.
                    readlineTask.ContinueWith((Task result) => {
                        Console.WriteLine("Shutting down...");
                        webServer.Abort();
                    });

                    Task webServerTask = webServer.Listen();

                    // The web server ending completes our SynchronizationContext which allows us to exit.
                    webServerTask.ContinueWith((Task result) => { syncContext.Complete(); });

                    Console.WriteLine("Press enter or ctrl-c to stop.");

                    // Process requests until we're done.
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
