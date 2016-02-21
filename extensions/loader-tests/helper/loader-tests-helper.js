
window.loaderTestsHelpersRan = true;

Loader.OnLoad(function () {
    window.loaderTestsHelpersLoaded = true;
});

Loader.OnLoadAsync(function (completed) {
    window.setTimeout(function () {
        window.loaderTestsHelpersLoadedAsync = true;
        completed();
    }, 50);
})