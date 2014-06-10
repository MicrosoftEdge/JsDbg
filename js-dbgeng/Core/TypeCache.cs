using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;
using Dia2Lib;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;

namespace JsDbg
{
    #region Helper Structs
    public struct SField {
        public SField(uint offset, uint size, string typename, byte bitOffset, byte bitCount) {
            this.Offset = offset;
            this.Size = size;
            this.TypeName = typename;
            this.BitOffset = bitOffset;
            this.BitCount = bitCount;
        }

        public readonly uint Offset;
        public readonly uint Size;
        public readonly string TypeName;
        public readonly byte BitOffset;
        public readonly byte BitCount;

        public bool IsBitField {
            get { return this.BitCount > 0; }
        }
    }

    public struct SBaseType {
        public SBaseType(Type type, int offset) {
            this.Type = type;
            this.Offset = offset;
        }

        public readonly Type Type;
        public readonly int Offset;
    }

    public struct SBaseTypeName {
        public SBaseTypeName(string name, int offset) {
            this.Name = name;
            this.Offset = offset;
        }

        public readonly string Name;
        public readonly int Offset;
    }
   
    public class Type {
        public Type(string module, string name, uint size, Dictionary<string, SField> fields, List<SBaseType> baseTypes, List<SBaseTypeName> baseTypeNames) {
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

        public string Module {
            get { return this.module; }
        }

        public string Name {
            get { return this.name; }
        }

        public uint Size {
            get { return this.size; }
        }

        public bool GetField(string name, out SField field) {
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
                            field = new SField((uint)(field.Offset + baseType.Offset), field.Size, field.TypeName, field.BitOffset, field.BitCount);
                            return true;
                        }
                    }
                }
            }

            field = new SField();
            return false;
        }

        public IEnumerable<SBaseTypeResult> BaseTypes {
            get {
                if (this.baseTypes != null) {
                    foreach (SBaseType baseType in this.baseTypes) {
                        SBaseTypeResult result = new SBaseTypeResult();
                        result.TypeName = baseType.Type.Name;
                        result.Offset = baseType.Offset;
                        yield return result;

                        foreach (SBaseTypeResult nestedBaseType in baseType.Type.BaseTypes) {
                            SBaseTypeResult nestedBaseTypeResult = nestedBaseType;
                            nestedBaseTypeResult.Offset += baseType.Offset;
                            yield return nestedBaseTypeResult;
                        }
                    }
                } else if (this.baseTypeNames != null) {
                    foreach (SBaseTypeName baseTypeName in this.baseTypeNames) {
                        SBaseTypeResult result = new SBaseTypeResult();
                        result.TypeName = baseTypeName.Name;
                        result.Offset = baseTypeName.Offset;
                        yield return result;
                    }
                }

                yield break;
            }
        }
        
        public IEnumerable<SFieldResult> Fields {
            get {
                if (this.baseTypes != null) {
                    foreach (SBaseType baseType in this.baseTypes) {
                        foreach (SFieldResult innerBaseField in baseType.Type.Fields) {
                            SFieldResult baseField = innerBaseField;
                            baseField.Offset = (uint)(baseField.Offset + baseType.Offset);
                            yield return baseField;
                        }
                    }
                }

                if (this.fields != null) {
                    foreach (string fieldName in this.fields.Keys) {
                        SField innerField = this.fields[fieldName];
                        SFieldResult field = new SFieldResult();
                        field.FieldName = fieldName;
                        field.TypeName = innerField.TypeName;
                        field.Offset = innerField.Offset;
                        field.Size = innerField.Size;
                        field.BitCount = innerField.BitCount;
                        field.BitOffset = innerField.BitOffset;
                        yield return field;
                    }
                }

                yield break;
            }
        }

        private readonly string module;
        private readonly string name;
        private readonly uint size;
        private readonly Dictionary<string, SField> fields;
        private readonly Dictionary<string, string> caseInsensitiveFields;
        private readonly List<SBaseType> baseTypes;
        private readonly List<SBaseTypeName> baseTypeNames;
    }


    public struct SLocalVariable {
        public long FrameOffset;
        public string Type;
    }
