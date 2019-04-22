import gdb
import sys
import subprocess
import threading
import binascii

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
        execPath = "/mnt/c/jsdbg/server/JsDbg.Gdb/bin/Release/netcoreapp2.1/linux-x64/publish/JsDbg.Gdb"
        extensionsPath = "/mnt/c/jsdbg/extensions"
        persistentStorePath = "/mnt/c/jsdbg/persistent"
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
        
        # TODO: These threads don't get cleaned gracefully at exit, need to 
        # work out what the correct way of handling that is. 
        self.stderrThread = threading.Thread(target=stderrThreadProc)
        self.mainThread = threading.Thread(target=mainThreadProc)
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
    def __init__(self, field):
        self.bitOffset = field.bitpos % 8 if hasattr(field, 'bitpos') else -1
        self.offset = field.bitpos / 8 if hasattr(field, 'bitpos') else -1
        self.bitCount = field.bitsize
        self.size = field.type.sizeof
        self.fieldName = field.name
        pointer_depth = 0
        t = field.type
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
        self.type = symbol.type.name
        self.pointer = symbol.value().address.reinterpret_cast(gdb.lookup_type("unsigned long long"))
    
    def __repr__(self):
        return '{%s#%d' % (self.type, self.pointer)

class SStackFrame:
    def __init__(self, frame):
        self.instructionAddress = frame.pc()
        self.stackAddress = frame.read_register("sp")
        self.frameAddress = frame.read_register("rbp") # TODO: or ebp?
    
    def __repr__(self):
        return '{%d#%d#%d}' % (self.instructionAddress, self.stackAddress, self.frameAddress)


class SSymbolResult:
    def __init__(self, value):
        self.pointer = value.address.reinterpret_cast(gdb.lookup_type("unsigned long long"))
        self.type = value.type.name
        
    def __repr__(self):
        return '{%d#%s}' % (self.pointer, self.type)

class SNamedSymbol:
    def __init__(self, symbol, frame):
        self.name = symbol.name
        self.symbolResult = SSymbolResult(symbol.value(frame))
    
    def __repr__(self):
        return '{%s#%d#%s}' % (self.name, self.symbolResult.pointer, s.symbolResult.type)


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
        match = filter(lambda x: x.is_base_class, fields)
        fields = [f for m in match for f in m.type.fields()]

def LookupGlobalSymbol(module, symbol):
    sym = gdb.lookup_global_symbol(symbol)
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

def LookupConstant(module, typename, constantName):
    if typename:
        val = gdb.parse_and_eval("%s::%s" %(typename, constantName))
    else:
        val = gdb.parse_and_eval("%s" % constantName)
    # If it is an enum, we could go via type->fields->enumval
    # seems more consistent to just cast to a sufficiently big integral value

    integral_val = val.reinterpret_cast(gdb.lookup_type("unsigned long long"))
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
