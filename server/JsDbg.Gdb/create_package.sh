#!/bin/sh
set -ex
~/dotnet/dotnet publish -c Release -r linux-x64
cd bin/Release/netcoreapp2.1/linux-x64
tar --transform='s/publish/jsdbg/' -c -j -f ../../../../jsdbg.tar.bz2 publish/
