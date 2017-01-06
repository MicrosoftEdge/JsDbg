using System;
using System.IO;
using System.IO.Compression;

namespace JsDbg.Launcher {
    class Program {
        static void Main(string[] args) {
            // Arguments: [package.zip] [JsDbg.exe arguments]
            if (args.Length < 1) {
                Console.WriteLine("usage: " + System.AppDomain.CurrentDomain.FriendlyName + " [package.zip]");
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            var packagePath = args[0];
            var jsDbgArgs = string.Join(" ", args, 1, args.Length - 1);
            try {
                LaunchJsDbg(packagePath, jsDbgArgs);
            } catch (Exception ex) {
                Console.WriteLine("Error: {0}", ex);
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
            }
        }

        static void LaunchJsDbg(string packagePath, string jsDbgArgs) {
            if (JsDbg.Remoting.RemotingServer.RelaunchExistingInstance(jsDbgArgs)) {
                return;
            }

            var installationDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JsDbg", "installations");
            var packageName = Path.GetFileName(packagePath);

            Directory.CreateDirectory(installationDirectory);
            CleanupInstallationDirectory(installationDirectory, packageName);

            var localPackagePath = Path.Combine(installationDirectory, packageName);
            var localInstallationDirectory = Path.Combine(installationDirectory, Path.GetFileNameWithoutExtension(packageName));
            if (!File.Exists(localPackagePath)) {
                Console.Write("Copying JsDbg package...");
                var temporaryLocalPath = localPackagePath + ".temp";

                if (!File.Exists(packagePath)) {
                    packagePath = Path.Combine(Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location), packagePath);
                }
                File.Copy(packagePath, temporaryLocalPath, overwrite: true);
                File.Move(temporaryLocalPath, localPackagePath);
                Console.WriteLine("Done.");
            }

            if (!Directory.Exists(localInstallationDirectory)) {
                Console.Write("Unzipping package...");
                var temporaryInstallationDirectory = localInstallationDirectory + "-temp";
                try {
                    if (Directory.Exists(temporaryInstallationDirectory)) {
                        Directory.Delete(temporaryInstallationDirectory, recursive: true);
                    }
                } catch {
                    // Not fatal.
                }
                ZipFile.ExtractToDirectory(localPackagePath, temporaryInstallationDirectory);
                Directory.Move(temporaryInstallationDirectory, localInstallationDirectory);
                Console.WriteLine("Done.");
            }

            Directory.SetCurrentDirectory(localInstallationDirectory);
            var jsdbgProcess = new System.Diagnostics.Process();
            jsdbgProcess.StartInfo.WorkingDirectory = localInstallationDirectory;
            jsdbgProcess.StartInfo.UseShellExecute = false; // Use the same window.
            jsdbgProcess.StartInfo.FileName = Path.Combine(localInstallationDirectory, "JsDbg.exe");
            jsdbgProcess.StartInfo.Arguments = jsDbgArgs;
            jsdbgProcess.Start();
        }

        static void CleanupInstallationDirectory(string installationDirectory, string packageName) {
            foreach (var file in Directory.GetFiles(installationDirectory)) {
                if (Path.GetFileName(file) == packageName) {
                    continue;
                }

                try {
                    File.Delete(file);
                } catch {
                    // Do nothing.
                }
            }

            foreach (var directory in Directory.GetDirectories(installationDirectory)) {
                // First try to delete the JsDbg.exe to ensure that it's not running.
                if (Path.GetFileName(directory) == Path.GetFileNameWithoutExtension(packageName)) {
                    continue;
                }

                try {
                    if (File.Exists(Path.Combine(directory, "JsDbg.exe"))) {
                        File.Delete(Path.Combine(directory, "JsDbg.exe"));
                    }
                    Directory.Delete(directory, recursive: true);
                } catch {
                    // Do nothing.
                }
            }
        }
    }
}
