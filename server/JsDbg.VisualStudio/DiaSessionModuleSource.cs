//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Threading.Tasks;
using Dia2Lib;
using JsDbg.VisualStudio;
using System.IO;

namespace JsDbg.Windows.Dia.VisualStudio {
    class DiaSessionModuleSource : IDiaSessionSource {
        private class ModuleReader : IDiaReadExeAtRVACallback, IDiaLoadCallback {
            internal ModuleReader(DebuggerEngine engine, string moduleName) {
                this.engine = engine;
                this.baseAddress = engine.GetModuleForNameSync(moduleName).BaseAddress;
            }

            private DebuggerEngine engine;
            private ulong baseAddress;

            #region IDiaReadExeAtRVACallback Members

            public void ReadExecutableAtRVA(uint relativeVirtualAddress, uint cbData, ref uint pcbData, byte[] data) {
                this.engine.ReadArraySync<byte>(this.baseAddress + relativeVirtualAddress, cbData).CopyTo(data, 0);
                pcbData = cbData;
            }

            #endregion

            #region IDiaLoadCallback Members

            public void NotifyDebugDir(bool fExecutable, uint cbData, byte[] data) { }

            public void NotifyOpenDBG(string dbgPath, uint resultCode) { }

            public void NotifyOpenPDB(string pdbPath, uint resultCode) {
                Console.WriteLine("Attempting to read PDB: {0}", pdbPath);
            }

            public void RestrictRegistryAccess() {
                return; // Allow it.
            }

            public void RestrictSymbolServerAccess() {
                return; // Allow it.
            }

            #endregion
        }

        internal DiaSessionModuleSource(DebuggerRunner runner, DebuggerEngine engine) {
            this.runner = runner;
            this.engine = engine;
        }

        private string SymPath {
            get {
                string temporaryPath = Path.Combine(Path.GetTempPath(), "symbols");
                string[] caches = { "", @"C:\symbols", @"C:\debuggers\wow64\sym", @"C:\debuggers\sym", temporaryPath };
                string[] servers = { "", "http://symweb/" };
                return String.Format("CACHE*{0};SRV*{1}", string.Join(";CACHE*", caches), string.Join(";SRV*", servers));
            }
        }

        #region IDiaSessionSource Members

        public Task WaitUntilReady() {
            return this.runner.WaitForBreakIn();
        }

        public IDiaSession LoadSessionForModule(IDiaDataSource source, string moduleName) {
            try {
                string modulePath, symbolPath;
                this.runner.GetModuleInfo(moduleName, out modulePath, out symbolPath);
                
                if (modulePath == null) {
                    modulePath = moduleName;
                }
                source.loadDataForExe(modulePath, this.SymPath, new ModuleReader(this.engine, moduleName));
            } catch {
                throw new DiaSourceNotReadyException();
            }
            IDiaSession session;
            source.openSession(out session);
            return session;
        }

        #endregion

        private DebuggerRunner runner;
        private DebuggerEngine engine;
    }
}
