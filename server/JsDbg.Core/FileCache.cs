//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

namespace JsDbg.Core {
    internal class FileCache {
        internal FileCache() {
            this.cachedFiles = new Dictionary<string, string>();
            this.lastFlushDate = DateTime.Now;
        }

        [DllImport("shlwapi.dll")]
        internal static extern bool PathIsNetworkPath(string path);

        internal Stream ReadFile(string path) {
            // Flush the cache every hour for the scenario where JsDbg is left open overnight etc.
            if ((DateTime.Now - this.lastFlushDate).TotalSeconds > 3600) {
                this.lastFlushDate = DateTime.Now;
                this.cachedFiles = new Dictionary<string, string>();
            }

            if (FileCache.PathIsNetworkPath(path)) {
                if (!cachedFiles.ContainsKey(path)) {
                    cachedFiles[path] = File.ReadAllText(path);
                }

                MemoryStream stream = new MemoryStream();
                StreamWriter writer = new StreamWriter(stream);
                writer.Write(cachedFiles[path]);
                writer.Flush();
                stream.Position = 0;
                return stream;
            } else {
                return File.OpenRead(path);
            }
        }

        private DateTime lastFlushDate;
        private Dictionary<string, string> cachedFiles;
    }
}
