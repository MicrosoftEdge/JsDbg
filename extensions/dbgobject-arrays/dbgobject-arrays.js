"use strict";

// dbgobject-arrays.js
// Functionality for retrieiving arrays of DbgObjects.
JsDbg.OnLoad(function() {
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
        return Promise.map(result, function (obj) { return obj.isType(resultType); })
        .then(function (areAllTypes) {
            var incorrectIndex = areAllTypes.indexOf(false);
            if (incorrectIndex != -1) {
                throw new Error("The \"" + that.name + "\" array on " + parentDbgObject.typeDescription() + " was supposed to return an array of " + resultType + " but there was an unrelated " + result[incorrectIndex].typeDescription() + ".")
            }

            return result;
        });
    }

    DbgObject._help_AddDynamicArrayType = {
        description: "Registers a type as a dynamic array type and provides a transformation to get the contents as an array.",
        arguments: [
            {name:"module", type:"string", description: "The module of the array type."},
            {name:"typeNameOrFn", type:"string/function(string) -> bool", description: "The array type (or a predicate that matches the array type)."},
            {name:"transformation", type:"function(DbgObject) -> (promised) array", description: "A function that converts a DbgObject of the specified type to an array."}
        ]
    }
    DbgObject.AddDynamicArrayType = function(module, typeNameOrFn, transformation) {
        return registeredArrayTypes.addExtension(module, typeNameOrFn, "", new ArrayField(null, null, transformation));
    }

    DbgObject.AddArrayField = function(module, typeNameOrFn, name, resultingTypeNameOrFn, getter) {
        return registeredArrayTypes.addExtension(module, typeNameOrFn, name, new ArrayField(name, resultingTypeNameOrFn, getter));
    }

    DbgObject.prototype._help_array = {
        description: "Given a DbgObject that represents an array, retrieves an array of corresponding DbgObjects.",
        returns: "A promise to an array of DbgObjects.  If the array is an array of pointers, the pointers will be dereferenced.",
        arguments: [{name:"count (optional)", type:"int", description:"The number of items to retrieve.  Optional if the object represents an inline array or is a known array type."}]
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
                return result.extension.getter(result.dbgObject)
                .then(function (resultArray) {
                    return result.extension.ensureCompatibleResult(resultArray, that);
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

        .then(function (count) {
            if (!that._isArray && count === undefined) {
                return registeredArrayTypes.getExtensionIncludingBaseTypes(that, "")
                .then(function (result) {
                    if (result != null) {
                        return result.extension.getter(result.dbgObject);
                    } else {
                        return undefined;
                    }
                });
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
                // The array isn't an array of pointers.  Provide an array of idx calls instead.
                var array = [];
                for (var i = 0; i < count; ++i) {
                    array.push(that.idx(i));
                }
                return Promise.join(array);
            }
        });
    }
});