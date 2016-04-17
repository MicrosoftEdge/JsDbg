using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace JsDbg.WinDbg {
    [DataContract]
    class Configuration : Core.IConfiguration {
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

        internal static Configuration Load() {
            string assemblyPath = System.Reflection.Assembly.GetExecutingAssembly().Location;
            string configurationPath = Path.Combine(Path.GetDirectoryName(assemblyPath), "configuration.json");
            using (FileStream file = new FileStream(configurationPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
                return (Configuration)ConfigurationSerializer.ReadObject(file);
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

        private static DataContractJsonSerializer ConfigurationSerializer = new DataContractJsonSerializer(typeof(Configuration));

        private string _extension_root;
        private string _persistent_store_directory;
    }
}
