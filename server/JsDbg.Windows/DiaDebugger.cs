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
using System.Threading.Tasks;
using Dia2Lib;
using JsDbg.Core;

namespace JsDbg.Windows.Dia {
    public class DiaDebugger : IDebugger {
        public DiaDebugger(IDiaDebuggerEngine debuggerEngine) {
            this.debuggerEngine = debuggerEngine;
            this.typeCache = new TypeCache(this.debuggerEngine.IsPointer64Bit);
            this.constantCaches = new Dictionary<string, ConstantCache>();

            this.debuggerEngine.DebuggerChange += (sender, args) => { this.DebuggerChange?.Invoke(this, args); };
            this.debuggerEngine.DebuggerChange += (sender, args) => {
                if (args.Status == DebuggerChangeEventArgs.DebuggerStatus.ChangingBitness || args.Status == DebuggerChangeEventArgs.DebuggerStatus.ChangingProcess || args.Status == DebuggerChangeEventArgs.DebuggerStatus.Detaching) {
                    this.ClearTypeCache();
                }
            };
        }

        private void ClearTypeCache() {
            this.typeCache = new TypeCache(this.debuggerEngine.IsPointer64Bit);
            this.constantCaches = new Dictionary<string, ConstantCache>();
        }

        private async Task<ConstantCache> LoadConstants(string module) {
            if (this.constantCaches.ContainsKey(module)) {
                return this.constantCaches[module];
            }

            IDiaSession session = await this.debuggerEngine.DiaLoader.LoadDiaSession(module);
            if (session != null) {
                this.constantCaches[module] = this.LoadGlobalConstantsFromDiaSession(session);
                return this.constantCaches[module];
            } else {
                return null;
            }
        }

        private async Task<Type> LoadType(string module, string typename) {
            // Try to load the type from DIA.
            IDiaSession session = await this.debuggerEngine.DiaLoader.LoadDiaSession(module);

            bool foundType;
            Type type = this.typeCache.GetCachedType(session, module, typename, out foundType);
            if (foundType) {
                if (type != null) {
                    return type;
                } else {
                    // We previously tried to load the type but were unable to.
                    throw new DebuggerException(String.Format("Unable to load type: {0}!{1}", module, typename));
                }
            }

            this.DebuggerMessage?.Invoke(this, String.Format("Loading type information for {0}!{1}...", module, typename));

            if (session != null) {
                type = await this.LoadTypeFromDiaSession(session, module, typename, DiaHelpers.NameSearchOptions.nsCaseSensitive);
                if (type == null) {
                    type = await this.LoadTypeFromDiaSession(session, module, typename, DiaHelpers.NameSearchOptions.nsCaseInsensitive);
                }

                if (type != null) {
                    this.typeCache.AddType(type);
                    return type;
                } else {
                    // We have a DIA session but couldn't find the type.  Assume the type is invalid rather than falling back to the debugger.
                    this.typeCache.AddInvalidType(module, typename);
                    throw new DebuggerException(String.Format("Unable to load type: {0}!{1}", module, typename));
                }
            }

            this.DebuggerMessage?.Invoke(this, String.Format("WARNING: Unable to load {0}!{1} from PDBs. Falling back to the debugger, which could be slow...", module, typename));

            type = await this.debuggerEngine.GetTypeFromDebugger(module, typename);
            if (type != null) {
                this.typeCache.AddType(type);
                return type;
            } else {
                this.typeCache.AddInvalidType(module, typename);
                throw new DebuggerException(String.Format("Unable to load type: {0}!{1}", module, typename));
            }
        }

        private ConstantCache LoadGlobalConstantsFromDiaSession(IDiaSession diaSession) {
            List<SConstantResult> constants = new List<SConstantResult>();

            diaSession.findChildren(diaSession.globalScope, SymTagEnum.SymTagData, null, 0, out IDiaEnumSymbols symbols);
            foreach (IDiaSymbol symbol in symbols) {
                SymTagEnum symTag = (SymTagEnum)symbol.symTag;
                if (symbol.locationType == (uint)DiaHelpers.LocationType.LocIsConstant) {
                    constants.Add(new SConstantResult() { ConstantName = symbol.name, Value = (ulong)symbol.value });
                }
            }

            return new ConstantCache(constants);
        }

