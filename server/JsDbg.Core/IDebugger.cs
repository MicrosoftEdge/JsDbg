using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace JsDbg.Core {
    public class DebuggerException : Exception {
        public DebuggerException(string message)
            : base(message) {

        }

        public string JSONError {
            get { return String.Format("{{ \"error\": \"{0}\" }}", this.Message); }
        }
    }

    public struct SSymbolNameAndDisplacement {
        public string Module;
        public string Name;
        public ulong Displacement;
    }

    public struct SSymbolResult {
        public ulong Pointer;
        public string Type;
        public string Module;
    }

    public struct SNamedSymbol {
        public SSymbolResult Symbol;
        public string Name;
    }

    public struct SStackFrame {
        public ulong InstructionAddress;
        public ulong StackAddress;
        public ulong FrameAddress;
    }

    public struct SFieldResult {
        public uint Offset;
        public uint Size;
        public byte BitOffset;
        public byte BitCount;
        public string FieldName;
        public string Module;
        public string TypeName;

        public bool IsBitField {
            get { return this.BitCount > 0; }
        }
    }

    public struct SConstantResult {
        public ulong Value;
        public string ConstantName;
    }

    public struct SBaseTypeResult {
        public string Module;
        public string TypeName;
        public int Offset;
    }

    public class DebuggerChangeEventArgs {
        public enum DebuggerStatus {
            Break,
            Waiting,
            Detaching,
            ChangingBitness
        }

        public DebuggerChangeEventArgs(DebuggerStatus status) { Status = status; }
        public DebuggerStatus Status { get; private set; }
    }

    public delegate void DebuggerChangeEventHandler(object sender, DebuggerChangeEventArgs e);

    public delegate void DebuggerMessageEventHandler(object sender, string message);

    public interface IDebugger {
        event DebuggerChangeEventHandler DebuggerChange;
        event DebuggerMessageEventHandler DebuggerMessage;

        void Dispose();
        Task<IEnumerable<SFieldResult>> GetAllFields(string module, string typename, bool includeBaseTypes);
        Task<IEnumerable<SBaseTypeResult>> GetBaseTypes(string module, string typeName);
        bool IsPointer64Bit { get; }
        Task<bool> IsTypeEnum(string module, string type);
        Task<SConstantResult> LookupConstant(string module, string type, ulong constantValue);
        Task<SConstantResult> LookupConstant(string module, string type, string constantName);
        Task<SFieldResult> LookupField(string module, string typename, string fieldName);
        Task<SSymbolResult> LookupGlobalSymbol(string module, string symbol);
        Task<IEnumerable<SStackFrame>> GetCallStack(int frameCount);
        Task<IEnumerable<SNamedSymbol>> GetSymbolsInStackFrame(ulong instructionAddress, ulong stackAddress, ulong frameAddress);
        Task<SSymbolNameAndDisplacement> LookupSymbolName(ulong pointer);
        Task<uint> LookupTypeSize(string module, string typename);
        Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct;
        Task<T> ReadMemory<T>(ulong pointer) where T : struct;
        Task WriteMemory<T>(ulong pointer, T value) where T : struct;
    }
}