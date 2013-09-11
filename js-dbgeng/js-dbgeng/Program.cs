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
        private const string Version = "2013-09-11-01";

        [STAThread]
        static int Main(string[] args) {
            string remoteString;
            if (args.Length < 1 || args[0] == "/ask") {
                // A debugger string wasn't specified.  Prompt for a debug string instead.
                Console.Write("Please specify a debug remote string (e.g. npipe:Pipe=foo;Server=bar):");
                remoteString = Console.ReadLine();

                if (remoteString.StartsWith("-remote ")) {
                    remoteString = remoteString.Substring("-remote ".Length);
                }

                if (remoteString.Trim().Length == 0) {
                    return -1;
                }
            } else {
                remoteString = args[0];
            }

            string path;
            if (args.Length > 1) {
                path = args[1];
            } else {
                path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "JsDbg", "support", Version);

                if (!Directory.Exists(path)) {
                    string supportDirectory = Path.Combine(@"\\iefs\users\psalas\jsdbg\support\", Version);
                    Console.Out.WriteLine("Installing support files from {0} to {1}", supportDirectory, path);
                    DirectoryCopy(supportDirectory, path, /*copySubDirs*/true);
                }
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

            Console.Out.WriteLine("Serving from {0}", path);
            using (WebServer webServer = new WebServer(debugger, path)) {
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
