using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dia2Lib;

namespace JsDbg {
    internal class DiaSessionPathSource : Core.IDiaSessionSource {
        internal DiaSessionPathSource(WinDbgDebuggerRunner runner, SymbolCache symbolCache) {
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
                throw new Core.DiaSourceNotReadyException();
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
