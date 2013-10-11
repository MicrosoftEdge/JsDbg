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

// bitcount and bitoffset are optional.
function DbgObject(module, type, pointer, bitcount, bitoffset) {
    this.module = module;
    this._pointer = pointer;
    this.bitcount = bitcount;
    this.bitoffset = bitoffset;

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
    } else {
        this._isArray = false;
        this._arrayLength = 0;
    }
}

function jsDbgPromise(method) {
    if (typeof(method) != typeof(function() {})) {
        return Promise.fail("Invalid method.");
    }
    var methodArguments = [];
    for (var i = 1; i < arguments.length; ++i) {
        methodArguments.push(arguments[i]);
    };
    return new Promise(function(success, error) {
        methodArguments.push(function(result) {
            if (result.error) {
                error(result.error);
            } else {
                success(result);
            }
        });
        method.apply(JsDbg, methodArguments)
    });
}

DbgObject.sym = function(symbol) {
    return new PromisedDbgObject(
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

DbgObject.prototype._getStructSize = function() {
    if (this._isPointer()) {
        return jsDbgPromise(JsDbg.GetPointerSize).then(function(result) {
            return result.pointerSize;
        });
    } else {
        return jsDbgPromise(JsDbg.LookupFieldOffset, this.module, this.typename, []).then(function(result) {
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
    return new DbgObject(this.module, this.typename, this._pointer + offset);
}

DbgObject.prototype.deref = function() {
    var that = this;
    return new PromisedDbgObject(
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
        return Promise.fail("You cannot do a field lookup on a pointer.");
    } else if (this._pointer == 0) {
        return Promise.fail("You cannot get a field from a null pointer.");
    } else if (this._isArray) {
        return Promise.fail("You cannot get a field from an array.");
    }

    var that = this;
    return new PromisedDbgObject(
        jsDbgPromise(JsDbg.LookupFieldOffset, that.module, that.typename, [field])
            .then(function(result) {
                var target = new DbgObject(that.module, result.type, that._pointer + result.offset, result.bitcount, result.bitoffset);

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
    return new PromisedDbgObject(
        jsDbgPromise(JsDbg.LookupFieldOffset, that.module, type, [field])
            .then(function(result) { 
                return new DbgObject(that.module, type, that._pointer - result.offset); 
            })
    );
}

DbgObject.prototype.as = function(type) {
    return new DbgObject(this.module, type, this._pointer, this.bitcount, this.bitoffset);
}

DbgObject.prototype.idx = function(index) {
    var that = this;
    return new PromisedDbgObject(
        Promise.as(index)
            .then(function(index) { return Promise.join(that._getStructSize(), index); })
            .then(function(args) { return that._off(args[0] * args[1]); })
    );
}

DbgObject.prototype.val = function() {
    if (this.typename == "void") {
        return Promise.as(this._pointer);
    }

    if (this._isArray) {
        return Promise.fail("You cannot get a value of an array.");
    }

    var that = this;
    return this._getStructSize()
        .then(function(structSize) {
            return jsDbgPromise(JsDbg.ReadNumber, that._pointer, structSize);
        })
        .then(function(result) {
            var value = result.value;
            if (that.bitcount && that.bitoffset !== undefined) {
                value = (value >> that.bitoffset) & ((1 << that.bitcount) - 1);
            }
            return value;
        });
}

DbgObject.prototype.constant = function() {
    var that = this;
    return this.val()
        .then(function(value) { return jsDbgPromise(JsDbg.LookupConstantName, that.module, that.typename, value); })
        .then(function(result) { return result.name; });
}

DbgObject.prototype.array = function(count) {
    var that = this;
    return Promise.as(count)
        .then(function(count) {
            if (count == undefined && that._isArray) {
                count = that._arrayLength;
            }
            return Promise.join(that._getStructSize(), count);
        })
        .then(function(structSizeAndCount) { return jsDbgPromise(JsDbg.ReadArray, that._pointer, structSizeAndCount[0], structSizeAndCount[1]); })
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
    return Promise.join(this.ptr(), other.ptr())
        .then(function(ptrs) { return ptrs[0] == ptrs[1]; });
}

DbgObject.prototype.vtable = function() {
    var pointer = this._pointer;
    return jsDbgPromise(JsDbg.ReadPointer, pointer)
        .then(function(result) { 
            return jsDbgPromise(JsDbg.LookupSymbolName(result.value));
        })
        .then(function(result) {
            return result.symbolName.substring(result.symbolName.indexOf("!") + 1, result.symbolName.indexOf("::`vftable'"));
        });
}

DbgObject.prototype.vcast = function() {
    var that = this;
    return this.vtable()
        .then(function(vtableType) {
            return jsDbgPromise(JsDbg.LookupBaseTypeOffset, that.module, vtableType, that.typename);
        })
        .then(function(result) {
            return new DbgObject(that.module, vtableType, that._pointer - result.offset);            
        });
}

DbgObject.prototype.fields = function() {
    if (this._isPointer()) {
        return Promise.fail("You cannot lookup fields on a pointer.");
    }

    var that = this;
    return jsDbgPromise(JsDbg.LookupFields, this.module, this.typename)
        .then(function(result) {
            result.fields.sort(function(a, b) { return a.offset - b.offset; });
            return result.fields.map(function(field) {
                return {
                    name: field.name,
                    offset: field.offset,
                    value: new DbgObject(that.module, field.type, that._pointer + field.offset, field.bitcount, field.bitoffset)
                };
            });
        });
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

DbgObject.prototype._isPointer = function() {
    return this.typename[this.typename.length - 1] == "*";
}

DbgObject.prototype.isPointer = function() {
    return this._isPointer();
}

var PromisedDbgObject = Promise.promisedType(DbgObject, ["f", "as", "deref", "idx", "unembed", "vcast"]);
