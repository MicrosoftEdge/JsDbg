"use strict";

// jsdbg.js
// Peter Salas
//
// An interface for communicating with a windbg session via the jsdbg server.

var JsDbg = (function() {

    // Certain types of requests are cacheable -- this maintains that cache.
    var responseCache = {};

    // If we make a cacheable request and there are already outstanding requests for that resource,
    // piggyback onto the existing request.  This maintains a list of piggybacked requests.
    var pendingCachedRequests = {};

    // A counter of the total number of requests made to the server.
    var requestCounter = 0;

    // Big hammer - makes every request synchronous.
    var everythingIsSynchronous = false;

    // WebSocket support.
    var browserSupportsWebSockets = (window.WebSocket !== undefined);
    var currentWebSocket = null;
    var currentWebSocketCallbacks = {};

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
        loadingIndicator.style.visibility = "visible";
    }

    function requestEnded() {
        if (--pendingAsynchronousRequests == 0) {
            loadingIndicator.style.visibility = "hidden";
        }
    }

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

    function jsonRequest(url, callback, cache, method, data) {
        if (cache && url in responseCache) {
            callback(responseCache[url]);
            return;
        } else if (!everythingIsSynchronous && cache) {
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
            if (cache && !everythingIsSynchronous) {
                otherCallbacks = pendingCachedRequests[url];
                delete pendingCachedRequests[url];
                responseCache[url] = result;
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

    initializeProgressIndicator();

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

        // Asynchronous methods.
        LoadExtension: function(path, callback) {
            jsonRequest("/jsdbg/loadextension?path=" + esc(path), callback);
        },
        UnloadExtension: function(name, callback) {
            jsonRequest("/jsdbg/unloadextension?name=" + esc(name), callback);
        },
        GetExtensions: function(callback) {
            jsonRequest("/jsdbg/extensions", callback);
        },

        LookupFieldOffset: function(module, type, fields, callback) {
            jsonRequest("/jsdbg/fieldoffset?module=" + esc(module) + "&type=" + esc(type) + "&fields=" + esc(fields.join(",")), callback, /*cache*/true);
        },

        LookupFields: function(module, type, callback) {
            jsonRequest("/jsdbg/typefields?module=" + esc(module) + "&type=" + esc(type), callback, /*cache*/true);
        },

        LookupBaseTypeOffset: function(module, type, baseType, callback) {
            jsonRequest("/jsdbg/basetypeoffset?module=" + esc(module) + "&type=" + esc(type) + "&basetype=" + esc(baseType), callback, /*cache*/true);
        },

        ReadPointer: function(pointer, callback) {
            jsonRequest("/jsdbg/memory?type=pointer&pointer=" + esc(pointer), callback);
        },

        ReadNumber: function(pointer, size, callback) {
            if (!(size in sizeNames)) {
                callback({ "error": "Invalid number size." });
                return;
            }

            jsonRequest("/jsdbg/memory?type=" + esc(sizeNames[size]) + "&pointer=" + esc(pointer), callback);
        },

        ReadArray: function(pointer, itemSize, count, callback) {
            if (!(itemSize in sizeNames)) {
                callback({ "error": "Invalid number size." });
                return;
            }

            jsonRequest("/jsdbg/array?type=" + sizeNames[itemSize] + "&pointer=" + esc(pointer) + "&length=" + count, callback);
        },

        LookupSymbolName: function(pointer, callback) {
            jsonRequest("/jsdbg/symbolname?pointer=" + esc(pointer), callback);
        },

        LookupConstantName: function(module, type, constant, callback) {
            jsonRequest("/jsdbg/constantname?module=" + esc(module) + "&type=" + esc(type) + "&constant=" + esc(constant), callback, /*cache*/true);
        },

        GetPointerSize: function(callback) {
            jsonRequest("/jsdbg/pointersize", callback, /*cache*/true);
        },

        LookupSymbol: function(symbol, callback) {
            jsonRequest("/jsdbg/symbol?symbol=" + esc(symbol), callback);
        },

        GetPersistentData: function(user, callback) {
            jsonRequest("/jsdbg/persistentstorage" + (user ? "?user=" + esc(user) : ""), callback, /*cache*/false, "GET");
        },

        SetPersistentData: function(data, callback) {
            // XXX/psalas: disabling persistent data saving for now
            callback({success: true});
            return;
            var value = JSON.stringify(data);
            jsonRequest("/jsdbg/persistentstorage", callback, /*cache*/false, "PUT", value);
        },

        GetPersistentDataUsers: function(callback) {
            jsonRequest("/jsdbg/persistentstorageusers", callback);
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
                var components = window.location.pathname.split('/');
                if (components.length > 1 && components[1].length > 0) {
                    var includes = [];
                    collectIncludes(components[1].toLowerCase(), includes, {}, nameMap);
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