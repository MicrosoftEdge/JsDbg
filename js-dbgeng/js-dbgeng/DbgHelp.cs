using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Runtime.InteropServices;

namespace JsDbg {

    // TODO: Is it possible to use this with the current remote debugger design? I'm guessing not.

    internal class DbgHelp {
        internal enum IMAGEHLP_SYMBOL_TYPE_INFO {
            TI_GET_SYMTAG,
            TI_GET_SYMNAME,
            TI_GET_LENGTH,
            TI_GET_TYPE,
            TI_GET_TYPEID,
            TI_GET_BASETYPE,
            TI_GET_ARRAYINDEXTYPEID,
            TI_FINDCHILDREN,
            TI_GET_DATAKIND,
            TI_GET_ADDRESSOFFSET,
            TI_GET_OFFSET,
            TI_GET_VALUE,
            TI_GET_COUNT,
            TI_GET_CHILDRENCOUNT,
            TI_GET_BITPOSITION,
            TI_GET_VIRTUALBASECLASS,
            TI_GET_VIRTUALTABLESHAPEID,
            TI_GET_VIRTUALBASEPOINTEROFFSET,
            TI_GET_CLASSPARENTID,
            TI_GET_NESTED,
            TI_GET_SYMINDEX,
            TI_GET_LEXICALPARENT,
            TI_GET_ADDRESS,
            TI_GET_THISADJUST,
            TI_GET_UDTKIND,
            TI_IS_EQUIV_TO,
            TI_GET_CALLING_CONVENTION,
            TI_IS_CLOSE_EQUIV_TO,
            TI_GTIEX_REQS_VALID,
            TI_GET_VIRTUALBASEOFFSET,
            TI_GET_VIRTUALBASEDISPINDEX,
            TI_GET_IS_REFERENCE,
            TI_GET_INDIRECTVIRTUALBASECLASS
        }

        [DllImport("Dbghelp.Dll",
            CallingConvention=CallingConvention.Winapi,
            SetLastError=true
        )]
        public static extern bool SymGetTypeInfo(IntPtr hProcess, ulong modBase, uint typeId, IMAGEHLP_SYMBOL_TYPE_INFO getType, out ulong pInfo);
    }
}
