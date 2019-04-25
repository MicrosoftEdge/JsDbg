//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace JsDbg.Remoting
{
    public static class RemotingServer {
        private static string GetPipeName(string debuggerRemoteString) {
            MD5 hasher = MD5.Create();
            byte[] hashBytes = hasher.ComputeHash(System.Text.Encoding.UTF8.GetBytes(("JsDbg:" + debuggerRemoteString).ToLowerInvariant().Trim()));
            StringBuilder pipeName = new StringBuilder();
            foreach (byte b in hashBytes) {
                pipeName.Append(b.ToString("X2"));
            }
            return pipeName.ToString();
        }

        public static bool RelaunchExistingInstance(string debuggerRemoteString) {
            try {
                NamedPipeClientStream stream = new NamedPipeClientStream(".", GetPipeName(debuggerRemoteString), PipeDirection.Out, PipeOptions.Asynchronous);
                stream.Connect(100);
                stream.Write(new byte[] { 1 }, 0, 1);
                stream.Close();
                return true;
            } catch {
                return false;
            }
        }

        public static async void RegisterNewInstance(string debuggerRemoteString, Action relaunch) {
            try {
                while (true) {
                    using (NamedPipeServerStream stream = new NamedPipeServerStream(GetPipeName(debuggerRemoteString), PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous)) {
                        await Task.Factory.FromAsync(stream.BeginWaitForConnection, stream.EndWaitForConnection, null);
                        byte[] buffer = new byte[256];
                        int bytes = await stream.ReadAsync(buffer, 0, 256);
                        if (bytes > 0 && buffer[0] == 1) {
                            relaunch();
                        }
                        stream.Close();
                    }
                }
            } catch {

            }
        }
    }
}
