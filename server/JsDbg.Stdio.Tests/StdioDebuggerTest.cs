using JsDbg.Stdio;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Collections.Generic;

// To run these tests, run "dotnet test" in this directory.

namespace JsDbg.Stdio.Tests
{
    [TestClass]
    public class StdioDebuggerTest
    {
        [TestMethod]
        public void TestParsePythonObjectArrayToStrings()
        {
            string[] empty = {};
            CollectionAssert.AreEqual(
                empty, StdioDebugger.ParsePythonObjectArrayToStrings("[]"),
                "Failed to parse empty array");
            string[] one = {"a#b"};
            CollectionAssert.AreEqual(
                one, StdioDebugger.ParsePythonObjectArrayToStrings("[{a#b}]"),
                "Failed to parse one-element array");
            string[] two = {"a", "b"};
            CollectionAssert.AreEqual(
                two, StdioDebugger.ParsePythonObjectArrayToStrings("[{a}, {b}]"),
                "Failed to parse two-element array");
        }
    }
}
