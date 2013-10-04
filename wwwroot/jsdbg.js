"use strict";

// jsdbg.js
// Peter Salas
//
// An interface for communicating with a windbg session via the jsdbg server.

var JsDbg = (function() {

    var responseCache = {};
    var everythingCache = null;

    function jsonRequest(url, callback, async, cache, method, data) {
        if (cache && url in responseCache) {
            callback(responseCache[url]);
            return;
        }

        if (everythingCache != null && url in everythingCache) {
            callback(everythingCache[url]);
            return;
        }

        if (!method) {
            method = "GET";
        }

        var xhr = new XMLHttpRequest();
        
        xhr.open(method, url, async);
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4 && xhr.status == 200) {
                var result = JSON.parse(xhr.responseText);
                if (cache) {
                    responseCache[url] = result;
                } else if (everythingCache != null) {
                    everythingCache[url] = result;
                }
                callback(result);
            }
        };
        xhr.send(data);
    }

    function esc(s) { return encodeURIComponent(s); }

    var sizeNames = {
        1 : "byte",
        2 : "short",
        4 : "int",
        8 : "long"
    };

    return {
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

        GetPersistentData: function(user, callback) {
            jsonRequest("/jsdbg/persistentstorage" + (user ? "?user=" + esc(user) : ""), callback, /*async*/true);
        },

        SetPersistentData: function(data, callback) {
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

        // Find the current extension.
        var components = window.location.pathname.split('/');
        if (components.length > 1) {
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