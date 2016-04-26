
#include <dia2.h>
#include <diacreate.h>

extern "C" {
	__declspec(dllexport) HRESULT __stdcall LoadDataSource(wchar_t* dllName, IDiaDataSource** result)
	{
		return NoRegCoCreate(dllName, CLSID_DiaSource, IID_IDiaDataSource, (void **)result);
	}
}