//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

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

namespace JsDbg.Core {
    
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

        [DataMember(IsRequired = false)]
        public string[] targetModules {
            get { return this._targetModules; }
            set { this._targetModules = value; }
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

        // Even though this isn't parsed meaningfully, we do want to serialize it for the client's benefit.
        [DataMember(IsRequired = false)]
        public string path {
            get { return this._path; }
            set { this._path = value; }
        }

        public string OriginalPath {
            get { return this._originalPath; }
            set { this._originalPath = value; }
        }

        public bool WasLoadedRelativeToExtensionRoot {
            get { return this._wasLoadedRelativeToExtensionRoot; }
            set { this._wasLoadedRelativeToExtensionRoot = value; }
        }

        public FileSystemWatcher Watcher {
            get { return this._watcher; }
            set { this._watcher = value; }
        }

        private string _name;
        private string _author;
        private string _description;
        private string[] _dependencies;
        private string[] _includes;
        private string[] _augments;
        private string[] _targetModules;
        private string _path;
        private string _originalPath;
        private bool _headless;
        private bool _wasLoadedRelativeToExtensionRoot;
        private FileSystemWatcher _watcher;
    }

    public class WebServer : IDisposable {



        private const int StartPortNumber = 50000;
        private const int EndPortNumber = 50099;

