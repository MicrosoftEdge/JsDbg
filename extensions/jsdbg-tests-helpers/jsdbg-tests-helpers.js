
window.jsdbgTestsHelpersRan = true;

JsDbg.OnLoad(function () {
    window.jsdbgTestsHelpersLoaded = true;
});

JsDbg.OnLoadAsync(function (completed) {
    window.setTimeout(function () {
        window.jsdbgTestsHelpersLoadedAsync = true;
        completed();
    }, 50);
})