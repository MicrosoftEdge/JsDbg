var helpersRan = window.jsdbgTestsHelpersRan;

JsDbg.OnLoad(function () {
    var testSuite = Tests.CreateTestSuite("JsDbg", "Tests for the core JsDbg interfaces.");

    var helpersLoadedRan = window.jsdbgTestsHelpersLoaded;
    var asyncHelpersLoadedRan = window.jsdbgTestsHelpersLoadedAsync;
    Tests.AddTest(testSuite, "JsDbg.OnLoad", function (assert) {
        assert(helpersRan, "Extension execution order.");
        assert(helpersLoadedRan, "OnLoad execution order.");
        assert(asyncHelpersLoadedRan, "OnLoadAsync execution order.");
    })
})