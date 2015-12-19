"use strict";

// fieldsupport.js
// Peter Salas
//

var FieldSupport = (function() {

    function KnownType(module, typename, parentField) {
        this.module = module;
        this.typename = typename;
        this.parentField = parentField;
        this.fields = null;
        this.fieldsIncludingBaseTypes = null;
        this.isExpanded = false;
        this.includingBaseTypes = undefined;
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
                return new KnownField(field.name, field.value, that);
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
                        that.considerFieldWhenCollapsed(field, baseFieldsToShow);
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
                return that.fields;
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

    function KnownField(name, dbgObject, parentType) {
        this.name = name;
        this.dbgObject = dbgObject;
        this.parentType = parentType;
        this.childType = null;
        this.isEnabled = false;
        this.fieldRenderer = this.renderField.bind(this);
    }

    KnownField.prototype.renderField = function(dbgObject, element) {
        var names = [];

        var parentFields = [];
        var currentField = this;
        while (currentField != null) {
            parentFields.push(currentField);
            currentField = currentField.parentType.parentField;
        }

        var fields = parentFields.reverse().map(function (field) { return field.name; }).join(".");

        return dbgObject.f(fields)
        .then(function (dbgObjectToRender) {
            if (!dbgObjectToRender.isNull()) {
                return dbgObjectToRender.desc()
                .then(function (desc) {
                    var descriptionContainer = document.createElement("div");
                    element.appendChild(descriptionContainer);
                    descriptionContainer.innerHTML = fields + ":" + desc;
                });
            }
        });
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
        function fullyDereferenceDbgObject(dbgObject) {
            return Promise.as(dbgObject)
            .then(function (dbgObject) {
                if (dbgObject.isPointer()) {
                    return fullyDereferenceDbgObject(dbgObject.deref());
                } else {
                    return dbgObject;
                }
            });
        }

        var that = this;
        return Promise.as(this.childType)
        .then(function (childType) {
            if (childType == null) {
                // Fetch the child type.
                return fullyDereferenceDbgObject(that.dbgObject)
                .then(function (dereferencedDbgObject) {
                    return dereferencedDbgObject.isTypeWithFields()
                    .then(function (isTypeWithFields) {
                        if (!isTypeWithFields) {
                            that.childType = false;
                            return null;
                        } else {
                            that.childType = new KnownType(dereferencedDbgObject.module, dereferencedDbgObject.typeDescription(), that);
                            return that.childType;
                        }
                    })
                });
            } else if (childType === false) {
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
        var newType = new KnownType(module, typename, null);
        this.knownTypes.push(newType);

        var that = this;
        var newTypeContainer = document.createElement("div");
        return this.renderRootType(newType, newTypeContainer)
        .then(function () {
            that.typeListContainer.appendChild(newTypeContainer);
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
            that.renderFieldList(rootType, fieldsContainer);
        })
        typeContainer.appendChild(typeName);

        var fieldsContainer = document.createElement("div");
        fieldsContainer.classList.add("fields-container");
        if (!rootType.isExpanded) {
            typeContainer.classList.add("collapsed");
        }
        typeContainer.appendChild(fieldsContainer);

        return this.renderFieldList(rootType, fieldsContainer);
    }

    FieldSupportController.prototype.renderFieldList = function(type, fieldsContainer) {
        var that = this;

        return type.getFieldsToRender()
        .then(function (fields) {
            fieldsContainer.innerHTML = "";

            if (type.isExpanded) {
                var showBaseTypesControl = document.createElement("button");
                showBaseTypesControl.classList.add("small-button");
                showBaseTypesControl.textContent = type.includingBaseTypes ? "Exclude Base Types" : "Include Base Types";
                fieldsContainer.appendChild(showBaseTypesControl);
                showBaseTypesControl.addEventListener("click", function () {
                    type.includingBaseTypes = !type.includingBaseTypes;
                    that.renderFieldList(type, fieldsContainer);
                })
            }

            return Promise.map(fields, function (field) {
                var fieldContainer = document.createElement("label");
                fieldContainer.style.display = "block";
                fieldsContainer.appendChild(fieldContainer);
                return that.renderFieldUI(field, type, fieldContainer);
            });
        });
    }

    FieldSupportController.prototype.renderFieldUI = function (field, renderingType, fieldContainer) {
        fieldContainer.innerHTML = "";

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
        fieldNameContainer.title = field.name;
        fieldContainer.appendChild(fieldNameContainer);
        
        var fieldTypeContainer = document.createElement("span");
        fieldTypeContainer.classList.add("field-type");

        var fieldType = field.dbgObject.typeDescription();
        fieldTypeContainer.textContent = fieldType;
        fieldTypeContainer.title = fieldType;
        fieldContainer.appendChild(fieldTypeContainer);

        return field.getChildType()
        .then(function (childType) {
            if (childType == null) {
                return;
            }

            var subFieldsContainer = document.createElement("div");
            subFieldsContainer.classList.add("fields-container");
            if (!childType.isExpanded) {
                subFieldsContainer.classList.toggle("collapsed");
            }
            return that.renderFieldList(childType, subFieldsContainer)
            .then(function () {
                fieldContainer.parentNode.insertBefore(subFieldsContainer, fieldContainer.nextSibling);
                fieldTypeContainer.addEventListener("click", function (e) {
                    e.preventDefault();
                    childType.isExpanded = !childType.isExpanded;
                    subFieldsContainer.classList.toggle("collapsed");
                    that.renderFieldList(childType, subFieldsContainer);
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
        return this.renderFieldList(childType, subFieldsContainer);
    }


    function initialize(StoragePrefix, UserFields, DefaultType, UpdateUI, container) {
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