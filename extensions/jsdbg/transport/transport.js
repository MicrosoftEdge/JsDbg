//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// jsdbg-transport.js
// Handles communication between the client and the JsDbg server.

var JsDbgTransport = undefined;
Loader.OnLoad(function() {
    if (window.WebSocket === undefined) {
        alert("JsDbg requires a browser that supports WebSockets.  Please use Edge, Internet Explorer 11, or Chrome.")
        throw new Error("WebSockets are required.");
    }

    var currentWebSocket = null;
    var currentWebSocketCallbacks = {};
    var MAX_ALLOWABLE_WEBSOCKET_REQUESTS = 30;
    var remainingAllowableWebSocketRequests = MAX_ALLOWABLE_WEBSOCKET_REQUESTS; // Throttle the WebSocket requests to avoid overwhelming the connection.
    var pendingWebSocketMessages = []; // WebSocket requests that have not yet been sent due to throttling.

    // Certain types of requests are cacheable -- this maintains that cache.
    var responseCache = {};
    var transientCache = {};

    // If we make a cacheable request and there are already outstanding requests for that resource,
    // piggyback onto the existing request.  This maintains a list of piggybacked requests.
    var pendingCachedRequests = {};

    // A counter of the total number of requests made to the server.
    var requestCounter = 0;

    // Out-of-band message listeners.
    var outOfBandMessageListeners = [];

    function handleWebSocketReply(webSocketMessage) {
        var result = null;
        try {
            var parts = webSocketMessage.data.split(";", 3);
            if (parts.length != 3) {
                // The format wasn't what we expected, so treat it as an out-of-band message.
                outOfBandMessageListeners.forEach(function (f) { f(webSocketMessage.data); })
                return;
            }

            var responseId = parts[0];
            if (parts[1] != "200") {
                throw "JsDbg server failed with response (" + webSocketMessage.data + ")";
            }
            result = parts[2];
        } catch (error) {
            result = JSON.stringify({ error: error });
        }

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

    function makeWebSocketRequest(requestId, url, callback) {
        var retryWebSocketRequest = function retryWebSocketRequest() { makeWebSocketRequest(requestId, url, callback); }
        if (currentWebSocket == null || (currentWebSocket.readyState > WebSocket.OPEN)) {
            currentWebSocket = new WebSocket("ws://" + window.location.host);
            currentWebSocket.addEventListener("message", handleWebSocketReply);

            currentWebSocket.addEventListener("close", function jsdbgWebSocketCloseHandler() {
                currentWebSocket = null;
                console.log("JsDbg web socket was closed...retrying in-flight requests using XHR.");

                // Retry the in-flight messages using XHR since one of them might overload the web socket.
                var oldCallbacks = currentWebSocketCallbacks;
                remainingAllowableWebSocketRequests = MAX_ALLOWABLE_WEBSOCKET_REQUESTS;
                currentWebSocketCallbacks = {};
                for (var key in oldCallbacks) {
                    var value = oldCallbacks[key];
                    makeXhrRequest("GET", value.url, value.callback, undefined);
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
                    url: url
                };
                currentWebSocket.send(requestId + ";" + url);
            } else {
                pendingWebSocketMessages.push(retryWebSocketRequest);
            }
        }
    }

    function makeXhrRequest(method, url, callback, data) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4) {
                if (xhr.status == 200) {
                    callback(xhr.responseText);
                } else {
                    callback(JSON.stringify({ error: "The request for \"" + url + "\" failed with error " + xhr.status + "."}))
                }
            }
        };
        xhr.send(data);
    }

    function jsonRequest(url, originalCallback, cacheType, method, data) {
        var callback = function(result) {
            try {
                originalCallback(result)
            } catch (error) {

            }
        };

        if (cacheType == JsDbgTransport.CacheType.Cached && url in responseCache) {
            callback(responseCache[url]);
            return;
        } else if (cacheType == JsDbgTransport.CacheType.TransientCache && url in transientCache) {
            callback(transientCache[url]);
            return;
        } else if (cacheType != JsDbgTransport.CacheType.Uncached) {
            if (url in pendingCachedRequests) {
                pendingCachedRequests[url].push(callback);
                return;
            } else {
                pendingCachedRequests[url] = [];
            }
        }

        ++requestCounter;
        JsDbgLoadingIndicator.Show();

        function handleJsonResponse(jsonText) {
            try {
                var result = JSON.parse(jsonText);
            } catch (exception) {
                result = {
                    error: "Failed to parse JSON reponse: " + jsonText
                };
            }
            var otherCallbacks = [];
            if (cacheType != JsDbgTransport.CacheType.Uncached) {
                otherCallbacks = pendingCachedRequests[url];
                delete pendingCachedRequests[url];

                if (cacheType == JsDbgTransport.CacheType.Cached) {
                    responseCache[url] = result;
                } else if (cacheType == JsDbgTransport.CacheType.TransientCache) {
                    transientCache[url] = result;
                }
            }
            callback(result);
            otherCallbacks.forEach(function fireBatchedJsDbgCallback(f) { f(result); });
            JsDbgLoadingIndicator.Hide();
        }

        // Use WebSockets if the method is unspecified and there's no data payload.
        if (!method && !data) {
            makeWebSocketRequest(requestCounter, url, handleJsonResponse);
        } else {
            makeXhrRequest(method || "GET", url, handleJsonResponse, data);
        }
    }

    JsDbgTransport = {
        CacheType: {
            Uncached:         0, // The resource is not cached.
            Cached:           1, // The resource is cached until the page is refreshed.
            TransientCache:   2, // The resource is cached until the cache is invalidated.
        },

        JsonRequest: jsonRequest,
        InvalidateTransientCache: function() {
            transientCache = {};
        },
        InvalidateFullCache: function() {
            transientCache = {};
            responseCache = {};
        },
        OnOutOfBandMessage: function (listener) {
            outOfBandMessageListeners.push(listener);
        },
        GetNumberOfRequests: function() {
            return requestCounter;
        }
    }
});