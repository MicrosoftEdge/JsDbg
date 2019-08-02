import gdb
import sys
import binascii
import os.path
import re
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../JsDbg.Stdio")
import JsDbgBase
import JsDbgTypes

jsdbg = None
jsdbg_url = None
last_pid = None
last_tid = None


class GdbFieldResult(JsDbgTypes.SFieldResult):
    # extra_bitoffset allows handling anonymous unions correctly
    def __init__(self, field, extra_bitoffset=0):
        if hasattr(field, 'bitpos'):
            # If this is a bitfield, we adjust offset and bitOffset to be aligned
            # according to type.sizeof, because JsDbg's memory cache does not
            # handle unaligned loads.
            # Otherwise we assume the compiler aligned it correctly.
            bitpos = field.bitpos + extra_bitoffset
            bitsize = field.type.sizeof * 8 if field.bitsize else 8

            bitOffset = bitpos % bitsize
            offset = (bitpos - bitOffset) / 8
        else:
            bitOffset = -1
            offset = -1
        super(GdbFieldResult, self).__init__(
            offset, field.type.sizeof, bitOffset, field.bitsize, field.name,
            FormatType(field.type))


class GdbStackFrame(JsDbgTypes.SStackFrame):
    def __init__(self, frame):
        super(GdbStackFrame, self).__init__(
            frame.pc(), frame.read_register("sp"), frame.read_register("fp"))


class GdbSymbolResult(JsDbgTypes.SSymbolResult):
    def __init__(self, symbol, frame=None):
        type = FormatType(symbol.type)
        if frame:
            value = symbol.value(frame)
        else:
            value = symbol.value()
        pointer = value.address.reinterpret_cast(gdb.lookup_type("unsigned long long"))
        super(GdbSymbolResult, self).__init__(type, pointer)


class GdbNamedSymbol(JsDbgTypes.SNamedSymbol):
    def __init__(self, symbol, frame):
        super(GdbNamedSymbol, self).__init__(
            ModuleForAddress(frame.pc()), symbol.name,
            GdbSymbolResult(symbol, frame))


def FindObjfileForName(name):
    for objfile in gdb.objfiles():
        if JsDbgBase.FormatModule(objfile.filename) == name:
            return objfile
    return None


def FindGdbSymbol(module, symbol):
    objfile = FindObjfileForName(module)
    if objfile is None:
        return None
    # GDB 8.4 and later let us look up symbols per-objfile; use that if
    # possible. Also, only 8.4 and later let us look for symbols with static
    # linkage. So in older versions we have to use gdb.lookup_symbol.
    if hasattr(objfile, 'lookup_static_symbol'):
        # We try static first, because in practice most of the symbols we look
        # up here are static (or in an anonymous namespace, which is equivalent)
        sym = objfile.lookup_static_symbol(symbol)
        if sym is None:
            sym = objfile.lookup_global_symbol(symbol)
    else:
        (sym, _) = gdb.lookup_symbol(symbol)
    return sym


def FindGdbType(module, type_name):
    # Types are also symbols, so we just look them up as symbols. This is
    # what GDB does internally.
    type_symbol = FindGdbSymbol(module, type_name)
    if type_symbol is None:
        return None
    if type_symbol.addr_class != gdb.SYMBOL_LOC_TYPEDEF:
        return None
    return type_symbol.type


def DebuggerQuery(tag, command):
    # pi exec('print(\\'{0}~\\' + str({1}))')
    try:
        result = eval(command)
        return "%d~%s" % (tag, str(result))
    except:
        err = sys.exc_info()
        return "%d!%s" % (tag, str(err[1]))


def IsFunctionPointer(t):
    while t.code == gdb.TYPE_CODE_PTR or t.code == gdb.TYPE_CODE_ARRAY:
        t = t.target()
    return t.code == gdb.TYPE_CODE_FUNC


