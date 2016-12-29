"use strict";

Loader.OnLoad(function () {
    var registeredFields = new DbgObject.TypeExtension();
    DbgObject.ExtendedFields = registeredFields;

    function ExtendedField(name, typeName, getter) {
        this.name = name;
        this.typeName = typeName;
        this.getter = getter;
    }

    ExtendedField.prototype.ensureCompatibleResult = function(result) {
        var that = this;
        if (!(result instanceof DbgObject)) {
            throw new Error("The field \"" + this.name + "\" did not return a DbgObject, but returned \"" + result + "\"");
        } else {
            return result.isType(this.typeName)
            .then(function (isType) {
                if (!isType) {
                    throw new Error("The field \"" + that.name + "\" was supposed to be type \"" + that.typeName + "\" but was unrelated type \"" + result.typeDescription() + "\".");
                } else {
                    return result;
                }
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
                registeredFields.getAllExtensions(type.module, type.type).forEach(function (extension) {
                    if (typeof type.type == typeof "") {
                        listFragments.push("<li>" + type.module + "!" + type.type + "." + extension.extension.name + " (" + extension.extension.typeName + ")</li>");
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
                throw new Error("There was no extended field \"" + fieldName + "\" on " + that.typeDescription())
            }

            return Promise.resolve(result.extension.getter(result.dbgObject))
            .then(result.extension.ensureCompatibleResult.bind(result.extension));
        });

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
        if (fieldName.indexOf(".") != -1) {
            throw new Error("You cannot have a field name with a '.' in it.");
        }

        var extendedField = new ExtendedField(fieldName, fieldTypeName, getter);
        return registeredFields.addExtension(module, typeName, fieldName, extendedField);
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
        return registeredFields.removeExtension(module, typeName, fieldName);
    }

    DbgObject._help_UpdateExtendedField = {
        description: "Updates the name or result type of a previously registered extended field.",
        arguments: [
            { name: "module", type: "string", description: "The module name of the type to update the extended field on." },
            { name: "typeName", type: "string", description: "The name of the type to update the extended field on." },
            { name: "oldFieldName", type: "string", description: "The name of the extended field to update." },
            { name: "newFieldName", type: "string", description: "The new name of the extended field." },
            { name: "newFieldType", type: "string", description: "The new type of the extended field." }
        ]
    }
    DbgObject.UpdateExtendedField = function(module, typeName, oldFieldName, newFieldName, newFieldType) {
        if (newFieldName.indexOf(".") != -1) {
            throw new Error("You cannot have a field name with a '.' in it.");
        }

        registeredFields.renameExtension(module, typeName, oldFieldName, newFieldName);
        var extension = registeredFields.getExtension(module, typeName, newFieldName);
        if (extension.typeName != newFieldType) {
            extension.typeName = newFieldType;
            registeredFields.notifyListeners(module, typeName, newFieldName, extension, "typechange", newFieldType);
        }
    }

    DbgObject._help_GetExtendedFields = {
        description: "Gets an array of extended fields.",
        arguments: [
            { name: "module", type: "string", description: "The module name of the type to get extended fields for." },
            { name: "typeName", type: "string", description: "The name of the type to get extended fields for." }
        ],
        returns: "An array of extended fields with <code>name</code>, <code>typeName</code>, and <code>getter</code> fields."
    }
    DbgObject.GetExtendedFields = function(module, typeName) {
        return registeredFields.getAllExtensions(module, typeName).map(function (extension) {
            return extension.extension;
        });
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
        return registeredFields.addListener(module, typeName, notifier);
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

        Tests.AddTest(suite, "AddExtendedField (type predicate)", function (assert) {
            var resultObject = new DbgObject("test", "ResultType", 0);
            var predicate = function (t) { return t.indexOf("Test") == 0; };
            DbgObject.AddExtendedField("test", predicate, "predicateField", "ResultType", function() {
                return resultObject;
            });

            var fResult = new DbgObject("test", "TestX", 0).F("predicateField");
            assert(fResult.__proto__ == PromisedDbgObject.prototype);

            var didError = false;
            return fResult
            .then(function (result) {
                assert.equals(result, resultObject);

                return new DbgObject("test", "ShouldFail", 0).F("predicateField");
            })
            .then(null, function () { didError = true })
            .then(function () {
                assert(didError);
                DbgObject.RemoveExtendedField("test", predicate, "predicateField");
            })
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
            assert.equals(extendedFields[0].name, "field");
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