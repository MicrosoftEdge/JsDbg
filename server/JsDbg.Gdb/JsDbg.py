import gdb
import sys
import subprocess
import threading
import binascii
import os.path
import re
import webbrowser

jsdbg = None
jsdbg_url = None
last_pid = None
last_tid = None

class JsDbg:
    class JsDbgGdbRequest:
        def __init__(self, request, responseStream, verbose):
            self.request = request
            self.responseStream = responseStream
            self.verbose = verbose

        def __call__(self):
            # Need to look at GDB events in python, track "stop" and "cont" evens
            if self.verbose:
                print("JsDbg [received command]: " + self.request)
            response = eval(self.request) + "\n"
            if self.verbose:
                print("JsDbg [sending response]: " + response.strip())
            self.responseStream.write(response.encode("utf-8"))
            self.responseStream.flush()

    def __init__(self):
        self.showStderr = True
        self.verbose = False
        rootDir = os.path.dirname(os.path.abspath(__file__))
        extensionSearchPath = [
          rootDir + "/extensions", # from "make package"
          rootDir + "/../../extensions", # inside a checkout
          rootDir + "/../../jsdbg/extensions", # from "make install"
        ]
        execSearchPath = [
          rootDir + "/JsDbg.Gdb", # from "make package"
          rootDir + "/bin/Release/netcoreapp2.1/linux-x64/publish/JsDbg.Gdb", # in a checkout
          rootDir + "/../../../lib/jsdbg/JsDbg.Gdb" # from make install
        ]
        extensionsPath = None
        for path in extensionSearchPath:
          if os.path.exists(path):
            extensionsPath = path
            break
        execPath = None
        for path in execSearchPath:
          if os.path.exists(path):
            execPath = path
            break
        if not extensionsPath:
            raise Exception("Can't find JsDbg extensions")
        if not execPath:
            raise Exception("Can't find JsDbg.Gdb binary")

        self.proc = subprocess.Popen([execPath, extensionsPath], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        def stderrThreadProc():
            # Echo stderr from the subprocess, if showStderr is set
            while(self.proc.poll() == None):
                val = self.proc.stderr.readline()
                if not val:
                    continue
                val = val.strip().decode("utf-8")
                if self.verbose:
                    print("JsDbg [message]: " + val)
                elif self.showStderr:
                    print("JsDbg: " + val)
            # If we get here, the server exited
            print("JsDbg: server exited or crashed. To restart, type 'jsdbg'.")
            global jsdbg
            global jsdbg_url
            jsdbg = None
            jsdbg_url = None

        def mainThreadProc():
            # Handle the main interaction loop between jsdbg and python
            while(self.proc.poll() == None):
                request = self.proc.stdout.readline()
                if not request:
                    continue

                request = request.decode("utf-8").strip()
                if self.verbose:
                    print("JsDbg [posting command]: " + request)
                # gdb does not allow multithreaded requests
                # Anything going to gdb from another thread must go through gdb.post_event
                gdb.post_event(self.JsDbgGdbRequest(request, self.proc.stdin, self.verbose))
                # The response will asynchronously be sent back on the response stream

        # Mark threads as daemon threads so they don't block exiting.
        self.stderrThread = threading.Thread(target=stderrThreadProc)
        self.stderrThread.daemon = True
        self.mainThread = threading.Thread(target=mainThreadProc)
        self.mainThread.daemon = True
        self.stderrThread.start()
        self.mainThread.start()

    def SendGdbEvent(self, event):
        response = '%' + event + '\n';
        if self.verbose:
            print("JsDbg [sending event]: " + response)
        self.proc.stdin.write(response.encode("utf-8"))
        self.proc.stdin.flush()


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


# Input is /foo/bar/libfoo.so, or /foo/bar/some_executable
def FormatModule(module):
    # First, we strip out the path to the module
    module = module[module.rfind("/") + 1:]
    # Then, we remove the lib prefix and .so / .so.1.2 suffix, if present.
    return re.match("^(lib)?(.*?)(.so)?[.0-9]*$", module).groups()[1]


def ModuleForAddress(pointer):
    module = gdb.solib_name(pointer)
    if not module:
        # If it exists, it's in the main binary
        module = gdb.current_progspace().filename
    return FormatModule(module)


class SFieldResult:
    # extra_bitoffset allows handling anonymous unions correctly
    def __init__(self, field, extra_bitoffset=0):
        if hasattr(field, 'bitpos'):
            # If this is a bitfield, we adjust offset and bitOffset to be aligned
            # according to type.sizeof, because JsDbg's memory cache does not
            # handle unaligned loads.
            # Otherwise we assume the compiler aligned it correctly.
            bitpos = field.bitpos + extra_bitoffset
            bitsize = field.type.sizeof * 8 if field.bitsize else 8
            self.bitOffset = bitpos % bitsize
            self.offset = (bitpos - self.bitOffset) / 8
        else:
            self.bitOffset = -1
            self.offset = -1
        self.bitCount = field.bitsize
        self.size = field.type.sizeof
        self.fieldName = field.name
        self.typeName = FormatType(field.type)

    def __repr__(self):
        return '{%d#%d#%d#%d#%s#%s}' % (self.offset, self.size, self.bitOffset, self.bitCount, self.fieldName, self.typeName)

class SBaseTypeResult:
    def __init__(self, module, typeName, offset):
        self.module = module
        self.typeName = typeName
        self.offset = offset

    def __repr__(self):
        return '{%s#%s#%d}' % (self.module, self.typeName, self.offset)

class SSymbolResult:
    def __init__(self, symbol, frame=None):
        self.type = FormatType(symbol.type)
        if frame:
            value = symbol.value(frame)
        else:
            value = symbol.value()
        self.pointer = value.address.reinterpret_cast(gdb.lookup_type("unsigned long long"))

    def __repr__(self):
        return '{%s#%d}' % (self.type, self.pointer)

class SStackFrame:
    def __init__(self, frame):
        self.instructionAddress = frame.pc()
        self.stackAddress = frame.read_register("sp")
        self.frameAddress = frame.read_register("fp")

    def __repr__(self):
        return '{%d#%d#%d}' % (self.instructionAddress, self.stackAddress, self.frameAddress)


class SNamedSymbol:
    def __init__(self, symbol, frame):
        self.name = symbol.name
        self.symbolResult = SSymbolResult(symbol, frame)
        self.module = ModuleForAddress(frame.pc())

    def __repr__(self):
        return '{%s#%s#%d#%s}' % (self.module, self.name, self.symbolResult.pointer, self.symbolResult.type)


class SConstantResult:
    def __init__(self, name, value):
        self.name = name
        self.value = value

    def __repr__(self):
        return '{%s#%d}' % (self.name, self.value)


class SModule:
    def __init__(self, name, baseAddress):
        self.name = name
        self.baseAddress = baseAddress

    def __repr__(self):
        return '{%s#%d}' % (self.name, self.baseAddress)


def ServerStarted(url):
    global jsdbg_url
    jsdbg_url = url
    print('Opening browser for %s' % (url))
    print('If you are debugging the default browser, manually open the URL in a')
    print('different browser.')
    webbrowser.open_new_tab(url)


def ExecuteGdbCommand(cmd):
    gdb.execute(cmd)


def GetAllFields(module, type, includeBaseTypes):
    t = gdb.lookup_type(type)
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

            resultFields.extend([SFieldResult(f, field.bitpos)
                for f in field.type.fields() if not f.is_base_class])
            continue

        resultFields.append(SFieldResult(field))

    return resultFields


# extra_bitoffset is used when we call this function recursively in multiple
# inheritance cases.
def GetBaseTypesFromGdbType(module, type, extra_bitoffset=0):
    try:
        fields = type.fields()
    except:
        # Type does not have fields (not a struct/class/union)
        return [SBaseTypeResult(module, type.name, 0)]

    resultFields = []
    for field in fields:
        if not field.is_base_class:
            continue
        resultFields.append(SBaseTypeResult(module, field.type.name, (extra_bitoffset + field.bitpos) / 8))
        resultFields.extend(GetBaseTypesFromGdbType(module, field.type, extra_bitoffset + field.bitpos))

    return resultFields


def GetBaseTypes(module, type_name):
    try:
        t = gdb.lookup_type(type_name)
    except:
        # Type is a base type?
        return [SBaseTypeResult(module, type_name, 0)]

    return GetBaseTypesFromGdbType(module, t)

def IsTypeEnum(module, type):
    t = gdb.lookup_type(type)
    return t.code == gdb.TYPE_CODE_ENUM

def LookupField(module, type, field):
    t = gdb.lookup_type(type)
    fields = t.fields()
    while fields:
        match = list(filter(lambda x: x.name == field, fields))
        if match:
            return SFieldResult(match[0])

        # Handle anonymous unions and structs. They are a bit tricky because we
        # have to recurse into their fields but keep track of their offset.
        containers = [c for c in fields if not c.name and
          (c.type.code == gdb.TYPE_CODE_UNION or c.type.code == gdb.TYPE_CODE_STRUCT)]
        for container in containers:
            for f in container.type.fields():
                if f.name == field:
                    return SFieldResult(f, container.bitpos)

        match = filter(lambda x: x.is_base_class, fields)
        fields = [f for m in match for f in m.type.fields()]

def LookupGlobalSymbol(module, symbol):
    # We can't use lookup_global_symbol because that does not work for symbols
    # with local linkage, such as those in an anonymous namespace.
    # https://sourceware.org/bugzilla/show_bug.cgi?id=24474
    (sym, _) = gdb.lookup_symbol(symbol)
    if sym is None:
        return None
    return SSymbolResult(sym)


def GetModuleForName(module):
  # If we are running under rr, it renames/hardlinks/copies the executable to
  # a different name; allow for that.
  matches = re.match("^.*/mmap_(hardlink|pack)_[0-9]+_(.*)$", gdb.current_progspace().filename)
  if matches and matches.groups()[1] == module:
    return SModule(module, 0)

  objfile = None
  try:
    objfile = gdb.lookup_objfile(module)
  except ValueError:
    # Try libFOO.so
    objfile = gdb.lookup_objfile('lib' + module + '.so')
  if objfile:
    # Python has no API to find the base address
    # https://sourceware.org/bugzilla/show_bug.cgi?id=24481
    return SModule(module, 0)
  return None


def GetCallStack(numFrames):
    frame = gdb.newest_frame()
    frames = []
    while frame and numFrames > 0:
        frames.append(SStackFrame(frame))
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

        return [SNamedSymbol(s, frame) for s in syms]
    return None

def LookupTypeSize(module, typename):
    typename = typename.strip()
    if (typename.endswith("*")):
        t = gdb.lookup_type("void")
        return t.reference().sizeof
    t = gdb.lookup_type(typename)
    return t.sizeof


def LookupConstants(module, type, value):
    type = gdb.lookup_type(type)
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
        values.append(SConstantResult(name, f.enumval))
    return values


def LookupConstant(module, typename, constantName):
    if typename:
        try:
            val = gdb.parse_and_eval("%s::%s" %(typename, constantName))
        except:
            # Try without the enum name, if it's not an enum class
            if ("::" in typename):
                typename = typename[:typename.rfind("::")]
            else:
                typename = ""
            val = gdb.parse_and_eval("%s::%s" %(typename, constantName))
    else:
        val = gdb.parse_and_eval("%s" % constantName)
    # If it is an enum, we could go via type->fields->enumval
    # seems more consistent to just cast to a sufficiently big integral value

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
    return "%s#%s#%d" % (module, symbol, offset)

def ReadMemoryBytes(pointer, size):
    inferior = gdb.selected_inferior()
    # Note: will throw an error if this includes unmapped/ unreadable memory
    buf = inferior.read_memory(pointer, size)
    if (sys.version_info < (3, 0)):
      return binascii.hexlify(bytearray(buf))
    return buf.hex()

def WriteMemoryBytes(pointer, hexString):
    inferior = gdb.selected_inferior()
    byteString = bytes.fromhex(hexString)
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
        jsdbg.SendGdbEvent('proc %i' % (current_process))
    if last_tid != current_thread and jsdbg:
        jsdbg.SendGdbEvent('thread %i' % (current_thread))
    last_pid = current_process
    last_tid = current_thread

def StoppedHandler(ev):
    global jsdbg
    if jsdbg:
        jsdbg.SendGdbEvent('stop')

def ContHandler(ev):
    global jsdbg
    global last_tid
    # This may be the initial "run"; send a notification if so
    if not last_tid:
        CheckForProcessAndThreadChange()
    if jsdbg:
        jsdbg.SendGdbEvent('cont')

def ExitHandler(ev):
    global jsdbg
    if jsdbg:
        jsdbg.SendGdbEvent('exit')

def PromptHandler():
    CheckForProcessAndThreadChange()

gdb.events.stop.connect(StoppedHandler)
gdb.events.cont.connect(ContHandler)
gdb.events.exited.connect(ExitHandler)
gdb.events.before_prompt.connect(PromptHandler)

class JsDbgCmd(gdb.Command):
  """Runs JsDbg."""

  def __init__(self):
    super(JsDbgCmd, self).__init__("jsdbg", gdb.COMMAND_USER)

  def invoke(self, arg, from_tty):
    global jsdbg
    global jsdbg_url
    if not jsdbg:
        jsdbg = JsDbg()
    else:
        ServerStarted(jsdbg_url)

JsDbgCmd()