        private async Task<Type> LoadTypeFromDiaSession(IDiaSession diaSession, string module, string typename, DiaHelpers.NameSearchOptions options) {
            IDiaEnumSymbols symbols;
            diaSession.findChildren(diaSession.globalScope, SymTagEnum.SymTagNull, typename, (uint)options, out symbols);
            foreach (IDiaSymbol iterationSymbol in symbols) {
                IDiaSymbol symbol = iterationSymbol;
                while ((SymTagEnum)symbol.symTag == SymTagEnum.SymTagTypedef) {
                    symbol = symbol.type;
                }
                SymTagEnum symTag = (SymTagEnum)symbol.symTag;
                if (symTag == SymTagEnum.SymTagUDT || symTag == SymTagEnum.SymTagBaseType || symTag == SymTagEnum.SymTagEnum) {
                    // Get the fields for this class.
                    IDiaEnumSymbols dataSymbols;
                    symbol.findChildren(SymTagEnum.SymTagData, null, 0, out dataSymbols);
                    uint typeSize = (uint)symbol.length;
                    Dictionary<string, SField> fields = new Dictionary<string, SField>();
                    Dictionary<string, ulong> constants = new Dictionary<string, ulong>();

                    foreach (IDiaSymbol dataSymbol in dataSymbols) {
                        DiaHelpers.LocationType location = (DiaHelpers.LocationType)dataSymbol.locationType;
                        if (location == DiaHelpers.LocationType.LocIsBitField) {
                            byte bitOffset = (byte)dataSymbol.bitPosition;
                            byte bitCount = (byte)dataSymbol.length;
                            fields.Add(dataSymbol.name, new SField((uint)dataSymbol.offset, (uint)dataSymbol.type.length, module, DiaHelpers.GetTypeName(dataSymbol.type), bitOffset, bitCount));
                        } else if (location == DiaHelpers.LocationType.LocIsThisRel) {
                            fields.Add(dataSymbol.name, new SField((uint)dataSymbol.offset, (uint)dataSymbol.type.length, module, DiaHelpers.GetTypeName(dataSymbol.type), 0, 0));
                        } else if (location == DiaHelpers.LocationType.LocIsConstant) {
                            try {
                                constants.Add(dataSymbol.name, (ulong)dataSymbol.value);
                            } catch {
                                // If the cast failed, just ignore the constant for now.
                            }
                        }
                    }

                    IDiaEnumSymbols enumSymbols;
                    symbol.findChildren(SymTagEnum.SymTagEnum, null, 0, out enumSymbols);
                    List<string> names = new List<string>();
                    foreach (IDiaSymbol enumSymbol in enumSymbols) {
                        if (enumSymbol.name.IndexOf("<unnamed-enum") == 0) {
                            // Anonymous enum.  Include the constants in the outer type.
                            IDiaEnumSymbols anonymousEnumDataSymbols;
                            enumSymbol.findChildren(SymTagEnum.SymTagData, null, 0, out anonymousEnumDataSymbols);
                            foreach (IDiaSymbol dataSymbol in anonymousEnumDataSymbols) {
                                DiaHelpers.LocationType location = (DiaHelpers.LocationType)dataSymbol.locationType;
                                if (location == DiaHelpers.LocationType.LocIsConstant) {
                                    try {
                                        constants.Add(dataSymbol.name, (ulong)dataSymbol.value);
                                    } catch {
                                        // If the cast failed, just ignore the constant for now.
                                    }
                                }
                            }
                        }
                    }

                    // Get the base types.
                    List<SBaseType> baseTypes = new List<SBaseType>();
                    IDiaEnumSymbols baseClassSymbols;
                    symbol.findChildren(SymTagEnum.SymTagBaseClass, null, 0, out baseClassSymbols);
                    foreach (IDiaSymbol baseClassSymbol in baseClassSymbols) {
                        string baseTypename = DiaHelpers.GetTypeName(baseClassSymbol.type);
                        Type baseType;
                        try {
                            baseType = await this.LoadType(module, baseTypename);
                        } catch (DebuggerException) {
                            // Sometimes types will refer to a base type that doesn't resolve; just ignore that type.
                            baseType = null;
                        }
                        if (baseType != null) {
                            baseTypes.Add(new SBaseType(baseType, baseClassSymbol.offset));
                        } else {
                            System.Diagnostics.Debug.WriteLine("Unable to retrieve base type: {0}", baseTypename);
                        }
                    }

                    // Construct the type.
                    Type type = new Type(module, typename, typeSize, symTag == SymTagEnum.SymTagEnum, fields, constants, baseTypes);
                    return type;
                }
            }

            return null;
        }

