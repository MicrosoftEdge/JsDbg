using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dia2Lib;

namespace JsDbg {
    internal class DiaSessionPathSource : Core.IDiaSessionSource {
        internal DiaSessionPathSource(SymbolCache symbolCache) {
            this.symbolCache = symbolCache;
        }

        #region IDiaSessionLoader Members

        public Dia2Lib.IDiaSession LoadSessionForModule(string moduleName) {
            DiaSource source = new DiaSource();
            source.loadDataFromPdb(this.symbolCache.GetModuleSymbolPath(moduleName));
            IDiaSession session;
            source.openSession(out session);
            return session;
        }

        #endregion

        private SymbolCache symbolCache;
    }
}
