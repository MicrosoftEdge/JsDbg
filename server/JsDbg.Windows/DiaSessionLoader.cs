//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Dia2Lib;
using System.IO;
using System.Diagnostics;
using JsDbg.Core;
using System.Runtime.InteropServices;

namespace JsDbg.Windows.Dia {
    public class DiaSessionLoader {
        [DllImport("DiaSource.dll")]
        private static extern uint LoadDataSource([MarshalAs(UnmanagedType.LPWStr)] string dllName, out IDiaDataSource result);

        public DiaSessionLoader(IEnumerable<IDiaSessionSource> sources) {
            this.sources = sources;
            this.activeSessions = new Dictionary<string, IDiaSession>();
        }

        public void ClearSymbols() {
            this.activeSessions = new Dictionary<string, IDiaSession>();
        }

        private IDiaDataSource CreateDataSource() {
            IDiaDataSource result = null;
            // First try to load directly.
            try {
                string dllName = Path.Combine(
                    Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location),
                    "msdia140.dll"
                );
                uint hr = DiaSessionLoader.LoadDataSource(dllName, out result);
            } catch { }

            // If that fails, try to load it from COM.
            if (result == null) {
                try {
                    result = new DiaSource();
                } catch { }
            }

            return result;
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
                        IDiaDataSource dataSource = this.CreateDataSource();
                        if (dataSource == null) {
                            // Without a data source we can't use DIA at all.
                            break;
                        }
                        IDiaSession session = source.LoadSessionForModule(dataSource, module);
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
        
        private Dictionary<string, IDiaSession> activeSessions;
        private IEnumerable<IDiaSessionSource> sources;
    }
}
