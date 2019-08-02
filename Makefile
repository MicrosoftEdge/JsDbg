all:
	$(MAKE) -C server/JsDbg.Gdb all

deb: clean
	@echo '*** See debian/README.source for more information and help with troubleshoting. ***'
	dpkg-buildpackage -us -uc

%:
	$(MAKE) -C server/JsDbg.Gdb $@