def FormatType(symbol_type):
    t = symbol_type.strip_typedefs()
    if IsFunctionPointer(t):
        # No good way to interop a function pointer back to python; lie and say it's a void*
        return "void *"
    else:
        typename = str(t)
        return re.sub(r'(class|struct|enum|union) ', '', typename)


def ModuleForAddress(pointer):
    module = gdb.solib_name(pointer)
    if not module:
        # If it exists, it's in the main binary
        module = gdb.current_progspace().filename
    return JsDbgBase.FormatModule(module)

def ServerStarted(url):
    global jsdbg_url
    jsdbg_url = url
    print('Opening browser for %s' % (url))
    print('If you are debugging the default browser, manually open the URL in a')
    print('different browser.')
    webbrowser.open_new_tab(url)


def ServerExited():
    print("JsDbg: server exited or crashed. To restart, type 'jsdbg'.")
    global jsdbg
    global jsdbg_url
    jsdbg = None
    jsdbg_url = None

def ExecuteGdbCommand(cmd):
    gdb.execute(cmd)


def GetAllFields(module, type, includeBaseTypes):
    t = FindGdbType(module, type)
    if t is None:
        return None

    fields = t.fields()
    resultFields = []
    for field in fields:
        if field.is_base_class:
            if not includeBaseTypes:
                continue
            fields += field.type.fields()

        if not hasattr(field, 'bitpos'):
            # Field is static
            continue

        if field.artificial:
            # e.g. _vptr$OwnerTree
            continue

        if not field.name:
            if field.type.code != gdb.TYPE_CODE_UNION and field.type.code != gdb.TYPE_CODE_STRUCT:
                # Don't know how to handle this
                continue

            resultFields.extend([GdbFieldResult(f, field.bitpos)
                for f in field.type.fields() if not f.is_base_class])
            continue

        resultFields.append(GdbFieldResult(field))

    return resultFields


# extra_bitoffset is used when we call this function recursively in multiple
# inheritance cases.
def GetBaseTypesFromGdbType(module, type, extra_bitoffset=0):
    try:
        fields = type.fields()
    except:
        # Type does not have fields (not a struct/class/union)
        return [JsDbgTypes.SBaseTypeResult(module, type.name, 0)]

    resultFields = []
    for field in fields:
        if not field.is_base_class:
            continue
        resultFields.append(JsDbgTypes.SBaseTypeResult(
            module, field.type.name, (extra_bitoffset + field.bitpos) / 8))
        resultFields.extend(GetBaseTypesFromGdbType(
            module, field.type, extra_bitoffset + field.bitpos))

    return resultFields


def GetBaseTypes(module, type_name):
    t = FindGdbType(module, type_name)
    if t is None:
        # Type is a base type?
        return [JsDbgTypes.SBaseTypeResult(module, type_name, 0)]

    return GetBaseTypesFromGdbType(module, t)

def IsTypeEnum(module, type):
    t = FindGdbType(module, type)
    if t is None:
        return False
    return t.code == gdb.TYPE_CODE_ENUM

def LookupField(module, type, field):
    t = FindGdbType(module, type)
    if t is None:
        return None

    fields = t.fields()
    while fields:
        match = list(filter(lambda x: x.name == field, fields))
        if match:
            return GdbFieldResult(match[0])

        # Handle anonymous unions and structs. They are a bit tricky because we
        # have to recurse into their fields but keep track of their offset.
        containers = [c for c in fields if not c.name and
          (c.type.code == gdb.TYPE_CODE_UNION or c.type.code == gdb.TYPE_CODE_STRUCT)]
        for container in containers:
            for f in container.type.fields():
                if f.name == field:
                    return GdbFieldResult(f, container.bitpos)

        match = filter(lambda x: x.is_base_class, fields)
        fields = [f for m in match for f in m.type.fields()]

def LookupGlobalSymbol(module, symbol):
    sym = FindGdbSymbol(module, symbol)
    if sym is None:
        return None
    return GdbSymbolResult(sym)


