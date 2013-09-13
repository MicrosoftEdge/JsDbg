using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;
using Dia2Lib;
using System.Diagnostics;
using System.IO;

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

    struct SBaseTypeName {
        internal SBaseTypeName(string name, int offset) {
            this.Name = name;
            this.Offset = offset;
        }

        internal readonly string Name;
        internal readonly int Offset;
    }

    class Type {
        internal Type(string module, string name, uint size, Dictionary<string, SField> fields, List<SBaseType> baseTypes, List<SBaseTypeName> baseTypeNames) {
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
            this.baseTypeNames = baseTypeNames;
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

        internal bool GetBaseTypeOffset(string baseName, out int offset) {
            if (this.baseTypes != null) {
                foreach (SBaseType baseType in this.baseTypes) {
                    if (baseType.Type.Name == baseName) {
                        // Our base type matches.
                        offset = baseType.Offset;
                        return true;
                    } else if (baseType.Type.GetBaseTypeOffset(baseName, out offset)) {
                        // Our base type has a base type that matches.
                        offset = baseType.Offset + offset;
                        return true;
                    }
                }
            }

            if (this.baseTypeNames != null) {
                foreach (SBaseTypeName baseTypeName in this.baseTypeNames) {
                    if (baseTypeName.Name == baseName) {
                        offset = baseTypeName.Offset;
                        return true;
                    }
                }
            }

            offset = 0;
            return false;
        }

        private readonly string module;
        private readonly string name;
        private readonly uint size;
        private readonly Dictionary<string, SField> fields;
        private readonly Dictionary<string, string> caseInsensitiveFields;
        private readonly List<SBaseType> baseTypes;
        private readonly List<SBaseTypeName> baseTypeNames;
    }

    class TypeCache {
        internal TypeCache(bool isPointer64Bit) {
            this.types = new Dictionary<string, Type>();
            this.modules = new Dictionary<string, IDiaSession>();
            this.isPointer64Bit = isPointer64Bit;
            this.didAttemptDIARegistration = false;
            this.isInFallback = false;
        }

        internal Type GetType(DebugClient client, DebugControl control, SymbolCache symbolCache, string module, string typename) {
            string key = TypeKey(module, typename);
            if (this.types.ContainsKey(key)) {
                return this.types[key];
            }

            // Is it a built-in type?
            Type builtinType = this.GetBuiltinType(module, typename);
            if (builtinType != null) {
                this.types.Add(key, builtinType);
                return builtinType;
            }

            Console.Out.WriteLine("Loading type information for {0}!{1}...", module, typename);

            IDiaSession diaSession = null;
            while (!this.isInFallback) {
                try {
                    diaSession = this.LoadDiaSession(symbolCache, module);
                    break;
                } catch (System.Runtime.InteropServices.COMException comException) {
                    if ((uint)comException.ErrorCode == 0x80040154 && !this.didAttemptDIARegistration) {
                        // The DLL isn't registered.
                        this.didAttemptDIARegistration = true;
                        try {
                            this.AttemptDIARegistration();
                        } catch (Exception ex) {
                            // Go into fallback.
                            Console.Out.WriteLine("Falling back due to DIA registration failure: {0}", ex.Message);
                        }
                    }

                    this.isInFallback = true;
                } catch {
                    this.isInFallback = true;
                }
            }

            if (diaSession != null) {
                IDiaEnumSymbols symbols;
                diaSession.findChildren(diaSession.globalScope, SymTagEnum.SymTagNull, typename, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out symbols);
                foreach (IDiaSymbol symbol in symbols) {
                    SymTagEnum symTag = (SymTagEnum)symbol.symTag;
                    if (symTag == SymTagEnum.SymTagUDT || symTag == SymTagEnum.SymTagBaseType || symTag == SymTagEnum.SymTagEnum) {
                        // Get the fields for this class.
                        IDiaEnumSymbols dataSymbols;
                        symbol.findChildren(SymTagEnum.SymTagData, null, 0, out dataSymbols);
                        uint typeSize = (uint)symbol.length;
                        Dictionary<string, SField> fields = new Dictionary<string, SField>();

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
                        List<SBaseType> baseTypes = new List<SBaseType>();
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
                        Type type = new Type(module, typename, typeSize, fields, baseTypes, null);
                        this.types.Add(key, type);

                        return type;
                    }
                }
            }

            // Something prevented us from using DIA for type discovery.  Fall back to getting type info from the debugger session.
            Console.Out.WriteLine("WARNING: Unable to load {0}!{1} from PDBs. Falling back to the debugger, which could be slow...", module, typename);
            return this.GetTypeFromDebugSession(client, control, symbolCache, module, typename);
        }

        private IDiaSession LoadDiaSession(SymbolCache symbolCache, string module) {
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

        private void AttemptDIARegistration() {
            string dllName = "msdia110.dll";
            Console.WriteLine("Attempting to register {0}.  This will require elevation...", dllName);

            // Copy it down to the support directory if needed.
            string dllPath = Path.Combine(Program.SupportDirectory, dllName);

            System.Threading.Thread.Sleep(1000);
            ProcessStartInfo regsvr = new ProcessStartInfo("regsvr32", dllPath);
            regsvr.Verb = "runas";

            Process.Start(regsvr).WaitForExit();
        }

        private Type GetTypeFromDebugSession(DebugClient client, DebugControl control, SymbolCache symbolCache, string module, string typename) {
            uint typeSize = 0;

            ulong moduleBase;
            try {
                moduleBase = symbolCache.GetModuleBase(module);
            } catch {
                throw new Debugger.DebuggerException(String.Format("Invalid module name: {0}", module));
            }

            // Get the type id.
            uint typeId;
            try {
                typeId = symbolCache.GetTypeId(moduleBase, typename);
            } catch {
                throw new Debugger.DebuggerException(String.Format("Invalid type name: {0}", typename));
            }

            // Get the type size.
            try {
                typeSize = symbolCache.GetTypeSize(moduleBase, typeId);
            } catch {
                throw new Debugger.DebuggerException("Internal Exception: Invalid type id.");
            }

            // The type is valid so we should be able to dt it without any problems.
            string command = String.Format("dt -v {0}!{1}", module, typename);
            System.Diagnostics.Debug.WriteLine(String.Format("Executing command: {0}", command));
            DumpTypeParser parser = new DumpTypeParser();
            client.DebugOutput += parser.DumpTypeOutputHandler;
            control.Execute(OutputControl.ToThisClient, command, ExecuteOptions.NotLogged);
            client.FlushCallbacks();
            client.DebugOutput -= parser.DumpTypeOutputHandler;
            System.Diagnostics.Debug.WriteLine(String.Format("Done executing.", command));
            parser.Parse();

            // Construct the type and add it to the cache.
            Dictionary<string, SField> fields = new Dictionary<string, SField>();
            foreach (DumpTypeParser.SField parsedField in parser.ParsedFields) {
                string resolvedTypeName = parsedField.TypeName;
                if (resolvedTypeName == null) {
                    // We weren't able to parse the type name.  Retrieve it manually.
                    SymbolCache.SFieldTypeAndOffset fieldTypeAndOffset;
                    try {
                        fieldTypeAndOffset = symbolCache.GetFieldTypeAndOffset(moduleBase, typeId, parsedField.FieldName);

                        if (fieldTypeAndOffset.Offset != parsedField.Offset) {
                            // The offsets don't match...this must be a different field?
                            throw new Exception();
                        }

                        resolvedTypeName = symbolCache.GetTypeName(moduleBase, fieldTypeAndOffset.FieldTypeId);
                    } catch {
                        throw new Debugger.DebuggerException(String.Format("Internal Exception: Inconsistent field name \"{0}\" when parsing type {1}!{2}", parsedField.FieldName, module, typename));
                    }
                }

                SField field = new SField(parsedField.Offset, resolvedTypeName, parsedField.BitField.BitOffset, parsedField.BitField.BitLength);
                fields.Add(parsedField.FieldName, field);
            }

            List<SBaseTypeName> baseTypeNames = new List<SBaseTypeName>();
            foreach (DumpTypeParser.SBaseClass parsedBaseClass in parser.ParsedBaseClasses) {
                baseTypeNames.Add(new SBaseTypeName(parsedBaseClass.TypeName, (int)parsedBaseClass.Offset));
            }

            // Construct the type and add it to the cache.  We don't need to fill base types because this approach embeds base type information directly in the Type.
            Type type = new Type(module, typename, typeSize, fields, null, baseTypeNames);
            this.types.Add(TypeKey(module, typename), type);
            return type;
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
                return new Type(module, typename, BuiltInTypes[strippedType], null, null, null);
            } else if (strippedType.EndsWith("*")) {
                return new Type(module, typename, this.isPointer64Bit ? 8u : 4u, null, null, null);
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
        private bool didAttemptDIARegistration;
        private bool isInFallback;
    }
}
