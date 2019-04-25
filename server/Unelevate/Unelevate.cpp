//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

// Unelevate.cpp : Defines the entry point for the console application.
//
// Source taken from:
// https://blogs.msdn.microsoft.com/oldnewthing/20131118-00/?p=2643
// https://blogs.msdn.microsoft.com/oldnewthing/20130318-00/?p=4933/
// https://blogs.msdn.microsoft.com/oldnewthing/20040520-00/?p=39243

#define STRICT
#include <windows.h>
#include <shldisp.h>
#include <shlobj.h>
#include <exdisp.h>
#include <atlbase.h>
#include <stdlib.h>

#define ENSURE(x) if (!SUCCEEDED(x)) { exit(-1); }

void FindDesktopFolderView(REFIID riid, void **ppv)
{
    CComPtr<IShellWindows> spShellWindows;
    ENSURE(spShellWindows.CoCreateInstance(CLSID_ShellWindows));

    CComVariant vtLoc(CSIDL_DESKTOP);
    CComVariant vtEmpty;
    long lhwnd;
    CComPtr<IDispatch> spdisp;
    ENSURE(spShellWindows->FindWindowSW(
        &vtLoc, &vtEmpty,
        SWC_DESKTOP, &lhwnd, SWFO_NEEDDISPATCH, &spdisp));

    CComPtr<IShellBrowser> spBrowser;
    ENSURE(CComQIPtr<IServiceProvider>(spdisp)->
        QueryService(SID_STopLevelBrowser,
            IID_PPV_ARGS(&spBrowser)));

    CComPtr<IShellView> spView;
    ENSURE(spBrowser->QueryActiveShellView(&spView));

    ENSURE(spView->QueryInterface(riid, ppv));
}

void GetDesktopAutomationObject(REFIID riid, void **ppv)
{
    CComPtr<IShellView> spsv;
    FindDesktopFolderView(IID_PPV_ARGS(&spsv));
    CComPtr<IDispatch> spdispView;
    ENSURE(spsv->GetItemObject(SVGIO_BACKGROUND, IID_PPV_ARGS(&spdispView)));
    ENSURE(spdispView->QueryInterface(riid, ppv));
}

void ShellExecuteFromExplorer(
    PCWSTR pszFile,
    PCWSTR pszParameters = nullptr,
    PCWSTR pszDirectory = nullptr,
    PCWSTR pszOperation = nullptr,
    int nShowCmd = SW_SHOWNORMAL)
{
    CComPtr<IShellFolderViewDual> spFolderView;
    GetDesktopAutomationObject(IID_PPV_ARGS(&spFolderView));
    CComPtr<IDispatch> spdispShell;
    ENSURE(spFolderView->get_Application(&spdispShell));

    ENSURE(CComQIPtr<IShellDispatch2>(spdispShell)
        ->ShellExecute(CComBSTR(pszFile),
            CComVariant(pszParameters ? pszParameters : L""),
            CComVariant(pszDirectory ? pszDirectory : L""),
            CComVariant(pszOperation ? pszOperation : L""),
            CComVariant(nShowCmd)));
}

class CCoInitialize {
public:
    CCoInitialize() : m_hr(CoInitialize(NULL)) { }
    ~CCoInitialize() { if (SUCCEEDED(m_hr)) CoUninitialize(); }
    operator HRESULT() const { return m_hr; }
    HRESULT m_hr;
};

int __cdecl wmain(int argc, wchar_t **argv)
{
    if (argc < 2) return -1;

    CCoInitialize init;
    ShellExecuteFromExplorer(
        argv[1],
        argc >= 3 ? argv[2] : L"",
        argc >= 4 ? argv[3] : L"",
        argc >= 5 ? argv[4] : L"",
        argc >= 6 ? _wtoi(argv[5]) : SW_SHOWNORMAL);

    return 0;
}

