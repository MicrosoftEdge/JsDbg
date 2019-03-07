//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

#include <stdio.h>
#include <windows.h>
#include <dbgeng.h>
#include <wininet.h>

#pragma comment(lib, "wininet.lib")
#pragma comment(lib, "urlmon.lib")

static bool downloadsPending;

extern "C" HRESULT CALLBACK DebugExtensionInitialize(PULONG Version, PULONG Flags)
{
    *Version = DEBUG_EXTENSION_VERSION(1, 0);
    *Flags = 0;
    downloadsPending = true;
    return S_OK;
}

static HRESULT DownloadFileToTempDir(const char* downloadURL, const char* fileName) {
    TCHAR tempPath[MAX_PATH];
    DWORD dwRetVal = GetTempPath(MAX_PATH, tempPath);
    if (dwRetVal > MAX_PATH || (dwRetVal == 0)) { return E_FAIL; }
    strcat_s(tempPath, fileName);

    return URLDownloadToFile(NULL, downloadURL, tempPath, 0, NULL);
}

extern "C" HRESULT CALLBACK jsdbg(PDEBUG_CLIENT4 client, PCSTR args)
{
    const char* commandScriptName;
    const char* commandScriptDownloadURL;
    const char* versionFileDownloadURL;
    if (args != nullptr && strstr(args, "-u") == args) {
        commandScriptName = "jsdbg-UNSTABLE.script";
        commandScriptDownloadURL = "https://jsdbg.blob.core.windows.net/launch-files/jsdbg-UNSTABLE.script";
        versionFileDownloadURL = "https://jsdbg.blob.core.windows.net/launch-files/jsdbg-UNSTABLE-version.txt";
    } else {
        commandScriptName = "jsdbg.script";
        commandScriptDownloadURL = "https://jsdbg.blob.core.windows.net/launch-files/jsdbg.script";
        versionFileDownloadURL = "https://jsdbg.blob.core.windows.net/launch-files/jsdbg-version.txt";
    }

    if (downloadsPending) {
        HRESULT hr = DownloadFileToTempDir("https://jsdbg.blob.core.windows.net/launch-files/JsDbg.exe", "JsDbg.exe");
        if (hr != S_OK) {
            return hr;
        }

        hr = DownloadFileToTempDir("https://jsdbg.blob.core.windows.net/launch-files/JsDbg.Remoting.dll", "JsDbg.Remoting.dll");
        if (hr != S_OK) {
            return hr;
        }

        hr = DownloadFileToTempDir(commandScriptDownloadURL, commandScriptName);
        if (hr != S_OK) {
            return hr;
        }

        char zipName[2048];
        {
            HINTERNET hSession = InternetOpen(TEXT("Jsdbg WinDbg extension"), INTERNET_OPEN_TYPE_DIRECT, NULL, NULL, INTERNET_FLAG_DONT_CACHE);
            if (!hSession) { return E_FAIL; }
            HINTERNET hConnect = InternetOpenUrl(hSession, versionFileDownloadURL, 0, 0, 0, 0);
            if (!hConnect) { return E_FAIL; }

            DWORD totalBytesRead = 0;
            DWORD bytesRead;
            do {
                if (!InternetReadFile(hConnect, zipName, sizeof(zipName), &bytesRead)) { return E_FAIL; }
                if (!bytesRead) { break; }
                totalBytesRead += bytesRead;
            } while (true);
            zipName[totalBytesRead] = '\0';

            InternetCloseHandle(hConnect);
            InternetCloseHandle(hSession);
        }

        char zipDownloadURL[2048];
        strcpy_s(zipDownloadURL, "https://jsdbg.blob.core.windows.net/launch-files/");
        strcat_s(zipDownloadURL, zipName);
        hr = DownloadFileToTempDir(zipDownloadURL, zipName);
        if (hr != S_OK) {
            return hr;
        }

        downloadsPending = false;
    }

    TCHAR commandScriptTempPath[MAX_PATH];
    DWORD dwRetVal = GetTempPath(MAX_PATH, commandScriptTempPath);
    if (dwRetVal > MAX_PATH || (dwRetVal == 0)) { return E_FAIL; }
    strcat_s(commandScriptTempPath, commandScriptName);

    TCHAR command[MAX_PATH];
    strcpy_s(command, "$$><");
    strcat_s(command, commandScriptTempPath);

    // Get an IDebugControl and execute the command.
    IDebugControl* control = nullptr;
    HRESULT hr = S_OK;
    if ((hr = client->QueryInterface(__uuidof(IDebugControl), (void**)&control)) != S_OK)
    {
        return hr;
    }

    control->Execute(DEBUG_OUTCTL_ALL_CLIENTS, command, DEBUG_EXECUTE_NOT_LOGGED);
    control->Release();

    return S_OK;
}

extern "C" HRESULT CALLBACK help(PDEBUG_CLIENT4 client, PCSTR args)
{
    // Get an IDebugControl and print the help.
    IDebugControl* control = nullptr;
    HRESULT hr = S_OK;
    if ((hr = client->QueryInterface(__uuidof(IDebugControl), (void**)&control)) != S_OK)
    {
        return hr;
    }

    if (args == nullptr || strlen(args) == 0)
    {
        control->Output(DEBUG_OUTPUT_NORMAL, "!jsdbg [-unstable]         - Launches JsDbg, debugger extensions in the browser\n");
        hr = DEBUG_EXTENSION_CONTINUE_SEARCH;
    }
    else if (strcmp(args, "jsdbg") == 0)
    {
        control->Output(DEBUG_OUTPUT_NORMAL, "JsDbg is a platform for debugger extensions that run in a web browser.\n"
                                             "!jsdbg [-unstable]\n"
                                             "  -[u]nstable - Launches the latest unstable version of JsDbg.\n");
        hr = S_OK;
    }
    else
    {
        hr = DEBUG_EXTENSION_CONTINUE_SEARCH;
    }

    control->Release();
    return hr;
}