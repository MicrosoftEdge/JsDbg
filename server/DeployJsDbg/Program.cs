//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.IO;
using System.Linq;
using System.Threading;

namespace JsDbg.Deployment {
    class Program {
        static void Main(string[] args) {
            if (args.Length < 2) {
                Console.WriteLine("usage: {0} [directory] [deployment target]", System.AppDomain.CurrentDomain.FriendlyName);
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            var directory = args[0];
            var deploymentTarget = args[1];

            // Figure out the version.
            var versionPrefix = DateTime.Now.ToString("yyyy-MM-dd");
            var currentSuffix = 1;
            while (File.Exists(Path.Combine(deploymentTarget, ComputeZipFileName(versionPrefix, currentSuffix)))) {
                ++currentSuffix;
            }
            var version = ComputeZipFileName(versionPrefix, currentSuffix);

            // Zip it up.
            string temporaryZipPath = Path.Combine(Path.GetTempPath(), version);
            if (File.Exists(temporaryZipPath)) {
                File.Delete(temporaryZipPath);
            }
            System.IO.Compression.ZipFile.CreateFromDirectory(directory, temporaryZipPath, System.IO.Compression.CompressionLevel.Optimal, includeBaseDirectory: false);

            // Deploy it.
            string deploymentPath = Path.Combine(deploymentTarget, version);
            File.Copy(temporaryZipPath, deploymentPath);

            Console.WriteLine("Deployed to {0}", Path.Combine(deploymentTarget, version));
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
        }

        static string ComputeZipFileName(string prefix, int suffix) {
            return string.Format("{0}-{1:00}.zip", prefix, suffix);
        }
    }
}
