var Blink = null;
(function() {
    // Figure out which module to use.
    var chromeChildLoaded = false;

    Loader.OnLoadAsync(function(onComplete) {
        DbgObject.global("chrome_child", "g_frame_map")
        .then(
            function() {
                chromeChildLoaded = true;
            },
            function() {
                chromeChildLoaded = false;
            }
        )
        .finally(onComplete);
    });

    childProcessModuleName = function(moduleName) {
        if (chromeChildLoaded) {
            return "chrome_child";
        } else {
            return moduleName;
        }
    }

    childProcessType = function(moduleName, typeName) {
        return DbgObjectType(childProcessModuleName(moduleName), typeName);
    }

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
            ChildProcessModuleName: childProcessModuleName,

            _help_ChildProcessType: {
                description: "Gets a DbgObjectType in the Chromium child process.",
                arguments: [
                    {name:"moduleName", type:"string", description: "The module name."},
                    {name:"typeName", type:"string", description: "The type name."}
                ]
            },
            ChildProcessType: childProcessType,
        };

        Help.Register(Blink);
    });
})();