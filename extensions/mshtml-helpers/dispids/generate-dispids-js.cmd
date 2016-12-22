@echo OFF
REM Run this from a razzle window after building chk.
awk -f %~dp0collect-dispids.awk^
    %BASEDIR%\onecoreuap\inetcore\edgehtml\src\core\include\coredisp.h^
    %BASEDIR%\onecoreuap\inetcore\edgehtml\src\core\include\edgeattrsdisp.h^
    %BASEDIR%\onecoreuap\inetcore\edgehtml\src\core\include\edgeeventsdisp.h^
    %OBJECT_ROOT%\onecoreuap\inetcore\edgehtml\types\objchk\i386\*.hdl^
    > %TEMP%\alldispids.c
call cl /EP ^
    /I %BASEDIR%\onecoreuap\inetcore\edgehtml\src\core\include^
    /I %BASEDIR%\sdpublic\sdk\inc^
    /I %BASEDIR%\sdpublic\sdk\inc\minwin^
    /I %BASEDIR%\sdpublic\sdk\inc\mincore^
    /I %BASEDIR%\sdpublic\sdk\inc\clientcore^
    /I %BASEDIR%\sdpublic\shared\inc^
    /I %BASEDIR%\sdpublic\shared\inc\minwin^
    /I %BASEDIR%\sdpublic\sdk\inc\crt^
    %TEMP%\alldispids.c > %TEMP%\preprocessed.c
awk -f %~dp0convert-dispids-to-js.awk %TEMP%\preprocessed.c > %~dp0mshtml-dispids.js