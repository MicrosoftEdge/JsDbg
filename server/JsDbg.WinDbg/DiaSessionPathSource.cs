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
using JsDbg.WinDbg;

namespace JsDbg.Windows.Dia.WinDbg {
    internal class DiaSessionPathSource : IDiaSessionSource {
        internal DiaSessionPathSource(JsDbg.WinDbg.DebuggerRunner runner, JsDbg.WinDbg.SymbolCache symbolCache) {
            this.runner = runner;
            this.symbolCache = symbolCache;
        }

        #region IDiaSessionLoader Members

        public Task WaitUntilReady() {
            return this.runner.WaitForBreakIn();
        }

        public Dia2Lib.IDiaSession LoadSessionForModule(IDiaDataSource source, string moduleName) {
            string symbolPath;
            try {
                symbolPath = this.symbolCache.GetModuleSymbolPath(moduleName);
            } catch (InvalidOperationException) {
                throw new DiaSourceNotReadyException();
            }
            source.loadDataFromPdb(symbolPath);
            IDiaSession session;
            source.openSession(out session);
            return session;
        }

        #endregion

        private DebuggerRunner runner;
        private SymbolCache symbolCache;
    }
}
