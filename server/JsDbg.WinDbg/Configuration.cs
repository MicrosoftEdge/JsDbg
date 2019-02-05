using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace JsDbg.WinDbg {
    [DataContract]
    class Configuration {
        [DataMember(IsRequired=true)]
        public string extension_root {
            get { return this._extension_root; }
            set { this._extension_root = value; }
        }

        [DataMember(IsRequired = true)]
        public string azure_user_data_read_write_function_url {
            get { return this._azure_user_data_read_write_function_url; }
            set { this._azure_user_data_read_write_function_url = value; }
        }

        [DataMember(IsRequired = true)]
        public string azure_get_users_function_url {
            get { return this._azure_get_users_function_url; }
            set { this._azure_get_users_function_url = value; }
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

        public string AzureUserDataReadWriteFunctionURL {
            get {
                return this.azure_user_data_read_write_function_url;
            }
        }

        public string AzureGetUsersFunctionURL {
            get {
                return this.azure_get_users_function_url;
            }
        }

        public static string Schema {
            get {
                return @"{
    ""extension_root"": ""\path\to\extensions""
}";
            }
        }

        private static DataContractJsonSerializer ConfigurationSerializer = new DataContractJsonSerializer(typeof(Configuration));

        private string _extension_root;
        private string _azure_user_data_read_write_function_url;
        private string _azure_get_users_function_url;
    }
}
