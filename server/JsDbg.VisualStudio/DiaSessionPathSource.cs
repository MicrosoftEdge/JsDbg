//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dia2Lib;
using JsDbg.VisualStudio;

namespace JsDbg.Windows.Dia.VisualStudio {
    class DiaSessionPathSource : IDiaSessionSource {
        internal DiaSessionPathSource(DebuggerRunner runner) {
            this.runner = runner;
        }

        #region IDiaSessionSource Members

        public Task WaitUntilReady() {
            return this.runner.WaitForBreakIn();
        }

        public IDiaSession LoadSessionForModule(IDiaDataSource source, string moduleName) {
            string symbolPath = null;
            try {
                string modulePath;
                this.runner.GetModuleInfo(moduleName, out modulePath, out symbolPath);
            } catch { }

            if (symbolPath == null) {
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
