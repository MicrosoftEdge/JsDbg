//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

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
        public string update_url {
            get { return this.updateUrl; }
            set { this.updateUrl = value; }
        }

        public string ExtensionRoot {
            get {
                return this.extensionDirectory;
            }
        }

        public string UpdateUrl {
            get {
                return this.updateUrl;
            }
        }

        private static DataContractJsonSerializer ConfigurationSerializer = new DataContractJsonSerializer(typeof(Configuration));

        private string extensionDirectory;
        private string updateUrl;
    }
}
