import os.path
import re
import subprocess
import threading

class JsDbg:
    """The debugger-independent functionality of JsDbg.

    It is designed to be simple to use; users only have to provide three things:
    - A module instance that contains the functions that the webserver calls
      (primarily DebuggerQuery)
    - A post_event function that takes a callable class to execute on the
      main thread.
    - A function that gets called when the server crashes/exists, so any
      global state can be cleaned up and the user alerted.

    When JsDbg is instantiated, it will look for the JsDbg webserver binary
    and the extensions directory and run it, as well as manage communication
    with it.
    """

    class JsDbgRequest:
        def __init__(self, module, request, responseStream, verbose):
            self.module = module
            self.request = request
            self.responseStream = responseStream
            self.verbose = verbose

        def __call__(self):
            if self.verbose:
                print("JsDbg [received command]: " + self.request)
            response = eval(self.request, self.module.__dict__) + "\n"
            if self.verbose:
                print("JsDbg [sending response]: " + response.strip())
            self.responseStream.write(response.encode("utf-8"))
            self.responseStream.flush()

    def __init__(self, module, post_event_func, server_exited_func, verbose):
        self.module = module
        self.post_event_func = post_event_func
        self.server_exited_func = server_exited_func
        self.showStderr = True
        self.verbose = verbose
        rootDir = os.path.dirname(os.path.abspath(__file__))
        extensionSearchPath = [
          rootDir + "/extensions", # from "make dist"
          rootDir + "/../../extensions", # inside a checkout
          rootDir + "/../../jsdbg/extensions", # from "make install"
        ]
        # The non-.DLL entries are for "standalone" builds; the DLL ones are
        # non-standalone and need to be run via the dotnet binary.
        execSearchPath = [
          rootDir + "/JsDbg.Stdio", # from "make dist"
          rootDir + "/../JsDbg.Gdb/out/JsDbg.Stdio", # in a checkout
          rootDir + "/../JsDbg.Gdb/out/JsDbg.Stdio.dll", # in a checkout
          rootDir + "/../../../lib/jsdbg/JsDbg.Stdio", # from make install
          rootDir + "/../../../lib/jsdbg/JsDbg.Stdio.dll" # from make install
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
            raise Exception("Can't find JsDbg.Stdio binary")

        cmdline = [execPath, extensionsPath]
        if execPath.endswith(".dll"):
            cmdline = ["dotnet"] + cmdline
        if self.verbose:
            print('Running %s' % cmdline)
        self.proc = subprocess.Popen(cmdline, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)

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
            self.server_exited_func()

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
                # Anything going to gdb from another thread must go through
                # gdb.post_event
                self.post_event_func(self.JsDbgRequest(
                    self.module, request, self.proc.stdin, self.verbose))
                # The response will asynchronously be sent back on the response
                # stream

        # Mark threads as daemon threads so they don't block exiting.
        self.stderrThread = threading.Thread(target=stderrThreadProc)
        self.stderrThread.daemon = True
        self.mainThread = threading.Thread(target=mainThreadProc)
        self.mainThread.daemon = True
        self.stderrThread.start()
        self.mainThread.start()

    def SendEvent(self, event):
        response = '%' + event + '\n';
        if self.verbose:
            print("JsDbg [sending event]: " + response)
        self.proc.stdin.write(response.encode("utf-8"))
        self.proc.stdin.flush()


# Input is /foo/bar/libfoo.so, or /foo/bar/some_executable
def FormatModule(module):
    # First, we strip out the path to the module
    module = module[module.rfind("/") + 1:]
    # Then, we remove the lib prefix and .so / .so.1.2 suffix, if present.
    # Also remove any prefix added my rr (mmap_pack_123_ or mmap_hardlink_123_).
    return re.match(
        "^(mmap_(pack|hardlink)_[0-9]+_)?(lib)?(.*?)(.so)?[.0-9]*$",
        module).groups()[3]
