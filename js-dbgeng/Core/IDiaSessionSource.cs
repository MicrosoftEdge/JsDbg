using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core {
    public class DiaSourceNotReadyException : Exception { }

    public interface IDiaSessionSource {
        Task WaitUntilReady();

        Dia2Lib.IDiaSession LoadSessionForModule(string moduleName);
    }
}