def GetModuleForName(module):
    objfile = FindObjfileForName(module)
    if objfile:
        # Python has no API to find the base address
        # https://sourceware.org/bugzilla/show_bug.cgi?id=24481
        return JsDbgTypes.SModule(module, 0)
    return None


def GetCallStack(numFrames):
    frame = gdb.newest_frame()
    frames = []
    while frame and numFrames > 0:
        frames.append(GdbStackFrame(frame))
        numFrames = numFrames - 1
        frame = frame.older()
    return frames

def GetSymbolsInStackFrame(instructionAddress, stackAddress, frameAddress):
    frame = gdb.newest_frame()

    while frame and not (frame.pc() == gdb.Value(instructionAddress) and frame.read_register('sp') == gdb.Value(stackAddress)):
        frame = frame.older()

    if frame:
        try:
            block = frame.block()
        except:
            # We are probably missing symbols for this frame.
            return []
        syms = []
        while block and not block.is_global and not block.is_static:
            syms = syms + [s for s in block if s.addr_class != gdb.SYMBOL_LOC_TYPEDEF]
            block = block.superblock

        return [GdbNamedSymbol(s, frame) for s in syms if s.value(frame).address is not None]
    return None

def LookupTypeSize(module, typename):
    typename = typename.strip()
    if (typename.endswith("*")):
        t = gdb.lookup_type("void")
        return t.reference().sizeof
    t = FindGdbType(module, typename)
    if t is None:
        return None
    return t.sizeof


def LookupConstants(module, type, value):
    type = FindGdbType(module, type)
    if type is None:
        return None
    if type.code != gdb.TYPE_CODE_ENUM:
        return None
    values = []
    for f in type.fields():
        if f.enumval != value:
            continue

        # GDB will give us "EnumType::Value", but we just want to return the
        # "Value" part.
        name = f.name
        name = name[name.rfind("::") + 2:]
        values.append(JsDbgTypes.SConstantResult(name, f.enumval))
    return values


def LookupConstant(module, typename, constantName):
    if typename:
        type = FindGdbType(module, typename)
        if type is None:
            return None
        # Values in enum classes are stored as type::eFoo;
        # regular enums as just eFoo.
        matches = [f for f in type.fields() if f.name.endswith("::" + constantName) or f.name == constantName]
        if matches and hasattr(matches[0], 'enumval'):
            return str(matches[0].enumval)

        # For non-enums, try another way
        val = gdb.parse_and_eval("%s::%s" % (typename, constantName))
    else:
        val = gdb.parse_and_eval("%s" % constantName)

    integral_val = val.cast(gdb.lookup_type("unsigned long long"))
    return str(integral_val)

def LookupSymbolName(pointer):
    module = ModuleForAddress(pointer)
    val = gdb.parse_and_eval("(void*)%d" % pointer)
    # Result looks like: '0x4004f1 <twiddle<int []>(int)+17>'
    # If not found, just looks like '0x4004f1'
    symbol_and_offset = re.search('<(.+)>$', str(val))
    if symbol_and_offset is None:
        return None
    groups = re.match("^(.*?)(\\+([0-9]+))?$", symbol_and_offset.groups()[0]).groups()
    symbol = groups[0]
    offset = 0
    if groups[2]:
        offset = int(groups[2])
    return JsDbgTypes.SSymbolNameAndDisplacement(module, symbol, offset)

def ReadMemoryBytes(pointer, size):
    inferior = gdb.selected_inferior()
    # Note: will throw an error if this includes unmapped/ unreadable memory
    buf = inferior.read_memory(pointer, size)
    if (sys.version_info < (3, 0)):
      return binascii.hexlify(bytearray(buf))
    return buf.hex()

def WriteMemoryBytes(pointer, hexString):
    inferior = gdb.selected_inferior()
    byteString = binascii.unhexlify(hexString)
    inferior.write_memory(pointer, byteString)

