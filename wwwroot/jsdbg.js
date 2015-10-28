"use strict";

// jsdbg.js
// Peter Salas
//
// An interface for communicating with a windbg session via the jsdbg server.

var JsDbg = (function() {

    // WebSocket support.
    var browserSupportsWebSockets = (window.WebSocket !== undefined);
    var currentWebSocket = null;
    var currentWebSocketCallbacks = {};
    var remainingAllowableWebSocketRequests = 30; // Throttle the WebSocket requests to avoid overwhelming the connection.
    var pendingWebSocketMessages = []; // WebSocket requests that have not yet been sent due to throttling.
    var debuggerBrokeListeners = [];

    var CacheType = {
        Uncached:         0, // The resource is not cached.
        Cached:           1, // The resource is cached until the page is refreshed.
        TransientCache:   2  // The resource is cached until the debugger breaks in again.
    };

    // Certain types of requests are cacheable -- this maintains that cache.
    var responseCache = {};
    var transientCache = browserSupportsWebSockets ? {} : null;

    // If we make a cacheable request and there are already outstanding requests for that resource,
    // piggyback onto the existing request.  This maintains a list of piggybacked requests.
    var pendingCachedRequests = {};

    // A counter of the total number of requests made to the server.
    var requestCounter = 0;

    // Extension load handlers
    var loadHandlers = [];
    var readyHandlers = [];
    var isFinishedLoading = false;
    var hasLoadedAllExtensions = false;

    // Progress indicator support.
    var waitingForDebugger = false;
    var loadingIndicator = null;
    var pendingAsynchronousRequests = 0;

    function initializeProgressIndicator() {
        loadingIndicator = document.createElement("div")
        loadingIndicator.setAttribute("id", "jsdbg-loading-indicator");

        var loadingPanel = document.createElement("div");
        loadingPanel.classList.add("jsdbg-loading-panel");

        loadingIndicator.appendChild(loadingPanel);

        var progress = document.createElement("progress");
        progress.indeterminate = true;
        loadingPanel.appendChild(progress);
        document.addEventListener("DOMContentLoaded", function() {
            document.body.appendChild(loadingIndicator);
        });
    }

    function requestStarted() {
        ++pendingAsynchronousRequests;
        if (pendingAsynchronousRequests == 1) {
            // If we get blocked waiting for something, we'll be notified.
            loadingIndicator.classList.remove("waiting");
            loadingIndicator.style.display = "block";
        }
    }

    function requestEnded() {
        if (--pendingAsynchronousRequests == 0) {
            loadingIndicator.style.display = "none";
        }
    }

    function splitFirstN(str, sep, limit) {
        var stringParts = [];
        while (limit > 1) {
            var index = str.indexOf(sep);
            if (index == -1) {
                break;
            }

            stringParts.push(str.substr(0, index));
            str = str.substr(index + 1);
            --limit;
        }
        stringParts.push(str);
        return stringParts;
    }

    function handleWebSocketReply(webSocketMessage) {
        // Check if it's a server-initiated break-in event.
        if (webSocketMessage.data == "break") {
            loadingIndicator.classList.remove("waiting");

            // Invalidate the transient cache.  This should probably be invalidated on "run" instead.
            transientCache = {};

            debuggerBrokeListeners.forEach(function (f) { f(webSocketMessage.data); });
            return;
        } else if (webSocketMessage.data == "waiting") {
            loadingIndicator.classList.add("waiting");
            return;
        }

        var result = null;
        try {
            var parts = splitFirstN(webSocketMessage.data, ";", 3);
            if (parts.length != 3) {
                throw "Got an unexpected response from the server: " + webSocketMessage.data;
            }
            var responseId = parts[0];
            if (parts[1] != "200") {
                throw "JsDbg server failed with response (" + webSocketMessage.data + ")";
            }
            result = parts[2];
        } catch (error) {
            result = JSON.stringify({ error: error });
        } finally {
            if (!(responseId in currentWebSocketCallbacks)) {
                throw "No registered callback for message id " + responseId;
            } else {
                // Fire the callback and remove it from the registry.
                currentWebSocketCallbacks[responseId].callback(result);
                delete currentWebSocketCallbacks[responseId];
                ++remainingAllowableWebSocketRequests;

                if (pendingWebSocketMessages.length > 0) {
                    pendingWebSocketMessages[0]();
                    pendingWebSocketMessages = pendingWebSocketMessages.slice(1);
                }
            }
        }
    }

    function sendWebSocketMessage(requestId, messageToSend, callback) {
        var retryWebSocketRequest = function retryWebSocketRequest() { sendWebSocketMessage(requestId, messageToSend, callback); }
        if (currentWebSocket == null || (currentWebSocket.readyState > WebSocket.OPEN)) {
            currentWebSocket = new WebSocket("ws://" + window.location.host);
            currentWebSocket.addEventListener("message", handleWebSocketReply);

            currentWebSocket.addEventListener("close", function jsdbgWebSocketCloseHandler() {
                currentWebSocket = null;
                console.log("JsDbg web socket was closed...retrying in-flight requests.");

                // Retry the in-flight messages.
                var oldCallbacks = currentWebSocketCallbacks;
                currentWebSocketCallbacks = {};
                for (var key in oldCallbacks) {
                    var value = oldCallbacks[key];
                    sendWebSocketMessage(key, value.messageToSend, value.callback);
                }
            })
        }

        if (currentWebSocket.readyState < WebSocket.OPEN) {
            currentWebSocket.addEventListener("open", retryWebSocketRequest);
        } else if (currentWebSocket.readyState == WebSocket.OPEN) {
            if (remainingAllowableWebSocketRequests > 0) {
                --remainingAllowableWebSocketRequests;
                currentWebSocketCallbacks[requestId.toString()] = {
                    callback: callback,
                    messageToSend: messageToSend
                };
                currentWebSocket.send(requestId + ";" + messageToSend);
            } else {
                pendingWebSocketMessages.push(retryWebSocketRequest);
            }
        }
    }

    function jsonRequest(url, originalCallback, cacheType, method, data) {
        var callback = function(result) {
            try {
                originalCallback(result)
            } catch (error) {

            }
        };

        // If the transient cache isn't supported, downgrade to uncached.
        if (cacheType == CacheType.TransientCache && transientCache == null) {
            cacheType = CacheType.Uncached;
        }

        if (cacheType == CacheType.Cached && url in responseCache) {
            callback(responseCache[url]);
            return;
        } else if (cacheType == CacheType.TransientCache && url in transientCache) {
            var transientCacheResult = transientCache[url];
            callback(transientCacheResult);
            return;
        } else if (cacheType != CacheType.Uncached) {
            if (url in pendingCachedRequests) {
                pendingCachedRequests[url].push(callback);
                return;
            } else {
                pendingCachedRequests[url] = [];
            }
        }

        ++requestCounter;

        requestStarted();

        function handleJsonResponse(jsonText) {
            try {
                var result = JSON.parse(jsonText);
            } catch (exception) {
                result = {
                    error: "Failed to parse JSON reponse: " + jsonText
                };
            }
            var otherCallbacks = [];
            if (cacheType != CacheType.Uncached) {
                otherCallbacks = pendingCachedRequests[url];
                delete pendingCachedRequests[url];

                if (cacheType == CacheType.Cached) {
                    responseCache[url] = result;
                } else if (cacheType == CacheType.TransientCache) {
                    transientCache[url] = result;
                }
            }
            callback(result);
            otherCallbacks.forEach(function fireBatchedJsDbgCallback(f) { f(result); });
            requestEnded();
        }

        if (browserSupportsWebSockets && !method && !data) {
            // Use WebSockets if the request is async, the method is unspecified, and there's no data payload.
            sendWebSocketMessage(requestCounter, url, handleJsonResponse);
        } else {
            // Use XHR.
            if (!method) {
                method = "GET";
            }

            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    handleJsonResponse(xhr.responseText);
                }
            };
            xhr.send(data);
        }
    }

    function esc(s) { return encodeURIComponent(s); }

    var sizeNames = {
        1 : "sbyte",
        2 : "short",
        4 : "int",
        8 : "long"
    };
    var unsignedNames = {
        1 : "byte",
        2 : "ushort",
        4 : "uint",
        8 : "ulong"
    };
    var floatSizeNames = {
        4 : "float",
        8 : "double"
    };

    function getSizeName(size, isUnsigned, isFloat) {
        var sizeIndex = isFloat ? floatSizeNames : isUnsigned ? unsignedNames : sizeNames;
        if (size in sizeIndex) {
            return sizeIndex[size];
        } else {
            return null;
        }
    }

    function readJsonFloat(val) {
        if (val === "Infinity") {
            return Infinity;
        } else if (val === "-Infinity") {
            return -Infinity;
        } else if (val === "NaN") {
            return NaN;
        } else {
            return val;
        }
    }

    function updateExtensionList() {
        var content = document.querySelector(".jsdbg-extensions-pane-content");
        content.innerHTML = "";

        JsDbg.GetExtensions(function (extensions) {
            var currentExtension = JsDbg.GetCurrentExtension();
            extensions = extensions.extensions.filter(function (e) { 
                if (e.name.toLowerCase() == currentExtension) {
                    document.querySelector(".jsdbg-title").textContent = e.name;
                    return false;
                } else {
                    return !e.headless;
                }
            });
            extensions.sort(function (e1, e2) { return e1.name.localeCompare(e2.name); });

            extensions.forEach(function (e) {
                var link = document.createElement("a");
                link.setAttribute("href", "/" + e.name.toLowerCase());

                var name = document.createElement("span");
                name.classList.add("jsdbg-extension-name");
                name.appendChild(document.createTextNode(e.name));
                link.appendChild(name);

                if (e.description != null) {
                    var description = document.createElement("span");
                    description.classList.add("jsdbg-extension-description");
                    description.appendChild(document.createTextNode(" " + e.description));
                    link.appendChild(description);
                }
                content.appendChild(link);
                content.appendChild(document.createTextNode(" "));
            });

            // Configure the drop-down pane so that it has the proper height.
            document.querySelector(".jsdbg-toolbar").style.display = "";
            content.parentNode.style.height = content.offsetHeight + "px";
        });
    }

    var queuedExtensionListUpdates = 0;
    function queueExtensionListUpdate() {
        setTimeout(function () {
            if (--queuedExtensionListUpdates == 0) {
                updateExtensionList();
            }
        }, 200);
        ++queuedExtensionListUpdates;
    }

    function buildToolbar() {
        // Insert the toolbar.
        var toolbar = document.createElement("div");
        toolbar.classList.add("jsdbg-toolbar");
        toolbar.style.display = "none";

        var title = document.createElement("div");
        title.classList.add("jsdbg-title");
        title.textContent = "JsDbg";
        toolbar.appendChild(title);
        toolbar.appendChild(document.createTextNode(" "));

        var extensions = document.createElement("div");
        extensions.classList.add("jsdbg-extensions-list");

        var extensionsPane = document.createElement("div");
        extensionsPane.classList.add("jsdbg-extensions-pane");

        var paneContent = document.createElement("div");
        paneContent.classList.add("jsdbg-extensions-pane-content");
        extensionsPane.appendChild(paneContent);

        extensions.appendChild(document.createTextNode("Other Extensions \u25BE"));
        extensions.appendChild(extensionsPane);
        toolbar.appendChild(extensions);

        var feedback = document.createElement("div");
        feedback.classList.add("jsdbg-feedback-container");

        var feedbackLink = document.createElement("a");
        feedbackLink.setAttribute("href", "#feedback");
        feedbackLink.appendChild(document.createTextNode("Send Feedback"));
        feedbackLink.addEventListener("click", function (e) {
            e.preventDefault();
            feedback.classList.toggle("showing-pane");
            feedbackPane.querySelector("textarea").focus();
        })
        feedback.appendChild(feedbackLink);

        var feedbackPane = document.createElement("div");
        feedbackPane.classList.add("jsdbg-feedback-pane");
        feedbackPane.innerHTML = "<textarea placeholder=\"Please report any bugs, suggestions, or other feedback here.\"></textarea><br><button>Send Feedback</submit>";

        feedbackPane.querySelector("button").addEventListener("click", function() {
            var feedbackMessage = feedbackPane.querySelector("textarea").value.trim();
            if (feedbackMessage.length > 0) {
                JsDbg.SendFeedback(feedbackMessage, function (result) {
                    if (result.success) {
                        feedbackPane.querySelector("textarea").value = "";
                        feedback.classList.toggle("showing-pane");
                        feedbackLink.textContent = "Thank you for your feedback!";
                        setTimeout(function () {
                            feedbackLink.textContent = "Send Feedback";
                        }, 3000);
                    } else {
                        alert(result.error);
                    }
                })
            } else {
                feedback.classList.toggle("showing-pane");
            }
        })
        feedback.appendChild(feedbackPane);

        toolbar.appendChild(feedback);

        document.documentElement.insertBefore(toolbar, document.documentElement.firstChild);
        
        updateExtensionList();
    }

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

    function loadDependencies() {
        function collectIncludes(lowerExtensionName, collectedIncludes, collectedExtensions, nameMap) {
            if (lowerExtensionName in collectedExtensions) {
                // Already collected includes.
                return;
            }

            var extension = nameMap[lowerExtensionName];
            if (extension.dependencies != null) {
                extension.dependencies.forEach(function(d) {
                    collectIncludes(d.toLowerCase(), collectedIncludes, collectedExtensions, nameMap);
                });
            }

            if (extension.includes != null) {
                extension.includes.forEach(function (include) { collectedIncludes.push(lowerExtensionName + "/" + include); });
            }

            collectedExtensions[lowerExtensionName] = true;
        }

        var pendingResourcesRemaining = 1;
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
            script.src = filename;
            script.type = "text/javascript";
            addPendingResource();
            script.addEventListener("load", pendingResourceFinished);
            document.querySelector("head").appendChild(script);
        }

        function insertCSS(filename) {
            var link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.href = filename;
            document.querySelector("head").appendChild(link);
        }

        // jsdbg.js requires biginteger.js.
        insertScript("/biginteger.js");
        
        // Include the common css file.
        insertCSS("/common.css");

        JsDbg.GetExtensions(function(result) { 
            var extensions = result.extensions; 

            var nameMap = {};
            extensions.forEach(function(e) { nameMap[e.name.toLowerCase()] = e; });

            // Find the current extension.
            var currentExtension = JsDbg.GetCurrentExtension();
            if (currentExtension != null) {
                var includes = [];
                var collectedExtensions = {};
                collectIncludes(currentExtension, includes, collectedExtensions, nameMap);

                // Find any extensions that augment any loaded extensions.
                extensions.forEach(function(e) {
                    if (e.augments && e.augments.length > 0) {
                        for (var i = 0; i < e.augments.length; ++i) {
                            if (e.augments[i].toLowerCase() in collectedExtensions) {
                                collectIncludes(e.name.toLowerCase(), includes, collectedExtensions, nameMap);
                            }
                        }
                    }
                });

                includes.forEach(function(file) {
                    if (file.match(/\.js$/)) {
                        insertScript("/" + file);
                    } else if (file.match(/\.css$/)) {
                        insertCSS("/" + file);
                    } else {
                        console.log("Unknown dependency type: " + file);
                    }
                });
            }

            pendingResourceFinished();
        });
    }

    var JsDbg = {
        _help: {
            name:"JsDbg",
            description: "JsDbg core interfaces.",
            notes: "<p>NOTE: These APIs are designed for minimalism rather than usability; extensions like DbgObject or Catalog should generally be used instead.</p>"
        },

        _help_GetNumberOfRequests: {
            description: "Returns the number of JsDbg requests sent to the server.",
            returns: "An integer."
        },
        GetNumberOfRequests: function() {
            return requestCounter;
        },

        GetCurrentExtension: function() {
            var components = window.location.pathname.split('/');
            if (components.length > 1 && components[1].length > 0) {
                return components[1].toLowerCase();
            }
            return null;
        },

        _help_OnLoad: {
            description: "Enqueues a function to run after all dependencies have been fully loaded.",
            arguments: [{name:"onload", type:"function()", description: "The event handler."}]
        },
        OnLoad: function (onload) {
            JsDbg.OnLoadAsync(function (completed) {
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

            loadHandlers.push(onload);
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
            readyHandlers.push(onready);
        },

        _help_LoadExtension: {
            description: "Load an extension at a given path.",
            arguments: [
                {name:"path", type:"string", description:"The path of the extension to load.  Relative paths are relative to the extensions directory."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LoadExtension: function(path, callback) {
            jsonRequest("/jsdbg/loadextension?path=" + esc(path), function (result) {
                queueExtensionListUpdate();
                callback(result);
            }, CacheType.Uncached);
        },

        _help_UnloadExtension: {
            description: "Unloads an extension identified by name.",
            arguments: [
                {name:"name", type:"string", description:"The name of the extension to unload."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        UnloadExtension: function(name, callback) {
            jsonRequest("/jsdbg/unloadextension?name=" + esc(name), function (result) {
                queueExtensionListUpdate();
                callback(result);
            }, CacheType.Uncached);
        },

        _help_GetExtensions: {
            description: "Gets all loaded extensions.",
            arguments: [
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        GetExtensions: function(callback) {
            jsonRequest("/jsdbg/extensions", callback, CacheType.Uncached);
        },

        _help_GetExtensionPath: {
            description: "Gets the default extension path.",
            arguments: [
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        GetExtensionPath: function(callback) {
            jsonRequest("/jsdbg/extensionpath", callback, CacheType.Uncached, "GET");
        },

        _help_SetExtensionPath: {
            description: "Sets the default extension path, unloads extensions from the previous path and loads the \"default\" extension from the new path.",
            arguments: [
                {name:"path", type:"string", description:"The new extension path."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        SetExtensionPath: function(path, callback) {
            jsonRequest("/jsdbg/extensionpath", callback, CacheType.Uncached, "PUT", path);
        },

        _help_LookupTypeSize: {
            description: "Looks up the size of the type.",
            arguments: [
                {name:"module", type:"string", description:"The module of the type."},
                {name:"type", type:"string", description:"The type."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupTypeSize: function(module, type, callback) {
            jsonRequest("/jsdbg/typesize?module=" + esc(module) + "&type=" + esc(type), callback, CacheType.Cached);
        },

        _help_LookupFieldOffset: {
            description: "Looks up the type, offset, and size of a field in a given type.",
            arguments: [
                {name:"module", type:"string", description:"The module of the type."},
                {name:"type", type:"string", description:"The type."},
                {name:"field", type:"string", description:"The name of the field to lookup."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupFieldOffset: function(module, type, field, callback) {
            jsonRequest("/jsdbg/fieldoffset?module=" + esc(module) + "&type=" + esc(type) + "&field=" + esc(field), callback, CacheType.Cached);
        },

        _help_LookupFields: {
            description: "Gets all the fields available within a given type.",
            arguments: [
                {name:"module", type:"string", description:"The module of the type."},
                {name:"type", type:"string", description:"The type."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupFields: function(module, type, callback) {
            jsonRequest("/jsdbg/typefields?module=" + esc(module) + "&type=" + esc(type), callback, CacheType.Cached);
        },

        _help_LookupBaseTypes: {
            description: "Looks up the names and offsets of the base types of a type.",
            arguments: [
                {name:"module", type:"string", description:"The module of the type."},
                {name:"type", type:"string", description:"The type."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupBaseTypes: function(module, type, callback) {
            jsonRequest("/jsdbg/basetypes?module=" + esc(module) + "&type=" + esc(type), callback, CacheType.Cached);
        },

        _help_ReadNumber: {
            description: "Reads a number value from memory.",
            arguments: [
                {name:"pointer", type:"integer", description:"The pointer to the number."},
                {name:"size", type:"integer", description:"The size of the number."},
                {name:"isUnsigned", type:"bool", description:"A value that indicates if the number is unsigned."},
                {name:"isFloat", type:"bool", description:"A value that indicates if the number is a floating point number."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        ReadNumber: function(pointer, size, isUnsigned, isFloat, callback) {
            var sizeName = getSizeName(size, isUnsigned, isFloat);
            if (sizeName == null) {
                callback({ "error": "Invalid number size." });
                return;
            }

            if (isFloat) {
                var originalCallback = callback;
                callback = function(result) {
                    if (typeof(result.value) != typeof(undefined)) {
                        result = {value: readJsonFloat(result.value)};
                    }
                    originalCallback(result);
                }
            } else {
                // Make it a bigInt.
                var originalCallback = callback;
                callback = function(result) {
                    if (typeof(result.value) != typeof(undefined)) {
                        result = {value: bigInt(result.value) };
                    }
                    originalCallback(result);
                };
            }

            jsonRequest("/jsdbg/memory?type=" + esc(sizeName) + "&pointer=" + esc(pointer), callback, CacheType.TransientCache);
        },

        _help_ReadArray: {
            description: "Reads an array of number values from memory.",
            arguments: [
                {name:"pointer", type:"integer", description:"The pointer to the first number."},
                {name:"size", type:"integer", description:"The size of each number."},
                {name:"isUnsigned", type:"bool", description:"A value that indicates if the numbers are unsigned."},
                {name:"isFloat", type:"bool", description:"A value that indicates if the numbers are floating point numbers."},
                {name:"count", type:"integer", description:"The count of numbers to read."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        ReadArray: function(pointer, itemSize, isUnsigned, isFloat, count, callback) {
            var sizeName = getSizeName(itemSize, isUnsigned, isFloat);
            if (sizeName == null) {
                callback({ "error": "Invalid number size." });
                return;
            }

            if (isFloat) {
                var originalCallback = callback;
                callback = function(result) {
                    if (typeof(result.array) != typeof(undefined)) {
                        result = {array: result.array.map(readJsonFloat) };
                    }
                    originalCallback(result);
                }
            } else {
                // Make the numbers bigInts.
                var originalCallback = callback;
                callback = function(result) {
                    if (typeof(result.array) != typeof(undefined)) {
                        result = {array: result.array.map(function (n) { return bigInt(n); }) };
                    }
                    originalCallback(result);
                };
            }

            jsonRequest("/jsdbg/array?type=" + esc(sizeName) + "&pointer=" + esc(pointer) + "&length=" + count, callback, CacheType.TransientCache);
        },

        _help_LookupSymbolName: {
            description: "Identifies a symbol associated with a given pointer (e.g. vtable pointer).",
            arguments: [
                {name:"pointer", type:"integer", description:"The pointer to the first number."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupSymbolName: function(pointer, callback) {
            jsonRequest("/jsdbg/symbolname?pointer=" + esc(pointer), callback, CacheType.TransientCache);
        },

        _help_IsTypeEnum: {
            description: "Indicates if a given type is an enum.",
            arguments: [
                {name: "module", type:"string", description: "The module of the type."},
                {name: "type", type:"string", description: "The type."},
                {name: "callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        IsTypeEnum: function(module, type, callback) {
            jsonRequest("/jsdbg/isenum?module=" + esc(module) + "&type=" + esc(type), callback, CacheType.Cached);
        },

        
        _help_LookupConstantName: {
            description: "Looks up the name of a given constant (i.e. an enum value).",
            arguments: [
                {name:"module", type:"string", description:"The module of the type."},
                {name:"type", type:"string", description:"The type."},
                {name:"constant", type:"integer", description:"The constant."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupConstantName: function(module, type, constant, callback) {
            jsonRequest("/jsdbg/constantname?module=" + esc(module) + "&type=" + esc(type) + "&constant=" + esc(constant), callback, CacheType.Cached);
        },

        _help_LookupConstantValue: {
            description: "Looks up the value of a given constant (i.e. an enum value).",
            arguments: [
                {name:"module", type:"string", description:"The module of the enum type."},
                {name:"type", type:"string", description:"The enum type."},
                {name:"constantName", type:"string", description:"The constant name (i.e. enum name)."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupConstantValue: function(module, type, constantName, callback) {
            jsonRequest("/jsdbg/constantvalue?module=" + esc(module) + "&type=" + esc(type) + "&name=" + esc(constantName), callback, CacheType.Cached);
        },

        _help_LookupGlobalSymbol: {
            description: "Evaluates a global symbol and returns the type and address of the value.",
            arguments: [
                {name:"module", type:"string", description:"The module containing the symbol."},
                {name:"symbol", type:"string", description:"The symbol to evaluate."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupGlobalSymbol: function(module, symbol, callback) {
            jsonRequest("/jsdbg/global?module=" + esc(module) + "&symbol=" + esc(symbol), callback, CacheType.Cached);
        },

        _help_LookupLocalSymbols: {
            description: "Evaluates a local symbolic expression and returns the type of and pointer to the each value on the stack.",
            arguments: [
                {name:"module", type:"string", description:"The module containing the method."},
                {name:"method", type:"string", description:"The method whose local symbol should be retrieved."},
                {name:"symbol", type:"string", description:"The symbolic expression to evaluate."},
                {name:"maxCount", type:"int", description:"The maximum number of stack frames to collect from."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupLocalSymbols: function(module, method, symbol, maxCount, callback) {
            jsonRequest("/jsdbg/localsymbols?module=" + esc(module) + "&method=" + esc(method) + "&symbol=" + esc(symbol) + "&maxCount=" + esc(maxCount), callback, CacheType.TransientCache);
        },

        _help_GetPersistentData: {
            description: "Gets the persistent data associated with the current user or a specified user.",
            arguments: [
                {name:"user", type:"string", description:"(optional) The user whose data should be retrieved."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        GetPersistentData: function(user, callback) {
            jsonRequest("/jsdbg/persistentstorage" + (user ? "?user=" + esc(user) : ""), callback, CacheType.Uncached, "GET");
        },

        _help_SetPersistentData: {
            description: "Saves the persistent data associated with the current user.",
            arguments: [
                {name:"data", type:"object", description:"The object to save."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        SetPersistentData: function(data, callback) {
            var value = JSON.stringify(data);
            jsonRequest("/jsdbg/persistentstorage", callback, CacheType.Uncached, "PUT", value);
        },

        _help_GetPersistentDataUsers: {
            description: "Gets a collection of users with persistent data stored.",
            arguments: [
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        GetPersistentDataUsers: function(callback) {
            jsonRequest("/jsdbg/persistentstorageusers", callback, CacheType.Uncached);
        },

        _help_SendFeedback: {
            description: "Sends feedback for JsDbg.",
            arguments: [
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        SendFeedback: function (message, callback) {
            // Include some diagnostics data as well.
            var feedbackObject = {
                userAgent: window.navigator.userAgent,
                extension: JsDbg.GetCurrentExtension(),
                message: message
            };

            jsonRequest("/jsdbg/feedback", callback, CacheType.Uncached, "PUT", JSON.stringify(feedbackObject, null, '  '));
        },

        _help_RegisterOnBreakListener: {
            description: "Registers a callback to be fired when the debugger breaks in.",
            returns: "A value indicating if break events can be fired.",
            arguments: [
                {name: "callback", type:"function()", description:"A callback that is called when the debugger breaks in to the target."}
            ]
        },
        RegisterOnBreakListener: function(callback) {
            if (browserSupportsWebSockets) {
                debuggerBrokeListeners.push(callback);
                return true;
            } else {
                return false;
            }
        }
    }

    initializeProgressIndicator();
    JsDbg.OnPageReady(buildToolbar);

    // Load any dependencies if requested.
    var scriptTags = document.querySelectorAll("script");
    var shouldLoadDependencies = false;
    for (var i = 0; i < scriptTags.length; ++i) {
        var tag = scriptTags[i];
        if (tag.getAttribute("src").indexOf("/jsdbg.js") != -1) {
            if (tag.getAttribute("data-include-dependencies") != null) {
                shouldLoadDependencies = true;
                break;
            }
        }
    }

    if (shouldLoadDependencies) {
        loadDependencies();
    }

    return JsDbg;
})();