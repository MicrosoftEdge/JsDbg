using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Dia2Lib;
using System.IO;
using System.Diagnostics;
using JsDbg.Core;
using System.Runtime.InteropServices;

namespace JsDbg.Dia {
    public class DiaSessionLoader {
        [DllImport("DiaSource.dll")]
        private static extern uint LoadDataSource([MarshalAs(UnmanagedType.LPWStr)] string dllName, out IDiaDataSource result);

        public DiaSessionLoader(IEnumerable<IDiaSessionSource> sources) {
            this.sources = sources;
            this.activeSessions = new Dictionary<string, IDiaSession>();

            // First try to load directly.
            try {
                string dllName = Path.Combine(
                    Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location),
                    "msdia110.dll"
                );
                uint hr = DiaSessionLoader.LoadDataSource(dllName, out this.dataSource);
            } catch { }

            // If that fails, try to load it from COM.
            if (this.dataSource == null) {
                try {
                    this.dataSource = new DiaSource();
                } catch { }
            }
        }

        public void ClearSymbols() {
            this.activeSessions = new Dictionary<string, IDiaSession>();
        }

        public async Task<IDiaSession> LoadDiaSession(string module) {
            if (this.dataSource == null) {
                return null;
            }

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
                        IDiaSession session = source.LoadSessionForModule(this.dataSource, module);
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

        private IDiaDataSource dataSource;
        private Dictionary<string, IDiaSession> activeSessions;
        private IEnumerable<IDiaSessionSource> sources;
    }
}
