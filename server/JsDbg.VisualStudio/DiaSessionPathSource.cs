using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dia2Lib;
using JsDbg.VisualStudio;

namespace JsDbg.Dia.VisualStudio {
    class DiaSessionPathSource : IDiaSessionSource {
        internal DiaSessionPathSource(DebuggerRunner runner) {
            this.runner = runner;
        }

        #region IDiaSessionSource Members

        public Task WaitUntilReady() {
            return this.runner.WaitForBreakIn();
        }

        public IDiaSession LoadSessionForModule(IDiaDataSource source, string moduleName) {
            string symbolPath;
            try {
                symbolPath = this.runner.GetModuleSymbolPath(moduleName);
            } catch {
                throw new DiaSourceNotReadyException();
            }
            source.loadDataFromPdb(symbolPath);
            IDiaSession session;
            source.openSession(out session);
            return session;
        }

        #endregion

        private DebuggerRunner runner;
    }
}
