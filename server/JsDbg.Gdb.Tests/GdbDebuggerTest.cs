using JsDbg.Gdb;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Collections.Generic;

// To run these tests, run "dotnet test" in this directory.

namespace JsDbg.Gdb.Tests
{
    [TestClass]
    public class GdbDebuggerTest
    {
        [TestMethod]
        public void TestParsePythonObjectArrayToStrings()
        {
            string[] empty = {};
            CollectionAssert.AreEqual(
                empty, GdbDebugger.ParsePythonObjectArrayToStrings("[]"),
                "Failed to parse empty array");
            string[] one = {"a#b"};
            CollectionAssert.AreEqual(
                one, GdbDebugger.ParsePythonObjectArrayToStrings("[{a#b}]"),
                "Failed to parse one-element array");
            string[] two = {"a", "b"};
            CollectionAssert.AreEqual(
                two, GdbDebugger.ParsePythonObjectArrayToStrings("[{a}, {b}]"),
                "Failed to parse two-element array");
        }
    }
}
