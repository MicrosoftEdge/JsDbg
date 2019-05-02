//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

namespace JsDbg.Core {
    internal class DllImports {
        [DllImport("shlwapi.dll")]
        internal static extern bool PathIsNetworkPath(string path);
    }
}
