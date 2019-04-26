//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// dbgobject-core.js
// Peter Salas
//
// A convenience library, written on top of JsDbg, to allow convenient navigation of objects.
// Documentation is provided via _help_ properties and can be viewed with the Documentation extension.
var DbgObject = undefined
Loader.OnLoad(function() {
    // bitcount and bitoffset are optional.
    DbgObject = function DbgObject() { }
    Help.Register(DbgObject);
    DbgObject._help = {
        name: "DbgObject",
        description: "Provides convenient navigation of C++ objects in the debuggee.",
        notes: "<p>DbgObjects are immutable.</p><p>Note that most methods return promises.  Promises to a DbgObject returned by these methods can be treated as DbgObjects where <em>every</em> method returns a promise.</p>"
    }

    DbgObject._help_create = {
        description: "Manually constructs a DbgObject.",
        arguments: [
            {name: "type", type:"string", description:"The type of the object."},
            {name: "pointer", type:"int", description:"The address of the object in memory."},
            {name: "bitcount", type:"int", description:"(optional) The number of bits if the object is held in a bitfield."},
            {name: "bitoffset", type:"int", description:"(optional) The bit offset from the address."},
            {name: "objectSize", type:"int", description:"(optional) The size of the object in memory."}
        ],
        notes: "The last three arguments are generally only used internally by other DbgObject methods."
    };
    DbgObject.create = function(type, pointer, bitcount, bitoffset, objectSize, wasDereferenced) {
        var that = new DbgObject();

        that.type = DbgObjectType(type);
        that._pointer = new PointerMath.Pointer(pointer);
        that.bitcount = bitcount;
        that.bitoffset = bitoffset;
        that.wasDereferenced = (wasDereferenced ? true : false);

        if (objectSize && that.type.isArray() && that.type.arrayLength() > 0) {
            that.typeSize = objectSize / that.type.arrayLength();
        } else if (objectSize > 0) {
            that.typeSize = objectSize;
        } else {
            that.typeSize = undefined;
        }
        return that;
    }

    function checkJsDbgError(result) {
        if (result.error) {
            return Promise.reject(result.error);
        } else {
            return result;
        }
    }
    var JsDbgPromise = Promise.promisify(JsDbg, checkJsDbgError);
    var MemoryCachePromise = Promise.promisify(MemoryCache, checkJsDbgError);

    var typeOverrides = {};
    DbgObject._help_AddTypeOverride = {
        description: "Causes DbgObject to ignore the type provided by JsDbg for a given field in a struct.",
        notes: "This is useful for adding enum information on fields that are stored as numbers.",
        arguments: [
            {name: "type", type:"DbgObjectType", description:"The type whose field's type we wish to specify."},
            {name: "field", type:"string", description:"The field whose type will be specified."},
            {name: "overriddenType", type:"DbgObjectType", description:"The type to use."}
        ]
    };
    DbgObject.AddTypeOverride = function(type, field, overriddenType) {
        typeOverrides[type.nonArrayComparisonName() + "." + field] = DbgObjectType(overriddenType, type);
    }
    function getFieldType(type, field, defaultType) {
        var key = type.nonArrayComparisonName() + "." + field;
        if (key in typeOverrides) {
            return typeOverrides[key];
        } else {
            return defaultType;
        }
    }

    function moduleBasedLookup(moduleName, lookupFunction, ...lookupFunctionArgs) {
        var modulesToLookup = SyntheticModules.EquivalentModuleNames(moduleName);
        return moduleBasedLookupHelper(modulesToLookup, /*arrayIndex*/0, lookupFunction, ...lookupFunctionArgs);
    }

    function moduleBasedLookupHelper(modulesToLookup, arrayIndex, lookupFunction, ...lookupFunctionArgs) {
        console.assert(arrayIndex < modulesToLookup.length);

        return lookupFunction(modulesToLookup[arrayIndex], ...lookupFunctionArgs)
        .then((result) => {
            SyntheticModules.ModuleLookupSuccessCallback(result.module);
            return result;
        }, (error) => {
            if (arrayIndex == (modulesToLookup.length - 1)) {
                return Promise.reject(error);
            }
            return moduleBasedLookupHelper(modulesToLookup, arrayIndex + 1, lookupFunction, ...lookupFunctionArgs);
        });
    }

    DbgObject._help_teb = {
        description: "Looks up the thread environment block (TEB) for the current thread.",
        returns: "A DbgObject representing the TEB."
    }
    DbgObject.teb = function() {
        return JsDbgPromise.LookupTebAddress()
        .then((tebAddress) => DbgObject.create(DbgObjectType("ntdll", "_TEB"), tebAddress));
    }

    DbgObject._help_global = {
        description: "Looks up a global symbol in the debuggee.",
        returns: "A promise to a DbgObject representing the symbol.",
        arguments: [
            {name:"moduleName", type:"string", description:"The name of the module containing the symbol."},
            {name:"symbol", type:"string", description:"The global symbol to lookup."},
            {name: "typeName", type:"string", description: "(optional) The type name of the symbol to look up."},
            {name: "namespace", type:"string", description: "(optional) The namespace of the symbol to look up. Required on some platforms."}
        ]
    }
    DbgObject.global = function(moduleName, symbol, typeName, namespace) {
        return new PromisedDbgObject(
            moduleBasedLookup(moduleName, JsDbgPromise.LookupGlobalSymbol, symbol, typeName, namespace)
            .then(function(result) {
                return DbgObject.create(DbgObjectType(result.module, result.type), result.pointer);
            })
        );
    }

    DbgObject._help_locals = {
        description: "Evaluates a reference to local symbols in the debuggee.",
        returns: "A promise to an array of DbgObjects representing the symbols on the stack.",
        arguments: [
            {name:"moduleName", type:"string", description:"The name of the module containing the method."},
            {name:"method", type:"string", description:"The method containing the local symbol."},
            {name:"symbolName", type:"string", description:"The symbol to evaluate."}
        ]
    }
    DbgObject.locals = function(moduleName, method, symbolName) {
        return new PromisedDbgObject.Array(
            JsDbgPromise.GetCallStack(/*maxCount*/20)
            .then(function(stackFrames) {
                // Filter the stack frames to only those that match the given method name.
                return Promise.filter(stackFrames, function (frame) {
                    return JsDbgPromise.LookupSymbolName(frame.instructionAddress)
                    .then(function (symbol) {
                        symbol.module = SyntheticModules.ModuleOrSyntheticName(symbol.module);
                        return (
                            symbol.module == moduleName &&
                            symbol.name == method
                        );
                    })
                    .then(null, function (error) { return false; });
                })
                .then(function (filteredStackFrames) {
                    // Now get the local symbols for each of the stack frames.
                    return Promise.map(filteredStackFrames, function (frame) {
                        return JsDbgPromise.LookupLocalsInStackFrame(frame.instructionAddress, frame.stackAddress, frame.frameAddress)
                        .then(function (symbols) {
                            // Limit the symbols only to those that match the given name.
                            return symbols.filter(function (symbol) { return symbol.name == symbolName; })
                        })
                    })
                })
                .then(function (symbols) {
                    // Finally, flatten the array of symbols and turn them into DbgObjects.
                    return symbols
                    .reduce(function (a, b) { return a.concat(b); }, [])
                    .map(function (symbol) {
                        return DbgObject.create(DbgObjectType(symbol.module, symbol.type), symbol.address);
                    })
                })
            })
        );
    }

    DbgObject._help_symbol = {
        description: "Looks up the symbolic name of an address (e.g. vtable pointer, function pointer).",
        returns: "The name of the symbol.",
        arguments: [
            {name:"address", type:"number", description:"The address to resolve."}
        ]
    }
    DbgObject.symbol = function(address) {
        return JsDbgPromise.LookupSymbolName(address)
        .then(function (result) {
            if (result.displacement == 0) {
                return result.module + "!" + result.name;
            } else {
                throw new Error("The address 0x" + address.toString(16) + " is not a valid symbol address.");
            }
        })
    }

    DbgObject._help_constantValue = {
        description: "Evaluates a constant's name to its underlying value.",
        returns: "A promise to an integer.",
        arguments: [
            {name:"type", type:"DbgObjectType", description:"The type containing the constant."},
            {name:"constantName", type:"string", description:"The constant name."}
        ]
    }
    DbgObject.constantValue = function(type, constantName) {
        return moduleBasedLookup(type.moduleOrSyntheticName(), JsDbgPromise.LookupConstantValue, type.name(), constantName)
        .then(function (result) {
            return result.value;
        });
    }

    DbgObject.globalConstantValue = function(moduleName, constantName) {
        return moduleBasedLookup(moduleName, JsDbgPromise.LookupConstantValue, null, constantName)
        .then(function (result) {
            return result.value;
        });
    }

    DbgObject.globalConstantNames = function(moduleName, constantValue) {
        return moduleBasedLookup(moduleName, JsDbgPromise.LookupConstantName, null, constantValue)
        .then(function (result) {
            return result.map(function (x) { return x.name; });
        });
    }

    DbgObject._help_render = {
        description: "Renders an object or an array of objects, some of which may be DbgObjects.",
        arguments: [
            {name:"object", type:"any", description:"The object or array of objects to render."},
            {name:"element", type:"HTML element", description:"The element to render into." },
            {name:"dbgObjectMapping", type:"function(DbgObject) -> any", description:"A function to transform DbgObjects into something renderable."}
        ],
        returns: "A promise to a bool indicating if anything other than a null DbgObject was rendered."
    }
    DbgObject.render = function(object, element, dbgObjectMapping, topLevelElement) {
        return Promise.resolve(object)
        .then(function (object) {
            if (Array.isArray(object)) {
                element.appendChild(document.createTextNode("["));
                return Promise.map(object, function (item, index) {
                    if (index > 0) {
                        element.appendChild(document.createTextNode(", "));
                    }
                    var inlineBlock = document.createElement("span");
                    inlineBlock.style.display = "inline-block";
                    element.appendChild(inlineBlock);
                    return DbgObject.render(item, inlineBlock, dbgObjectMapping);
                })
                .then(function() {
                    element.appendChild(document.createTextNode("]"));
                    return true;
                })
            } else if (object instanceof DbgObject) {
                return DbgObject.render(dbgObjectMapping(object), element, dbgObjectMapping)
                .then(function (result) {
                    return !object.isNull();
                });
            } else if (object instanceof Function) {
                if (topLevelElement == undefined || topLevelElement == null) {
                    topLevelElement = element;
                }
                return DbgObject.render(object(topLevelElement), element, dbgObjectMapping);
            } else if (object instanceof Node) {
                element.appendChild(object);
                return true;
            } else if (object !== undefined) {
                element.innerHTML = object;
                return true;
            } else {
                return false;
            }
        })
        .then(null, function (error) {
            var errorSpan = document.createElement("span");
            errorSpan.style.color = "red";
            errorSpan.textContent = "(" + (error instanceof Error ? error.toString() : JSON.stringify(error)) + ")";
            element.appendChild(errorSpan);
            return true;
        })
    }

    DbgObject._help_NULL = {description: "A DbgObject that represents a null value."}
    DbgObject.NULL = DbgObject.create(DbgObjectType("", "void"), 0, 0, 0);

    DbgObject.prototype._help_size = {
        description:"Gets the size of the DbgObject in bytes.",
        returns: "A promise to an integral number of bytes."
    }
    DbgObject.prototype.size = function() {
        if (this.typeSize !== undefined) {
            var result = this.typeSize * (this.type.isArray() ? this.type.arrayLength() : 1);
            return Promise.resolve(result);
        } else if (this == DbgObject.NULL) {
            return Promise.resolve(0);
        } else {
            var that = this;
            return moduleBasedLookup(this.type.moduleOrSyntheticName(), JsDbgPromise.LookupTypeSize, this.type.name())
            .then(function(result) {
                that.typeSize = result.size;
                return that.typeSize * (that.type.isArray() ? that.type.arrayLength() : 1);
            });
        }
    }

    DbgObject.prototype._help_deref = {
        description: "Derferences a DbgObject that represents a pointer.",
        returns: "A promise to a DbgObject."
    }
    DbgObject.prototype.deref = function() {
        if (this == DbgObject.NULL) {
            return new PromisedDbgObject(this);
        } else if (this.isNull()) {
            return new PromisedDbgObject(DbgObject.create(this.type.dereferenced(), 0));
        }

        var that = this;
        return this.as("void*", true).ubigval()
        .then(function(result) {
            return DbgObject.create(
                that.type.dereferenced(),
                result,
                /*bitcount*/undefined,
                /*bitoffset*/undefined,
                /*structSize*/undefined,
                /*wasDereferenced*/true
            );
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
        if (this == DbgObject.NULL) {
            return Promise.resolve(DbgObject.NULL);
        }

        if (arguments.length > 1) {
            var args = Array.from(arguments);
            var that = this;
            return this.f(field)
            .catch(function (err) {
                return that.f.apply(that, args.slice(1));
            });
        }

        if (arguments.length == 0) {
            throw new Error("You must provide a field.");
        }

        var firstPart = field.indexOf(".");
        if (firstPart >= 0) {
            // Multiple fields were specified.
            return this.f(field.substr(0, firstPart))
            .then(function (result) {
                return result.f(field.substr(firstPart + 1));
            })
        }

        if (field == "") {
            return Promise.resolve(this);
        }

        function callHandler(index, dbgObject, path) {
            return fHandlers[index](dbgObject, path, (index + 1 < fHandlers.length ? callHandler.bind(null, index + 1) : null));
        }

        return callHandler(0, this, field);
    }

    var fHandlers = [];
    DbgObject.RegisterFHandler = function(handler) {
        fHandlers.unshift(handler);
    }

    // The default f handler gets the field and dereferences it automatically.
    DbgObject.RegisterFHandler(function (dbgObject, path, next) {
        return dbgObject.field(path)
        .then(function (field) {
            // Objects that are pointers and arrays are really arrays of pointers, so don't dereference them.
            if (field.type.isPointer() && !field.type.isArray()) {
                return field.deref();
            } else {
                return field;
            }
        })
    });

    DbgObject.prototype.field = function(field) {
        if (this.type.isPointer()) {
            throw new Error("You cannot do a field lookup on a pointer.");
        } else if (this.type.isArray()) {
            throw new Error("You cannot get a field from an array.");
        } else if (this == DbgObject.NULL) {
            return Promise.resolve(DbgObject.NULL);
        }

        var that = this;
        return moduleBasedLookup(that.type.moduleOrSyntheticName(), JsDbgPromise.LookupFieldOffset, that.type.name(), field)
        .then(function(result) {
            return DbgObject.create(
                getFieldType(that.type, field, DbgObjectType(result.module, result.type)),
                that.isNull() ? 0 : that._pointer.add(result.offset),
                result.bitcount,
                result.bitoffset,
                result.size
            );
        });
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
        var outerType = DbgObjectType(type, that.type);
        return new PromisedDbgObject(
            moduleBasedLookup(outerType.moduleOrSyntheticName(), JsDbgPromise.LookupFieldOffset, outerType.name(), field)
            .then(function(result) {
                return DbgObject.create(outerType, that.isNull() ? 0 : that._pointer.add(-result.offset));
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
        if (this == DbgObject.NULL) {
            return this;
        } else {
            var objectSize;
            if (disregardSize || this.typeSize === undefined) {
                objectSize = undefined;
            } else {
                objectSize = this.typeSize * (this.type.isArray() && this.type.arrayLength() > 0 ? this.type.arrayLength() : 1);
            }
            return DbgObject.create(DbgObjectType(type, this.type), this._pointer, this.bitcount, this.bitoffset, objectSize);
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
        return Promise.resolve(index)
        .then(function (index) {
            if (index == 0) {
                return DbgObject.create(that.type.nonArrayType(), that._pointer, that.bitcount, that.bitoffset, that.typeSize)
            } else {
                return that.size()
                .then(function (objectSize) {
                    return DbgObject.create(that.type.nonArrayType(), that._pointer.add(that.typeSize * index), that.bitcount, that.bitoffset, that.typeSize);
                })
            }
        })
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
    DbgObject.prototype.val = function() { return this._val(this.type.isUnsigned() || this.type.isPointer(), false, false, 0); }
    DbgObject.prototype.uval = function() { return this._val(true, false, false, 0); }
    DbgObject.prototype.sval = function() { return this._val(false, false, false, 0); }
    DbgObject.prototype.bigval = function() { return this._val(this.type.isUnsigned() || this.type.isPointer(), true, false, 0); }
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
    DbgObject.prototype.vals = function(count) { return this._val(this.type.isUnsigned() || this.type.isPointer(), false, true, count); }
    DbgObject.prototype.uvals = function(count) { return this._val(true, false, true, count); }
    DbgObject.prototype.svals = function(count) { return this._val(false, false, true, count); }
    DbgObject.prototype.bigvals = function(count) { return this._val(this.type.isUnsigned() || this.type.isPointer(), true, true, count); }
    DbgObject.prototype.ubigvals = function(count) { return this._val(true, true, true, count); }
    DbgObject.prototype.sbigvals = function(count) { return this._val(false, true, true, count); }

    DbgObject.prototype._help_setval = {
        description: "Writes to a scalar value held by a DbgObject.",
        returns: "A promise to undefined.",
        notes: "This method has several variants with respect to signedness: \
        <table>\
            <tr><th>name</th><th>sign</th></tr>\
            <tr><td><code>setval</code></td><td>auto</td></tr>\
            <tr><td><code>setsval</code></td><td>signed</td></tr>\
            <tr><td><code>setuval</code></td><td>unsigned</td></tr>\
        </table>",
        arguments: [{name: "value", type:"number", description: "The value to set."}],
    }
    DbgObject.prototype.setval = function(value) { return this._setval(this.type.isUnsigned() || this.type.isPointer(), value); }
    DbgObject.prototype.setuval = function(value) { return this._setval(true, value); }
    DbgObject.prototype.setsval = function(value) { return this._setval(false, value); }

    DbgObject.prototype._val = function(unsigned, useBigInt, isCountSpecified, count) {
        if (this.isNull()) {
            if (isCountSpecified) {
                return Promise.resolve([]);
            } else {
                return Promise.resolve(null);
            }
        }

        if (this.type.name() == "void") {
            if (!isCountSpecified) {
                return Promise.resolve(this._pointer);
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
        return Promise.all([this.idx(0).size(), isCountSpecified ? count : 1])

        // Get the array of values.
        .thenAll(function(valueSize, arrayCount) {
            if (arrayCount instanceof DbgObject) {
                arrayCount = arrayCount.val();
            }
            return Promise.resolve(arrayCount)
            .then(function (arrayCount) {
                if (arrayCount > 1000000) {
                    throw new Error("Cannot retrieve over 1,000,000 values all at once.");
                }

                return MemoryCachePromise.ReadArray(that._pointer.value(), valueSize, unsigned, that.type.isFloat(), arrayCount);
            })
        })

        // If we're a bit field, extract the bits.
        .then(function(result) {
            var array = result.array;
            if (that.type.isFloat()) {
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

    DbgObject.prototype._setval = function(unsigned, value) {
        if (!this.type.isFloat()) {
            value = bigInt(value);
        }

        if (this.isNull()) {
            return Promise.resolve(null);
        }

        if (this.type.name() == "void") {
            throw new Error("You may not write to a void object.");
        }

        var that = this;
        return this.size()
        .then(function (structSize) {
            if (that.bitcount && that.bitoffset !== undefined && !that.type.isFloat()) {
                unsigned = true;
            }

            // Read the current value first.  If it's not different, don't go through with the write.
            return MemoryCachePromise.ReadNumber(that._pointer.value(), structSize, unsigned, that.type.isFloat())
            .then(function (currentValue) {
                // If we're a bit field, compute the full value to write.
                if (that.bitcount && that.bitoffset !== undefined && !that.type.isFloat()) {
                    var maskedBits = currentValue.value
                    .and(bigInt.one.shiftLeft(that.bitcount).minus(1).shiftLeft(that.bitoffset).not())
                    .or(
                        value
                        .and(bigInt.one.shiftLeft(that.bitcount).minus(1))
                        .shiftLeft(that.bitoffset)
                    );

                    if (maskedBits.equals(currentValue.value)) {
                        return null;
                    } else {
                        return maskedBits;
                    }
                } else if (that.type.isFloat()) {
                    if (currentValue.value == value) {
                        return null;
                    } else {
                        return value;
                    }
                } else {
                    if (currentValue.value.equals(value)) {
                        return null;
                    } else {
                        return value;
                    }
                }
            })
            .then(function (valueToWrite) {
                if (valueToWrite != null) {
                    return JsDbgPromise.WriteNumber(that._pointer.value(), structSize, unsigned, that.type.isFloat(), valueToWrite);
                }
            })
            .then(function () {
                return undefined;
            })
        });
    }

    DbgObject.prototype._help_isTypeWithFields = {
        description: "Indicates if the type of the DbgObject is one that may have fields.",
        returns: "A promise to a bool."
    };

    DbgObject.prototype.isTypeWithFields = function() {
        var that = this;
        return Promise.resolve(null)
        .then(function () {
            if (that.type.isScalar() || that.type.isPointer()) {
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
        return moduleBasedLookup(this.type.moduleOrSyntheticName(), JsDbgPromise.IsTypeEnum, this.type.name())
        .then(function (result) { return result.isEnum; })
    }

    DbgObject.prototype._help_constant = {
        description: "Retrieves a constant/enum value held by a DbgObject.",
        returns: "A promise to a string."
    }
    DbgObject.prototype.constant = function() {
        if (this.isNull()) {
            return Promise.resolve(null);
        }

        var that = this;
        return this.ubigval()
        // Lookup the constant name...
        .then(function(value) {
            return moduleBasedLookup(that.type.moduleOrSyntheticName(), JsDbgPromise.LookupConstantName, that.type.name(), value);
        })

        // And return it.
        .then(function(result) { return result.length ? result[0].name : Promise.reject("Invalid constant"); })
    }

    DbgObject.prototype._help_hasConstantFlag = {
        description: "Indicates if the enum has the given flag.",
        returns: "A promise to a bool.",
        arguments: [
            {name: "flag", type: "string", description: "The enum value name to test."}
        ]
    }
    DbgObject.prototype.hasConstantFlag = function(flag) {
        return Promise.all([this.bigval(), DbgObject.constantValue(this.type, flag)])
        .thenAll(function (value, flag) {
            return value.and(flag).equals(flag);
        })
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
        return Promise.resolve(lastNodePromise)
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
                    return Promise.resolve(fieldOrFunction(node)).then(collectRemainingNodes);
                }
            }

            return Promise.resolve(collectRemainingNodes(firstNode));
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

        return Promise.resolve(length)
        .then(function (length) {
            if (length === undefined) {
                // Using a null-terminated string.
                var getRestOfString = function(character, prefix, suggestedChunkSize) {
                    var chunkSize = suggestedChunkSize;
                    var PAGE_SIZE = 4096;
                    // Ensure the chunk size doesn't cross a page boundary to reduce the risk of overfetching.
                    while (PAGE_SIZE - character.pointerValue().mod(PAGE_SIZE) < chunkSize && chunkSize > 1) {
                        chunkSize = chunkSize / 2;
                    }
                    return character.vals(chunkSize)
                    .then(null, function (err) {
                        if (chunkSize > 1) {
                            // Assume overfetching is the culprit, so refetch with a chunk size of 1.
                            suggestedChunkSize = 1;
                            chunkSize = 1;
                            return character.vals(chunkSize);
                        } else {
                            // Propagate the error.
                            throw err;
                        }
                    })
                    .then(function(vals) {
                        var characters = [];
                        for (var i = 0; i < vals.length; ++i) {
                            if (vals[i] == 0) {
                                return prefix + characters.join("");
                            } else {
                                characters.push(String.fromCharCode(vals[i]));
                            }
                        }

                        return character.idx(chunkSize)
                        .then(function (nextCharacterStart) {
                            return getRestOfString(nextCharacterStart, prefix + characters.join(""), suggestedChunkSize);
                        });
                    })
                };
                return getRestOfString(that, "", /*suggestedChunkSize*/64);
            } else {
                return that.vals(length)
                .then(function (chars) {
                    return chars.map(function (c) { return String.fromCharCode(c); }).join("");
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

    DbgObject.prototype._help_equals = {
        description: "Indicates if two DbgObjects represent the same address in memory.",
        returns: "A bool.",
        arguments: [
            {name: "other", type: "DbgObject", description: "The other DbgObject to compare."}
        ]
    }
    DbgObject.prototype.equals = function(other) {
        if (this._pointer === undefined || other._pointer === undefined) {
            throw "The pointer values are undefined.";
        }
        return this._pointer.equals(other._pointer);
    }

    DbgObject.prototype._help_vcast = {
        description: "Lookup the type to an object's vtable and attempt a multiple-inheritance-aware cast.",
        returns: "A promise to a DbgObject.",
        notes: "If the vtable's type implements the DbgObject's type multiple times (e.g. <code>IUnknown</code>) the result of this method is undefined."
    }
    DbgObject.prototype.vcast = function() {
        if (this.isNull()) {
            return Promise.resolve(this);
        }

        var that = this;
        // Read the value at the this pointer...
        return this.as("void*", true).ubigval()

        // Lookup the symbol at that value...
        .then(function(result) {
            return DbgObject.symbol(result);
        })
        .then(function(vtableSymbol) {
            if (vtableSymbol.indexOf("::`vftable'") < 0) {
                // No vtable.
                return that;
            }
            var vtableType = DbgObjectType(vtableSymbol.substr(0, vtableSymbol.indexOf("::`vftable'")));
            if (vtableType.equals(that.type)) {
                return that;
            }

            // Lookup the base class offset...
            return moduleBasedLookup(vtableType.moduleOrSyntheticName(), JsDbgPromise.LookupBaseTypes, vtableType.name())

            // And shift/cast.
            .then(function(baseTypes) {
                for (var i = 0; i < baseTypes.length; ++i) {
                    if (that.type.equals(baseTypes[i].module, baseTypes[i].type)) {
                        return DbgObject.create(vtableType, that._pointer.add(-baseTypes[i].offset));
                    }
                }

                // Maybe the vtable type is a base type of the original...
                return moduleBasedLookup(that.type.moduleOrSyntheticName(), JsDbgPromise.LookupBaseTypes, that.type.name())
                .then(function(originalBaseTypes) {
                    for (var i = 0; i < originalBaseTypes.length; ++i) {
                        if (vtableType.equals(originalBaseTypes[i].module, originalBaseTypes[i].type)) {
                            return DbgObject.create(vtableType, that._pointer.add(originalBaseTypes[i].offset));
                        }
                    }

                    // Couldn't find a proper offset, so just cast.
                    return DbgObject.create(vtableType, that._pointer);
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
        type = DbgObjectType(type, this.type);

        var that = this;
        return this.vcast()
        .then(function (result) {
            if (result.type.equals(type)) {
                return result;
            } else {
                return result.baseTypes()
                .then(function (baseTypes) {
                    baseTypes = baseTypes.filter(function (d) { return d.type.equals(type); });
                    return baseTypes.length > 0 ? baseTypes[0] : Promise.reject();
                })
            }
        })
        .then(null, function (err) {
            return DbgObject.create(type, 0);
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
        if (this == DbgObject.NULL) {
            return Promise.resolve(true);
        } else if (this.type.equals(type)) {
            return Promise.resolve(true);
        } else {
            return this.baseTypes()
            .then(function (baseTypes) {
                var matchingBaseTypes = baseTypes.filter(function (baseType) { return baseType.type.equals(type); });
                return (matchingBaseTypes.length > 0);
            });
        }
    }

    DbgObject.prototype._help_baseTypes = {
        description: "Gets the base types of an object.",
        returns: "A promise to an array of DbgObjects representing each of the base types."
    }
    DbgObject.prototype.baseTypes = function() {
        if (this == DbgObject.NULL) {
            return Promise.resolve([]);
        }

        var that = this;
        return moduleBasedLookup(that.type.moduleOrSyntheticName(), JsDbgPromise.LookupBaseTypes, that.type.name())
        .then(function (baseTypes) {
            // Put base types with greater offsets earlier so that the order proxies the order of fields.
            // So,
            //     Foo : Bar, Baz
            //     Bar : Base
            // will produce:
            //     [Baz, Bar, Base]
            // JsDbg ensures that base types will be listed after any derived types, so if the offsets are
            // equal, use the original sort order.
            var originalSortOrder = baseTypes.slice();
            baseTypes.sort(function (a, b) {
                var offsetDifference = b.offset - a.offset;
                if (offsetDifference != 0) {
                    return offsetDifference;
                } else {
                    return originalSortOrder.indexOf(a) - originalSortOrder.indexOf(b);
                }
            })
            return baseTypes.map(function (typeAndOffset) {
                return DbgObject.create(DbgObjectType(typeAndOffset.module, typeAndOffset.type), that._pointer.add(typeAndOffset.offset));
            });
        });
    }

    DbgObject.prototype._help_fields = {
        description: "Gets all available fields for a given type.",
        returns: "A promise to an array of {name:(string), offset:(int), size:(int), value:(DbgObjects)} objects."
    }
    DbgObject.prototype.fields = function(includeBaseTypes) {
        if (this.type.isPointer()) {
            throw new Error("You cannot lookup fields on a pointer.");
        }

        if (this == DbgObject.NULL) {
            return Promise.resolve([]);
        }

        if (includeBaseTypes === undefined) {
            includeBaseTypes = true;
        }

        var that = this;
        // Lookup the fields...
        return moduleBasedLookup(this.type.moduleOrSyntheticName(), JsDbgPromise.LookupFields, this.type.name(), includeBaseTypes)

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
                    value: DbgObject.create(
                        getFieldType(that.type, field.name, DbgObjectType(field.module, field.type)),
                        that._pointer.isNull() ? 0 : that._pointer.add(field.offset),
                        field.bitcount,
                        field.bitoffset,
                        field.size
                    )
                };
            });
        });
    }

    DbgObject.prototype._help_isNull = {
        description: "Indicates if the DbgObject is null.",
        returns: "A bool."
    }
    DbgObject.prototype.isNull = function() {
        return this._pointer.isNull();
    }
});
