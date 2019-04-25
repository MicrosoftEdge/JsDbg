//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

// Guids.cs
// MUST match guids.h
using System;

namespace JsDbg.VisualStudio
{
    static class GuidList
    {
        public const string guidJsDbgPkgString = "5b3af206-b4d4-4d12-9661-5d2d8dd8d194";
        public const string guidJsDbgCmdSetString = "c1d45f31-0c86-46e2-b76b-759369366aa1";

        public static readonly Guid guidJsDbgCmdSet = new Guid(guidJsDbgCmdSetString);
    };
}