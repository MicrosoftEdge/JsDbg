

/* this ALWAYS GENERATED file contains the proxy stub code */


 /* File created by MIDL compiler version 8.00.0595 */
/* at Thu Sep 12 13:14:57 2013
 */
/* Compiler settings for C:\Program Files (x86)\Microsoft Visual Studio 11.0\\DIA SDK\idl\dia2.idl:
    Oicf, W1, Zp8, env=Win32 (32b run), target_arch=X86 8.00.0595 
    protocol : dce , ms_ext, c_ext, robust
    error checks: allocation ref bounds_check enum stub_data 
    VC __declspec() decoration level: 
         __declspec(uuid()), __declspec(selectany), __declspec(novtable)
         DECLSPEC_UUID(), MIDL_INTERFACE()
*/
/* @@MIDL_FILE_HEADING(  ) */

#if !defined(_M_IA64) && !defined(_M_AMD64) && !defined(_ARM_)


#pragma warning( disable: 4049 )  /* more than 64k source lines */
#if _MSC_VER >= 1200
#pragma warning(push)
#endif

#pragma warning( disable: 4211 )  /* redefine extern to static */
#pragma warning( disable: 4232 )  /* dllimport identity*/
#pragma warning( disable: 4024 )  /* array to pointer mapping*/
#pragma warning( disable: 4152 )  /* function/data pointer conversion in expression */
#pragma warning( disable: 4100 ) /* unreferenced arguments in x86 call */

#pragma optimize("", off ) 

#define USE_STUBLESS_PROXY


/* verify that the <rpcproxy.h> version is high enough to compile this file*/
#ifndef __REDQ_RPCPROXY_H_VERSION__
#define __REQUIRED_RPCPROXY_H_VERSION__ 475
#endif


#include "rpcproxy.h"
#ifndef __RPCPROXY_H_VERSION__
#error this stub requires an updated version of <rpcproxy.h>
#endif /* __RPCPROXY_H_VERSION__ */


#include "dia2.h"

#define TYPE_FORMAT_STRING_SIZE   3                                 
#define PROC_FORMAT_STRING_SIZE   1                                 
#define EXPR_FORMAT_STRING_SIZE   1                                 
#define TRANSMIT_AS_TABLE_SIZE    0            
#define WIRE_MARSHAL_TABLE_SIZE   0            

typedef struct _dia2_MIDL_TYPE_FORMAT_STRING
    {
    short          Pad;
    unsigned char  Format[ TYPE_FORMAT_STRING_SIZE ];
    } dia2_MIDL_TYPE_FORMAT_STRING;

typedef struct _dia2_MIDL_PROC_FORMAT_STRING
    {
    short          Pad;
    unsigned char  Format[ PROC_FORMAT_STRING_SIZE ];
    } dia2_MIDL_PROC_FORMAT_STRING;

typedef struct _dia2_MIDL_EXPR_FORMAT_STRING
    {
    long          Pad;
    unsigned char  Format[ EXPR_FORMAT_STRING_SIZE ];
    } dia2_MIDL_EXPR_FORMAT_STRING;


static const RPC_SYNTAX_IDENTIFIER  _RpcTransferSyntax = 
{{0x8A885D04,0x1CEB,0x11C9,{0x9F,0xE8,0x08,0x00,0x2B,0x10,0x48,0x60}},{2,0}};


extern const dia2_MIDL_TYPE_FORMAT_STRING dia2__MIDL_TypeFormatString;
extern const dia2_MIDL_PROC_FORMAT_STRING dia2__MIDL_ProcFormatString;
extern const dia2_MIDL_EXPR_FORMAT_STRING dia2__MIDL_ExprFormatString;



#if !defined(__RPC_WIN32__)
#error  Invalid build platform for this stub.
#endif

#if !(TARGET_IS_NT50_OR_LATER)
#error You need Windows 2000 or later to run this stub because it uses these features:
#error   /robust command line switch.
#error However, your C/C++ compilation flags indicate you intend to run this app on earlier systems.
#error This app will fail with the RPC_X_WRONG_STUB_VERSION error.
#endif


