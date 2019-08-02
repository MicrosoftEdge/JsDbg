all:
	$(MAKE) -C server/JsDbg.Gdb all

deb: clean
	@echo '*** See debian/README.source for more information and help with troubleshoting. ***'
	@# We can't use --filename=jsdbg-gdb.deb in BUILDPACKAGE_OPTS because too many steps
	@# depend on keeping the filename as-is. So we'll just rename it afterwards.
	BUILDPACKAGE_OPTS="--destdir=." dpkg-buildpackage -us -uc --build=binary --buildinfo-option=-u. --changes-option=-u.
	mv jsdbg-gdb_*.deb jsdbg-gdb.deb

%:
	$(MAKE) -C server/JsDbg.Gdb $@
