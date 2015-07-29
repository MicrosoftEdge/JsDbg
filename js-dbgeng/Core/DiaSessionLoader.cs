using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dia2Lib;
using System.IO;
using System.Diagnostics;

namespace Core {
    public class DiaSessionLoader {
        public DiaSessionLoader(IEnumerable<IDiaSessionSource> sources) {
            this.sources = sources;
            this.activeSessions = new Dictionary<string, IDiaSession>();
            this.didAttemptDiaRegistration = false;
        }

        public IDiaSession LoadDiaSession(string module) {
            if (this.activeSessions.ContainsKey(module)) {
                return this.activeSessions[module];
            }

            // Try each of the sources until we're able to get one.
            foreach (IDiaSessionSource source in this.sources) {
                try {
                    IDiaSession session = source.LoadSessionForModule(module);
                    if (session != null) {
                        this.activeSessions[module] = session;
                        return session;
                    }
                } catch (JsDbg.DebuggerException) {
                    throw;
                } catch (System.Runtime.InteropServices.COMException comException) {
                    if ((uint)comException.ErrorCode == 0x80040154 && !this.didAttemptDiaRegistration) {
                        // The DLL isn't registered.
                        this.didAttemptDiaRegistration = true;
                        try {
                            this.AttemptDiaRegistration();
                            // Retry the load attempts.
                            return this.LoadDiaSession(module);
                        } catch (Exception ex) {
                            Console.Out.WriteLine("Unable to register DIA: {0}", ex.Message);
                            return null;
                        }
                    }
                } catch {
                    // Try the next source.
                }
            }

            return null;
        }

        private void AttemptDiaRegistration() {
            string dllName = "msdia110.dll";
            Console.WriteLine("Attempting to register {0}.  This will require elevation...", dllName);

            // Copy it down to the support directory if needed.
            string localSupportDirectory = JsDbg.WebServer.LocalSupportDirectory;
            string sharedSupportDirectory = JsDbg.WebServer.SharedSupportDirectory;

            string dllPath = Path.Combine(localSupportDirectory, dllName);
            if (!File.Exists(dllPath)) {
                if (!Directory.Exists(localSupportDirectory)) {
                    Directory.CreateDirectory(localSupportDirectory);
                }
                string remotePath = Path.Combine(sharedSupportDirectory, dllName);
                File.Copy(remotePath, dllPath);
            }

            System.Threading.Thread.Sleep(1000);

            ProcessStartInfo regsvr = new ProcessStartInfo("regsvr32", dllPath);
            regsvr.Verb = "runas";

            Process.Start(regsvr).WaitForExit();

            System.Threading.Thread.Sleep(1000);
        }

        private Dictionary<string, IDiaSession> activeSessions;
        private IEnumerable<IDiaSessionSource> sources;
        private bool didAttemptDiaRegistration;
    }
}
