//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

Loader.OnLoad(function () {
    var registeredDescriptions = new DbgObject.TypeExtension();
    DbgObject.TypeDescriptions = registeredDescriptions;

    function TypeDescription(name, isPrimary, getter) {
        this.name = name;
        this.isPrimary = isPrimary;
        this.getter = getter;
    }

    DbgObject._help_AddTypeDescription = {
        description: "Provides a function to produce type-specific formatting of DbgObjects.",
        notes: "The provided function will be used whenever <code>desc()</code> is called on a DbgObject with a matching type.",
        arguments:[
            {name: "type", type:"DbgObjectType/function(DbgObjectType) -> bool", description: "The type, or a predicate that matches a type."},
            {name: "name", type:"string", description:"The name of the description."},
            {name: "isPrimary", type:"bool", description:"A value that indicates if the description should be used by <code>desc()</code>."},
            {name: "description", type:"function(DbgObject) -> string", description: "A function that returns an HTML fragment to describe a given DbgObject."}
        ]
    };
    DbgObject.AddTypeDescription = function(type, name, isPrimary, description) {
        return registeredDescriptions.addExtension(type, name, new TypeDescription(name, isPrimary, description));
    }

    DbgObject._help_RemoveTypeDescription = {
        description: "Removes a previously registered type description.",
        arguments: [
            { name: "type", type: "DbgObjectType/function(DbgObjectType) -> bool", description: "The type (or type predicate) to remove the description from." },
            { name: "name", type: "string", description: "The name of the description to remove." }
        ]
    }
    DbgObject.RemoveTypeDescription = function(type, name) {
        return registeredDescriptions.removeExtension(type, name);
    }

    DbgObject._help_RenameTypeDescription = {
        description: "Renames a previously registered type description.",
        arguments: [
            { name: "type", type: "DbgObjectType/function(DbgObjectType) -> bool", description: "The type (or type predicate) to rename the description on." },
            { name: "oldName", type: "string", description: "The name of the description to rename." },
            { name: "newName", type: "string", description: "The new name of the description" },
        ]
    }
    DbgObject.RenameTypeDescription = function(type, oldName, newName) {
        return registeredDescriptions.renameExtension(type, oldName, newName);
    }

    DbgObject._help_GetDescriptions = {
        description: "Gets the available descriptions for the given type.",
        arguments: [
            {name: "type", type:"DbgObjectType", description:"The type."}
        ],
        returns: "An array of objects with <code>name</code> and <code>getter</code> fields."
    };
    DbgObject.GetDescriptions = function (type) {
        return registeredDescriptions.getAllExtensions(type).map(function (extension) {
            return extension.extension;
        })
    }

    DbgObject.OnDescriptionsChanged = function (type, listener) {
        return registeredDescriptions.addListener(type, listener);
    }

    function getTypeDescriptionFunctionIncludingBaseTypes(type) {
        function getTypeDescriptionFunction(type) {
            var primaries = registeredDescriptions.getAllExtensions(type).filter(function (e) { return e.extension.isPrimary; }).map(function (e) { return e.extension; });
            if (primaries.length == 0) {
                return null;
            } else {
                return primaries[0].getter;
            }
        }

        var natural = getTypeDescriptionFunction(type);
        if (natural != null) {
            return Promise.resolve(natural);
        } else if (type == "void") {
            return Promise.resolve(null);
        }

        return DbgObject.create(type, 0).baseTypes()
        .then(function (baseTypes) {
            for (var i = 0; i < baseTypes.length; ++i) {
                var desc = getTypeDescriptionFunction(baseTypes[i].type);
                if (desc != null) {
                    return desc;
                }
            }

            return null;
        });
    }
    
    function getDefaultTypeDescription(dbgObject, element) {
        if (dbgObject.isNull()) {
            return Promise.resolve("nullptr");
        }

        return getTypeDescriptionFunctionIncludingBaseTypes(dbgObject.type)
        .then(function (customDescription) {
            var hasCustomDescription = customDescription != null;
            if (!hasCustomDescription) {
                customDescription = function(x) { 
                    // Default description: first try to get val(), then just provide the pointer with the type.
                    if (x.type.equals("bool") || x.bitcount == 1) {
                        return x.val()
                        .then(function (value) {
                            return value == 1 ? "true" : "false";
                        });
                    } else if (x.type.equals("wchar_t")) {
                        if (x.wasDereferenced) {
                            return x.string()
                            .then(null, function() {
                                return x.val().then(String.fromCharCode);
                            });
                        } else {
                            return x.val().then(String.fromCharCode);
                        }
                    } else if (x.type.isScalar()) {
                        return x.bigval().then(function (bigint) { return bigint.toString(); }); 
                    } else if (x.type.isPointer()) {
                        return Promise.resolve(x.deref())
                        .then(function (dereferenced) {
                            return dereferenced.ptr();
                        });
                    } else {
                        return x.isEnum()
                        .then(function (isEnum) {
                            if (isEnum) {
                                return x.constant();
                            } else {
                                return x.ptr();
                            }
                        })
                        .then(null, function () {
                            return x.ptr();
                        })
                    }
                };
            }

            var description = function(obj) {
                return Promise.resolve(obj)
                .then(function (obj) {
                    return customDescription(obj, element);
                })
                .then(null, function(err) {
                    if (hasCustomDescription) {
                        // The custom description provider had an error.
                        return obj.type.name() + "???";
                    } else if (obj.isNull()) {
                        return null;
                    } else {
                        return obj.ptr();
                    }
                }); 
            }

            if (dbgObject.type.isArray()) {
                var length = dbgObject.type.arrayLength();
                var elements = [];
                for (var i = 0; i < length; ++i) {
                    elements.push(dbgObject.idx(i));
                }

                return Promise.map(Promise.all(elements), description)
                .then(function(descriptions) {
                    return "[" + descriptions.map(function(d) { return "<div style=\"display:inline-block;\">" + d + "</div>"; }).join(", ") + "]";
                })
            } else {
                return description(dbgObject);
            }
        });
    }

    DbgObject.prototype._help_desc = {
        description: "Provides a human-readable description of the object.",
        returns: "A promise to an HTML fragment.",
        arguments: [
            {name: "name (optional)", type:"string", description: "The optional name of the description to use."},
            {name: "element (optional)", type:"HTML Element", description: "The element representing the DbgObject, if it exists."}
        ],
        notes: function() {
            var html = "<p>Calling with no arguments will use the default description function. Type-specific description generators can be registered with <code>DbgObject.AddTypeDescription</code>.</p>";
            var loadedDescriptionTypes = registeredDescriptions.getAllTypes().map(function (type) {
                if (DbgObjectType.is(type)) {
                    return "<li>" + type.toString() + "</li>";
                } else {
                    return "<li>Predicate: (" + type.toString() + ")</li>"
                }
            });
            return html + "Currently registered types with descriptions: <ul>" + loadedDescriptionTypes.join("") + "</ul>";
        }
    }
    DbgObject.prototype.desc = function(name, element) {
        if (name === undefined || name === null) {
            return getDefaultTypeDescription(this, element);
        } else {
            var that = this;
            return registeredDescriptions.getExtensionIncludingBaseTypes(this, name)
            .then(function (result) {
                if (result == null) {
                    throw new Error("There was no description \"" + name + "\" on " + that.type.name());
                }
                return Promise.resolve(result.extension.getter(result.dbgObject, element));
            })
        }
    }

    DbgObject.prototype.hasDefaultDescription = function() {
        return getTypeDescriptionFunctionIncludingBaseTypes(this.type)
        .then(function (defaultDescription) {
            return defaultDescription != null;
        })
    }
});