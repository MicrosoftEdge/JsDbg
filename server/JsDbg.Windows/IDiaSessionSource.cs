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

namespace JsDbg.Windows.Dia {
    public class DiaSourceNotReadyException : Exception { }

    public interface IDiaSessionSource {
        Task WaitUntilReady();

        Dia2Lib.IDiaSession LoadSessionForModule(IDiaDataSource diaSource, string moduleName);
    }
}
