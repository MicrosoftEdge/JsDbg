"use strict";

// dbgobject-core.js
// Peter Salas
//
// A convenience library, written on top of JsDbg, to allow convenient navigation of objects.
// Documentation is provided via _help_ properties and can be viewed with the Documentation extension.
var DbgObject = undefined
JsDbg.OnLoad(function() {
    function cleanupTypeName(type) {
        return type
            .replace(/\s+$/g, '')
            .replace(/^\s+/g, '');
    }

    // bitcount and bitoffset are optional.
    DbgObject = function DbgObject(module, type, pointer, bitcount, bitoffset, structSize) {
        this.module = DbgObject.NormalizeModule(module);
        this._pointer = new PointerMath.Pointer(pointer);
        this.bitcount = bitcount;
        this.bitoffset = bitoffset;
        this.structSize = structSize;

        // Cleanup type name:
        //  - remove whitespace from the beginning and end
        this.typename = cleanupTypeName(type);

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
                return Promise.fail(new Error(result.error));
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

    DbgObject._help_AddModuleFilter = {
        description: "Adds a transformation to be applied to module names.",
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
            return new PromisedDbgObject(DbgObject.NULL);
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
        if (this == DbgObject.NULL) {
            return this;
        } else {
            return new DbgObject(this.module, type, this._pointer, this.bitcount, this.bitoffset, disregardSize ? undefined : this.structSize);
        }
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
        returns: "A promise to a number.",
        notes: "This method has several variants with respect to treatment of integers: \
        <table>\
            <tr><th>name</th><th>sign</th><th>type</th></tr>\
            <tr><td><code>val</code></td><td>auto</td><td>JS number</td></tr>\
            <tr><td><code>sval</code></td><td>signed</td><td>JS number</td></tr>\
            <tr><td><code>uval</code></td><td>unsigned</td><td>JS number</td></tr>\
            <tr><td><code>bigval</code></td><td>auto</td><td>bigInt</td></tr>\
            <tr><td><code>sbigval</code></td><td>signed</td><td>bigInt</td></tr>\
            <tr><td><code>ubigval</code></td><td>unsigned</td><td>bigInt</td></tr>\
        </table>"
    }
    DbgObject.prototype.val = function() { return this._val(this._isUnsigned || this._isPointer(), false, false, 0); }
    DbgObject.prototype.uval = function() { return this._val(true, false, false, 0); }
    DbgObject.prototype.sval = function() { return this._val(false, false, false, 0); }
    DbgObject.prototype.bigval = function() { return this._val(this._isUnsigned || this._isPointer(), true, false, 0); }
    DbgObject.prototype.ubigval = function() { return this._val(true, true, false, 0); }
    DbgObject.prototype.sbigval = function() { return this._val(false, true, false, 0); }

    DbgObject.prototype._help_vals = {
        description: "Retrieves scalar values starting with a DbgObject.",
        returns: "A promise to an array of numbers.",
        arguments: [{name: "count", type:"count", description: "The number of scalars to retrieve.  For native arrays (e.g. int[N]) this can be left undefined."}],
        notes: "This method has the same variants as the <code>val</code> method: \
        <table>\
            <tr><th>name</th><th>sign</th><th>type</th></tr>\
            <tr><td><code>vals</code></td><td>auto</td><td>JS number</td></tr>\
            <tr><td><code>svals</code></td><td>signed</td><td>JS number</td></tr>\
            <tr><td><code>uvals</code></td><td>unsigned</td><td>JS number</td></tr>\
            <tr><td><code>bigvals</code></td><td>auto</td><td>bigInt</td></tr>\
            <tr><td><code>sbigvals</code></td><td>signed</td><td>bigInt</td></tr>\
            <tr><td><code>ubigvals</code></td><td>unsigned</td><td>bigInt</td></tr>\
        </table>"
    }
    DbgObject.prototype.vals = function(count) { return this._val(this._isUnsigned || this._isPointer(), false, true, count); }
    DbgObject.prototype.uvals = function(count) { return this._val(true, false, true, count); }
    DbgObject.prototype.svals = function(count) { return this._val(false, false, true, count); }
    DbgObject.prototype.bigvals = function(count) { return this._val(this._isUnsigned || this._isPointer(), true, true, count); }
    DbgObject.prototype.ubigvals = function(count) { return this._val(true, true, true, count); }
    DbgObject.prototype.sbigvals = function(count) { return this._val(false, true, true, count); }

    DbgObject.prototype._val = function(unsigned, useBigInt, isCountSpecified, count) {
        if (this.isNull()) {
            return Promise.as(null);
        }

        if (this.typename == "void") {
            if (!isCountSpecified) {
                return Promise.as(this._pointer);
            } else {
                throw new Error("You may not retrieve multiple values from a 'void' object.");
            }
        }

        if (isCountSpecified && count === undefined) {
            if (this._isArray) {
                count = this._arrayLength;
            } else {
                throw new Error("A count must be specified for any non-array type.")
            }
        }

        var that = this;

        // Lookup the structure size...
        return Promise.join([this._getStructSize(), isCountSpecified ? count : 1])

        // Get the array of values.
        .then(function(structSizeAndArrayCount) {
            var structSize = structSizeAndArrayCount[0];
            var arrayCount = structSizeAndArrayCount[1];
            if (arrayCount instanceof DbgObject) {
                arrayCount = arrayCount.val();
            }
            return Promise.as(arrayCount)
            .then(function (arrayCount) {
                return jsDbgPromise(MemoryCache.ReadArray, that._pointer.value(), structSize, unsigned, that._isFloat(), arrayCount);
            })
        })

        // If we're a bit field, extract the bits.
        .then(function(result) {
            var array = result.array;
            if (that._isFloat()) {
                // The array is already good to go.
            } else if (!useBigInt) {
                array = array.map(function (value) {
                    var value = value.toJSNumber();
                    if (that.bitcount && that.bitoffset !== undefined) {
                        value = (value >> that.bitoffset) & ((1 << that.bitcount) - 1);
                    }
                    return value;
                });
            } else {
                array = array.map(function (value) {
                    if (that.bitcount && that.bitoffset !== undefined) {
                        value = value.shiftRight(that.bitoffset).and(bigInt.one.shiftLeft(that.bitcount).minus(1));
                    }
                    return value;
                });
            }

            if (isCountSpecified) {
                return array;
            } else {
                return array[0];
            }
        })
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

    DbgObject.prototype._help_isScalarType = {
        description: "Indicates if the type of the DbgObject is a scalar (i.e. boolean, character, or number).",
        returns: "A bool."
    };

    DbgObject.prototype.isScalarType = function() {
        return this.typename in scalarTypes;
    }

    DbgObject.prototype._help_isTypeWithFields = {
        description: "Indicates if the type of the DbgObject is one that may have fields.",
        returns: "A promise to a bool."
    };
    
    DbgObject.prototype.isTypeWithFields = function() {
        var that = this;
        return Promise.as(null)
        .then(function () {
            if (that.isScalarType()) {
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
                return that.vals(length)
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

    DbgObject.prototype._help_dcast = {
        description: "Attempts a dynamic cast to a given type, returning a null DbgObject if the cast is invalid.",
        returns: "A promise to a DbgObject.",
        arguments: [
            {name: "type", type: "string", description: "The type to attempt a dynamic cast to."}
        ],
        notes: "This is only available on types that have a vtable."
    }
    DbgObject.prototype.dcast = function(type) {
        var that = this;
        return this.vcast()
        .then(function (result) {
            if (result.typename == type) {
                return result;
            } else {
                return result.baseTypes()
                .then(function (baseTypes) {
                    baseTypes = baseTypes.filter(function (d) { return d.typename == type; });
                    return baseTypes.length > 0 ? baseTypes[0] : Promise.fail();
                })
            }
        })
        .then(null, function (err) {
            return new DbgObject(that.module, type, 0);
        })
    }

    DbgObject.prototype._help_isType = {
        description: "Indicates if a DbgObject is, or derives from, a given type.",
        returns: "A promise to a bool",
        arguments: [
            {name: "type", type: "string", description: "The type to compare."}
        ]
    }
    DbgObject.prototype.isType = function(type) {
        type = cleanupTypeName(type);
        if (this == DbgObject.NULL) {
            return Promise.as(true);
        } else if (this.typeDescription() == type) {
            return Promise.as(true);
        } else {
            return this.baseTypes()
            .then(function (baseTypes) {
                var matchingBaseTypes = baseTypes.filter(function (baseType) { return baseType.typeDescription() == type; });
                return (matchingBaseTypes.length > 0);
            })
        }
    }

    DbgObject.prototype._help_baseTypes = {
        description: "Gets the base types of an object.",
        returns: "A promise to an array of DbgObjects representing each of the base types."
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
            function bitSize(bytes, bits) {
                return bytes * 64 + (bits ? bits : 0);
            }

            // Sort the fields as best we can.  This will sometimes split up anonymous structs in unions though.
            result.fields.sort(function(a, b) {
                var aOffset = bitSize(a.offset, a.bitoffset);
                var bOffset = bitSize(b.offset, b.bitoffset);

                if (aOffset != bOffset) {
                    return aOffset - bOffset;
                }

                var aSize = bitSize(a.size, a.bitcount);
                var bSize = bitSize(b.size, b.bitcount);
                
                // They start at the same offset, so there's a union.  Put the biggest first.
                if (aSize != bSize) {
                    return bSize - aSize;
                }

                // Same offset and same size.  Sort alphabetically.
                return a.name.localeCompare(b.name);
            });

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
        description: "If the DbgObject represents an array, returns the length of the array.",
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

    DbgObject.AddModuleFilter(function (module) { return module.toLowerCase(); });
});
