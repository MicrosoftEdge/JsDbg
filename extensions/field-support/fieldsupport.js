"use strict";

// fieldsupport.js
// Peter Salas
//

var FieldSupport = (function() {

    function renderDbgObject(dbgObject, element, fields) {
        return dbgObject.desc().then(function (desc) {
            var descriptionContainer = document.createElement("div");
            element.appendChild(descriptionContainer);
            descriptionContainer.innerHTML = fields + ":" + desc;
        });
    }

    function FieldSupportAggregateType(module, typename, parentField, controller, rerender) {
        this.parentField = parentField;
        this.controller = controller;
        this.rerender = rerender !== undefined ? rerender : function () { this.parentField.parentType.aggregateType.rerender(); };
        this.searchQuery = "";
        this.backingTypes = [new FieldSupportSingleType(module, typename, this)];
        this.isPreparedForRendering = false;
        this.includeBaseTypes = false;
    }

    FieldSupportAggregateType.prototype.typename = function () {
        return this.backingTypes[0].typename;
    }

    FieldSupportAggregateType.prototype.isType = function (module, typename) {
        var primaryType = this.backingTypes[0];
        return (primaryType.module == module && primaryType.typename == typename);
    }

    FieldSupportAggregateType.prototype.isExpanded = function() {
        return this.backingTypes[0].isExpanded;
    }

    FieldSupportAggregateType.prototype.prepareForRendering = function () {
        // Ensure that the base types are loaded and that we've decided whether to include them by default.
        if (this.isPreparedForRendering) {
            return Promise.as(null);
        } else {
            var that = this;
            return new DbgObject(this.backingTypes[0].module, this.backingTypes[0].typename, 0)
            .baseTypes()
            .then(function (baseTypes) {
                if (!that.hasLoadedBaseTypes) {
                    that.hasLoadedBaseTypes = true;
                    baseTypes.forEach(function (baseType) {
                        that.backingTypes.push(new FieldSupportSingleType(baseType.module, baseType.typeDescription(), that));
                    })
                }
                return that.backingTypes;
            })
            .then(function (backingTypes) {
                return backingTypes[0].getFields()
            })
            .then(function (primaryTypeFields) {
                that.isPreparedForRendering = true;
                that.includeBaseTypes = (primaryTypeFields.length == 0);
            });
        }
    }

    FieldSupportAggregateType.prototype.toggleExpansion = function() {
        var that = this;
        this.backingTypes.forEach(function (backingType, i) {
            backingType.isExpanded = !backingType.isExpanded && (i == 0 || that.includeBaseTypes);
        });
    }

    FieldSupportAggregateType.prototype.hasBaseTypes = function() {
        return this.backingTypes.length > 1;
    }

    FieldSupportAggregateType.prototype.toggleIncludeBaseTypes = function() {
        this.includeBaseTypes = !this.includeBaseTypes;
        var that = this;
        var isExpanded = this.backingTypes[0].isExpanded;
        this.backingTypes.forEach(function (backingType, i) {
            if (i > 0) {
                backingType.isExpanded = that.includeBaseTypes && isExpanded;
            }
        });
    }

    FieldSupportAggregateType.prototype.disableCompletely = function() {
        var hadEnabledFields = false;
        this.backingTypes.forEach(function (backingType) {
            hadEnabledFields = backingType.disableCompletely() || hadEnabledFields;
        })
        this.backingTypes = [];
        return hadEnabledFields;
    }

    FieldSupportAggregateType.prototype.getFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        var that = this;
        return Promise.map(this.backingTypes, function (backingType) { return backingType.getFieldsToRender(); })
        .then(this.flattenFieldsFromBackingTypes.bind(this));
    }

    FieldSupportAggregateType.prototype.getExtendedFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return Promise.map(this.backingTypes, function (backingType) { return backingType.getExtendedFieldsToRender(); })
        .then(this.flattenFieldsFromBackingTypes.bind(this));
    }

    FieldSupportAggregateType.prototype.flattenFieldsFromBackingTypes = function (arrayOfFields) {
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
            var suite = Tests.CreateTestSuite("FieldSupport.FuzzyMatch", "Tests for the fuzzy matcher in FieldSupport.");
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

    FieldSupportAggregateType.prototype.isFiltered = function (field) {
        return !fuzzyMatch(field.name.toLowerCase() + " " + field.resultingTypeName.toLowerCase(), this.searchQuery.toLowerCase());
    }

    FieldSupportAggregateType.prototype.setSearchQuery = function(query) {
        this.searchQuery = query;
    }

    // Represents a single type, not including its base types.
    function FieldSupportSingleType(module, typename, aggregateType) {
        this.aggregateType = aggregateType;
        this.isExpanded = false;
        this.module = module;
        this.typename = typename;
        this.fields = null;
        this.extendedFields = [];

        var that = this;
        DbgObject.GetExtendedFields(module, typename).forEach(function (extendedField) {
            that.addExtendedField(extendedField.fieldName, extendedField.typeName);
        });
        DbgObject.OnExtendedFieldsChanged(module, typename, function (module, typename, fieldName, fieldTypeName, isAdded) {
            if (isAdded) {
                that.addExtendedField(fieldName, fieldTypeName);
            } else {
                that.extendedFields = that.extendedFields.filter(function (userField) {
                    if (userField.name == fieldName) {
                        if (userField.disableCompletely()) {
                            that.aggregateType.controller.updateTreeUI();
                        }
                        return false;
                    } else {
                        return true;
                    }
                });
            }
            that.aggregateType.rerender();
        });
    }

    FieldSupportSingleType.prototype.addExtendedField = function (fieldName, typeName) {
        this.extendedFields.push(new FieldSupportField(
            fieldName,
            typeName,
            function getter(dbgObject) {
                return dbgObject.F(fieldName);
            },
            renderDbgObject,
            this
        ));
    }

    FieldSupportSingleType.prototype.getFields = function() {
        if (this.fields != null) {
            return Promise.as(this.fields);
        }

        var that = this;
        return new DbgObject(this.module, this.typename, 0)
        .fields(/*includeBaseTypes*/false)
        .then(function (fields) {
            return fields.map(function (field) {
                var dereferencedType = field.value.typeDescription().replace(/\**$/, "");
                return new FieldSupportField(
                    field.name, 
                    dereferencedType,
                    function getter(dbgObject) {
                        return dbgObject.f(field.name);
                    },
                    function renderer(dbgObject, element, fields) {
                        return dbgObject.desc().then(function (desc) {
                            var descriptionContainer = document.createElement("div");
                            element.appendChild(descriptionContainer);
                            descriptionContainer.innerHTML = fields + ":" + desc;
                        });
                    },
                    that
                );
            })
        })
        .then(function (fields) {
            if (that.fields == null) {
                that.fields = fields;
            }
            return that.fields;
        });
    }

    FieldSupportSingleType.prototype.considerFieldWhenCollapsed = function (field, shownFields) {
        if (field.isEnabled) {
            shownFields.push(field);
        }
        if (field.childType != null && field.childType != false) {
            field.childType.backingTypes.forEach(function (backingType) {
                if (backingType.fields != null) {
                    backingType.fields.forEach(function (field) {
                        backingType.considerFieldWhenCollapsed(field, shownFields);
                    });
                }

                backingType.extendedFields.forEach(function (field) {
                    backingType.considerFieldWhenCollapsed(field, shownFields);
                })
            });
        }
    }

    FieldSupportSingleType.prototype.getFieldsToRender = function () {
        return this.getFields().then(this.adjustFieldsForCollapsing.bind(this));
    }

    FieldSupportSingleType.prototype.getExtendedFieldsToRender = function() {
        return Promise.as(this.extendedFields).then(this.adjustFieldsForCollapsing.bind(this));
    }

    FieldSupportSingleType.prototype.adjustFieldsForCollapsing = function(allFields) {
        if (this.isExpanded) {
            return allFields;
        } else {
            var shownFields = [];
            var that = this;
            allFields.forEach(function (f) {
                that.considerFieldWhenCollapsed(f, shownFields);
            });
            return shownFields;
        }
    }

    FieldSupportSingleType.prototype.disableCompletely = function() {
        var hadEnabledFields = false;
        if (this.fields != null) {
            this.fields.forEach(function (f) { hadEnabledFields = f.disableCompletely() || hadEnabledFields; });
            this.fields = [];
        }

        if (this.extendedFields != null) {
            this.extendedFields.forEach(function (f) { hadEnabledFields = f.disableCompletely() || hadEnabledFields; });
            this.extendedFields = [];
        }
        return hadEnabledFields;
    }

    function FieldSupportField(name, resultingTypeName, getter, renderer, parentType, isBaseTypeField) {
        this.name = name;
        this.parentType = parentType;
        this.resultingTypeName = resultingTypeName;
        this.childType = null;
        this.isEnabled = false;
        this.getter = getter;
        this.renderer = renderer;
        this.fieldRenderer = this.renderField.bind(this);
        this.isBaseTypeField = isBaseTypeField;
    }

    FieldSupportField.prototype.renderField = function(dbgObject, element) {
        var names = [];

        var parentFields = [];
        var currentField = this;
        while (currentField != null) {
            parentFields.push(currentField);
            currentField = currentField.parentType.aggregateType.parentField;
        }

        parentFields.reverse();
        var fields = parentFields.map(function (field) { return field.name; }).join(".");
        var getters = parentFields.map(function (field) { return field.getter; });

        var dbgObjectToRender = Promise.as(dbgObject);
        getters.forEach(function (getter) {
            dbgObjectToRender = dbgObjectToRender.then(getter);
        });

        var that = this;
        return dbgObjectToRender
        .then(function (dbgObjectToRender) {
            if (!dbgObjectToRender.isNull()) {
                return that.renderer(dbgObjectToRender, element, fields);
            }
        })
        .then(null, function (ex) {
            var errorContainer = document.createElement("div");
            errorContainer.style.color = "red";
            element.appendChild(errorContainer);
            var errorMsg = ex.stack ? ex.toString() : JSON.stringify(ex);
            errorContainer.innerHTML = "(" + errorMsg + ")";
        });
    }

    FieldSupportField.prototype.getChildTypeName = function() {
        return this.resultingTypeName;
    }

    FieldSupportField.prototype.disableCompletely = function() {
        var hadEnabledFields = this.isEnabled;
        this.setIsEnabled(false);
        if (this.childType instanceof FieldSupportAggregateType) {
            hadEnabledFields = this.childType.disableCompletely() || hadEnabledFields;
        }
        return hadEnabledFields
    }

    FieldSupportField.prototype.setIsEnabled = function(isEnabled) {
        if (isEnabled != this.isEnabled) {
            this.isEnabled = isEnabled;
            var rootType = this.parentType;
            while (rootType.aggregateType.parentField != null) {
                rootType = rootType.aggregateType.parentField.parentType;
            }
            if (isEnabled) {
                DbgObjectTree.AddField(rootType.module, rootType.typename, this.fieldRenderer);
            } else {
                DbgObjectTree.RemoveField(rootType.module, rootType.typename, this.fieldRenderer);
            }
        }
    }

    FieldSupportField.prototype.getChildType = function() {
        var that = this;
        return Promise.as(this.childType)
        .then(function (childType) {
            if (childType == null && that.resultingTypeName != null) {
                return new DbgObject(that.parentType.module, that.resultingTypeName, 0)
                .isTypeWithFields()
                .then(function (isTypeWithFields) {
                    if (!isTypeWithFields) {
                        that.childType = false;
                        return null;
                    } else {
                        that.childType = new FieldSupportAggregateType(that.parentType.module, that.resultingTypeName, that, that.parentType.controller);
                        return that.childType;
                    }
                }, function () {
                    that.childType = false;
                    return null;
                });
            } else if (childType === false || that.resultingTypeName == null) {
                // There is no child type (i.e. there are no interesting fields).
                return null;
            } else {
                return childType;
            }
        })
    }

    function FieldSupportController(container, updateTreeUI) {
        this.knownTypes = [];
        this.typeListContainer = container;
        this.updateTreeUI = updateTreeUI;

        container.classList.add("field-selection");
    }

    FieldSupportController.prototype.addType = function (module, typename) {
        for (var i = 0; i < this.knownTypes.length; ++i) {
            if (this.knownTypes[i].isType(module, typename)) {
                return;
            }
        }

        // A type we haven't seen before.
        var newTypeContainer = document.createElement("div");
        var that = this;
        var newType = new FieldSupportAggregateType(module, typename, null, this, function() {
            that.renderRootType(newType, newTypeContainer);
        });

        var that = this;
        return this.renderRootType(newType, newTypeContainer)
        .then(function () {
            that.knownTypes.push(newType);

            // Sort by type name.
            that.knownTypes.sort(function (a, b) {
                return a.typename().localeCompare(b.typename());
            });

            var index = that.knownTypes.indexOf(newType);
            var nodeAfter = null;
            if (index < that.typeListContainer.childNodes.length) {
                nodeAfter = that.typeListContainer.childNodes[index];
            }
            that.typeListContainer.insertBefore(newTypeContainer, nodeAfter);
        });
    }

    FieldSupportController.prototype.renderRootType = function(rootType, typeContainer) {
        var that = this;
        typeContainer.innerHTML = "";
        typeContainer.classList.add("type-container");

        var typeName = document.createElement("div");
        typeName.classList.add("type-name");
        typeName.appendChild(document.createTextNode(rootType.typename()));
        typeName.addEventListener("click", function () {
            rootType.toggleExpansion();
            typeContainer.classList.toggle("collapsed");
            that.renderFieldListAndUI(rootType, fieldsContainer);
        })
        typeContainer.appendChild(typeName);

        var fieldsContainer = document.createElement("div");
        fieldsContainer.classList.add("fields-container");
        if (!rootType.isExpanded()) {
            typeContainer.classList.add("collapsed");
        } else {
            typeContainer.classList.remove("collapsed");
        }
        typeContainer.appendChild(fieldsContainer);

        return this.renderFieldListAndUI(rootType, fieldsContainer);
    }

    FieldSupportController.prototype.renderFieldListAndUI = function(type, fieldListUIContainer) {
        fieldListUIContainer.innerHTML = "";
        var that = this;
        return type.prepareForRendering()
        .then(function () {
            var fieldListContainer = document.createElement("div");
            if (type.isExpanded()) {
                var filterTextBox = document.createElement("input");
                filterTextBox.classList.add("small-input");
                filterTextBox.placeholder = "Search...";
                filterTextBox.type = "search";
                filterTextBox.value = type.searchQuery;
                fieldListUIContainer.appendChild(filterTextBox);
                filterTextBox.focus();
                var searchTimeout = null;
                filterTextBox.addEventListener("input", function () {
                    if (searchTimeout != null) {
                        clearTimeout(searchTimeout);
                    }
                    searchTimeout = setTimeout(function () {
                        type.setSearchQuery(filterTextBox.value);
                        that.renderFieldList(type, fieldListContainer);
                    }, 100);
                });

                if (type.hasBaseTypes()) {
                    var showBaseTypesControl = document.createElement("button");
                    showBaseTypesControl.classList.add("small-button");
                    showBaseTypesControl.textContent = type.includeBaseTypes ? "Exclude Base Types" : "Include Base Types";
                    fieldListUIContainer.appendChild(showBaseTypesControl);
                    showBaseTypesControl.addEventListener("click", function () {
                        type.toggleIncludeBaseTypes();
                        showBaseTypesControl.textContent = type.includeBaseTypes ? "Exclude Base Types" : "Include Base Types";
                        that.renderFieldList(type, fieldListContainer);
                    })
                }
            }

            fieldListUIContainer.appendChild(fieldListContainer);
            return that.renderFieldList(type, fieldListContainer);
        });
    }

    FieldSupportController.prototype.renderFieldList = function(type, fieldsContainer) {
        var that = this;

        return Promise.join([type.getFieldsToRender(), type.getExtendedFieldsToRender()])
        .then(function (results) {
            var fields = results[0];
            var extendedFields = results[1];
            fieldsContainer.innerHTML = "";

            return Promise.map(extendedFields, function (extendedField) {
                var fieldContainer = document.createElement("label");
                fieldsContainer.appendChild(fieldContainer);
                return that.renderFieldUI(extendedField, type, fieldContainer);
            })
            .then(function() {
                if (extendedFields.length > 0 && type.isExpanded()) {
                    var hr = document.createElement("hr");
                    fieldsContainer.appendChild(hr);
                }

                return Promise.map(fields, function (field) {
                    var fieldContainer = document.createElement("label");
                    fieldsContainer.appendChild(fieldContainer);
                    return that.renderFieldUI(field, type, fieldContainer);
                })
            });
        });
    }

    FieldSupportController.prototype.renderFieldUI = function (field, renderingType, fieldContainer) {
        fieldContainer.innerHTML = "";

        if (renderingType.isFiltered(field)) {
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
            that.updateTreeUI();
        });
        var fieldNameContainer = document.createElement("span");
        fieldNameContainer.classList.add("field-name");

        var currentField = field;
        var names = [field.name];
        while (currentField.parentType.aggregateType != renderingType) {
            currentField = currentField.parentType.aggregateType.parentField;
            names.push(currentField.name);
        }
        fieldNameContainer.textContent = names.reverse().join(".");
        fieldContainer.appendChild(fieldNameContainer);
        
        var fieldType = field.getChildTypeName();
        if (fieldType != null) {
            var fieldTypeContainer = document.createElement("span");
            fieldTypeContainer.classList.add("field-type");
            fieldTypeContainer.textContent = fieldType;
            fieldContainer.appendChild(fieldTypeContainer);
            fieldContainer.title = fieldType + " " + field.name;
        } else {
            fieldContainer.title = field.name;
        }

        return field.getChildType()
        .then(function (childType) {
            if (childType == null || renderingType.isFiltered(field)) {
                return;
            }

            var currentType = field.parentType;
            var areAllTypesExpanded = true;
            while (areAllTypesExpanded && currentType != null) {
                var isFiltered = currentType.parentField != null && currentType.parentField.parentType.aggregateType.isFiltered(currentType.parentField);
                areAllTypesExpanded = currentType.isExpanded && !isFiltered;
                currentType = currentType.parentField != null ? currentType.parentField.parentType.aggregateType : null;
            }

            if (!areAllTypesExpanded) {
                // One of the parent types is collapsed, let the parent type render the fields.
                return;
            }

            var subFieldsContainer = document.createElement("div");
            subFieldsContainer.classList.add("fields-container");
            if (!childType.isExpanded()) {
                subFieldsContainer.classList.add("collapsed");
            } else {
                subFieldsContainer.classList.remove("collapsed");
            }
            return that.renderFieldListAndUI(childType, subFieldsContainer)
            .then(function () {
                fieldContainer.parentNode.insertBefore(subFieldsContainer, fieldContainer.nextSibling);
                fieldTypeContainer.addEventListener("click", function (e) {
                    e.preventDefault();
                    childType.toggleExpansion();
                    subFieldsContainer.classList.toggle("collapsed");
                    that.renderFieldListAndUI(childType, subFieldsContainer);
                });
            });
        });
    }

    FieldSupportController.prototype.renderFieldTypeUI = function(childType, subFieldsContainer) {
        subFieldsContainer.innerHTML = "";

        if (childType == null) {
            // There is no child type, so nothing to render.
            return Promise.as(undefined);
        }

        var that = this;
        return this.renderFieldListAndUI(childType, subFieldsContainer);
    }

    function initialize(unused1, unused2, unused3, UpdateUI, container) {
        var fieldSupportController = new FieldSupportController(container, UpdateUI);
        DbgObjectTree.AddTypeNotifier(function (module, typename) {
            fieldSupportController.addType(module, typename);
        });
    }

    return {
        Initialize: initialize,
        RegisterTypeAlias: function() { }
    };
})();