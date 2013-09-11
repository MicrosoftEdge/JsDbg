using System;   
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;

namespace JsDbg {
    internal class DumpTypeParser {
        internal struct SField {
            internal uint Offset;
            internal string FieldName;
            internal string TypeName;
            internal SBitFieldDescription BitField;
        }

        internal struct SBaseClass {
            internal uint Offset;
            internal string TypeName;
        }

        internal struct SBitFieldDescription {
            internal byte BitOffset;
            internal byte BitLength;

            internal bool IsBitField {
                get { return this.BitLength != 0; }
            }
        }

        internal DumpTypeParser() {
            this.ParsedBaseClasses = new List<SBaseClass>();
            this.ParsedFields = new List<SField>();
            this.buffer = new StringBuilder();
        }

        internal void DumpTypeOutputHandler(object sender, DebugOutputEventArgs e) {
            this.buffer.Append(e.Output);
        }

        internal void Parse() {
            string[] lines = SanitizeInput(this.buffer.ToString()).Split(new char[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string line in lines) {
                string[] parts = line.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                string offsetString = parts[0];
                if (offsetString[0] == '+') {
                    // The line has an offset.
                    uint offset = uint.Parse(offsetString.Substring(3), System.Globalization.NumberStyles.HexNumber);

                    switch (parts[1]) {
                        case "__BaseClass":
                            // +0x000 __BaseClass class [typename]
                            this.ParsedBaseClasses.Add(new SBaseClass() { Offset = offset, TypeName = parts[3] });
                            break;
                        case "__VFN_table":
                            // Ignore vtables.
                            break;
                        default:  {
                            // A field.
                            SField field = new SField() { Offset = offset, FieldName = parts[1] };
                            if (parts.Length > 3 && ParseType(ArraySlice(parts, 3), out field.TypeName, out field.BitField)) {
                                this.ParsedFields.Add(field);
                            } else {
                                System.Diagnostics.Debug.WriteLine(String.Format("Unable to parse type entry: {0}", line));
                            }
                            break;
                        }
                    }
                }
            }
        }

        private static string SanitizeInput(string input) {
            return input.Replace(",", "");
        }

        private string[] ArraySlice(string[] array, int firstIndex) {
            string[] newArray = new string[array.Length - firstIndex];
            for (int i = firstIndex; i < array.Length; ++i) {
                newArray[i - firstIndex] = array[i];
            }
            return newArray;
        }


        private static Dictionary<string, string> TypeMap = new Dictionary<string, string>() {
                {"void", "void"},
                {"char", "char"},
                {"wchar", "short"},
                {"int1b", "char"},
                {"int2b", "short"},
                {"int4b", "int"},
                {"int8b", "long long"},
                {"uchar", "unsigned char"},
                {"uint1b", "unsigned char"},
                {"uint2b", "unsigned short"},
                {"uint4b", "unsigned int"},
                {"uint8b", "unsigned long long"},
                {"float", null}
            };

        private bool ParseType(string[] tokens, out string typename, out SBitFieldDescription bitField) {
            typename = null;
            bitField = new SBitFieldDescription();

            string normalizedDescription = tokens[0].ToLower();
            if (TypeMap.ContainsKey(normalizedDescription)) {
                // Simple type.
                typename = TypeMap[normalizedDescription];
                bitField = new SBitFieldDescription();
                return true;
            }

            if (normalizedDescription.StartsWith("ptr")) {
                if (tokens.Length > 2 && tokens[1] == "to") {
                    // Pointer type.  Recursively discover the type.

                    // We should never have a pointer to a bit field.
                    if (ParseType(ArraySlice(tokens, 2), out typename, out bitField) && !bitField.IsBitField) {
                        // If we could determine the type name, add a * for the pointer-ness.
                        if (typename != null) {
                            typename += "*";
                        }
                        return true;
                    }
                }

                return false;
            }

            if (tokens.Length > 1 && normalizedDescription.StartsWith("[") && normalizedDescription.EndsWith("]")) {
                // It's an array.  Recursively discover the type.

                // We should never have an array of bit fields.
                if (ParseType(ArraySlice(tokens, 1), out typename, out bitField) && !bitField.IsBitField) {
                    // If we could determine the type name, add a [] for the array-ness.
                    if (typename != null) {
                        typename += "[]";
                    }
                    return true;
                }
            }

            if (tokens.Length > 1 && normalizedDescription == "class" || normalizedDescription == "struct" || normalizedDescription == "union" || normalizedDescription == "enum") {
                // The next token is a proper typename.
                typename = tokens[1];
                bitField = new SBitFieldDescription();
                return true;
            }

            if (tokens.Length > 3 && normalizedDescription == "bitfield") {
                // Bitfield Pos 0 3 Bits
                bitField = new SBitFieldDescription();
                if (byte.TryParse(tokens[2], out bitField.BitOffset) && byte.TryParse(tokens[3], out bitField.BitLength)) {
                    int bitCount = bitField.BitOffset + bitField.BitLength;
                    if (bitCount <= 8) {
                        typename = "char";
                    } else if (bitCount <= 16) {
                        typename = "short";
                    } else if (bitCount <= 32) {
                        typename = "int";
                    } else if (bitCount <= 64) {
                        typename =  "long long";
                    } else {
                        return false;
                    }

                    return true;
                }
            }

            return false;
        }

        private StringBuilder buffer;
        internal List<SBaseClass> ParsedBaseClasses;
        internal List<SField> ParsedFields;
    }
}
