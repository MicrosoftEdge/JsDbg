using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

namespace JsDbg.Core.Xplat {
    internal class FileCache {
        internal FileCache() {
            this.cachedFiles = new Dictionary<string, string>();
            this.lastFlushDate = DateTime.Now;
        }

        internal Stream ReadFile(string path) {
            // Flush the cache every hour for the scenario where JsDbg is left open overnight etc.
            if ((DateTime.Now - this.lastFlushDate).TotalSeconds > 3600) {
                this.lastFlushDate = DateTime.Now;
                this.cachedFiles = new Dictionary<string, string>();
            }

            return File.OpenRead(path);
        }

        private DateTime lastFlushDate;
        private Dictionary<string, string> cachedFiles;
    }
}
