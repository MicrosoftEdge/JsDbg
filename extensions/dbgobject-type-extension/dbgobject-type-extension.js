"use strict";

// dbgobject-type-extension.js
// Utility class for registering/unregistering objects that extend DbgObjects based on their internal type.

JsDbg.OnLoad(function() {
    function typeKey(module, type) {
        return module + "!" + type;
    }

    function DbgObjectTypeExtension() {
        this.types = {};
        this.functions = [];
        this.listeners = [];
    }
    DbgObject.TypeExtension = DbgObjectTypeExtension;

    DbgObjectTypeExtension.prototype.addListener = function (module, type, listener) {
        this.listeners.push({
            module: DbgObject.NormalizeModule(module),
            type: type,
            listener: listener
        });
    }

    DbgObjectTypeExtension.prototype.getExtensionIncludingBaseTypes = function (module, type, name) {
        module = DbgObject.NormalizeModule(module);

        var that = this;
        return Promise.as(null)
        .then(function () {
            try {
                return that.getExtension(module, type, name);
            } catch (ex) {
                return new DbgObject(module, type, 0)
                .baseTypes()
                .then(function (baseTypes) {
                    for (var i = 0; i < baseTypes.length; ++i) {
                        try {
                            return that.getExtension(module, baseTypes[i].typeDescription(), name);
                        } catch (ex) {
                            continue;
                        }
                    }

                    throw new Error();
                })
                .then(null, function() {
                    throw new Error("There was no \"" + name + "\" registered on " + type + " or its base types.");
                });
            }
        });
    }

    DbgObjectTypeExtension.prototype.getExtension = function (module, type, name) {
        module = DbgObject.NormalizeModule(module);
        var key = typeKey(module, type);
        if (key in this.types) {
            var collection = this.types[key];
            if (name in collection) {
                return collection[name];
            }
        }

        for (var i = 0; i < this.functions.length; ++i) {
            var entry = this.functions[i];
            if (entry.module == module && entry.type(type) && entry.name == name) {
                return entry.extension;
            }
        }

        throw new Error("There was no \"" + name + "\" registered on " + type);
    }

    DbgObjectTypeExtension.prototype.addExtension = function (module, type, name, extension) {
        module = DbgObject.NormalizeModule(module);

        if (typeof type == typeof "") {
            var key = typeKey(module, type);
            if (!(key in this.types)) {
                this.types[key] = {};
            }

            var collection = this.types[key];
            if (name in collection) {
                throw new Error("There is already a \"" + name + "\" registered on " + key);
            }
            collection[name] = extension;
        } else if (typeof type == typeof typeKey) {
            this.functions.push({
                module: module,
                type: type,
                name: name,
                extension: extension
            });
        } else {
            throw new Error("The \"type\" must be either a string or a function.");
        }

        this._notifyListeners(module, type, name, extension, true);
        return extension;
    }

    DbgObjectTypeExtension.prototype.removeExtension = function (module, type, name) {
        module = DbgObject.NormalizeModule(module);

        if (typeof type == typeof "") {
            var key = typeKey(module, type);
            if (key in this.types) {
                var collection = this.types[key];
                if (name in collection) {
                    var extension = collection[name];
                    delete collection[name];
                    this._notifyListeners(module, type, name, extension, false);
                    return extension;
                }
            }
        } else if (typeof type == typeof typeKey) {
            for (var i = 0; i < this.functions.length; ++i) {
                var entry = this.functions[i];
                if (entry.module == module && entry.type == type && entry.name == name) {
                    this.functions.splice(i, 1);
                    this._notifyListeners(module, type, name, entry.extension, false);
                    return entry.extension;
                }
            }
        } else {
            throw new Error("The \"type\" must be either a string or a function.");
        }
    }

    DbgObjectTypeExtension.prototype._notifyListeners = function (module, type, name, extension, isAddition) {
        this.listeners.forEach(function (listener) {
            if (listener.module == module) {
                var typeMatches = false;
                if (typeof type == typeof "") {
                    typeMatches = (type == listener.type);
                } else {
                    typeMatches = type(listener.type);
                }

                if (typeMatches) {
                    listener.listener(module, listener.type, name, extension, isAddition);
                }
            }
        });
    }

    DbgObjectTypeExtension.prototype.getAllExtensions = function (module, type) {
        module = DbgObject.NormalizeModule(module);
        var collection = {};
        var results = [];
        if (typeof type == typeof "") {
            var key = typeKey(module, type);
            if (key in this.types) {
                var typeCollection = this.types[key];
                for (var name in typeCollection) {
                    collection[name] = true;
                    results.push({name: name, extension: typeCollection[name]});
                }
            }

            for (var i = 0; i < this.functions.length; ++i) {
                var entry = this.functions[i];
                if (entry.module == module && entry.type(type)) {
                    if (!(entry.name in collection)) {
                        collection[entry.name] = true;
                        results.push({name: entry.name, extension: entry.extension});
                    }
                }
            }
        } else {
            this.functions.forEach(function (entry) {
                if (entry.module == module && entry.type == type) {
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
            var module = key.split("!")[0];
            var type = key.split("!")[1];
            results.push({module: module, type:type});
        }

        this.functions.forEach(function (entry) {
            results.push({module: module, type: entry.type});
        });

        return results;
    }
});