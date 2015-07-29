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
    class TypeCacheWithFallback : TypeCache
    {
        internal TypeCacheWithFallback(Core.DiaSessionLoader diaLoader, bool isPointer64Bit)
            : base(diaLoader, isPointer64Bit)
        {
        }

        internal Type GetType(DebugClient client, DebugControl control, SymbolCache symbolCache, string module, string typename)
        {
            Type type = base.GetType(module, typename);
            if (type == null)
                type = GetTypeFromDebugSession(client, control, symbolCache, module, typename);
            return type;
        }

        private void PrintDotOnDebugOutput(object sender, DebugOutputEventArgs e) {
            Console.Out.Write('.');
        }

        private Type GetTypeFromDebugSession(DebugClient client, DebugControl control, SymbolCache symbolCache, string module, string typename)
        {
            uint typeSize = 0;

            ulong moduleBase;
            try
            {
                moduleBase = symbolCache.GetModuleBase(module);
            }
            catch
            {
                throw new JsDbg.DebuggerException(String.Format("Invalid module name: {0}", module));
            }

            // Get the type id.
            uint typeId;
            try
            {
                typeId = symbolCache.GetTypeId(moduleBase, typename);
            }
            catch
            {
                throw new JsDbg.DebuggerException(String.Format("Invalid type name: {0}", typename));
            }

            // Get the type size.
            try
            {
                typeSize = symbolCache.GetTypeSize(moduleBase, typeId);
            }
            catch
            {
                throw new JsDbg.DebuggerException("Internal Exception: Invalid type id.");
            }

            // The type is valid so we should be able to dt it without any problems.
            string command = String.Format("dt -v {0}!{1}", module, typename);
            System.Diagnostics.Debug.WriteLine(String.Format("Executing command: {0}", command));
            DumpTypeParser parser = new DumpTypeParser();
            client.DebugOutput += parser.DumpTypeOutputHandler;
            client.DebugOutput += PrintDotOnDebugOutput;
            control.Execute(OutputControl.ToThisClient, command, ExecuteOptions.NotLogged);
            client.FlushCallbacks();
            client.DebugOutput -= PrintDotOnDebugOutput;
            client.DebugOutput -= parser.DumpTypeOutputHandler;
            System.Diagnostics.Debug.WriteLine(String.Format("Done executing.", command));
            parser.Parse();

            if (parser.AnonymousEnums.Count > 0) {
                List<string> anonymousEnums = parser.AnonymousEnums;
                parser.AnonymousEnums = new List<string>();
                parser.ClearBuffer();
                foreach (string enumType in anonymousEnums) {
                    string enumCommand = String.Format("dt -v {0}!{1}", module, enumType);
                    System.Diagnostics.Debug.WriteLine(String.Format("Executing command: {0}", enumCommand));
                    client.DebugOutput += parser.DumpTypeOutputHandler;
                    client.DebugOutput += PrintDotOnDebugOutput;
                    control.Execute(OutputControl.ToThisClient, enumCommand, ExecuteOptions.NotLogged);
                    client.FlushCallbacks();
                    client.DebugOutput -= PrintDotOnDebugOutput;
                    client.DebugOutput -= parser.DumpTypeOutputHandler;
                    System.Diagnostics.Debug.WriteLine(String.Format("Done executing.", enumCommand));
                }
                parser.Parse();
            }
            Console.Out.WriteLine();

            // Construct the type and add it to the cache.
            Dictionary<string, SField> fields = new Dictionary<string, SField>();
            foreach (DumpTypeParser.SField parsedField in parser.ParsedFields)
            {
                string resolvedTypeName = parsedField.TypeName;
                uint resolvedTypeSize = parsedField.Size;

                if (resolvedTypeName == null)
                {
                    // We weren't able to parse the type name.  Retrieve it manually.
                    SymbolCache.SFieldTypeAndOffset fieldTypeAndOffset;
                    try
                    {
                        fieldTypeAndOffset = symbolCache.GetFieldTypeAndOffset(moduleBase, typeId, parsedField.FieldName);

                        if (fieldTypeAndOffset.Offset != parsedField.Offset)
                        {
                            // The offsets don't match...this must be a different field?
                            throw new Exception();
                        }

                        resolvedTypeName = symbolCache.GetTypeName(moduleBase, fieldTypeAndOffset.FieldTypeId);
                    }
                    catch
                    {
                        throw new JsDbg.DebuggerException(String.Format("Internal Exception: Inconsistent field name \"{0}\" when parsing type {1}!{2}", parsedField.FieldName, module, typename));
                    }
                }

                if (resolvedTypeSize == uint.MaxValue)
                {
                    if (!BuiltInTypes.TryGetValue(resolvedTypeName, out resolvedTypeSize))
                    {
                        try {
                            uint fieldTypeId = symbolCache.GetTypeId(moduleBase, resolvedTypeName);
                            resolvedTypeSize = symbolCache.GetTypeSize(moduleBase, fieldTypeId);
                        } catch {
                            throw new JsDbg.DebuggerException(String.Format("Internal Exception: Unknown type \"{0}\" found when parsing type {1}!{2}", resolvedTypeName, module, typename));
                        }
                    }
                }

                SField field = new SField(parsedField.Offset, resolvedTypeSize, resolvedTypeName, parsedField.BitField.BitOffset, parsedField.BitField.BitLength);
                fields.Add(parsedField.FieldName, field);
            }

            List<SBaseTypeName> baseTypeNames = new List<SBaseTypeName>();
            foreach (DumpTypeParser.SBaseClass parsedBaseClass in parser.ParsedBaseClasses)
            {
                baseTypeNames.Add(new SBaseTypeName(parsedBaseClass.TypeName, (int)parsedBaseClass.Offset));
            }

            Dictionary<string, ulong> constants = new Dictionary<string, ulong>();
            foreach (SConstantResult constant in parser.ParsedConstants) {
                constants.Add(constant.ConstantName, constant.Value);
            }

            // Construct the type and add it to the cache.  We don't need to fill base types because this approach embeds base type information directly in the Type.
            Type type = new Type(module, typename, typeSize, fields, constants, null, baseTypeNames);
            this.types.Add(TypeKey(module, typename), type);
            return type;
        }
    }
}
