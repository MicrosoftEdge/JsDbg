//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// dbgobject-type-extension.js
// Utility class for registering/unregistering objects that extend DbgObjects based on their internal type.

Loader.OnLoad(function() {
    function DbgObjectTypeExtension() {
        this.types = {};
        this.functions = [];
        this.listeners = [];
    }
    DbgObject.TypeExtension = DbgObjectTypeExtension;

    DbgObjectTypeExtension.prototype.addListener = function (type, listener) {
        this.listeners.push({
            type: type,
            listener: listener
        });
    }

    DbgObjectTypeExtension.prototype.getExtensionIncludingBaseTypes = function (dbgObject, name) {
        var that = this;
        return Promise.resolve(null)
        .then(function () {
            var extension = that.getExtension(dbgObject.type, name);
            if (extension != null) {
                return extension;
            }

            return dbgObject
            .baseTypes()
            .then(function (baseTypes) {
                for (var i = 0; i < baseTypes.length; ++i) {
                    dbgObject = baseTypes[i];
                    var baseExtension = that.getExtension(dbgObject.type, name);
                    if (baseExtension != null) {
                        return baseExtension;
                    }
                }

                return null;
            })
        })
        .then(function (extension) {
            if (extension == null) {
                return null;
            } else {
                return {
                    dbgObject: dbgObject,
                    extension: extension
                }
            }
        });
    }

    DbgObjectTypeExtension.prototype.getAllExtensionsIncludingBaseTypes = function(dbgObject) {
        var that = this;
        return dbgObject.baseTypes()
        .then(function (baseTypes) {
            baseTypes.push(dbgObject);

            var extensions = baseTypes
            .map(function (dbgObject) {
                return that.getAllExtensions(dbgObject.type)
            })
            .reduce(function (a, b) { return a.concat(b); }, []);
            
            var includedExtensions = new Set();
            var result = [];
            extensions.forEach(function (item) {
                if (!includedExtensions.has(item.extension)) {
                    includedExtensions.add(item.extension);
                    result.push(item);
                }
            });

            return result;
        });
    }

    DbgObjectTypeExtension.prototype.getExtension = function (type, name) {
        if (DbgObjectType.is(type)) {
            var key = type.nonArrayComparisonName();
            if (key in this.types) {
                var collection = this.types[key];
                if (name in collection) {
                    return collection[name];
                }
            }

            for (var i = 0; i < this.functions.length; ++i) {
                var entry = this.functions[i];
                if (entry.name == name && entry.type(type)) {
                    return entry.extension;
                }
            }
        } else {
            for (var i = 0; i < this.functions.length; ++i) {
                var entry = this.functions[i];
                if (entry.type == type && entry.name == name) {
                    return entry.extension;
                }
            }
        }

        return null;
    }

    DbgObjectTypeExtension.prototype.addExtension = function (type, name, extension) {
        if (DbgObjectType.is(type)) {
            var key = type.nonArrayComparisonName();
            if (!(key in this.types)) {
                this.types[key] = {};
            }

            var collection = this.types[key];
            if (name in collection) {
                throw new Error("There is already a \"" + name + "\" registered on " + key);
            }
            collection[name] = extension;
        } else if (type instanceof Function) {
            this.functions.push({
                type: type,
                name: name,
                extension: extension
            });
        } else {
            throw new Error("The \"type\" must be either a DbgObjectType or a function.");
        }

        this.notifyListeners(type, name, extension, "add", null);
        return extension;
    }

    DbgObjectTypeExtension.prototype.renameExtension = function (type, oldName, newName) {
        if (oldName == newName) {
            return;
        }

        if (DbgObjectType.is(type)) {
            var key = type.nonArrayComparisonName();
            if (key in this.types) {
                var collection = this.types[key];
                if (oldName in collection) {
                    if (newName in collection) {
                        throw new Error("There is already a \"" + newName + "\" registered on " + type)
                    }
                    var extension = collection[oldName];
                    delete collection[oldName];
                    collection[newName] = extension;
                    this.notifyListeners(type, oldName, extension, "rename", newName);
                    return extension;
                } else {
                    throw new Error("There is no \"" + oldName + "\" registered on " + type);
                }
            }
        } else if (type instanceof Function) {
            for (var i = 0; i < this.functions.length; ++i) {
                var entry = this.functions[i];
                if (entry.type == type && entry.name == oldName) {
                    entry.name = newName
                    this.notifyListeners(type, oldName, entry.extension, "rename", newName);
                    return entry.extension;
                }
            }
        } else {
            throw new Error("The \"type\" must be either a string or a function.");
        }
    }

    DbgObjectTypeExtension.prototype.removeExtension = function (type, name) {
        if (DbgObjectType.is(type)) {
            var key = type.nonArrayComparisonName();
            if (key in this.types) {
                var collection = this.types[key];
                if (name in collection) {
                    var extension = collection[name];
                    delete collection[name];
                    this.notifyListeners(type, name, extension, "remove", null);
                    return extension;
                }
            }
        } else if (type instanceof Function) {
            for (var i = 0; i < this.functions.length; ++i) {
                var entry = this.functions[i];
                if (entry.type == type && entry.name == name) {
                    this.functions.splice(i, 1);
                    this.notifyListeners(type, name, entry.extension, "remove", null);
                    return entry.extension;
                }
            }
        } else {
            throw new Error("The \"type\" must be either a string or a function.");
        }
    }

    DbgObjectTypeExtension.prototype.notifyListeners = function (type, name, extension, operation, context) {
        this.listeners.forEach(function (listener) {
            var typeMatches = false;
            if (listener.type == null) {
                typeMatches = true;
            } else if (DbgObjectType.is(type)) {
                typeMatches = (type.equals(listener.type));
            } else {
                typeMatches = type(listener.type);
            }

            if (typeMatches) {
                listener.listener(listener.type == null ? type : listener.type, name, extension, operation, context);
            }
        });
    }

    DbgObjectTypeExtension.prototype.getAllExtensions = function (type) {
        var collection = {};
        var results = [];
        if (DbgObjectType.is(type)) {
            var key = type.nonArrayComparisonName();
            if (key in this.types) {
                var typeCollection = this.types[key];
                for (var name in typeCollection) {
                    collection[name] = true;
                    results.push({name: name, extension: typeCollection[name]});
                }
            }

            for (var i = 0; i < this.functions.length; ++i) {
                var entry = this.functions[i];
                if (entry.type(type)) {
                    if (!(entry.name in collection)) {
                        collection[entry.name] = true;
                        results.push({name: entry.name, extension: entry.extension});
                    }
                }
            }
        } else {
            this.functions.forEach(function (entry) {
                if (entry.type == type) {
                    if (!(entry.name) in collection) {
                        collection[entry.name] = true;
                        results.push({name: entry.name, extension: entry.extension});
                    }
                }
            });
        }

        return results;
    }

    DbgObjectTypeExtension.prototype.getAllTypes = function() {
        var results = [];
        for (var key in this.types) {
            results.push(DbgObjectType(key));
        }

        this.functions.forEach(function (entry) {
            results.push(entry.type);
        });

        return results;
    }
});