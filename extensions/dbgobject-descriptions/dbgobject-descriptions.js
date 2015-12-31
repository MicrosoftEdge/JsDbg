"use strict";

JsDbg.OnLoad(function () {
    var registeredDescriptions = new DbgObject.TypeExtension();

    function TypeDescription(name, isPrimary, getter) {
        this.name = name;
        this.isPrimary = isPrimary;
        this.getter = getter;
    }

    DbgObject._help_AddTypeDescription = {
        description: "Provides a function to produce type-specific formatting of DbgObjects.",
        notes: "The provided function will be used whenever <code>desc()</code> is called on a DbgObject with a matching type.",
        arguments:[
            {name: "module", type:"string", description:"The module of the type."},
            {name: "type", type:"string/function(string) -> bool", description: "The type name, or a predicate that matches a type name."},
            {name: "description", type:"function(DbgObject) -> string", description: "A function that returns an HTML fragment to describe a given DbgObject."}
        ]
    };
    DbgObject.AddTypeDescription = function(module, type, name, isPrimary, description) {
        var extension = new TypeDescription(name, isPrimary, description);
        return registeredDescriptions.addExtension(module, type, name, extension);
    }

    DbgObject._help_GetDescriptions = {
        description: "Gets the available descriptions for the given type.",
        arguments: [
            {name: "module", type:"string", description:"The module of the type."},
            {name: "typeName", type:"string", description:"The name of the type."}
        ],
        returns: "An array of objects with <code>name</code> and <code>getter</code> fields."
    };
    DbgObject.GetDescriptions = function (module, type) {
        return registeredDescriptions.getAllExtensions(module, type).map(function (extension) {
            return extension.extension;
        })
    }

    DbgObject.OnDescriptionsChanged = function (module, typeName, listener) {
        return registeredDescriptions.addListener(module, typeName, listener);
    }

    function getTypeDescriptionFunctionIncludingBaseTypes(module, type) {
        function getTypeDescriptionFunction(module, type) {
            var primaries = registeredDescriptions.getAllExtensions(module, type).filter(function (e) { return e.extension.isPrimary; }).map(function (e) { return e.extension; });
            if (primaries.length == 0) {
                return null;
            } else {
                return primaries[0];
            }
        }

        var natural = getTypeDescriptionFunction(module, type);
        if (natural != null) {
            return Promise.as(natural);
        } else if (type == "void") {
            return Promise.as(null);
        }

        return new DbgObject(module, type, 0).baseTypes()
        .then(function (baseTypes) {
            for (var i = 0; i < baseTypes.length; ++i) {
                var desc = getTypeDescriptionFunction(module, baseTypes[i].typeDescription());
                if (desc != null) {
                    return desc;
                }
            }

            return null;
        });
    }
    
    function getTypeDescription(dbgObject) {
        if (dbgObject.isNull()) {
            return Promise.as(null);
        }

        return getTypeDescriptionFunctionIncludingBaseTypes(dbgObject.module, dbgObject.typename)
        .then(function (customDescription) {
            var hasCustomDescription = customDescription != null;
            if (!hasCustomDescription) {
                customDescription = function(x) { 
                    // Default description: first try to get val(), then just provide the pointer with the type.
                    if (x.typename == "bool" || x.bitcount == 1) {
                        return x.val()
                        .then(function (value) {
                            return value == 1 ? "true" : "false";
                        });
                    } else if (x.isScalarType()) {
                        return x.bigval().then(function (bigint) { return bigint.toString(); }); 
                    } else if (x.isPointer()) {
                        return Promise.as(x.deref())
                        .then(function (dereferenced) {
                            return dereferenced.htmlTypeDescription() + " " + dereferenced.ptr();
                        });
                    } else {
                        return x.isEnum()
                        .then(function (isEnum) {
                            if (isEnum) {
                                return x.constant();
                            } else {
                                return Promise.fail();
                            }
                        })
                        .then(null, function () {
                            return x.htmlTypeDescription() + " " + x.ptr();
                        })
                    }
                };
            }

            var description = function(obj) {
                return Promise.as(obj)
                .then(customDescription)
                .then(null, function(err) {
                    if (hasCustomDescription) {
                        // The custom description provider had an error.
                        return obj.typename + "???";
                    } else if (obj.isNull()) {
                        return null;
                    } else {
                        return obj.typename + " " + obj.ptr();
                    }
                }); 
            }

            if (dbgObject.isArray()) {
                var length = dbgObject.arrayLength();
                var elements = [];
                for (var i = 0; i < length; ++i) {
                    elements.push(dbgObject.idx(i));
                }

                return Promise.map(Promise.join(elements), description)
                .then(function(descriptions) {
                    return "[" + descriptions.map(function(d) { return "<div style=\"display:inline-block;\">" + d + "</div>"; }).join(", ") + "]";
                })
            } else {
                return description(dbgObject);
            }
        });
    }

    DbgObject.prototype._help_hasDesc = {
        description: "Indicates if the DbgObject has a type-specific <code>desc()</code> representation.",
        returns: "(A promise to a) bool."
    }
    DbgObject.prototype.hasDesc = function() {
        return getTypeDescriptionFunctionIncludingBaseTypes(this.module, this.typename)
        .then(function (result) {
            return result != null;
        });
    }

    DbgObject.prototype._help_desc = {
        description: "Provides a human-readable description of the object.",
        returns: "A promise to an HTML fragment.",
        notes: function() {
            var html = "<p>Type-specific description generators can be registered with <code>DbgObject.AddTypeDescription</code>.</p>";
            var loadedDescriptionTypes = registeredDescriptions.getAllTypes().map(function (type) {
                if (typeof type.type == typeof "") {
                    return "<li>" + type.module + "!" + type.type + "</li>";
                } else {
                    return "<li>Predicate: " + type.module + "!(" + type.type.toString() + ")</li>"
                }
            });
            return html + "Currently registered types with descriptions: <ul>" + loadedDescriptionTypes.join("") + "</ul>";
        }
    }
    DbgObject.prototype.desc = function() {
        return getTypeDescription(this);
    }
});