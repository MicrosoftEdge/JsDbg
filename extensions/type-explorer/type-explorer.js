"use strict";

// type-explorer.js
// UI for interactive exploration of a type and its fields or extensions.

var TypeExplorer = undefined;
JsDbg.OnLoad(function() {
    function TypeExplorerAggregateType(module, typename, parentField, controller, rerender) {
        this.parentField = parentField;
        this.controller = controller;
        this.searchQuery = "";
        this.backingTypes = [new TypeExplorerSingleType(module, typename, this)];
        this.includeBaseTypes = false;
        this.preparedForRenderingPromise = null;
    }

    TypeExplorerAggregateType.prototype.module = function() {
        return this.backingTypes[0].module;
    }

    TypeExplorerAggregateType.prototype.typename = function () {
        return this.backingTypes[0].typename;
    }

    TypeExplorerAggregateType.prototype.isType = function (module, typename) {
        var primaryType = this.backingTypes[0];
        return (primaryType.module == module && primaryType.typename == typename);
    }

    TypeExplorerAggregateType.prototype.isExpanded = function() {
        return this.backingTypes[0].isExpanded;
    }

    TypeExplorerAggregateType.prototype.prepareForRendering = function() {
        if (this.preparedForRenderingPromise == null) {
            this.preparedForRenderingPromise = this._prepareForRendering();
        }
        return this.preparedForRenderingPromise;
    }

    TypeExplorerAggregateType.prototype._prepareForRendering = function () {
        // Ensure that the base types are loaded and that we've decided whether to include them by default.
        if (this.preparedForRenderingPromise != null) {
            throw new Error("We shouldn't be preparing twice.");
        }

        var that = this;
        return new DbgObject(this.backingTypes[0].module, this.backingTypes[0].typename, 0)
        .baseTypes()
        .then(function (baseTypes) {
            if (!that.hasLoadedBaseTypes) {
                that.hasLoadedBaseTypes = true;
                baseTypes.forEach(function (baseType) {
                    that.backingTypes.push(new TypeExplorerSingleType(baseType.module, baseType.typeDescription(), that));
                })
            }
            return that.backingTypes;
        })
        .then(function (backingTypes) {
            return backingTypes[0].getFields()
        })
        .then(function (primaryTypeFields) {
            that.includeBaseTypes = (primaryTypeFields.length == 0);
            that.isPreparedForRendering = true;
        });
    }

    TypeExplorerAggregateType.prototype.toggleExpansion = function() {
        var that = this;
        this.backingTypes.forEach(function (backingType, i) {
            backingType.isExpanded = !backingType.isExpanded && (i == 0 || that.includeBaseTypes);
        });
    }

    TypeExplorerAggregateType.prototype.hasBaseTypes = function() {
        return this.backingTypes.length > 1;
    }

    TypeExplorerAggregateType.prototype.toggleIncludeBaseTypes = function() {
        this.includeBaseTypes = !this.includeBaseTypes;
        var that = this;
        var isExpanded = this.backingTypes[0].isExpanded;
        this.backingTypes.forEach(function (backingType, i) {
            if (i > 0) {
                backingType.isExpanded = that.includeBaseTypes && isExpanded;
            }
        });
    }

    TypeExplorerAggregateType.prototype.disableCompletely = function() {
        this.backingTypes.forEach(function (backingType) {
            backingType.disableCompletely();
        })
        this.backingTypes = [];
    }

    TypeExplorerAggregateType.prototype.getFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        var that = this;
        return Promise.map(this.backingTypes, function (backingType) { return backingType.getFieldsToRender(); })
        .then(this.flattenFieldsFromBackingTypes.bind(this));
    }

    TypeExplorerAggregateType.prototype.getExtendedFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return Promise.map(this.backingTypes, function (backingType) { return backingType.getExtendedFieldsToRender(); })
        .then(this.flattenFieldsFromBackingTypes.bind(this));
    }

    TypeExplorerAggregateType.prototype.getDescriptionsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return Promise.map(this.backingTypes, function (backingType) { return backingType.getDescriptionsToRender(); })
        .then(this.flattenFieldsFromBackingTypes.bind(this));
    }

    TypeExplorerAggregateType.prototype.flattenFieldsFromBackingTypes = function (arrayOfFields) {
        arrayOfFields = arrayOfFields.slice(0);
        arrayOfFields.reverse();
        var result = [];
        arrayOfFields.forEach(function (fields) {
            result = result.concat(fields);
        });
        return result;
    }

    function fuzzyMatch(body, term) {
        if (term.length == 0) {
            return true;
        }

        var firstCharacterIndex = body.indexOf(term[0]);
        if (firstCharacterIndex == -1) {
            return false;
        }

        // Allow slightly transposed fuzzy matches by grabbing the character before the hit.
        var prefix = "";
        if (firstCharacterIndex > 0) {
            prefix = body[firstCharacterIndex - 1];
        }

        return fuzzyMatch(prefix + body.substr(firstCharacterIndex + 1), term.substr(1));
    }

    JsDbg.OnLoad(function() {
        if (typeof Tests !== "undefined") {
            var suite = Tests.CreateTestSuite("TypeExplorer.FuzzyMatch", "Tests for the fuzzy matcher in TypeExplorer.");
            Tests.AddTest(suite, "Basic Matching", function (assert) {
                assert(fuzzyMatch("abc", ""), "[empty string] -> abc");
                assert(fuzzyMatch("abc", "a"), "a -> abc");
                assert(fuzzyMatch("abc", "b"), "b -> abc");
                assert(fuzzyMatch("abc", "c"), "c -> abc");
                assert(fuzzyMatch("abc", "ab"), "ab -> abc");
                assert(fuzzyMatch("abc", "bc"), "bc -> abc");
                assert(fuzzyMatch("abc", "abc"), "abc -> abc");
                assert(!fuzzyMatch("abc", "d"), "d !-> abc");
            });

            Tests.AddTest(suite, "Fuzzy Matching", function (assert) {
                assert(fuzzyMatch("abc", "ac"), "ac -> abc");
                assert(fuzzyMatch("abcde", "ace"), "ace -> abcde");
                assert(!fuzzyMatch("abcde", "afce"), "afce !-> abcde");
                assert(!fuzzyMatch("abcde", "acef"), "acef !-> abcde");
            });

            Tests.AddTest(suite, "Transposed Matching", function (assert) {
                assert(fuzzyMatch("abc", "acb"), "acb -> abc");
                assert(fuzzyMatch("abcde", "acbe"), "acbe -> abcde");
                assert(!fuzzyMatch("abcde", "acbce"), "acbce -> abcde");
                assert(!fuzzyMatch("abcde", "abb"), "abb -> abcde");
                assert(!fuzzyMatch("abcde", "aeb"), "aeb !-> abcde");
            });
        }
    })

    TypeExplorerAggregateType.prototype.isFiltered = function (field) {
        var base = field.name.toLowerCase();
        if (field.resultingTypeName != null) {
            base += " " + field.resultingTypeName.toLowerCase();
        }
        return !fuzzyMatch(base, this.searchQuery.toLowerCase());
    }

    TypeExplorerAggregateType.prototype.setSearchQuery = function(query) {
        this.searchQuery = query;
    }

    // Represents a single type, not including its base types.
    function TypeExplorerSingleType(module, typename, aggregateType) {
        this.aggregateType = aggregateType;
        this.isExpanded = false;
        this.module = module;
        this.typename = typename;
        this.fieldsPromise = null;
        this.fields = [];
        this.extendedFields = [];
        this.descriptions = [];
        this.allFieldArrays = [this.fields, this.extendedFields, this.descriptions];

        this.monitorTypeExtensions(DbgObject.ExtendedFields, "extendedFields");
        this.monitorTypeExtensions(DbgObject.TypeDescriptions, "descriptions");
    }

    TypeExplorerSingleType.prototype.monitorTypeExtensions = function(typeExtensions, arrayName) {
        var that = this;
        function addTypeExtensionField(name, extension) {
            // For descriptions, ignore the primary descriptions.
            if (extension.isPrimary) {
                return;
            }

            var newField = new TypeExplorerField(name, extension.typeName ? extension.typeName : null, extension.getter, that, arrayName);
            that[arrayName].push(newField);

            if (UserDbgObjectExtensions.GetCreationContext(extension.getter) == that.aggregateType) {
                newField.setIsEnabled(true);
            }
        }

        typeExtensions.getAllExtensions(this.module, this.typename).forEach(function (nameAndExtension) {
            addTypeExtensionField(nameAndExtension.name, nameAndExtension.extension);
        });

        typeExtensions.addListener(this.module, this.typename, function (module, typename, extensionName, extension, operation, argument) {
            if (operation == "add") {
                addTypeExtensionField(extensionName, extension);
            } else if (operation == "remove") {
                that[arrayName] = that[arrayName].filter(function (field) {
                    if (field.name == extensionName) {
                        field.disableCompletely();
                        return false;
                    } else {
                        return true;
                    }
                });
            } else if (operation == "rename") {
                that[arrayName].forEach(function (field) {
                    if (field.name == extensionName) {
                        var wasEnabled = field.isEnabled;
                        field.setIsEnabled(false);
                        field.name = argument;
                        field.setIsEnabled(wasEnabled);
                    }
                })
            } else if (operation == "typechange") {
                that[arrayName].forEach(function (field) {
                    if (field.name == extensionName) {
                        field.setChildType(argument);
                    }
                });
            }

            that.aggregateType.controller.requestRerender();
        });
    }

    TypeExplorerSingleType.prototype.getFields = function() {
        if (this.fieldsPromise == null) {
            this.fieldsPromise = this._getFields();
        }
        return this.fieldsPromise;
    }

    TypeExplorerSingleType.prototype._getFields = function() {
        var that = this;
        return new DbgObject(this.module, this.typename, 0)
        .fields(/*includeBaseTypes*/false)
        .then(function (fields) {
            return fields.forEach(function (field) {
                var dereferencedType = field.value.typeDescription().replace(/\**$/, "");
                var getter = function(dbgObject) { return dbgObject.f(field.name); }
                that.fields.push(new TypeExplorerField(field.name, dereferencedType, getter, that, getter, "fields"));
            })
        })
        .then(function (fields) {
            return that.fields;
        });
    }

    TypeExplorerSingleType.prototype.forEachField = function (f) {
        this.allFieldArrays.forEach(function (a) { a.forEach(f); });
    }

    TypeExplorerSingleType.prototype.considerFieldWhenCollapsed = function (field, shownFields) {
        if (field.isEnabled) {
            shownFields.push(field);
        }
        if (field.childType != null) {
            field.childType.backingTypes.forEach(function (backingType) {
                backingType.forEachField(function (field) {
                    backingType.considerFieldWhenCollapsed(field, shownFields);
                });
            });
        }
    }

    TypeExplorerSingleType.prototype.selectFieldsToRender = function (fieldsArray) {
        var that = this;
        return Promise.as(fieldsArray).then(function (allFields) {
            if (that.isExpanded) {
                return allFields;
            } else {
                var shownFields = [];
                allFields.forEach(function (f) {
                    that.considerFieldWhenCollapsed(f, shownFields);
                });
                return shownFields;
            }
        })
    }

    TypeExplorerSingleType.prototype.getFieldsToRender = function () {
        return this.selectFieldsToRender(this.getFields());
    }

    TypeExplorerSingleType.prototype.getExtendedFieldsToRender = function() {
        return this.selectFieldsToRender(this.extendedFields);
    }

    TypeExplorerSingleType.prototype.getDescriptionsToRender = function() {
        return this.selectFieldsToRender(this.descriptions);
    }

    TypeExplorerSingleType.prototype.disableCompletely = function() {
        // Disable all the fields and trash the arrays.
        this.forEachField(function (f) {
            f.disableCompletely();
        });
        this.allFieldArrays.forEach(function (a) {
            a.length = 0;
        });
    }

    function TypeExplorerField(name, resultingTypeName, getter, parentType, sourceInParentType) {
        this.name = name;
        this.parentType = parentType;
        this.resultingTypeName = resultingTypeName;
        this.childType = null;
        this.childTypePromise = null;
        this.getter = getter;
        this.nestedFieldGetter = this.getNestedField.bind(this);
        this.sourceInParentType = sourceInParentType;
        this.isEnabled = false;
        this.clientContext = {};
    }

    TypeExplorerField.prototype.getNestedField = function(dbgObject, element) {
        var parentField = this.parentType.aggregateType.parentField;
        if (parentField == null) {
            return Promise.as(this.getter(dbgObject, element));
        } else {
            var that = this;
            return parentField.getNestedField(dbgObject)
            .then(function(parentDbgObject) {
                if (that.resultingTypeName == null) {
                    return that.getter(parentDbgObject, element);
                }

                return that.getter(parentDbgObject)
                .then(function checkType(result) {
                    // Check that the field returned the proper type.
                    if (!(result instanceof DbgObject)) {
                        throw new Error("The field \"" + that.name + "\" did not return a DbgObject, but returned \"" + result + "\"");
                    }

                    return result.isType(that.resultingTypeName)
                    .then(function (isType) {
                        if (!isType) {
                            throw new Error("The field \"" + that.name + "\" was supposed to be type \"" + that.resultingTypeName + "\" but was unrelated type \"" + result.typeDescription() + "\".");
                        } else {
                            return result;
                        }
                    });
                });
            });
        }
    }

    TypeExplorerField.prototype.isEditable = function() {
        return UserDbgObjectExtensions.IsEditableExtension(this.getter);
    }

    TypeExplorerField.prototype.canBeDeleted = function() {
        return UserDbgObjectExtensions.IsUserExtension(this.getter);
    }

    TypeExplorerField.prototype.beginEditing = function() {
        if (this.isEditable()) {
            UserDbgObjectExtensions.Edit(this.getter);
        }
    }

    TypeExplorerField.prototype.delete = function() {
        if (this.canBeDeleted()) {
            UserDbgObjectExtensions.Delete(this.getter);
        }
    }

    TypeExplorerField.prototype.getChildTypeName = function() {
        return this.resultingTypeName;
    }

    TypeExplorerField.prototype.disableCompletely = function() {
        this.setIsEnabled(false);
        if (this.childType != null) {
            this.childType.disableCompletely();
        }
    }

    TypeExplorerField.prototype.setIsEnabled = function(isEnabled) {
        if (isEnabled != this.isEnabled) {
            this.isEnabled = isEnabled;
            this.parentType.aggregateType.controller._notifyFieldChange(this);
        }
    }

    TypeExplorerField.prototype.setChildType = function(newTypeName) {
        if (this.childType != null) {
            this.childType.disableCompletely();
        }

        this.resultingTypeName = newTypeName;
        this.childTypePromise = null;
        this.childType = null;
    }

    TypeExplorerField.prototype.getChildType = function() {
        if (this.childTypePromise == null) {
            this.childTypePromise = this._getChildType();
        }
        return this.childTypePromise;
    }

    TypeExplorerField.prototype._getChildType = function() {
        var that = this;
        this.childType = null;
        return Promise.as(null)
        .then(function () {
            if (that.resultingTypeName == null) {
                return;
            }

            return new DbgObject(that.parentType.module, that.resultingTypeName, 0)
            .isTypeWithFields()
            .then(function (isTypeWithFields) {
                if (isTypeWithFields) {
                    that.childType = new TypeExplorerAggregateType(that.parentType.module, that.resultingTypeName, that, that.parentType.aggregateType.controller);
                }
            });
        })
        .then(function () { return that.childType; }, function() { return that.childType; });
    }

    function TypeExplorerController(dbgObject, options) {
        this.container = null;
        this.dbgObject = dbgObject;
        this.options = options;
        this.rootType = new TypeExplorerAggregateType(dbgObject.module, dbgObject.typeDescription(), null, this);
    }

    TypeExplorerController.prototype.render = function(explorerContainer) {
        explorerContainer.classList.add("type-explorer");

        this.container = document.createElement("div");
        explorerContainer.appendChild(this.container);

        var that = this;
        return UserDbgObjectExtensions.EnsureLoaded()
        .then(function () {
            that.container.classList.add("collapsed");
            return that._renderType(that.rootType, that.container);
        });
    }

    TypeExplorerController.prototype.requestRerender = function() {
        if (this.hasRequestedRerender) {
            return;
        }

        this.hasRequestedRerender = true;
        var that = this;
        window.requestAnimationFrame(function () {
            that.hasRequestedRerender = false;
            that._renderType(that.rootType, that.container);
        });
    }

    TypeExplorerController.prototype.enableField = function(path) {
        var that = this;
        return UserDbgObjectExtensions.EnsureLoaded()
        .then(function() {
            return that._enableRemainingPath(that.rootType, path, 0);
        });
    }

    TypeExplorerController.prototype.toggleExpansion = function() {
        this.rootType.toggleExpansion();
        this.requestRerender();
    }

    TypeExplorerController.prototype._computePath = function(field) {
        var path = [];
        this._appendPath(field, path);
        path.reverse();
        return path;
    }

    TypeExplorerController.prototype._appendPath = function (obj, path) {
        if (obj instanceof TypeExplorerField) {
            path.push(obj.name);
            path.push(obj.sourceInParentType);
            return this._appendPath(obj.parentType, path);
        } else if (obj instanceof TypeExplorerSingleType) {
            path.push(obj.typename);
            return this._appendPath(obj.aggregateType, path);
        } else if (obj instanceof TypeExplorerAggregateType) {
            if (obj.parentField != null) {
                return this._appendPath(obj.parentField, path);
            }
        }
    }

    TypeExplorerController.prototype._enableRemainingPath = function (obj, path, currentIndex) {
        var that = this;
        if (currentIndex == path.length) {
            if (obj instanceof TypeExplorerField) {
                obj.setIsEnabled(true);
            }
        } else {
            if (obj instanceof TypeExplorerField) {
                return obj.getChildType()
                .then(function (childType) {
                    if (childType != null) {
                        return that._enableRemainingPath(childType, path, currentIndex)
                    }
                });
            } else if (obj instanceof TypeExplorerSingleType) {
                var collection = path[currentIndex];
                if (collection == "fields") {
                    collection = obj.getFields();
                } else {
                    collection = obj[collection];
                }
                currentIndex++;

                return Promise.as(collection)
                .then(function (collection) {
                    for (var i = 0; i < collection.length; ++i) {
                        if (collection[i].name == path[currentIndex]) {
                            return that._enableRemainingPath(collection[i], path, currentIndex + 1);
                        }
                    }
                })
            } else if (obj instanceof TypeExplorerAggregateType) {
                return obj.prepareForRendering()
                .then(function () {
                    for (var i = 0; i < obj.backingTypes.length; ++i) {
                        if (obj.backingTypes[i].typename == path[currentIndex]) {
                            return that._enableRemainingPath(obj.backingTypes[i], path, currentIndex + 1);
                        }
                    }
                });
            }
        }
    }

    TypeExplorerController.prototype._notifyFieldChange = function(field, changeType) {
        if (this.options.onFieldChange) {
            this.options.onFieldChange(this.dbgObject, this._getFieldForNotification(field), changeType);
        }
    }

    TypeExplorerController.prototype._getFieldForNotification = function(field) {
        var result = {
            context: field.clientContext,
            getter: field.nestedFieldGetter,
            allGetters: [],
            isEnabled: field.isEnabled,
            names: [],
            path: this._computePath(field)
        };

        do {
            result.allGetters.push(field.getter);
            result.names.push(field.name);
            field = field.parentType.aggregateType.parentField;
        } while (field != null);

        result.allGetters.reverse();
        result.names.reverse();

        return result;
    }

    TypeExplorerController.prototype._renderType = function(type, typeContainer) {
        if (typeContainer == null) {
            return Promise.as(null);
        }

        typeContainer.style.display = "none";
        typeContainer.innerHTML = "";
        var that = this;
        return type.prepareForRendering()
        .then(function () {
            typeContainer.classList.add("fields-container");
            if (!type.isExpanded()) {
                typeContainer.classList.add("collapsed");
            } else {
                typeContainer.classList.remove("collapsed");
            }

            var fieldListContainer = document.createElement("div");
            if (type.isExpanded()) {
                var filterTextBox = document.createElement("input");
                filterTextBox.classList.add("small-input");
                filterTextBox.placeholder = "Search...";
                filterTextBox.type = "search";
                filterTextBox.value = type.searchQuery;
                typeContainer.appendChild(filterTextBox);
                filterTextBox.focus();
                var searchTimeout = null;
                filterTextBox.addEventListener("input", function () {
                    if (searchTimeout != null) {
                        clearTimeout(searchTimeout);
                    }
                    searchTimeout = setTimeout(function () {
                        type.setSearchQuery(filterTextBox.value);
                        that._renderFieldList(type, fieldListContainer);
                    }, 100);
                });

                if (type.hasBaseTypes()) {
                    var showBaseTypesControl = document.createElement("button");
                    showBaseTypesControl.classList.add("small-button");
                    showBaseTypesControl.textContent = type.includeBaseTypes ? "Exclude Base Types" : "Include Base Types";
                    typeContainer.appendChild(showBaseTypesControl);
                    showBaseTypesControl.addEventListener("click", function () {
                        type.toggleIncludeBaseTypes();
                        showBaseTypesControl.textContent = type.includeBaseTypes ? "Exclude Base Types" : "Include Base Types";
                        that._renderFieldList(type, fieldListContainer);
                    })
                }

                var newExtensionButton = document.createElement("button");
                newExtensionButton.classList.add("small-button");
                newExtensionButton.textContent = "Extend";
                typeContainer.appendChild(newExtensionButton);
                newExtensionButton.addEventListener("click", function() {
                    UserDbgObjectExtensions.Create(type.module(), type.typename(), type);
                });
            }

            typeContainer.appendChild(fieldListContainer);
            return that._renderFieldList(type, fieldListContainer);
        })
        .then(function() {
            typeContainer.style.display = "";
        })
    }

    function findFieldNameCollisions(fields, type) {
        var names = {};
        var collisions = {};

        fields.forEach(function (f) {
            if (f.parentType.aggregateType != type) {
                return;
            }

            if (f.name in names) {
                collisions[f.name] = true;
            } else {
                names[f.name] = true;
            }
        })

        return collisions;
    }

    TypeExplorerController.prototype._renderFieldList = function(type, fieldsContainer) {
        var that = this;

        return Promise.join([type.getFieldsToRender(), type.getExtendedFieldsToRender(), type.getDescriptionsToRender()])
        .then(function (results) {
            var fields = results[0];
            var extendedFields = results[1].concat(results[2]);
            fieldsContainer.innerHTML = "";

            // Find any collisions in the fields.
            var fieldCollisions = findFieldNameCollisions(fields, type);
            var extendedFieldCollisions = findFieldNameCollisions(extendedFields, type);

            return Promise.map(extendedFields, function (extendedField) {
                var fieldContainer = document.createElement("label");
                fieldsContainer.appendChild(fieldContainer);
                return that._renderField(extendedField, type, fieldContainer, extendedFieldCollisions);
            })
            .then(function() {
                if (extendedFields.length > 0 && type.isExpanded()) {
                    var hr = document.createElement("hr");
                    fieldsContainer.appendChild(hr);
                }

                return Promise.map(fields, function (field) {
                    var fieldContainer = document.createElement("label");
                    fieldsContainer.appendChild(fieldContainer);
                    return that._renderField(field, type, fieldContainer, fieldCollisions);
                })
            });
        });
    }

    TypeExplorerController.prototype._renderField = function (field, renderingType, fieldContainer, nameCollisions) {
        var currentType = field.parentType;
        var areAllTypesExpanded = true;
        while (areAllTypesExpanded && currentType != null) {
            var isFiltered = currentType.aggregateType.parentField != null && currentType.aggregateType.parentField.parentType.aggregateType.isFiltered(currentType.aggregateType.parentField);
            areAllTypesExpanded = currentType.isExpanded && !isFiltered;
            currentType = currentType.aggregateType.parentField != null ? currentType.aggregateType.parentField.parentType : null;
        }

        fieldContainer.innerHTML = "";

        if (renderingType == field.parentType.aggregateType && renderingType.isFiltered(field)) {
            fieldContainer.classList.add("filtered");
        } else {
            fieldContainer.classList.remove("filtered");
        }

        var input = document.createElement("input");
        fieldContainer.appendChild(input);
        input.type = "checkbox";
        input.checked = field.isEnabled;
        var that = this;
        input.addEventListener("change", function () {
            field.setIsEnabled(input.checked);
        });
        var fieldNameContainer = document.createElement("span");
        fieldNameContainer.classList.add("field-name");

        var currentField = field;
        var names = [field.name];
        while (currentField.parentType.aggregateType != renderingType) {
            currentField = currentField.parentType.aggregateType.parentField;
            names.push(currentField.name);
        }
        if (currentField.name in nameCollisions) {
            names[names.length - 1] = (currentField.parentType.typename) + "::" + names[names.length - 1];
        }

        fieldNameContainer.textContent = names.reverse().join(".");
        fieldContainer.appendChild(fieldNameContainer);
        
        var fieldType = field.getChildTypeName();
        if (fieldType != null) {
            if (areAllTypesExpanded) {
                var fieldTypeContainer = document.createElement("span");
                fieldTypeContainer.classList.add("field-type");
                fieldTypeContainer.textContent = fieldType;
                fieldContainer.appendChild(fieldTypeContainer);
            }
            fieldContainer.title = fieldType + " " + field.name;
        } else {
            fieldContainer.title = field.name;
        }

        if (field.isEditable()) {
            var editButton = document.createElement("button");
            fieldContainer.appendChild(editButton);
            editButton.classList.add("small-button");
            editButton.textContent = "Edit";
            editButton.addEventListener("click", function() { field.beginEditing(); });
        }

        if (field.canBeDeleted()) {
            var deleteButton = document.createElement("button");
            fieldContainer.appendChild(deleteButton);
            deleteButton.classList.add("small-button");
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", function() { field.delete(); });
        }

        return field.getChildType()
        .then(function (childType) {
            if (childType == null || renderingType.isFiltered(field) || !areAllTypesExpanded) {
                return;
            }

            var subFieldsContainer = document.createElement("div");
            return that._renderType(childType, subFieldsContainer)
            .then(function () {
                fieldContainer.parentNode.insertBefore(subFieldsContainer, fieldContainer.nextSibling);
                fieldTypeContainer.addEventListener("click", function (e) {
                    e.preventDefault();
                    childType.toggleExpansion();
                    subFieldsContainer.classList.toggle("collapsed");
                    that._renderType(childType, subFieldsContainer);
                });
            });
        });
    }

    function create(dbgObject, options) {
        return new TypeExplorerController(dbgObject, options);
    }

    TypeExplorer = {
        Create: create
    };
});