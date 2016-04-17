using System;
using System.Threading.Tasks;
using Dia2Lib;
using JsDbg.WinDbg;

namespace JsDbg.Dia.WinDbg {
    internal class DiaSessionPathSource : IDiaSessionSource {
        internal DiaSessionPathSource(JsDbg.WinDbg.WinDbgDebuggerRunner runner, JsDbg.WinDbg.SymbolCache symbolCache) {
            this.runner = runner;
            this.symbolCache = symbolCache;
        }

        #region IDiaSessionLoader Members

        public Task WaitUntilReady() {
            return this.runner.WaitForBreakIn();
        }

        public Dia2Lib.IDiaSession LoadSessionForModule(string moduleName) {
            DiaSource source = new DiaSource();

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

        private WinDbgDebuggerRunner runner;
        private SymbolCache symbolCache;
    }
}
