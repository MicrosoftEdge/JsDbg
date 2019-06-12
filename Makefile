all:
	$(MAKE) -C server/JsDbg.Gdb all

%:
	$(MAKE) -C server/JsDbg.Gdb $@