#endregion

    public class TypeCache {
        public TypeCache(bool isPointer64Bit, GetModuleSymbolPathDelegate getModuleSymbolPath) {
            this.types = new Dictionary<string, Type>();
            this.modules = new Dictionary<string, IDiaSession>();
            this.isPointer64Bit = isPointer64Bit;
            this.didAttemptDIARegistration = false;
            this.isInFallback = false;
            this.GetModuleSymbolPath = getModuleSymbolPath;
        }

        private static Regex ArrayIndexRegex = new Regex(@"\[[0-9]*\]");
        public Type GetType(string module, string typename) {
            typename = ArrayIndexRegex.Replace(typename, "");

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

            IDiaSession diaSession = this.AttemptLoadDiaSession(module);
            if (diaSession != null) {
                Type type = this.GetTypeFromDiaSession(diaSession, module, typename, DiaHelpers.NameSearchOptions.nsCaseSensitive);
                if (type == null) {
                    type = this.GetTypeFromDiaSession(diaSession, module, typename, DiaHelpers.NameSearchOptions.nsCaseInsensitive);
                }
                if (type != null) {
                    this.types.Add(key, type);
                }
                return type;
            }

            // Something prevented us from using DIA for type discovery.  Fall back to getting type info from the debugger session.
            Console.Out.WriteLine("WARNING: Unable to load {0}!{1} from PDBs. Falling back to the debugger, which could be slow...", module, typename);
            return null;
        }

        public IList<SLocalVariable> GetLocals(string module, string method, string symbolName) {
            IDiaSession diaSession = this.AttemptLoadDiaSession(module);
            if (diaSession == null) {
                return null;
            }

            List<SLocalVariable> results = new List<SLocalVariable>();
            IDiaEnumSymbols symbols;
            diaSession.findChildren(diaSession.globalScope, SymTagEnum.SymTagFunction, method, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out symbols);
            
            foreach (IDiaSymbol symbol in symbols) {
                List<IDiaSymbol> symbolResults = new List<IDiaSymbol>();
                this.AccumulateChildLocalSymbols(symbol, symbolName, symbolResults);
                foreach (IDiaSymbol resultSymbol in symbolResults) {
                    if ((DiaHelpers.LocationType)resultSymbol.locationType == DiaHelpers.LocationType.LocIsRegRel) {
                        results.Add(new SLocalVariable() { FrameOffset = resultSymbol.offset, Type = DiaHelpers.GetTypeName(resultSymbol.type) });
                    }
                }
            }

            return results;
        }

        private void AccumulateChildLocalSymbols(IDiaSymbol symbol, string symbolName, List<IDiaSymbol> results) {
            IDiaEnumSymbols dataSymbols;
            symbol.findChildren(SymTagEnum.SymTagData, symbolName, (uint)DiaHelpers.NameSearchOptions.nsCaseSensitive, out dataSymbols);
            foreach (IDiaSymbol dataSymbol in dataSymbols) {
                results.Add(dataSymbol);
            }

            IDiaEnumSymbols blockSymbols;
            symbol.findChildren(SymTagEnum.SymTagBlock, null, (uint)DiaHelpers.NameSearchOptions.nsNone, out blockSymbols);
            foreach (IDiaSymbol blockSymbol in blockSymbols) {
                AccumulateChildLocalSymbols(blockSymbol, symbolName, results);
            }
        }

        private Type GetTypeFromDiaSession(IDiaSession diaSession, string module, string typename, DiaHelpers.NameSearchOptions options) {
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

                    foreach (IDiaSymbol dataSymbol in dataSymbols) {
                        DiaHelpers.LocationType location = (DiaHelpers.LocationType)dataSymbol.locationType;
                        if (location == DiaHelpers.LocationType.LocIsBitField) {
                            byte bitOffset = (byte)dataSymbol.bitPosition;
                            byte bitCount = (byte)dataSymbol.length;
                            fields.Add(dataSymbol.name, new SField((uint)dataSymbol.offset, (uint)dataSymbol.type.length, DiaHelpers.GetTypeName(dataSymbol.type), bitOffset, bitCount));
                        } else if (location == DiaHelpers.LocationType.LocIsThisRel) {
                            fields.Add(dataSymbol.name, new SField((uint)dataSymbol.offset, (uint)dataSymbol.type.length, DiaHelpers.GetTypeName(dataSymbol.type), 0, 0));
                        }
                    }

                    // Get the base types.
                    List<SBaseType> baseTypes = new List<SBaseType>();
                    IDiaEnumSymbols baseClassSymbols;
                    symbol.findChildren(SymTagEnum.SymTagBaseClass, null, 0, out baseClassSymbols);
                    foreach (IDiaSymbol baseClassSymbol in baseClassSymbols) {
                        string baseTypename = DiaHelpers.GetTypeName(baseClassSymbol.type);
                        Type baseType = this.GetType(module, baseTypename);
                        if (baseType != null) {
                            baseTypes.Add(new SBaseType(baseType, baseClassSymbol.offset));
                        } else {
                            System.Diagnostics.Debug.WriteLine("Unable to retrieve base type: {0}", baseTypename);
                        }
                    }

                    // Construct the type.
                    Type type = new Type(module, typename, typeSize, fields, baseTypes, null);
                    return type;
                }
            }

            return null;
        }

        private IDiaSession AttemptLoadDiaSession(string module) {
            while (!this.isInFallback) {
                try {
                    IDiaSession diaSession;
                    if (this.modules.ContainsKey(module)) {
                        diaSession = this.modules[module];
                    } else {
                        // Get the symbol path.                
                        DiaSource source = new DiaSource();
                        source.loadDataFromPdb(this.GetModuleSymbolPath(module));
                        source.openSession(out diaSession);
                        this.modules[module] = diaSession;
                    }

                    return diaSession;
                } catch (JsDbg.DebuggerException) {
                    throw;
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

            return null;
        }

        private void AttemptDIARegistration() {
            string dllName = "msdia110.dll";
            Console.WriteLine("Attempting to register {0}.  This will require elevation...", dllName);

            // Copy it down to the support directory if needed.
            string dllPath = Path.Combine(WebServer.LocalSupportDirectory, dllName);
            if (!File.Exists(dllName)) {
                if (!Directory.Exists(WebServer.LocalSupportDirectory)) {
                    Directory.CreateDirectory(WebServer.LocalSupportDirectory);
                }
                string remotePath = Path.Combine(WebServer.SharedSupportDirectory, dllName);
                File.Copy(remotePath, dllPath);
            }

            System.Threading.Thread.Sleep(1000);
            ProcessStartInfo regsvr = new ProcessStartInfo("regsvr32", dllPath);
            regsvr.Verb = "runas";

            Process.Start(regsvr).WaitForExit();
        }              

        public void PrintDotOnDebugOutput(object sender, DebugOutputEventArgs e) {
            Console.Out.Write('.');
        }

        // C++ fundamental types as per http://msdn.microsoft.com/en-us/library/cc953fe1.aspx
        protected static Dictionary<string, uint> BuiltInTypes = new Dictionary<string, uint>()
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

        protected static string TypeKey(string module, string typename) {
            return String.Format("{0}!{1}", module, typename);
        }

        public delegate string GetModuleSymbolPathDelegate(string moduleName);
        private GetModuleSymbolPathDelegate GetModuleSymbolPath;

        protected Dictionary<string, Type> types;
        private Dictionary<string, IDiaSession> modules;
        private bool isPointer64Bit;
        private bool didAttemptDIARegistration;
        private bool isInFallback;
    }
}
