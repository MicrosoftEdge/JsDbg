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
//   - val() -> number                      [reads a number]
//   - ptr() -> number                      [gets the pointer to the object]
//   - constant(offset?, count?)            [gets the name of a constant.  optional args are for bit fields]
//   - equals(DbgObject) -> bool            [are two DbgObjects the same pointer?]
//   - vtable() -> string                   [returns the fully specified type of the vtable, if there is one]
//   - vcast() -> DbgObject                 [gets the type of the vtable and attempts a cast]
//   - isNull() -> bool                     [indicates if the object is null]


// bitcount and bitoffset are optional.
function DbgObject(module, type, pointer, bitcount, bitoffset) {
    this.module = module;
    this.pointer = pointer;
    this.bitcount = bitcount;
    this.bitoffset = bitoffset;

    // Cleanup type name:
    //  - remove whitespace from the beginning and end
    //  - strip [] from inline arrays
    this.typename = type
        .replace(/\s+$/g, '')
        .replace(/^\s+/g, '')
        .replace("[]", "");
}

DbgObject.sym = function(symbol) {
    var result = JsDbg.SyncLookupSymbol(symbol);
    if (result.error) {
        throw result.error;
    }

    var typedNull = new DbgObject(result.module, result.type, 0);
    if (typedNull._isPointer()) {
        return new DbgObject(result.module, typedNull._getDereferencedTypeName(), result.value);
    } else {
        return result.value;
    }
}

DbgObject.prototype._isPointer = function() {
    return this.typename[this.typename.length - 1] == "*";
}

DbgObject.prototype._getStructSize = function() {
    var structSize = 0;
    if (this._isPointer()) {
        var result = JsDbg.SyncGetPointerSize();
        if (result.error) {
            throw result.error;
        }
        structSize = result.pointerSize;
    } else {
        var result = JsDbg.SyncLookupFieldOffset(this.module, this.typename, []);
        if (result.error) {
            throw result.error;
        }
        structSize = result.size;
    }
    return structSize;
}

DbgObject.prototype._getDereferencedTypeName = function() {
    if (this._isPointer()) {
        return this.typename.substring(0, this.typename.length - 1);
    } else {
        return "void";
    }
}

DbgObject.prototype._off = function(offset) {
    return new DbgObject(this.module, this.typename, this.pointer + offset);
}

DbgObject.prototype.deref = function() {
    var result = JsDbg.SyncReadPointer(this.pointer);
    if (result.error) {
        throw result.error;
    }

    var value = result.value;

    return new DbgObject(this.module, this._getDereferencedTypeName(), value);
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

    if (this._isPointer()) {
        throw "You cannot do a field lookup on a pointer.";
    } else if (this.pointer == 0) {
        throw "You cannot get a field from a null pointer.";
    }

    var result = JsDbg.SyncLookupFieldOffset(this.module, this.typename, [field]);
    if (result.error) {
        throw result.error;
    }

    var target = new DbgObject(this.module, result.type, this.pointer + result.offset, result.bitcount, result.bitoffset);
    if (target._isPointer()) {
        return target.deref();
    } else {
        return target;
    }
}

DbgObject.prototype.unembed = function(type, field) {
    var result = JsDbg.SyncLookupFieldOffset(this.module, type, [field]);
    if (result.error) {
        throw result.error;
    }

    return new DbgObject(this.module, type, this.pointer - result.offset);
}

DbgObject.prototype.as = function(type) {
    return new DbgObject(this.module, type, this.pointer, this.bitcount, this.bitoffset);
}

DbgObject.prototype.idx = function(index) {
    return this._off(this._getStructSize() * index);
}

DbgObject.prototype.val = function() {
    if (this.typename == "void") {
        return this.pointer;
    }

    var structSize = this._getStructSize();
    var result = JsDbg.SyncReadNumber(this.pointer, structSize);
    if (result.error) {
        throw result.error;
    }

    var value = result.value;
    if (this.bitcount && this.bitoffset !== undefined) {
        value = (value >> this.bitoffset) & ((1 << this.bitcount) - 1);
    }
    return value;
}

DbgObject.prototype.constant = function() {
    var value = value = this.val();

    var result = JsDbg.SyncLookupConstantName(this.module, this.typename, value);
    if (result.error) {
        throw result.error;
    }
    return result.name;
}

DbgObject.prototype.array = function(count) {
    // Try to read the array.  If it's an array of pointers or ints we can do it all at once.
    var structSize = this._getStructSize();
    var result = JsDbg.SyncReadArray(this.pointer, structSize, count);
    if (result.error) {
        // We weren't able to read the array, so just make an array of idx(i) calls.
        var array = [];
        for (var i = 0; i < count; ++i) {
            array.push(this.idx(i));
        }
        return array;
    }

    if (this._isPointer()) {
        // If the type is a pointer, return an array of DbgObjects.
        var that = this;
        var itemTypename = this._getDereferencedTypeName();
        return result.array.map(function(x) { return new DbgObject(that.module, itemTypename, x); });
    } else {
        // Otherwise, the items are values.
        return result.array;
    }
}

DbgObject.prototype.ptr = function() {
    return this.pointer == 0 ? "NULL" : "0x" + this.pointer.toString(16);
}

DbgObject.prototype.equals = function(other) {
    return this.pointer == other.pointer;
}

DbgObject.prototype.vtable = function() {
    var pointer = this.pointer;
    var vtableAddress = JsDbg.SyncReadPointer(pointer);
    if (vtableAddress.error) {
        throw vtableAddress.error;
    }

    var result = JsDbg.SyncLookupSymbolName(vtableAddress.value);
    if (result.error) {
        throw result.error;
    }

    return result.symbolName.substring(result.symbolName.indexOf("!") + 1, result.symbolName.indexOf("::`vftable'"));
}

DbgObject.prototype.vcast = function() {
    var vtableType = this.vtable();
    var result = JsDbg.SyncLookupBaseTypeOffset(this.module, vtableType, this.typename);
    if (result.error) {
        throw result.error;
    }

    return new DbgObject(this.module, vtableType, this.pointer - result.offset);
}

DbgObject.prototype.isNull = function() {
    return this.pointer == 0;
}
