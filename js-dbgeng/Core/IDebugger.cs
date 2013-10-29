using System;
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

    public interface IDebugger
    {
        void Dispose();
        System.Threading.Tasks.Task<System.Collections.Generic.IEnumerable<SFieldResult>> GetAllFields(string module, string typename);
        System.Threading.Tasks.Task<int> GetBaseClassOffset(string module, string typename, string baseTypename);
        bool IsPointer64Bit { get; }
        System.Threading.Tasks.Task<string> LookupConstantName(string module, string type, ulong constant);
        System.Threading.Tasks.Task<SFieldResult> LookupField(string module, string typename, string fieldName);
        System.Threading.Tasks.Task<SSymbolResult> LookupSymbol(string symbol, bool isGlobal);
        System.Threading.Tasks.Task<string> LookupSymbol(ulong pointer);
        System.Threading.Tasks.Task<uint> LookupTypeSize(string module, string typename);
        System.Threading.Tasks.Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct;
        System.Threading.Tasks.Task<T> ReadMemory<T>(ulong pointer) where T : struct;
    }
}
