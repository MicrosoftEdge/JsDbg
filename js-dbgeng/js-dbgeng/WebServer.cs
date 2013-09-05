using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Net;

namespace JsDbg {
    class WebServer : IDisposable {

        internal WebServer(Debugger debugger) {
            this.httpListener = new HttpListener();
            this.httpListener.Prefixes.Add("http://127.0.0.1:9999/"); // TODO:ARGS: port
            this.debugger = debugger;
            this.path = @"C:\my\dev\webserver\"; // TODO:ARGS: web server path
        }

        internal async Task Listen() {
            try {
                this.httpListener.Start();
            } catch (Exception ex) {
                Console.Out.WriteLine(ex.Message);
                throw ex;
            }

            Console.Out.WriteLine("Listening for http on port 9999...");
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

                    Console.Out.WriteLine("request for " + context.Request.RawUrl);

                    string[] segments = context.Request.Url.Segments;

                    if (segments.Length < 2 || (segments.Length == 2 && segments[1].TrimEnd('/') == "static")) {
                        this.ServeStaticFile("index.html", context.Response);
                        continue;
                    } else if (segments.Length > 3 && segments[1].TrimEnd('/') == "static") {
                        // static file
                        string path = "";
                        for (int i = 2; i < segments.Length; ++i) {
                            path = System.IO.Path.Combine(path, segments[i]);
                        }
                        this.ServeStaticFile(path, context.Response);
                        continue;
                    } else {
                        // dynamic request
                        switch (segments[1].TrimEnd('/')) {
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
                        case "pointersize":
                            this.ServePointerSize(segments, context);
                            break;
                        case "constantname":
                            this.ServeConstantName(segments, context);
                            break;
                        default:
                            context.Response.Redirect("/");
                            context.Response.OutputStream.Close();
                            break;
                        }
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

        private void ServeStaticFile(string filename, HttpListenerResponse response) {
            string fullPath = System.IO.Path.Combine(this.path, filename);
            try {
                using (System.IO.FileStream fileStream = System.IO.File.OpenRead(fullPath)) {
                    response.AddHeader("Cache-Control", "no-cache");
                    response.ContentType = System.Web.MimeMapping.GetMimeMapping(filename);
                    response.ContentLength64 = fileStream.Length;
                    fileStream.CopyTo(response.OutputStream);
                    response.OutputStream.Close();
                }
            } catch {
                response.StatusCode = 404;
                response.OutputStream.Close();
            }
        }

        private void ServeFieldOffset(string[] segments, HttpListenerContext context) {
            string module = context.Request.QueryString["module"];
            string baseType = context.Request.QueryString["type"];
            string fieldsString = context.Request.QueryString["fields"];
            if (module == null || baseType == null || fieldsString == null) {
                context.Response.StatusCode = 400;
                context.Response.OutputStream.Close();
                return;
            }

            string[] fields = { };
            if (fieldsString != "") {
                fields = fieldsString.Split(',');
            }

            string responseString;

            try {
                uint offset, size;
                string resultType;
                this.debugger.LookupField(module, baseType, fields, out offset, out size, out resultType);

                // Construct the response.
                responseString = String.Format("{{ \"type\": \"{0}\", \"offset\": {1}, \"size\": {2} }}", resultType, offset, size);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private void ServeMemory(string[] segments, HttpListenerContext context) {
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
                            value = this.debugger.ReadMemory<ulong>(pointer);
                        } else {
                            value = this.debugger.ReadMemory<uint>(pointer);
                        }
                        break;
                    case "byte":
                        value = this.debugger.ReadMemory<byte>(pointer);
                        break;
                    case "short":
                        value = this.debugger.ReadMemory<short>(pointer);
                        break;
                    case "int":
                        value = this.debugger.ReadMemory<int>(pointer);
                        break;
                    case "long":
                        value = this.debugger.ReadMemory<long>(pointer);
                        break;
                    case "ushort":
                        value = this.debugger.ReadMemory<ushort>(pointer);
                        break;
                    case "uint":
                        value = this.debugger.ReadMemory<uint>(pointer);
                        break;
                    case "ulong":
                        value = this.debugger.ReadMemory<ulong>(pointer);
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

        private void ServeArray(string[] segments, HttpListenerContext context) {
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
                        arrayString = ReadJsonArray<ulong>(pointer, length);
                    } else {
                        arrayString = ReadJsonArray<uint>(pointer, length);
                    }
                    break;
                case "byte":
                    arrayString = ReadJsonArray<byte>(pointer, length);
                    break;
                case "short":
                    arrayString = ReadJsonArray<short>(pointer, length);
                    break;
                case "int":
                    arrayString = ReadJsonArray<int>(pointer, length);
                    break;
                case "long":
                    arrayString = ReadJsonArray<long>(pointer, length);
                    break;
                case "ushort":
                    arrayString = ReadJsonArray<ushort>(pointer, length);
                    break;
                case "uint":
                    arrayString = ReadJsonArray<uint>(pointer, length);
                    break;
                case "ulong":
                    arrayString = ReadJsonArray<ulong>(pointer, length);
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

        private string ReadJsonArray<T>(ulong pointer, ulong length) where T : struct {
            return ToJsonArray(this.debugger.ReadArray<T>(pointer, length));
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

        private void ServeSymbolName(string[] segments, HttpListenerContext context) {
            string pointerString = context.Request.QueryString["pointer"];
            
            ulong pointer;
            if (pointerString == null || !UInt64.TryParse(pointerString, out pointer)) {
                this.ServeFailure(context);
                return;
            }

            string responseString;
            try {
                string symbolName = this.debugger.LookupSymbol(pointer);
                responseString = String.Format("{{ \"symbolName\": \"{0}\" }}", symbolName);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        private void ServePointerSize(string[] segments, HttpListenerContext context) {
            this.ServeUncachedString(String.Format("{{ \"pointerSize\": \"{0}\" }}", (this.debugger.IsPointer64Bit ? 8 : 4)), context);
        }

        private void ServeConstantName(string[] segments, HttpListenerContext context) {
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
                string constantName = this.debugger.LookupConstantName(module, type, constant);
                responseString = String.Format("{{ \"name\": \"{0}\" }}", constantName);
            } catch (Debugger.DebuggerException ex) {
                responseString = String.Format("{{ \"error\": \"{0}\" }}", ex.Message);
            }

            this.ServeUncachedString(responseString, context);
        }

        internal void Abort() {
            this.httpListener.Abort();
        }


        #region IDisposable Members

        public void Dispose() {
            this.debugger.Dispose();
        }

        #endregion

        private HttpListener httpListener;
        private Debugger debugger;
        private string path;
    }
}
