"use strict";

// user-dbgobject-extensions.js
// Logic for creating, editing, and saving DbgObject extensions (extended fields, type descriptions, etc.) from the browser.
var UserDbgObjectExtensions = undefined;
JsDbg.OnLoad(function() {
    var persistentStore = Catalog.Load("UserDbgObjectExtensions");

    function EditableDbgObjectExtension(isPersisted, module, typeName, name, resultingTypeName, isArray, editableFunction, creationContext) {
        this.isPersisted = isPersisted;
        this.uniqueId = "UserField-" + (new Date() - 0) + "-" + Math.round(Math.random() * 1000000)
        this.module = module;
        this.typeName = typeName;
        this.isArray = isArray;
        this.name = name;
        this.resultingTypeName = resultingTypeName;
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

    EditableDbgObjectExtension.Create = function(module, typename, name, resultingTypeName, isArray, editableFunction, creationContext) {
        var editableExtension = new EditableDbgObjectExtension(/*isPersisted*/true, module, typename, name, resultingTypeName, isArray, editableFunction, creationContext);
        editableExtension.realizeExtension();
    }

    var deserializationPromise = null;
    EditableDbgObjectExtension.DeserializeAll = function () {
        if (deserializationPromise == null) {
            deserializationPromise = new Promise(function (oncomplete, onerror) {
                persistentStore.all(function (results) {
                    if (results) {
                        for (var key in results) {
                            var f = new EditableDbgObjectExtension();
                            f.deserialize(key, results[key]);
                            f.forceRealization();
                        }
                    }
                    oncomplete();
                });
            });
        }
        return deserializationPromise;
    }

    EditableDbgObjectExtension.prototype.realizeExtension = function() {
        if (this.isArray) {
            DbgObject.AddArrayField(this.module, this.typeName, this.name, this.resultingTypeName, this.editableFunction);
        } else if (this.resultingTypeName != null) {
            DbgObject.AddExtendedField(this.module, this.typeName, this.name, this.resultingTypeName, this.editableFunction);
        } else {
            DbgObject.AddTypeDescription(this.module, this.typeName, this.name, false, this.editableFunction);
        }
    }

    EditableDbgObjectExtension.prototype.forceRealization = function() {
        try {
            this.realizeExtension();
        } catch (ex) {
            // Try removing one with the same name.
            try {
                if (this.isArray) {
                    DbgObject.RemoveArrayField(this.module, this.typeName, this.name);
                } else if (this.resultingTypeName != null) {
                    DbgObject.RemoveExtendedField(this.module, this.typeName, this.name);
                } else {
                    DbgObject.RemoveTypeDescription(this.module, this.typeName, this.name);
                }
                this.realizeExtension();
                console.log("The user-created DbgObject extension " + this.typeName + "." + this.name + " conflicted with an existing extension.");
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
            DbgObject.RemoveArrayField(this.module, this.typeName, this.name);
        } else if (this.resultingTypeName) {
            DbgObject.RemoveExtendedField(this.module, this.typeName, this.name);
        } else {
            DbgObject.RemoveTypeDescription(this.module, this.typeName, this.name);
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
                module: this.module,
                typeName: this.typeName,
                name: this.name,
                resultingTypeName: this.resultingTypeName,
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
        this.module = serialized.module;
        this.typeName = serialized.typeName;
        this.name = serialized.name;
        this.resultingTypeName = serialized.resultingTypeName;
        this.isArray = serialized.isArray;
        this.editableFunction = UserEditableFunctions.Deserialize(serialized.editableFunction);
        this.editableFunction.editableDbgObjectExtension = this;
        this.creationContext = undefined;
        var that = this;
        UserEditableFunctions.AddListener(this.editableFunction, this.editableFunctionListener);
    }

    EditableDbgObjectExtension.prototype.update = function(module, typeName, name, resultingTypeName, isArray) {
        var needsUpdate = false;
        if (this.module != module) {
            needsUpdate = true;
            this.module = module;
        }

        if (this.typeName != typeName) {
            needsUpdate = true;
            this.typeName = typeName;
        }

        var oldName = this.name;
        if (this.name != name) {
            needsUpdate = true;
            this.name = name;
        }

        if (this.resultingTypeName != resultingTypeName) {
            if ((this.resultingTypeName == null) != (resultingTypeName == null)) {
                throw new Error("EditableDbgObjectExtension does not support changing extension types.")
            }
            needsUpdate = true;
            this.resultingTypeName = resultingTypeName;
        }

        if (this.isArray != isArray) {
            throw new Error("EditableDbgObjectExtension does not support changing extension types.");
        }

        if (needsUpdate) {
            if (this.isArray) {
                DbgObject.UpdateArrayField(this.module, this.typeName, oldName, this.name, this.resultingTypeName);
            } else if (this.resultingTypeName != null) {
                DbgObject.UpdateExtendedField(this.module, this.typeName, oldName, this.name, this.resultingTypeName);
            } else {
                DbgObject.RenameTypeDescription(this.module, this.typeName, oldName, this.name);
            }
            this.serialize();
        }
    }

    var FieldEditability = {
        FullyEditable: 0,
        NotEditable: 1,
        EditableExceptHasType: 2
    };

    function beginEditing(editability, typename, fieldName, resultingTypeName, isArray, editableFunction, onSave) {
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

        editor.querySelector(".type").textContent = typename;
        var nameInput = editor.querySelector(".name");
        nameInput.value = fieldName;
        var hasResultTypeCheckBox = editor.querySelector(".has-result-type");
        hasResultTypeCheckBox.checked = resultingTypeName != null;
        var resultTypeInput = editor.querySelector(".result-type");
        resultTypeInput.value = resultingTypeName;
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
            if (resultingTypeName == null) {
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
                    typename, 
                    nameInput.value, 
                    hasResultTypeCheckBox.checked ? resultTypeInput.value : null,
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
            var allExtensions = typeExtensions.getAllExtensions(type.module, type.type);
            allExtensions.forEach(function (extension) {
                creator(type.module, type.type, extension.name, extension.extension);
            })
        });

        typeExtensions.addListener(null, null, function (module, type, name, extension, operation, argument) {
            if (operation == "add") {
                creator(module, type, name, extension);
            }
        });
    }

    function init() {
        // Ensure every DbgObject extension has an EditableDbgObjectExtension attached to it.
        attachEditableExtensions(DbgObject.ExtendedFields, function (module, type, name, extension) {
            if (UserEditableFunctions.IsEditable(extension.getter) && !isUserExtension(extension.getter)) {
                extension.getter.editableDbgObjectExtension = new EditableDbgObjectExtension(/*isPersisted*/false, module, type, name, extension.typeName, /*isArray*/false, extension.getter);
            }
        });

        attachEditableExtensions(DbgObject.TypeDescriptions, function (module, type, name, extension) {
            if (UserEditableFunctions.IsEditable(extension.getter) && !isUserExtension(extension.getter)) {
                extension.getter.editableDbgObjectExtension = new EditableDbgObjectExtension(/*isPersisted*/false, module, type, name, null, /*isArray*/false, extension.getter);
            }
        });

        attachEditableExtensions(DbgObject.ArrayFields, function (module, type, name, extension) {
            if (UserEditableFunctions.IsEditable(extension.getter) && !isUserExtension(extension.getter)) {
                extension.getter.editableDbgObjectExtension = new EditableDbgObjectExtension(/*isPersisted*/false, module, type, name, extension.typeName, /*isArray*/true, extension.getter);
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
        beginEditing(editability, editableExtension.typeName, editableExtension.name, editableExtension.resultingTypeName, editableExtension.isArray, editableFunction, onSave);
    }

    function onSave(typeName, name, resultingTypeName, isArray, editableFunction) {
        var editableExtension = editableFunction.editableDbgObjectExtension;
        editableExtension.update(editableExtension.module, typeName, name, resultingTypeName, isArray);
    }

    function createExtension(module, typeName, creationContext) {
        var newGetter = UserEditableFunctions.Create(function () { });
        beginEditing(
            FieldEditability.FullyEditable, 
            typeName, 
            "", 
            null,
            /*isArray*/false,
            newGetter,
            function onSave(typename, name, resultingTypeName, isArray, editableFunction) {
                EditableDbgObjectExtension.Create(module, typename, name, resultingTypeName, isArray, editableFunction, creationContext);
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

    init();
});