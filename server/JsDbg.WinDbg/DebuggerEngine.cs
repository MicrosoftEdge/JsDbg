//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;
using JsDbg.Core;
using JsDbg.Windows.Dia;

namespace JsDbg.WinDbg {
    class DebuggerEngine : IDiaDebuggerEngine {
        public DebuggerEngine(DebuggerRunner runner, DebugClient client, DebugControl control, DiaSessionLoader diaLoader) {
            this.runner = runner;
            this.client = client;
            this.client.OutputMask = OutputModes.Normal;
            this.control = control;
            this.isPointer64Bit = (this.control.EffectiveProcessorType == Processor.Amd64);
            this.symbolCache = new SymbolCache(this.client);
            this.dataSpaces = new DebugDataSpaces(this.client);
            this.symbols = new DebugSymbols(this.client);
            this.diaLoader = diaLoader;
        }

        internal void NotifyDebuggerStatusChange(DebuggerChangeEventArgs.DebuggerStatus status) {
            this.DebuggerChange?.Invoke(this, new DebuggerChangeEventArgs(status));
        }

        #region ITypeCacheDebuggerEngine Members

        public DiaSessionLoader DiaLoader {
            get { return this.diaLoader; }
        }

        public bool IsDebuggerBusy {
            get { return this.runner.IsDebuggerBusy; }
        }

        public bool IsPointer64Bit {
            get { return this.isPointer64Bit; }
            set {
                if (value != this.isPointer64Bit) {
                    this.isPointer64Bit = value;
                    this.DebuggerChange?.Invoke(this, new DebuggerChangeEventArgs(DebuggerChangeEventArgs.DebuggerStatus.ChangingBitness));
                }
            }
        }

        public async Task<ulong> TebAddress() {
            return await this.runner.TebAddress();
        }

        public uint TargetProcess {
            get { return this.runner.TargetProcessSystemId; }
            set { this.runner.SetTargetProcess(value); }
        }

        public async Task<uint[]> GetAttachedProcesses() {
            return await this.runner.GetAttachedProcesses();
        }

        public uint TargetThread {
            get { return this.runner.TargetThreadSystemId; }
            set { this.runner.SetTargetThread(value); }
        }

        public async Task<uint[]> GetCurrentProcessThreads() {
            return await this.runner.GetCurrentProcessThreads();
        }

        public Task<Core.SModule> GetModuleForAddress(ulong address) {
            return this.runner.AttemptOperation<Core.SModule>(() => {
                Core.SModule result = new Core.SModule();
                this.symbolCache.GetModule(address, out result.BaseAddress, out result.Name);
                return result;
            }, String.Format("Unable to get module at address 0x{0:x8}", address));
        }

        public Task<Core.SModule> GetModuleForName(string module) {
            return this.runner.AttemptOperation<Core.SModule>(() => {
                Core.SModule result = new Core.SModule();
                result.Name = module;
                result.BaseAddress = this.symbolCache.GetModuleBase(module);
                return result;
            }, String.Format("Unable to get module: ", module));
        }

        public Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct {
            return this.runner.AttemptOperation<T[]>(() => {
                T[] result = new T[size];
                uint bytesRead = this.dataSpaces.ReadVirtual<T>(pointer, result);
                if ((uint)System.Runtime.InteropServices.Marshal.SizeOf(typeof(T)) * size > bytesRead) {
                    throw new DebuggerException("Unable to read the entire array.");
                }
                return result;
            }, String.Format("Invalid memory address: 0x{0:x8}", pointer));
        }

        public Task WriteValue<T>(ulong pointer, T value) where T : struct {
            return this.runner.AttemptOperation<bool>(() => {
                T[] data = { value };
                uint bytesWritten = this.dataSpaces.WriteVirtual<T>(pointer, data);
                if (bytesWritten < System.Runtime.InteropServices.Marshal.SizeOf(typeof(T))) {
                    throw new DebuggerException("Unable to write the entire value.");
                }
                return true;
            }, String.Format("Unable to write to memory address: 0x{0:x8}", pointer));
        }

