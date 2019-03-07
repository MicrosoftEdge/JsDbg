//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// user-dbgobject-extensions.js
// Logic for creating, editing, and saving DbgObject extensions (extended fields, type descriptions, etc.) from the browser.
var UserDbgObjectExtensions = undefined;
Loader.OnLoad(function() {
    var persistentStore = Catalog.Load("UserDbgObjectExtensions");

    function EditableDbgObjectExtension(isPersisted, type, name, resultingType, isArray, editableFunction, creationContext) {
        this.isPersisted = isPersisted;
        this.uniqueId = "UserField-" + (new Date() - 0) + "-" + Math.round(Math.random() * 1000000)
        this.type = type;
        this.isArray = isArray;
        this.name = name;
        this.resultingType = resultingType;
        this.editableFunction = editableFunction;
        this.creationContext = creationContext;
        var that = this;
        this.editableFunctionListener = function() {
            that.serialize();
        }

        if (this.editableFunction) {
            this.editableFunction.editableDbgObjectExtension = this;
            UserEditableFunctions.AddListener(this.editableFunction, this.editableFunctionListener);
        }
    }

    EditableDbgObjectExtension.Create = function(type, name, resultingType, isArray, editableFunction, creationContext) {
        var editableExtension = new EditableDbgObjectExtension(/*isPersisted*/true, type, name, resultingType, isArray, editableFunction, creationContext);
        editableExtension.realizeExtension();
    }

    var deserializationPromise = null;
    EditableDbgObjectExtension.DeserializeAll = function () {
        if (deserializationPromise == null) {
            deserializationPromise = new Promise(function (oncomplete, onerror) {
                persistentStore.all(function (results) {
                    if (results.error) {
                        onerror(results.error);
                    } else if (results) {
                        for (var key in results) {
                            try {
                                var f = new EditableDbgObjectExtension();
                                f.deserialize(key, results[key]);
                                f.forceRealization();
                            } catch (ex) {
                                console.log("Error deserializing DbgObjectExtension (" + ex + "): " + JSON.stringify(results[key], 2, "  "));
                            }
                        }
                    }
                    oncomplete();
                });
            });
        }

        // If the persistent store fails to load, don't hold the rest of the page hostage.
        return deserializationPromise.catch(function() { });
    }

    EditableDbgObjectExtension.prototype.realizeExtension = function() {
        if (this.isArray) {
            DbgObject.AddArrayField(this.type, this.name, this.resultingType, this.editableFunction);
        } else if (this.resultingType != null) {
            DbgObject.AddExtendedField(this.type, this.name, this.resultingType, this.editableFunction);
        } else {
            DbgObject.AddTypeDescription(this.type, this.name, false, this.editableFunction);
        }
    }

    EditableDbgObjectExtension.prototype.forceRealization = function() {
        try {
            this.realizeExtension();
        } catch (ex) {
            // Try removing one with the same name.
            try {
                if (this.isArray) {
                    DbgObject.RemoveArrayField(this.type, this.name);
                } else if (this.resultingType != null) {
                    DbgObject.RemoveExtendedField(this.type, this.name);
                } else {
                    DbgObject.RemoveTypeDescription(this.type, this.name);
                }
                this.realizeExtension();
                console.log("The user-created DbgObject extension " + this.type.qualifiedName() + "." + this.name + " conflicted with an existing extension.");
            } catch (ex2) {
                console.log("Unable to load a user-created extension. " + ex2.toString());
            }
        }
    }

    EditableDbgObjectExtension.prototype.delete = function() {
        if (this.editableFunction) {
            UserEditableFunctions.RemoveListener(this.editableFunction, this.editableFunctionListener);
        }

        if (this.isArray) {
            DbgObject.RemoveArrayField(this.type, this.name);
        } else if (this.resultingType) {
            DbgObject.RemoveExtendedField(this.type, this.name);
        } else {
            DbgObject.RemoveTypeDescription(this.type, this.name);
        }

        if (this.isPersisted) {
            var that = this;
            return new Promise(function (oncomplete, onerror) {
                persistentStore.delete(that.uniqueId, oncomplete);
            });
        }
    }

    EditableDbgObjectExtension.prototype.serialize = function() {
        if (this.isPersisted) {
            var serialized = {
                module: this.type.moduleOrSyntheticName(),
                typeName: this.type.fullName(),
                name: this.name,
                resultingTypeName: this.resultingType == null ? null : this.resultingType.qualifiedName(),
                isArray: this.isArray,
                editableFunction: UserEditableFunctions.Serialize(this.editableFunction)
            };
            var uniqueId = this.uniqueId;
            return new Promise(function (onsuccess, onerror) {
                persistentStore.set(uniqueId, serialized, onsuccess);
            });
        }
    }

    EditableDbgObjectExtension.prototype.deserialize = function(id, serialized) {
        this.isPersisted = true;
        this.uniqueId = id;
        this.type = DbgObjectType(serialized.module, serialized.typeName);
        this.name = serialized.name;
        this.resultingType = serialized.resultingTypeName == null ? null : DbgObjectType(serialized.resultingTypeName, this.type);
        this.isArray = !!serialized.isArray;
        this.editableFunction = UserEditableFunctions.Deserialize(serialized.editableFunction);
        this.editableFunction.editableDbgObjectExtension = this;
        this.creationContext = undefined;
        var that = this;
        UserEditableFunctions.AddListener(this.editableFunction, this.editableFunctionListener);
    }

    EditableDbgObjectExtension.prototype.update = function(type, name, resultingType, isArray) {
        var needsUpdate = false;
        if (!this.type.equals(type)) {
            needsUpdate = true;
            this.type = type;
        }

        var oldName = this.name;
        if (this.name != name) {
            needsUpdate = true;
            this.name = name;
        }

        if (this.resultingType != null && resultingType != null &&  !this.resultingType.equals(resultingType)) {
            needsUpdate = true;
            this.resultingType = resultingType;
        }

        if (this.isArray != isArray) {
            throw new Error("EditableDbgObjectExtension does not support changing extension types.");
        }

        if (needsUpdate) {
            if (this.isArray) {
                DbgObject.UpdateArrayField(this.type, oldName, this.name, this.resultingType);
            } else if (this.resultingType != null) {
                DbgObject.UpdateExtendedField(this.type, oldName, this.name, this.resultingType);
            } else {
                DbgObject.RenameTypeDescription(this.type, oldName, this.name);
            }
            this.serialize();
        }
    }

    var FieldEditability = {
        FullyEditable: 0,
        NotEditable: 1,
        EditableExceptHasType: 2
    };

    function beginEditing(editability, type, fieldName, resultingType, isArray, editableFunction, onSave) {
        // Initialize the modal editor.
        var backdrop = document.createElement("div");
        backdrop.classList.add("field-editor");

        document.body.appendChild(backdrop);

        var editor = document.createElement("div");
        editor.classList.add("modal-editor");
        backdrop.appendChild(editor);

        editor.innerHTML = "<table>\
        <tr><td>Type:</td><td class=\"type\"></td></tr>\
        <tr><td>Name:</td><td><input class=\"name\" type=\"text\"></td></tr>\
        <tr><td>Result Type:</td><td><input class=\"has-result-type\" type=checkbox><input class=\"result-type\" type=\"text\"></td></tr>\
        <tr><td>Array:</td><td><input class=\"is-array\" type=checkbox></td></tr>\
        <tr><td>Documentation:</td><td><div class=\"documentation\"></div></td></tr>\
        </table>\
        <div class=\"description\"></div>\
        <div class=\"code-editor\"></div>\
        <div class=\"buttons\"><button class=\"small-button save\">Save</button><button class=\"small-button cancel\">Cancel</button></div>\
        ";

        var functionEditContext = UserEditableFunctions.Edit(editableFunction, editor.querySelector(".code-editor"));

        var documentation = editor.querySelector(".documentation");
        Help.List()
        .map(Help.Link)
        .forEach(function(e) {
            // Tabbing should skip over the documentation links.
            e.setAttribute("tabindex", -1);
            documentation.appendChild(e);
            documentation.appendChild(document.createTextNode(" "));
        })

        editor.querySelector(".type").textContent = type.name();
        var nameInput = editor.querySelector(".name");
        nameInput.value = fieldName;
        var hasResultTypeCheckBox = editor.querySelector(".has-result-type");
        hasResultTypeCheckBox.checked = resultingType != null;
        var resultTypeInput = editor.querySelector(".result-type");
        resultTypeInput.value = resultingType != null ? resultingType.name() : "";
        var resultIsArray = editor.querySelector(".is-array");
        resultIsArray.checked = isArray;

        var descriptionText = editor.querySelector(".description");
        var synchronizeHasResultType = function() {
            resultTypeInput.disabled = !hasResultTypeCheckBox.checked;
            resultIsArray.disabled = !hasResultTypeCheckBox.checked;
            if (hasResultTypeCheckBox.checked) {
                if (resultIsArray.checked) {
                    descriptionText.textContent = "Return an array of DbgObjects (or a promise to an array of DbgObjects) with type \"" + resultTypeInput.value + "\".";
                } else {
                    descriptionText.textContent = "Return a DbgObject (or a promise to a DbgObject) with type \"" + resultTypeInput.value + "\".";
                }
            } else {
                descriptionText.textContent = "Return a DbgObject, an HTML string, an HTML node, modify \"element\", or return a promise.";
            }

            if (editability == FieldEditability.FullyEditable) {
                if (hasResultTypeCheckBox.checked) {
                    functionEditContext.updateArguments(["dbgObject"]);
                } else {
                    functionEditContext.updateArguments(["dbgObject", "element"]);
                }
            }
        }
        hasResultTypeCheckBox.addEventListener("change", synchronizeHasResultType);
        resultTypeInput.addEventListener("input", synchronizeHasResultType);
        resultIsArray.addEventListener("change", synchronizeHasResultType);
        synchronizeHasResultType();

        if (editability != FieldEditability.FullyEditable) {
            if (resultingType == null) {
                hasResultTypeCheckBox.parentNode.parentNode.style.display = "none";
                resultIsArray.parentNode.parentNode.style.display = "none";
            } else {
                hasResultTypeCheckBox.style.display = "none";
                resultIsArray.disabled = "true";
            }
        }

        if (editability == FieldEditability.NotEditable) {
            nameInput.disabled = true;
            resultTypeInput.disabled = true;
        }

        if (editability != FieldEditability.NotEditable && fieldName == "") {
            nameInput.focus();
        } else {
            var textarea = editor.querySelector("textarea");
            textarea.setSelectionRange(0, 0);
            textarea.focus();
        }

        var handleEscape = function (e) {
            if (e.keyCode == 27) {
                dismiss();
            }
        }

        var dismiss = function() {
            document.body.removeChild(backdrop);
            window.removeEventListener("keydown", handleEscape);
        }

        window.addEventListener("keydown", handleEscape);
        editor.querySelector(".cancel").addEventListener("click", dismiss);

        editor.querySelector(".save").addEventListener("click", function() {
            try {
                onSave(
                    type, 
                    nameInput.value, 
                    hasResultTypeCheckBox.checked ? DbgObjectType(resultTypeInput.value, type) : null,
                    hasResultTypeCheckBox.checked ? resultIsArray.checked : false,
                    editableFunction
                );
                functionEditContext.commit();
                dismiss();
            } catch (ex) {
                alert(ex);
            }
        })
    }

    function attachEditableExtensions(typeExtensions, creator) {
        var allTypes = typeExtensions.getAllTypes();
        allTypes.forEach(function (type) {
            var allExtensions = typeExtensions.getAllExtensions(type);
            allExtensions.forEach(function (extension) {
                creator(type, extension.name, extension.extension);
            })
        });

        typeExtensions.addListener(null, function (type, name, extension, operation, argument) {
            if (operation == "add") {
                creator(type, name, extension);
            }
        });
    }

    function init() {
        // Ensure every DbgObject extension has an EditableDbgObjectExtension attached to it.
        attachEditableExtensions(DbgObject.ExtendedFields, function (type, name, extension) {
            if (UserEditableFunctions.IsEditable(extension.getter) && !isUserExtension(extension.getter)) {
                extension.getter.editableDbgObjectExtension = new EditableDbgObjectExtension(/*isPersisted*/false, type, name, extension.type, /*isArray*/false, extension.getter);
            }
        });

        attachEditableExtensions(DbgObject.TypeDescriptions, function (type, name, extension) {
            if (UserEditableFunctions.IsEditable(extension.getter) && !isUserExtension(extension.getter)) {
                extension.getter.editableDbgObjectExtension = new EditableDbgObjectExtension(/*isPersisted*/false, type, name, null, /*isArray*/false, extension.getter);
            }
        });

        attachEditableExtensions(DbgObject.ArrayFields, function (type, name, extension) {
            if (UserEditableFunctions.IsEditable(extension.getter) && !isUserExtension(extension.getter)) {
                extension.getter.editableDbgObjectExtension = new EditableDbgObjectExtension(/*isPersisted*/false, type, name, extension.type, /*isArray*/true, extension.getter);
            }
        });

        ensureLoaded();
    }

    function ensureLoaded() {
        return EditableDbgObjectExtension.DeserializeAll();
    }

    function editExtension(editableFunction) {
        if (!isEditableExtension(editableFunction)) {
            throw new Error("The function cannot be edited because it is not backed by an EditableDbgObjectExtension.");
        }

        var editableExtension = editableFunction.editableDbgObjectExtension;
        var editability = (editableExtension.isPersisted ? FieldEditability.EditableExceptHasType : FieldEditability.NotEditable);
        beginEditing(editability, editableExtension.type, editableExtension.name, editableExtension.resultingType, editableExtension.isArray, editableFunction, onSave);
    }

    function onSave(type, name, resultingType, isArray, editableFunction) {
        var editableExtension = editableFunction.editableDbgObjectExtension;
        editableExtension.update(type, name, resultingType, isArray);
    }

    function createExtension(type, creationContext) {
        var newGetter = UserEditableFunctions.Create(function () { });
        beginEditing(
            FieldEditability.FullyEditable, 
            type, 
            "", 
            null,
            /*isArray*/false,
            newGetter,
            function onSave(type, name, resultingType, isArray, editableFunction) {
                EditableDbgObjectExtension.Create(type, name, resultingType, isArray, editableFunction, creationContext);
            }
        );
    }

    function getCreationContext(editableFunction) {
        if (isEditableExtension(editableFunction)) {
            return editableFunction.editableDbgObjectExtension.creationContext;
        } else {
            return undefined;
        }
    }

    function deleteExtension(editableFunction) {
        if (!editableFunction.editableDbgObjectExtension) {
            throw new Error("The function cannot be deleted because it is not backed by an EditableDbgObjectExtension.");
        }
        editableFunction.editableDbgObjectExtension.delete();
    }

    function isEditableExtension(editableFunction) {
        return (
            UserEditableFunctions.IsEditable(editableFunction) && 
            editableFunction.editableDbgObjectExtension instanceof EditableDbgObjectExtension
        );
    }

    function isUserExtension(editableFunction) {
        return (
            isEditableExtension(editableFunction) &&
            editableFunction.editableDbgObjectExtension.isPersisted
        );
    }

    UserDbgObjectExtensions = {
        Create: createExtension,
        Delete: deleteExtension,
        Edit: editExtension,
        EnsureLoaded: ensureLoaded,
        GetCreationContext: getCreationContext,
        IsEditableExtension: isEditableExtension,
        IsUserExtension: isUserExtension,
    }

    Loader.OnPageReady(init);
});