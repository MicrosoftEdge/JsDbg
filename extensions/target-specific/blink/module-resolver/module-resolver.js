var Blink = null;
(function() {
    // Figure out which module to use.
    var isContentModuleLoaded = false;

    Loader.OnLoadAsync(function(onComplete) {
        DbgObject.global("content", "g_frame_map")
        .then(() => {
            isContentModuleLoaded = true;
        })
        .finally(onComplete);
    });

    Loader.OnLoad(function() {
        Blink = {
            _help : {
                name: "Blink",
                description: "Blink-specific functionality."
            },

            _help_ChildProcessModuleName: {
                description: "Gets the module name in the Chromium child process.",
                arguments: [
                    {name:"moduleName", type:"string", description: "The module name."},
                ]
            },
            ChildProcessModuleName: (moduleName) => isContentModuleLoaded ? moduleName : "chrome_child",

            _help_ChildProcessType: {
                description: "Gets a DbgObjectType in the Chromium child process.",
                arguments: [
                    {name:"moduleName", type:"string", description: "The module name."},
                    {name:"typeName", type:"string", description: "The type name."}
                ]
            },
            ChildProcessType: (moduleName, typeName) => DbgObjectType(Blink.ChildProcessModuleName(moduleName), typeName),

            _help_BrowserProcessModuleName: {
                description: "Gets the module name in the Chromium browser process.",
                arguments: [
                    {name:"moduleName", type:"string", description: "The module name."},
                ]
            },
            BrowserProcessModuleName: (moduleName) => isContentModuleLoaded ? moduleName : "chrome",

            _help_BrowserProcessType: {
                description: "Gets a DbgObjectType in the Chromium browser process.",
                arguments: [
                    {name:"moduleName", type:"string", description: "The module name."},
                    {name:"typeName", type:"string", description: "The type name."}
                ]
            },
            BrowserProcessType: (moduleName, typeName) => DbgObjectType(Blink.BrowserProcessModuleName(moduleName), typeName),
        };

        Help.Register(Blink);
    });
})();