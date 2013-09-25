"use strict";


var ExtensionLoader = (function() {

    var LocalStorageKey = "JsDbg.ExtensionLoader.Extensions";
    var loadedExtensions = [];
    var isInitialized = false;

    function serialize() {
        var paths = loadedExtensions.map(function(e) { return e.path; });
        window.localStorage.setItem(LocalStorageKey, JSON.stringify(paths));
    }

    return {
        Initialize: function(callback) {
            var extensionsToLoadString = window.localStorage.getItem(LocalStorageKey);
            var counter = 1;
            var extensionLoadCallback = function() {
                if (--counter == 0) {
                    isInitialized = true;
                    callback(loadedExtensions);
                }
            };

            if (extensionsToLoadString) {
                try {
                    var extensionsToLoadArray = JSON.parse(extensionsToLoadString);
                } catch (ex) {}

                if (extensionsToLoadArray && extensionsToLoadArray.length) {
                    counter += extensionsToLoadArray.length;
                    for (var i = 0; i < extensionsToLoadArray.length; ++i) {
                        ExtensionLoader.Add(extensionsToLoadArray[i], extensionLoadCallback, extensionLoadCallback);
                    }
                }
            }

            extensionLoadCallback();
        },
        Add: function(path, callback, error) {
            var shouldSave = isInitialized;
            JsDbg.LoadExtension(path, function(extension) {
                if (extension.error) {
                    console.log("Error loading extension at " + path + " : " + extension.error);
                    if (error) {
                        error(extension.error);
                    }
                    return;
                }

                extension.path = path;
                loadedExtensions.push(extension);

                if (shouldSave) {
                    serialize();
                }

                if (callback) {
                    callback(extension);
                }
            });
        },
        Remove: function(name, callback, error) {
            JsDbg.UnloadExtension(name, function(result) {
                if (result.success) {
                    loadedExtensions = loadedExtensions.filter(function(e) { return e.name != name; });
                    serialize();
                    
                    if (callback) {
                        callback();
                    }
                } else {
                    console.log("Error unloading extension \"" + name + "\": " + result.error);
                    if (error) {
                        error(result.error);
                    }
                }
            });
        }
    }
})();