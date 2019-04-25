//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// loader.js
// Loads extension dependencies as specified in extension.json files.

var Loader = undefined;
(function() {
    var loadHandlers = [];
    var readyHandlers = [];
    var isFinishedLoading = false;
    var hasLoadedAllExtensions = false;
    var pendingResourcesRemaining = 1; // Start with 1 to represent the initial dependency load.

    function fireReadyHandlers() {
        if (document.readyState != "loading") {
            isFinishedLoading = true;
            readyHandlers.forEach(function (f) { f(); })
        } else {
            document.addEventListener("DOMContentLoaded", function () {
                isFinishedLoading = true;
                readyHandlers.forEach(function (f) { f(); })
            })
        }
    }

    function extensionsFinishedLoading() {
        hasLoadedAllExtensions = true;
        if (loadHandlers.length == 0) {
            fireReadyHandlers();
        }
    }

    function getExtensions(callback) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/jsdbg-server/extensions", true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4 && xhr.status == 200) {
                callback(JSON.parse(xhr.responseText));
            }
        };
        xhr.send();
    }

    function collectIncludes(lowerExtensionName, collectedIncludes, collectedExtensions, nameMap, augmentsMap, remainingAugments) {
        if (collectedExtensions.has(lowerExtensionName)) {
            // Already collected includes.
            if (remainingAugments.has(lowerExtensionName)) {
                throw new Error("!");
            }
            return;
        } else {
            remainingAugments.delete(lowerExtensionName);
            collectedExtensions.add(lowerExtensionName);
        }

        var extension = nameMap[lowerExtensionName];
        // Load includes of any dependencies first.
        if (extension.dependencies != null) {
            extension.dependencies.forEach(function(d) {
                collectIncludes(d.toLowerCase(), collectedIncludes, collectedExtensions, nameMap, augmentsMap, remainingAugments);
            });
        }

        // Load the includes for the extension itself.
        if (extension.includes != null) {
            extension.includes.forEach(function (include) { collectedIncludes.push(lowerExtensionName + "/" + include); });
        }

        // Record any unloaded augmenters.
        if (lowerExtensionName in augmentsMap) {
            augmentsMap[lowerExtensionName].forEach(function (augmenter) {
                if (!collectedExtensions.has(augmenter)) {
                    remainingAugments.add(augmenter);
                }
            })
        }
    }

    function addPendingResource() {
        if (pendingResourcesRemaining == 0) {
            throw new Error("Tried to add a pending resource after all resources were loaded.");
        }
        ++pendingResourcesRemaining;
    }

    function pendingResourceFinished() {
        if (--pendingResourcesRemaining == 0) {
            extensionsFinishedLoading();
        }
    }

    function insertScript(filename) {
        var script = document.createElement("script");
        script.async = false;
        script.src = "/" + filename;
        script.type = "text/javascript";
        addPendingResource();
        script.addEventListener("load", pendingResourceFinished);
        document.querySelector("head").appendChild(script);
    }

    function insertCSS(filename) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = "/" + filename;
        document.querySelector("head").appendChild(link);
    }

    Loader = {
        _help: {
            name:"Loader",
            description: "Client-side extension loading."
        },

        _help_GetCurrentExtension: {
            description: "Returns the name of the current extension."
        },
        GetCurrentExtension: function() {
            var components = window.location.pathname.split('/');
            if (components.length > 1 && components[1].length > 0) {
                return components[1].toLowerCase();
            } else {
                return "wwwroot";
            }
        },

        _help_OnLoad: {
            description: "Enqueues a function to run after all dependencies have been fully loaded.",
            arguments: [{name:"onload", type:"function()", description: "The event handler."}]
        },
        OnLoad: function (onload) {
            Loader.OnLoadAsync(function (completed) {
                onload();
                completed();
            });
        },

        _help_OnLoadAsync: {
            description: "Enqueues an async function to run after all dependencies have been full loaded.  Used by extensions that require asynchronous initialization.",
            arguments: [{name:"onload", type:"function(function())", description: "The event handler.  The first argument is a callback to indicate completion."}]
        },
        OnLoadAsync: function (onload) {
            if (isFinishedLoading) {
                throw new Error("You may not add a load handler after the page has finished loading.");
            }

            function processNextLoadHandler() {
                loadHandlers.shift();
                if (loadHandlers.length > 0) {
                    loadHandlers[0](processNextLoadHandler);
                } else if (hasLoadedAllExtensions) {
                    fireReadyHandlers();
                }
            }

            loadHandlers.push(function(completed) {
                try {
                    onload(completed);
                } catch (ex) {
                    console.log("OnLoad handler threw an exception: " + ex);
                    completed();
                }
            });

            // If it's the only onload handler, fire it immediately.
            if (loadHandlers.length == 1) {
                loadHandlers[0](processNextLoadHandler);
            }
        },

        _help_OnPageReady: {
            description: "Enqueues a function to run after all extension have been loaded and the DOMContentLoaded event has fired.",
            arguments: [{name:"onready", type:"function()", description: "The event handler."}]
        },
        OnPageReady: function (onready) {
            if (isFinishedLoading) {
                throw new Error("You may not add a ready handler after the page has finished loading.");
            }
            readyHandlers.push(function() {
                try {
                    onready();
                } catch (ex) {
                    console.log("OnPageReady handler threw an exception: " + ex);
                }
            });
        }
    }

    // Load the dependencies.
    getExtensions(function(result) {
        var extensions = result.extensions; 

        var nameMap = {};
        extensions.forEach(function(e) { nameMap[e.name.toLowerCase()] = e; });

        // Build a mapping of augmented -> augmenters.
        var augmentsMap = {};
        extensions.forEach(function (e) {
            if (e.augments && Array.isArray(e.augments)) {
                e.augments.forEach(function (augmented) {
                    augmented = augmented.toLowerCase();
                    if (!(augmented in augmentsMap)) {
                        augmentsMap[augmented] = [];
                    }
                    augmentsMap[augmented].push(e.name.toLowerCase());
                });
            }
        })

        // Load all the dependencies for the current extension.
        var currentExtension = Loader.GetCurrentExtension();
        if (currentExtension != null) {
            var includes = [];
            var collectedExtensions = new Set();
            var remainingAugments = new Set();
            collectIncludes(currentExtension, includes, collectedExtensions, nameMap, augmentsMap, remainingAugments);

            while (remainingAugments.size > 0) {
                var toLoad = [];
                remainingAugments.forEach(function (ext) { toLoad.push(ext); });
                toLoad.forEach(function (ext) {
                    collectIncludes(ext, includes, collectedExtensions, nameMap, augmentsMap, remainingAugments);
                })
            }

            // Insert the CSS files first to avoid the flash of unstyled content as much as possible.
            var cssFiles = includes.filter(function (file) { return file.match(/\.css$/); });
            var jsFiles = includes.filter(function (file) { return file.match(/\.js$/); });
            cssFiles.forEach(insertCSS);
            jsFiles.forEach(insertScript);
        }

        pendingResourceFinished();
    });

    Loader.OnPageReady(function () {
        if (typeof(Help) !== typeof(undefined)) {
            Help.Register(Loader);
        }
    })
})();