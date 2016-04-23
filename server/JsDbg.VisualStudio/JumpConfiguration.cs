using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace JsDbg.VisualStudio {
    [DataContract]
    class JumpConfiguration : Core.IConfiguration {
        internal static JumpConfiguration Load() {
            string assemblyPath = System.Reflection.Assembly.GetExecutingAssembly().Location;
            string configurationPath = Path.Combine(Path.GetDirectoryName(assemblyPath), "configuration.json");
            using (FileStream file = new FileStream(configurationPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
                JumpConfiguration configuration = (JumpConfiguration)ConfigurationSerializer.ReadObject(file);
                configuration.extensionDirectory = ExtensionDirectory.EnsureExtensionDirectory();
                return configuration;
            }
        }

        [DataMember(IsRequired = true)]
        public string persistent_store_directory {
            get { return this.persistentStoreDirectory; }
            set { this.persistentStoreDirectory = value; }
        }

        [DataMember(IsRequired = true)]
        public string update_url {
            get { return this.updateUrl; }
            set { this.updateUrl = value; }
        }

        public string ExtensionRoot {
            get {
                return this.extensionDirectory;
            }
        }
        public string PersistentStoreDirectory {
            get {
                return this.persistentStoreDirectory;
            }
        }

        public string UpdateUrl {
            get {
                return this.updateUrl;
            }
        }

        private static DataContractJsonSerializer ConfigurationSerializer = new DataContractJsonSerializer(typeof(JumpConfiguration));

        private string extensionDirectory;
        private string persistentStoreDirectory;
        private string updateUrl;
    }
}
