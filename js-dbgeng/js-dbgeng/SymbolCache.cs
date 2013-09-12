using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace JsDbg {
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
            return this.symbols.GetModuleNameStringByBaseAddress(Microsoft.Debuggers.DbgEng.ModuleName.SymbolFile, moduleBase);
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
