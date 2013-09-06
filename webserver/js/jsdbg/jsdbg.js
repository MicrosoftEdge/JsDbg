"use strict";

// jsdbg.js
// Peter Salas
//
// An interface for communicating with a windbg session via the jsdbg server.

var JsDbg = (function() {

    var responseCache = {};

    function jsonRequest(url, callback, async, cache) {
        if (cache && url in responseCache) {
            callback(responseCache[url]);
            return;
        }

        var xhr = new XMLHttpRequest();
        
        xhr.open("GET", url, async);
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4 && xhr.status == 200) {
                var result = JSON.parse(xhr.responseText);
                if (cache) {
                    responseCache[url] = result;
                }
                callback(result);
            }
        };
        xhr.send();
    }

    var sizeNames = {
        1 : "byte",
        2 : "short",
        4 : "int",
        8 : "long"
    };

    return {

        // Asynchronous methods.

        LookupFieldOffset: function(module, type, fields, callback) {
            jsonRequest("/jsdbg/fieldoffset?module=" + module + "&type=" + type + "&fields=" + fields.join(","), callback, /*async*/true, /*cache*/true);
        },

        ReadPointer: function(pointer, callback) {
            jsonRequest("/jsdbg/memory?type=pointer&pointer=" + pointer, callback, /*async*/true);
        },

        ReadNumber: function(pointer, size, callback) {
            if (!(size in sizeNames)) {
                return {
                    "error": "Invalid number size.",
                }
            }

            jsonRequest("/jsdbg/memory?type=" + sizeNames[size] + "&pointer=" + pointer, callback, /*async*/true);
        },

        ReadArray: function(pointer, itemSize, count, callback) {
            if (!(itemSize in sizeNames)) {
                return {
                    "error": "Invalid number size.",
                }
            }

            jsonRequest("/jsdbg/array?type=" + sizeNames[itemSize] + "&pointer=" + pointer + "&length=" + count, callback, /*async*/true);
        },

        LookupSymbolName: function(pointer, callback) {
            jsonRequest("/jsdbg/symbolname?pointer=" + pointer, callback, /*async*/true);
        },

        LookupConstantName: function(module, type, constant, callback) {
            jsonRequest("/jsdbg/constantname?module=" + module + "&type=" + type + "&constant=" + constant, callback, /*async*/true, /*cache*/true);
        },

        GetPointerSize: function(callback) {
            jsonRequest("/jsdbg/pointersize", callback, /*async*/true, /*cache*/true);
        },

        // Synchronous methods.

        SyncLookupFieldOffset: function(module, type, fields) {
            var retval = null;
            jsonRequest("/jsdbg/fieldoffset?module=" + module + "&type=" + type + "&fields=" + fields.join(","), function(x) { retval = x; }, /*async*/false, /*cache*/true);
            return retval;
        },

        SyncReadPointer: function(pointer) {
            var retval = null;
            jsonRequest("/jsdbg/memory?type=pointer&pointer=" + pointer, function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncReadNumber: function(pointer, size) {
            if (!(size in sizeNames)) {
                return {
                    "error": "Invalid number size.",
                }
            }

            var retval = null;
            jsonRequest("/jsdbg/memory?type=" + sizeNames[size] + "&pointer=" + pointer, function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncReadArray: function(pointer, itemSize, count) {
            if (!(itemSize in sizeNames)) {
                return {
                    "error": "Invalid number size.",
                }
            }

            var retval = null;
            jsonRequest("/jsdbg/array?type=" + sizeNames[itemSize] + "&pointer=" + pointer + "&length=" + count, function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncLookupSymbolName: function(pointer) {
            var retval = null;
            jsonRequest("/jsdbg/symbolname?pointer=" + pointer, function(x) { retval = x; }, /*async*/false);
            return retval;
        },

        SyncLookupConstantName: function(module, type, constant) {
            var retval = null;
            jsonRequest("/jsdbg/constantname?module=" + module + "&type=" + type + "&constant=" + constant, function(x) { retval = x; }, /*async*/false, /*cache*/true);
            return retval;
        },

        SyncGetPointerSize: function() {
            var retval = null;
            jsonRequest("/jsdbg/pointersize", function(x) { retval = x; }, /*async*/false, /*cache*/true);
            return retval;
        }
    }
})();