static const dia2_MIDL_PROC_FORMAT_STRING dia2__MIDL_ProcFormatString =
    {
        0,
        {

			0x0
        }
    };

static const dia2_MIDL_TYPE_FORMAT_STRING dia2__MIDL_TypeFormatString =
    {
        0,
        {
			NdrFcShort( 0x0 ),	/* 0 */

			0x0
        }
    };


/* Standard interface: __MIDL_itf_dia2_0000_0000, ver. 0.0,
   GUID={0x00000000,0x0000,0x0000,{0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00}} */


/* Object interface: IUnknown, ver. 0.0,
   GUID={0x00000000,0x0000,0x0000,{0xC0,0x00,0x00,0x00,0x00,0x00,0x00,0x46}} */


/* Object interface: IDiaLoadCallback, ver. 0.0,
   GUID={0xC32ADB82,0x73F4,0x421b,{0x95,0xD5,0xA4,0x70,0x6E,0xDF,0x5D,0xBE}} */


/* Object interface: IDiaLoadCallback2, ver. 0.0,
   GUID={0x4688a074,0x5a4d,0x4486,{0xae,0xa8,0x7b,0x90,0x71,0x1d,0x9f,0x7c}} */


/* Object interface: IDiaReadExeAtOffsetCallback, ver. 0.0,
   GUID={0x587A461C,0xB80B,0x4f54,{0x91,0x94,0x50,0x32,0x58,0x9A,0x63,0x19}} */


/* Object interface: IDiaReadExeAtRVACallback, ver. 0.0,
   GUID={0x8E3F80CA,0x7517,0x432a,{0xBA,0x07,0x28,0x51,0x34,0xAA,0xEA,0x8E}} */


/* Object interface: IDiaDataSource, ver. 0.0,
   GUID={0x79F1BB5F,0xB66E,0x48e5,{0xB6,0xA9,0x15,0x45,0xC3,0x23,0xCA,0x3D}} */


/* Object interface: IDiaEnumSymbols, ver. 0.0,
   GUID={0xCAB72C48,0x443B,0x48f5,{0x9B,0x0B,0x42,0xF0,0x82,0x0A,0xB2,0x9A}} */


/* Object interface: IDiaEnumSymbolsByAddr, ver. 0.0,
   GUID={0x624B7D9C,0x24EA,0x4421,{0x9D,0x06,0x3B,0x57,0x74,0x71,0xC1,0xFA}} */


/* Object interface: IDiaEnumSourceFiles, ver. 0.0,
   GUID={0x10F3DBD9,0x664F,0x4469,{0xB8,0x08,0x94,0x71,0xC7,0xA5,0x05,0x38}} */


/* Object interface: IDiaEnumLineNumbers, ver. 0.0,
   GUID={0xFE30E878,0x54AC,0x44f1,{0x81,0xBA,0x39,0xDE,0x94,0x0F,0x60,0x52}} */


/* Object interface: IDiaEnumInjectedSources, ver. 0.0,
   GUID={0xD5612573,0x6925,0x4468,{0x88,0x83,0x98,0xCD,0xEC,0x8C,0x38,0x4A}} */


/* Object interface: IDiaEnumSegments, ver. 0.0,
   GUID={0xE8368CA9,0x01D1,0x419d,{0xAC,0x0C,0xE3,0x12,0x35,0xDB,0xDA,0x9F}} */


/* Object interface: IDiaEnumSectionContribs, ver. 0.0,
   GUID={0x1994DEB2,0x2C82,0x4b1d,{0xA5,0x7F,0xAF,0xF4,0x24,0xD5,0x4A,0x68}} */


/* Object interface: IDiaEnumFrameData, ver. 0.0,
   GUID={0x9FC77A4B,0x3C1C,0x44ed,{0xA7,0x98,0x6C,0x1D,0xEE,0xA5,0x3E,0x1F}} */


