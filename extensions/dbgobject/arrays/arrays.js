//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// dbgobject-arrays.js
// Functionality for retrieving arrays of DbgObjects.
Loader.OnLoad(function() {
    var registeredArrayTypes = new DbgObject.TypeExtension();
    DbgObject.ArrayFields = registeredArrayTypes;

    function ArrayField(name, type, getter) {
        this.name = name;
        this.type = type;
        this.getter = getter;
    }

    ArrayField.prototype.ensureCompatibleResult = function(result, parentDbgObject) {
        if (!Array.isArray(result)) {
            throw new Error("The \"" + this.name + "\" array on " + parentDbgObject.type.name() + " did not return an array.");
        }

        var that = this;
        return Promise.resolve((this.type instanceof Function) ? this.type(parentDbgObject.type) : this.type)
        .then((resultType) => {
            if (resultType == null) {
                return Promise.resolve(result);
            }

            return Promise.map(Promise.all(result), function (obj) { return obj.isType(resultType); })
            .then(function (areAllTypes) {
                var incorrectIndex = areAllTypes.indexOf(false);
                if (incorrectIndex != -1) {
                    throw new Error("The \"" + that.name + "\" array on " + parentDbgObject.type.name() + " was supposed to return an array of " + resultType + " but there was an unrelated " + result[incorrectIndex].type.name() + ".")
                }

                return result;
            });
        });
    }

    function normalizeFieldType(fieldType, type) {
        if (!DbgObjectType.is(fieldType) && !(fieldType instanceof Function)) {
            if (!DbgObjectType.is(type)) {
                throw new Error("Invalid field type.");
            }
            fieldType = DbgObjectType(fieldType, type);
        }

        return fieldType;
    }

    DbgObject._help_AddArrayField = {
        description: "Registers an array that can be retrived from DbgObjects of a given type.",
        arguments: [
            {name:"typeOrFn", type:"DbgObjectType/function(DbgObjectType) -> bool", description: "The type to extend (or a predicate that matches the type to extend)."},
            {name:"name", type:"string", description:"The name of the array."},
            {name:"resultingTypeOrFn", type:"DbgObjectType/function(DbgObjectType) -> string", description: "The type of the items in the resulting array."},
            {name:"getter", type:"function(DbgObject) -> (promised) array of DbgObjects", description: "A function that retrieves the array."}
        ]
    }

    DbgObject.AddArrayField = function(typeOrFn, name, resultingTypeOrFn, getter) {
        var arrayField = new ArrayField(name, normalizeFieldType(resultingTypeOrFn, typeOrFn), getter);
        return registeredArrayTypes.addExtension(typeOrFn, name, arrayField);
    }

    DbgObject.RemoveArrayField = function(typeOrFn, name) {
        return registeredArrayTypes.removeExtension(typeOrFn, name);
    }

    DbgObject.UpdateArrayField = function(typeOrFn, oldName, newName, newResultingTypeOrFn) {
        registeredArrayTypes.renameExtension(typeOrFn, oldName, newName);
        var extension = registeredArrayTypes.getExtension(typeOrFn, newName);
        if (extension.type != newResultingTypeOrFn) {
            extension.type = normalizeFieldType(newResultingTypeOrFn, typeOrFn);
            registeredArrayTypes.notifyListeners(typeOrFn, newName, extension, "typechange", newResultingTypeOrFn);
        }
    }

    DbgObject.prototype._help_array = {
        description: "Given a DbgObject that represents an array, retrieves an array of corresponding DbgObjects.",
        returns: "A promise to an array of DbgObjects.",
        arguments: [{name:"count/name (optional)", type:"int/string", description:"The number of items to retrieve, or the name of the array.  Optional if the object represents an inline array."}]
    }
    DbgObject.prototype.array = function(count) {
        var that = this;
        if (typeof count == typeof "") {
            var name = count;
            return registeredArrayTypes.getExtensionIncludingBaseTypes(this, name)
            .then(function (result) {
                if (result == null) {
                    throw new Error("There was no array \"" + name + "\" on " + that.type.name());
                }
                return Promise.resolve(result.extension.getter(result.dbgObject))
                .then(function (resultArray) {
                    return result.extension.ensureCompatibleResult(resultArray, result.dbgObject);
                })
            })
        }

        // "count" might be a promise...
        return Promise.resolve(count)
        .then(function (count) {
            // If we were given a DbgObject, go ahead and get the value.
            if (count !== undefined && count instanceof DbgObject) {
                if (count.isNull()) {
                    return 0;
                } else {
                    return count.bigval();
                }
            } else {
                return count;
            }
        })

        // Once we have the real count we can get the array.
        .then(function(arrayOrCount) {
            if (Array.isArray(arrayOrCount)) {
                return arrayOrCount;
            }
            var count = arrayOrCount;
            if (count === undefined && that.type.isArray()) {
                count = that.type.arrayLength();
            } else if (count === undefined) {
                throw new Error("Unknown array type: " + that.type);
            }

            if (count == 0 || that.isNull()) {
                return [];
            }

            if (count > 100000) {
                throw new Error("Arrays with over 100,000 elements cannot be retrieved all at once.")
            }

            var array = [];
            for (var i = 0; i < count; ++i) {
                array.push(that.idx(i));
            }
            return Promise.all(array);
        });
    }
});