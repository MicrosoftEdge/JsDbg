"use strict";

// dbgobject-arrays.js
// Functionality for retrieiving arrays of DbgObjects.
Loader.OnLoad(function() {
    var registeredArrayTypes = new DbgObject.TypeExtension();
    DbgObject.ArrayFields = registeredArrayTypes;

    function ArrayField(name, typeName, getter) {
        this.name = name;
        this.typeName = typeName;
        this.getter = getter;
    }

    ArrayField.prototype.ensureCompatibleResult = function(result, parentDbgObject) {
        if (!Array.isArray(result)) {
            throw new Error("The \"" + this.name + "\" array on " + parentDbgObject.typeDescription() + " did not return an array.");
        }

        var resultType = this.typeName instanceof Function ? this.typeName(parentDbgObject.typename) : this.typeName;
        if (resultType == null) {
            return Promise.as(result);
        }

        var that = this;
        return Promise.map(Promise.join(result), function (obj) { return obj.isType(resultType); })
        .then(function (areAllTypes) {
            var incorrectIndex = areAllTypes.indexOf(false);
            if (incorrectIndex != -1) {
                throw new Error("The \"" + that.name + "\" array on " + parentDbgObject.typeDescription() + " was supposed to return an array of " + resultType + " but there was an unrelated " + result[incorrectIndex].typeDescription() + ".")
            }

            return result;
        });
    }

    DbgObject._help_AddArrayField = {
        description: "Registers an array that can be retrived from DbgObjects of a given type.",
        arguments: [
            {name:"module", type:"string", description: "The module of the type to extend."},
            {name:"typeNameOrFn", type:"string/function(string) -> bool", description: "The type to extend (or a predicate that matches the type to extend)."},
            {name:"name", type:"string", description:"The name of the array."},
            {name:"resultingTypeNameOrFn", type:"string/function(string) -> string", description: "The type of the items in the resulting array."},
            {name:"getter", type:"function(DbgObject) -> (promised) array of DbgObjects", description: "A function that retrieves the array."}
        ]
    }

    DbgObject.AddArrayField = function(module, typeNameOrFn, name, resultingTypeNameOrFn, getter) {
        return registeredArrayTypes.addExtension(module, typeNameOrFn, name, new ArrayField(name, resultingTypeNameOrFn, getter));
    }

    DbgObject.RemoveArrayField = function(module, typeNameOrFn, name) {
        return registeredArrayTypes.removeExtension(module, typeNameOrFn, name);
    }

    DbgObject.UpdateArrayField = function(module, typeNameOrFn, oldName, newName, newResultingTypeNameOrFn) {
        registeredArrayTypes.renameExtension(module, typeNameOrFn, oldName, newName);
        var extension = registeredArrayTypes.getExtension(module, typeNameOrFn, newName);
        if (extension.typeName != newResultingTypeNameOrFn) {
            extension.typeName = newResultingTypeNameOrFn;
            registeredArrayTypes.notifyListeners(module, typeNameOrFn, newName, extension, "typechange", newResultingTypeNameOrFn);
        }
    }

    DbgObject.prototype._help_array = {
        description: "Given a DbgObject that represents an array, retrieves an array of corresponding DbgObjects.",
        returns: "A promise to an array of DbgObjects.  If the array is an array of pointers, the pointers will be dereferenced.",
        arguments: [{name:"count/name (optional)", type:"int/string", description:"The number of items to retrieve, or the name of the array.  Optional if the object represents an inline array."}]
    }
    DbgObject.prototype.array = function(count) {
        var that = this;
        if (typeof count == typeof "") {
            var name = count;
            return registeredArrayTypes.getExtensionIncludingBaseTypes(this, name)
            .then(function (result) {
                if (result == null) {
                    throw new Error("There was no array \"" + name + "\" on " + that.typeDescription());
                }
                return Promise.as(result.extension.getter(result.dbgObject))
                .then(function (resultArray) {
                    return result.extension.ensureCompatibleResult(resultArray, result.dbgObject);
                })
            })
        }

        // "count" might be a promise...
        return Promise.as(count)
        .then(function (count) {
            // If we were given a DbgObject, go ahead and get the value.
            if (count !== undefined && count.val == DbgObject.prototype.val) {
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
            } else {
                var count = arrayOrCount;
            }

            if (count === undefined && that._isArray) {
                count = that._arrayLength;
            } else if (count === undefined) {
                throw new Error("Unknown array type: " + that.typename);
            }

            if (count == 0 || that.isNull()) {
                return [];
            }

            if (that.isPointer()) {
                return that.bigvals(count)
                .then(function (values) {
                    var itemTypename = that._getDereferencedTypeName();
                    return values.map(function(x) { return new DbgObject(that.module, itemTypename, x); });
                });
            } else {
                return that._getStructSize()
                .then(function (structSize) {
                    var array = [];
                    for (var i = 0; i < count; ++i) {
                        array.push(that._off(i * structSize));
                    }
                    return array;
                })
            }
        });
    }
});