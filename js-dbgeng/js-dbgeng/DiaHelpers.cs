using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Dia2Lib;

namespace JsDbg {
    static class DiaHelpers {
        internal enum LocationType {
            LocIsNull = 0,
            LocIsStatic = 1,
            LocIsTLS = 2,
            LocIsRegRel = 3,
            LocIsThisRel = 4,
            LocIsEnregistered = 5,
            LocIsBitField = 6,
            LocIsSlot = 7,
            LocIsIlRel = 8,
            LocInMetaData = 9,
            LocIsConstant = 10,
            LocTypeMax = 10
        }

        internal enum BasicType {
            btNoType = 0,
            btVoid = 1,
            btChar = 2,
            btWChar = 3,
            btInt = 6,
            btUInt = 7,
            btFloat = 8,
            btBCD = 9,
            btBool = 10,
            btLong = 13,
            btULong = 14,
            btCurrency = 25,
            btDate = 26,
            btVariant = 27,
            btComplex = 28,
            btBit = 29,
            btBSTR = 30,
            btHresult = 31
        }

        internal enum NameSearchOptions {
            nsNone = 0,
            nsfCaseSensitive = 0x1,
            nsfCaseInsensitive = 0x2,
            nsfFNameExt = 0x4,
            nsfRegularExpression = 0x8,
            nsfUndecoratedName = 0x10,

            // For backward compatibility:
            nsCaseSensitive = nsfCaseSensitive,
            nsCaseInsensitive = nsfCaseInsensitive,
            nsFNameExt = nsfCaseInsensitive | nsfFNameExt,
            nsRegularExpression = nsfRegularExpression | nsfCaseSensitive,
            nsCaseInRegularExpression = nsfRegularExpression | nsfCaseInsensitive
        }

        internal static string GetBasicTypeName(BasicType type, ulong size) {
            switch (type) {
            case BasicType.btVoid:
                return "void";
            case BasicType.btChar:
            case BasicType.btWChar:
            case BasicType.btLong:
            case BasicType.btInt:
                if (size <= 1) {
                    return "char";
                } else if (size <= 2) {
                    return "short";
                } else if (size <= 4) {
                    return "int";
                } else if (size <= 8) {
                    return "long long";
                }
                break;
            case BasicType.btULong:
            case BasicType.btUInt:
                return "unsigned " + GetBasicTypeName(BasicType.btInt, size);
            case BasicType.btFloat:
                if (size <= 4) {
                    return "float";
                } else if (size <= 8) {
                    return "double";
                }
                break;
            case BasicType.btBool:
                return "bool";
            case BasicType.btNoType:
            case BasicType.btBCD:
            case BasicType.btCurrency:
            case BasicType.btDate:
            case BasicType.btVariant:
            case BasicType.btComplex:
            case BasicType.btBit:
            case BasicType.btBSTR:
            case BasicType.btHresult:
            default:
                break;
            }

            System.Diagnostics.Debug.WriteLine("Unable to get type name for basic type {0} with size {1}", type, size);
            return "void";
        }

        internal static string GetTypeName(IDiaSymbol typeSymbol) {
            switch ((SymTagEnum)typeSymbol.symTag) {
                case SymTagEnum.SymTagArrayType:
                    return GetTypeName(typeSymbol.type) + "[" + typeSymbol.count + "]";
                case SymTagEnum.SymTagBaseType:
                    return GetBasicTypeName((BasicType)typeSymbol.baseType, typeSymbol.length);
                case SymTagEnum.SymTagPointerType:
                    return GetTypeName(typeSymbol.type) + "*";
                case SymTagEnum.SymTagTypedef:
                case SymTagEnum.SymTagEnum:
                case SymTagEnum.SymTagUDT:
                    return typeSymbol.name;
                default:
                    break;
            }

            System.Diagnostics.Debug.WriteLine("Unable to get a type name for {0} ({1})", typeSymbol.name, (SymTagEnum)typeSymbol.symTag);
            return "void";
        }
    }
}