        #region IDebugger Members

        public event DebuggerChangeEventHandler DebuggerChange;

        public event DebuggerMessageEventHandler DebuggerMessage;

        public void Dispose() { }

        public uint TargetProcess {
            get { return this.debuggerEngine.TargetProcess; }
            set { this.debuggerEngine.TargetProcess = value; }
        }

        public async Task<uint[]> GetAttachedProcesses() {
            return await this.debuggerEngine.GetAttachedProcesses();
        }

        public uint TargetThread {
            get { return this.debuggerEngine.TargetThread; }
            set { this.debuggerEngine.TargetThread = value; }
        }

        public async Task<uint[]> GetCurrentProcessThreads() {
            return await this.debuggerEngine.GetCurrentProcessThreads();
        }

        public async Task<IEnumerable<SFieldResult>> GetAllFields(string module, string typename, bool includeBaseTypes) {
            return (await this.LoadType(module, typename)).Fields(includeBaseTypes);
        }

        public async Task<IEnumerable<SBaseTypeResult>> GetBaseTypes(string module, string typename) {
            return (await this.LoadType(module, typename)).BaseTypes;
        }

        public bool IsDebuggerBusy {
            get { return this.debuggerEngine.IsDebuggerBusy; }
        }

        public bool IsPointer64Bit {
            get { return this.debuggerEngine.IsPointer64Bit; }
        }

        public Task<ulong> TebAddress() {
            return this.debuggerEngine.TebAddress();
        }

        public async Task<bool> IsTypeEnum(string module, string typename) {
            var type = await this.LoadType(module, typename);
            return type.IsEnum;
        }

        public async Task<IEnumerable<SConstantResult>> LookupConstants(string module, string typename, ulong constantValue) {
            if (typename == null) {
                var constants = await this.LoadConstants(module);
                IEnumerable<string> names;
                if (constants != null && constants.TryGetNames(constantValue, out names)) {
                    return names.Select((x) => new SConstantResult() { ConstantName = x, Value = constantValue });
                } else {
                    throw new DebuggerException(String.Format("Unknown global constant value: {0}", constantValue));
                }
            } else {
                var type = await this.LoadType(module, typename);
                return type.Constants.Where((x) => x.Value == constantValue);
            }
        }

        public async Task<SConstantResult> LookupConstant(string module, string typename, string constantName) {
            if (typename == null) {
                var constants = await this.LoadConstants(module);
                ulong constantValue;
                if (constants != null && constants.TryGetValue(constantName, out constantValue)) {
                    return new SConstantResult() { ConstantName = constantName, Value = constantValue };
                } else {
                    throw new DebuggerException(String.Format("Unknown global constant name: {0}", constantName));
                }
            } else {
                var type = await this.LoadType(module, typename);
                ulong constantValue;
                if (type.GetConstantValue(constantName, out constantValue)) {
                    return new SConstantResult() { ConstantName = constantName, Value = constantValue };
                } else {
                    throw new DebuggerException(String.Format("Unknown constant name: {0} in type: {1}", constantName, typename));
                }
            }
        }

        public async Task<SFieldResult> LookupField(string module, string typename, string fieldName) {
            SFieldResult result = new SFieldResult();

            var type = await this.LoadType(module, typename);
            SField field;
            if (type.GetField(fieldName, out field)) {
                result.Offset += field.Offset;
                result.BitCount = field.BitCount;
                result.BitOffset = field.BitOffset;
                result.Module = field.Module;
                result.TypeName = field.TypeName;
                result.Size = field.Size;
            } else {
                throw new DebuggerException(String.Format("Unknown field {0} in type: {1}", fieldName, typename));
            }

            return result;
        }

