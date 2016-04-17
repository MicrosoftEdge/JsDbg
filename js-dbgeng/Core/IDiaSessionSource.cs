using System;
using System.Threading.Tasks;

namespace JsDbg.Dia {
    public class DiaSourceNotReadyException : Exception { }

    public interface IDiaSessionSource {
        Task WaitUntilReady();

        Dia2Lib.IDiaSession LoadSessionForModule(string moduleName);
    }
}