        public WebServer(IDebugger debugger, PersistentStore persistentStore, string extensionRoot) {
            this.debugger = debugger;
            this.debugger.DebuggerChange += (sender, e) => { this.NotifyClientsOfDebuggerChange(e.Status); };
            this.debugger.DebuggerMessage += (sender, message) => {
                Console.Error.WriteLine(message);
                this.SendWebSocketMessage(String.Format("message:{0}", message));
            };
            this.persistentStore = persistentStore;
            this.extensionRoot = extensionRoot;
            this.port = StartPortNumber;
            this.loadedExtensions = new List<JsDbgExtension>();
            this.extensionsByName = new Dictionary<string, JsDbgExtension>();
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

        public async Task Listen() {
            bool didTryNetsh = false;
            while (true) {
                this.CreateHttpListener();
                try {
                    this.httpListener.Start();
                } catch (HttpListenerException ex) {
                    if (ex.ErrorCode == 5 && !didTryNetsh) {
                        // Access denied, add the url acl and retry.
                        didTryNetsh = true;
                        Console.Error.WriteLine("Access denied, trying to add URL ACL for {0}.  This may fire an admin prompt.", this.Url);

                        try {
                            ProcessStartInfo netsh = new ProcessStartInfo("netsh", String.Format(@"http add urlacl url={0} user={1}\{2}", this.Url, Environment.UserDomainName, Environment.UserName));
                            netsh.Verb = "runas";
                            Process.Start(netsh).WaitForExit();
                        } catch (Exception innerEx) {
                            Console.Error.WriteLine(innerEx.Message);
                            throw innerEx;
                        }

                        continue;
                    } else if ((ex.ErrorCode == 32 || ex.ErrorCode == 183) && this.port < EndPortNumber) {
                        // Registration conflicts with existing registration.  Try the next port.
                        ++this.port;
                        continue;
                    } else {
                        Console.Error.WriteLine("HttpListenerException with error code {0}: {1}", ex.ErrorCode, ex.Message);
                        throw;
                    }
                } catch (Exception ex) {
                    Console.Error.WriteLine("HttpListener.Start() threw an exception: {0}", ex.Message);
                    throw;
                }

                break;
            }

            Console.Error.WriteLine("Listening on {0}...", this.Url);

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
                        if (segments.Length > 2 && segments[1].TrimEnd('/') == "jsdbg-server") {
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
                            this.ServeStaticFile(path, context.Response);
                            continue;
                        }
                    } catch (HttpListenerException listenerException) {
                        Console.Error.WriteLine("HttpListenerException during request handling: {0}", listenerException.Message);
                    }
                }
            } catch (Exception ex) {
                Console.Error.WriteLine("Unhandled exception during request handling: {0}", ex.Message);
            }
        }

        private void ServeFailure(HttpListenerContext context) {
            try {
                context.Response.StatusCode = 400;
                context.Response.OutputStream.Close();
            } catch (Exception exception) {
                Console.Error.WriteLine("Network Exception: {0}", exception.Message);
            }
        }

        private string JSONError(string error) {
            return String.Format("{{ \"error\": \"{0}\" }}", error);
        }

        private void ServeUncachedString(string responseString, HttpListenerContext context) {
            byte[] buffer = System.Text.Encoding.UTF8.GetBytes(responseString);
            try {
                context.Response.AddHeader("Cache-Control", "no-cache");
                context.Response.ContentType = "application/json";
                context.Response.ContentLength64 = buffer.Length;
                context.Response.OutputStream.Write(buffer, 0, buffer.Length);
                context.Response.OutputStream.Close();
            } catch (Exception exception) {
                Console.Error.WriteLine("Network Exception: {0}", exception.Message);
            }
        }

        private void NoteRequest(Uri url) {
            ++this.requestCounter;
#if DEBUG
            Console.Error.WriteLineAsync(url.PathAndQuery);
#endif
        }

        private void ServeStaticFile(string filename, HttpListenerResponse response) {
            // Identify the extension to pull from.
            string extensionName = null;
            string[] components = filename.Split(new char[] { System.IO.Path.DirectorySeparatorChar, System.IO.Path.AltDirectorySeparatorChar }, 2);
            if (components.Length > 1) {
                extensionName = components[0];
                filename = components[1];
            } else {
                if (this.extensionsByName.ContainsKey(components[0].ToLowerInvariant())) {
                    extensionName = components[0];
                    filename = "";
                } else {
                    extensionName = "wwwroot";
                    filename = components[0];
                }
            }

            string filePath = null;
            JsDbgExtension extension;
            if (this.extensionsByName.TryGetValue(extensionName.ToLowerInvariant(), out extension)) {
                filePath = Path.Combine(extension.path, filename);
                if (Directory.Exists(filePath)) {
                    filePath = Path.Combine(filePath, "index.html");
                }
                
                if (!File.Exists(filePath)) {
                    filePath = null;
                }
            }

            if (filePath == null) {
                response.StatusCode = 404;
                response.OutputStream.Close();
                return;
            }

            try {
                using (Stream fileStream = File.OpenRead(filePath)) {
                    response.AddHeader("Cache-Control", "no-cache");
                    if (MimeMappings.TryGetContentType(filePath, out string contentType)) {
                        response.ContentType = contentType;
                    }
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
            if (segments.Length <= 2 || segments[1].TrimEnd('/') != "jsdbg-server") {
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
                case "writememory":
                    this.WriteMemory(query, respond, fail);
                    break;
                case "array":
                    this.ServeArray(query, respond, fail);
                    break;
                case "symbolname":
                    this.ServeSymbolName(query, respond, fail);
                    break;
                case "global":
                    this.ServeGlobalSymbol(query, respond, fail);
                    break;
                case "callstack":
                    this.ServeCallStack(query, respond, fail);
                    break;
                case "locals":
                    this.ServeLocals(query, respond, fail);
                    break;
                case "isenum":
                    this.ServeIsEnum(query, respond, fail);
                    break;
                case "constantname":
                    this.ServeConstantName(query, respond, fail);
                    break;
                case "constantvalue":
                    this.ServeConstantValue(query, respond, fail);
                    break;
                case "basetypes":
                    this.ServeBaseTypes(query, respond, fail);
                    break;
                case "typefields":
                    this.ServeTypeFields(query, respond, fail);
                    break;
                case "teb":
                    this.ServeTebAddress(query, respond, fail);
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
                case "attachedprocesses":
                    this.ServeAttachedProcesses(query, respond, fail);
                    break;
                case "targetprocess":
                    if (context == null) {
                        goto default;
                    } else {
                        this.ServeTargetProcess(segments, context);
                    }
                    break;
                case "currentprocessthreads":
                    this.ServeCurrentProcessThreads(query, respond, fail);
                    break;
                case "targetthread":
                    if (context == null) {
                        goto default;
                    } else {
                        this.ServeTargetThread(segments, context);
                    }
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
            } catch (DebuggerException ex) {
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
                    responseString = String.Format("{{ \"module\": \"{5}\", \"type\": \"{0}\", \"offset\": {1}, \"size\": {2}, \"bitcount\":{3}, \"bitoffset\":{4} }}", result.TypeName, result.Offset, result.Size, result.BitCount, result.BitOffset, result.Module);
                } else {
                    responseString = String.Format("{{ \"module\": \"{3}\", \"type\": \"{0}\", \"offset\": {1}, \"size\": {2} }}", result.TypeName, result.Offset, result.Size, result.Module);
                }
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
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
                    jsonFragments.Add(String.Format("{{ \"module\": \"{2}\", \"type\": \"{0}\", \"offset\": {1} }}", baseType.TypeName, baseType.Offset, baseType.Module));
                }
                responseString = "[" + String.Join(",", jsonFragments) + "]";
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private static System.Globalization.NumberStyles NumberStylesForIntegerString(ref string integerString) {
            System.Globalization.NumberStyles numberStyle = System.Globalization.NumberStyles.None;
            if (integerString != null && integerString.Length > 2 && integerString.IndexOf("0x") == 0) {
                numberStyle = System.Globalization.NumberStyles.AllowHexSpecifier;
                integerString = integerString.Substring(2);
            }
            return numberStyle | System.Globalization.NumberStyles.AllowLeadingSign;
        }

        private static bool ParseInteger(string integerString, out ulong result) {
            var numberStyle = WebServer.NumberStylesForIntegerString(ref integerString);
            result = 0;
            return integerString != null && ulong.TryParse(integerString, numberStyle, null, out result);
        }

        private static bool ParseInteger(string integerString, out long result) {
            var numberStyle = WebServer.NumberStylesForIntegerString(ref integerString);
            result = 0;
            return integerString != null && long.TryParse(integerString, numberStyle, null, out result);
        }

        private static bool ParseInteger(string integerString, out int result) {
            var numberStyle = WebServer.NumberStylesForIntegerString(ref integerString);
            result = 0;
            return integerString != null && int.TryParse(integerString, numberStyle, null, out result);
        }

        private static T CatchParserError<T>(Func<T> operation) {
            try {
                return operation();
            } catch {
                throw new DebuggerException("Invalid value format.");
            }
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
                    case "sbyte":
                        value = await this.debugger.ReadMemory<sbyte>(pointer);
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
                        value = ToJsonNumber(await this.debugger.ReadMemory<long>(pointer));
                        break;
                    case "ushort":
                        value = await this.debugger.ReadMemory<ushort>(pointer);
                        break;
                    case "uint":
                        value = await this.debugger.ReadMemory<uint>(pointer);
                        break;
                    case "ulong":
                        value = ToJsonNumber(await this.debugger.ReadMemory<ulong>(pointer));
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
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void WriteMemory(NameValueCollection query, Action<string> respond, Action fail) {
            string type = query["type"];
            string pointerString = query["pointer"];
            string value = query["value"];

            ulong pointer;

            if (type == null || !WebServer.ParseInteger(pointerString, out pointer) || value == null) {
                fail();
                return;
            }

            string responseString;
            try {
                switch (type) {
                    case "sbyte":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => sbyte.Parse(value)));
                        break;
                    case "byte":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => byte.Parse(value)));
                        break;
                    case "short":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => short.Parse(value)));
                        break;
                    case "int":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => int.Parse(value)));
                        break;
                    case "long":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => long.Parse(value)));
                        break;
                    case "ushort":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => ushort.Parse(value)));
                        break;
                    case "uint":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => uint.Parse(value)));
                        break;
                    case "ulong":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => ulong.Parse(value)));
                        break;
                    case "float":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => float.Parse(value)));
                        break;
                    case "double":
                        await this.debugger.WriteMemory(pointer, CatchParserError(() => double.Parse(value)));
                        break;
                    default:
                        fail();
                        return;
                }

                responseString = "{ \"success\": true }";
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
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
                case "sbyte":
                    arrayString = await ReadJsonArray<sbyte>(pointer, length);
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
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
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
            if (resultString == "NaN" || 
                resultString == "Infinity" ||
                resultString == "-Infinity" ||
                typeof(System.Int64) == value.GetType() ||
                typeof(System.UInt64) == value.GetType()
            ) {
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
                SSymbolNameAndDisplacement symbolName = await this.debugger.LookupSymbolName(pointer);
                responseString = String.Format("{{ \"module\": \"{0}\", \"name\": \"{1}\", \"displacement\": {2} }}", symbolName.Module, symbolName.Name, symbolName.Displacement);
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void ServeGlobalSymbol(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string symbol = query["symbol"];
            string typeName = query["typeName"];
            string scope = query["scope"];

            if (module == null || symbol == null) {
                fail();
                return;
            }
            string responseString;
            try {
                SSymbolResult result = await this.debugger.LookupGlobalSymbol(module, symbol, typeName, scope);
                responseString = String.Format("{{ \"pointer\": {0}, \"module\": \"{1}\", \"type\": \"{2}\" }}", result.Pointer, result.Module, result.Type);
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void ServeCallStack(NameValueCollection query, Action<string> respond, Action fail) {
            string countString = query["count"];
            int count;
            if (countString == null || !WebServer.ParseInteger(countString, out count)) {
                fail();
                return;
            }

            string responseString;
            try {
                IEnumerable<SStackFrame> stackFrames = await this.debugger.GetCallStack(count);

                List<string> jsonFragments = new List<string>();
                foreach (SStackFrame frame in stackFrames) {
                    jsonFragments.Add(
                        string.Format("{{ \"instructionAddress\": {0}, \"stackAddress\": {1}, \"frameAddress\": {2} }}",
                            WebServer.ToJsonNumber(frame.InstructionAddress),
                            WebServer.ToJsonNumber(frame.StackAddress),
                            WebServer.ToJsonNumber(frame.FrameAddress)
                        )
                    );
                }

                responseString = "[" + string.Join(",", jsonFragments) + "]";
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void ServeLocals(NameValueCollection query, Action<string> respond, Action fail) {
            string instructionAddressString = query["instructionAddress"];
            string stackAddressString = query["stackAddress"];
            string frameAddressString = query["frameAddress"];

            ulong instructionAddress, stackAddress, frameAddress;
            if (instructionAddressString == null || !WebServer.ParseInteger(instructionAddressString, out instructionAddress) ||
                stackAddressString == null || !WebServer.ParseInteger(stackAddressString, out stackAddress) ||
                frameAddressString == null || !WebServer.ParseInteger(frameAddressString, out frameAddress)
            ) {
                fail();
                return;
            }

            string responseString;
            try {
                IEnumerable<SNamedSymbol> results = await this.debugger.GetSymbolsInStackFrame(instructionAddress, stackAddress, frameAddress);

                List<string> jsonFragments = new List<string>();
                foreach (SNamedSymbol symbol in results) {
                    jsonFragments.Add(
                        string.Format("{{ \"module\": \"{0}\", \"type\": \"{1}\", \"name\": \"{2}\", \"address\": {3} }}",
                            symbol.Symbol.Module,
                            symbol.Symbol.Type,
                            symbol.Name,
                            WebServer.ToJsonNumber(symbol.Symbol.Pointer)
                        )
                    );
                }

                responseString = "[" + String.Join(",", jsonFragments) + "]";
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void ServeIsEnum(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string type = query["type"];
            if (module == null || type == null) {
                fail();
                return;
            }

            string responseString;
            try {
                bool isEnum = await this.debugger.IsTypeEnum(module, type);
                responseString = String.Format("{{ \"isEnum\": {0} }}", isEnum ? "true" : "false");
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void ServeConstantName(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string type = query["type"];
            string constantString = query["constant"];
            ulong constant;
            if (module == null) {
                fail();
                return;
            }

            if (!WebServer.ParseInteger(constantString, out constant)) {
                long signedConstant;
                if (!WebServer.ParseInteger(constantString, out signedConstant)) {
                    fail();
                }
                constant = (ulong)signedConstant;
            }

            string responseString;
            try {
                IEnumerable<SConstantResult> constantResults = await this.debugger.LookupConstants(module, type, constant);
                List<string> jsonFragments = new List<string>();
                foreach (SConstantResult result in constantResults) {
                    jsonFragments.Add(String.Format("{{ \"name\": \"{0}\" }}", result.ConstantName));
                }
                responseString = "[" + String.Join(",", jsonFragments) + "]";
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void ServeConstantValue(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string type = query["type"];
            string constantName = query["name"];
            if (module == null || constantName == null) {
                fail();
                return;
            }

            string responseString;
            try {
                SConstantResult constantResult = await this.debugger.LookupConstant(module, type, constantName);
                responseString = String.Format("{{ \"value\": {0} }}", constantResult.Value); // TODO: requires 64-bit serialization
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void ServeTypeFields(NameValueCollection query, Action<string> respond, Action fail) {
            string module = query["module"];
            string type = query["type"];
            string includeBaseTypesString = query["includeBaseTypes"];
            bool includeBaseTypes;

            if (module == null || type == null || includeBaseTypesString == null || !bool.TryParse(includeBaseTypesString, out includeBaseTypes)) {
                fail();
                return;
            }

            string responseString;
            try {
                StringBuilder builder = new StringBuilder();
                builder.Append("{ \"fields\": [\n");
                bool isFirst = true;
                foreach (SFieldResult field in await this.debugger.GetAllFields(module, type, includeBaseTypes)) {
                    if (!isFirst) {
                        builder.Append(",\n");
                    }
                    isFirst = false;
                    builder.Append("{");
                    builder.AppendFormat("\"name\": \"{0}\",", field.FieldName);
                    builder.AppendFormat("\"offset\": {0},", field.Offset);
                    builder.AppendFormat("\"size\": {0},", field.Size);
                    builder.AppendFormat("\"module\": \"{0}\",", field.Module);
                    builder.AppendFormat("\"type\": \"{0}\"", field.TypeName);
                    if (field.IsBitField) {
                        builder.AppendFormat(",\"bitcount\": {0},", field.BitCount);
                        builder.AppendFormat("\"bitoffset\": {0}", field.BitOffset);
                    }
                    builder.Append("}");
                }
                builder.Append("\n] }");
                responseString = builder.ToString();
            } catch (DebuggerException ex) {
                responseString = ex.JSONError;
            }

            respond(responseString);
        }

        private async void ServeTebAddress(NameValueCollection query, Action<string> respond, Action fail) {
            ulong tebAddress = await this.debugger.TebAddress();

            if (tebAddress <= 0) {
                respond(this.JSONError("Unable to access the TEB address."));
            } else {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(ulong));
                using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                    serializer.WriteObject(memoryStream, tebAddress);
                    string result = Encoding.Default.GetString(memoryStream.ToArray());
                    respond(result);
                }
            }
        }

        private static DataContractJsonSerializer ExtensionSerializer = new DataContractJsonSerializer(typeof(JsDbgExtension));

        public bool LoadExtension(string extensionPath) {
            List<string> failedExtensions = new List<string>();
            string name;
            bool result = this.LoadExtensionAndDependencies(extensionPath, failedExtensions, out name);

            foreach (var failed in failedExtensions) {
                Console.Error.WriteLine(String.Format("Failed to load extension: {0}", failed));
            }
            return result;
        }

        private bool LoadExtensionAndDependencies(string extensionPath, List<string> failedExtensions, out string extensionName) {
            List<JsDbgExtension> extensionsToLoad = new List<JsDbgExtension>();
            if (this.LoadExtensionAndDependenciesHelper(extensionPath, extensionsToLoad, failedExtensions, out extensionName)) {
                // Listen for file changes on the newly loaded extensions.
                foreach (JsDbgExtension extensionToLoad in extensionsToLoad) {
                    extensionToLoad.Watcher = new FileSystemWatcher(extensionToLoad.path, "extension.json");
                    extensionToLoad.Watcher.NotifyFilter = NotifyFilters.LastWrite;
                    extensionToLoad.Watcher.Changed += ExtensionChanged;
                    extensionToLoad.Watcher.EnableRaisingEvents = true;
                    this.loadedExtensions.Add(extensionToLoad);
                    this.extensionsByName.Add(extensionToLoad.name.ToLowerInvariant(), extensionToLoad);
                }
                return true;
            }
            return false;
        }

        private void ExtensionChanged(object sender, FileSystemEventArgs e) {
            // Find the extension with the path and reload it.
            JsDbgExtension extensionToReload = null;
            foreach (JsDbgExtension extension in this.loadedExtensions) {
                if (extension.Watcher == sender) {
                    extensionToReload = extension;
                }
            }

            if (extensionToReload != null) {
                Console.Error.WriteLine("Reloading extension {0} due to a filesystem change.", extensionToReload.name, extensionToReload.OriginalPath);
                this.UnloadExtension(extensionToReload.name);
                List<string> failedExtensions = new List<string>();
                string extensionName;
                if (this.LoadExtensionAndDependencies(extensionToReload.OriginalPath, failedExtensions, out extensionName)) {
                    Console.Error.WriteLine("Successfully loaded {0}", extensionName);
                } else {
                    Console.Error.WriteLine("Failed to load extensions: {0}.  Please fix the extension.json file and reload the extension manually.", String.Join(" -> ", failedExtensions));
                }
            }
        }

        private static string NormalizePath(string path) {
            return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).ToLowerInvariant();
        }

        private static bool ArePathsEquivalent(string path1, string path2) {
            return NormalizePath(path1) == NormalizePath(path2);
        }

        private static bool AreExtensionsEquivalent(JsDbgExtension existingExtension, JsDbgExtension newExtension) {
            return (
                existingExtension.name.ToLowerInvariant() == newExtension.name.ToLowerInvariant() ||
                ArePathsEquivalent(existingExtension.path, newExtension.path)
            );
        }

        private bool LoadExtensionAndDependenciesHelper(string extensionPath, List<JsDbgExtension> extensionsToLoad, List<string> failedExtensions, out string extensionName) {
            bool isRelativePath = false;

            string originalExtensionPath = extensionPath;
            if (!Path.IsPathRooted(extensionPath)) {
                extensionPath = Path.Combine(this.extensionRoot, extensionPath);
                isRelativePath = true;
            }

            if (!Directory.Exists(extensionPath)) {
                failedExtensions.Add(extensionPath);
                extensionName = null;
                return false;
            }

            JsDbgExtension extension = null;
            string jsonPath = Path.Combine(extensionPath, "extension.json");
            try {
                int remainingFileInUseAttempts = 20;
                while (true) {
                    try {
                        using (FileStream file = File.Open(jsonPath, FileMode.Open, FileAccess.Read)) {
                            extension = (JsDbgExtension)ExtensionSerializer.ReadObject(file);
                        }
                        break;
                    } catch (IOException ex) when (ex.HResult == -2147024864 && remainingFileInUseAttempts > 0) { // E_SHARING_VIOLATION
                        Thread.Sleep(100);
                        --remainingFileInUseAttempts;
                    }
                }

                extension.path = extensionPath;
                extension.OriginalPath = originalExtensionPath;
                extension.WasLoadedRelativeToExtensionRoot = isRelativePath;
            } catch {
                failedExtensions.Add(extensionPath);
                extensionName = null;
                return false;
            }

            extensionName = extension.name;

            // Check if the extension has already been loaded.
            foreach (JsDbgExtension existingExtension in this.loadedExtensions.Concat(extensionsToLoad)) {
                // If any existing extension has the same name, it's already loaded.
                if (AreExtensionsEquivalent(existingExtension, extension)) {
                    return true;
                }
            }

            extensionsToLoad.Add(extension);

            // Now load any dependencies, bubbling any failures.
            if (extension.dependencies != null) {
                for (int i = 0; i < extension.dependencies.Length; ++i) {
                    string dependencyPath = extension.dependencies[i];
                    string dependencyName;
                    if (!this.LoadExtensionAndDependenciesHelper(dependencyPath, extensionsToLoad, failedExtensions, out dependencyName)) {
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

            List<string> failedExtensions = new List<string>();
            string name;
            if (!this.LoadExtensionAndDependencies(extensionPath, failedExtensions, out name)) {
                respond("{ \"error\": \"Extensions failed to load:" + String.Join(" -> ", failedExtensions).Replace("\\", "\\\\") + "\" }");
                return;
            } else {
                respond("{ \"success\": true }");
            }
        }

        private void UnloadExtension(NameValueCollection query, Action<string> respond, Action fail) {
            string extensionName = query["name"];

            if (extensionName == null) {
                fail();
                return;
            }

            if (this.UnloadExtension(extensionName)) {
                respond("{ \"success\": true }");
            } else {
                respond("{ \"error\": \"Unknown extension.\" }");
            }
        }

        private bool UnloadExtension(string extensionName) {
            for (int i = 0; i < this.loadedExtensions.Count; ++i) {
                if (this.loadedExtensions[i].name == extensionName) {
                    if (this.loadedExtensions[i].Watcher != null) {
                        this.loadedExtensions[i].Watcher.EnableRaisingEvents = false;
                        this.loadedExtensions[i].Watcher.Dispose();
                    }
                    this.extensionsByName.Remove(this.loadedExtensions[i].name.ToLowerInvariant());
                    this.loadedExtensions.RemoveAt(i);
                    return true;
                }
            }
            return false;
        }

        private void UnloadRelativeExtensions() {
            for (int i = this.loadedExtensions.Count - 1; i >= 0; --i) {
                if (this.loadedExtensions[i].WasLoadedRelativeToExtensionRoot) {
                    if (this.loadedExtensions[i].Watcher != null) {
                        this.loadedExtensions[i].Watcher.EnableRaisingEvents = false;
                        this.loadedExtensions[i].Watcher.Dispose();
                    }
                    this.extensionsByName.Remove(this.loadedExtensions[i].name.ToLowerInvariant());
                    this.loadedExtensions.RemoveAt(i);
                }
            }
        }

        private async void ServeExtensions(NameValueCollection query, Action<string> respond, Action fail) {
            List<string> jsonExtensions = new List<string>();
            Dictionary<string, bool> moduleLoadStatus = new Dictionary<string, bool>();
            foreach (JsDbgExtension extension in this.loadedExtensions) {
                // Check if the extension is target specific and only serve the extension if one or more of the target modules are loaded.
                bool serveExtension;
                if (extension.targetModules != null && (extension.targetModules.Length > 0)) {
                    serveExtension = false;

                    foreach (string moduleName in extension.targetModules) {
                        bool isModuleLoaded;
                        if (moduleLoadStatus.ContainsKey(moduleName)) {
                            isModuleLoaded = moduleLoadStatus[moduleName];
                        } else {
                            try {
                                if (!this.debugger.IsDebuggerBusy) {
                                    await this.debugger.GetModuleForName(moduleName);
                                }
                                isModuleLoaded = true;
                            } catch (Exception) {
                                isModuleLoaded = false;
                            }
                            moduleLoadStatus[moduleName] = isModuleLoaded;
                        }

                        if (isModuleLoaded) {
                            serveExtension = true;
                            break;
                        }
                    }
                } else {
                    serveExtension = true;
                }

                if (serveExtension) {
                    using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                        ExtensionSerializer.WriteObject(memoryStream, extension);
                        jsonExtensions.Add(Encoding.Default.GetString(memoryStream.ToArray()));
                    }
                }
            }

            respond(String.Format("{{ \"extensions\": [{0}] }}", String.Join(",", jsonExtensions)));
        }

        private string ReadRequestBody(HttpListenerContext context) {
            string data;
            try {
                System.IO.StreamReader reader = new System.IO.StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
                data = reader.ReadToEnd();
                return data;
            } catch (Exception exception) {
                Console.Error.WriteLine("Network Exception: {0}", exception.Message);
                return null;
            }
        }

        private async void ServePersistentStorage(string[] segments, HttpListenerContext context) {
            if (context.Request.HttpMethod == "GET") {
                string result = await this.persistentStore.Get();
                if (result != null) {
                    this.ServeUncachedString(String.Format("{{ \"data\": {0} }}", result), context);
                } else {
                    this.ServeUncachedString(this.JSONError("Unable to access the persistent store."), context);
                }
            } else if (context.Request.HttpMethod == "PUT") {
                string data = this.ReadRequestBody(context);
                if (data == null) {
                    return;
                }

                if (await this.persistentStore.Set(data)) {
                    this.ServeUncachedString("{ \"success\": true }", context);
                } else {
                    this.ServeUncachedString(this.JSONError("Unable to access the persistent store."), context);
                }
            } else {
                this.ServeFailure(context);
            }
        }

        private void ServeDefaultExtensionPath(string[] segments, HttpListenerContext context) {
            if (context.Request.HttpMethod == "GET") {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(string));
                using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                    serializer.WriteObject(memoryStream, this.extensionRoot);
                    string result = Encoding.Default.GetString(memoryStream.ToArray());
                    this.ServeUncachedString(String.Format("{{ \"path\": {0} }}", result), context);
                }
            } else if (context.Request.HttpMethod == "PUT") {
                string data = this.ReadRequestBody(context);
                if (data == null) {
                    return;
                }

                if (!Directory.Exists(data)) {
                    this.ServeUncachedString("{ \"error\": \"The directory is inaccessible or does not exist.\" }", context);
                } else {
                    if (data != this.extensionRoot) {
                        // Unload every extension that was loaded relative to the extension root.
                        this.UnloadRelativeExtensions();

                        this.extensionRoot = data;

                        // Reload the default extension if there is one at the new default path.
                        this.LoadExtension("default");
                    }

                    // Serve the new extension path.
                    DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(string));
                    using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                        serializer.WriteObject(memoryStream, this.extensionRoot);
                        string result = Encoding.Default.GetString(memoryStream.ToArray());
                        this.ServeUncachedString(String.Format("{{ \"path\": {0} }}", result), context);
                    }
                }
            } else {
                this.ServeFailure(context);
            }
        }

        private async void ServeAttachedProcesses(NameValueCollection query, Action<string> respond, Action fail) {
            uint[] processes = await this.debugger.GetAttachedProcesses();

            if (processes == null) {
                respond(this.JSONError("Unable to access the debugger."));
            } else {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(uint[]));
                using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                    serializer.WriteObject(memoryStream, processes);
                    string result = Encoding.Default.GetString(memoryStream.ToArray());
                    respond(result);
                }
            }
        }

        private void ServeTargetProcess(string[] segments, HttpListenerContext context) {
            if (context.Request.HttpMethod == "GET") {
                uint targetProcess = this.debugger.TargetProcess;
                if (targetProcess == 0) {
                    this.ServeUncachedString(this.JSONError("Unable to retrieve the target process."), context);
                } else {
                    DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(int));
                    using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                        serializer.WriteObject(memoryStream, targetProcess);
                        string result = Encoding.Default.GetString(memoryStream.ToArray());
                        this.ServeUncachedString(result, context);
                    }
                }
            } else if (context.Request.HttpMethod == "PUT") {
                string processId = this.ReadRequestBody(context);
                if (processId == null) {
                    return;
                }

                try {
                    this.debugger.TargetProcess = UInt32.Parse(processId);
                    this.ServeUncachedString("{ \"success\": true }", context);
                } catch (Exception) {
                    this.ServeUncachedString(this.JSONError("Unable to set the target process."), context);
                }
            } else {
                this.ServeFailure(context);
            }
        }

        private async void ServeCurrentProcessThreads(NameValueCollection query, Action<string> respond, Action fail) {
            uint[] threads = await this.debugger.GetCurrentProcessThreads();

            if (threads == null) {
                respond(this.JSONError("Unable to access the debugger."));
            } else {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(uint[]));
                using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                    serializer.WriteObject(memoryStream, threads);
                    string result = Encoding.Default.GetString(memoryStream.ToArray());
                    respond(result);
                }
            }
        }

        private void ServeTargetThread(string[] segments, HttpListenerContext context) {
            if (context.Request.HttpMethod == "GET") {
                uint targetThread = this.debugger.TargetThread;
                if (targetThread == 0) {
                    this.ServeUncachedString(this.JSONError("Unable to retrieve the target process."), context);
                } else {
                    DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(int));
                    using (System.IO.MemoryStream memoryStream = new System.IO.MemoryStream()) {
                        serializer.WriteObject(memoryStream, targetThread);
                        string result = Encoding.Default.GetString(memoryStream.ToArray());
                        this.ServeUncachedString(result, context);
                    }
                }
            } else if (context.Request.HttpMethod == "PUT") {
                string threadId = this.ReadRequestBody(context);
                if (threadId == null) {
                    return;
                }

                try {
                    this.debugger.TargetThread = UInt32.Parse(threadId);
                    this.ServeUncachedString("{ \"success\": true }", context);
                } catch (Exception) {
                    this.ServeUncachedString(this.JSONError("Unable to set the target process."), context);
                }
            } else {
                this.ServeFailure(context);
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
                        Console.Error.WriteLine("Closing WebSocket due to WebSocketException: {0}", socketException.Message);
                    }
                } finally {
                    this.openSockets.Remove(socket);
                }
            }
        }

        public void NotifyClientsOfDebuggerChange(DebuggerChangeEventArgs.DebuggerStatus status) {
            if (status == DebuggerChangeEventArgs.DebuggerStatus.Break) {
                this.SendWebSocketMessage("break");
            } else if (status == DebuggerChangeEventArgs.DebuggerStatus.Waiting) {
                this.SendWebSocketMessage("waiting");
            } else if (status == DebuggerChangeEventArgs.DebuggerStatus.Detaching) {
                this.SendWebSocketMessage("detaching");
            } else if (status == DebuggerChangeEventArgs.DebuggerStatus.ChangingBitness) {
                this.SendWebSocketMessage("bitnesschanged");
            } else if (status == DebuggerChangeEventArgs.DebuggerStatus.ChangingThread) {
                this.SendWebSocketMessage("threadchanged");
            } else if (status == DebuggerChangeEventArgs.DebuggerStatus.ChangingProcess) {
                this.SendWebSocketMessage("processchanged");
            }
        }

        private void SendWebSocketMessage(string message) {
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

        public bool IsListening {
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
        private Dictionary<string, JsDbgExtension> extensionsByName;
        private string extensionRoot;
        private int port;
        private ulong requestCounter;
    }
}
