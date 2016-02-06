using System;
using System.IO;
using System.Linq;
using System.Threading;

namespace DeployJsDbg {
    class Program {
        static void Main(string[] args) {
            if (args.Length < 2) {
                Console.WriteLine("usage: {0} [repository root] [deployment target]", System.AppDomain.CurrentDomain.FriendlyName);
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            var repositoryRoot = args[0];
            var deploymentTarget = args[1];

            // Figure out the version.
            var versionPrefix = DateTime.Now.ToString("yyyy-MM-dd");
            var currentSuffix = 1;
            while (File.Exists(Path.Combine(deploymentTarget, ComputeZipFileName(versionPrefix, currentSuffix)))) {
                ++currentSuffix;
            }
            var version = ComputeZipFileName(versionPrefix, currentSuffix);

            // Assemble the package.
            var temporaryPath = Path.Combine(Path.GetTempPath(), "jsdbg-deploy");
            if (Directory.Exists(temporaryPath)) {
                Directory.Delete(temporaryPath, recursive: true);

                // Cheesy sleep to avoid race condition with delete.
                Thread.Sleep(500);
            }

            Directory.CreateDirectory(temporaryPath);

            // Copy the extensions directory.
            CopyDirectory(Path.Combine(repositoryRoot, "extensions"), Path.Combine(temporaryPath, "support", "extensions"));

            // Copy wwwroot.
            CopyDirectory(Path.Combine(repositoryRoot, "wwwroot"), Path.Combine(temporaryPath, "support", "wwwroot"));

            // Copy the deployment configuration.json.
            File.Copy(Path.Combine(repositoryRoot, "js-dbgeng", "configurations", "deployment.json"), Path.Combine(temporaryPath, "configuration.json"));

            // Copy the JsDbg binaries.
            string binaryPath = Path.Combine(repositoryRoot, "js-dbgeng", "js-dbgeng", "bin", "x86", "Release");
            var binaryDirectory = new DirectoryInfo(binaryPath);
            foreach (var file in binaryDirectory.GetFiles("*.dll").Concat(binaryDirectory.GetFiles("JsDbg.exe"))) {
                File.Copy(file.FullName, Path.Combine(temporaryPath, file.Name));
            }

            // Copy the DIA DLL.
            File.Copy(Path.Combine(repositoryRoot, "js-dbgeng", "references", "msdia110.dll"), Path.Combine(temporaryPath, "support", "msdia110.dll"));

            // Zip it up.
            var temporaryZipPath = Path.Combine(Path.GetDirectoryName(temporaryPath), version);
            if (File.Exists(temporaryZipPath)) {
                File.Delete(temporaryZipPath);
            }
            System.IO.Compression.ZipFile.CreateFromDirectory(temporaryPath, temporaryZipPath, System.IO.Compression.CompressionLevel.Optimal, includeBaseDirectory: false);

            // Deploy it.
            File.Copy(temporaryZipPath, Path.Combine(deploymentTarget, version));

            Console.WriteLine("Deployed to {0}", Path.Combine(deploymentTarget, version));
        }

        static string ComputeZipFileName(string prefix, int suffix) {
            return string.Format("{0}-{1:00}.zip", prefix, suffix);
        }

        // From https://msdn.microsoft.com/en-us/library/bb762914(v=vs.110).aspx
        private static void CopyDirectory(string sourceDirectory, string destinationDirectory) {
            // Get the subdirectories for the specified directory.
            DirectoryInfo dir = new DirectoryInfo(sourceDirectory);

            if (!dir.Exists) {
                throw new DirectoryNotFoundException(
                    "Source directory does not exist or could not be found: "
                    + sourceDirectory);
            }

            DirectoryInfo[] dirs = dir.GetDirectories();
            // If the destination directory doesn't exist, create it.
            if (!Directory.Exists(destinationDirectory)) {
                Directory.CreateDirectory(destinationDirectory);
            }

            // Get the files in the directory and copy them to the new location.
            FileInfo[] files = dir.GetFiles();
            foreach (FileInfo file in files) {
                string temppath = Path.Combine(destinationDirectory, file.Name);
                file.CopyTo(temppath, false);
            }

            // Copy the subdirectories and their contents to new location.
            foreach (DirectoryInfo subdir in dirs) {
                string temppath = Path.Combine(destinationDirectory, subdir.Name);
                CopyDirectory(subdir.FullName, temppath);
            }
        }

    }
}
