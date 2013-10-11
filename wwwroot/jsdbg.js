"use strict";

// jsdbg.js
// Peter Salas
//
// An interface for communicating with a windbg session via the jsdbg server.

var JsDbg = (function() {

    var responseCache = {};
    var pendingCachedRequests = {};
    var everythingCache = null;
    var xhrToReuse = null;
    var requestCounter = 0;
    var browserSupportsWebSockets = (window.WebSocket !== undefined);


    var everythingIsSynchronous = false;

    var currentWebSocket = null;
    var currentWebSocketCallbacks = {};

    function sendWebSocketMessage(requestId, messageToSend, callback) {
        requestId = requestId.toString();
        currentWebSocketCallbacks[requestId] = callback;

        if (currentWebSocket == null || (currentWebSocket.readyState > WebSocket.OPEN)) {
            currentWebSocket = new WebSocket("ws://" + window.location.host);
            currentWebSocket.addEventListener("message", function jsdbgWebSocketMessageHandler(webSocketMessage) {
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

    function jsonRequest(url, callback, async, cache, method, data) {
        if (everythingIsSynchronous || everythingCache != null) {
            // We can't be async and cache everything.  Favor caching.
            async = false;
        }

        if (cache && url in responseCache) {
            callback(responseCache[url]);
            return;
        } else if (async && cache && url in pendingCachedRequests) {
            pendingCachedRequests[url].push(callback);
            return;
        } else if (cache) {
            pendingCachedRequests[url] = [];
        }

        if (everythingCache != null && url in everythingCache) {
            callback(everythingCache[url]);
            return;
        }

        ++requestCounter;

        function handleJsonResponse(jsonText) {
            var result = JSON.parse(jsonText);
            var otherCallbacks = [];
            if (cache && async) {
                otherCallbacks = pendingCachedRequests[url];
                delete pendingCachedRequests[url];
                responseCache[url] = result;
            } else if (everythingCache != null) {
                everythingCache[url] = result;
            }
            callback(result);
            otherCallbacks.forEach(function fireBatchedJsDbgCallback(f) { f(result); });
        }

        if (browserSupportsWebSockets && async && !method && !data) {
            // Use WebSockets if the request is async, the method is unspecified, and there's no data payload.
            sendWebSocketMessage(requestCounter, url, handleJsonResponse);
        } else {
            // Use XHR.
            if (!method) {
                method = "GET";
            }

            var xhr;
            if (xhrToReuse != null) {
                xhr = xhrToReuse;
                xhrToReuse = null;
            } else {
                xhr = new XMLHttpRequest();
            }
            
            xhr.open(method, url, async);
            xhr.onreadystatechange = function() {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    handleJsonResponse(xhr.responseText);
                }
            };
            xhr.send(data);

            if (!async) {
                xhrToReuse = xhr;
            }
        }
    }

    function esc(s) { return encodeURIComponent(s); }

    var sizeNames = {
        1 : "byte",
        2 : "short",
        4 : "int",
        8 : "long"
    };

    return {
        GetNumberOfRequests: function() {
            return requestCounter;
        },

        IsRunningSynchronously: function() {
            return everythingIsSynchronous;
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

        RunWithCachedWorld: function(action) {
            if (everythingCache == null) {
                // The world isn't being cached.
                everythingCache = {};
                var result = action();
                everythingCache = null;
                return result;
            } else {
                // The world is already cached.
                return action();
            }
        },

        // Asynchronous methods.
        LoadExtension: function(path, callback) {
            jsonRequest("/jsdbg/loadextension?path=" + esc(path), callback, /*async*/true);
        },
        UnloadExtension: function(name, callback) {
            jsonRequest("/jsdbg/unloadextension?name=" + esc(name), callback, /*async*/true);
        },
        GetExtensions: function(callback) {
            jsonRequest("/jsdbg/extensions", callback, /*async*/true);
        },

        LookupFieldOffset: function(module, type, fields, callback) {
            jsonRequest("/jsdbg/fieldoffset?module=" + esc(module) + "&type=" + esc(type) + "&fields=" + esc(fields.join(",")), callback, /*async*/true, /*cache*/true);
        },

        LookupFields: function(module, type, callback) {
            jsonRequest("/jsdbg/typefields?module=" + esc(module) + "&type=" + esc(type), callback, /*async*/false, /*cache*/true);
        },

        LookupBaseTypeOffset: function(module, type, baseType, callback) {
            jsonRequest("/jsdbg/basetypeoffset?module=" + esc(module) + "&type=" + esc(type) + "&basetype=" + esc(baseType), callback, /*async*/true, /*cache*/true);
        },

        ReadPointer: function(pointer, callback) {
            jsonRequest("/jsdbg/memory?type=pointer&pointer=" + esc(pointer), callback, /*async*/true);
        },

        ReadNumber: function(pointer, size, callback) {
            if (!(size in sizeNames)) {
                callback({ "error": "Invalid number size." });
                return;
            }

            jsonRequest("/jsdbg/memory?type=" + esc(sizeNames[size]) + "&pointer=" + esc(pointer), callback, /*async*/true);
        },

        ReadArray: function(pointer, itemSize, count, callback) {
            if (!(itemSize in sizeNames)) {
                callback({ "error": "Invalid number size." });
                return;
            }

            jsonRequest("/jsdbg/array?type=" + sizeNames[itemSize] + "&pointer=" + esc(pointer) + "&length=" + count, callback, /*async*/true);
        },

        LookupSymbolName: function(pointer, callback) {
            jsonRequest("/jsdbg/symbolname?pointer=" + esc(pointer), callback, /*async*/true);
        },

        LookupConstantName: function(module, type, constant, callback) {
            jsonRequest("/jsdbg/constantname?module=" + esc(module) + "&type=" + esc(type) + "&constant=" + esc(constant), callback, /*async*/true, /*cache*/true);
        },

        GetPointerSize: function(callback) {
            jsonRequest("/jsdbg/pointersize", callback, /*async*/true, /*cache*/true);
        },

        LookupSymbol: function(symbol, callback) {
            jsonRequest("/jsdbg/symbol?symbol=" + esc(symbol), callback, /*async*/true);
        },

        GetPersistentData: function(user, callback) {
            jsonRequest("/jsdbg/persistentstorage" + (user ? "?user=" + esc(user) : ""), callback, /*async*/true, /*cache*/false, "GET");
        },

        SetPersistentData: function(data, callback) {
            // XXX/psalas: disabling persistent data saving for now
            callback({success: true});
            return;
            var value = JSON.stringify(data);
            jsonRequest("/jsdbg/persistentstorage", callback, /*async*/true, /*cache*/false, "PUT", value);
        },

        GetPersistentDataUsers: function(callback) {
            jsonRequest("/jsdbg/persistentstorageusers", callback, /*async*/true);
        },

        // Synchronous methods.
        SyncLoadExtension: function(path) {
            var retval = null;
            jsonRequest("/jsdbg/loadextension?path=" + esc(path), function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncUnloadExtension: function(name) {
            var retval = null;
            jsonRequest("/jsdbg/unloadextension?name=" + esc(name), function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncGetExtensions: function() {
            var retval = null;
            jsonRequest("/jsdbg/extensions", function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncLookupFieldOffset: function(module, type, fields) {
            var retval = null;
            jsonRequest("/jsdbg/fieldoffset?module=" + esc(module) + "&type=" + esc(type) + "&fields=" + esc(fields.join(",")), function(x) { retval = x; }, /*async*/false, /*cache*/true);
            return retval;
        },

        SyncLookupFields: function(module, type) {
            var retval = null;
            jsonRequest("/jsdbg/typefields?module=" + esc(module) + "&type=" + esc(type), function(x) { retval = x; }, /*async*/false, /*cache*/true);
            return retval;
        },

        SyncLookupBaseTypeOffset: function(module, type, baseType) {
            var retval = null;
            jsonRequest("/jsdbg/basetypeoffset?module=" + esc(module) + "&type=" + esc(type) + "&basetype=" + esc(baseType), function(x) { retval = x; }, /*async*/false, /*cache*/true);
            return retval;
        },

        SyncReadPointer: function(pointer) {
            var retval = null;
            jsonRequest("/jsdbg/memory?type=pointer&pointer=" + esc(pointer), function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncReadNumber: function(pointer, size) {
            if (!(size in sizeNames)) {
                return {
                    "error": "Invalid number size.",
                }
            }

            var retval = null;
            jsonRequest("/jsdbg/memory?type=" + esc(sizeNames[size]) + "&pointer=" + esc(pointer), function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncReadArray: function(pointer, itemSize, count) {
            if (!(itemSize in sizeNames)) {
                return {
                    "error": "Invalid number size.",
                }
            }

            var retval = null;
            jsonRequest("/jsdbg/array?type=" + esc(sizeNames[itemSize]) + "&pointer=" + esc(pointer) + "&length=" + count, function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncLookupSymbolName: function(pointer) {
            var retval = null;
            jsonRequest("/jsdbg/symbolname?pointer=" + esc(pointer), function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncLookupConstantName: function(module, type, constant) {
            var retval = null;
            jsonRequest("/jsdbg/constantname?module=" + esc(module) + "&type=" + esc(type) + "&constant=" + esc(constant), function(x) { retval = x; }, /*async*/false, /*cache*/true);
            return retval;
        },

        SyncGetPointerSize: function() {
            var retval = null;
            jsonRequest("/jsdbg/pointersize", function(x) { retval = x; }, /*async*/false, /*cache*/true);
            return retval;
        },

        SyncLookupSymbol: function(symbol) {
            var retval = null;
            jsonRequest("/jsdbg/symbol?symbol=" + esc(symbol), function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncGetPersistentData: function(user) {
            var retval = null;
            jsonRequest("/jsdbg/persistentstorage" + (user ? "?user=" + esc(user) : ""), function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncSetPersistentData: function(data) {
            return;
            var value = JSON.stringify(data);
            var retval = null;
            jsonRequest("/jsdbg/persistentstorage", function(x) { retval = x; }, /*async*/false, /*cache*/false, "PUT", value);
            return retval;
        },

        SyncGetPersistentDataUsers: function() {
            var retval = null;
            jsonRequest("/jsdbg/persistentstorageusers", function(x) { retval = x; }, /*async*/false);
            return retval;
        }
    }
})();

(function() {
    function collectIncludes(lowerExtensionName, collectedIncludes, collectedExtensions) {
        if (lowerExtensionName in collectedExtensions) {
            // Already collected includes.
            return;
        }

        var extension = nameMap[lowerExtensionName];
        if (extension.dependencies != null) {
            extension.dependencies.forEach(function(d) {
                collectIncludes(d.toLowerCase(), collectedIncludes, collectedExtensions);
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

        var extensions = JsDbg.SyncGetExtensions().extensions;
        var nameMap = {};
        extensions.forEach(function(e) { nameMap[e.name.toLowerCase()] = e; });

        // Find the current extension.
        var components = window.location.pathname.split('/');
        if (components.length > 1 && components[1].length > 0) {
            var includes = [];
            collectIncludes(components[1].toLowerCase(), includes, {});
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
    }
})();