/* Object interface: IDiaEnumDebugStreamData, ver. 0.0,
   GUID={0x486943E8,0xD187,0x4a6b,{0xA3,0xC4,0x29,0x12,0x59,0xFF,0xF6,0x0D}} */


/* Object interface: IDiaEnumDebugStreams, ver. 0.0,
   GUID={0x08CBB41E,0x47A6,0x4f87,{0x92,0xF1,0x1C,0x9C,0x87,0xCE,0xD0,0x44}} */


/* Standard interface: __MIDL_itf_dia2_0000_0015, ver. 0.0,
   GUID={0x00000000,0x0000,0x0000,{0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00}} */


/* Object interface: IDiaAddressMap, ver. 0.0,
   GUID={0xB62A2E7A,0x067A,0x4ea3,{0xB5,0x98,0x04,0xC0,0x97,0x17,0x50,0x2C}} */


/* Object interface: IDiaSession, ver. 0.0,
   GUID={0x6FC5D63F,0x011E,0x40C2,{0x8D,0xD2,0xE6,0x48,0x6E,0x9D,0x6B,0x68}} */


/* Object interface: IDiaSymbol, ver. 0.0,
   GUID={0xcb787b2f,0xbd6c,0x4635,{0xba,0x52,0x93,0x31,0x26,0xbd,0x2d,0xcd}} */


/* Object interface: IDiaSourceFile, ver. 0.0,
   GUID={0xA2EF5353,0xF5A8,0x4eb3,{0x90,0xD2,0xCB,0x52,0x6A,0xCB,0x3C,0xDD}} */


/* Object interface: IDiaLineNumber, ver. 0.0,
   GUID={0xB388EB14,0xBE4D,0x421d,{0xA8,0xA1,0x6C,0xF7,0xAB,0x05,0x70,0x86}} */


/* Object interface: IDiaSectionContrib, ver. 0.0,
   GUID={0x0CF4B60E,0x35B1,0x4c6c,{0xBD,0xD8,0x85,0x4B,0x9C,0x8E,0x38,0x57}} */


/* Object interface: IDiaSegment, ver. 0.0,
   GUID={0x0775B784,0xC75B,0x4449,{0x84,0x8B,0xB7,0xBD,0x31,0x59,0x54,0x5B}} */


/* Object interface: IDiaInjectedSource, ver. 0.0,
   GUID={0xAE605CDC,0x8105,0x4a23,{0xB7,0x10,0x32,0x59,0xF1,0xE2,0x61,0x12}} */


/* Standard interface: __MIDL_itf_dia2_0000_0023, ver. 0.0,
   GUID={0x00000000,0x0000,0x0000,{0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00}} */


/* Object interface: IDiaStackWalkFrame, ver. 0.0,
   GUID={0x07C590C1,0x438D,0x4F47,{0xBD,0xCD,0x43,0x97,0xBC,0x81,0xAD,0x75}} */


/* Object interface: IDiaFrameData, ver. 0.0,
   GUID={0xA39184B7,0x6A36,0x42de,{0x8E,0xEC,0x7D,0xF9,0xF3,0xF5,0x9F,0x33}} */


/* Object interface: IDiaImageData, ver. 0.0,
   GUID={0xC8E40ED2,0xA1D9,0x4221,{0x86,0x92,0x3C,0xE6,0x61,0x18,0x4B,0x44}} */


/* Object interface: IEnumUnknown, ver. 0.0,
   GUID={0x00000100,0x0000,0x0000,{0xC0,0x00,0x00,0x00,0x00,0x00,0x00,0x46}} */


/* Object interface: IDiaTable, ver. 0.0,
   GUID={0x4A59FB77,0xABAC,0x469b,{0xA3,0x0B,0x9E,0xCC,0x85,0xBF,0xEF,0x14}} */


/* Object interface: IDiaEnumTables, ver. 0.0,
   GUID={0xC65C2B0A,0x1150,0x4d7a,{0xAF,0xCC,0xE0,0x5B,0xF3,0xDE,0xE8,0x1E}} */


