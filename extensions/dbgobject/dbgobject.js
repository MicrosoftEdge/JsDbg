"use strict";

// dbgobject.js
// Peter Salas
//
// A convenience library, written on top of JsDbg, to allow convenient navigation of objects.
// Documentation is provided via _help_ properties and can be viewed with Documentation extension.

var DbgObject = (function() {
    // bitcount and bitoffset are optional.
    function DbgObject(module, type, pointer, bitcount, bitoffset, structSize) {
        this.module = DbgObject.NormalizeModule(module);
        this._pointer = new PointerMath.Pointer(pointer);
        this.bitcount = bitcount;
        this.bitoffset = bitoffset;
        this.structSize = structSize;

        // Cleanup type name:
        //  - remove whitespace from the beginning and end
        this.typename = type
            .replace(/\s+$/g, '')
            .replace(/^\s+/g, '');

        // Treat "char" as unsigned.
        this._isUnsigned = (this.typename.indexOf("unsigned ") == 0 || this.typename == "char");

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
        notes: "<p>DbgObjects are immutable.</p><p>Note that most methods return promises.  Promises to a DbgObject returned by these methods can be treated as DbgObjects where <em>every</em> method returns a promise.</p>",
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
                var error = new Error(result.error);
                return Promise.fail(error);
            }
            return result; 
        });
    }

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
        module = DbgObject.NormalizeModule(module);
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
        module = DbgObject.NormalizeModule(module);
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

    function getTypeDescriptionFunctionIncludingBaseTypes(module, type) {
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

        var natural = getTypeDescriptionFunction(module, type);
        if (natural != null) {
            return Promise.as(natural);
        } else if (type == "void") {
            return Promise.as(null);
        }

        return jsDbgPromise(JsDbg.LookupBaseTypes, module, type)
        .then(function (baseTypes) {
            for (var i = 0; i < baseTypes.length; ++i) {
                var desc = getTypeDescriptionFunction(module, baseTypes[i].type);
                if (desc != null) {
                    return desc;
                }
            }

            return null;
        });
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
                    } else if (x.typename in scalarTypes) {
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

    DbgObject._help_AddModuleFilter = {
        description: "Adds a transformation to be applied to modules names.",
        arguments: [
            {name:"filter", type:"function(string) -> string", description:"The filter to apply to each module name."}
        ]
    }

    var moduleFilters = [];
    DbgObject.AddModuleFilter = function(filter) {
        moduleFilters.push(filter);
    }

    DbgObject._help_NormalizeModule = {
        description: "Normalizes a module name to its canonical name to use for comparisons.",
        returns: "A normalized module name.",
        arguments: [
            {name:"module", type:"string", description:"The non-normalized module name."}
        ]
    }
    DbgObject.NormalizeModule = function(module) {
        return moduleFilters.reduce(
            function (name, transformation) {
                return transformation(name);
            },
            module
        );
    }


    DbgObject._help_global = {
        description: "Looks up a global symbol in the debuggee.",
        returns: "A promise to a DbgObject representing the symbol.",
        arguments: [
            {name:"module", type:"string", description:"The module containing the symbol."},
            {name:"symbol", type:"string", description:"The global symbol to lookup."}
        ]
    }
    DbgObject.global = function(module, symbol) {
        return new PromisedDbgObject(
            jsDbgPromise(JsDbg.LookupGlobalSymbol, module, symbol)
            .then(function(result) {
                return new DbgObject(result.module, result.type, result.pointer);
            })
        );
    }

    DbgObject._help_locals = {
        description: "Evaluates a reference to local symbols in the debuggee.",
        returns: "A promise to an array of DbgObjects representing the symbols on the stack.",
        arguments: [
            {name:"module", type:"string", description:"The module containing the method."},
            {name:"method", type:"string", description:"The method containing the local symbol."},
            {name:"symbol", type:"string", description:"The symbol to evaluate."}
        ]
    }
    DbgObject.locals = function(module, method, symbol) {
        return new PromisedDbgObject.Array(
            jsDbgPromise(JsDbg.LookupLocalSymbols, module, method, symbol, /*maxCount*/0)
            .then(function(resultArray) {
                return resultArray.map(function(result) {
                    return new DbgObject(result.module, result.type, result.pointer);
                });
            })
        );
    }

    DbgObject._help_constantValue = {
        description: "Evaluates a constant's name to its underlying value.",
        returns: "A promise to an integer.",
        arguments: [
            {name:"module", type:"string", description:"The module containing the method."},
            {name:"type", type:"string", description:"The type (e.g. enum) containing the constant."},
            {name:"constantName", type:"string", description:"The constant name."}
        ]
    }
    DbgObject.constantValue = function(module, type, constantName) {
        return jsDbgPromise(JsDbg.LookupConstantValue, module, type, constantName)
        .then(function (result) {
            return result.value;
        });
    }

    DbgObject._help_NULL = {description: "A DbgObject that represents a null value."}
    DbgObject.NULL = new DbgObject("", "", 0, 0, 0);

    DbgObject.prototype._getStructSize = function() {
        if (this.structSize !== undefined) {
            return Promise.as(this.structSize);
        } else if (this == DbgObject.NULL) {
            return Promise.as(0);
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
        if (this.isNull()) {
            return this;
        } else {
            return new DbgObject(this.module, this.typename, this._pointer.add(offset), this.bitcount, this.bitoffset, this.structSize);
        }
    }

    DbgObject.prototype._isPointer = function() {
        return this.typename[this.typename.length - 1] == "*";
    }

    DbgObject.prototype._isFloat = function() {
        return this.typename == "float" || this.typename == "double";
    }

    DbgObject.prototype._help_size = {
        description:"Gets the size of the DbgObject in bytes.",
        returns: "A promise to an integral number of bytes."
    }
    DbgObject.prototype.size = function() {
        return this._getStructSize();
    }

    DbgObject.prototype._help_deref = {
        description: "Derferences a DbgObject that represents a pointer.",
        returns: "A promise to a DbgObject."
    }
    DbgObject.prototype.deref = function() {
        if (this == DbgObject.NULL) {
            return new PromisedDbgObject(this);
        } else if (this.isNull()) {
            return new PromisedDbgObject(new DbgObject(this.module, this._getDereferencedTypeName(), 0));
        }

        var that = this;
        return this.as("void*").ubigval()
        .then(function(result) {
            return new DbgObject(that.module, that._getDereferencedTypeName(), result);
        });
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
<li><code>a.f(\"z\", \"\")</code> returns a DbgObject equivalent to <code>a</code>.</li>\
</ul></p>",
        returns: "A promise to a DbgObject.",
        arguments: [
            {name:"field", type:"string", description:"One or more fields (separated by \".\") to access.  Passing the empty string will return the same object."},
            {name:"...", description:"Fields to use if the prior field lookups failed (e.g. because a field has been renamed)."}
        ]
    }
    DbgObject.prototype.f = function(field) {
        if (arguments.length < 0) {
            throw new Error("You must provide a field.");
        } else if (this == DbgObject.NULL) {
            return new PromisedDbgObject(this);
        } else if (arguments.length == 1) {
            return this._fHelper(field);
        } else {
            var rest = [];
            for (var i = 1; i < arguments.length; ++i) {
                rest.push(arguments[i]);
            }
            var that = this;
            return this._fHelper(field)
            .then(null, function(err) {
                return that.f.apply(that, rest);
            });
        }
    }

    DbgObject.prototype._fHelper = function(field) {
        if (field == "") {
            return Promise.as(this);
        }

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
        } else if (this._isArray) {
            throw new Error("You cannot get a field from an array.");
        } else if (this == DbgObject.NULL) {
            return new PromisedDbgObject(DbgObject.NULL);
        }

        var that = this;
        return jsDbgPromise(JsDbg.LookupFieldOffset, that.module, that.typename, field)
        .then(function(result) {
            var target = new DbgObject(
                that.module, 
                getFieldType(that.module, that.typename, field, result.type), 
                that.isNull() ? 0 : that._pointer.add(result.offset),
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
            // Objects that are pointers and arrays are really arrays of pointers, so don't dereference them.
            if (target._isPointer() && !target._isArray) {
                return target.deref();
            } else {
                return target;
            }
        })
    }

    DbgObject.prototype._help_unembed = {
        description: "Gets the containing structure from an embedded object.",
        returns: "A promise to a DbgObject.",
        arguments: [
            {name: "type", type:"string", description:"The containing type."},
            {name: "field", type:"string", description:"The field containing the callee DbgObject."}
        ]
    }
    DbgObject.prototype.unembed = function(type, field) {
        if (this == DbgObject.NULL) {
            return new PromisedDbgObject(DbgObject.NULL);
        }
        var that = this;
        return jsDbgPromise(JsDbg.LookupFieldOffset, that.module, type, field)
        .then(function(result) { 
            return new DbgObject(that.module, type, that.isNull() ? 0 : that._pointer.add(-result.offset)); 
        });
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
        returns: "A promise to a DbgObject.",
        arguments: [{name: "index", type:"int", description:"The index to retrieve."}],
        notes: "<p>Any object can be treated as if it is an array, i.e. <code>obj.idx(a + b)</code> is equivalent to <code>obj.idx(a).idx(b)</code>.</p>"
    }
    DbgObject.prototype.idx = function(index) {
        var that = this;
        // index might be a promise...
        return Promise.as(index)

        // Get the struct size...
        .then(function(index) { return Promise.join([that._getStructSize(), index]); })

        // And offset the struct.
        .then(function(args) { return that._off(args[0] * args[1]); });
    }

    DbgObject.prototype._help_val = {
        description: "Retrieves a scalar value held by a DbgObject.",
        returns: "A promise to a number."
    }
    DbgObject.prototype.val = function() {
        return this._val(this._isUnsigned, false);
    }

    DbgObject.prototype._help_uval = {
        description: "Retrieves an unsigned scalar value held by a DbgObject.",
        returns: "A promise to an unsigned number."
    }
    DbgObject.prototype.uval = function() {
        return this._val(true, false);
    }

    DbgObject.prototype._help_sval = {
        description: "Retrieves a signed scalar value held by a DbgObject.",
        returns: "A promise to a signed number."
    }
    DbgObject.prototype.sval = function() {
        return this._val(false, false);
    }

    DbgObject.prototype._help_bigval = {
        description: "Retrieves a scalar value held by a DbgObject as a bigInt.",
        returns: "A promise to a bigInt.",
        notes: "JavaScript does not have 64-bit integers, so this should be used whenever the value may be a 64-bit integer."
    }
    DbgObject.prototype.bigval = function() {
        return this._val(this._isUnsigned, true);
    }

    DbgObject.prototype._help_ubigval = {
        description: "Retrieves an unsigned scalar value held by a DbgObject as a bigInt.",
        returns: "A promise to an unsigned bigInt.",
        notes: "JavaScript does not have 64-bit integers, so this should be used whenever the value may be a 64-bit integer."
    }
    DbgObject.prototype.ubigval = function() {
        return this._val(true, true);
    }

    DbgObject.prototype._help_sbigval = {
        description: "Retrieves a signed scalar value held by a DbgObject as a bigInt.",
        returns: "A promise to a signed bigInt.",
        notes: "JavaScript does not have 64-bit integers, so this should be used whenever the value may be a 64-bit integer."
    }
    DbgObject.prototype.sbigval = function() {
        return this._val(false, true);
    }

    DbgObject.prototype._val = function(unsigned, useBigInt) {
        if (this.isNull()) {
            return Promise.as(null);
        }

        if (this.typename == "void") {
            return Promise.as(this._pointer);
        }

        if (this._isArray && this._arrayLength > 0) {
            throw new Error("You cannot get a value of an array.");
        }

        var that = this;

        // Lookup the structure size...
        return this._getStructSize()

        // Read the value...
        .then(function(structSize) {
            return jsDbgPromise(MemoryCache.ReadNumber, that._pointer.value(), structSize, unsigned, that._isFloat());
        })

        // If we're a bit field, extract the bits.
        .then(function(result) {
            var value = result.value;
            if (that._isFloat()) {
                return value;
            } else if (!useBigInt) {
                var value = value.toJSNumber();
                if (that.bitcount && that.bitoffset !== undefined) {
                    value = (value >> that.bitoffset) & ((1 << that.bitcount) - 1);
                }
                return value;
            } else {
                if (that.bitcount && that.bitoffset !== undefined) {
                    value = value.shiftRight(that.bitoffset).and(bigInt.one.shiftLeft(that.bitcount).minus(1));
                }
                return value;
            }
        })
    }

    DbgObject.prototype._help_isTypeWithFields = {
        description: "Indicates if the type of the DbgObject is one that may have fields.",
        returns: "A promise to a bool."
    };
    
    DbgObject.prototype.isTypeWithFields = function() {
        var that = this;
        return Promise.as(null)
        .then(function () {
            if (that.typename in scalarTypes) {
                return false;
            } else if (that.isPointer()) {
                return false;
            } else {
                return that.isEnum().then(function (isEnum) { return !isEnum; });
            }
        });
    }

    DbgObject.prototype._help_isEnum = {
        description: "Indicates if the type of the DbgObject is an enum.",
        returns: "A promise to a bool."
    }
    DbgObject.prototype.isEnum = function() {
        return jsDbgPromise(JsDbg.IsTypeEnum, this.module, this.typename)
        .then(function (result) { return result.isEnum; })
    }

    DbgObject.prototype._help_constant = {
        description: "Retrieves a constant/enum value held by a DbgObject.",
        returns: "A promise to a string."
    }
    DbgObject.prototype.constant = function() {
        if (this.isNull()) {
            return Promise.as(null);
        }

        var that = this;
        return this.bigval()
        // Lookup the constant name...
        .then(function(value) { return jsDbgPromise(JsDbg.LookupConstantName, that.module, that.typename, value); })

        // And return it.
        .then(function(result) { return result.name; })
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
        return getTypeDescription(this);
    }

    var registeredArrayTypes = [];

    DbgObject._help_AddDynamicArrayType = {
        description: "Registers a type as a dynamic array type and provides a transformation to get the contents as an array.",
        arguments: [
            {name:"module", type:"string", description: "The module of the array type."},
            {name:"typeNameOrFn", type:"string/function(string) -> bool", description: "The array type (or a predicate that matches the array type)."},
            {name:"transformation", type:"function(DbgObject) -> (promised) array", description: "A function that converts a DbgObject of the specified type to an array."}
        ]
    }
    DbgObject.AddDynamicArrayType = function(module, typeNameOrFn, transformation) {
        module = DbgObject.NormalizeModule(module);
        if (typeof(typeNameOrFn) == typeof("")) {
             var typeName = typeNameOrFn;
             typeNameOrFn = function(typeNameToCheck) {
                return typeName == typeNameToCheck;
             };
        } 
        registeredArrayTypes.push({
            module: module,
            matchesType: typeNameOrFn,
            transformation: transformation
        });
    }

    DbgObject.prototype._help_array = {
        description: "Provides an array of values or DbgObjects.",
        returns: "A promise to an array of numbers if the type is not a pointer type and can be treated as a scalar, or an array of DbgObjects.",
        arguments: [{name:"count (optional)", type:"int", description:"The number of items to retrieve.  Optional if the object represents an inline array or is a known array type."}]
    }
    DbgObject.prototype.array = function(count) {
        var that = this;
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
                // Check the registered dynamic array types.
                return jsDbgPromise(JsDbg.LookupBaseTypes, that.module, that.typename)
                .then(function (baseTypes) {
                    baseTypes = [{type: that.typename, offset:0}].concat(baseTypes);

                    for (var i = 0; i < baseTypes.length; ++i) {
                        var baseType = baseTypes[i];

                        for (var j = 0; j < registeredArrayTypes.length; ++j) {
                            var registration = registeredArrayTypes[j];
                            if (that.module != registration.module) {
                                continue;
                            }

                            if (registration.matchesType(baseType.type)) {
                                // We found a match.  Cast it up to the matching base type.
                                var castedType = new DbgObject(that.module, baseType.type, that._pointer.add(baseType.offset));
                                return registration.transformation(castedType)
                            }
                        }
                    }

                    // No matches.
                    return count;
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

            if (that.typename in scalarTypes || that.isPointer()) {
                // Get the struct size...
                return that._getStructSize()

                // Read the array...
                .then(function(structSize) { 
                    return jsDbgPromise(MemoryCache.ReadArray, that._pointer.value(), structSize, that._isPointer() || that._isUnsigned, that._isFloat(), count)

                    // Process the array into DbgObjects if necessary.
                    .then(function(result) {
                        if (that._isPointer()) {
                            // If the type is a pointer, return an array of DbgObjects.
                            var itemTypename = that._getDereferencedTypeName();
                            return result.array.map(function(x) { return new DbgObject(that.module, itemTypename, x); });
                        } else {
                            // Otherwise, the items are values.
                            if (structSize <= 4 && !that._isFloat()) {
                                // The values are bigIntegers but they aren't necessary.
                                return result.array.map(function (n) { return n.toJSNumber(); })
                            } else {
                                return result.array;
                            }
                        }
                    });
                })
            } else {
                // The array isn't an array of scalars.  Provide an array of idx calls instead.
                var array = [];
                for (var i = 0; i < count; ++i) {
                    array.push(that.idx(i));
                }
                return Promise.join(array);
            }
        });
    }


    DbgObject.prototype._help_list = {
        description: "Walks a linked list until it reaches null, the first node, or a given node.",
        returns: "A promise to an array of DbgObjects.",
        arguments: [
            {name: "fieldOrFunction", type: "string/function(DbgObject) -> DbgObject", description: "The next field(s) to walk, or a function that walks from one node to the next."},
            {name: "lastNodePromise (optional)", type: "(a promise to) a DbgObject", description: "A node to stop at."},
            {name: "maxCount (optional)", type: "integer", description: "The maximum length list to return."}
        ]
    }
    DbgObject.prototype.list = function(fieldOrFunction, lastNodePromise, remainingLength) {
        var firstNode = this;
        return Promise.as(lastNodePromise)
        .then(function (lastNode) {
            var stoppingNode = lastNode ? lastNode : firstNode;
            var isFirstNode = lastNode ? false : true;

            var collectedNodes = [];
            function collectRemainingNodes(node) {
                if (node.isNull() || (node.equals(stoppingNode) && !isFirstNode) || remainingLength <= 0) {
                    return collectedNodes;
                } else if (remainingLength !== undefined) {
                    --remainingLength;
                }
                isFirstNode = false;

                collectedNodes.push(node);
                if (Array.isArray(fieldOrFunction)) {
                    return node.f.apply(node, fieldOrFunction).then(collectRemainingNodes);
                } else if (typeof(fieldOrFunction) == typeof("")) {
                    return node.f(fieldOrFunction).then(collectRemainingNodes);
                } else if (typeof(fieldOrFunction) == typeof(collectRemainingNodes)) {
                    return Promise.as(fieldOrFunction(node)).then(collectRemainingNodes);
                }
            }

            return Promise.as(collectRemainingNodes(firstNode));
        })
    }

    DbgObject.prototype._help_string = {
        description: "Retrieves a length-specified or null-terminated string from memory.",
        returns: "A promise to a string.",
        arguments: [
            {name: "length (optional)", type: "(a promise to an) integer", description: "The length of the string.  If unspecified, the string is assumed to be null-terminated."}
        ]
    }
    DbgObject.prototype.string = function(length) {
        var that = this;
        if (this.isNull()) {
            return "???";
        }

        return Promise.as(length)
        .then(function (length) {
            if (length === undefined) {
                // Using a null-terminated string.
                var getRestOfString = function(character, prefix) {
                    return character.val()
                    .then(function(v) {
                        if (v == 0) {
                            return prefix;
                        } else {
                            return getRestOfString(character.idx(1), prefix + String.fromCharCode(v));
                        }
                    })
                };
                return getRestOfString(that, "");
            } else {
                return that.array(length)
                .then(function (chars) {
                    return chars.map(String.fromCharCode).join("");
                });
            }
        });
    }

    DbgObject.prototype._help_ptr = {
        description: "Returns the address of the object, as a hexadecimal-formatted string or \"NULL\".",
        returns: "A string."
    }
    DbgObject.prototype.ptr = function() {
        return this._pointer.toFormattedString();
    }

    DbgObject.prototype._help_pointerValue = {
        description: "Returns the address of the object, as a bigInt.",
        return: "A bigInt object."
    }
    DbgObject.prototype.pointerValue = function() {
        return this._pointer.value();
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
        return this._pointer.equals(other._pointer);
    }

    DbgObject.prototype._help_vtable = {
        description: "Returns the type associated with the object's vtable.",
        returns: "A promise to a string."
    }
    DbgObject.prototype.vtable = function() {
        if (this.isNull()) {
            return Promise.as(this.typename);
        }

        // Read the value at the this pointer...
        return this.as("void*").ubigval()

        // Lookup the symbol at that value...
        .then(function(result) { 
            return jsDbgPromise(JsDbg.LookupSymbolName, result);
        })

        // And strip away the vftable suffix..
        .then(function(result) {
            return result.name.substring(0, result.name.indexOf("::`vftable'"));
        });
    }

    DbgObject.prototype._help_vcast = {
        description: "Lookup the type to an object's vtable and attempt a multiple-inheritance-aware cast.",
        returns: "A promise to a DbgObject.",
        notes: "If the vtable's type implements the DbgObject's type multiple times (e.g. <code>IUnknown</code>) the result of this method is undefined."
    }
    DbgObject.prototype.vcast = function() {
        if (this.isNull()) {
            return Promise.as(this);
        }

        var that = this;
        // Lookup the vtable type...
        return this.vtable()
        .then(function(vtableType) {
            if (vtableType == that.typename) {
                return that;
            }

            // Lookup the base class offset...
            return jsDbgPromise(JsDbg.LookupBaseTypes, that.module, vtableType)

            // And shift/cast.
            .then(function(baseTypes) {
                for (var i = 0; i < baseTypes.length; ++i) {
                    if (baseTypes[i].type == that.typename) {
                        return new DbgObject(that.module, vtableType, that._pointer.add(-baseTypes[i].offset));
                    }
                }

                // Maybe the vtable type is a base type of the original...
                return jsDbgPromise(JsDbg.LookupBaseTypes, that.module, that.typename)
                .then(function(originalBaseTypes) {
                    for (var i = 0; i < originalBaseTypes.length; ++i) {
                        if (originalBaseTypes[i].type == vtableType) {
                            return new DbgObject(that.module, vtableType, that._pointer.add(originalBaseTypes[i].offset));
                        }
                    }
                    throw new Error("The DbgObject's type " + that.typename + " is not related to the vtable's type, " + vtableType);
                });
            });
        });
    }

    DbgObject.prototype.baseTypes = function() {
        if (this == DbgObject.NULL) {
            return Promise.as([]);
        }

        var that = this;
        return jsDbgPromise(JsDbg.LookupBaseTypes, that.module, that.typename)
        .then(function (baseTypes) {
            return baseTypes.map(function (typeAndOffset) {
                return new DbgObject(that.module, typeAndOffset.type, that._pointer.add(typeAndOffset.offset));
            });
        });
    }

    DbgObject.prototype._help_fields = {
        description: "Gets all available fields for a given type.",
        returns: "A promise to an array of {name:(string), offset:(int), size:(int), value:(DbgObjects)} objects."
    }
    DbgObject.prototype.fields = function(includeBaseTypes) {
        if (this._isPointer()) {
            throw new Error("You cannot lookup fields on a pointer.");
        }

        if (this == DbgObject.NULL) {
            return Promise.as([]);
        }

        if (includeBaseTypes === undefined) {
            includeBaseTypes = true;
        }

        var that = this;
        // Lookup the fields...
        return jsDbgPromise(JsDbg.LookupFields, this.module, this.typename, includeBaseTypes)

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
                        that._pointer.isNull() ? 0 : that._pointer.add(field.offset),
                        field.bitcount, 
                        field.bitoffset, 
                        field.size
                    )
                };
            });
        });
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
        return this._pointer.isNull();
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

DbgObject.AddModuleFilter(function (module) { return module.toLowerCase(); });

var PromisedDbgObject = Promise.CreatePromisedType(DbgObject);
PromisedDbgObject.IncludePromisedMethod("f", PromisedDbgObject);
PromisedDbgObject.IncludePromisedMethod("as", PromisedDbgObject); 
PromisedDbgObject.IncludePromisedMethod("deref", PromisedDbgObject); 
PromisedDbgObject.IncludePromisedMethod("idx", PromisedDbgObject); 
PromisedDbgObject.IncludePromisedMethod("unembed", PromisedDbgObject); 
PromisedDbgObject.IncludePromisedMethod("vcast", PromisedDbgObject);
PromisedDbgObject.IncludePromisedMethod("list", PromisedDbgObject.Array);
PromisedDbgObject.IncludePromisedMethod("array", PromisedDbgObject.Array);
PromisedDbgObject.IncludePromisedMethod("baseTypes", PromisedDbgObject.Array);
