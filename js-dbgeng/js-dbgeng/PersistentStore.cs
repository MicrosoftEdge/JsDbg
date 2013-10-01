using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.IO;

namespace JsDbg {
    internal class PersistentStore {
        private static Encoding Encoding {
            get { return Encoding.UTF8; }
        }

        internal PersistentStore(string location) {
            this.location = location;
        }

        private string GetPath(string user) {
            if (user == null) {
                user = System.Environment.UserDomainName + "." + System.Environment.UserName;
            }
            return Path.Combine(this.location, user);
        }

        internal string Get(string user) {
            string path = this.GetPath(user);

            if (File.Exists(path)) {
                return File.ReadAllText(path, PersistentStore.Encoding);
            } else {
                return "{}";
            }
        }

        internal void Set(string value) {
            string path = this.GetPath(/*user*/null);
            File.WriteAllText(path, value, PersistentStore.Encoding);
        }

        internal string[] GetUsers() {
            string[] paths = Directory.GetFiles(this.location);

            // Instead of paths, we just want the filenames.
            for (int i = 0; i < paths.Length; ++i) {
                paths[i] = Path.GetFileName(paths[i]);
            }

            return paths;
        }

        private string location;
    }
}
