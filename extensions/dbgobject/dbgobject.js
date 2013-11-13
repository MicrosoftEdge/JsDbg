"use strict";

// dbgobject.js
// Peter Salas
//
// A convenience library, written on top of JsDbg, to allow convenient navigation of objects.
// Documentation is provided via _help_ properties and can be viewed with Documentation extension.

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

        this._isUnsigned = this.typename.indexOf("unsigned ") == 0;

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

            if (this._arrayLength == 0 || this.structSize === undefined) {
                this.structSize = undefined;
            } else {
                this.structSize = this.structSize / this._arrayLength;
            }
        } else {
            this._isArray = false;
            this._arrayLength = 0;
        }
    }
    Help.Register(DbgObject);
    DbgObject._help = {
        name: "DbgObject",
        description: "Provides convenient navigation of C++ objects in the debuggee.",
        notes: "<p>DbgObjects are immutable.</p><p>Note that several methods return either Promises or values depending on whether JsDbg is currently running synchronously.  Promises to a DbgObject returned by these methods can be treated as DbgObjects where <em>every</em> method returns a promise.</p>",
        _help_constructor: {
            arguments: [
                {name: "module", type:"string", description:"The module that contains the type."},
                {name: "type", type:"string", description:"The type of the object."},
                {name: "pointer", type:"int", description:"The address of the object in memory."},
                {name: "bitcount", type:"int", description:"(optional) The number of bits if the object is held in a bitfield."},
                {name: "bitoffset", type:"int", description:"(optional) The bit offset from the address."},
                {name: "structSize", type:"int", description:"(optional) The size of the object in memory."}
            ],
            notes: "The last three arguments are generally only used internally by other DbgObject methods."
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

    DbgObject._help_ForcePromiseIfSync = {
        description: "Forces a promise to its value if JsDbg is currently running synchronously.",
        returns: "The given promise's if JsDbg is running synchronously, the promise itself otherwise.",
        notes: "This method requires that a given promise is already fulfilled if JsDbg is running synchronously.",
        arguments: [
            {name: "promise", type:"Promise", description: "A promise to force if running synchronously."}
        ]
    },
    DbgObject.ForcePromiseIfSync = checkSync;

    var typeOverrides = {};
    DbgObject._help_AddTypeOverride = {
        description: "Causes DbgObject to ignore the type provided by JsDbg for a given field in a struct.",
        notes: "This is useful for adding enum information on fields that are stored as numbers.",
        arguments: [
            {name: "module", type:"string", description:"The module of the type."},
            {name: "type", type:"string", description:"The class or struct type whose field's type we wish to specify."},
            {name: "field", type:"string", description:"The field whose type will be specified."},
            {name: "overriddenType", type:"string", description:"The type to use."}
        ]
    };
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
    DbgObject._help_AddTypeDescription = {
        description: "Provides a function to produce type-specific formatting of DbgObjects.",
        notes: "The provided function will be used whenever <code>desc()</code> is called on a DbgObject with a matching type.",
        arguments:[
            {name: "module", type:"string", description:"The module of the type."},
            {name: "typeNameOrFn", type:"string/function(string) -> bool", description: "The type name, or a predicate that matches a type name."},
            {name: "description", type:"function(DbgObject) -> string", description: "A function that returns an HTML fragment to describe a given DbgObject."}
        ]
    };
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

    var scalarTypes = [
        "bool",
        "char",
        "__int8",
        "short",
        "__int16",
        "int",
        "__int32",
        "long",
        "float",
        "double",
        "long double",
        "long long",
        "__int64"
    ];
    scalarTypes = scalarTypes.reduce(function(obj, item) { 
        obj[item] = true;
        obj["unsigned " + item] = true;
        obj["signed " + item] = true;
        return obj;
    }, {});

    function getTypeDescription(dbgObject) {
        var customDescription = getTypeDescriptionFunction(dbgObject.module, dbgObject.typename);
        var hasCustomDescription = customDescription != null;
        if (!hasCustomDescription) {
            customDescription = function(x) { 
                if (x.typename in scalarTypes) {
                    return x.val(); 
                } else if (x.isPointer()) {
                    return Promise.as(x.deref())
                    .then(function (dereferenced) {
                        return dereferenced.htmlTypeDescription() + " " + dereferenced.ptr();
                    });
                } else {
                    return x.htmlTypeDescription() + " " + x.ptr();
                }
            };
        }
        var description = function(obj) {
            // Default description: first try to get val(), then just provide the pointer with the type.
            return Promise.as(obj)
            .then(customDescription)
            .then(
                function(x) { return x;},
                function(err) {
                    if (hasCustomDescription) {
                        // The custom description provider had an error.
                        return obj.typename + "???";
                    } else {
                        return obj.typename + " " + obj.ptr();
                    }
                }
            ); 
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

    DbgObject._help_global = {
        description: "Evaluates a reference to a global symbol in the debuggee.",
        returns: "(A promise to) a DbgObject representing the symbol.",
        arguments: [
            {name:"symbol", type:"string", description:"The module-prefixed global symbol to evaluate."}
        ]
    }
    DbgObject.global = function(symbol) {
        return checkSyncDbgObject(
            jsDbgPromise(JsDbg.LookupSymbol, symbol, true).then(function(result) {
                return new DbgObject(result.module, result.type, result.pointer);
            })
        );
    }

    DbgObject._help_sym = {
        description: "Evaluates a reference to a symbol in the debuggee.",
        returns: "(A promise to) a DbgObject representing the symbol.",
        arguments: [
            {name:"symbol", type:"string", description:"The symbol to evaluate."}
        ]
    }
    DbgObject.sym = function(symbol) {
        return checkSyncDbgObject(
            jsDbgPromise(JsDbg.LookupSymbol, symbol, false).then(function(result) {
                return new DbgObject(result.module, result.type, result.pointer);
            })
        );
    }

    DbgObject._help_NULL = {description: "A DbgObject that represents a null value."}
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

    DbgObject.prototype._help_size = {
        description:"Gets the size of the DbgObject in bytes.",
        returns: "(A promise to) an integral number of bytes."
    }
    DbgObject.prototype.size = function() {
        return checkSync(this._getStructSize());
    }

    DbgObject.prototype._help_deref = {
        description: "Derferences a DbgObject that represents a pointer.",
        returns: "(A promise to) a DbgObject."
    }
    DbgObject.prototype.deref = function() {
        if (this.isNull()) {
            throw new Error("You cannot deref a NULL object.");
        }

        var that = this;
        return checkSyncDbgObject(
            jsDbgPromise(JsDbg.ReadPointer, that._pointer).then(function(result) {
                return new DbgObject(that.module, that._getDereferencedTypeName(), result.value);
            })
        );
    }

    DbgObject.prototype._help_f = {
        description: "Accesses a field on a DbgObject.  If the field is a pointer, it will be dereferenced.  If more than one field is given, they will be tried in order until one succeeds.",
        notes: "<p>Examples:\
<pre><code>\
    struct A {\n\
      B* b;\n\
      C c;\n\
    };\n\
    struct B {\n\
      C c;\n\
    };\n\
    struct C {\n\
      int value;\n\
    };\n\
</code></pre>\
<ul>\
<li><code>a.f(\"c\")</code> returns a DbgObject representing an object of type C.</li>\
<li><code>a.f(\"c.value\")</code> returns a DbgObject representing an int.</li>\
<li><code>a.f(\"b\")</code> returns a DbgObject representing an object of type B (<em>not</em> B*).</li>\
<li><code>a.f(\"b.c.value\")</code> returns a DbgObject representing an int.</li>\
<li><code>a.f(\"z\", \"b\")</code> returns a DbgObject representing an object of type B.</li>\
</ul></p>",
        returns: "(A promise to) a DbgObject.",
        arguments: [
            {name:"field", type:"string", description:"One or more fields (separated by \".\") to access."},
            {name:"...", description:"Fields to use if the prior field lookups failed (e.g. because a field has been renamed)."}
        ]
    }
    DbgObject.prototype.f = function(field) {
        if (arguments.length < 0) {
            throw new Error("You must provide a field.");
        } else if (arguments.length == 1) {
            return checkSyncDbgObject(this._fHelper(field));
        } else {
            var rest = [];
            for (var i = 1; i < arguments.length; ++i) {
                rest.push(arguments[i]);
            }
            var that = this;
            return checkSyncDbgObject(
                this._fHelper(field)
                .then(
                    function(x) { return x; },
                    function(err) {
                        return that._fHelper.apply(that, rest);
                    }
                )
            );
        }
    }

    DbgObject.prototype._fHelper = function(field) {
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
        return jsDbgPromise(JsDbg.LookupFieldOffset, that.module, that.typename, field)
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
    }

    DbgObject.prototype._help_unembed = {
        description: "Gets the containing structure from an embedded object.",
        returns: "(A promise to) a DbgObject.",
        arguments: [
            {name: "type", type:"string", description:"The containing type."},
            {name: "field", type:"string", description:"The field containing the callee DbgObject."}
        ]
    }
    DbgObject.prototype.unembed = function(type, field) {
        if (this.isNull()) {
            throw new Error("You cannot unembed a NULL object.");
        }

        var that = this;
        return checkSyncDbgObject(
            jsDbgPromise(JsDbg.LookupFieldOffset, that.module, type, field)
                .then(function(result) { 
                    return new DbgObject(that.module, type, that._pointer - result.offset); 
                })
        );
    }

    DbgObject.prototype._help_as = {
        description: "Casts a given DbgObject to another type.",
        returns: "A DbgObject.",
        arguments: [
            {name: "type", type: "string", description: "The type to cast to."},
            {name: "disregardSize", type:"bool", description: "(optional) Should the current object's size be disregarded?"}
        ],
        notes: "The object size will be preserved unless the <code>disregardSize</code> argument is given as true.\
                If the flag is given, this cast becomes roughly equivalent to <code>*(T*)&value</code>."
    }
    DbgObject.prototype.as = function(type, disregardSize) {
        return new DbgObject(this.module, type, this._pointer, this.bitcount, this.bitoffset, disregardSize ? undefined : this.structSize);
    }

    DbgObject.prototype._help_idx = {
        description: "Returns the i<sup>th</sup> object in an array after the given object.",
        returns: "(A promise to) a DbgObject.",
        arguments: [{name: "index", type:"int", description:"The index to retrieve."}],
        notes: "<p>Any object can be treated as if it is an array, i.e. <code>obj.idx(a + b)</code> is equivalent to <code>obj.idx(a).idx(b)</code>.</p>"
    }
    DbgObject.prototype.idx = function(index) {
        if (this.isNull()) {
            throw new Error("You cannot get an index from a NULL pointer.");
        }

        var that = this;
        return checkSyncDbgObject(
            // index might be a promise...
            Promise.as(index)
                // Get the struct size...
                .then(function(index) { return Promise.join([that._getStructSize(), index]); })
                // And offset the struct.
                .then(function(args) { return that._off(args[0] * args[1]); })
        );
    }

    DbgObject.prototype._help_val = {
        description: "Retrieves a scalar value held by a DbgObject.",
        returns: "(A promise to) a number."
    }
    DbgObject.prototype.val = function() {
        if (this.isNull()) {
            throw new Error("You cannot get a value from a NULL object.");
        }

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
                return jsDbgPromise(JsDbg.ReadNumber, that._pointer, structSize, that._isUnsigned, that._isFloat());
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

    DbgObject.prototype._help_constant = {
        description: "Retrieves a constant/enum value held by a DbgObject.",
        returns: "(A promise to) a string."
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

    DbgObject.prototype._help_hasDesc = {
        description: "Indicates if the DbgObject has a type-specific <code>desc()</code> representation.",
        returns: "A bool."
    }
    DbgObject.prototype.hasDesc = function() {
        return hasTypeDescription(this);
    }

    DbgObject.prototype._help_desc = {
        description: "Provides a human-readable description of the object.",
        returns: "(A promise to) an HTML fragment.",
        notes: function() {
            var html = "<p>Type-specific description generators can be registered with <code>DbgObject.AddTypeDescription</code>.</p>";
            var loadedDescriptionTypes = [];
            for (var key in descriptionTypes) {
                loadedDescriptionTypes.push("<li>" + key + "</li>");
            }
            for (var i = 0; i < descriptionFunctions.length; ++i) {
                loadedDescriptionTypes.push("<li>Predicate: " + descriptionFunctions[i].module + "!(" + descriptionFunctions[i].condition.toString() + ")</li>");
            }
            return html + "Currently registered types with descriptions: <ul>" + loadedDescriptionTypes.join("") + "</ul>";
        }
    }
    DbgObject.prototype.desc = function() {
        return checkSync(getTypeDescription(this));
    }

    DbgObject.prototype._help_array = {
        description: "Provides an array of values or DbgObjects.",
        returns: "(A promise to) an array of numbers if the type is not a pointer type and can be treated as a scalar, or an array of DbgObjects.",
        arguments: [{name:"count", type:"int", description:"The number of items to retrieve.  Optional if the object represents an inline array."}]
    }
    DbgObject.prototype.array = function(count) {
        if (this.isNull()) {
            throw new Error("You cannot get an array from a NULL object.");
        }

        var that = this;
        return checkSync(
            // "count" might be a promise...
            Promise.as(count)

            // Once we have the real count we can get the array.
            .then(function(count) {
                if (count == undefined && that._isArray) {
                    count = that._arrayLength;
                }

                if (that.typename in scalarTypes || that.isPointer()) {
                    // Get the struct size...
                    return that._getStructSize()

                    // Read the array...
                    .then(function(structSize) { return jsDbgPromise(JsDbg.ReadArray, that._pointer, structSize, that._isUnsigned, that._isFloat(), count); })

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
                    });
                } else {
                    // The array isn't an array of scalars.  Provide an array of idx calls instead.
                    var array = [];
                    for (var i = 0; i < count; ++i) {
                        array.push(that.idx(i));
                    }
                    return Promise.join(array);
                }
            })
        );
    }

    DbgObject.prototype._help_ptr = {
        description: "Returns a string representation of a pointer to the object.",
        returns: "A string."
    }
    DbgObject.prototype.ptr = function() {
        return this._pointer == 0 ? "NULL" : "0x" + this._pointer.toString(16);
    }

    DbgObject.prototype._help_pointerValue = {
        description: "Returns an integer representation of a pointer to the object.",
        returns: "An integer."
    }
    DbgObject.prototype.pointerValue = function() {
        return this._pointer;
    }

    DbgObject.prototype._help_typeDescription = {
        description: "Returns the type of a DbgObject.",
        returns: "A string."
    }
    DbgObject.prototype.typeDescription = function() {
        return this.typename + (this._isArray ? "[" + this._arrayLength + "]" : "");
    }

    DbgObject.prototype._help_htmlTypeDescription = {
        description: "Returns the HTML-escaped type of a DbgObject.",
        returns: "A string."
    }
    DbgObject.prototype.htmlTypeDescription = function() {
        return this.typeDescription().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    DbgObject.prototype._help_equals = {
        description: "Indicates if two DbgObjects represent the same address in memory.",
        returns: "A bool."
    }
    DbgObject.prototype.equals = function(other) {
        if (this._pointer === undefined || other._pointer === undefined) {
            throw "The pointer values are undefined.";
        }
        return this._pointer == other._pointer;
    }

    DbgObject.prototype._help_vtable = {
        description: "Returns the type associated with the object's vtable.",
        returns: "(A promise to) a string."
    }
    DbgObject.prototype.vtable = function() {
        if (this.isNull()) {
            throw new Error("You cannot get a vtable from a NULL object.");
        }

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

    DbgObject.prototype._help_vcast = {
        description: "Lookup the type to an object's vtable and attempt a multiple-inheritance-aware cast.",
        returns: "(A promise to) a DbgObject.",
        notes: "If the vtable's type implements the DbgObject's type multiple times (e.g. <code>IUnknown</code>) the result of this method is undefined."
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

    DbgObject.prototype._help_fields = {
        description: "Gets all available fields for a given type.",
        returns: "(A promise to) an array of {name:(string), offset:(int), size:(int), value:(DbgObjects)} objects."
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
                            that._pointer == 0 ? 0 : that._pointer + field.offset, 
                            field.bitcount, 
                            field.bitoffset, 
                            field.size
                        )
                    };
                });
            })
        );
    }

    DbgObject.prototype._help_arrayLength = {
        description: "If the DbgObject represents an array, returns the lengh of the array.",
        returns: "An integer."
    }
    DbgObject.prototype.arrayLength = function() {
        return this._arrayLength;
    }

    DbgObject.prototype._help_isArray = {
        description: "Indicates if the DbgObject represents an array.",
        returns: "A bool."
    }
    DbgObject.prototype.isArray = function() {
        return this._isArray;
    }

    DbgObject.prototype._help_isNull = {
        description: "Indicates if the DbgObject is null.",
        returns: "A bool."
    }
    DbgObject.prototype.isNull = function() {
        return this._pointer == 0;
    }

    DbgObject.prototype._help_isPointer = {
        description: "Indicates if the DbgObject represents a pointer.",
        returns: "A bool."
    }
    DbgObject.prototype.isPointer = function() {
        return this._isPointer();
    }

    return DbgObject;
})();

var PromisedDbgObject = Promise.promisedType(DbgObject, ["f", "as", "deref", "idx", "unembed", "vcast"]);
