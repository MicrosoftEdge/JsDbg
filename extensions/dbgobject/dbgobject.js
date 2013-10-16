"use strict";

// dbgobject.js
// Peter Salas
//
// A convenience library, written on top of JsDbg, to allow convenient navigation of objects.
// Provides the following interface:
//   - f(string) -> DbgObject               [workhorse method, navigates to an object contained or pointed to by another object]
//   - deref() -> DbgObject                 [derefences a DbgObject; generally only used with arrays of pointers]
//   - as(string) -> DbgObject              ["casts" the object to the given type]
//   - idx(number) -> DbgObject             [gets the object at a given index in an array]
//   - array(length) -> array               [gets an array of DbgObjects or numbers]
//   - unembed(string, string)              [moves from an embedded structure to the containing structure]
//   - val() -> number                      [reads a number]
//   - ptr() -> number                      [gets the pointer to the object]
//   - constant()                           [gets the name of a constant]
//   - equals(DbgObject) -> bool            [are two DbgObjects the same pointer?]
//   - vtable() -> string                   [returns the fully specified type of the vtable, if there is one]
//   - vcast() -> DbgObject                 [gets the type of the vtable and attempts a cast]
//   - fields() -> [{name, offset, value}]  [gets all the fields available]
//   - isNull() -> bool                     [indicates if the object is null]
//   - isPointer() -> bool                  [indicates if the object is a pointer]

