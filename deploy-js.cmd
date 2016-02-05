@echo off
setlocal

set VERSION=2016-02-05-01
set JSDBG_ROOT=%~dp0

echo Copying wwwroot...
xcopy %JSDBG_ROOT%wwwroot \\iefs\users\psalas\jsdbg\support\%VERSION%\wwwroot /s /d

echo Copying extensions...
xcopy %JSDBG_ROOT%extensions \\iefs\users\psalas\jsdbg\support\%VERSION%\extensions /s /d