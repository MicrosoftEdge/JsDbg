using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace JsDbg.VisualStudio {
    [DataContract]
    class Configuration {
        internal static Configuration Load() {
            string assemblyPath = System.Reflection.Assembly.GetExecutingAssembly().Location;
            string configurationPath = Path.Combine(Path.GetDirectoryName(assemblyPath), "configuration.json");
            using (FileStream file = new FileStream(configurationPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
                Configuration configuration = (Configuration)ConfigurationSerializer.ReadObject(file);
                configuration.extensionDirectory = ExtensionDirectory.EnsureExtensionDirectory();
                return configuration;
            }
        }

        [DataMember(IsRequired = true)]
        public string azure_user_data_read_write_function_url {
            get { return this.azureUserDataReadWriteFunctionUrl; }
            set { this.azureUserDataReadWriteFunctionUrl = value; }
        }

        [DataMember(IsRequired = true)]
        public string azure_get_users_function_url {
            get { return this.azureGetUsersFunctionUrl; }
            set { this.azureGetUsersFunctionUrl = value; }
        }

        [DataMember(IsRequired = true)]
        public string azure_feedback_read_write_function_url {
            get { return this.azureFeedbackReadWriteFunctionUrl; }
            set { this.azureFeedbackReadWriteFunctionUrl = value; }
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

        public string AzureUserDataReadWriteFunctionUrl {
            get {
                return this.azure_user_data_read_write_function_url;
            }
        }

        public string AzureGetUsersFunctionUrl {
            get {
                return this.azure_get_users_function_url;
            }
        }

        public string AzureFeedbackReadWriteFunctionUrl {
            get {
                return this.azure_feedback_read_write_function_url;
            }
        }

        public string UpdateUrl {
            get {
                return this.updateUrl;
            }
        }

        private static DataContractJsonSerializer ConfigurationSerializer = new DataContractJsonSerializer(typeof(Configuration));

        private string extensionDirectory;
        private string azureUserDataReadWriteFunctionUrl;
        private string azureGetUsersFunctionUrl;
        private string azureFeedbackReadWriteFunctionUrl;
        private string updateUrl;
    }
}
