using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using JsDbg;
using Dia2Lib;

namespace Core {
    public class TypeCacheDebugger : JsDbg.IDebugger {
        public TypeCacheDebugger(ITypeCacheDebuggerEngine debuggerEngine) {
            this.debuggerEngine = debuggerEngine;
            this.debuggerEngine.DebuggerBroke += this.DebuggerBroke;
            this.typeCache = new JsDbg.NewTypeCache(this.debuggerEngine.IsPointer64Bit);
            this.debuggerEngine.BitnessChanged += debuggerEngine_BitnessChanged;
        }

        void debuggerEngine_BitnessChanged(object sender, EventArgs e) {
            Console.Out.WriteLine("Effective processor changed, so invalidating the type cache.  You may need to refresh the browser window.");
            this.typeCache = new JsDbg.NewTypeCache(debuggerEngine.IsPointer64Bit);
        }

        private JsDbg.Type LoadType(string module, string typename) {
            JsDbg.Type type = this.typeCache.GetCachedType(module, typename);
            if (type != null) {
                return type;
            }

            Console.Out.WriteLine("Loading type information for {0}!{1}...", module, typename);

            // Try to load the type from DIA.
            IDiaSession session = this.debuggerEngine.DiaLoader.LoadDiaSession(module);
            if (session != null) {
                type = this.LoadTypeFromDiaSession(session, module, typename, DiaHelpers.NameSearchOptions.nsCaseSensitive);
                if (type == null) {
                    type = this.LoadTypeFromDiaSession(session, module, typename, DiaHelpers.NameSearchOptions.nsCaseInsensitive);
                }

                if (type != null) {
                    this.typeCache.AddType(type);
                    return type;
                }
            }

            Console.Out.WriteLine("WARNING: Unable to load {0}!{1} from PDBs. Falling back to the debugger, which could be slow...", module, typename);

            type = this.debuggerEngine.GetTypeFromDebugger(module, typename);
            if (type != null) {
                this.typeCache.AddType(type);
                return type;
            }

            throw new DebuggerException(String.Format("Unable to load type: {0}!{1}", module, typename));
        }

        private JsDbg.Type LoadTypeFromDiaSession(IDiaSession diaSession, string module, string typename, DiaHelpers.NameSearchOptions options) {
            IDiaEnumSymbols symbols;
            diaSession.findChildren(diaSession.globalScope, SymTagEnum.SymTagNull, typename, (uint)options, out symbols);
            foreach (IDiaSymbol symbol in symbols) {
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
                        JsDbg.Type baseType = this.LoadType(module, baseTypename);
                        if (baseType != null) {
                            baseTypes.Add(new SBaseType(baseType, baseClassSymbol.offset));
                        } else {
                            System.Diagnostics.Debug.WriteLine("Unable to retrieve base type: {0}", baseTypename);
                        }
                    }

                    // Construct the type.
                    JsDbg.Type type = new JsDbg.Type(module, typename, typeSize, fields, constants, baseTypes, null);
                    return type;
                }
            }

            return null;
        }

        #region IDebugger Members

        public event EventHandler DebuggerBroke;

        public void Dispose() { }

        public async Task<IEnumerable<JsDbg.SFieldResult>> GetAllFields(string module, string typename) {
            await this.debuggerEngine.WaitForBreakIn();
            return this.LoadType(module, typename).Fields;
        }

        public async Task<IEnumerable<JsDbg.SBaseTypeResult>> GetBaseTypes(string module, string typename) {
            await this.debuggerEngine.WaitForBreakIn();
            return this.LoadType(module, typename).BaseTypes;
        }

        public bool IsPointer64Bit {
            get { return this.debuggerEngine.IsPointer64Bit; }
        }

        public async Task<JsDbg.SConstantResult> LookupConstant(string module, string typename, ulong constantValue) {
            await this.debuggerEngine.WaitForBreakIn();

            var type = this.LoadType(module, typename);
            foreach (SConstantResult constantResult in type.Constants) {
                if (constantResult.Value == constantValue) {
                    return constantResult;
                }
            }

            throw new DebuggerException(String.Format("Unknown constant value: {0} in type: {1}", constantValue, typename));
        }

        public async Task<JsDbg.SConstantResult> LookupConstant(string module, string typename, string constantName) {
            await this.debuggerEngine.WaitForBreakIn();

            var type = this.LoadType(module, typename);
            ulong constantValue;
            if (type.GetConstantValue(constantName, out constantValue)) {
                return new SConstantResult() { ConstantName = constantName, Value = constantValue };
            } else {
                throw new DebuggerException(String.Format("Unknown constant name: {0} in type: {1}", constantName, typename));
            }
        }

        public async Task<JsDbg.SFieldResult> LookupField(string module, string typename, string fieldName) {
            await this.debuggerEngine.WaitForBreakIn();

            SFieldResult result = new SFieldResult();

            var type = this.LoadType(module, typename);
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
            await this.debuggerEngine.WaitForBreakIn();
            return this.LoadType(module, typename).Size;
        }

        public async Task<JsDbg.SSymbolResult> LookupGlobalSymbol(string moduleName, string symbolName) {
            await this.debuggerEngine.WaitForBreakIn();

            SSymbolResult result = new SSymbolResult();

            Dia2Lib.IDiaSession session = this.debuggerEngine.DiaLoader.LoadDiaSession(moduleName);
            if (session != null) {
                // We have a DIA session, use that.
                try {
                    Dia2Lib.IDiaEnumSymbols symbols;
                    session.globalScope.findChildren(Dia2Lib.SymTagEnum.SymTagNull, symbolName, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out symbols);
                    foreach (Dia2Lib.IDiaSymbol diaSymbol in symbols) {
                        result.Module = moduleName;
                        result.Pointer = this.debuggerEngine.GetBaseAddressForModule(moduleName) + diaSymbol.relativeVirtualAddress;
                        result.Type = DiaHelpers.GetTypeName(diaSymbol.type);
                        return result;
                    }
                } catch { }
                throw new DebuggerException(String.Format("Invalid symbol: {0}!{1}", moduleName, symbolName));
            } else {
                return await this.debuggerEngine.LookupGlobalSymbol(moduleName, symbolName);
            }
        }

        public async Task<IEnumerable<JsDbg.SSymbolResult>> LookupLocalSymbols(string module, string methodName, string symbol, int maxCount) {
            return await this.debuggerEngine.LookupLocalSymbols(module, methodName, symbol, maxCount);
        }

        public async Task<JsDbg.SSymbolNameResult> LookupSymbolName(ulong pointer) {
            await this.debuggerEngine.WaitForBreakIn();

            try {
                ulong moduleBase;
                string moduleName = this.debuggerEngine.GetModuleForAddress(pointer, out moduleBase);
                Dia2Lib.IDiaSession session = this.debuggerEngine.DiaLoader.LoadDiaSession(moduleName);

                if (session != null) {
                    // We have a DIA session; use it.
                    Dia2Lib.IDiaSymbol symbol;
                    int displacement;
                    session.findSymbolByRVAEx((uint)(pointer - moduleBase), Dia2Lib.SymTagEnum.SymTagNull, out symbol, out displacement);
                    string name;
                    symbol.get_undecoratedNameEx(0x1000, out name);
                    if (displacement != 0) {
                        throw new Exception();
                    }

                    return new SSymbolNameResult() { Module = moduleName, Name = name };
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

        #endregion

        private ITypeCacheDebuggerEngine debuggerEngine;
        private JsDbg.NewTypeCache typeCache;
    }
}
