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

    public struct SModule {
        public string Name;
        public ulong BaseAddress;
    }

    public interface ITypeCacheDebuggerEngine {

        #region Debugger Primitives
        
        DiaSessionLoader DiaLoader { get; }

        bool IsPointer64Bit { get; }

        Task<SModule> GetModuleForAddress(ulong address);

        Task<SModule> GetModuleForName(string module);

        Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct;

        Task<IEnumerable<SStackFrameWithContext>> GetCurrentCallStack();

        event EventHandler DebuggerBroke;
        event EventHandler BitnessChanged;
        #endregion

        #region Optional Fallback Implementations

        Task<JsDbg.Type> GetTypeFromDebugger(string module, string typename);

        Task<JsDbg.SSymbolResult> LookupGlobalSymbol(string module, string symbol);

        Task<IEnumerable<JsDbg.SSymbolResult>> LookupLocalsInStackFrame(SStackFrameWithContext stackFrameWithContext, string symbolName);

        Task<JsDbg.SSymbolNameResultAndDisplacement> LookupSymbolName(ulong pointer);

        #endregion
    }
}
