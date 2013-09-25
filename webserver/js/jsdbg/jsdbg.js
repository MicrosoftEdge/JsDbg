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

    function esc(s) { return encodeURIComponent(s); }

    var sizeNames = {
        1 : "byte",
        2 : "short",
        4 : "int",
        8 : "long"
    };

    return {

        // Asynchronous methods.
        LoadExtension: function(path, callback) {
            jsonRequest("/jsdbg/loadextension?path=" + esc(path), callback, /*async*/true);
        },
        UnloadExtension: function(name, callback) {
            jsonRequest("/jsdbg/unloadextension?name=" + esc(name), callback, /*async*/true);
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
                return {
                    "error": "Invalid number size.",
                }
            }

            jsonRequest("/jsdbg/memory?type=" + esc(sizeNames[size]) + "&pointer=" + esc(pointer), callback, /*async*/true);
        },

        ReadArray: function(pointer, itemSize, count, callback) {
            if (!(itemSize in sizeNames)) {
                return {
                    "error": "Invalid number size.",
                }
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
        }
    }
})();