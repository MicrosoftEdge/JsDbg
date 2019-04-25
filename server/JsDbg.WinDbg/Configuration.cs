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

namespace JsDbg.WinDbg {
    [DataContract]
    class Configuration {
        [DataMember(IsRequired=true)]
        public string extension_root {
            get { return this._extension_root; }
            set { this._extension_root = value; }
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

        public static string Schema {
            get {
                return @"{
    ""extension_root"": ""\path\to\extensions""
}";
            }
        }

        private static DataContractJsonSerializer ConfigurationSerializer = new DataContractJsonSerializer(typeof(Configuration));

        private string _extension_root;
    }
}
