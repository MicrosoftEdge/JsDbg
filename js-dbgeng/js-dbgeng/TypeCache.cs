using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;
using Dia2Lib;
using System.Diagnostics;

namespace JsDbg {
    struct SField {
        internal SField(uint offset, string typename, byte bitOffset, byte bitCount) {
            this.Offset = offset;
            this.TypeName = typename;
            this.BitOffset = bitOffset;
            this.BitCount = bitCount;
        }

        internal readonly uint Offset;
        internal readonly string TypeName;
        internal readonly byte BitOffset;
        internal readonly byte BitCount;

        internal bool IsBitField {
            get { return this.BitCount > 0; }
        }
    }

    struct SBaseType {
        internal SBaseType(Type type, int offset) {
            this.Type = type;
            this.Offset = offset;
        }

        internal readonly Type Type;
        internal readonly int Offset;
    }

    class Type {
        internal Type(string module, string name, uint size, Dictionary<string, SField> fields, List<SBaseType> baseTypes) {
            this.module = module;
            this.name = name;
            this.size = size;
            this.fields = fields;
            if (fields != null) {
                this.caseInsensitiveFields = new Dictionary<string, string>();
                foreach (string field in fields.Keys) {
                    this.caseInsensitiveFields[field.ToLowerInvariant()] = field;
                }
            }
            this.baseTypes = baseTypes;
        }

        internal string Module {
            get { return this.module; }
        }

        internal string Name {
            get { return this.name; }
        }

        internal uint Size {
            get { return this.size; }
        }

        internal bool GetField(string name, out SField field) {
            if (this.fields != null) {
                if (this.fields.ContainsKey(name)) {
                    field = this.fields[name];
                    return true;
                } else if (this.caseInsensitiveFields.ContainsKey(name.ToLowerInvariant())) {
                    field = this.fields[this.caseInsensitiveFields[name.ToLowerInvariant()]];
                    return true;
                } else if (this.baseTypes != null) {
                    // Check the base types.
                    foreach (SBaseType baseType in this.baseTypes) {
                        if (baseType.Type.GetField(name, out field)) {
                            field = new SField((uint)(field.Offset + baseType.Offset), field.TypeName, field.BitOffset, field.BitCount);
                            return true;
                        }
                    }
                }
            }

            field = new SField();
            return false;
        }

        private readonly string module;
        private readonly string name;
        private readonly uint size;
        private readonly Dictionary<string, SField> fields;
        private readonly Dictionary<string, string> caseInsensitiveFields;
        private readonly List<SBaseType> baseTypes;
    }

    class TypeCache {
        internal TypeCache(bool isPointer64Bit) {
            this.types = new Dictionary<string, Type>();
            this.modules = new Dictionary<string, IDiaSession>();
            this.isPointer64Bit = isPointer64Bit;
        }

