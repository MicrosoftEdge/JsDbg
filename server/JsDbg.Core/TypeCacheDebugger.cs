using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Dia2Lib;
using JsDbg.Dia;

namespace JsDbg.Core {
    public class TypeCacheDebugger : IDebugger {
        public TypeCacheDebugger(ITypeCacheDebuggerEngine debuggerEngine) {
            this.debuggerEngine = debuggerEngine;
            this.debuggerEngine.DebuggerChange += debuggerEngine_DebuggerChange;
            this.typeCache = new TypeCache(this.debuggerEngine.IsPointer64Bit);
            this.debuggerEngine.BitnessChanged += debuggerEngine_BitnessChanged;
        }

        void debuggerEngine_DebuggerChange(object sender, DebuggerChangeEventArgs e) {
            if (this.DebuggerChange != null) {
                this.DebuggerChange(sender, e);
            }
        }

        void debuggerEngine_BitnessChanged(object sender, EventArgs e) {
            Console.Out.WriteLine("Effective processor changed, so invalidating the type cache.  You may need to refresh the browser window.");
            this.typeCache = new TypeCache(debuggerEngine.IsPointer64Bit);
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

            Console.Out.WriteLine("Loading type information for {0}!{1}...", module, typename);

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

            Console.Out.WriteLine("WARNING: Unable to load {0}!{1} from PDBs. Falling back to the debugger, which could be slow...", module, typename);

            type = await this.debuggerEngine.GetTypeFromDebugger(module, typename);
            if (type != null) {
                this.typeCache.AddType(type);
                return type;
            } else {
                this.typeCache.AddInvalidType(module, typename);
                throw new DebuggerException(String.Format("Unable to load type: {0}!{1}", module, typename));
            }
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
                            fields.Add(dataSymbol.name, new SField((uint)dataSymbol.offset, (uint)dataSymbol.type.length, DiaHelpers.GetTypeName(dataSymbol.type), bitOffset, bitCount));
                        } else if (location == DiaHelpers.LocationType.LocIsThisRel) {
                            fields.Add(dataSymbol.name, new SField((uint)dataSymbol.offset, (uint)dataSymbol.type.length, DiaHelpers.GetTypeName(dataSymbol.type), 0, 0));
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
                        Type baseType = await this.LoadType(module, baseTypename);
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

        public void Dispose() { }

        public async Task<IEnumerable<SFieldResult>> GetAllFields(string module, string typename, bool includeBaseTypes) {
            return (await this.LoadType(module, typename)).Fields(includeBaseTypes);
        }

        public async Task<IEnumerable<SBaseTypeResult>> GetBaseTypes(string module, string typename) {
            return (await this.LoadType(module, typename)).BaseTypes;
        }

        public bool IsPointer64Bit {
            get { return this.debuggerEngine.IsPointer64Bit; }
        }

        public async Task<bool> IsTypeEnum(string module, string typename) {
            var type = await this.LoadType(module, typename);
            return type.IsEnum;
        }

        public async Task<SConstantResult> LookupConstant(string module, string typename, ulong constantValue) {
            var type = await this.LoadType(module, typename);
            foreach (SConstantResult constantResult in type.Constants) {
                if (constantResult.Value == constantValue) {
                    return constantResult;
                }
            }

            throw new DebuggerException(String.Format("Unknown constant value: {0} in type: {1}", constantValue, typename));
        }

        public async Task<SConstantResult> LookupConstant(string module, string typename, string constantName) {
            var type = await this.LoadType(module, typename);
            ulong constantValue;
            if (type.GetConstantValue(constantName, out constantValue)) {
                return new SConstantResult() { ConstantName = constantName, Value = constantValue };
            } else {
                throw new DebuggerException(String.Format("Unknown constant name: {0} in type: {1}", constantName, typename));
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
                result.TypeName = field.TypeName;
                result.Size = field.Size;
            } else {
                throw new DebuggerException(String.Format("Invalid field name: {0}", fieldName));
            }

            return result;
        }

        public async Task<uint> LookupTypeSize(string module, string typename) {
            return (await this.LoadType(module, typename)).Size;
        }

        public async Task<SSymbolResult> LookupGlobalSymbol(string moduleName, string symbolName) {
            SSymbolResult result = new SSymbolResult();

            Dia2Lib.IDiaSession session = await this.debuggerEngine.DiaLoader.LoadDiaSession(moduleName);
            if (session != null) {
                // We have a DIA session, use that.
                try {
                    Dia2Lib.IDiaEnumSymbols symbols;
                    session.globalScope.findChildren(Dia2Lib.SymTagEnum.SymTagNull, symbolName, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out symbols);
                    foreach (Dia2Lib.IDiaSymbol diaSymbol in symbols) {
                        result.Module = moduleName;
                        result.Pointer = (await this.debuggerEngine.GetModuleForName(moduleName)).BaseAddress + diaSymbol.relativeVirtualAddress;
                        result.Type = DiaHelpers.GetTypeName(diaSymbol.type);
                        return result;
                    }
                } catch { }
                throw new DebuggerException(String.Format("Invalid symbol: {0}!{1}", moduleName, symbolName));
            } else {
                return await this.debuggerEngine.LookupGlobalSymbol(moduleName, symbolName);
            }
        }

        public async Task<IEnumerable<SSymbolResult>> LookupLocalSymbols(string module, string methodName, string symbolName, int maxCount) {
            ulong requestedModuleBase = (await this.debuggerEngine.GetModuleForName(module)).BaseAddress;

            bool foundStackFrame = false;
            List<SSymbolResult> results = new List<SSymbolResult>();

            IEnumerable<SStackFrameWithContext> stackFrames = await this.debuggerEngine.GetCurrentCallStack();
            foreach (SStackFrameWithContext stackFrameWithContext in stackFrames) {
                SSymbolNameResult stackFrameName;
                SModule stackFrameModule;
                try {
                    stackFrameModule = await this.debuggerEngine.GetModuleForAddress(stackFrameWithContext.StackFrame.InstructionAddress);
                } catch {
                    // No module found.  Could be a JIT stack so just keep going.
                    continue;
                }
                if (requestedModuleBase != stackFrameModule.BaseAddress) {
                    // Check the module before looking up the name to avoid loading symbols for modules we're not interested in.
                    continue;
                }

                try {
                    stackFrameName = (await this.LookupSymbolNameWithDisplacement(stackFrameWithContext.StackFrame.InstructionAddress)).Symbol;
                } catch {
                    continue;
                }

                if (stackFrameName.Name == methodName) {
                    foundStackFrame = true;

                    // This is the stack frame that we're being asked about.
                    IList<SLocalVariable> localsFromDia = await this.GetLocalsFromDia(module, methodName, (uint)(stackFrameWithContext.StackFrame.InstructionAddress - stackFrameModule.BaseAddress), symbolName);
                    if (localsFromDia != null) {
                        if (localsFromDia.Count > 0) {
                            // We might get multiple local variables with the same name.  Just use the first one.
                            ulong address = localsFromDia[0].IsOffsetFromBottom ? stackFrameWithContext.StackFrame.StackAddress : stackFrameWithContext.StackFrame.FrameAddress;
                            address = (ulong)((long)address + localsFromDia[0].FrameOffset);
                            results.Add(new SSymbolResult() { Module = module, Pointer = address, Type = localsFromDia[0].Type });
                        }
                    } else {
                        // Unable to get any locals from DIA.  Try the debugger engine.
                        IEnumerable<SSymbolResult> localsFromDebugger = await this.debuggerEngine.LookupLocalsInStackFrame(stackFrameWithContext, symbolName);
                        if (localsFromDebugger != null) {
                            results.AddRange(localsFromDebugger);
                        }
                    }
                }
            }

            if (!foundStackFrame) {
                throw new DebuggerException(String.Format("Could not find stack frame: {0}", methodName));
            } else if (results.Count == 0) {
                throw new DebuggerException(String.Format("Could not find local symbol: {0}", symbolName));
            } else {
                return results;
            }
        }

        public async Task<IList<SLocalVariable>> GetLocalsFromDia(string module, string method, uint rva, string symbolName) {
            IDiaSession diaSession = await this.debuggerEngine.DiaLoader.LoadDiaSession(module);
            if (diaSession == null) {
                return null;
            }

            List<SLocalVariable> results = new List<SLocalVariable>();
            IDiaEnumSymbols symbols;
            diaSession.findChildren(diaSession.globalScope, SymTagEnum.SymTagFunction, method, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out symbols);

            foreach (IDiaSymbol symbol in symbols) {
                List<IDiaSymbol> symbolResults = new List<IDiaSymbol>();
                this.AccumulateChildLocalSymbols(symbol, symbolName, rva, symbolResults);
                foreach (IDiaSymbol resultSymbol in symbolResults) {
                    if ((DiaHelpers.LocationType)resultSymbol.locationType == DiaHelpers.LocationType.LocIsRegRel) {
                        // If the register id is %rsp or %esp, the offset is from the bottom.
                        bool offsetFromBottom = (resultSymbol.registerId == 335 || resultSymbol.registerId == 21);
                        results.Add(new SLocalVariable() { FrameOffset = resultSymbol.offset, Type = DiaHelpers.GetTypeName(resultSymbol.type), IsOffsetFromBottom = offsetFromBottom });
                    }
                }
            }

            return results;
        }

        private void AccumulateChildLocalSymbols(IDiaSymbol symbol, string symbolName, uint rva, List<IDiaSymbol> results) {
            IDiaEnumSymbols dataSymbols;
            symbol.findChildrenExByRVA(SymTagEnum.SymTagData, symbolName, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, rva, out dataSymbols);
            foreach (IDiaSymbol dataSymbol in dataSymbols) {
                results.Add(dataSymbol);
            }

            IDiaEnumSymbols blockSymbols;
            symbol.findChildrenExByRVA(SymTagEnum.SymTagBlock, null, (uint)DiaHelpers.NameSearchOptions.nsNone, rva, out blockSymbols);
            foreach (IDiaSymbol blockSymbol in blockSymbols) {
                AccumulateChildLocalSymbols(blockSymbol, symbolName, rva, results);
            }
        }

        public async Task<SSymbolNameResult> LookupSymbolName(ulong pointer) {
            SSymbolNameResultAndDisplacement result = await this.LookupSymbolNameWithDisplacement(pointer);
            if (result.Displacement != 0) {
                throw new DebuggerException(String.Format("Invalid symbol address: 0x{0:x8}", pointer));
            }
            return result.Symbol;
        }

        private async Task<SSymbolNameResultAndDisplacement> LookupSymbolNameWithDisplacement(ulong pointer) {
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
                    ulong displacement = (ulong)(rva - symbol.relativeVirtualAddress);

                    string name;
                    symbol.get_undecoratedNameEx(0x1000, out name);

                    return new SSymbolNameResultAndDisplacement() { Symbol = new SSymbolNameResult() { Module = module.Name, Name = name }, Displacement = displacement };
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

        private ITypeCacheDebuggerEngine debuggerEngine;
        private TypeCache typeCache;
    }
}
