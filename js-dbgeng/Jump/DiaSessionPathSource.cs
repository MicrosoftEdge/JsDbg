using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dia2Lib;

namespace Sushraja.Jump {
    class DiaSessionPathSource : Core.IDiaSessionSource {
        internal DiaSessionPathSource(Debugger debugger) {
            this.debugger = debugger;
        }

        #region IDiaSessionSource Members

        public Task WaitUntilReady() {
            return null;
        }

        public IDiaSession LoadSessionForModule(string moduleName) {
            DiaSource source = new DiaSource();
            source.loadDataFromPdb(this.debugger.GetModuleSymbolPath(moduleName));
            IDiaSession session;
            source.openSession(out session);
            return session;
        }

        #endregion

        private Debugger debugger;
    }
}
