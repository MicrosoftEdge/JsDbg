using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
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
        public Type(string module, string name, uint size, bool isEnum, Dictionary<string, SField> fields, Dictionary<string, ulong> constants, List<SBaseType> baseTypes) {
            this.module = module;
            this.name = name;
            this.size = size;
            this.fields = fields;
            this.isEnum = isEnum;
            if (fields != null) {
                this.caseInsensitiveFields = new Dictionary<string, string>();
                foreach (string field in fields.Keys) {
                    this.caseInsensitiveFields[field.ToLowerInvariant()] = field;
                }
            }
            this.constants = constants;
            if (this.constants != null) {
                this.caseInsensitiveConstants = new Dictionary<string, string>();
                foreach (string constantName in constants.Keys) {
                    this.caseInsensitiveConstants[constantName.ToLowerInvariant()] = constantName;
                }
            }
            this.baseTypes = baseTypes;
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

        public bool IsEnum {
            get { return this.isEnum; }
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

        public bool GetConstantValue(string name, out ulong value) {
            if (this.constants != null) {
                if (this.constants.ContainsKey(name)) {
                    value = this.constants[name];
                    return true;
                } else if (this.caseInsensitiveConstants.ContainsKey(name.ToLowerInvariant())) {
                    value = this.constants[this.caseInsensitiveConstants[name.ToLowerInvariant()]];
                    return true;
                } else if (this.baseTypes != null) {
                    foreach (SBaseType baseType in this.baseTypes) {
                        if (baseType.Type.GetConstantValue(name, out value)) {
                            return true;
                        }
                    }
                }
            }

            value = 0;
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
                }

                yield break;
            }
        }
        
        public IEnumerable<SFieldResult> Fields(bool includeBaseTypes) {
            if (includeBaseTypes && this.baseTypes != null) {
                foreach (SBaseType baseType in this.baseTypes) {
                    foreach (SFieldResult innerBaseField in baseType.Type.Fields(includeBaseTypes: true)) {
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

        public IEnumerable<SConstantResult> Constants {
            get {
                if (this.baseTypes != null) {
                    foreach (SBaseType baseType in this.baseTypes) {
                        foreach (SConstantResult innerBaseConstant in baseType.Type.Constants) {
                            yield return innerBaseConstant;
                        }
                    }
                }

                if (this.constants != null) {
                    foreach (string constantName in this.constants.Keys) {
                        yield return new SConstantResult() { ConstantName = constantName, Value = this.constants[constantName] };
                    }
                }
            }
        }

        private readonly string module;
        private readonly string name;
        private readonly uint size;
        private readonly Dictionary<string, SField> fields;
        private readonly Dictionary<string, string> caseInsensitiveFields;
        private readonly Dictionary<string, ulong> constants;
        private readonly Dictionary<string, string> caseInsensitiveConstants;
        private readonly List<SBaseType> baseTypes;
        private readonly bool isEnum;
    }


    public struct SLocalVariable {
        public bool IsOffsetFromBottom;
        public long FrameOffset;
        public string Type;
    }
#endregion

    public class TypeCache {
        public TypeCache(bool isPointer64Bit) {
            this.types = new Dictionary<string, Type>();
            this.modulePointerSizes = new Dictionary<string, uint>();
            this.isPointer64Bit = isPointer64Bit;
        }

        public Type GetCachedType(IDiaSession session, string module, string typename) {
            string key = TypeKey(module, typename);
            if (this.types.ContainsKey(key)) {
                return this.types[key];
            }

            // Is it a built-in type?
            Type builtinType = this.GetBuiltinType(session, module, typename);
            if (builtinType != null) {
                this.types.Add(key, builtinType);
                return builtinType;
            }

            return null;
        }

        public void AddType(Type type) {
            string key = TypeKey(type.Module, type.Name);
            this.types.Add(key, type);
        }
        private static string TypeKey(string module, string typename) {
            return String.Format("{0}!{1}", module, typename);
        }
        // C++ fundamental types as per http://msdn.microsoft.com/en-us/library/cc953fe1.aspx
        public static Dictionary<string, uint> BuiltInTypes = new Dictionary<string, uint>()
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

        private Type GetBuiltinType(IDiaSession session, string module, string typename) {
            string strippedType = typename.Replace("unsigned", "").Replace("signed", "").Trim();
            if (BuiltInTypes.ContainsKey(strippedType)) {
                return new Type(module, typename, BuiltInTypes[strippedType], false, null, null, null);
            } else if (strippedType.EndsWith("*")) {
                uint pointerSize = this.isPointer64Bit ? 8u : 4u;

                if (this.modulePointerSizes.ContainsKey(module)) {
                    uint cachedPointerSize = this.modulePointerSizes[module];
                    if (cachedPointerSize != 0) {
                        pointerSize = cachedPointerSize;
                    }
                } else if (session != null) {
                    // Try to infer the pointer size from the DIA Session.
                    IDiaEnumSymbols pointerSymbols;
                    session.findChildren(session.globalScope, SymTagEnum.SymTagPointerType, null, 0, out pointerSymbols);
                    foreach (IDiaSymbol symbol in pointerSymbols) {
                        pointerSize = (uint)symbol.length;
                        break;
                    }
                    this.modulePointerSizes[module] = pointerSize;
                }

                return new Type(module, typename, pointerSize, false, null, null, null);
            } else {
                return null;
            }
        }

        private Dictionary<string, Type> types;
        private Dictionary<string, uint> modulePointerSizes;
        private bool isPointer64Bit;
    }
}