var DbgObject = (function() {
    // bitcount and bitoffset are optional.
    function DbgObject(module, type, pointer, bitcount, bitoffset, structSize) {
        this.module = module;
        this._pointer = pointer;
        this.bitcount = bitcount;
        this.bitoffset = bitoffset;
        this.structSize = structSize;

        // Cleanup type name:
        //  - remove whitespace from the beginning and end
        this.typename = type
            .replace(/\s+$/g, '')
            .replace(/^\s+/g, '');

        // Get the array size.
        var arrayRegex = /\[[0-9]+\]/g;
        var matches = this.typename.match(arrayRegex);
        if (matches) {
            this._isArray = true;
            // might be a multi-dimensional array
            this._arrayLength = 1;
            for (var i = 0; i < matches.length; ++i) {
                this._arrayLength *= parseInt(matches[i].substr(1, matches[i].length - 2));
            }
            this.typename = this.typename.replace(arrayRegex, '');

            if (this._arrayLength == 0) {
                this.structSize = undefined;
            } else {
                this.structSize = this.structSize / this._arrayLength;
            }
        } else {
            this._isArray = false;
            this._arrayLength = 0;
        }
    }

    function jsDbgPromise(method) {
        if (typeof(method) != typeof(function() {})) {
            throw new Error("Invalid method.");
        }
        var methodArguments = [];
        for (var i = 1; i < arguments.length; ++i) {
            methodArguments.push(arguments[i]);
        };
        return new Promise(function(success, error) {
            methodArguments.push(function(result) {
                success(result);
            });
            method.apply(JsDbg, methodArguments)
        })
        .then(function (result) { 
            if (result.error) {
                throw new Error(result.error);
            }
            return result; 
        });
    }

    function checkSync(promise) {
        if (JsDbg.IsRunningSynchronously() && Promise.isPromise(promise)) {
            var retval = undefined;
            var didError = false;
            promise.then(function(result) {
                retval = result;
            }, function(error) {
                didError = true;
                retval = error;
            });

            if (didError) {
                throw retval;
            }
            return retval;
        } else {
            return promise;
        }
    }

    function checkSyncDbgObject(promise) {
        promise = checkSync(promise);
        if (Promise.isPromise(promise)) {
            return new PromisedDbgObject(promise);
        } else {
            return promise;
        }
    }

    DbgObject.ForcePromiseIfSync = checkSync;

    var typeOverrides = {};
    DbgObject.AddTypeOverride = function(module, type, field, overriddenType) {
        var key = module + "!" + type + "." + field;
        typeOverrides[key] = overriddenType;
    }
    function getFieldType(module, type, field, jsDbgType) {
        var key = module + "!" + type + "." + field;
        if (key in typeOverrides) {
            return typeOverrides[key];
        } else {
            return jsDbgType;
        }
    }

    var descriptionTypes = {};
    var descriptionFunctions = [];
    DbgObject.AddTypeDescription = function(module, typeNameOrFn, description) {
        if (typeof(typeNameOrFn) == typeof("")) {
            descriptionTypes[module + "!" + typeNameOrFn] = description;
        } else if (typeof(typeNameOrFn) == typeof(function(){})) {
            descriptionFunctions.push({
                module: module, 
                condition: typeNameOrFn, 
                description: description
            });
        } else {
            throw new Error("You must pass a string or regular expression for the type name.");
        }
    }

    function getTypeDescriptionFunction(module, type) {
        var key = module + "!" + type;
        if (key in descriptionTypes) {
            return descriptionTypes[key];
        } else {
            // Check the regex array.
            for (var i = 0; i < descriptionFunctions.length; ++i) {
                if (descriptionFunctions[i].module == module && descriptionFunctions[i].condition(type)) {
                    return descriptionFunctions[i].description;
                }
            }
        }

        return null;
    }
    function hasTypeDescription(dbgObject) {
        return getTypeDescriptionFunction(dbgObject.module, dbgObject.typename) != null;
    }

    function getTypeDescription(dbgObject) {
        var description = getTypeDescriptionFunction(dbgObject.module, dbgObject.typename);
        if (description == null) {
            description = function(obj) {
                // Default description: first try to get val(), then just provide the pointer with the type.
                return Promise.as(obj.val())
                .then(
                    function(x) { return x;},
                    function(err) {
                        return obj.typename + " " + obj.ptr();
                    }
                ); 
            }
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
    }

    DbgObject.sym = function(symbol) {
        return checkSyncDbgObject(
            jsDbgPromise(JsDbg.LookupSymbol, symbol).then(function(result) {
                var typedNull = new DbgObject(result.module, result.type, 0);
                if (typedNull._isPointer()) {
                    return new DbgObject(result.module, typedNull._getDereferencedTypeName(), result.value);
                } else {
                    return new DbgObject(result.module, "void", result.value);
                }
            })
        );
    }

    DbgObject.NULL = new DbgObject("", "", 0, 0, 0);

    DbgObject.prototype._getStructSize = function() {
        if (this.structSize !== undefined) {
            return Promise.as(this.structSize);
        } else if (this._isPointer()) {
            return jsDbgPromise(JsDbg.GetPointerSize).then(function(result) {
                return result.pointerSize;
            });
        } else {
            return jsDbgPromise(JsDbg.LookupTypeSize, this.module, this.typename).then(function(result) {
                return result.size;
            });
        }
    }

    DbgObject.prototype._getDereferencedTypeName = function() {
        if (this._isPointer()) {
            return this.typename.substring(0, this.typename.length - 1);
        } else {
            return "void";
        }
    }

    DbgObject.prototype._off = function(offset) {
        return new DbgObject(this.module, this.typename, this._pointer + offset, this.bitcount, this.bitoffset, this.structSize);
    }

    DbgObject.prototype._isPointer = function() {
        return this.typename[this.typename.length - 1] == "*";
    }

    DbgObject.prototype._isFloat = function() {
        return this.typename == "float" || this.typename == "double";
    }

    DbgObject.prototype.deref = function() {
        var that = this;
        return checkSyncDbgObject(
            jsDbgPromise(JsDbg.ReadPointer, that._pointer).then(function(result) {
                return new DbgObject(that.module, that._getDereferencedTypeName(), result.value);
            })
        );
    }

    DbgObject.prototype.f = function(field) {
        var parts = field.split(".");
        if (parts.length > 1) {
            // multiple fields were specified
            var current = this;
            for (var i = 0; i < parts.length; ++i) {
                current = current.f(parts[i]);
            }
            return current;
        }

        var arrayIndexRegex = /\[[0-9]+\]$/;
        var indexMatches = field.match(arrayIndexRegex);
        var index = 0;
        if (indexMatches) {
            index = parseInt(indexMatches[0].substr(1, indexMatches[0].length - 2));
        }
        field = field.replace(arrayIndexRegex, '');

        if (this._isPointer()) {
            throw new Error("You cannot do a field lookup on a pointer.");
        } else if (this._pointer == 0) {
            throw new Error("You cannot get a field from a null pointer.");
        } else if (this._isArray) {
            throw new Error("You cannot get a field from an array.");
        }

        var that = this;
        return checkSyncDbgObject(
            jsDbgPromise(JsDbg.LookupFieldOffset, that.module, that.typename, field)
                .then(function(result) {
                    var target = new DbgObject(
                        that.module, 
                        getFieldType(that.module, that.typename, field, result.type), 
                        that._pointer + result.offset, 
                        result.bitcount, 
                        result.bitoffset, 
                        result.size
                    );

                    if (indexMatches) {
                        // We want to do an index on top of this; this will make "target" a promised DbgObject.
                        target = target.idx(index);
                    }
                    return target;
                })
                .then(function(target) {
                    if (target._isPointer()) {
                        return target.deref();
                    } else {
                        return target;
                    }
                })
        );
    }

    DbgObject.prototype.unembed = function(type, field) {
        var that = this;
        return checkSyncDbgObject(
            jsDbgPromise(JsDbg.LookupFieldOffset, that.module, type, field)
                .then(function(result) { 
                    return new DbgObject(that.module, type, that._pointer - result.offset); 
                })
        );
    }

    DbgObject.prototype.as = function(type) {
        return new DbgObject(this.module, type, this._pointer, this.bitcount, this.bitoffset, this.structSize);
    }

    DbgObject.prototype.idx = function(index) {
        var that = this;
        return checkSyncDbgObject(
            // index might be a promise...
            Promise.as(index)
                // Get the struct size...
                .then(function(index) { return Promise.join(that._getStructSize(), index); })
                // And offset the struct.
                .then(function(args) { return that._off(args[0] * args[1]); })
        );
    }

    DbgObject.prototype.val = function() {
        if (this.typename == "void") {
            return checkSync(Promise.as(this._pointer));
        }

        if (this._isArray) {
            throw new Error("You cannot get a value of an array.");
        }

        var that = this;
        return checkSync(
            // Lookup the structure size...
            this._getStructSize()

            // Read the value...
            .then(function(structSize) {
                return jsDbgPromise(JsDbg.ReadNumber, that._pointer, structSize, that._isFloat());
            })

            // If we're a bit field, extract the bits.
            .then(function(result) {
                var value = result.value;
                if (that.bitcount && that.bitoffset !== undefined) {
                    value = (value >> that.bitoffset) & ((1 << that.bitcount) - 1);
                }
                return value;
            })
        );
    }

    DbgObject.prototype.constant = function() {
        var that = this;
        return checkSync(
            // Read the value (coerce to promise in case we're running synchronously)...
            Promise.as(this.val())

            // Lookup the constant name...
            .then(function(value) { return jsDbgPromise(JsDbg.LookupConstantName, that.module, that.typename, value); })

            // And return it.
            .then(function(result) { return result.name; })
        );
    }

    DbgObject.prototype.desc = function() {
        return checkSync(getTypeDescription(this));
    }

    DbgObject.prototype.array = function(count) {
        var that = this;
        return checkSync(
            // "count" might be a promise...
            Promise.as(count)

            // Once we have the real count we can get the array.
            .then(function(count) {
                if (count == undefined && that._isArray) {
                    count = that._arrayLength;
                }
                // Get the struct size...
                return that._getStructSize()
                    // Read the array...
                    .then(function(structSize) { return jsDbgPromise(JsDbg.ReadArray, that._pointer, structSize, that._isFloat(), count); })

                    // Process the array into DbgObjects if necessary.
                    .then(function(result) {
                        if (that._isPointer()) {
                            // If the type is a pointer, return an array of DbgObjects.
                            var itemTypename = that._getDereferencedTypeName();
                            return result.array.map(function(x) { return new DbgObject(that.module, itemTypename, x); });
                        } else {
                            // Otherwise, the items are values.
                            return result.array;
                        }
                    }, function(error) {
                        // We weren't able to read the array, so just make an array of idx(i) calls.
                        var array = [];
                        for (var i = 0; i < count; ++i) {
                            array.push(that.idx(i));
                        }
                        return Promise.join(array);
                    });
            })
        );
    }

    DbgObject.prototype.ptr = function() {
        return this._pointer == 0 ? "NULL" : "0x" + this._pointer.toString(16);
    }

    DbgObject.prototype.pointerValue = function() {
        return this._pointer;
    }

    DbgObject.prototype.typeDescription = function() {
        return this.typename + (this._isArray ? "[" + this._arrayLength + "]" : "");
    }

    DbgObject.prototype.equals = function(other) {
        if (this._pointer === undefined || other._pointer === undefined) {
            throw "The pointer values are undefined.";
        }
        return this._pointer == other._pointer;
    }

    DbgObject.prototype.vtable = function() {
        var pointer = this._pointer;
        return checkSync(
            // Read the value at the this pointer...
            jsDbgPromise(JsDbg.ReadPointer, pointer)

            // Lookup the symbol at that value...
            .then(function(result) { 
                return jsDbgPromise(JsDbg.LookupSymbolName, result.value);
            })

            // And strip away the vftable suffix..
            .then(function(result) {
                return result.symbolName.substring(result.symbolName.indexOf("!") + 1, result.symbolName.indexOf("::`vftable'"));
            })
        );
    }

    DbgObject.prototype.vcast = function() {
        var that = this;
        return checkSyncDbgObject(
            // Lookup the vtable type (coerce to promise in case we're running synchronously)...
            Promise.as(this.vtable())
            .then(function(vtableType) {
                // Lookup the base class offset...
                return jsDbgPromise(JsDbg.LookupBaseTypeOffset, that.module, vtableType, that.typename)

                // And shift/cast.
                .then(function(result) {
                    return new DbgObject(that.module, vtableType, that._pointer - result.offset);            
                });
            })
        );
    }

    DbgObject.prototype.fields = function() {
        if (this._isPointer()) {
            throw new Error("You cannot lookup fields on a pointer.");
        }

        var that = this;
        return checkSync(
            // Lookup the fields...
            jsDbgPromise(JsDbg.LookupFields, this.module, this.typename)

            // Sort them by offset and massage the output.
            .then(function(result) {
                result.fields.sort(function(a, b) { return a.offset - b.offset; });
                return result.fields.map(function(field) {
                    return {
                        name: field.name,
                        offset: field.offset,
                        size: field.size,
                        value: new DbgObject(
                            that.module, 
                            getFieldType(that.module, that.typename, field.name, field.type), 
                            that._pointer + field.offset, 
                            field.bitcount, 
                            field.bitoffset, 
                            field.size
                        )
                    };
                });
            })
        );
    }

    DbgObject.prototype.arrayLength = function() {
        return this._arrayLength;
    }

    DbgObject.prototype.isArray = function() {
        return this._isArray;
    }

    DbgObject.prototype.isNull = function() {
        return this._pointer == 0;
    }

    DbgObject.prototype.isPointer = function() {
        return this._isPointer();
    }

    return DbgObject;
})();

var PromisedDbgObject = Promise.promisedType(DbgObject, ["f", "as", "deref", "idx", "unembed", "vcast", "fix"]);
