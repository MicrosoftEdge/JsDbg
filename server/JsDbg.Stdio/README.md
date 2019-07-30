This directory contains a generic implementation of the JsDbg webserver that
communicates with the debugger using stdin/out. The debugger is expected to
start this binary.

This will be used by the GDB-specific code in JsDbg.Gdb and, hopefully in the
future, by LLDB-specific code as well.
