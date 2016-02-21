using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace JsDbg {
    [DataContract]
    class JsDbgConfiguration : Core.IConfiguration {
        [DataMember(IsRequired=true)]
        public string extension_root {
            get { return this._extension_root; }
            set { this._extension_root = value; }
        }

        [DataMember(IsRequired = true)]
        public string persistent_store_directory {
            get { return this._persistent_store_directory; }
            set { this._persistent_store_directory = value; }
        }

        internal static JsDbgConfiguration Load() {
            string assemblyPath = System.Reflection.Assembly.GetExecutingAssembly().Location;
            string configurationPath = Path.Combine(Path.GetDirectoryName(assemblyPath), "configuration.json");
            using (FileStream file = new FileStream(configurationPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
                return (JsDbgConfiguration)ConfigurationSerializer.ReadObject(file);
            }
        }

        public string ExtensionRoot {
            get {
                return Path.GetFullPath(this.extension_root);
            }
        }
        public string PersistentStoreDirectory {
            get {
                return Path.GetFullPath(this.persistent_store_directory);
            }
        }

        public string LocalSupportDirectory {
            get {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "JsDbg", "support");
            }
        }

        public static string Schema {
            get {
                return @"{
    ""extension_root"": ""\path\to\extensions"",
    ""persistent_store_directory"": ""\path\to\persistent\store""
}";
            }
        }

        private static DataContractJsonSerializer ConfigurationSerializer = new DataContractJsonSerializer(typeof(JsDbgConfiguration));

        private string _extension_root;
        private string _persistent_store_directory;
    }
}
