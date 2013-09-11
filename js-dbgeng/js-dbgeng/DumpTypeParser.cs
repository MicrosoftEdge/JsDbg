using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Debuggers.DbgEng;

namespace JsDbg {
    internal struct SField {
        internal uint Offset;
        internal string FieldName;
        internal string TypeName;
        internal byte BitOffset;
        internal byte BitLength;
    }


    internal class DumpTypeParser {
        internal DumpTypeParser() {
            this.ParsedFields = new List<SField>();
            this.buffer = new StringBuilder();
        }

        internal void DumpTypeOutputHandler(object sender, DebugOutputEventArgs e) {
            this.buffer.Append(e.Output);
        }

        internal void Parse() {
            string[] lines = this.buffer.ToString().Split(new char[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string line in lines) {
                try {
                    string[] parts = line.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                    string offset = parts[0];
                    if (offset[0] == '+') {
                        // Proper offset.
                        SField field = new SField();
                        field.Offset = uint.Parse(offset.Substring(3), System.Globalization.NumberStyles.HexNumber);
                        field.FieldName = parts[1];

                        if (parts[2] != ":") {
                            continue;
                        }

                        ParseType(ArraySlice(parts, 3), ref field);
                        if (field.TypeName != null) {
                            this.ParsedFields.Add(field);
                        }
                    }
                } catch {
                    Console.WriteLine("Error parsing type string: {0}", line);
                }
            }
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

        private bool ParseType(string[] tokens, ref SField result) {
            if (TypeMap.ContainsKey(tokens[0].ToLower())) {
                result.TypeName = TypeMap[tokens[0].ToLower()];
                return result.TypeName != null;
            }

            if (tokens[0] == "Pos") {
                // bit field
                result.TypeName = "int";
                result.BitOffset = byte.Parse(tokens[1].Substring(0, tokens[1].IndexOf(',')));
                result.BitLength = byte.Parse(tokens[2]);
            } else if (tokens[0] == "Ptr32" || tokens[0] == "Ptr64") {
                if (tokens.Length > 1) {
                    SField innerType = new SField();
                    ParseType(ArraySlice(tokens, 1), ref innerType);
                    if (innerType.TypeName == null) {
                        result.TypeName = null;
                    } else {
                        result.TypeName = innerType.TypeName + "*";
                    }
                } else {
                    result.TypeName = "void*";
                }
            } else {
                result.TypeName = tokens[0];
            }

            return true;
        }

        private StringBuilder buffer;
        internal List<SField> ParsedFields;
    }
}
