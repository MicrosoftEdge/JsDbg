using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;

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

    class Type {
        internal Type(string module, string name, uint size, Dictionary<string, SField> fields, Dictionary<string, uint> baseClassOffsets) {
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
            this.baseClassOffsets = baseClassOffsets;
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
        private readonly Dictionary<string, uint> baseClassOffsets;
    }

    class TypeCache {
        internal TypeCache(bool isPointer64Bit) {
            this.types = new Dictionary<string, Type>();
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

            // We need to retrieve the type from the debugger.

            // Get the module.
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
            uint typeSize;
            try {
                typeSize = symbolCache.GetTypeSize(moduleBase, typeId);
            } catch {
                throw new Debugger.DebuggerException("Internal Exception: Invalid type id.");
            }

            // The type is valid so we should be able to dt it without any problems.
            string command = String.Format("dt -v {0}!{1}", module, typename);
            DumpTypeParser parser = new DumpTypeParser();
            client.DebugOutput += parser.DumpTypeOutputHandler;
            control.Execute(OutputControl.ToThisClient, command, ExecuteOptions.NotLogged);
            client.FlushCallbacks();
            client.DebugOutput -= parser.DumpTypeOutputHandler;
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

            Dictionary<string, uint> baseClassOffsets = new Dictionary<string, uint>();
            foreach (DumpTypeParser.SBaseClass parsedBaseClass in parser.ParsedBaseClasses) {
                baseClassOffsets.Add(parsedBaseClass.TypeName, parsedBaseClass.Offset);
            }

            // Construct the type and add it to the cache.
            Type type = new Type(module, typename, typeSize, fields, baseClassOffsets);
            this.types.Add(key, type);

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
        private bool isPointer64Bit;
    }
}
