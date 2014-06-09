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
        Task<string> LookupConstantName(string module, string type, ulong constant);
        Task<SFieldResult> LookupField(string module, string typename, string fieldName);
        Task<SSymbolResult> LookupSymbol(string symbol, bool isGlobal);
        Task<string> LookupSymbol(ulong pointer);
        Task<uint> LookupTypeSize(string module, string typename);
        Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct;
        Task<T> ReadMemory<T>(ulong pointer) where T : struct;
    }
}
