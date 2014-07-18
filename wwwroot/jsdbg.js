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

    // Big hammer - makes every request synchronous.
    var everythingIsSynchronous = false;

    // Progress indicator support.
    var loadingIndicator = null;
    var pendingAsynchronousRequests = 0;

    function initializeProgressIndicator() {
        loadingIndicator = document.createElement("div")
        loadingIndicator.setAttribute("id", "jsdbg-loading-indicator");
        var progress = document.createElement("progress");
        progress.indeterminate = true;
        loadingIndicator.appendChild(progress);
        document.addEventListener("DOMContentLoaded", function() {
            document.body.appendChild(loadingIndicator);
        });
    }

    function requestStarted() {
        ++pendingAsynchronousRequests;
        loadingIndicator.style.display = "block";
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

    function sendWebSocketMessage(requestId, messageToSend, callback) {
        requestId = requestId.toString();
        currentWebSocketCallbacks[requestId] = callback;

        if (currentWebSocket == null || (currentWebSocket.readyState > WebSocket.OPEN)) {
            currentWebSocket = new WebSocket("ws://" + window.location.host);
            currentWebSocket.addEventListener("message", function jsdbgWebSocketMessageHandler(webSocketMessage) {
                // Check if it's a server-initiated break-in event.
                if (webSocketMessage.data == "break") {
                    // Invalidate the transient cache.  This should probably be invalidated on "run" instead.
                    transientCache = {};

                    debuggerBrokeListeners.forEach(function (f) { f(webSocketMessage.data); });
                    return;
                }

                var parts = splitFirstN(webSocketMessage.data, ";", 3);
                if (parts.length != 3) {
                    throw "Bad JsDbg WebSocket protocol!";
                }
                var responseId = parts[0];
                if (parts[1] != "200") {
                    throw "Server failed on message id " + responseId;
                }
                if (!(responseId in currentWebSocketCallbacks)) {
                    throw "No registered callback for message id " + responseId;
                }

                // Fire the callback and remove it from the registry.
                currentWebSocketCallbacks[responseId](parts[2]);
                delete currentWebSocketCallbacks[requestId];
            });

            currentWebSocket.addEventListener("close", function jsdbgWebSocketCloseHandler() {
                currentWebSocket = null;
                console.log("JsDbg web socket was closed.");
            })
        }

        if (currentWebSocket.readyState < WebSocket.OPEN) {
            currentWebSocket.addEventListener("open", function retryWebSocketRequest() { sendWebSocketMessage(requestId, messageToSend, callback); });
        } else if (currentWebSocket.readyState == WebSocket.OPEN) {
            currentWebSocket.send(requestId + ";" + messageToSend);
        }
    }

    function jsonRequest(url, callback, cacheType, method, data) {
        // If the transient cache isn't supported, downgrade to uncached.
        if (cacheType == CacheType.TransientCache && transientCache == null) {
            cacheType = CacheType.Uncached;
        }

        if (cacheType == CacheType.Cached && url in responseCache) {
            callback(responseCache[url]);
            return;
        } else if (cacheType == CacheType.TransientCache && url in transientCache) {
            callback(transientCache[url]);
            return;
        } else if (!everythingIsSynchronous && cacheType != CacheType.Uncached) {
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
            var result = JSON.parse(jsonText);
            var otherCallbacks = [];
            if (cacheType != CacheType.Uncached && !everythingIsSynchronous) {
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

        if (browserSupportsWebSockets && !everythingIsSynchronous && !method && !data) {
            // Use WebSockets if the request is async, the method is unspecified, and there's no data payload.
            sendWebSocketMessage(requestCounter, url, handleJsonResponse);
        } else {
            // Use XHR.
            if (!method) {
                method = "GET";
            }

            var xhr = new XMLHttpRequest();
            xhr.open(method, url, !everythingIsSynchronous);
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
        1 : "byte",
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

    initializeProgressIndicator();

    return {
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

        _help_IsRunningSynchronously: {
            description: "Indicates if JsDbg methods will respond synchronously.",
            returns: "A bool."
        },
        IsRunningSynchronously: function() {
            return everythingIsSynchronous;
        },

        GetCurrentExtension: function() {
            var components = window.location.pathname.split('/');
            if (components.length > 1 && components[1].length > 0) {
                return components[1].toLowerCase();
            }
            return null;
        },

        _help_RunSynchronously: {
            description: "Runs JsDbg synchronously for the duration of a given function.",
            returns: "The return value of the given function.",
            arguments: [{name:"action", type:"function() -> any", description: "The function to run in synchronous mode."}]
        },
        RunSynchronously: function(action) {
            if (everythingIsSynchronous) {
                return action();
            } else {
                everythingIsSynchronous = true;
                try {
                    var result = action();
                    everythingIsSynchronous = false;
                } catch (exception) {
                    everythingIsSynchronous = false;
                    throw exception;
                }
                return result;
            }
        },

        _help_LoadExtension: {
            description: "Load an extension at a given path.",
            arguments: [
                {name:"path", type:"string", description:"The path of the extension to load.  Relative paths are relative to the extensions directory."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LoadExtension: function(path, callback) {
            jsonRequest("/jsdbg/loadextension?path=" + esc(path), callback, CacheType.Uncached);
        },

        _help_UnloadExtension: {
            description: "Unloads an extension identified by name.",
            arguments: [
                {name:"name", type:"string", description:"The name of the extension to unload."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        UnloadExtension: function(name, callback) {
            jsonRequest("/jsdbg/unloadextension?name=" + esc(name), callback, CacheType.Uncached);
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

        _help_ReadPointer: {
            description: "Reads a pointer sized value from memory.",
            arguments: [
                {name:"pointer", type:"integer", description:"The pointer to the pointer."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        ReadPointer: function(pointer, callback) {
            jsonRequest("/jsdbg/memory?type=pointer&pointer=" + esc(pointer), callback, CacheType.TransientCache);
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
                    result.value = readJsonFloat(result.value);
                    originalCallback(result);
                }
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
                    result.array = result.array.map(readJsonFloat);
                    originalCallback(result);
                }
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

        _help_GetPointerSize: {
            description: "Looks up the size of a pointer.",
            arguments: [
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        GetPointerSize: function(callback) {
            jsonRequest("/jsdbg/pointersize", callback, CacheType.Cached);
        },

        _help_LookupSymbol: {
            description: "Evaluates a symbolic expression and returns the type of and pointer to the value.",
            arguments: [
                {name:"symbol", type:"string", description:"The symbolic expression to evaluate."},
                {name:"isGlobal", type:"bool", description:"A value indicating if the symbol is guaranteed to be a global symbol."},
                {name:"callback", type:"function(object)", description:"A callback that is called when the operation succeeds or fails."}
            ]
        },
        LookupSymbol: function(symbol, isGlobal, callback) {
            jsonRequest("/jsdbg/symbol?symbol=" + esc(symbol) + "&isGlobal=" + esc(isGlobal), callback, isGlobal ? CacheType.Cached : CacheType.TransientCache);
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
                {name:"data", type:"string", description:"The data to save."},
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
})();

(function() {
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

    // Load any dependencies if requested.
    var scriptTags = document.querySelectorAll("script");
    var loadDependencies = false;
    for (var i = 0; i < scriptTags.length; ++i) {
        var tag = scriptTags[i];
        if (tag.getAttribute("src").indexOf("/jsdbg.js") != -1) {
            if (tag.getAttribute("data-include-dependencies") != null) {
                loadDependencies = true;
                break;
            }
        }
    }

    if (loadDependencies) {
        // Include the common css file.
        document.write("<link rel=\"stylesheet\" type=\"text/css\" href=\"/common.css\">");

        JsDbg.RunSynchronously(function() {
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
                            document.write("<script src=\"/" + file + "\" type=\"text/javascript\"></script>");
                        } else if (file.match(/\.css$/)) {
                            document.write("<link rel=\"stylesheet\" type=\"text/css\" href=\"/" + file + "\">");
                        } else {
                            console.log("Unknown dependency type: " + file);
                        }
                    });
                }
            });
        });
    }
})();