        public async Task<uint> LookupTypeSize(string module, string typename) {
            return (await this.LoadType(module, typename)).Size;
        }

        public async Task<SSymbolResult> LookupGlobalSymbol(string moduleName, string symbolName, string typeName, string scope) {
            // The scope is not needed to lookup global symbols with DIA.

            Dia2Lib.IDiaSession session = await this.debuggerEngine.DiaLoader.LoadDiaSession(moduleName);
            if (session != null) {
                // We have a DIA session, use that.
                try {
                    Dia2Lib.IDiaEnumSymbols symbols;
                    session.globalScope.findChildren(Dia2Lib.SymTagEnum.SymTagNull, symbolName, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out symbols);
                    foreach (Dia2Lib.IDiaSymbol diaSymbol in symbols) {
                        if (((DiaHelpers.LocationType)diaSymbol.locationType) == DiaHelpers.LocationType.LocIsTLS) {
                            // For TLS-relative symbols, fall back to the debugger.
                            return await this.debuggerEngine.LookupGlobalSymbol(moduleName, symbolName, typeName);
                        }

                        string resultTypeName = DiaHelpers.GetTypeName(diaSymbol.type);
                        if ((typeName == null) || resultTypeName.Equals(typeName)) {
                            SSymbolResult result = new SSymbolResult();
                            result.Module = moduleName;
                            result.Pointer = (await this.debuggerEngine.GetModuleForName(moduleName)).BaseAddress + diaSymbol.relativeVirtualAddress;
                            result.Type = resultTypeName;
                            return result;
                        }
                    }
                } catch { }
                if (typeName != null) {
                    throw new DebuggerException(String.Format("No symbol {0}!{1} with type name {2}", moduleName, symbolName, typeName));
                } else {
                    throw new DebuggerException(String.Format("Invalid symbol: {0}!{1}", moduleName, symbolName));
                }
            } else {
                return await this.debuggerEngine.LookupGlobalSymbol(moduleName, symbolName, typeName);
            }
        }

        public Task<SModule> GetModuleForName(string module) {
            return this.debuggerEngine.GetModuleForName(module);
        }

        public Task<IEnumerable<SStackFrame>> GetCallStack(int frameCount) {
            return this.debuggerEngine.GetCurrentCallStack(frameCount);
        }

