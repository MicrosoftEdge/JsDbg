//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.IO;
using System.Reflection;
using System.IO.Compression;

namespace JsDbg.VisualStudio {
    static class ExtensionDirectory {
        public static string EnsureExtensionDirectory() {
            // Ensure the extensions zip file has been expanded.
            string directory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string finalLocation = Path.Combine(directory, "extensions");
            if (!Directory.Exists(finalLocation)) {
                string temporaryLocation = Path.Combine(directory, "extensions.tmp");
                try {
                    Directory.Delete(temporaryLocation, true);
                } catch { }
                ZipFile.ExtractToDirectory(Path.Combine(directory, "extensions.zip"), temporaryLocation);
                Directory.Move(temporaryLocation, finalLocation);
            }
            return finalLocation;
        }
    }
}
