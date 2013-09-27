using System;

using Microsoft.Debuggers.DbgEng;
using System.Threading;
using System.Threading.Tasks;
using System.IO;

namespace JsDbg {
    public class Program {
        private const string Version = "2013-09-27-01";

        static internal string SupportDirectory {
            get {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "JsDbg", "support", Version);
            }
        }

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


            if (!Directory.Exists(Program.SupportDirectory)) {
                string supportDirectory = Path.Combine(@"\\iefs\users\psalas\jsdbg\support\", Version);
                Console.Out.WriteLine("Installing support files from {0} to {1}", supportDirectory, Program.SupportDirectory);
                DirectoryCopy(supportDirectory, Program.SupportDirectory, /*copySubDirs*/true);
            }

            string path;
            if (args.Length > 1) {
                path = args[1];
            } else {
                path = Program.SupportDirectory;
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
            Console.Out.WriteLine("Serving from {0}", webRoot);
            using (WebServer webServer = new WebServer(debugger, webRoot, extensionRoot)) {
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
