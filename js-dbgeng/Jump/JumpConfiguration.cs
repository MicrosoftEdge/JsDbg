using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.IO;

namespace Sushraja.Jump {
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