        internal Type GetType(DebugClient client, DebugControl control, SymbolCache symbolCache, string module, string typename) {
            string key = TypeKey(module, typename);
            if (this.types.ContainsKey(key)) {
                return this.types[key];
            }

            // Is it a built-in type?
            Type builtinType = this.GetBuiltinType(module, typename);
            if (builtinType != null) {
                return builtinType;
            }

            Console.Out.WriteLine("Loading type information for {0}!{1}...", module, typename);

            // We need to retrieve the type from the symbols
            uint typeSize = 0;
            Dictionary<string, SField> fields = new Dictionary<string, SField>();
            List<SBaseType> baseTypes = new List<SBaseType>();

            IDiaSession diaSession = null;

            while (true) {
                try {
                    diaSession = this.LoadDiaSession(symbolCache, module);
                    break;
                } catch (System.Runtime.InteropServices.COMException comException) {
                    if ((uint)comException.ErrorCode == 0x80040154) {
                        Console.WriteLine("Attempting to register msdia110.dll.  This will require elevation...");
                        System.Threading.Thread.Sleep(1000);
                        ProcessStartInfo regsvr = new ProcessStartInfo("regsvr32", @"\\iefs\users\psalas\jsdbg\support\dia\msdia110.dll");
                        regsvr.Verb = "runas";

                        try {
                            Process.Start(regsvr).WaitForExit();
                        } catch (Exception ex) {
                            throw new Debugger.DebuggerException(String.Format("Internal error: Unable to register msdia110.dll: {0}", ex.Message));
                        }
                    }
                } catch (Exception ex) {
                    throw new Debugger.DebuggerException(String.Format("Internal error: {0}", ex.Message));
                }
            }

            IDiaEnumSymbols symbols;
            diaSession.findChildren(diaSession.globalScope, SymTagEnum.SymTagNull, typename, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out symbols);
            foreach (IDiaSymbol symbol in symbols) {
                SymTagEnum symTag = (SymTagEnum)symbol.symTag;
                if (symTag == SymTagEnum.SymTagUDT || symTag == SymTagEnum.SymTagBaseType || symTag == SymTagEnum.SymTagEnum) {
                    // Get the fields for this class.
                    IDiaEnumSymbols dataSymbols;
                    symbol.findChildren(SymTagEnum.SymTagData, null, 0, out dataSymbols);
                    typeSize = (uint)symbol.length;
                    foreach (IDiaSymbol dataSymbol in dataSymbols) {
                        DiaHelpers.LocationType location = (DiaHelpers.LocationType)dataSymbol.locationType;
                        if (location == DiaHelpers.LocationType.LocIsBitField) {
                            byte bitOffset = (byte)dataSymbol.bitPosition;
                            byte bitCount = (byte)dataSymbol.length;
                            fields.Add(dataSymbol.name, new SField((uint)dataSymbol.offset, DiaHelpers.GetTypeName(dataSymbol.type), bitOffset, bitCount));
                        } else if (location == DiaHelpers.LocationType.LocIsThisRel) {
                            fields.Add(dataSymbol.name, new SField((uint)dataSymbol.offset, DiaHelpers.GetTypeName(dataSymbol.type), 0, 0));
                        }
                    }

                    // Get the base types.
                    IDiaEnumSymbols baseClassSymbols;
                    symbol.findChildren(SymTagEnum.SymTagBaseClass, null, 0, out baseClassSymbols);
                    foreach (IDiaSymbol baseClassSymbol in baseClassSymbols) {
                        string baseTypename = DiaHelpers.GetTypeName(baseClassSymbol.type);
                        Type baseType = this.GetType(client, control, symbolCache, module, baseTypename);
                        if (baseType != null) {
                            baseTypes.Add(new SBaseType(baseType, baseClassSymbol.offset));
                        } else {
                            System.Diagnostics.Debug.WriteLine("Unable to retrieve base type: {0}", baseTypename);
                        }
                    }

                    // Construct the type and add it to the cache.
                    Type type = new Type(module, typename, typeSize, fields, baseTypes);
                    this.types.Add(key, type);

                    return type;
                }
            }

            throw new Debugger.DebuggerException(String.Format("Unknown type: {0}", typename));
        }

        internal IDiaSession LoadDiaSession(SymbolCache symbolCache, string module) {
            IDiaSession diaSession;
            if (this.modules.ContainsKey(module)) {
                diaSession = this.modules[module];
            } else {
                // Get the symbol path.
                ulong moduleBase = symbolCache.GetModuleBase(module);
                string symbolPath = symbolCache.GetModuleSymbolPath(moduleBase);
                DiaSource source = new DiaSource();
                source.loadDataFromPdb(symbolPath);
                source.openSession(out diaSession);
                this.modules[module] = diaSession;
            }

            return diaSession;
        }

        // C++ fundamental types as per http://msdn.microsoft.com/en-us/library/cc953fe1.aspx
        static Dictionary<string, uint> BuiltInTypes = new Dictionary<string, uint>()
            {
                {"bool", 1},
                {"char", 1},
                {"__int8", 1},
                {"short", 2},
                {"__int16", 2},
                {"int", 4},
                {"long", 4},
                {"__int32", 4},
                {"float", 4},
                {"double", 8},
                {"long double", 8},
                {"long long", 8},
                {"__int64", 8}
            };

        private Type GetBuiltinType(string module, string typename) {
            string strippedType = typename.Replace("unsigned", "").Replace("signed", "").Trim();
            if (BuiltInTypes.ContainsKey(strippedType)) {
                return new Type(module, typename, BuiltInTypes[strippedType], null, null);
            } else if (strippedType.EndsWith("*")) {
                return new Type(module, typename, this.isPointer64Bit ? 8u : 4u, null, null);
            } else {
                return null;
            }
        }

        private static string TypeKey(string module, string typename) {
            return String.Format("{0}!{1}", module, typename);
        }

        private Dictionary<string, Type> types;
        private Dictionary<string, IDiaSession> modules;
        private bool isPointer64Bit;
    }
}
