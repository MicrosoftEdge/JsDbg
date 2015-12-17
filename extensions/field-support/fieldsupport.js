"use strict";

// fieldsupport.js
// Peter Salas
//

var FieldSupport = (function() {

    var knownTypes = {};
    var typeList = null;
    var updateTreeUI = null;

    function initialize(StoragePrefix, UserFields, DefaultType, UpdateUI, container) {
        var innerContainer = document.createElement("div");
        innerContainer.classList.add("field-selection");
        container.appendChild(innerContainer);
        typeList = innerContainer;

        DbgObjectTree.AddTypeNotifier(addType);

        updateTreeUI = UpdateUI;
        updateTreeUI();
    }

    function addType(module, type) {
        var fullType = module + "!" + type;
        if (!(fullType in knownTypes)) {
            knownTypes[fullType] = true;
            insertTypeUI(module, type, typeList);
        }
    }

    function renderField(element, names, dbgObject) {
        var descriptionContainer = document.createElement("div");
        if (dbgObject.isNull()) {
            return;
        } else {
            return dbgObject.desc()
            .then(function (desc) {
                element.appendChild(descriptionContainer);
                descriptionContainer.innerHTML = names.join(".") + ":" + desc;
            });
        }
    }

    function insertTypeUI(module, type, container) {
        var typeContainer = document.createElement("div");
        typeContainer.classList.add("type-container");

        var typeName = document.createElement("div");
        typeName.classList.add("type-name");
        typeName.appendChild(document.createTextNode(type));
        typeName.addEventListener("click", function () {
            typeContainer.classList.toggle("collapsed");
        })
        typeContainer.appendChild(typeName);

        var fieldsContainer = document.createElement("div");
        fieldsContainer.classList.add("fields-container");
        typeContainer.classList.add("collapsed");
        typeContainer.appendChild(fieldsContainer);

        var initialTransformer = function (names, dbgObject) { return dbgObject; };
        var addField = function (renderer) { DbgObjectTree.AddField(module, type, renderer); };
        var removeField = function (renderer) { DbgObjectTree.RemoveField(module, type, renderer); };

        new DbgObject(module, type, 0).fields(/*includeBaseTypes*/false)
        .then(function (fields) {
            container.appendChild(typeContainer);
            createFieldUIForFields(module, type, fields, fieldsContainer, initialTransformer, addField, removeField);
        });
    }

    function createFieldUIForFields(module, type, fields, container, transformObject, addField, removeField) {
        fields.forEach(function (field) {
            container.appendChild(
                createAutomaticFieldUI(
                    module, 
                    type, 
                    field.name, 
                    field.value,
                    transformObject,
                    addField,
                    removeField
                )
            );
        });
    }

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

    function createAutomaticFieldUI(module, type, fieldName, fieldObject, transformObject, addField, removeField) {
        var updatedTransformer = function (names, dbgObject) {
            dbgObject = transformObject(names, dbgObject);
            return Promise.as(dbgObject)
            .then(function (dbgObject) {
                if (dbgObject.isNull()) {
                    return dbgObject;
                } else {
                    names.push(fieldName);
                    return dbgObject.f(fieldName);
                }
            });
        };

        var renderer = function (dbgObject, element) {
            var names = [];
            return updatedTransformer(names, dbgObject)
            .then(function (dbgObject) {
                return renderField(element, names, dbgObject);
            });
        };

        var fieldContainer = document.createElement("label");
        fieldContainer.style.display = "block";
        var input = document.createElement("input");
        fieldContainer.appendChild(input);
        input.type = "checkbox";
        input.addEventListener("change", function () {
            if (input.checked) {
                addField(renderer);
            } else {
                removeField(renderer);
            }
            updateTreeUI();
        })
        var fieldNameContainer = document.createElement("span");
        fieldNameContainer.classList.add("field-name");
        fieldNameContainer.textContent = fieldName;
        fieldNameContainer.title = fieldName;
        fieldContainer.appendChild(fieldNameContainer);

        fieldContainer.appendChild(document.createTextNode(" "));
        
        var fieldTypeContainer = document.createElement("span");
        fieldTypeContainer.classList.add("field-type");

        var fieldType = fieldObject.typeDescription();
        fieldTypeContainer.textContent = fieldType;
        fieldTypeContainer.title = fieldType;

        var subFieldsContainer = null;
        fieldTypeContainer.addEventListener("click", function (e) {
            if (subFieldsContainer == null) {
                e.preventDefault();
                subFieldsContainer = document.createElement("div");
                subFieldsContainer.classList.add("fields-container");

                fullyDereferenceDbgObject(fieldObject)
                .then(function (subObject) {
                    return subObject.isTypeWithFields()
                    .then(function (isTypeWithFields) {
                        if (isTypeWithFields) {
                            return subObject
                            .fields()
                            .then(function (subTypeFields) {
                                fieldContainer.parentNode.insertBefore(subFieldsContainer, fieldContainer.nextSibling);
                                createFieldUIForFields(module, subObject.typeDescription(), subTypeFields, subFieldsContainer, updatedTransformer, addField, removeField);
                            })
                        } else {
                            subFieldsContainer = false;
                            fieldTypeContainer.click();
                        }
                    })
                })
            } else if (subFieldsContainer != false) {
                e.preventDefault();
                subFieldsContainer.classList.toggle("collapsed");
            }
        })

        fieldContainer.appendChild(fieldTypeContainer);


        return fieldContainer;
    }

    function addTypeAlias() {

    }

    return {
        Initialize: initialize,
        RegisterTypeAlias: addTypeAlias
    };
})();