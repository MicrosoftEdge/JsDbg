
window.jsdbgTestsHelpersRan = true;

Loader.OnLoad(function () {
    window.jsdbgTestsHelpersLoaded = true;
});

Loader.OnLoadAsync(function (completed) {
    window.setTimeout(function () {
        window.jsdbgTestsHelpersLoadedAsync = true;
        completed();
    }, 50);
})