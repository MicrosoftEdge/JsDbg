PREFIX=/usr/local
DOTNET=dotnet

PUBLISH=out
PUBLISH_SC=out_sa

BINDEPS=$(filter-out %extensions %JsDbg.py %JsDbg.Gdb, $(wildcard $(PUBLISH)/*))

all: bin/test_program
	$(DOTNET) restore $(RESTOREFLAGS)
	$(DOTNET) publish -c Release --no-restore -o $(PUBLISH)

clean:
	rm -rf bin obj $(PUBLISH) $(PUBLISH_SC) ../JsDbg.Core/bin ../JsDbg.Core/obj ../JsDbg.Gdb.Tests/bin ../JsDbg.Gdb.Tests/obj jsdbg.tar.bz2 *.pyc __pycache__

install: all
	install -D -m 644 JsDbg.py $(DESTDIR)$(PREFIX)/share/gdb/python/JsDbg.py
	install -d $(DESTDIR)$(PREFIX)/lib/jsdbg
	install -m 644 $(BINDEPS) $(DESTDIR)$(PREFIX)/lib/jsdbg
	install -d $(DESTDIR)$(PREFIX)/share/jsdbg/extensions
	cp -r -t $(DESTDIR)$(PREFIX)/share/jsdbg/extensions ../../extensions/*

bin/test_program: testsuite/test_program.cc
	mkdir -p bin
	$(CXX) $^ -o $@ -g

check: bin/test_program
	@# The restore flags set by debian/rules do not work with dotnet test.
	@# dotnet test does require us to download packages from the internet,
	@# so if $(RESTOREFLAGS) is set, just skip this test.
	if test x"$(RESTOREFLAGS)" = x; then cd ../JsDbg.Gdb.Tests && $(DOTNET) restore $(RESTOREFLAGS) && $(DOTNET) test --no-restore; fi
	cd testsuite && runtest
	python JsDbgBase_test.py
	python3 JsDbgBase_test.py
	python JsDbg_test.py
	python3 JsDbg_test.py

# We don't want users of the tarball to require a dotnet install, so
# let's build a self-contained binary.
package:
	$(DOTNET) publish -c Release -r linux-x64 --self-contained -o $(PUBLISH_SC)
	@echo 'Creating jsdbg.tar.bz2'
	@tar --transform="s#$(PUBLISH_SC)#jsdbg#" -c -j -f jsdbg.tar.bz2 $(PUBLISH_SC)

.PHONY: clean install all package

