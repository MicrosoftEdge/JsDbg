//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var DbgObjectType = undefined;
Loader.OnLoad(function () {
    var dbgObjectType = function(moduleOrSyntheticName, nameAndOffset, moduleName) {
        var offsetMatches = nameAndOffset.match(/(^.*)\(([0-9]+)\)$/);
        var name = null;
        if (offsetMatches) {
            name = offsetMatches[1];
            this._offset = parseInt(offsetMatches[2])
        } else {
            name = nameAndOffset;
            this._offset = 0;
        }

        this._moduleOrSyntheticName = moduleOrSyntheticName.toLowerCase();
        this._moduleName = moduleName ? moduleName : this._moduleOrSyntheticName;

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

    dbgObjectType.prototype.moduleOrSyntheticName = function() {
        return this._moduleOrSyntheticName;
    }

    dbgObjectType.prototype.moduleName = function() {
        return this._moduleName;
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
        return this._moduleName + "!" + this.fullName();
    }

    dbgObjectType.prototype.comparisonName = function() {
        return this._moduleOrSyntheticName.toLowerCase() + "!" + this.fullName();
    }

    dbgObjectType.prototype.nonArrayComparisonName = function() {
        return this._moduleOrSyntheticName.toLowerCase() + "!" + this.name();
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
        console.assert(this.isPointer());
        return DbgObjectType(this._name.substring(0, this._name.length - 1), this);
    }

    dbgObjectType.prototype.isArray = function() {
        return this._isArray;
    }
    
    dbgObjectType.prototype.arrayLength = function() {
        return this._arrayLength;
    }

    dbgObjectType.prototype.nonArrayType = function() {
        return this.isArray() ? new dbgObjectType(this.moduleOrSyntheticName(), this.name()) : this;
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
                return new dbgObjectType(arg2.moduleOrSyntheticName(), arg1, arg2.moduleName());
            } else if (typeof arg1 == typeof "" && typeof arg2 == typeof "") {
                // arg1 is the module and arg2 is the type.
                return new dbgObjectType(SyntheticModules.ModuleOrSyntheticName(arg1), arg2, arg1);
            } else {
                throw new Error("Unable to create a type from: " + arg1 + ", " + arg2);
            }
        } else {
            var moduleName = arg1.substr(0, arg1.indexOf("!"));
            var name = arg1.substr(moduleName.length + 1);
            return new dbgObjectType(SyntheticModules.ModuleOrSyntheticName(moduleName), name, moduleName);
        }
    }

    DbgObjectType.is = function(type) {
        return type instanceof dbgObjectType;
    }
})