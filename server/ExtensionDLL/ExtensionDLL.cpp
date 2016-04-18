#include <stdio.h>
#include <engextcpp.hpp>

const char ScriptName[] = "jsdbg.script";
const char CommandPrefix[] = "$$><";
EXTERN_C IMAGE_DOS_HEADER __ImageBase;
 

class EXT_CLASS : public ExtExtension
{
public:
	EXT_COMMAND_METHOD(launch);
	EXT_COMMAND_METHOD(jsdbg);
};

EXT_DECLARE_GLOBALS();

EXT_COMMAND(jsdbg,
	"Launches the JsDbg server.  Identical to !jsdbg.launch.",
	nullptr)
{
	this->launch();
}

EXT_COMMAND(launch,
	"Launches the JsDbg server.  Identical to !jsdbg.jsdbg.",
	nullptr)
{
	char dllPath[MAX_PATH] = { 0 };
	GetModuleFileName((HINSTANCE)&__ImageBase, dllPath, _countof(dllPath));
	size_t dllPathLength = strnlen_s(dllPath, _countof(dllPath));
	int index = dllPathLength - 1;
	while (index >= 0 && dllPath[index] != '\\') {
		--index;
	}

	if (index < 0) {
		Out("Unable to find the script to launch.\n");
		return;
	}

	// Advance past the '\' character.
	++index;

	strcpy_s(dllPath + index, sizeof(dllPath) - index, ScriptName);

	HRESULT Status = S_OK;
	IDebugClient* client = nullptr;
	if ((Status = DebugCreate(__uuidof(IDebugClient),
		(void**)&client)) != S_OK)
	{
		Out("DebugCreate failed, 0x%X\n", Status);
		return;
	}

	// Query for some other interfaces that we'll need.
	IDebugControl* control = nullptr;
	if ((Status = client->QueryInterface(__uuidof(IDebugControl),
		(void**)&control)) != S_OK)
	{
		Out("QueryInterface failed, 0x%X\n", Status);
		client->Release();
		return;
	}

	char commandBuffer[MAX_PATH + _countof(CommandPrefix)];
	sprintf_s(commandBuffer, sizeof(commandBuffer), "%s%s", CommandPrefix, dllPath);

	control->Execute(DEBUG_OUTCTL_ALL_CLIENTS, commandBuffer, DEBUG_EXECUTE_NOT_LOGGED
		);

	control->Release();
	client->Release();
}