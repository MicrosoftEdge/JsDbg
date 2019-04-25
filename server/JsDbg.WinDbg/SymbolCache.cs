//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;

namespace JsDbg.WinDbg {
    class SymbolCache : IDisposable {
        internal struct SFieldTypeAndOffset {
            internal uint FieldTypeId;
            internal uint Offset;
        }

        internal SymbolCache(Microsoft.Debuggers.DbgEng.DebugClient client) {
            this.symbols = new Microsoft.Debuggers.DbgEng.DebugSymbols(client);
            
            this.fieldTypeAndOffsetCache = new Dictionary<SFieldTypeAndOffsetKey, SFieldTypeAndOffset>();
        }

        internal ulong GetModuleBase(string moduleName) {
            uint moduleIndex;
            ulong moduleBase;
            this.symbols.GetModuleByModuleName(moduleName, /*startIndex*/0, out moduleIndex, out moduleBase);
            return moduleBase;
        }

        internal void GetModule(ulong address, out ulong moduleBase, out string moduleName) {
            uint index;
            this.symbols.GetModuleByOffset(address, 0, out index, out moduleBase);
            moduleName = this.symbols.GetModuleNameStringByBaseAddress(Microsoft.Debuggers.DbgEng.ModuleName.Module, moduleBase);
        }

        internal uint GetTypeId(ulong moduleBase, string typeName) {
            return this.symbols.GetTypeId(moduleBase, typeName);
        }

        internal SFieldTypeAndOffset GetFieldTypeAndOffset(ulong moduleBase, uint typeId, string field) {
            SFieldTypeAndOffsetKey key = new SFieldTypeAndOffsetKey(moduleBase, typeId, field);
            SFieldTypeAndOffset result;
            if (this.fieldTypeAndOffsetCache.TryGetValue(key, out result)) {
                return result;
            }

            result = new SFieldTypeAndOffset();
            this.symbols.GetFieldTypeAndOffset(moduleBase, typeId, field, out result.FieldTypeId, out result.Offset);

            this.fieldTypeAndOffsetCache.Add(key, result);

            return result;
        }

        internal string GetTypeName(ulong moduleBase, uint typeId) {
            return this.symbols.GetTypeName(moduleBase, typeId);
        }

        internal uint GetTypeSize(ulong moduleBase, uint typeId) {
            return this.symbols.GetTypeSize(moduleBase, typeId);
        }

        internal void GetSymbolName(ulong pointer, out string name, out ulong displacement) {
            this.symbols.GetNameByOffset(pointer, out name, out displacement);
        }

        internal string GetConstantName(ulong moduleBase, uint typeId, ulong constant) {
            return this.symbols.GetConstantName(moduleBase, typeId, constant);
        }

        internal string GetModuleSymbolPath(ulong moduleBase) {
            string imagePath = this.symbols.GetModuleNameStringByBaseAddress(Microsoft.Debuggers.DbgEng.ModuleName.Image, moduleBase);
            string symbolPath = this.symbols.GetModuleNameStringByBaseAddress(Microsoft.Debuggers.DbgEng.ModuleName.SymbolFile, moduleBase);

            if (System.IO.Path.GetFileName(symbolPath) == System.IO.Path.GetFileName(imagePath)) {
                // We don't have a proper symbol file, try forcing a reload.
                this.symbols.Reload("/f " + imagePath);
                symbolPath = this.symbols.GetModuleNameStringByBaseAddress(Microsoft.Debuggers.DbgEng.ModuleName.SymbolFile, moduleBase);
            }

            return symbolPath;
        }

        internal string GetModuleImagePath(ulong moduleBase) {
            return this.symbols.GetModuleNameStringByBaseAddress(Microsoft.Debuggers.DbgEng.ModuleName.Image, moduleBase);
        }

        internal string GetSymbolSearchPath() {
            return this.symbols.GetSymbolPath();
        }
        
        internal string GetModuleSymbolPath(string module)
        {            
            return this.GetModuleSymbolPath(this.GetModuleBase(module));
        }

        #region IDisposable Members

        public void Dispose() {
            this.symbols.Dispose();
        }

        #endregion

        private struct SFieldTypeAndOffsetKey {
            internal SFieldTypeAndOffsetKey(ulong moduleBase, uint typeId, string field) {
                this.ModuleBase = moduleBase;
                this.TypeId = typeId;
                this.Field = field;
            }

            internal readonly ulong ModuleBase;
            internal readonly uint TypeId;
            internal readonly string Field;
        }

        private Dictionary<SFieldTypeAndOffsetKey, SFieldTypeAndOffset> fieldTypeAndOffsetCache;
        private Microsoft.Debuggers.DbgEng.DebugSymbols symbols;
    }
}
