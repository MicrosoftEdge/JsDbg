var helpersRan = window.jsdbgTestsHelpersRan;

Loader.OnLoad(function () {
    var testSuite = Tests.CreateTestSuite("JsDbg", "Tests for the core JsDbg interfaces.");

    var helpersLoadedRan = window.jsdbgTestsHelpersLoaded;
    var asyncHelpersLoadedRan = window.jsdbgTestsHelpersLoadedAsync;
    Tests.AddTest(testSuite, "Loader.OnLoad", function (assert) {
        assert(helpersRan, "Extension execution order.");
        assert(helpersLoadedRan, "OnLoad execution order.");
        assert(asyncHelpersLoadedRan, "OnLoadAsync execution order.");
    })
})