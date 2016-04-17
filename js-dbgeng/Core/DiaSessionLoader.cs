using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Dia2Lib;
using System.IO;
using System.Diagnostics;
using JsDbg.Core;

namespace JsDbg.Dia {
    public class DiaSessionLoader {
        public DiaSessionLoader(IConfiguration configuration, IEnumerable<IDiaSessionSource> sources) {
            this.configuration = configuration;
            this.sources = sources;
            this.activeSessions = new Dictionary<string, IDiaSession>();
            this.didAttemptDiaRegistration = false;
        }

        public async Task<IDiaSession> LoadDiaSession(string module) {
            module = module.ToLowerInvariant();

            if (this.activeSessions.ContainsKey(module)) {
                return this.activeSessions[module];
            }

            // Try each of the sources until we're able to get one.
            foreach (IDiaSessionSource source in this.sources) {
                int attempts = 1;
                while (attempts <= 3) {
                    if (attempts > 1) {
                        await source.WaitUntilReady();
                    }
                    ++attempts;

                    try {
                        IDiaSession session = source.LoadSessionForModule(module);
                        if (session != null) {
                            this.activeSessions[module] = session;
                            return session;
                        }
                        break;
                    } catch (DebuggerException) {
                        throw;
                    } catch (DiaSourceNotReadyException) {
                        // Try again.
                        continue;
                    } catch (System.Runtime.InteropServices.COMException comException) {
                        if ((uint)comException.ErrorCode == 0x80040154 && !this.didAttemptDiaRegistration) {
                            // The DLL isn't registered.
                            this.didAttemptDiaRegistration = true;
                            try {
                                this.AttemptDiaRegistration();
                                // Try again.
                                continue;
                            } catch (Exception ex) {
                                Console.Out.WriteLine("Unable to register DIA: {0}", ex.Message);
                                return null;
                            }
                        }
                        break;
                    } catch {
                        // Try the next source.
                        break;
                    }
                }
            }

            // The session load failed.
            this.activeSessions[module] = null;

            return null;
        }

        private void AttemptDiaRegistration() {
            string dllName = "msdia110.dll";
            Console.WriteLine("Attempting to register {0}.  This will require elevation...", dllName);

            // Copy it down to the support directory if needed.
            string localSupportDirectory = configuration.LocalSupportDirectory;
            string dllPath = Path.Combine(localSupportDirectory, dllName);

            if (!File.Exists(dllPath)) {
                if (!Directory.Exists(localSupportDirectory)) {
                    Directory.CreateDirectory(localSupportDirectory);
                }
                string remotePath = Path.Combine(Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location), dllName);
                File.Copy(remotePath, dllPath);
            }

            System.Threading.Thread.Sleep(1000);

            ProcessStartInfo regsvr = new ProcessStartInfo("regsvr32", "/s " + dllPath);
            regsvr.Verb = "runas";

            Process.Start(regsvr).WaitForExit();

            System.Threading.Thread.Sleep(1000);
        }

        private IConfiguration configuration;
        private Dictionary<string, IDiaSession> activeSessions;
        private IEnumerable<IDiaSessionSource> sources;
        private bool didAttemptDiaRegistration;
    }
}
