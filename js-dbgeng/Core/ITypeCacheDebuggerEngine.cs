using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core {
    public interface ITypeCacheDebuggerEngine {

        #region Debugger Primitives

        Task WaitForBreakIn();
        
        DiaSessionLoader DiaLoader { get; }

        bool IsPointer64Bit { get; }

        string GetModuleForAddress(ulong address, out ulong baseAddress);
        ulong GetBaseAddressForModule(string module);

        Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct;

        event EventHandler DebuggerBroke;
        event EventHandler BitnessChanged;
        #endregion

        #region Optional Fallback Implementations

        JsDbg.Type GetTypeFromDebugger(string module, string typename);

        Task<JsDbg.SSymbolResult> LookupGlobalSymbol(string module, string symbol);

        Task<IEnumerable<JsDbg.SSymbolResult>> LookupLocalSymbols(string module, string methodName, string symbol, int maxCount);

        Task<JsDbg.SSymbolNameResult> LookupSymbolName(ulong pointer);

        #endregion
    }
}