        public Task<IEnumerable<Core.SStackFrame>> GetCurrentCallStack(int requestedFrameCount) {
            return this.runner.AttemptOperation<IEnumerable<Core.SStackFrame>>(() => {
                List<Core.SStackFrame> stackFrames = new List<Core.SStackFrame>();

                uint frameCount = 0;
                if (requestedFrameCount < 0) {
                    frameCount = 512; // TODO: Don't set an artificial max.
                } else {
                    frameCount = (uint)requestedFrameCount;
                }
                DebugStackTrace stack = this.control.GetStackTrace(frameCount);
                foreach (DebugStackFrame frame in stack) {
                    stackFrames.Add(new SStackFrame() {
                        FrameAddress = frame.FrameOffset,
                        StackAddress = frame.StackOffset,
                        InstructionAddress = frame.InstructionOffset
                    });
                }

                return stackFrames;
            }, "Unable to get callstack.");
        }

        public event DebuggerChangeEventHandler DebuggerChange;

        private void PrintDotOnDebugOutput(object sender, DebugOutputEventArgs e) {
            Console.Out.Write('.');
        }

        public Task<JsDbg.Windows.Dia.Type> GetTypeFromDebugger(string module, string typename) {
            return this.runner.AttemptOperation<JsDbg.Windows.Dia.Type>(() => {
                uint typeSize = 0;

                ulong moduleBase;
                try {
                    moduleBase = this.symbolCache.GetModuleBase(module);
                } catch {
                    throw new DebuggerException(String.Format("Invalid module name: {0}", module));
                }

                // Get the type id.
                uint typeId;
                try {
                    typeId = this.symbolCache.GetTypeId(moduleBase, typename);
                } catch {
                    throw new DebuggerException(String.Format("Invalid type name: {0}", typename));
                }

                // Get the type size.
                try {
                    typeSize = this.symbolCache.GetTypeSize(moduleBase, typeId);
                } catch {
                    throw new DebuggerException("Internal Exception: Invalid type id.");
                }

                // The type is valid so we should be able to dt it without any problems.
                string command = String.Format("dt -v {0}!{1}", module, typename);
                System.Diagnostics.Debug.WriteLine(String.Format("Executing command: {0}", command));
                DumpTypeParser parser = new DumpTypeParser();
                this.client.DebugOutput += parser.DumpTypeOutputHandler;
                this.client.DebugOutput += PrintDotOnDebugOutput;
                this.control.Execute(OutputControl.ToThisClient, command, ExecuteOptions.NotLogged);
                this.client.FlushCallbacks();
                this.client.DebugOutput -= PrintDotOnDebugOutput;
                this.client.DebugOutput -= parser.DumpTypeOutputHandler;
                System.Diagnostics.Debug.WriteLine(String.Format("Done executing.", command));
                parser.Parse();

                if (parser.AnonymousEnums.Count > 0) {
                    List<string> anonymousEnums = parser.AnonymousEnums;
                    parser.AnonymousEnums = new List<string>();
                    parser.ClearBuffer();
                    foreach (string enumType in anonymousEnums) {
                        string enumCommand = String.Format("dt -v {0}!{1}", module, enumType);
                        System.Diagnostics.Debug.WriteLine(String.Format("Executing command: {0}", enumCommand));
                        this.client.DebugOutput += parser.DumpTypeOutputHandler;
                        this.client.DebugOutput += PrintDotOnDebugOutput;
                        this.control.Execute(OutputControl.ToThisClient, enumCommand, ExecuteOptions.NotLogged);
                        this.client.FlushCallbacks();
                        this.client.DebugOutput -= PrintDotOnDebugOutput;
                        this.client.DebugOutput -= parser.DumpTypeOutputHandler;
                        System.Diagnostics.Debug.WriteLine(String.Format("Done executing.", enumCommand));
                    }
                    parser.Parse();
                }
                Console.Out.WriteLine();

                // Sort the parsed base classes so that the furthest base classes come first. (i.e. if C : B, and B : A, we should have [A, B], where C is the type we're getting).
                parser.ParsedBaseClasses.Sort((a, b) => {
                    var endOfA = a.Offset + a.TypeSize;
                    var endOfB = b.Offset + b.TypeSize;
                    if (endOfA != endOfB) {
                        // Whichever base class ends first is the "further" base class.
                        return endOfA.CompareTo(endOfB);
                    } else {
                        // The base classes end at the same offset.  Whichever appeared second is the "further" base class.
                        return b.Index.CompareTo(a.Index);
                    }
                });

                List<SBaseType> baseTypes = new List<SBaseType>();
                int currentBaseClassIndex = 0;

                // Construct the type.
                Dictionary<string, SField> fields = new Dictionary<string, SField>();
                foreach (DumpTypeParser.SField parsedField in parser.ParsedFields) {
                    // Advance the current base class index if necessary.
                    while (currentBaseClassIndex < parser.ParsedBaseClasses.Count) {
                        // Check if we've exhausted the fields in this base type.
                        var currentBaseClass = parser.ParsedBaseClasses[currentBaseClassIndex];
                        if ((parsedField.Offset + parsedField.Size) > (currentBaseClass.Offset + currentBaseClass.TypeSize)) {
                            // This isn't perfect for at least a couple reasons:
                            //  - All constants are associated with the final type, even if they are part of the base type.
                            //  - Base types of the base types aren't known.
                            // The only thing this base type is sufficient for is knowing which fields are associated with each type,
                            // which fortunately is all we need it for (right now anyway).
                            SBaseType baseType = new SBaseType(new JsDbg.Windows.Dia.Type(module, currentBaseClass.TypeName, currentBaseClass.TypeSize, /*isEnum*/false, fields, null, null), (int)currentBaseClass.Offset);
                            baseTypes.Add(baseType);
                            fields = new Dictionary<string, SField>();
                            ++currentBaseClassIndex;
                        } else {
                            // The field is in this base type.
                            break;
                        }
                    }

                    string resolvedTypeName = parsedField.TypeName;
                    uint resolvedTypeSize = parsedField.Size;

                    if (resolvedTypeName == null) {
                        // We weren't able to parse the type name.  Retrieve it manually.
                        SymbolCache.SFieldTypeAndOffset fieldTypeAndOffset;
                        try {
                            fieldTypeAndOffset = this.symbolCache.GetFieldTypeAndOffset(moduleBase, typeId, parsedField.FieldName);

                            if (fieldTypeAndOffset.Offset != parsedField.Offset) {
                                // The offsets don't match...this must be a different field?
                                throw new Exception();
                            }

                            resolvedTypeName = this.symbolCache.GetTypeName(moduleBase, fieldTypeAndOffset.FieldTypeId);
                        } catch {
                            throw new DebuggerException(String.Format("Internal Exception: Inconsistent field name \"{0}\" when parsing type {1}!{2}", parsedField.FieldName, module, typename));
                        }
                    }

                    if (resolvedTypeSize == uint.MaxValue) {
                        if (!TypeCache.BuiltInTypes.TryGetValue(resolvedTypeName, out resolvedTypeSize)) {
                            try {
                                uint fieldTypeId = this.symbolCache.GetTypeId(moduleBase, resolvedTypeName);
                                resolvedTypeSize = this.symbolCache.GetTypeSize(moduleBase, fieldTypeId);
                            } catch {
                                throw new DebuggerException(String.Format("Internal Exception: Unknown type \"{0}\" found when parsing type {1}!{2}", resolvedTypeName, module, typename));
                            }
                        }
                    }

                    SField field = new SField(parsedField.Offset, resolvedTypeSize, module, resolvedTypeName, parsedField.BitField.BitOffset, parsedField.BitField.BitLength);
                    // A superclass can have a field with the same name as a field in the subclass.  We currently use the first one.
                    if (!fields.ContainsKey(parsedField.FieldName)) {
                        fields.Add(parsedField.FieldName, field);
                    }
                }

                // Finish up the base types.
                while (currentBaseClassIndex < parser.ParsedBaseClasses.Count) {
                    var currentBaseClass = parser.ParsedBaseClasses[currentBaseClassIndex];
                    SBaseType baseType = new SBaseType(new JsDbg.Windows.Dia.Type(module, currentBaseClass.TypeName, currentBaseClass.TypeSize, /*isEnum*/false, fields, null, null), (int)currentBaseClass.Offset);
                    baseTypes.Add(baseType);
                    fields = new Dictionary<string, SField>();
                    ++currentBaseClassIndex;
                }

                Dictionary<string, ulong> constants = new Dictionary<string, ulong>();
                foreach (SConstantResult constant in parser.ParsedConstants) {
                    constants.Add(constant.ConstantName, constant.Value);
                }

                return new JsDbg.Windows.Dia.Type(module, typename, typeSize, parser.IsEnum, fields, constants, baseTypes);
            }, String.Format("Unable to lookup type from debugger: {0}!{1}", module, typename));
        }

