all:
	$(MAKE) -C server/JsDbg.Gdb all

deb:
	gbp buildpackage --git-ignore-branch -i.* -us -uc

%:
	$(MAKE) -C server/JsDbg.Gdb $@
