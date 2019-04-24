//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Diagnostics;
using System.IO;

namespace JsDbg.Windows {
    public static class BrowserLauncher {
        public static void Launch(string url) {
            try {
                if (File.Exists(Path.Combine(Environment.SystemDirectory, "openwith.exe"))) {
                    Process p = Process.Start(BrowserLauncher.CreateUnelevateProcessStartInfo("openwith " + url));
                    p.WaitForExit();
                    if (p.ExitCode != 0) {
                        Process.Start("openwith", url);
                    }
                } else {
                    Process p = Process.Start(BrowserLauncher.CreateUnelevateProcessStartInfo(url));
                    p.WaitForExit();
                    if (p.ExitCode != 0) {
                        Process.Start(url);
                    }
                }
            } catch (Exception ex) {
                Console.WriteLine("Exception while trying to launch the browser: {0}", ex.Message);
                Console.WriteLine("Open Edge, Chrome or IE and navigate to {0}", url);
            }
        }

        private static ProcessStartInfo CreateUnelevateProcessStartInfo(string arguments) {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            string assemblyPath = System.Reflection.Assembly.GetExecutingAssembly().Location;
            string unelevatePath = Path.Combine(Path.GetDirectoryName(assemblyPath), "unelevate.exe");
            startInfo.FileName = unelevatePath;
            startInfo.Arguments = arguments;
            startInfo.CreateNoWindow = true;
            startInfo.UseShellExecute = false;
            return startInfo;
        }
    }
}
