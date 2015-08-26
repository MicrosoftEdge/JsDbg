using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dia2Lib;

namespace Sushraja.Jump {
    class DiaSessionPathSource : Core.IDiaSessionSource {
        internal DiaSessionPathSource(VsDebuggerRunner runner) {
            this.runner = runner;
        }

        #region IDiaSessionSource Members

        public Task WaitUntilReady() {
            return this.runner.WaitForBreakIn();
        }

        public IDiaSession LoadSessionForModule(string moduleName) {
            DiaSource source = new DiaSource();
            string symbolPath;
            try {
                symbolPath = this.runner.GetModuleSymbolPath(moduleName);
            } catch {
                throw new Core.DiaSourceNotReadyException();
            }
            source.loadDataFromPdb(symbolPath);
            IDiaSession session;
            source.openSession(out session);
            return session;
        }

        #endregion

        private VsDebuggerRunner runner;
    }
}
