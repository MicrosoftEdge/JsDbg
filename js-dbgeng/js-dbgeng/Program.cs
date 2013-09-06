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
using System.IO;

namespace JsDbg {
    public class Program {
        [STAThread]
        static int Main(string[] args) {
            if (args.Length < 2) {
                Console.Error.WriteLine("usage: {0} [remote debugger string] [port] [optional: path to serve]", System.AppDomain.CurrentDomain.FriendlyName);
                return -1;
            }

            string remoteString = args[0];

            int port = Int32.Parse(args[1]);

            string path;
            if (args.Length > 2) {
                path = args[2];
            } else {
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                path = Path.Combine(appData, "JsDbg", "web");

                if (!Directory.Exists(path)) {
                    string supportDirectory = @"\\iefs\users\psalas\jsdbg\support\latest";
                    Console.Out.WriteLine("Installing support files from {0} to {1}", supportDirectory, path);
                    DirectoryCopy(supportDirectory, path, /*copySubDirs*/true);
                }
            }
            Console.Out.WriteLine("Serving from {0}", path);

            Debugger debugger = new Debugger(remoteString);
            using (WebServer webServer = new WebServer(debugger, port, path)) {
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

                    // Launch the browser.
                    System.Diagnostics.Process.Start(webServer.Url);

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

        // from: http://msdn.microsoft.com/en-us/library/bb762914.aspx
        private static void DirectoryCopy(string sourceDirName, string destDirName, bool copySubDirs) {
            // Get the subdirectories for the specified directory.
            DirectoryInfo dir = new DirectoryInfo(sourceDirName);
            DirectoryInfo[] dirs = dir.GetDirectories();

            if (!dir.Exists) {
                throw new DirectoryNotFoundException(
                    "Source directory does not exist or could not be found: "
                    + sourceDirName);
            }

            // If the destination directory doesn't exist, create it. 
            if (!Directory.Exists(destDirName)) {
                Directory.CreateDirectory(destDirName);
            }

            // Get the files in the directory and copy them to the new location.
            FileInfo[] files = dir.GetFiles();
            foreach (FileInfo file in files) {
                string temppath = Path.Combine(destDirName, file.Name);
                file.CopyTo(temppath, false);
            }

            // If copying subdirectories, copy them and their contents to new location. 
            if (copySubDirs) {
                foreach (DirectoryInfo subdir in dirs) {
                    string temppath = Path.Combine(destDirName, subdir.Name);
                    DirectoryCopy(subdir.FullName, temppath, copySubDirs);
                }
            }
        }

    }
}
