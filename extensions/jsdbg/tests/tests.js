//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

var helpersRan = window.loaderTestsHelpersRan;

Loader.OnLoad(function () {
    var testSuite = Tests.CreateTestSuite("Loader", "Tests for the client-side extension loader.");

    var helpersLoadedRan = window.loaderTestsHelpersLoaded;
    var asyncHelpersLoadedRan = window.loaderTestsHelpersLoadedAsync;
    Tests.AddTest(testSuite, "Loader.OnLoad", function (assert) {
        assert(helpersRan, "Extension execution order.");
        assert(helpersLoadedRan, "OnLoad execution order.");
        assert(asyncHelpersLoadedRan, "OnLoadAsync execution order.");
    })
})