        public async Task<IEnumerable<SNamedSymbol>> GetSymbolsInStackFrame(ulong instructionAddress, ulong stackAddress, ulong frameAddress) {
            List<SNamedSymbol> results = new List<SNamedSymbol>();
            SModule module = await this.debuggerEngine.GetModuleForAddress(instructionAddress);

            Dia2Lib.IDiaSession session = await this.debuggerEngine.DiaLoader.LoadDiaSession(module.Name);
            if (session == null) {
                throw new DebuggerException("Loading stack frame symbols directly from the debugger is not supported.");
            }

            Dia2Lib.IDiaSymbol symbol;
            uint rva = (uint)(instructionAddress - module.BaseAddress);
            try {
                session.findSymbolByRVA(rva, Dia2Lib.SymTagEnum.SymTagNull, out symbol);
            } catch {
                throw new DebuggerException(string.Format("Invalid symbol address: 0x:{0:x8}", instructionAddress));
            }

            if ((SymTagEnum)symbol.symTag == SymTagEnum.SymTagFunction || (SymTagEnum)symbol.symTag == SymTagEnum.SymTagBlock) {
                do {
                    IDiaEnumSymbols symbols = null;
                    symbol.findChildrenExByRVA(SymTagEnum.SymTagData, null, (uint)DiaHelpers.NameSearchOptions.nsNone, rva, out symbols);

                    foreach (IDiaSymbol localSymbol in symbols) {
                        DiaHelpers.LocationType location = (DiaHelpers.LocationType)localSymbol.locationType;
                        if (location == DiaHelpers.LocationType.LocIsRegRel) {
                            // Check if the offset is from the stack address or frame address.
                            DiaHelpers.CV_HREG_e register = (DiaHelpers.CV_HREG_e)localSymbol.registerId;
                            ulong relativeAddress = 0;
                            switch (register) {
                            case DiaHelpers.CV_HREG_e.CV_AMD64_RSP:
                            case DiaHelpers.CV_HREG_e.CV_AMD64_ESP: // Also CV_REG_ESP
                                relativeAddress = stackAddress;
                                break;
                            case DiaHelpers.CV_HREG_e.CV_AMD64_RBP:
                            case DiaHelpers.CV_HREG_e.CV_AMD64_EBP: // Also CV_REG_EBP
                            case DiaHelpers.CV_HREG_e.CV_ALLREG_VFRAME:
                                relativeAddress = frameAddress;
                                break;
                            default:
                                // Relative to a register that's not the frame pointer or stack pointer.  We don't have support for this yet.
                                continue;
                            }

                            int pointerAdjustment = 0;
                            if (localSymbol.name == "this") {
                                pointerAdjustment = symbol.type.thisAdjust;
                            }

                            results.Add(new SNamedSymbol() {
                                Symbol = new SSymbolResult() {
                                    Module = module.Name,
                                    Pointer = (ulong)((long)relativeAddress + localSymbol.offset),
                                    Type = DiaHelpers.GetTypeName(localSymbol.type, pointerAdjustment)
                                },
                                Name = localSymbol.name
                            });
                        }
                    }

                    // If the symbol wasn't a function (e.g. it was a block) keep going until we reach containing function.
                } while ((SymTagEnum)symbol.symTag != SymTagEnum.SymTagFunction && ((symbol = symbol.lexicalParent) != null));
            }

            return results;
        }

        public async Task<SSymbolNameAndDisplacement> LookupSymbolName(ulong pointer) {
            try {
                SModule module = await this.debuggerEngine.GetModuleForAddress(pointer);
                Dia2Lib.IDiaSession session = await this.debuggerEngine.DiaLoader.LoadDiaSession(module.Name);

                if (session != null) {
                    // We have a DIA session; use it.
                    Dia2Lib.IDiaSymbol symbol;
                    ulong rva = pointer - module.BaseAddress;
                    session.findSymbolByRVA((uint)rva, Dia2Lib.SymTagEnum.SymTagNull, out symbol);

                    // Blocks don't have names.  Walk up to the nearest non-block parent.
                    while ((Dia2Lib.SymTagEnum)symbol.symTag == Dia2Lib.SymTagEnum.SymTagBlock) {
                        symbol = symbol.lexicalParent;
                    }

                    SymTagEnum symTag = (SymTagEnum)symbol.symTag;
                    string name;
                    if (symTag == SymTagEnum.SymTagPublicSymbol || symTag == SymTagEnum.SymTagThunk) {
                        // Public symbols have decorated names that need to be undecorated (see dbghelp!diaFillSymbolInfo).
                        symbol.get_undecoratedNameEx(0x1000, out name);
                    } else {
                        name = symbol.name;
                    }

                    return new SSymbolNameAndDisplacement() {
                        Module = module.Name,
                        Name = name,
                        Displacement = (ulong)(rva - symbol.relativeVirtualAddress)
                    };
                } else {
                    return await this.debuggerEngine.LookupSymbolName(pointer);
                }
            } catch {
                throw new DebuggerException(String.Format("Invalid symbol address: 0x{0:x8}", pointer));
            }
        }

        public async Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct {
            return await this.debuggerEngine.ReadArray<T>(pointer, size);
        }

        public async Task<T> ReadMemory<T>(ulong pointer) where T : struct {
            T[] result = await this.debuggerEngine.ReadArray<T>(pointer, 1);
            return result[0];
        }

        public Task WriteMemory<T>(ulong pointer, T value) where T : struct {
            return this.debuggerEngine.WriteValue<T>(pointer, value);
        }

        #endregion

        private IDiaDebuggerEngine debuggerEngine;
        private TypeCache typeCache;
        private Dictionary<string, ConstantCache> constantCaches;
    }
}
