using System;
using System.IO;

namespace JsDbg.VisualStudio {
    class JumpConfiguration : Core.IConfiguration {
        internal static JumpConfiguration Load() {
            return new JumpConfiguration();
        }

        public string ExtensionRoot {
            get {
                // TODO: Figure out configuration story for Jump.
                return @"C:\jsdbg\extensions";
            }
        }
        public string PersistentStoreDirectory {
            get {
                return @"C:\jsdbg\persistent";
            }
        }

        public string LocalSupportDirectory {
            get {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "JsDbg", "support");
            }
        }
    }
}
