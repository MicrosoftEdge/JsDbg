#include <stdio.h>
#include <windows.h>
#include <dbgeng.h>

const char StableCommand[] = "$$><\\\\iefs\\users\\psalas\\jsdbg\\support\\scripts\\jsdbg.script";
const char UnstableCommand[] = "$$><\\\\iefs\\users\\psalas\\jsdbg\\support\\scripts\\jsdbg-UNSTABLE.script";

extern "C" HRESULT CALLBACK DebugExtensionInitialize(PULONG Version, PULONG Flags)
{
    *Version = DEBUG_EXTENSION_VERSION(1, 0);
    *Flags = 0;
    return S_OK;
}

extern "C" HRESULT CALLBACK jsdbg(PDEBUG_CLIENT4 client, PCSTR args)
{
    const char* command = StableCommand;
    if (args != nullptr && strstr(args, "-u") == args) {
        command = UnstableCommand;
    }

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
        control->Output(DEBUG_OUTPUT_NORMAL, "!jsdbg [-unstable]         - Launches JsDbg, debugger extensions in the browser (http://aka.ms/jsdbg)\n");
        hr = DEBUG_EXTENSION_CONTINUE_SEARCH;
    }
    else if (strcmp(args, "jsdbg") == 0)
    {
        control->Output(DEBUG_OUTPUT_NORMAL, "JsDbg is a platform for debugger extensions that run in a web browser.  For more information, see http://aka.ms/jsdbg.\n"
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