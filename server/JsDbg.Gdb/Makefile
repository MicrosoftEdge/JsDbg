PREFIX=/usr/local
DOTNET=dotnet

SHELL := /bin/bash
PUBLISH := $(shell pwd)/out
PUBLISH_SC_REL := out_sa
PUBLISH_SC := $(shell pwd)/$(PUBLISH_SC_REL)

BINDEPS=$(filter-out %extensions %JsDbg.py %JsDbg.Gdb, $(wildcard $(PUBLISH)/*))

PYTHON_FILES=JsDbg.py ../JsDbg.Stdio/JsDbg{Base,Types}.py

all: bin/test_program
	cd ../JsDbg.Stdio && $(DOTNET) restore $(RESTOREFLAGS)
	cd ../JsDbg.Stdio && $(DOTNET) publish -c Release --no-restore -o $(PUBLISH)

clean:
	rm -rf bin $(PUBLISH) $(PUBLISH_SC) ../JsDbg.{Core,Stdio,Stdio.Tests}/{bin,obj} jsdbg-gdb.tar.bz2 {.,../JsDbg.Stdio}/{*.pyc,__pycache__}

install: all
	install -D -m 644 $(PYTHON_FILES) --target-directory=$(DESTDIR)$(PREFIX)/share/gdb/python
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
	if test x"$(RESTOREFLAGS)" = x; then cd ../JsDbg.Stdio.Tests && $(DOTNET) restore $(RESTOREFLAGS) && $(DOTNET) test --no-restore; fi
	cd testsuite && runtest
	python2 ../JsDbg.Stdio/JsDbgBase_test.py
	python3 ../JsDbg.Stdio/JsDbgBase_test.py
	python2 JsDbg_test.py
	python3 JsDbg_test.py

# We don't want users of the tarball to require a dotnet install, so
# let's build a self-contained binary.
dist:
	cd ../JsDbg.Stdio && $(DOTNET) publish -c Release -r linux-x64 --self-contained -o $(PUBLISH_SC)
	cp $(PYTHON_FILES) $(PUBLISH_SC)
	@echo 'Creating jsdbg-gdb.tar.bz2'
	@tar --transform="s#$(PUBLISH_SC_REL)#jsdbg-gdb#" -c -j -f jsdbg-gdb.tar.bz2 $(PUBLISH_SC_REL)

.PHONY: clean install all package

