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

    function KnownType(module, typename, parentField, controller, rerender) {
        this.module = module;
        this.typename = typename;
        this.parentField = parentField;
        this.fields = null;
        this.fieldsIncludingBaseTypes = null;
        this.isExpanded = false;
        this.includingBaseTypes = undefined;
        this.controller = controller;
        this.rerender = rerender !== undefined ? rerender : function () { this.parentField.parentType.rerender(); };
        this.searchQuery = "";

        var that = this;
        this.extendedFields = [];
        this.extendedFieldsIncludingBaseTypes = null;

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
                            that.controller.updateTreeUI();
                        }
                        return false;
                    } else {
                        return true;
                    }
                });
            }
            that.rerender();
        });
    }

    KnownType.prototype.addExtendedField = function(fieldName, typeName) {
        this.extendedFields.push(
            new KnownField(
                fieldName,
                typeName,
                function getter(dbgObject) {
                    return dbgObject.F(fieldName);
                },
                renderDbgObject,
                this,
                /*isBaseTypeField*/false
            )
        );
    }

    KnownType.prototype.isType = function (module, typename) {
        return (this.module == module && this.typename == typename);
    }

    KnownType.prototype.getFieldsInternal = function (includeBaseTypes) {
        var that = this;
        return new DbgObject(this.module, this.typename, 0)
        .fields(includeBaseTypes)
        .then(function (fields) {
            return fields.map(function (field) {
                var dereferencedType = field.value.typeDescription().replace(/\**$/, "");
                return new KnownField(
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
                    that,
                    /*isBaseType*/includeBaseTypes
                );
            });
        });
    }

    KnownType.prototype.considerFieldWhenCollapsed = function (field, shownFields) {
        if (field.isEnabled) {
            shownFields.push(field);
        }
        if (field.childType != null && field.childType != false) {
            field.childType.getFieldsToShowWhenCollapsed(shownFields);
        }
    }

    KnownType.prototype.disableCompletely = function() {
        var hadEnabledFields = false;
        if (this.fields != null) {
            this.fields.forEach(function (f) { hadEnabledFields = f.disableCompletely() || hadEnabledFields; });
            this.fields = [];
        }
        if (this.fieldsIncludingBaseTypes != null) {
            this.fieldsIncludingBaseTypes.forEach(function (f) { hadEnabledFields = f.disableCompletely() || hadEnabledFields; });
            this.fieldsIncludingBaseTypes = [];
        }
        if (this.extendedFields != null) {
            this.extendedFields.forEach(function (f) { hadEnabledFields = f.disableCompletely() || hadEnabledFields; });
            this.extendedFields = [];
        }
        return hadEnabledFields;
    }

    KnownType.prototype.getExtendedFieldsIncludingBaseTypes = function () {
        var that = this;
        return Promise.as(this.extendedFieldsIncludingBaseTypes)
        .then(function (extendedFieldsIncludingBaseTypes) {
            if (extendedFieldsIncludingBaseTypes != null) {
                return extendedFieldsIncludingBaseTypes;
            } else {
                // Get all the base types for the type.
                return new DbgObject(that.module, that.typename, 0)
                .baseTypes()
                .then(function (baseTypes) {
                    var allExtendedFields = [];
                    baseTypes.reverse()
                    baseTypes.map(function (baseObject) {
                        allExtendedFields = allExtendedFields.concat(DbgObject.GetExtendedFields(that.module, baseObject.typeDescription()));
                    });

                    allExtendedFields = allExtendedFields.map(function (extendedField) {
                        return new KnownField(
                            extendedField.fieldName,
                            extendedField.typeName,
                            function getter(dbgObject) {
                                return dbgObject.F(extendedField.fieldName);
                            },
                            renderDbgObject,
                            that,
                            /*isBaseTypeField*/true
                        );
                    });
                    if (that.extendedFieldsIncludingBaseTypes == null) {
                        that.extendedFieldsIncludingBaseTypes = allExtendedFields.concat(that.extendedFields);
                    }
                    return that.extendedFieldsIncludingBaseTypes;
                });
            }
        })
    }

    KnownType.prototype.getExtendedFieldsToRender = function() {
        if (!this.isExpanded) {
            return Promise.as(this.getExtendedFieldsToShowWhenCollapsed([]));
        } else if (this.includingBaseTypes === true) {
            return this.getExtendedFieldsIncludingBaseTypes();
        } else if (this.includingBaseTypes === false) {
            var baseFieldsToShow = [];
            if (this.extendedFieldsIncludingBaseTypes != null) {
                var that = this;
                this.extendedFieldsIncludingBaseTypes.forEach(function (field) {
                    // Check if the field is in the natural (i.e. non-base fields)
                    if (that.extendedFields.indexOf(field) < 0) {
                        that.considerFieldWhenCollapsed(field, baseFieldsToShow);
                    }
                });
            }
            return Promise.as(baseFieldsToShow.concat(this.extendedFields));
        } else if (this.includingBaseTypes === undefined) {
            var that = this;
            return this.getFields()
            .then(function (fields) {
                that.includingBaseTypes = (fields.length == 0);
                return that.getExtendedFieldsToRender();
            })
        }
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

    KnownType.prototype.isFiltered = function (field) {
        return !fuzzyMatch(field.name.toLowerCase() + " " + field.resultingTypeName.toLowerCase(), this.searchQuery.toLowerCase());
    }

    KnownType.prototype.getFieldsToRender = function () {
        if (!this.isExpanded) {
            return Promise.as(this.getFieldsToShowWhenCollapsed([]));
        } else if (this.includingBaseTypes === true) {
            return this.getFieldsIncludingBaseTypes();
        } else if (this.includingBaseTypes === false) {
            var that = this;
            return this.getFields()
            .then(function (fields) {
                var baseFieldsToShow = [];
                if (that.fieldsIncludingBaseTypes != null) {
                    that.fieldsIncludingBaseTypes.forEach(function (field) {
                        // Check if the field is in the natural (i.e. non-base fields).
                        if (fields.indexOf(field) < 0) {
                            that.considerFieldWhenCollapsed(field, baseFieldsToShow);
                        }
                    })
                }
                return baseFieldsToShow.concat(fields);
            });
        } else if (this.includingBaseTypes === undefined) {
            var that = this;
            return this.getFields()
            .then(function (fields) {
                that.includingBaseTypes = (fields.length == 0);
                return that.getFieldsToRender();
            })
        }
    }

    KnownType.prototype.getExtendedFieldsToShowWhenCollapsed = function(shownFields) {
        var that = this;

        if (this.extendedFieldsIncludingBaseTypes != null) {
            this.extendedFieldsIncludingBaseTypes.forEach(function (field) {
                that.considerFieldWhenCollapsed(field, shownFields);
            })
        } else {
            this.extendedFields.forEach(function (field) {
                that.considerFieldWhenCollapsed(field, shownFields);
            })
        }

        return shownFields;
    }

    KnownType.prototype.getFieldsToShowWhenCollapsed = function(shownFields) {
        var that = this;

        if (this.fieldsIncludingBaseTypes != null) {
            this.fieldsIncludingBaseTypes.forEach(function (field) {
                that.considerFieldWhenCollapsed(field, shownFields);
            });
        } else if (this.fields != null) {
            this.fields.forEach(function (field) {
                that.considerFieldWhenCollapsed(field, shownFields);
            });
        }

        return shownFields;
    }

    KnownType.prototype.getFields = function () {
        if (this.fields != null) {
            return Promise.as(this.fields);
        } else {
            var that = this
            return this.getFieldsInternal(/*includeBaseTypes*/false)
            .then(function (fields) {
                if (that.fields == null) {
                    that.fields = fields;
                }
                return that.extendedFields.concat(that.fields);
            });
        }
    }

    KnownType.prototype.getFieldsIncludingBaseTypes = function() {
        if (this.fieldsIncludingBaseTypes != null) {
            return Promise.as(this.fieldsIncludingBaseTypes);
        } else {
            var that = this;
            return Promise.join([this.getFields(), this.getFieldsInternal(/*includeBaseTypes*/true)])
            .then(function (results) {
                // Remove the duplicated fields and concatenate the canonical fields.
                if (that.fieldsIncludingBaseTypes == null) {
                    that.fieldsIncludingBaseTypes = results[1].slice(0, results[1].length - results[0].length).concat(results[0]);
                }
                return that.fieldsIncludingBaseTypes;
            });
        }
    }

    KnownType.prototype.setSearchQuery = function(query) {
        this.searchQuery = query;
    }

    function KnownField(name, resultingTypeName, getter, renderer, parentType, isBaseTypeField) {
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

    KnownField.prototype.renderField = function(dbgObject, element) {
        var names = [];

        var parentFields = [];
        var currentField = this;
        while (currentField != null) {
            parentFields.push(currentField);
            currentField = currentField.parentType.parentField;
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

    KnownField.prototype.getChildTypeName = function() {
        return this.resultingTypeName;
    }

    KnownField.prototype.disableCompletely = function() {
        var hadEnabledFields = this.isEnabled;
        this.setIsEnabled(false);
        if (this.childType instanceof KnownType) {
            hadEnabledFields = this.childType.disableCompletely() || hadEnabledFields;
        }
        return hadEnabledFields
    }

    KnownField.prototype.setIsEnabled = function(isEnabled) {
        if (isEnabled != this.isEnabled) {
            this.isEnabled = isEnabled;
            var rootType = this.parentType;
            while (rootType.parentField != null) {
                rootType = rootType.parentField.parentType;
            }
            if (isEnabled) {
                DbgObjectTree.AddField(rootType.module, rootType.typename, this.fieldRenderer);
            } else {
                DbgObjectTree.RemoveField(rootType.module, rootType.typename, this.fieldRenderer);
            }
        }
    }

    KnownField.prototype.getChildType = function() {
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
                        that.childType = new KnownType(that.parentType.module, that.resultingTypeName, that, that.parentType.controller);
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
        var newType = new KnownType(module, typename, null, this, function() {
            that.renderRootType(newType, newTypeContainer);
        });
        this.knownTypes.push(newType);

        var that = this;
        return this.renderRootType(newType, newTypeContainer)
        .then(function () {
            // Sort by type name.
            that.knownTypes.sort(function (a, b) {
                return a.typename.localeCompare(b.typename);
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
        typeName.appendChild(document.createTextNode(rootType.typename));
        typeName.addEventListener("click", function () {
            rootType.isExpanded = !rootType.isExpanded;
            typeContainer.classList.toggle("collapsed");
            that.renderFieldListAndUI(rootType, fieldsContainer);
        })
        typeContainer.appendChild(typeName);

        var fieldsContainer = document.createElement("div");
        fieldsContainer.classList.add("fields-container");
        if (!rootType.isExpanded) {
            typeContainer.classList.add("collapsed");
        } else {
            typeContainer.classList.remove("collapsed");
        }
        typeContainer.appendChild(fieldsContainer);

        return this.renderFieldListAndUI(rootType, fieldsContainer);
    }

    FieldSupportController.prototype.renderFieldListAndUI = function(type, fieldListUIContainer) {
        fieldListUIContainer.innerHTML = "";
        var fieldListContainer = document.createElement("div");
        if (type.isExpanded) {
            var filterTextBox = document.createElement("input");
            filterTextBox.classList.add("small-input");
            filterTextBox.placeholder = "Search...";
            filterTextBox.type = "search";
            filterTextBox.value = type.searchQuery;
            fieldListUIContainer.appendChild(filterTextBox);
            filterTextBox.focus();
            var that = this;
            filterTextBox.addEventListener("input", function () {
                type.setSearchQuery(filterTextBox.value);
                that.renderFieldList(type, fieldListContainer);
            });

            var showBaseTypesControl = document.createElement("button");
            showBaseTypesControl.classList.add("small-button");
            showBaseTypesControl.textContent = type.includingBaseTypes ? "Exclude Base Types" : "Include Base Types";
            fieldListUIContainer.appendChild(showBaseTypesControl);
            showBaseTypesControl.addEventListener("click", function () {
                type.includingBaseTypes = !type.includingBaseTypes;
                that.renderFieldList(type, fieldListContainer);
            })
        }

        fieldListUIContainer.appendChild(fieldListContainer);
        return this.renderFieldList(type, fieldListContainer);
    }

    FieldSupportController.prototype.renderFieldList = function(type, fieldsContainer) {
        var that = this;

        return type.getFieldsToRender()
        .then(function (fields) {
            return type.getExtendedFieldsToRender()
            .then(function (extendedFields) {
                fieldsContainer.innerHTML = "";

                return Promise.map(extendedFields, function (extendedField) {
                    var fieldContainer = document.createElement("label");
                    fieldsContainer.appendChild(fieldContainer);
                    return that.renderFieldUI(extendedField, type, fieldContainer);
                })
                .then(function() {
                    if (extendedFields.length > 0 && type.isExpanded) {
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
        while (currentField.parentType != renderingType) {
            currentField = currentField.parentType.parentField;
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
            var areAllTypesExpanded = !(field.isBaseTypeField && !field.parentType.includingBaseTypes);
            while (areAllTypesExpanded && currentType != null) {
                var isFiltered = currentType.parentField != null && currentType.parentField.parentType.isFiltered(currentType.parentField);
                areAllTypesExpanded = currentType.isExpanded && !isFiltered;
                currentType = currentType.parentField != null ? currentType.parentField.parentType : null;
            }

            if (!areAllTypesExpanded) {
                // One of the parent types is collapsed, let the parent type render the fields.
                return;
            }

            var subFieldsContainer = document.createElement("div");
            subFieldsContainer.classList.add("fields-container");
            if (!childType.isExpanded) {
                subFieldsContainer.classList.add("collapsed");
            } else {
                subFieldsContainer.classList.remove("collapsed");
            }
            return that.renderFieldListAndUI(childType, subFieldsContainer)
            .then(function () {
                fieldContainer.parentNode.insertBefore(subFieldsContainer, fieldContainer.nextSibling);
                fieldTypeContainer.addEventListener("click", function (e) {
                    e.preventDefault();
                    childType.isExpanded = !childType.isExpanded;
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