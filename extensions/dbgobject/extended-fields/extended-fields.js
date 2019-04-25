//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

Loader.OnLoad(function () {
    var registeredFields = new DbgObject.TypeExtension();
    DbgObject.ExtendedFields = registeredFields;

    function ExtendedField(name, type, getter) {
        this.name = name;
        this.type = type;
        this.getter = getter;
    }

    ExtendedField.prototype.getExpectedType = function(parentType) {
        if (DbgObjectType.is(this.type)) {
            return Promise.resolve(this.type);
        } else {
            return Promise.resolve(this.type(parentType))
            .then((resolvedType) => {
                return DbgObjectType(resolvedType, parentType);
            });
        }
    }

    ExtendedField.prototype.ensureCompatibleResult = function(parentType, result) {
        var that = this;
        if (!(result instanceof DbgObject)) {
            throw new Error("The field \"" + this.name + "\" did not return a DbgObject, but returned \"" + result + "\"");
        } else {
            return this.getExpectedType(parentType)
            .then((expectedType) => {
                return result.isType(expectedType)
                .then(function (isType) {
                    if (!isType) {
                        throw new Error("The field \"" + that.name + "\" was supposed to be type \"" + expectedType + "\" but was unrelated type \"" + result.type + "\".");
                    } else {
                        return result;
                    }
                });
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

            var types = registeredFields.getAllTypes();
            types.forEach(function (type) {
                registeredFields.getAllExtensions(type.type).forEach(function (extension) {
                    if (DbgObjectType.is(type.type)) {
                        listFragments.push("<li>" + type.type + "." + extension.extension.name + " (" + extension.extension.type + ")</li>");
                    }
                })
            });

            listFragments.push("</ul>");

            if (listFragments.length > 2) {
                fragments = fragments.concat(listFragments);
            }
            return fragments.join("\n");
        }
    };
    DbgObject.prototype.F = function(fieldNames) {
        if (this == DbgObject.NULL) {
            return Promise.resolve(DbgObject.NULL);
        }

        var fields = fieldNames.split(".");
        var current = Promise.resolve(this);
        fields.forEach(function (field) {
            current = current.then(function (result) { return result._FHelper(field) });
        });
        return current;
    }

    DbgObject.prototype._FHelper = function (fieldName) {
        var that = this;
        var result = registeredFields.getExtensionIncludingBaseTypes(this, fieldName)
        .then(function (result) {
            if (result == null) {
                throw new Error("There was no extended field \"" + fieldName + "\" on " + that.type)
            }

            return Promise.resolve(result.extension.getter(result.dbgObject))
            .then(result.extension.ensureCompatibleResult.bind(result.extension, that.type));
        });

        return new PromisedDbgObject(result);
    }

    function normalizeFieldType(fieldType, type) {
        if (!DbgObjectType.is(fieldType) && !(fieldType instanceof Function)) {
            if (!DbgObjectType.is(type)) {
                throw new Error("Invalid field type.");
            }
            fieldType = DbgObjectType(fieldType, type);
        }

        return fieldType;
    }

    DbgObject._help_AddExtendedField = {
        description: "Registers an extended field on a type that can be used with <code>DbgObject.prototype.F</code>.",
        arguments: [
            { name: "type", type: "DbgObjectType", description: "The type to add the extended field to." },
            { name: "fieldName", type: "string", description: "The name of the extended field." },
            { name: "fieldType", type: "DbgObjectType", description: "The type of the extended field." },
            { name: "getter", type: "(DbgObject) -> (Promise to a) DbgObject", description: "The logic to access the field." }
        ],
    };
    DbgObject.AddExtendedField = function(type, fieldName, fieldType, getter) {
        if (fieldName.indexOf(".") != -1) {
            throw new Error("You cannot have a field name with a '.' in it.");
        }

        var extendedField = new ExtendedField(fieldName, normalizeFieldType(fieldType, type), getter);
        return registeredFields.addExtension(type, fieldName, extendedField);
    }

    DbgObject._help_RemoveExtendedField = {
        description: "Removes a previously registered extended field.",
        arguments: [
            { name: "type", type: "DbgObjectType", description: "The type to remove the extended field from." },
            { name: "fieldName", type: "string", description: "The name of the extended field to remove." }
        ]
    }
    DbgObject.RemoveExtendedField = function(type, fieldName) {
        return registeredFields.removeExtension(type, fieldName);
    }

    DbgObject._help_UpdateExtendedField = {
        description: "Updates the name or result type of a previously registered extended field.",
        arguments: [
            { name: "type", type: "DbgObjectType", description: "The type to update the extended field on." },
            { name: "oldFieldName", type: "string", description: "The name of the extended field to update." },
            { name: "newFieldName", type: "string", description: "The new name of the extended field." },
            { name: "newFieldType", type: "DbgObjectType", description: "The new type of the extended field." }
        ]
    }
    DbgObject.UpdateExtendedField = function(type, oldFieldName, newFieldName, newFieldType) {
        if (newFieldName.indexOf(".") != -1) {
            throw new Error("You cannot have a field name with a '.' in it.");
        }

        newFieldType = normalizeFieldType(newFieldType, type);

        registeredFields.renameExtension(type, oldFieldName, newFieldName);
        var extension = registeredFields.getExtension(type, newFieldName);
        if (extension.type.equals(newFieldType)) {
            extension.type = newFieldType;
            registeredFields.notifyListeners(type, newFieldName, extension, "typechange", newFieldType);
        }
    }

    DbgObject._help_GetExtendedFields = {
        description: "Gets an array of extended fields.",
        arguments: [
            { name: "type", type: "DbgObjectType", description: "The type to get extended fields for." }
        ],
        returns: "An array of extended fields with <code>name</code>, <code>type</code>, and <code>getter</code> fields."
    }
    DbgObject.GetExtendedFields = function(type) {
        return registeredFields.getAllExtensions(type).map(function (extension) {
            return extension.extension;
        });
    }

    DbgObject._help_OnExtendedFieldsChanged = {
        description: "Registers a listener for when the extended fields of a type change.",
        arguments: [
            { name: "type", type: "DbgObjectType", description: "The type to listen to notifications for."},
            { name: "notifier", type: "function (type (string))", description: "The notification function."}
        ]
    }
    DbgObject.OnExtendedFieldsChanged = function(type, notifier) {
        return registeredFields.addListener(type, notifier);
    }

    if (typeof(Tests) !== typeof(undefined)) {
        var suite = Tests.CreateTestSuite("DbgObject-Extended-Fields", "Tests for the extended field functionality on DbgObject.");

        Tests.AddTest(suite, "AddExtendedField", function (assert) {
            var resultObject = DbgObject.create(DbgObjectType("test", "ResultType"), 0);
            DbgObject.AddExtendedField(DbgObjectType("test", "TestType"), "field", "ResultType", function (dbgObject) {
                return resultObject;
            });

            var fResult = DbgObject.create(DbgObjectType("test", "TestType"), 0).F("field");
            assert(fResult.__proto__ == PromisedDbgObject.prototype);

            return fResult
            .then(function (result) {
                assert.equals(result, resultObject);
            })
            .finally(function() {
                DbgObject.RemoveExtendedField(DbgObjectType("test", "TestType"), "field");
            });
        });

        Tests.AddTest(suite, "AddExtendedField (type predicate)", function (assert) {
            var resultObject = DbgObject.create(DbgObjectType("test", "ResultType"), 0);
            var predicate = function (t) { return t.name().indexOf("Test") == 0; };
            DbgObject.AddExtendedField(predicate, "predicateField", DbgObjectType("test", "ResultType"), function() {
                return resultObject;
            });

            var fResult = DbgObject.create(DbgObjectType("test", "TestX"), 0).F("predicateField");
            assert(fResult.__proto__ == PromisedDbgObject.prototype);

            var didError = false;
            return fResult
            .then(function (result) {
                assert.equals(result, resultObject);

                return DbgObject.create(DbgObjectType("test", "ShouldFail"), 0).F("predicateField");
            })
            .then(null, function () { didError = true })
            .then(function () {
                assert(didError);
            })
            .finally(function() {
                DbgObject.RemoveExtendedField(predicate, "predicateField");
            })
        });

        Tests.AddTest(suite, "OnExtendedFieldsChanged", function (assert) {
            var didNotify = false;
            DbgObject.OnExtendedFieldsChanged(DbgObjectType("test", "TestType"), function() {
                didNotify = true;
            });

            DbgObject.AddExtendedField(DbgObjectType("test", "TestType"), "field", "ResultType", function() { return this.as("ResultType"); });

            assert(didNotify);
            didNotify = false;

            DbgObject.RemoveExtendedField(DbgObjectType("test", "TestType"), "field");
            assert(didNotify);
        });

        Tests.AddTest(suite, "GetExtendedFields", function (assert) {
            DbgObject.AddExtendedField(DbgObjectType("test", "TestType"), "field", "ResultType", function() { return this.as("ResultType"); });
            
            var extendedFields = DbgObject.GetExtendedFields(DbgObjectType("test", "TestType"));
            assert.equals(extendedFields.length, 1);
            assert.equals(extendedFields[0].name, "field");
            assert(extendedFields[0].type.equals("ResultType"));

            DbgObject.RemoveExtendedField(DbgObjectType("test", "TestType"), "field");
        });

        Tests.AddTest(suite, "RemoveExtendedField", function (assert) {
            DbgObject.AddExtendedField(DbgObjectType("test", "TestType"), "field", "TestType", function() { return this; });
            DbgObject.RemoveExtendedField(DbgObjectType("test", "TestType"), "field");

            var didError = false;
            return DbgObject.create(DbgObjectType("test", "TestType"), 0).F("field")
            .then(null, function (err) {
                didError = true;
            })
            .then(function() {
                assert(didError);
            })
        });

        Tests.AddTest(suite, "Type Assertion", function (assert) {
            DbgObject.AddExtendedField(DbgObjectType("test", "TestType"), "field", "ResultType", function() { return this; });

            var didError = false;
            return DbgObject.create(DbgObjectType("test", "TestType"), 0).F("field")
            .then(null, function (err) {
                didError = true;
            })
            .then(function() {
                assert(didError, "Invalid F() should fail.");
            })
            .finally(function() {
                DbgObject.RemoveExtendedField(DbgObjectType("test", "TestType"), "field");
            })
        });
    }
});