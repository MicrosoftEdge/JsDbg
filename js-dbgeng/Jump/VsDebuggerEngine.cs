using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using JsDbg;
using Microsoft.VisualStudio.Debugger.Interop;
using Microsoft.VisualStudio.Shell.Interop;

namespace Sushraja.Jump {
    class VsDebuggerEngine : Core.ITypeCacheDebuggerEngine {
        private const int S_OK = 0;

        internal VsDebuggerEngine(VsDebuggerRunner runner, Core.DiaSessionLoader diaLoader) {
            this.runner = runner;
            this.diaLoader = diaLoader;
        }

        internal void NotifyDebuggerBroke() {
            if (this.DebuggerBroke != null) {
                this.DebuggerBroke(this, new EventArgs());
            }
        }

        internal void NotifyBitnessChanged() {
            if (this.BitnessChanged != null) {
                this.BitnessChanged(this, new EventArgs());
            }
        }

        #region ITypeCacheDebuggerEngine Members

        public Core.DiaSessionLoader DiaLoader {
            get { return this.diaLoader; }
        }

        public bool IsPointer64Bit {
            get { return this.runner.IsPointer64Bit; }
        }

        public async Task<Core.SModule> GetModuleForAddress(ulong address) {
            await this.runner.WaitForBreakIn();

            IEnumDebugModules2 debugModulesEnumerator;
            if (this.runner.CurrentDebugProgram.EnumModules(out debugModulesEnumerator) == S_OK) {
                debugModulesEnumerator.Reset();
                IDebugModule2[] debugModuleArray = new IDebugModule2[1];
                uint cModules = 0;
                while (debugModulesEnumerator.Next(1, debugModuleArray, ref cModules) == S_OK && cModules > 0) {
                    IDebugModule2 debugModule2 = debugModuleArray[0];
                    MODULE_INFO[] moduleInfo = new MODULE_INFO[1];
                    if (debugModule2.GetInfo((uint)enum_MODULE_INFO_FIELDS.MIF_NAME | (uint)enum_MODULE_INFO_FIELDS.MIF_LOADADDRESS | (uint)enum_MODULE_INFO_FIELDS.MIF_SIZE, moduleInfo) == S_OK) {
                        if (moduleInfo[0].m_addrLoadAddress <= address && moduleInfo[0].m_addrLoadAddress + moduleInfo[0].m_dwSize > address) {
                            string suffixedModuleName = moduleInfo[0].m_bstrName;
                            string bareModuleName = suffixedModuleName.Substring(0, suffixedModuleName.LastIndexOf('.'));
                            return new Core.SModule() { BaseAddress = moduleInfo[0].m_addrLoadAddress, Name = bareModuleName };
                        }
                    }
                }
            }

            throw new DebuggerException(String.Format("Could not find module at address: 0x{x:8}", address));
        }

        public async Task<Core.SModule> GetModuleForName(string module) {
            await this.runner.WaitForBreakIn();

            IEnumDebugModules2 debugModulesEnumerator;
            if (this.runner.CurrentDebugProgram.EnumModules(out debugModulesEnumerator) == S_OK) {
                debugModulesEnumerator.Reset();
                IDebugModule2[] debugModuleArray = new IDebugModule2[1];
                uint cModules = 0;
                while (debugModulesEnumerator.Next(1, debugModuleArray, ref cModules) == S_OK && cModules > 0) {
                    IDebugModule2 debugModule2 = debugModuleArray[0];
                    MODULE_INFO[] moduleInfo = new MODULE_INFO[1];
                    if (debugModule2.GetInfo((uint)enum_MODULE_INFO_FIELDS.MIF_NAME | (uint)enum_MODULE_INFO_FIELDS.MIF_LOADADDRESS, moduleInfo) == S_OK) {
                        string suffixedModuleName = moduleInfo[0].m_bstrName;
                        string bareModuleName = suffixedModuleName.Substring(0, suffixedModuleName.LastIndexOf('.'));
                        if (bareModuleName == module) {
                            return new Core.SModule() { BaseAddress = moduleInfo[0].m_addrLoadAddress, Name = module };
                        }
                    }
                }
            }

            throw new DebuggerException(String.Format("Unknown module: {0}", module));
        }

