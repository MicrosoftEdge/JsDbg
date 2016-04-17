// Guids.cs
// MUST match guids.h
using System;

namespace JsDbg.VisualStudio
{
    static class GuidList
    {
        public const string guidJumpPkgString = "5b3af206-b4d4-4d12-9661-5d2d8dd8d194";
        public const string guidJumpCmdSetString = "c1d45f31-0c86-46e2-b76b-759369366aa1";
        public const string guidToolWindowPersistanceString = "081b2af4-9bd0-4dc5-99ac-1754d3381dea";

        public static readonly Guid guidJumpCmdSet = new Guid(guidJumpCmdSetString);
    };
}