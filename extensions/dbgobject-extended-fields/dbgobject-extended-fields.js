"use strict";

JsDbg.OnLoad(function () {
    var extendedTypes = {};

    function typeKey(module, typeName) {
        return module + "!" + typeName;
    }

    function getExtendedType(module, typeName) {
        var key = typeKey(module, typeName);
        if (!(key in extendedTypes)) {
            extendedTypes[key] = new ExtendedType(module, typeName);
        }
        return extendedTypes[key];
    }

    function ExtendedType(module, typeName) {
        this.module = module;
        this.typeName = typeName;
        this.listeners = [];
        this.fields = {};
    }

    function ExtendedField(fieldName, typeName, getter) {
        this.fieldName = fieldName;
        this.typeName = typeName;
        this.getter = getter;
    }

    ExtendedField.prototype.ensureCompatibleResult = function(result) {
        var that = this;
        if (result.typeDescription() == this.typeName) {
            return result;
        } else {
            return result.baseTypes()
            .then(function (baseTypes) {
                for (var i = 0; i < baseTypes.length; ++i) {
                    if (baseTypes[i].typeDescription() == that.typeName) {
                        return result;
                    }
                }

                throw new Error("The field \"" + that.fieldName + "\" was supposed to be type \"" + that.typeName + "\" but was unrelated type \"" + result.typeDescription() + "\".");
            });
        }
    }

    DbgObject.prototype._help_F = {
        description: "Accesses an \"extended\" field on an object, i.e. one that is defined by code rather than type information.",
        arguments: [
            {name: "extendedField", type:"string", description:"The extended field to access."}
        ],
        notes: function () {
            var fragments = [];
            fragments.push("<p>Extended fields can be registered with <code>DbgObject.AddExtendedField</code>.</p>");

            var listFragments = []
            listFragments.push("Currently registered extended fields:<ul>");
            for (var key in extendedTypes) {
                var extendedType = extendedTypes[key];
                for (var fieldKey in extendedType.fields) {
                    var extendedField = extendedType.fields[fieldKey];
                    listFragments.push("<li>" + extendedType.typeName + "." + extendedField.fieldName + " (" + extendedField.typeName + ")</li>");
                }
            }
            listFragments.push("</ul>");

            if (listFragments.length > 2) {
                fragments = fragments.concat(listFragments);
            }
            return fragments.join("\n");
        }
    };
    DbgObject.prototype.F = function(fieldName) {
        var extendedType = getExtendedType(this.module, this.typename);
        var result = null;
        var that = this;
        if (fieldName in extendedType.fields) {
            var field = extendedType.fields[fieldName];
            result = Promise.as(field.getter(this)).then(field.ensureCompatibleResult.bind(field))
        } else {
            result = this.baseTypes()
            .then(function (baseTypes) {
                for (var i = 0; i < baseTypes.length; ++i) {
                    var extendedType = getExtendedType(baseTypes[i].module, baseTypes[i].typename);
                    if (fieldName in extendedType.fields) {
                        var field = extendedType.fields[fieldName];
                        return Promise.as(field.getter(that)).then(field.ensureCompatibleResult.bind(field));
                    }
                }
                throw new Error("\"" + fieldName + "\" is not a registered field on " + that.typename);
            });
        }

        return new PromisedDbgObject(result);
    }

    DbgObject._help_AddExtendedField = {
        description: "Registers an extended field on a type that can be used with <code>DbgObject.prototype.F</code>.",
        arguments: [
            { name: "module", type: "string", description: "The module name of the type to add the extended field to." },
            { name: "typeName", type: "string", description: "The name of the type to add the extended field to." },
            { name: "fieldName", type: "string", description: "The name of the extended field." },
            { name: "fieldTypeName", type: "string", description: "The type of the extended field." },
            { name: "getter", type: "(DbgObject) -> (Promise to a) DbgObject", description: "The logic to access the field." }
        ],
    };
    DbgObject.AddExtendedField = function(module, typeName, fieldName, fieldTypeName, getter) {
        var extendedType = getExtendedType(module, typeName);
        if (fieldName in extendedType.fields) {
            throw new Error("There is already a \"" + fieldName + "\" field registered for " + module + "!" + typeName);
        }

        extendedType.fields[fieldName] = new ExtendedField(fieldName, fieldTypeName, getter);
        extendedType.listeners.forEach(function (listener) {
            listener(module, typeName, fieldName, fieldTypeName, /*isAdded*/true);
        });
    }

    DbgObject._help_RemoveExtendedField = {
        description: "Removes a previously registered extended field.",
        arguments: [
            { name: "module", type: "string", description: "The module name of the type to remove the extended field from." },
            { name: "typeName", type: "string", description: "The name of the type to remove the extended field from." },
            { name: "fieldName", type: "string", description: "The name of the extended field to remove." }
        ]
    }
    DbgObject.RemoveExtendedField = function(module, typeName, fieldName) {
        var extendedType = getExtendedType(module, typeName);
        if (fieldName in extendedType.fields) {
            var extendedField = extendedType.fields[fieldName];
            delete extendedType.fields[fieldName];
            extendedType.listeners.forEach(function (listener) {
                listener(module, typeName, fieldName, extendedField.typeName, /*isAdded*/false);
            });
        } else {
            throw new Error("\"" + fieldName + "\" is not a registered field on " + typeName);
        }
    }

    DbgObject._help_GetExtendedFields = {
        description: "Gets an array of extended fields.",
        arguments: [
            { name: "module", type: "string", description: "The module name of the type to get extended fields for." },
            { name: "typeName", type: "string", description: "The name of the type to get extended fields for." }
        ],
        returns: "An array of extended fields with <code>fieldName</code>, <code>typeName</code>, and <code>getter</code> fields."
    }
    DbgObject.GetExtendedFields = function(module, typeName) {
        var fields = getExtendedType(module, typeName).fields;
        var result = [];
        for (var key in fields) {
            result.push(fields[key]);
        }

        return result;
    }

    DbgObject._help_OnExtendedFieldsChanged = {
        description: "Registers a listener for when the extended fields of a type change.",
        arguments: [
            { name: "module", type: "string", description: "The module name of the type to listen to notifications for." },
            { name: "typeName", type: "string", description: "The name of the type to listen to notifications for."},
            { name: "notifier", type: "function (module (string), typeName (string))", description: "The notification function."}
        ]
    }
    DbgObject.OnExtendedFieldsChanged = function(module, typeName, notifier) {
        getExtendedType(module, typeName).listeners.push(notifier);
    }

    if (typeof(Tests) !== typeof(undefined)) {
        var suite = Tests.CreateTestSuite("DbgObject-Extended-Fields", "Tests for the extended field functionality on DbgObject.");

        Tests.AddTest(suite, "AddExtendedField", function (assert) {
            var resultObject = new DbgObject("test", "ResultType", 0);
            DbgObject.AddExtendedField("test", "TestType", "field", "ResultType", function (dbgObject) {
                return resultObject;
            });

            var fResult = new DbgObject("test", "TestType", 0).F("field");
            assert(fResult.__proto__ == PromisedDbgObject.prototype);

            return fResult
            .then(function (result) {
                assert.equals(result, resultObject);
                DbgObject.RemoveExtendedField("test", "TestType", "field");
            });
        });

        Tests.AddTest(suite, "OnExtendedFieldsChanged", function (assert) {
            var didNotify = false;
            DbgObject.OnExtendedFieldsChanged("test", "TestType", function() {
                didNotify = true;
            });

            DbgObject.AddExtendedField("test", "TestType", "field", "ResultType", function() { return this.as("ResultType"); });

            assert(didNotify);
            didNotify = false;

            DbgObject.RemoveExtendedField("test", "TestType", "field");
            assert(didNotify);
        });

        Tests.AddTest(suite, "GetExtendedFields", function (assert) {
            DbgObject.AddExtendedField("test", "TestType", "field", "ResultType", function() { return this.as("ResultType"); });
            
            var extendedFields = DbgObject.GetExtendedFields("test", "TestType");
            assert.equals(extendedFields.length, 1);
            assert.equals(extendedFields[0].fieldName, "field");
            assert.equals(extendedFields[0].typeName, "ResultType");

            DbgObject.RemoveExtendedField("test", "TestType", "field");
        });

        Tests.AddTest(suite, "RemoveExtendedField", function (assert) {
            DbgObject.AddExtendedField("test", "TestType", "field", "TestType", function() { return this; });
            DbgObject.RemoveExtendedField("test", "TestType", "field");

            var didError = false;
            return new DbgObject("test", "TestType", 0).F("field")
            .then(null, function (err) {
                didError = true;
            })
            .then(function() {
                assert(didError);
            })
        });

        Tests.AddTest(suite, "Type Assertion", function (assert) {
            DbgObject.AddExtendedField("test", "TestType", "field", "ResultType", function() { return this; });

            var didError = false;
            return new DbgObject("test", "TestType", 0).F("field")
            .then(null, function (err) {
                didError = true;
            })
            .then(function() {
                assert(didError, "Invalid F() should fail.");
                DbgObject.RemoveExtendedField("test", "TestType", "field");
            });
        });
    }
});