        private async Task<byte[]> ReadByteArray(ulong pointer, ulong size) {
            await this.runner.WaitForBreakIn();

            IDebugMemoryContext2 memoryContextTarget;
            this.runner.CurrentMemoryContext.Add(pointer, out memoryContextTarget);

            uint dwRead;
            uint dwUnReadable = 0;
            byte[] memory = new byte[size];
            this.runner.CurrentMemoryBytes.ReadAt(memoryContextTarget, (uint)size, memory, out dwRead, ref dwUnReadable);
            if (dwRead != size) {
                throw new DebuggerException(String.Format("ReadArray: Failed read memory 0x{0:x8} - Size {0}", pointer, size));
            }
            return memory;
        }

        public async Task<T[]> ReadArray<T>(ulong pointer, ulong size) where T : struct {
            ulong typeSize = (ulong)System.Runtime.InteropServices.Marshal.SizeOf(typeof(T));
            ulong byteSize = size * typeSize;
            byte[] memory = await this.ReadByteArray(pointer, byteSize);

            T[] result = new T[size];
            System.Runtime.InteropServices.GCHandle gcHandle = System.Runtime.InteropServices.GCHandle.Alloc(result, System.Runtime.InteropServices.GCHandleType.Pinned);
            IntPtr tPointer = gcHandle.AddrOfPinnedObject();
            for (ulong i = 0; i < byteSize; i++) {
                System.Runtime.InteropServices.Marshal.WriteByte(tPointer, memory[i]);
                // move tPointer by 1 byte.
                tPointer = IntPtr.Add(tPointer, 1);
            }
            gcHandle.Free();

            return result;
        }

        public async Task<IEnumerable<Core.SStackFrameWithContext>> GetCurrentCallStack() {
            await this.runner.WaitForBreakIn();

            List<Core.SStackFrameWithContext> results = new List<Core.SStackFrameWithContext>();

            IDebugThread2 thread = this.runner.CurrentThread;
            if (thread == null) {
                throw new DebuggerException("No thread was recorded.");
            }
            IEnumDebugFrameInfo2 frameEnumerator;
            thread.EnumFrameInfo((uint)(enum_FRAMEINFO_FLAGS.FIF_FRAME | enum_FRAMEINFO_FLAGS.FIF_STACKRANGE), 10, out frameEnumerator);

            uint frameCount = 0;
            frameEnumerator.GetCount(out frameCount);
            FRAMEINFO[] frames = new FRAMEINFO[frameCount];

            frameEnumerator.Reset();
            if (frameEnumerator.Next((uint)frames.Length, frames, ref frameCount) == S_OK) {
                for (int i = 0; i < frameCount; ++i) {
                    FRAMEINFO frame = frames[i];

                    IDebugCodeContext2 codeContext;
                    if (frame.m_pFrame.GetCodeContext(out codeContext) == S_OK) {
                        CONTEXT_INFO[] contextInfo = new CONTEXT_INFO[1];
                        codeContext.GetInfo((uint)enum_CONTEXT_INFO_FIELDS.CIF_ADDRESS, contextInfo);
                        ulong instructionAddress = ulong.Parse(contextInfo[0].bstrAddress.Substring(2), System.Globalization.NumberStyles.AllowHexSpecifier);
                        // TODO: the -8 below seems architecture dependent
                        results.Add(new Core.SStackFrameWithContext() { Context = null, StackFrame = new SStackFrame() { FrameAddress = frame.m_addrMin - 8, InstructionAddress = instructionAddress, StackAddress = frame.m_addrMax } });
                    }
                }
            }

            return results;
        }

        public event EventHandler DebuggerBroke;

        public event EventHandler BitnessChanged;

        public Task<JsDbg.Type> GetTypeFromDebugger(string module, string typename) {
            throw new JsDbg.DebuggerException("Cannot load types from the Visual Studio debugger directly.");
        }

        public Task<JsDbg.SSymbolResult> LookupGlobalSymbol(string module, string symbol) {
            throw new JsDbg.DebuggerException("Cannot load symbols from the Visual Studio debugger directly.");
        }

        public Task<IEnumerable<JsDbg.SSymbolResult>> LookupLocalsInStackFrame(Core.SStackFrameWithContext stackFrameWithContext, string symbolName) {
            throw new JsDbg.DebuggerException("Cannot load locals from the Visual Studio debugger directly.");
        }

        public Task<JsDbg.SSymbolNameResultAndDisplacement> LookupSymbolName(ulong pointer) {
            throw new JsDbg.DebuggerException("Cannot load symbols from the Visual Studio debugger directly.");
        }

        #endregion

        private VsDebuggerRunner runner;
        private Core.DiaSessionLoader diaLoader;
    }
}
