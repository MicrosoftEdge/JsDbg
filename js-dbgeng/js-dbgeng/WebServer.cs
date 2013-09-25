using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Net;
using System.Diagnostics;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace JsDbg {
    
    [DataContract]
    public class JsDbgExtension {
        [DataMember]
        public string name {
            get { return this._name; }
            set { this._name = value; }
        }

        [DataMember(IsRequired = false)]
        public string author {
            get { return this._author; }
            set { this._author = value; }
        }

        [DataMember(IsRequired = false)]
        public string description {
            get { return this._description; }
            set { this._description = value; }
        }

        public string Path {
            get { return this._path; }
            set { this._path = value; }
        }

        private string _name;
        private string _author;
        private string _description;
        private string _path;
    }

    class WebServer : IDisposable {

        private const int StartPortNumber = 50000;
        private const int EndPortNumber = 50099;

        internal WebServer(Debugger debugger, string path) {
            this.debugger = debugger;
            this.path = path;
            this.port = StartPortNumber;
            this.loadedExtensions = new List<JsDbgExtension>();
        }

        private void CreateHttpListener() {
            this.httpListener = new HttpListener();
            this.httpListener.Prefixes.Add(this.Url);
        }

        internal string Url {
            get {
                return String.Format("http://localhost:{0}/", this.port);
            }
        }

        internal async Task Listen() {

            bool didTryNetsh = false;
            while (true) {
                this.CreateHttpListener();
                try {
                    this.httpListener.Start();
                } catch (HttpListenerException ex) {
                    if (ex.ErrorCode == 5 && !didTryNetsh) {
                        // Access denied, add the url acl and retry.
                        didTryNetsh = true;
                        Console.Out.WriteLine("Access denied, trying to add URL ACL for {0}.  This may fire an admin prompt.", this.Url);

                        try {
                            ProcessStartInfo netsh = new ProcessStartInfo("netsh", String.Format(@"http add urlacl url={0} user={1}\{2}", this.Url, Environment.UserDomainName, Environment.UserName));
                            netsh.Verb = "runas";
                            Process.Start(netsh).WaitForExit();
                        } catch (Exception innerEx) {
                            Console.Out.WriteLine(innerEx.Message);
                            throw innerEx;
                        }

                        continue;
                    } else if (ex.ErrorCode == 183 && this.port < EndPortNumber) {
                        // Registration conflicts with existing registration.  Try the next port.
                        ++this.port;
                        continue;
                    } else {
                        Console.Out.WriteLine(ex.Message);
                        throw ex;
                    }
                } catch (Exception ex) {
                    Console.Out.WriteLine(ex.Message);
                    throw ex;
                }

                break;
            }

            Console.Out.WriteLine("Listening on {0}...", this.Url);

            // Launch the browser.
            System.Diagnostics.Process.Start(this.Url);

            try {
                while (true) {
                    HttpListenerContext context = await Task<HttpListenerContext>.Run(() => {
                        try {
                            return this.httpListener.GetContext();
                        } catch {
                            return null;
                        }
                    });

                    if (context == null) {
                        return;
                    }

                    Task writeTask = Console.Out.WriteLineAsync("request for " + context.Request.RawUrl);

                    string[] segments = context.Request.Url.Segments;
                    try {
                        if (segments.Length > 2 && segments[1].TrimEnd('/') == "jsdbg") {
                            // jsdbg request
                            switch (segments[2].TrimEnd('/')) {
                            case "fieldoffset":
                                this.ServeFieldOffset(segments, context);
                                break;
                            case "memory":
                                this.ServeMemory(segments, context);
                                break;
                            case "array":
                                this.ServeArray(segments, context);
                                break;
                            case "symbolname":
                                this.ServeSymbolName(segments, context);
                                break;
                            case "symbol":
                                this.ServeSymbol(segments, context);
                                break;
                            case "pointersize":
                                this.ServePointerSize(segments, context);
                                break;
                            case "constantname":
                                this.ServeConstantName(segments, context);
                                break;
                            case "basetypeoffset":
                                this.ServeBaseTypeOffset(segments, context);
                                break;
                            case "loadextension":
                                this.LoadExtension(segments, context);
                                break;
                            case "unloadextension":
                                this.UnloadExtension(segments, context);
                                break;
                            default:
                                context.Response.Redirect("/");
                                context.Response.OutputStream.Close();
                                break;
                            }
                        } else {
                            // static file
                            string path = "";
                            for (int i = 1; i < segments.Length; ++i) {
                                path = System.IO.Path.Combine(path, segments[i]);
                            }
                            this.ServeStaticFile(this.path, path, context.Response);
                            continue;
                        }
                    } catch (HttpListenerException listenerException) {
                        Console.Out.WriteLine("HttpListenerException: {0}", listenerException.Message);
                    }
                }
            } catch (Exception ex) {
                Console.Out.WriteLine(ex.Message);
            }
        }

        private void ServeFailure(HttpListenerContext context) {
            context.Response.StatusCode = 400;
            context.Response.OutputStream.Close();
        }

        private void ServeUncachedString(string responseString, HttpListenerContext context) {
            byte[] buffer = System.Text.Encoding.UTF8.GetBytes(responseString);
            context.Response.AddHeader("Cache-Control", "no-cache");
            context.Response.ContentType = "application/json";
            context.Response.ContentLength64 = buffer.Length;
            context.Response.OutputStream.Write(buffer, 0, buffer.Length);
            context.Response.OutputStream.Close();
        }

        private string GetFilePath(string serviceDirectory, string extensionName, string filename) {
            string fullPath;
            if (extensionName != null) {
                string[] components = filename.Split(new char[] { System.IO.Path.DirectorySeparatorChar, System.IO.Path.AltDirectorySeparatorChar }, 2);
                if (components.Length > 0 && components[0] == extensionName) {
                    fullPath = System.IO.Path.Combine(serviceDirectory, components.Length > 1 ? components[1] : "");
                } else {
                    return null;
                }
            } else {
                fullPath = System.IO.Path.Combine(serviceDirectory, filename);
            }

            if (System.IO.Directory.Exists(fullPath)) {
                fullPath = System.IO.Path.Combine(fullPath, "index.html");
            }

            if (System.IO.File.Exists(fullPath)) {
                return fullPath;
            } else {
                return null;
            }
        }

        private void ServeStaticFile(string serviceDirectory, string filename, HttpListenerResponse response) {
            string filePath = this.GetFilePath(serviceDirectory, null, filename);

            if (filePath == null) {
                // Try the extensions.
                foreach (JsDbgExtension extension in this.loadedExtensions) {
                    filePath = this.GetFilePath(extension.Path, extension.name, filename);
                    if (filePath != null) {
                        break;
                    }
                }
            }

            if (filePath == null) {
                response.StatusCode = 404;
                response.OutputStream.Close();
                return;
            }

            try {
                using (System.IO.FileStream fileStream = System.IO.File.OpenRead(filePath)) {
                    response.AddHeader("Cache-Control", "no-cache");
                    response.ContentType = System.Web.MimeMapping.GetMimeMapping(filePath);
                    response.ContentLength64 = fileStream.Length;
                    fileStream.CopyTo(response.OutputStream);
                    response.OutputStream.Close();
                }
            } catch {
                response.StatusCode = 404;
                response.OutputStream.Close();
            }
        }

        private async void ServeFieldOffset(string[] segments, HttpListenerContext context) {
            string module = context.Request.QueryString["module"];
            string baseType = context.Request.QueryString["type"];
            string fieldsString = context.Request.QueryString["fields"];
            if (module == null || baseType == null || fieldsString == null) {
                this.ServeFailure(context);
                return;
            }

            string[] fields = { };
            if (fieldsString != "") {
                fields = fieldsString.Split(',');
            }

            string responseString;

            try {
                Debugger.SFieldResult result = await this.debugger.LookupField(module, baseType, fields);

                // Construct the response.
                if (result.IsBitField) {
                    responseString = String.Format("{{ \"type\": \"{0}\", \"offset\": {1}, \"size\": {2}, \"bitcount\":{3}, \"bitoffset\":{4} }}", result.TypeName, result.Offset, result.Size, result.BitCount, result.BitOffset);
                } else {
                    responseString = String.Format("{{ \"type\": \"{0}\", \"offset\": {1}, \"size\": {2} }}", result.TypeName, result.Offset, result.Size);
                }
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private async void ServeBaseTypeOffset(string[] segments, HttpListenerContext context) {
            string module = context.Request.QueryString["module"];
            string type = context.Request.QueryString["type"];
            string baseType = context.Request.QueryString["basetype"];

            if (module == null || baseType == null || type == null) {
                this.ServeFailure(context);
                return;
            }

            string responseString;

            try {
                int offset = await this.debugger.GetBaseClassOffset(module, type, baseType);
                responseString = String.Format("{{ \"offset\": {0} }}", offset);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private async void ServeMemory(string[] segments, HttpListenerContext context) {
            string type = context.Request.QueryString["type"];
            string pointerString = context.Request.QueryString["pointer"];
            ulong pointer;

            if (type == null || pointerString == null || !UInt64.TryParse(pointerString, out pointer)) {
                this.ServeFailure(context);
                return;
            }
            
            string responseString;
            try {
                object value = null;
                switch (type) {
                    case "pointer":
                        if (this.debugger.IsPointer64Bit) {
                            value = await this.debugger.ReadMemory<ulong>(pointer);
                        } else {
                            value = await this.debugger.ReadMemory<uint>(pointer);
                        }
                        break;
                    case "byte":
                        value = await this.debugger.ReadMemory<byte>(pointer);
                        break;
                    case "short":
                        value = await this.debugger.ReadMemory<short>(pointer);
                        break;
                    case "int":
                        value = await this.debugger.ReadMemory<int>(pointer);
                        break;
                    case "long":
                        value = await this.debugger.ReadMemory<long>(pointer);
                        break;
                    case "ushort":
                        value = await this.debugger.ReadMemory<ushort>(pointer);
                        break;
                    case "uint":
                        value = await this.debugger.ReadMemory<uint>(pointer);
                        break;
                    case "ulong":
                        value = await this.debugger.ReadMemory<ulong>(pointer);
                        break;
                    case "float":
                        value = await this.debugger.ReadMemory<float>(pointer);
                        break;
                    case "double":
                        value = await this.debugger.ReadMemory<double>(pointer);
                        break;
                    default:
                        this.ServeFailure(context);
                        return;
                }

                responseString = String.Format("{{ \"value\": {0} }}", value);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private async void ServeArray(string[] segments, HttpListenerContext context) {
            string type = context.Request.QueryString["type"];
            string pointerString = context.Request.QueryString["pointer"];
            string lengthString = context.Request.QueryString["length"];
            ulong pointer;
            ulong length;

            if (type == null || pointerString == null || !UInt64.TryParse(pointerString, out pointer) || !UInt64.TryParse(lengthString, out length)) {
                this.ServeFailure(context);
                return;
            }

            string responseString;
            try {
                string arrayString;
                switch (type) {
                case "pointer":
                    if (this.debugger.IsPointer64Bit) {
                        arrayString = await ReadJsonArray<ulong>(pointer, length);
                    } else {
                        arrayString = await ReadJsonArray<uint>(pointer, length);
                    }
                    break;
                case "byte":
                    arrayString = await ReadJsonArray<byte>(pointer, length);
                    break;
                case "short":
                    arrayString = await ReadJsonArray<short>(pointer, length);
                    break;
                case "int":
                    arrayString = await ReadJsonArray<int>(pointer, length);
                    break;
                case "long":
                    arrayString = await ReadJsonArray<long>(pointer, length);
                    break;
                case "ushort":
                    arrayString = await ReadJsonArray<ushort>(pointer, length);
                    break;
                case "uint":
                    arrayString = await ReadJsonArray<uint>(pointer, length);
                    break;
                case "ulong":
                    arrayString = await ReadJsonArray<ulong>(pointer, length);
                    break;
                default:
                    this.ServeFailure(context);
                    return;
                }

                responseString = String.Format("{{ \"array\": {0} }}", arrayString);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private async Task<string> ReadJsonArray<T>(ulong pointer, ulong length) where T : struct {
            return ToJsonArray(await this.debugger.ReadArray<T>(pointer, length));
        }

        private string ToJsonArray(System.Collections.IEnumerable enumerable) {
            StringBuilder builder = new StringBuilder();
            builder.Append("[");
            bool isFirst = true;
            foreach (object item in enumerable) {
                if (!isFirst) {
                    builder.AppendFormat(", ");
                } else {
                    isFirst = false;
                }
                builder.AppendFormat("{0}", item);
            }
            builder.Append("]");
            return builder.ToString();
        }

        private async void ServeSymbolName(string[] segments, HttpListenerContext context) {
            string pointerString = context.Request.QueryString["pointer"];
            
            ulong pointer;
            if (pointerString == null || !UInt64.TryParse(pointerString, out pointer)) {
                this.ServeFailure(context);
                return;
            }

            string responseString;
            try {
                string symbolName = await this.debugger.LookupSymbol(pointer);
                responseString = String.Format("{{ \"symbolName\": \"{0}\" }}", symbolName);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private async void ServeSymbol(string[] segments, HttpListenerContext context) {
            string symbol = context.Request.QueryString["symbol"];

            if (symbol == null) {
                this.ServeFailure(context);
                return;
            }

            string responseString;
            try {
                Debugger.SSymbolResult result = await this.debugger.LookupSymbol(symbol);
                responseString = String.Format("{{ \"value\": {0}, \"module\": \"{1}\", \"type\": \"{2}\" }}", result.Value, result.Module, result.Type);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private void ServePointerSize(string[] segments, HttpListenerContext context) {
            this.ServeUncachedString(String.Format("{{ \"pointerSize\": \"{0}\" }}", (this.debugger.IsPointer64Bit ? 8 : 4)), context);
        }

        private async void ServeConstantName(string[] segments, HttpListenerContext context) {
            string module = context.Request.QueryString["module"];
            string type = context.Request.QueryString["type"];
            string constantString = context.Request.QueryString["constant"];
            ulong constant;
            if (module == null || type == null || constantString == null || !UInt64.TryParse(constantString, out constant)) {
                this.ServeFailure(context);
                return;
            }

            string responseString;
            try {
                string constantName = await this.debugger.LookupConstantName(module, type, constant);
                responseString = String.Format("{{ \"name\": \"{0}\" }}", constantName);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private static DataContractJsonSerializer ExtensionSerializer = new DataContractJsonSerializer(typeof(JsDbgExtension));

        private void LoadExtension(string[] segments, HttpListenerContext context) {
            string extensionPath = context.Request.QueryString["path"];

            if (extensionPath == null) {
                this.ServeFailure(context);
                return;
            }

            if (!System.IO.Directory.Exists(path)) {
                this.ServeUncachedString("{ \"error\": \"The path does not exist.\" }", context);
                return;
            }

            JsDbgExtension extension;
            string jsonPath = System.IO.Path.Combine(extensionPath, "extension.json");
            try {
                using (System.IO.FileStream file = System.IO.File.Open(jsonPath, System.IO.FileMode.Open, System.IO.FileAccess.Read)) {
                    extension = (JsDbgExtension)ExtensionSerializer.ReadObject(file);
                }
                extension.Path = extensionPath;
            } catch {
                this.ServeUncachedString("{ \"error\": \"Unable to read extension.json file.\" }", context);
                return;
            }

            bool alreadyLoaded = false;
            foreach (JsDbgExtension existingExtension in this.loadedExtensions) {
                // If any existing extension has the same name, fail.
                if (existingExtension.name == extension.name) {
                    alreadyLoaded = true;
                    extension = existingExtension;
                    break;
                }
            }

            if (!alreadyLoaded) {
                this.loadedExtensions.Add(extension);
            }

            using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                ExtensionSerializer.WriteObject(memoryStream, extension);
                this.ServeUncachedString(Encoding.Default.GetString(memoryStream.ToArray()), context);
            }
        }

        private void UnloadExtension(string[] segments, HttpListenerContext context) {
            string extensionName = context.Request.QueryString["name"];

            if (extensionName == null) {
                this.ServeFailure(context);
                return;
            }

            for (int i = 0; i < this.loadedExtensions.Count; ++i) {
                if (this.loadedExtensions[i].name == extensionName) {
                    this.loadedExtensions.RemoveAt(i);
                    this.ServeUncachedString("{ \"success\": true }", context);
                    return;
                }
            }

            this.ServeUncachedString("{ \"error\": \"Unknown extension.\" }", context);
        }

        internal void Abort() {
            if (this.httpListener.IsListening) {
                this.httpListener.Abort();
            }
        }


        #region IDisposable Members

        public void Dispose() {
            this.debugger.Dispose();
        }

        #endregion

        private HttpListener httpListener;
        private Debugger debugger;
        private List<JsDbgExtension> loadedExtensions;
        private string path;
        private int port;
    }
}