def GetAttachedProcesses():
    processes = ', '.join(["%d" % (inferior.pid) for inferior in gdb.inferiors() if inferior.pid])
    return '[%s]' % (processes)

def GetCurrentProcessThreads():
    return [thread.ptid[2] or thread.ptid[1] for thread in gdb.selected_inferior().threads()]

def GetTargetProcess():
    return "%d" % (gdb.selected_inferior().pid)

def GetTargetThread():
    thread = gdb.selected_thread()
    return thread.ptid[2] or thread.ptid[1]

def SetTargetProcess(pid):
    match = [i for i in gdb.inferiors() if i.pid == pid]
    if not match:
        raise ValueError('No such process %i' % (pid))
    # Last thread seems to be the main thread, switch to that
    threads = match[0].threads()[-1].switch()

def SetTargetThread(tid):
    match = [t for t in gdb.selected_inferior().threads() if t.ptid[2] == tid or t.ptid[1] == tid]
    if not match:
        raise ValueError('No such thread %i' % (pid))
    match[0].switch()

def CheckForProcessAndThreadChange():
    global last_tid
    global last_pid
    global jsdbg
    try:
        current_process = GetTargetProcess()
    except:
        current_process = None
    try:
        current_thread = GetTargetThread()
    except:
        current_thread = None

    if last_pid != current_process and jsdbg:
        jsdbg.SendEvent('proc %s' % (current_process))
    if last_tid != current_thread and jsdbg:
        jsdbg.SendEvent('thread %i' % (current_thread))
    last_pid = current_process
    last_tid = current_thread

def StoppedHandler(ev):
    global jsdbg
    if jsdbg:
        jsdbg.SendEvent('stop')

def ContHandler(ev):
    global jsdbg
    global last_tid
    # This may be the initial "run"; send a notification if so
    if not last_tid:
        CheckForProcessAndThreadChange()
    if jsdbg:
        jsdbg.SendEvent('cont')

def ExitHandler(ev):
    global jsdbg
    if jsdbg:
        jsdbg.SendEvent('exit')

def PromptHandler():
    CheckForProcessAndThreadChange()

# To allow for easier unittesting, check if we have an events attribute
if hasattr(gdb, 'events'):
    gdb.events.stop.connect(StoppedHandler)
    gdb.events.cont.connect(ContHandler)
    gdb.events.exited.connect(ExitHandler)
    gdb.events.before_prompt.connect(PromptHandler)


class VerboseParam(gdb.Parameter):
    """
When enabled, all JsDbg commands get printed to stdout as they are executed.
Only useful for debugging JsDbg itself."""
    set_doc = 'Sets whether to show verbose output from JsDbg'
    show_doc = 'Shows the current setting for jsdbg-verbose'
    def __init__(self):
        super(VerboseParam, self).__init__("jsdbg-verbose",
            gdb.COMMAND_MAINTENANCE, gdb.PARAM_BOOLEAN)

    def get_set_string(self):
        global jsdbg
        if jsdbg is not None:
            # If JsDbg is already running, update its verbosity.
            # Otherwise, we'll pass this value to it when we start it.
            jsdbg.verbose = self.value
        if self.value:
            return 'Showing verbose JsDbg output'
        else:
            return 'Not showing verbose JsDbg output'
    def get_show_string(self, svalue):
        return 'jsdbg-verbose is ' + svalue

verbose_param = VerboseParam()

class JsDbgCmd(gdb.Command):
  """Runs JsDbg."""

  def __init__(self):
    super(JsDbgCmd, self).__init__("jsdbg", gdb.COMMAND_USER)

  def invoke(self, arg, from_tty):
    global jsdbg
    global jsdbg_url
    if not jsdbg:
        jsdbg = JsDbgBase.JsDbg(
            sys.modules[__name__], gdb.post_event, ServerExited,
            verbose_param.value)
    else:
        ServerStarted(jsdbg_url)

JsDbgCmd()
