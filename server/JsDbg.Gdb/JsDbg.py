import gdb
import sys
import subprocess
import threading
import binascii
import os.path

jsdbg = None
            
class JsDbg:
    class JsDbgGdbRequest:
        def __init__(self, request, responseStream, verbose):
            self.request = request
            self.responseStream = responseStream
            self.verbose = verbose
        
        def __call__(self):
            # TODO: wait until at a breakpoint?
            # Need to look at GDB events in python, track "stop" and "cont" evens
            if self.verbose:
                print("JsDbg [received command]: " + self.request)
            response = eval(self.request) + "\n"
            if self.verbose:
                print("JsDbg [sending response]: " + response.strip())
            self.responseStream.write(response.encode("utf-8"))
            self.responseStream.flush()

    def __init__(self):
        self.showStderr = False
        self.verbose = True
        # TODO: assume that jsdbg is installed in "~/.jsdbg/" or some other known location?
        homeDir = os.path.expanduser("~")
        execPath = homeDir + "/JsDbg/server/JsDbg.Gdb/bin/Release/netcoreapp2.1/linux-x64/publish/JsDbg.Gdb"
        extensionsPath = homeDir + "/JsDbg/extensions"
        persistentStorePath = homeDir + "/JsDbg/persistent"
        self.proc = subprocess.Popen([execPath, extensionsPath, persistentStorePath], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

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


def DebuggerQuery(tag, command):
    # pi exec('print(\\'{0}~\\' + str({1}))')
    try:
        result = eval(command)
        return "%d~%s" % (tag, str(result))
    except:
        err = sys.exc_info()
        return "%d!%s" % (tag, str(err[1]))



class SFieldResult:
    # extra_bitoffset allows handling anonymous unions correctly
    def __init__(self, field, extra_bitoffset=0):
        self.bitOffset = (field.bitpos + extra_bitoffset) % 8 if hasattr(field, 'bitpos') else -1
        self.offset = (field.bitpos + extra_bitoffset) / 8 if hasattr(field, 'bitpos') else -1
        self.bitCount = field.bitsize
        self.size = field.type.sizeof
        self.fieldName = field.name
        pointer_depth = 0
        t = field.type.strip_typedefs()
        while t.code == gdb.TYPE_CODE_PTR or field.type.code == gdb.TYPE_CODE_ARRAY:
            pointer_depth = pointer_depth + 1
            t = t.target()

        if (t.code == gdb.TYPE_CODE_FUNC):
            # No good way to interop a function pointer back to python; lie and say it's a void*
            self.typeName = "void *"
        else:
            self.typeName = t.name + "*" * pointer_depth
    
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
    def __init__(self, symbol):
        self.type = symbol.type.strip_typedefs().name
        self.pointer = symbol.value().address.reinterpret_cast(gdb.lookup_type("unsigned long long"))
    
    def __repr__(self):
        return '{%s#%d}' % (self.type, self.pointer)

class SStackFrame:
    def __init__(self, frame):
        self.instructionAddress = frame.pc()
        self.stackAddress = frame.read_register("sp")
        self.frameAddress = frame.read_register("rbp") # TODO: or ebp?
    
    def __repr__(self):
        return '{%d#%d#%d}' % (self.instructionAddress, self.stackAddress, self.frameAddress)


class SNamedSymbol:
    def __init__(self, symbol, frame):
        self.name = symbol.name
        self.symbolResult = SSymbolResult(symbol.value(frame))
    
    def __repr__(self):
        return '{%s#%d#%s}' % (self.name, self.symbolResult.pointer, s.symbolResult.type)


class SConstantResult:
    def __init__(self, name, value):
        self.name = name
        self.value = value

    def __repr__(self):
        return '{%s#%d}' % (self.name, self.value)


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

        if not field.name:
            if field.type.code != gdb.TYPE_CODE_UNION:
                # Don't know how to handle this
                continue

            resultFields.extend([SFieldResult(f, field.bitpos) for f in field.type.fields()])
            continue

        resultFields.append(SFieldResult(field))
    
    return resultFields

def GetBaseTypes(module, type):
    try:
        t = gdb.lookup_type(type)
        fields = t.fields()
    except:
        # Type is a base type?
        return [SBaseTypeResult(module, type, 0)]

    resultFields = []
    for field in fields:
        if not field.is_base_class:
            continue
        resultFields.append(SBaseTypeResult(module, field.type.name, field.bitpos / 8))
        resultFields.extend(GetBaseTypes(module, field.type.name))
    
    return resultFields

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

        # Handle anonymous unions. They are a bit tricky because we have
        # to recurse into their fields but keep track of their offset.
        unions = [u for u in fields if not u.name and u.type.code == gdb.TYPE_CODE_UNION]
        for union in unions:
            for f in union.type.fields():
                if f.name == field:
                    return SFieldResult(f, union.bitpos)

        match = filter(lambda x: x.is_base_class, fields)
        fields = [f for m in match for f in m.type.fields()]

def LookupGlobalSymbol(module, symbol):
    # We can't use lookup_global_symbol because that does not work for symbols
    # with local linkage, such as those in an anonymous namespace.
    # https://sourceware.org/bugzilla/show_bug.cgi?id=24474
    (sym, _) = gdb.lookup_symbol(symbol)
    return SSymbolResult(sym)

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
        block = frame.block()
        syms = []
        while block and not block.is_global and not block.is_static:
            syms = syms + [s for s in block if s.addr_class != gdb.SYMBOL_LOC_TYPEDEF]
            block = block.superblock
        
        return [SNamedSymbol(s, frame) for s in syms]

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
    val = gdb.parse_and_eval("(void*)%d" % pointer)
    return str(val)

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

def EnsureJsDbg():
    global jsdbg
    if not jsdbg:
        jsdbg = JsDbg()
    return jsdbg

class JsDbgCmd(gdb.Command):
  """Runs JsDbg."""

  def __init__(self):
    super(JsDbgCmd, self).__init__("jsdbg", gdb.COMMAND_USER)

  def invoke(self, arg, from_tty):
    EnsureJsDbg()

JsDbgCmd()