/* Standard interface: __MIDL_itf_dia2_0000_0029, ver. 0.0,
   GUID={0x00000000,0x0000,0x0000,{0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00}} */


/* Object interface: IDiaPropertyStorage, ver. 0.0,
   GUID={0x9d416f9c,0xe184,0x45b2,{0xa4,0xf0,0xce,0x51,0x7f,0x71,0x9e,0x9b}} */


/* Object interface: IDiaStackFrame, ver. 0.0,
   GUID={0x5edbc96d,0xcdd6,0x4792,{0xaf,0xbe,0xcc,0x89,0x00,0x7d,0x96,0x10}} */


/* Object interface: IDiaEnumStackFrames, ver. 0.0,
   GUID={0xec9d461d,0xce74,0x4711,{0xa0,0x20,0x7d,0x8f,0x9a,0x1d,0xd2,0x55}} */


/* Standard interface: __MIDL_itf_dia2_0000_0032, ver. 0.0,
   GUID={0x00000000,0x0000,0x0000,{0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00}} */


/* Object interface: IDiaStackWalkHelper, ver. 0.0,
   GUID={0x21F81B1B,0xC5BB,0x42A3,{0xBC,0x4F,0xCC,0xBA,0xA7,0x5B,0x9F,0x19}} */


/* Object interface: IDiaStackWalker, ver. 0.0,
   GUID={0x5485216b,0xa54c,0x469f,{0x96,0x70,0x52,0xb2,0x4d,0x52,0x29,0xbb}} */


/* Object interface: IDiaStackWalkHelper2, ver. 0.0,
   GUID={0x8222c490,0x507b,0x4bef,{0xb3,0xbd,0x41,0xdc,0xa7,0xb5,0x93,0x4c}} */


/* Object interface: IDiaStackWalker2, ver. 0.0,
   GUID={0x7c185885,0xa015,0x4cac,{0x94,0x11,0x0f,0x4f,0xb3,0x9b,0x1f,0x3a}} */

static const MIDL_STUB_DESC Object_StubDesc = 
    {
    0,
    NdrOleAllocate,
    NdrOleFree,
    0,
    0,
    0,
    0,
    0,
    dia2__MIDL_TypeFormatString.Format,
    1, /* -error bounds_check flag */
    0x50002, /* Ndr library version */
    0,
    0x8000253, /* MIDL Version 8.0.595 */
    0,
    0,
    0,  /* notify & notify_flag routine table */
    0x1, /* MIDL flag */
    0, /* cs routines */
    0,   /* proxy/server info */
    0
    };

const CInterfaceProxyVtbl * const _dia2_ProxyVtblList[] = 
{
    0
};

const CInterfaceStubVtbl * const _dia2_StubVtblList[] = 
{
    0
};

PCInterfaceName const _dia2_InterfaceNamesList[] = 
{
    0
};


#define _dia2_CHECK_IID(n)	IID_GENERIC_CHECK_IID( _dia2, pIID, n)

int __stdcall _dia2_IID_Lookup( const IID * pIID, int * pIndex )
{
    UNREFERENCED_PARAMETER(pIID);
    UNREFERENCED_PARAMETER(pIndex);
    return 0;
}

const ExtendedProxyFileInfo dia2_ProxyFileInfo = 
{
    (PCInterfaceProxyVtblList *) & _dia2_ProxyVtblList,
    (PCInterfaceStubVtblList *) & _dia2_StubVtblList,
    (const PCInterfaceName * ) & _dia2_InterfaceNamesList,
    0, /* no delegation */
    & _dia2_IID_Lookup, 
    0,
    2,
    0, /* table of [async_uuid] interfaces */
    0, /* Filler1 */
    0, /* Filler2 */
    0  /* Filler3 */
};
#pragma optimize("", on )
#if _MSC_VER >= 1200
#pragma warning(pop)
#endif


#endif /* !defined(_M_IA64) && !defined(_M_AMD64) && !defined(_ARM_) */

