using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Net;
using System.Diagnostics;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Net.WebSockets;
using System.Collections.Specialized;
using System.Threading;
using System.IO;

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

        [DataMember(IsRequired = false)]
        public string[] dependencies {
            get { return this._dependencies; }
            set { this._dependencies = value; }
        }

        [DataMember(IsRequired=false)]
        public bool headless {
            get { return this._headless; }
            set { this._headless = value; }
        }

        [DataMember(IsRequired = false)]
        public string[] includes {
            get { return this._includes; }
            set { this._includes = value; }
        }

        [DataMember(IsRequired = false)]
        public string[] augments {
            get { return this._augments; }
            set { this._augments = value; }
        }

        [DataMember(IsRequired = false)]
        public string path {
            get { return this._path; }
            set { this._path = value; }
        }

        public bool WasLoadedRelativeToExtensionRoot {
            get { return this._wasLoadedRelativeToExtensionRoot; }
            set { this._wasLoadedRelativeToExtensionRoot = value; }
        }

        private string _name;
        private string _author;
        private string _description;
        private string[] _dependencies;
        private string[] _includes;
        private string[] _augments;
        private string _path;
        private bool _headless;
        private bool _wasLoadedRelativeToExtensionRoot;
    }

    public class WebServer : IDisposable {

        private const string Version = "2015-06-02-01";

        static public string LocalSupportDirectory
        {
            get
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "JsDbg", "support", Version);
            }
        }

        static public string SharedSupportDirectory
        {
            get
            {
                return Path.Combine(@"\\iefs\users\psalas\jsdbg\support\", Version);
            }
        }

        static public string PersistentStoreDirectory
        {
            get
            {
                return @"\\iefs\users\psalas\jsdbg\support\persistent";
            }
        }

        private const int StartPortNumber = 50000;
        private const int EndPortNumber = 50099;

        public WebServer(IDebugger debugger, PersistentStore persistentStore, string path, string defaultExtensionPath) {
            this.debugger = debugger;
            this.debugger.DebuggerBroke += (sender, e) => { this.NotifyClientsOfBreak(); };
            this.persistentStore = persistentStore;
            this.path = path;
            this.defaultExtensionPath = defaultExtensionPath;
            this.port = StartPortNumber;
            this.loadedExtensions = new List<JsDbgExtension>();
            this.cancellationSource = new CancellationTokenSource();
            this.openSockets = new HashSet<WebSocket>();
        }

        private void CreateHttpListener() {
            this.httpListener = new HttpListener();
            this.httpListener.Prefixes.Add(this.Url);
        }

        public string Url {
            get {
                return String.Format("http://localhost:{0}/", this.port);
            }
        }

        public async Task Listen(bool shouldLaunchBrowser = true) {
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
            if (shouldLaunchBrowser)
            {
                System.Diagnostics.Process.Start(this.Url);
            }

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
                        break;
                    }

                    this.NoteRequest(context.Request.Url);

                    string[] segments = context.Request.Url.Segments;
                    try {
                        if (segments.Length > 2 && segments[1].TrimEnd('/') == "jsdbg") {
                            // jsdbg request
                            this.ServeJsDbgRequest(
                                context.Request.Url, 
                                context.Request.QueryString, 
                                context, 
                                (string response) => { this.ServeUncachedString(response, context); }, 
                                () => { this.ServeFailure(context); }
                            );
                        } else if (context.Request.Headers["Upgrade"] != null && context.Request.Headers["Upgrade"].ToLowerInvariant() == "websocket") {
                            System.Net.WebSockets.HttpListenerWebSocketContext webSocketContext = await context.AcceptWebSocketAsync(null);
                            this.HandleWebSocket(webSocketContext.WebSocket);
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

        private void NoteRequest(Uri url) {
            ++this.requestCounter;
#if DEBUG
            Console.Out.WriteLineAsync(url.PathAndQuery);
#endif
        }

        private string GetFilePath(string serviceDirectory, string extensionName, string filename) {
            string fullPath;
            if (extensionName != null) {
                string[] components = filename.Split(new char[] { System.IO.Path.DirectorySeparatorChar, System.IO.Path.AltDirectorySeparatorChar }, 2);
                if (components.Length > 0 && components[0].ToLowerInvariant() == extensionName.ToLowerInvariant()) {
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
                    filePath = this.GetFilePath(extension.path, extension.name, filename);
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

        private void ServeJsDbgRequest(Uri url, NameValueCollection query, HttpListenerContext context, Action<string> respond, Action fail) {
            string[] segments = url.Segments;
            if (segments.Length <= 2 || segments[1].TrimEnd('/') != "jsdbg") {
                // This request is not a proper JsDbg request.
                fail();
                return;
            }

            switch (segments[2].TrimEnd('/')) {
            case "typesize":
                this.ServeTypeSize(query, respond, fail);
                break;
            case "fieldoffset":
                this.ServeFieldOffset(query, respond, fail);
                break;
            case "memory":
                this.ServeMemory(query, respond, fail);
                break;
            case "array":
                this.ServeArray(query, respond, fail);
                break;
            case "symbolname":
                this.ServeSymbolName(query, respond, fail);
                break;
            case "symbol":
                this.ServeSymbol(query, respond, fail);
                break;
            case "localsymbols":
                this.ServeLocalSymbols(query, respond, fail);
                break;
            case "pointersize":
                this.ServePointerSize(query, respond, fail);
                break;
            case "constantname":
                this.ServeConstantName(query, respond, fail);
                break;
            case "basetypes":
                this.ServeBaseTypes(query, respond, fail);
                break;
            case "typefields":
                this.ServeTypeFields(query, respond, fail);
                break;
            case "loadextension":
                this.LoadExtension(query, respond, fail);
                break;
            case "unloadextension":
                this.UnloadExtension(query, respond, fail);
                break;
            case "extensions":
                this.ServeExtensions(query, respond, fail);
                break;
            case "persistentstorage":
                // Persistent Storage requests require an HttpContext.
                if (context == null) {
                    goto default;
                } else {
                    this.ServePersistentStorage(segments, context);
                    break;
                }
            case "extensionpath":
                if (context == null) {
                    goto default;
                } else {
                    this.ServeDefaultExtensionPath(segments, context);
                }
                break;
            case "persistentstorageusers":
                this.ServePersistentStorageUsers(query, respond, fail);
                break;
            default:
                fail();
                break;
            }
        }

        private async void ServeTypeSize(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string type = query["type"];
            if (module == null || type == null) {
                fail();
                return;
            }

            string responseString;

            try {
                uint typeSize = await this.debugger.LookupTypeSize(module, type);
                responseString = String.Format("{{ \"size\": {0} }}", typeSize);
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private async void ServeFieldOffset(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string baseType = query["type"];
            string field = query["field"];
            if (module == null || baseType == null || field == null) {
                fail();
                return;
            }

            string responseString;

            try {
                SFieldResult result = await this.debugger.LookupField(module, baseType, field);

                // Construct the response.
                if (result.IsBitField) {
                    responseString = String.Format("{{ \"type\": \"{0}\", \"offset\": {1}, \"size\": {2}, \"bitcount\":{3}, \"bitoffset\":{4} }}", result.TypeName, result.Offset, result.Size, result.BitCount, result.BitOffset);
                } else {
                    responseString = String.Format("{{ \"type\": \"{0}\", \"offset\": {1}, \"size\": {2} }}", result.TypeName, result.Offset, result.Size);
                }
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private async void ServeBaseTypes(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string type = query["type"];

            if (module == null || type == null) {
                fail();
                return;
            }

            string responseString;

            try {
                IEnumerable<SBaseTypeResult> baseTypes = await this.debugger.GetBaseTypes(module, type);

                List<string> jsonFragments = new List<string>();
                foreach (SBaseTypeResult baseType in baseTypes) {
                    jsonFragments.Add(String.Format("{{ \"type\": \"{0}\", \"offset\": {1} }}", baseType.TypeName, baseType.Offset));
                }
                responseString = "[" + String.Join(",", jsonFragments) + "]";
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private static bool ParseInteger(string integerString, out ulong result) {
            System.Globalization.NumberStyles numberStyle = System.Globalization.NumberStyles.None;
            if (integerString != null && integerString.Length > 2 && integerString.IndexOf("0x") == 0) {
                numberStyle = System.Globalization.NumberStyles.AllowHexSpecifier;
                integerString = integerString.Substring(2);
            }
            result = 0;
            return integerString != null && ulong.TryParse(integerString, numberStyle, null, out result);
        }

        private static bool ParseInteger(string integerString, out int result) {
            System.Globalization.NumberStyles numberStyle = System.Globalization.NumberStyles.None;
            if (integerString != null && integerString.Length > 2 && integerString.IndexOf("0x") == 0) {
                numberStyle = System.Globalization.NumberStyles.AllowHexSpecifier;
                integerString = integerString.Substring(2);
            }
            result = 0;
            return integerString != null && int.TryParse(integerString, numberStyle, null, out result);
        }

        private async void ServeMemory(NameValueCollection query, Action<string> respond, Action fail) {
            string type = query["type"];
            string pointerString = query["pointer"];
            ulong pointer;

            if (type == null || !WebServer.ParseInteger(pointerString, out pointer)) {
                fail();
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
                        value = ToJsonNumber(await this.debugger.ReadMemory<float>(pointer));
                        break;
                    case "double":
                        value = ToJsonNumber(await this.debugger.ReadMemory<double>(pointer));
                        break;
                    default:
                        fail();
                        return;
                }

                responseString = String.Format("{{ \"value\": {0} }}", value);
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private async void ServeArray(NameValueCollection query, Action<string> respond, Action fail) {
            string type = query["type"];
            string pointerString = query["pointer"];
            string lengthString = query["length"];
            ulong pointer;
            ulong length;

            if (type == null || !WebServer.ParseInteger(pointerString, out pointer) || !WebServer.ParseInteger(lengthString, out length)) {
                fail();
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
                case "float":
                    arrayString = await ReadJsonArray<float>(pointer, length);
                    break;
                case "double":
                    arrayString = await ReadJsonArray<double>(pointer, length);
                    break;
                default:
                    fail();
                    return;
                }

                responseString = String.Format("{{ \"array\": {0} }}", arrayString);
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private async Task<string> ReadJsonArray<T>(ulong pointer, ulong length) where T : struct {
            if (length == 0) {
                return "[]";
            } else {
                return ToJsonArray(await this.debugger.ReadArray<T>(pointer, length));
            }
        }

        private static string ToJsonNumber(object value) {
            string resultString = value.ToString();
            // JSON doesn't allow NaN and Infinity, so quote them.
            if (resultString == "NaN" || resultString == "Infinity" || resultString == "-Infinity") {
                resultString = "\"" + resultString + "\"";
            }
            return resultString;
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
                
                builder.AppendFormat("{0}", ToJsonNumber(item));
            }
            builder.Append("]");
            return builder.ToString();
        }

        private async void ServeSymbolName(NameValueCollection query, Action<string> respond, Action fail) {
            string pointerString = query["pointer"];
            
            ulong pointer;
            if (!WebServer.ParseInteger(pointerString, out pointer)) {
                fail();
                return;
            }

            string responseString;
            try {
                string symbolName = await this.debugger.LookupSymbol(pointer);
                responseString = String.Format("{{ \"symbolName\": \"{0}\" }}", symbolName);
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private async void ServeSymbol(NameValueCollection query, Action<string> respond, Action fail) {
            string symbol = query["symbol"];
            string isGlobalString = query["isGlobal"];

            bool isGlobal;
            if (symbol == null || isGlobalString == null || !bool.TryParse(isGlobalString, out isGlobal)) {
                fail();
                return;
            }
            string responseString;
            try {
                SSymbolResult result = await this.debugger.LookupSymbol(symbol, isGlobal);
                responseString = String.Format("{{ \"pointer\": {0}, \"module\": \"{1}\", \"type\": \"{2}\" }}", result.Pointer, result.Module, result.Type);
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private async void ServeLocalSymbols(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string method = query["method"];
            string symbol = query["symbol"];
            string maxCountString = query["maxCount"];

            if (module == null || method == null || symbol == null) {
                fail();
                return;
            }

            int maxCount;
            WebServer.ParseInteger(maxCountString, out maxCount);

            string responseString;
            try {
                IEnumerable<SSymbolResult> results = await this.debugger.LookupLocalSymbols(module, method, symbol, maxCount);

                List<string> jsonFragments = new List<string>();
                foreach (SSymbolResult result in results) {
                    jsonFragments.Add(String.Format("{{ \"pointer\": {0}, \"module\": \"{1}\", \"type\": \"{2}\" }}", result.Pointer, result.Module, result.Type));
                }
                responseString = "[" + String.Join(",", jsonFragments) + "]";
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private void ServePointerSize(NameValueCollection query, Action<string> respond, Action fail) {
            respond(String.Format("{{ \"pointerSize\": \"{0}\" }}", (this.debugger.IsPointer64Bit ? 8 : 4)));
        }

        private async void ServeConstantName(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string type = query["type"];
            string constantString = query["constant"];
            ulong constant;
            if (module == null || type == null || !WebServer.ParseInteger(constantString, out constant)) {
                fail();
                return;
            }

            string responseString;
            try {
                string constantName = await this.debugger.LookupConstantName(module, type, constant);
                responseString = String.Format("{{ \"name\": \"{0}\" }}", constantName);
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private async void ServeTypeFields(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string type = query["type"];

            if (module == null || type == null) {
                fail();
                return;
            }

            string responseString;
            try {
                StringBuilder builder = new StringBuilder();
                builder.Append("{ \"fields\": [\n");
                bool isFirst = true;
                foreach (SFieldResult field in await this.debugger.GetAllFields(module, type)) {
                    if (!isFirst) {
                        builder.Append(",\n");
                    }
                    isFirst = false;
                    builder.Append("{");
                    builder.AppendFormat("\"name\": \"{0}\",", field.FieldName);
                    builder.AppendFormat("\"offset\": {0},", field.Offset);
                    builder.AppendFormat("\"size\": {0},", field.Size);
                    builder.AppendFormat("\"type\": \"{0}\"", field.TypeName);
                    if (field.IsBitField) {
                        builder.AppendFormat(",\"bitcount\": {0},", field.BitCount);
                        builder.AppendFormat("\"bitoffset\": {0}", field.BitOffset);
                    }
                    builder.Append("}");
                }
                builder.Append("\n] }");
                responseString = builder.ToString();
            } catch (JsDbg.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            respond(responseString);
        }

        private static DataContractJsonSerializer ExtensionSerializer = new DataContractJsonSerializer(typeof(JsDbgExtension));

        public bool LoadExtension(string extensionPath) {
            List<JsDbgExtension> extensionsToLoad = new List<JsDbgExtension>();
            List<string> failedExtensions = new List<string>();
            string name;
            if (this.LoadExtensionAndDependencies(extensionPath, extensionsToLoad, failedExtensions, out name)) {
                this.loadedExtensions.AddRange(extensionsToLoad);
                return true;
            } else {
                return false;
            }
        }

        private bool LoadExtensionAndDependencies(string extensionPath, List<JsDbgExtension> extensionsToLoad, List<string> failedExtensions, out string extensionName) {
            bool isRelativePath = false;
            if (!System.IO.Path.IsPathRooted(extensionPath)) {
                extensionPath = System.IO.Path.Combine(this.defaultExtensionPath, extensionPath);
                isRelativePath = true;
            }

            if (!System.IO.Directory.Exists(extensionPath)) {
                failedExtensions.Add(extensionPath);
                extensionName = null;
                return false;
            }

            JsDbgExtension extension;
            string jsonPath = System.IO.Path.Combine(extensionPath, "extension.json");
            try {
                using (System.IO.FileStream file = System.IO.File.Open(jsonPath, System.IO.FileMode.Open, System.IO.FileAccess.Read)) {
                    extension = (JsDbgExtension)ExtensionSerializer.ReadObject(file);
                }
                extension.path = extensionPath;
                extension.WasLoadedRelativeToExtensionRoot = isRelativePath;
            } catch {
                failedExtensions.Add(extensionPath);
                extensionName = null;
                return false;
            }

            extensionName = extension.name;

            // Check if the extension has already been loaded.
            foreach (JsDbgExtension existingExtension in this.loadedExtensions) {
                // If any existing extension has the same name, it's already loaded.
                if (existingExtension.name == extension.name) {
                    return true;
                }
            }
            foreach (JsDbgExtension existingExtension in extensionsToLoad) {
                if (existingExtension.name == extension.name) {
                    // If any existing extension has the same name, it's already loaded.
                    return true;
                }
            }

            extensionsToLoad.Add(extension);

            // Now load any dependencies, bubbling any failures.
            if (extension.dependencies != null) {
                for (int i = 0; i < extension.dependencies.Length; ++i) {
                    string dependencyPath = extension.dependencies[i];
                    string dependencyName;
                    if (!this.LoadExtensionAndDependencies(dependencyPath, extensionsToLoad, failedExtensions, out dependencyName)) {
                        failedExtensions.Add(extensionPath);
                        return false;
                    }

                    extension.dependencies[i] = dependencyName;
                }
            }

            // Everything succeeded.
            return true;
        }

        private void LoadExtension(NameValueCollection query, Action<string> respond, Action fail) {
            string extensionPath = query["path"];

            if (extensionPath == null) {
                fail();
                return;
            }

            List<JsDbgExtension> extensionsToLoad = new List<JsDbgExtension>();
            List<string> failedExtensions = new List<string>();
            string name;
            if (!this.LoadExtensionAndDependencies(extensionPath, extensionsToLoad, failedExtensions, out name)) {
                respond("{ \"error\": \"Extensions failed to load:" + String.Join(" -> ", failedExtensions).Replace("\\", "\\\\") + "\" }");
                return;
            } else {
                this.loadedExtensions.AddRange(extensionsToLoad);
                respond("{ \"success\": true }");
            }
        }

        private void UnloadExtension(NameValueCollection query, Action<string> respond, Action fail) {
            string extensionName = query["name"];

            if (extensionName == null) {
                fail();
                return;
            }

            for (int i = 0; i < this.loadedExtensions.Count; ++i) {
                if (this.loadedExtensions[i].name == extensionName) {
                    this.loadedExtensions.RemoveAt(i);
                    respond("{ \"success\": true }");
                    return;
                }
            }

            respond("{ \"error\": \"Unknown extension.\" }");
        }

        private void ServeExtensions(NameValueCollection query, Action<string> respond, Action fail) {
            List<string> jsonExtensions = new List<string>();
            foreach (JsDbgExtension extension in this.loadedExtensions) {
                using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                    ExtensionSerializer.WriteObject(memoryStream, extension);
                    jsonExtensions.Add(Encoding.Default.GetString(memoryStream.ToArray()));
                }
            }

            respond(String.Format("{{ \"extensions\": [{0}] }}", String.Join(",", jsonExtensions)));
        }

        private void ServePersistentStorage(string[] segments, HttpListenerContext context) {
            if (context.Request.HttpMethod == "GET") {
                string user = context.Request.QueryString["user"];
                this.ServeUncachedString(this.persistentStore.Get(user), context);
            } else if (context.Request.HttpMethod == "PUT") {
                System.IO.StreamReader reader = new System.IO.StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
                string data = reader.ReadToEnd();
                this.persistentStore.Set(data);
                this.ServeUncachedString("{ \"success\": true }", context);
            } else {
                this.ServeFailure(context);
            }
        }

        private void ServeDefaultExtensionPath(string[] segments, HttpListenerContext context) {
            if (context.Request.HttpMethod == "GET") {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(string));
                using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                    serializer.WriteObject(memoryStream, this.defaultExtensionPath);
                    string result = Encoding.Default.GetString(memoryStream.ToArray());
                    this.ServeUncachedString(String.Format("{{ \"path\": {0} }}", result), context);
                }
            } else if (context.Request.HttpMethod == "PUT") {
                System.IO.StreamReader reader = new System.IO.StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
                string data = reader.ReadToEnd();

                if (!Directory.Exists(data)) {
                    this.ServeUncachedString("{ \"error\": \"The directory is inaccessible or does not exist.\" }", context);
                } else {
                    if (data != this.defaultExtensionPath) {
                        // Unload every extension that was loaded relative to the extension root.
                        for (int i = this.loadedExtensions.Count - 1; i >= 0; --i) {
                            if (this.loadedExtensions[i].WasLoadedRelativeToExtensionRoot) {
                                this.loadedExtensions.RemoveAt(i);
                            }
                        }

                        this.defaultExtensionPath = data;

                        // Reload the default extension if there is one at the new default path.
                        this.LoadExtension("default");
                    }

                    // Serve the new extension path.
                    DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(string));
                    using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                        serializer.WriteObject(memoryStream, this.defaultExtensionPath);
                        string result = Encoding.Default.GetString(memoryStream.ToArray());
                        this.ServeUncachedString(String.Format("{{ \"path\": {0} }}", result), context);
                    }
                }
            } else {
                this.ServeFailure(context);
            }
        }

        private void ServePersistentStorageUsers(NameValueCollection query, Action<string> respond, Action fail) {
            string[] users = this.persistentStore.GetUsers();

            DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(string[]));
            using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                serializer.WriteObject(memoryStream, users);
                string result = Encoding.Default.GetString(memoryStream.ToArray());
                respond(String.Format("{{ \"users\": {0} }}", result));
            }
        }

        private const char WebSocketArgumentSeparator = ';';

        private async void HandleWebSocket(WebSocket socket) {
            byte[] buffer = new byte[2048];
            ArraySegment<byte> segment = new ArraySegment<byte>(buffer);
            char argumentSeperator = WebServer.WebSocketArgumentSeparator;
            char[] argumentSeparators = {argumentSeperator};
            Uri baseUri = new Uri("http://localhost:" + this.port.ToString());

            using (socket) {
                try {
                    this.openSockets.Add(socket);
                    while (socket.State == WebSocketState.Open) {
                        StringBuilder messageBuilder = new StringBuilder();
                        WebSocketReceiveResult result = await socket.ReceiveAsync(segment, this.cancellationSource.Token);

                        // Make sure we get the whole message.
                        while (result.MessageType == WebSocketMessageType.Text && !result.EndOfMessage) {
                            messageBuilder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                            result = await socket.ReceiveAsync(segment, this.cancellationSource.Token);
                        }

                        messageBuilder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));

                        if (result.MessageType == WebSocketMessageType.Text) {
                            Debug.Assert(result.EndOfMessage);

                            // Request protocol: [identifier];[URL]
                            // Response protocol: [identifier];[code];[response]

                            string message = messageBuilder.ToString();
                            string[] messageParts = message.Split(argumentSeparators, 2);
                            if (messageParts.Length == 2 && Uri.IsWellFormedUriString(messageParts[1], UriKind.Relative)) {
                                // The request appears valid.  Grab the URL and handle the JsDbgRequest.
                                Uri request = new Uri(baseUri, messageParts[1]);
                                this.NoteRequest(request);

                                this.ServeJsDbgRequest(
                                    request,
                                    System.Web.HttpUtility.ParseQueryString(request.Query),
                                    /*context*/null,
                                    (string response) => {
                                        // Prepend the identifier and response code.
                                        response = messageParts[0] + argumentSeperator + "200" + argumentSeperator + response;
                                        socket.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(response)), WebSocketMessageType.Text, /*endOfMessage*/true, this.cancellationSource.Token);
                                    },
                                    () => {
                                        // Send the failure.
                                        string response = messageParts[0] + argumentSeperator + "400" + argumentSeperator + message;
                                        socket.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(response)), WebSocketMessageType.Text, /*endOfMessage*/true, this.cancellationSource.Token);
                                    }
                                );
                            } else {
                                // Send the failure.
                                string response = messageParts[0] + argumentSeperator + "400" + argumentSeperator + message;
                                Task ignoredTask = socket.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(response)), WebSocketMessageType.Text, /*endOfMessage*/true, this.cancellationSource.Token);
                            }
                        } else if (result.MessageType == WebSocketMessageType.Close) {
                            // The client closed the WebSocket.
                            break;
                        }
                    }

                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Normal", System.Threading.CancellationToken.None);
                } catch (WebSocketException socketException) {
                    if (this.httpListener.IsListening) {
                        Console.Out.WriteLine("Closing WebSocket due to WebSocketException: {0}", socketException.Message);
                    }
                } finally {
                    this.openSockets.Remove(socket);
                }
            }
        }

        public void NotifyClientsOfBreak() {
            string message = "break";
            foreach (WebSocket socket in this.openSockets) {
                if (socket.State == WebSocketState.Open) {
                    socket.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(message)), WebSocketMessageType.Text, /*endOfMessage*/true, this.cancellationSource.Token);
                }
            }
        }

        public void Abort() {
            if (this.httpListener.IsListening) {
                this.httpListener.Abort();
            }
        }

        public bool IsListening
        {
            get { return this.httpListener != null && this.httpListener.IsListening; }
        }

        #region IDisposable Members

        public void Dispose() {
            this.debugger.Dispose();
        }

        #endregion

        private HttpListener httpListener;
        private CancellationTokenSource cancellationSource;
        private IDebugger debugger;
        private PersistentStore persistentStore;
        private HashSet<WebSocket> openSockets;
        private List<JsDbgExtension> loadedExtensions;
        private string path;
        private string defaultExtensionPath;
        private int port;
        private ulong requestCounter;
    }
}
