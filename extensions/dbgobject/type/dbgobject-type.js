"use strict";

var DbgObjectType = undefined;
Loader.OnLoad(function () {
    var dbgObjectType = function(module, nameAndOffset) {
        var offsetMatches = nameAndOffset.match(/(^.*)\(([0-9]+)\)$/);
        var name = null;
        if (offsetMatches) {
            name = offsetMatches[1];
            this._offset = parseInt(offsetMatches[2])
        } else {
            name = nameAndOffset;
            this._offset = 0;
        }

        this._module = module.toLowerCase();

        // Normalize type name.
        this._name = name.trim();  // strip outer whitespace
        this._name = this._name.replace(/^const\s+/, "");  // remove leading "const" and whitespace
        this._name = this._name.replace(/\s+const$/, "");  // remove trailing "const" and whitespace
        this._name = this._name.replace(/(?:\s+const)?\s+(?=\*+$)/, "");  // remove whitespace and possible "const" before any "*"s

        // Get the array size.
        var arrayRegex = /\[[0-9]+\]/g;
        var matches = this._name.match(arrayRegex);
        if (matches) {
            this._isArray = true;
            // might be a multi-dimensional array
            this._arrayLength = 1;
            for (var i = 0; i < matches.length; ++i) {
                this._arrayLength *= parseInt(matches[i].substr(1, matches[i].length - 2));
            }
            this._name = this._name.replace(arrayRegex, '');
        } else {
            this._isArray = false;
            this._arrayLength = 0;
        }
    }

    dbgObjectType.prototype.toString = function() {
        return this.qualifiedName();
    }

    dbgObjectType.prototype.module = function() {
        return this._module;
    }

    dbgObjectType.prototype.equals = function () {
        var args = Array.prototype.slice.call(arguments);
        args.push(this);
        var otherType = DbgObjectType.apply(undefined, args);
        return this.comparisonName() == otherType.comparisonName();
    }

    dbgObjectType.prototype.name = function() {
        return this._name;
    }

    dbgObjectType.prototype.offset = function() {
        return this._offset;
    }

    dbgObjectType.prototype.isFloat = function() {
        return this.name() == "float" || this.name() == "double";
    }

    dbgObjectType.prototype.isUnsigned = function() {
        // Treat "char" as unsigned.
        return this.name().indexOf("unsigned ") == this.name() == "char";
    }

    dbgObjectType.prototype.fullName = function() {
        return this._name + (this._isArray ? "[" + this._arrayLength + "]" : "");
    }

    dbgObjectType.prototype.htmlName = function() {
        return this.fullName().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    dbgObjectType.prototype.qualifiedName = function() {
        return this._module + "!" + this.fullName();
    }

    dbgObjectType.prototype.comparisonName = function() {
        return this._module.toLowerCase() + "!" + this.fullName();
    }

    dbgObjectType.prototype.nonArrayComparisonName = function() {
        return this._module.toLowerCase() + "!" + this.name();
    }

    dbgObjectType.prototype.isPointer = function() {
        return this._name[this._name.length - 1] == "*";
    }

    var scalarTypes = [
        "bool",
        "char",
        "__int8",
        "short",
        "wchar_t",
        "__wchar_t",
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

    dbgObjectType.prototype.isScalar = function() {
        return this.name() in scalarTypes;
    }

    dbgObjectType.prototype.dereferenced = function() {
        if (this.isPointer()) {
            return DbgObjectType(this._name.substring(0, this._name.length - 1), this);
        } else {
            return DbgObjectType("void", this);
        }
    }

    dbgObjectType.prototype.isArray = function() {
        return this._isArray;
    }
    
    dbgObjectType.prototype.arrayLength = function() {
        return this._arrayLength;
    }

    dbgObjectType.prototype.nonArrayType = function() {
        return this.isArray() ? new dbgObjectType(this.module(), this.name()) : this;
    }

    dbgObjectType.prototype.templateParameters = function() {
        var templatedTypeName = this.name();
        var parameterString = templatedTypeName.substring(templatedTypeName.indexOf('<') + 1, templatedTypeName.lastIndexOf('>'));
        var parameters = [];

        var currentParameterStartIndex = 0;
        var openAngleBracketCount = 0;
        for (var index = 0; index < parameterString.length; index++) {
            var ch = parameterString.charAt(index);
            if (ch == '<') {
                openAngleBracketCount++;
            } else if (ch == '>') {
                openAngleBracketCount--;
            } else if (ch == ',') {
                if (openAngleBracketCount == 0) {
                    parameters.push(parameterString.substring(currentParameterStartIndex, index));
                    currentParameterStartIndex = index + 1;
                }
            }
        }
        console.assert(openAngleBracketCount == 0, "Bad templated type.");
        parameters.push(parameterString.substring(currentParameterStartIndex));
        return parameters;
    }

    DbgObjectType = function(arg1, arg2) {
        if (arg1 instanceof dbgObjectType) {
            // dbgObjectType is immutable.
            return arg1;
        } else if (arg1.indexOf("!") < 0) {
            if (arg2 instanceof dbgObjectType) {
                // arg1 is a name and arg2 is the context for the module.
                return new dbgObjectType(arg2.module(), arg1);
            } else if (typeof arg1 == typeof "" && typeof arg2 == typeof "") {
                // arg1 is the module and arg2 is the type.
                return new dbgObjectType(arg1, arg2);
            } else {
                throw new Error("Unable to create a type from: " + arg1 + ", " + arg2);
            }
        } else {
            var module = arg1.substr(0, arg1.indexOf("!"));
            var name = arg1.substr(module.length + 1);
            return new dbgObjectType(module, name);
        }
    }

    DbgObjectType.is = function(type) {
        return type instanceof dbgObjectType;
    }
})