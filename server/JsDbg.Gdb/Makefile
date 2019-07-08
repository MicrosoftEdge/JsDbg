PREFIX=/usr/local
DOTNET=$(HOME)/dotnet/dotnet

PUBLISH=out
PUBLISH_SC=out_sa

BINDEPS=$(filter-out %extensions %JsDbg.py %JsDbg.Gdb, $(wildcard $(PUBLISH)/*))

all:
	$(DOTNET) publish -c Release -o $(PUBLISH)

clean:
	rm -rf bin obj $(PUBLISH) $(PUBLISH_SC) ../JsDbg.Core/bin ../JsDbg.Core/obj jsdbg.tar.bz2

install: all
	install -D -m 644 JsDbg.py $(DESTDIR)$(PREFIX)/share/gdb/python/JsDbg.py
	install -d $(DESTDIR)$(PREFIX)/lib/jsdbg
	install -m 644 $(BINDEPS) $(DESTDIR)$(PREFIX)/lib/jsdbg
	install -d $(DESTDIR)$(PREFIX)/share/jsdbg/extensions
	cp -r -t $(DESTDIR)$(PREFIX)/share/jsdbg/extensions ../../extensions/*

# We don't want users of the tarball to require a dotnet install, so
# let's build a self-contained binary.
package:
	$(DOTNET) publish -c Release -r linux-x64 --self-contained -o $(PUBLISH_SC)
	@echo 'Creating jsdbg.tar.bz2'
	@tar --transform="s#$(PUBLISH_SC)#jsdbg#" -c -j -f jsdbg.tar.bz2 $(PUBLISH_SC)

.PHONY: clean install all package

