using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Core {
    public struct SStackFrameWithContext {
        public JsDbg.SStackFrame StackFrame;
        public object Context;
    }

    public interface ITypeCacheDebuggerEngine {

        #region Debugger Primitives

        Task WaitForBreakIn();
        
        DiaSessionLoader DiaLoader { get; }

        bool IsPointer64Bit { get; }

        string GetModuleForAddress(ulong address, out ulong baseAddress);

        ulong GetBaseAddressForModule(string module);

        Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct;

        IEnumerable<SStackFrameWithContext> GetCurrentCallStack();

        event EventHandler DebuggerBroke;
        event EventHandler BitnessChanged;
        #endregion

        #region Optional Fallback Implementations

        JsDbg.Type GetTypeFromDebugger(string module, string typename);

        Task<JsDbg.SSymbolResult> LookupGlobalSymbol(string module, string symbol);

        IEnumerable<JsDbg.SSymbolResult> LookupLocalsInStackFrame(SStackFrameWithContext stackFrameWithContext, string symbolName);

        JsDbg.SSymbolNameResult LookupSymbolName(ulong pointer, out ulong displacement);

        #endregion
    }
}
