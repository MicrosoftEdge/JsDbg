@echo OFF

if "%1"=="" goto TryDefaultLocation
set defaultPath=%1
goto UseDefaultLocation

:AskForPath
set /p debuggerPath=Please enter the path to your WinDbg installation:%=%
goto InstallFiles

:TryDefaultLocation
set defaultPath=C:\debuggers
if exist %defaultPath% goto UseDefaultLocation
goto AskForPath

:UseDefaultLocation
set debuggerPath=%defaultPath%
goto InstallFiles

:InstallFiles
REM Remove trailing backslash if it's there.
if %debuggerPath:~-1%==\ set debuggerPath=%debuggerPath:~0,-1%

echo Installing files to %debuggerPath%...
if exist %debuggerPath%\wow64 goto :InstallWow64
copy %~dp0ext\x86\* %debuggerPath%\winext && (goto Success) || (goto Failed)
goto Done

:InstallWow64
copy %~dp0ext\amd64\* %debuggerPath%\winext && (copy %~dp0ext\x86\* %debuggerPath%\wow64\winext) && (goto Success) || (goto Failed)
goto Done

:Failed
echo.
echo Installation failed.  Please check the location of your WinDbg installation.
echo.
goto Done

:Success
echo.
echo You may now launch JsDbg by running "!jsdbg.launch" in WinDbg.
echo.

:Done
set /p=Press any key to exit...