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
        public string support_directory {
            get { return this._support_directory; }
            set { this._support_directory = value; }
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

        public string SharedSupportDirectory {
            get {
                return this.support_directory;
            }
        }
        public string PersistentStoreDirectory {
            get {
                return this.persistent_store_directory;
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
    ""support_directory"": ""\path\to\support"",
    ""persistent_store_directory"": ""\path\to\persistent\store""
}";
            }
        }

        private static DataContractJsonSerializer ConfigurationSerializer = new DataContractJsonSerializer(typeof(JsDbgConfiguration));

        private string _support_directory;
        private string _persistent_store_directory;
    }
}
