using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace JsDbg
{
    public class DebuggerException : Exception
    {
        public DebuggerException(string message)
            : base(message)
        {

        }
    }

    public struct SSymbolNameResult
    {
        public string Module;
        public string Name;
    }
    
    public struct SSymbolResult
    {
        public ulong Pointer;
        public string Type;
        public string Module;
    }

    public struct SFieldResult
    {
        public uint Offset;
        public uint Size;
        public byte BitOffset;
        public byte BitCount;
        public string FieldName;
        public string TypeName;

        public bool IsBitField
        {
            get { return this.BitCount > 0; }
        }
    }

    public struct SConstantResult
    {
        public ulong Value;
        public string ConstantName;
    }

    public struct SBaseTypeResult
    {
        public string TypeName;
        public int Offset;
    }

    public interface IDebugger
    {
        event EventHandler DebuggerBroke;
        void Dispose();
        Task<IEnumerable<SFieldResult>> GetAllFields(string module, string typename);
        Task<IEnumerable<SBaseTypeResult>> GetBaseTypes(string module, string typeName);
        bool IsPointer64Bit { get; }
        Task<SConstantResult> LookupConstant(string module, string type, ulong constantValue);
        Task<SConstantResult> LookupConstant(string module, string type, string constantName);
        Task<SFieldResult> LookupField(string module, string typename, string fieldName);
        Task<SSymbolResult> LookupGlobalSymbol(string module, string symbol);
        Task<IEnumerable<SSymbolResult>> LookupLocalSymbols(string module, string methodName, string symbol, int maxCount);
        Task<SSymbolNameResult> LookupSymbolName(ulong pointer);
        Task<uint> LookupTypeSize(string module, string typename);
        Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct;
        Task<T> ReadMemory<T>(ulong pointer) where T : struct;
    }
}
