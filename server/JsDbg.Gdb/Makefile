PREFIX=/usr/local
DOTNET=$(HOME)/dotnet/dotnet

PUBLISH=out

BINDEPS=$(filter-out %extensions %JsDbg.py %JsDbg.Gdb, $(wildcard $(PUBLISH)/*))

all:
	$(DOTNET) publish -c Release -r linux-x64 --self-contained -o out

clean:
	rm -rf bin obj out ../JsDbg.Core/bin ../JsDbg.Core/obj jsdbg.tar.bz2

install: all
	install -D -m 644 JsDbg.py $(DESTDIR)$(PREFIX)/share/gdb/python/JsDbg.py
	install -d $(DESTDIR)$(PREFIX)/lib/jsdbg
	install -m 644 -s $(filter %createdump %.so, $(BINDEPS)) $(DESTDIR)$(PREFIX)/lib/jsdbg
	install -m 644 $(filter-out %createdump %.so, $(BINDEPS)) $(DESTDIR)$(PREFIX)/lib/jsdbg
	install -m 755 -s $(PUBLISH)/JsDbg.Gdb $(DESTDIR)$(PREFIX)/lib/jsdbg
	install -d $(DESTDIR)$(PREFIX)/share/jsdbg/extensions
	cp -r -t $(DESTDIR)$(PREFIX)/share/jsdbg/extensions ../../extensions/*

package: all
	@echo 'Creating jsdbg.tar.bz2'
	@tar --transform="s#$(PUBLISH)#jsdbg#" -c -j -f jsdbg.tar.bz2 $(PUBLISH)

.PHONY: clean install all package