        public Task<SSymbolResult> LookupGlobalSymbol(string module, string symbol, string typeName) {
            return this.runner.AttemptOperation<SSymbolResult>(() => {
                SSymbolResult result = new SSymbolResult();

                uint typeId = 0;
                ulong moduleBase = 0;
                string fullyQualifiedSymbolName = module + "!" + symbol;
                try {
                    this.symbols.GetSymbolTypeId(fullyQualifiedSymbolName, out typeId, out moduleBase);
                    this.symbols.GetOffsetByName(fullyQualifiedSymbolName, out result.Pointer);
                } catch {
                    throw new DebuggerException(String.Format("Invalid symbol: {0}", fullyQualifiedSymbolName));
                }

                // Now that we have type ids and an offset, we can resolve the names.
                try {
                    string resultTypeName = this.symbolCache.GetTypeName(moduleBase, typeId);
                    if ((typeName != null) && !resultTypeName.Equals(typeName)) {
                        throw new DebuggerException(String.Format("Unable to lookup global symbol {0}!{1} with type name {2} from debugger", module, symbol, typeName));
                    }
                    result.Type = resultTypeName;
                    result.Module = this.symbols.GetModuleNameStringByBaseAddress(ModuleName.Module, moduleBase);
                    return result;
                } catch {
                    throw new DebuggerException(String.Format("Internal error with symbol: {0}", fullyQualifiedSymbolName));
                }
            }, String.Format("Unable to lookup global symbol: {0}!{1}", module, symbol));
        }

        public Task<SSymbolNameAndDisplacement> LookupSymbolName(ulong pointer) {
            return this.runner.AttemptOperation<SSymbolNameAndDisplacement>(() => {
                string fullyQualifiedSymbolName;
                ulong displacement;
                this.symbolCache.GetSymbolName(pointer, out fullyQualifiedSymbolName, out displacement);
                if (fullyQualifiedSymbolName.IndexOf("!") == -1) {
                    throw new Exception();
                }
                string[] parts = fullyQualifiedSymbolName.Split(new char[] { '!' }, 2);
                return new SSymbolNameAndDisplacement() { Module = parts[0], Name = parts[1], Displacement = displacement };
            }, String.Format("Unable to lookup symbol at pointer: 0x{0:x8}", pointer));
        }

        #endregion

        private DebuggerRunner runner;
        private Microsoft.Debuggers.DbgEng.DebugClient client;
        private Microsoft.Debuggers.DbgEng.DebugControl control;
        private Microsoft.Debuggers.DbgEng.DebugDataSpaces dataSpaces;
        private Microsoft.Debuggers.DbgEng.DebugSymbols symbols;
        private SymbolCache symbolCache;
        private DiaSessionLoader diaLoader;
        private bool isPointer64Bit;
    }
}
