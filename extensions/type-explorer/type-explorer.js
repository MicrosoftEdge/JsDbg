//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// type-explorer.js
// UI for interactive exploration of a type and its fields or extensions.

var TypeExplorer = undefined;
Loader.OnLoad(function() {
    function TypeExplorerAggregateType(type, parentField, controller, rerender) {
        this.parentField = parentField;
        this.controller = controller;
        this.searchQuery = "";
        this.backingTypes = [new TypeExplorerSingleType(type, /*offsetFromAggregate*/0, this)];
        this.includeBaseTypes = false;
        this.preparedForRenderingPromise = null;
        this.isTypeInvalid = false;
    }

    TypeExplorerAggregateType.prototype.type = function () {
        return this.backingTypes[0].type;
    }

    TypeExplorerAggregateType.prototype.isExpanded = function() {
        return this.backingTypes[0].isExpanded;
    }

    TypeExplorerAggregateType.prototype.requiresRendering = function() {
        if (this.isExpanded()) {
            return true;
        }

        var requiresRendering = false;
        this.backingTypes.forEach(function(bt) {
            requiresRendering = requiresRendering || bt.requiresRendering();
        });

        return requiresRendering;
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
        return DbgObject.create(this.backingTypes[0].type, 0)
        .baseTypes()
        .then(function (baseTypes) {
            baseTypes.forEach(function (baseType) {
                that.backingTypes.push(new TypeExplorerSingleType(baseType.type, baseType.pointerValue(), that));
            })
        }, function (err) {
            // Invalid type.
            that.isTypeInvalid = true;
        })
        .then(function () {
            return Promise.map(that.backingTypes, function (bt) { return bt.prepareForRendering(); });
        })
        .then(function () {
            if (that.controller.includeBaseTypesByDefault() || (!that.includeBaseTypes && that.backingTypes[0].fields.length == 0)) {
                that.toggleIncludeBaseTypes();
            }
            that.isPreparedForRendering = true;
        });
    }

    TypeExplorerAggregateType.prototype.toggleExpansion = function() {
        var that = this;
        this.backingTypes.forEach(function (backingType, i) {
            backingType.isExpanded = !backingType.isExpanded && (i == 0 || that.includeBaseTypes);
        });
        if (!this.isExpanded()) {
            // Recursive toggle any child types that are expanded.
            this.backingTypes.forEach(function (backingType) {
                backingType.forEachField(function (field) {
                    if (field.childType != null && field.childType.isExpanded()) {
                        field.childType.toggleExpansion();
                    }
                })
            })
        }
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

    function reverseAndFlatten(array) {
        array = array.slice(0);
        array.reverse();
        var result = [];
        array.forEach(function (subArray) {
            result = result.concat(subArray);
        });
        return result;
    }

    TypeExplorerAggregateType.prototype.arrangeFields = function(fields) {
        fields = reverseAndFlatten(fields);
        if (this.searchQuery != "") {
            var searchQuery = this.searchQuery.toLowerCase();
            var augmentedFields = fields.map(function (field) {
                var base = field.name.toLowerCase();
                var context = {};
                if (fuzzyMatch(base, searchQuery, context)) {
                    return {field: field, score: context.score };
                } else {
                    return null;
                }
            });
            augmentedFields = augmentedFields.filter(function (x) { return x != null; });
            augmentedFields.sort(function (a, b) {
                return a.score - b.score;
            });
            fields = augmentedFields.map(function (x) { return x.field; });
        }
        return fields;
    }

    TypeExplorerAggregateType.prototype.getPerInstanceFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return this.arrangeFields(this.backingTypes.map(function (backingType) { return backingType.getPerInstanceFieldsToRender(); }));
    }

    TypeExplorerAggregateType.prototype.getFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return this.arrangeFields(this.backingTypes.map(function (backingType) { return backingType.getFieldsToRender(); }));
    }

    TypeExplorerAggregateType.prototype.getExtendedFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return this.arrangeFields(this.backingTypes.map(function (backingType) { return backingType.getExtendedFieldsToRender(); }));
    }

    TypeExplorerAggregateType.prototype.getArrayFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return this.arrangeFields(this.backingTypes.map(function (backingType) { return backingType.getArrayFieldsToRender(); }));
    }

    TypeExplorerAggregateType.prototype.getDescriptionsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return this.arrangeFields(this.backingTypes.map(function (backingType) { return backingType.getDescriptionsToRender(); }));
    }

    TypeExplorerAggregateType.prototype.getArrayItemFieldsToRender = function() {
        console.assert(this.isPreparedForRendering);
        return this.arrangeFields(this.backingTypes.map(function (backingType) { return backingType.getArrayItemFieldsToRender(); }));
    }

    TypeExplorerAggregateType.prototype.hasArrayItemField = function() {
        return this.backingTypes.reduce((foundArrayItemField, backingType) => (foundArrayItemField || backingType.hasArrayItemField()), false);
    }

    function fuzzyMatch(body, term, context) {
        if (term.length == 0) {
            return true;
        }

        var firstCharacterIndex = body.indexOf(term[0]);
        if (firstCharacterIndex == -1) {
            return false;
        }

        if (context === undefined) {
            context = {};
        }
        if (context.score === undefined) {
            // Initial offset counts much less than subsequent offsets.
            context.score = firstCharacterIndex / 100;
        } else {
            var score = 0;
            if (context.isFirstCharacterTransposed) {
                if (firstCharacterIndex == 0) {
                    // A first character hit means the characters were transposed.
                    score = 4;
                } else {
                    score = firstCharacterIndex - 1;
                }
            } else {
                score = firstCharacterIndex;
            }
            context.score += score;
        }

        // Allow slightly transposed fuzzy matches by grabbing the character before the hit.
        var prefix = "";
        if (firstCharacterIndex > 0 && !(context.isFirstCharacterTransposed && firstCharacterIndex == 1)) {
            prefix = body[firstCharacterIndex - 1];
            context.isFirstCharacterTransposed = true;
        } else {
            context.isFirstCharacterTransposed = false;
        }

        return fuzzyMatch(prefix + body.substr(firstCharacterIndex + 1), term.substr(1), context);
    }

    Loader.OnLoad(function() {
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
                assert(!fuzzyMatch("abcde", "bca"), "bca !-> abcde");
            });
        }
    })

    TypeExplorerAggregateType.prototype.setSearchQuery = function(query) {
        this.searchQuery = query;
    }

    // Represents a single type, not including its base types.
    function TypeExplorerSingleType(type, offsetFromAggregate, aggregateType) {
        this.aggregateType = aggregateType;
        this.isExpanded = false;
        this.type = type;
        this.offsetFromAggregate = offsetFromAggregate;
        this.perInstanceFields = [];
        this.fields = [];
        this.extendedFields = [];
        this.descriptions = [];
        this.arrayFields = [];
        this.arrayItemFields = [];
        this.allFieldArrayNames = ["perInstanceFields", "fields", "extendedFields", "arrayFields", "descriptions", "arrayItemFields"];
        this.preparedForRenderingPromise = null;
    }

    TypeExplorerSingleType.prototype.dbgObjectFromAggregateObject = function(dbgObject) {
        // Only offset if it's non-zero so that we don't lose any bitfield context.
        if (this.offsetFromAggregate != 0) {
            return DbgObject.create(this.type, dbgObject.pointerValue().add(this.offsetFromAggregate));
        } else {
            return dbgObject.as(this.type);
        }
    }

    TypeExplorerSingleType.prototype.allFieldArrays = function() {
        var that = this;
        return this.allFieldArrayNames.map(function (n) { return that[n]; })
    }

    function getExtensionType(extension, baseType) {
        var type = extension.type; 
        if (type) {
            return Promise.resolve(type instanceof Function ? type(baseType) : type, baseType)
            .then((typeName) => DbgObjectType(typeName, baseType));
        } else {
            return Promise.resolve(null);
        }
    }

    TypeExplorerSingleType.prototype.monitorTypeExtensions = function(typeExtensions, arrayName) {
        var that = this;
        function addTypeExtensionField(name, extension, extensionType) {
            // For descriptions, ignore the primary descriptions.
            if (extension.isPrimary) {
                return;
            }

            var newField = new TypeExplorerField(name, extensionType, extension.getter, that, arrayName);
            that[arrayName].push(newField);

            if (UserDbgObjectExtensions.GetCreationContext(extension.getter) == that.aggregateType) {
                newField.setIsEnabled(true);
            }
        }

        var allExtensions = typeExtensions.getAllExtensions(this.type);
        // The extension types might be functions that return promises
        return Promise.map(allExtensions, (nameAndExtension) => getExtensionType(nameAndExtension.extension, that.type))
        .then((extensionTypes) => {
            allExtensions.forEach((nameAndExtension, i) => addTypeExtensionField(nameAndExtension.name, nameAndExtension.extension, extensionTypes[i]))

            typeExtensions.addListener(this.type, function (type, extensionName, extension, operation, argument) {
                if (operation == "add") {
                    getExtensionType(extension, that.type).then((extensionType) => addTypeExtensionField(extensionName, extension, extensionType));
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

                that.aggregateType.controller.requestRerender(/*changeFocus*/false);
            });
        })
    }

    TypeExplorerSingleType.prototype.prepareForRendering = function() {
        if (this.preparedForRenderingPromise == null) {
            this.preparedForRenderingPromise = this._prepareForRendering();
        }
        return this.preparedForRenderingPromise;
    }

    TypeExplorerSingleType.prototype._prepareForRendering = function() {
        var that = this;
        var dbgObject = DbgObject.create(this.type, 0);
        var fieldsPromise;
        if (dbgObject.type.isPointer()) {
            fieldsPromise = Promise.resolve([]);
        } else {
            fieldsPromise = dbgObject.fields(/*includeBaseTypes*/false);
        }

        return fieldsPromise
        .then(function (fields) {
            fields.forEach(function (field) {
                var fieldType = field.value.type;
                if (fieldType.isPointer() && !fieldType.isArray()) {
                    fieldType = fieldType.dereferenced();
                }
                var getter = field.value.type.isArray() ? function (dbgObject) { return dbgObject.f(field.name).array(); } : function(dbgObject) { return dbgObject.f(field.name); };
                that.fields.push(new TypeExplorerField(field.name, fieldType, getter, that, "fields"));
            })

            return Promise.all([
                that.monitorTypeExtensions(DbgObject.ExtendedFields, "extendedFields"),
                that.monitorTypeExtensions(DbgObject.TypeDescriptions, "descriptions"),
                that.monitorTypeExtensions(DbgObject.ArrayFields, "arrayFields"),
                that.preparePerInstanceFields(),
            ])
        }, function () {
            // The type doesn't exist.
        });
    }

    // When we're operating on a single instance, there are automatic "fields" that can be rendered.
    TypeExplorerSingleType.prototype.preparePerInstanceFields = function() {
        if (this.aggregateType.backingTypes[0] != this) {
            // Only the primary type has per-instance fields.
            return;
        }

        var controllerDbgObject = this.aggregateType.controller.dbgObject;
        if (controllerDbgObject.isNull()) {
            return;
        }

        var dbgObjectPromise = null;
        var parentField = this.aggregateType.parentField;
        if (parentField != null) {
            dbgObjectPromise = parentField.getNestedField(controllerDbgObject);
        } else {
            dbgObjectPromise = Promise.resolve(controllerDbgObject);
        }

        var that = this;
        return dbgObjectPromise
        .then(function (result) {
            // We only support per-instance fields on DbgObjects (not arrays of DbgObjects).
            if (result instanceof DbgObject) {
                if (result.type.isPointer()) {
                    var newField = new TypeExplorerField("[dereferenced]", result.type.dereferenced(), function() { return result.deref() }, that, "perInstanceFields");
                    that.perInstanceFields.push(newField);
                } else {
                    return result.vcast()
                    .then(
                        function (castedDbgObject) {
                            if (!castedDbgObject.type.equals(that.type)) {
                                var newField = new TypeExplorerField("[vtable cast]", castedDbgObject.type, function() { return castedDbgObject; }, that, "perInstanceFields");
                                that.perInstanceFields.push(newField);
                            }
                        }
                    );
                }
            }
        })
        .catch((err) => true); // The vtable cast might fail, which is fine.
    }

    TypeExplorerSingleType.prototype.forEachField = function (f) {
        this.allFieldArrays().forEach(function (a) { a.forEach(f); });
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

    TypeExplorerSingleType.prototype.requiresRendering = function() {
        var requiresRendering = false;
        this.forEachField(function (f) {
            if (f.isEnabled) {
                requiresRendering = true;
            } else if (f.childType != null) {
                requiresRendering = requiresRendering || f.childType.requiresRendering();
            }
        });
        return requiresRendering;
    }

    TypeExplorerSingleType.prototype.selectFieldsToRender = function (allFields) {
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

    TypeExplorerSingleType.prototype.getPerInstanceFieldsToRender = function () {
        return this.selectFieldsToRender(this.perInstanceFields);
    }

    TypeExplorerSingleType.prototype.getFieldsToRender = function () {
        return this.selectFieldsToRender(this.fields);
    }

    TypeExplorerSingleType.prototype.getExtendedFieldsToRender = function() {
        return this.selectFieldsToRender(this.extendedFields);
    }

    TypeExplorerSingleType.prototype.getArrayFieldsToRender = function() {
        return this.selectFieldsToRender(this.arrayFields);
    }

    TypeExplorerSingleType.prototype.getDescriptionsToRender = function() {
        return this.selectFieldsToRender(this.descriptions);
    }

    TypeExplorerSingleType.prototype.getArrayItemFieldsToRender = function() {
        return this.selectFieldsToRender(this.arrayItemFields);
    }

    TypeExplorerSingleType.prototype.hasArrayItemField = function() {
        return this.arrayItemFields.length > 0;
    }

    TypeExplorerSingleType.prototype.disableCompletely = function() {
        // Disable all the fields and trash the arrays.
        this.forEachField(function (f) {
            f.disableCompletely();
        });
        this.allFieldArrays().forEach(function (a) {
            a.length = 0;
        });
    }

    function TypeExplorerField(name, fieldType, getter, parentType, sourceInParentType) {
        this.name = name;
        this.parentType = parentType;
        this.getter = getter;
        var that = this;
        if (parentType.aggregateType.controller.allowFieldRendering()) {
            UserEditableFunctions.AddListener(this.getter, function () {
                parentType.aggregateType.controller.requestRerender(/*changeFocus*/false);
            });
        }

        this.sourceInParentType = sourceInParentType;
        this.isEnabled = false;
        this.clientContext = {};
        this.childType = null;

        this.setChildType(fieldType);
        this.cachedResults = new WeakMap();
    }

    TypeExplorerField.prototype.isUserDefinedArray = function() {
        return this.sourceInParentType == "arrayFields";
    }

    TypeExplorerField.prototype.returnsArray = function() {
        return this.isUserDefinedArray() || (this.getChildType() != null && this.getChildType().isArray());
    }

    TypeExplorerField.prototype.getNestedField = function(dbgObject) {
        console.assert(!dbgObject.isNull());
        var that = this;
        function checkType(result) {
            // Check that the field returned the proper type.
            if (!(result instanceof DbgObject)) {
                var resultString = result.toString();
                if (Array.isArray(result)) {
                    resultString = "an array";
                }
                throw new Error("The field \"" + that.name + "\" should have returned a DbgObject but instead returned " + resultString + ".");
            }

            var type = that.childType.type();
            if (that.returnsArray()) {
                type = type.nonArrayType();
            }
            return result.isType(type)
            .then(function (isType) {
                if (!isType) {
                    throw new Error("The field \"" + that.name + "\" was supposed to be type \"" + that.childType.type() + "\" but was unrelated type \"" + result.type.name() + "\".");
                } else {
                    return result;
                }
            });
        }

        function getFromParentDbgObject(parentDbgObject) {
            parentDbgObject = that.parentType.dbgObjectFromAggregateObject(parentDbgObject);
            if (that.childType == null) {
                return function (element) {
                    return that.getter(parentDbgObject, element);
                }
            }

            return Promise.resolve(that.getter(parentDbgObject))
            .then(function(result) {
                if (that.returnsArray()) {
                    if (!Array.isArray(result)) {
                        throw new Error("The array \"" + that.name + "\" did not return an array, but returned \"" + result + "\"");
                    }
                    return Promise.map(Promise.all(result), checkType);
                } else {
                    return checkType(result);
                }
            });
        }

        function getFromParentResult(parentResult) {
            return Promise.resolve(parentResult)
            .then((parentResult) => {
                if (Array.isArray(parentResult)) {
                    if (that.sourceInParentType == "arrayItemFields") {
                        var index = parseInt(that.name.substring(1, that.name.length - 1));
                        return getFromParentDbgObject(parentResult[index]);
                    } else {
                        // Use a direct map, rather than Promise.map, to keep errors separate.
                        return parentResult.map((entry) => getFromParentResult(entry));
                    }
                } else {
                    return getFromParentDbgObject(parentResult);
                }
            });
        }

        if (that.cachedResults.has(dbgObject)) {
            return Promise.resolve(that.cachedResults.get(dbgObject));
        } else {
            var parentField = that.parentType.aggregateType.parentField;
            return ((parentField == null) ? Promise.resolve(dbgObject) : parentField.getNestedField(dbgObject))
            .then((parentResult) => {
                return getFromParentResult(parentResult);
            })
            .then((result) => {
                that.cachedResults.set(dbgObject, result);
                return result;
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

    TypeExplorerField.prototype.disableCompletely = function() {
        this.setIsEnabled(false, null);
        if (this.childType != null) {
            this.childType.disableCompletely();
        }
    }

    TypeExplorerField.prototype.setIsEnabled = function(isEnabled, enableFieldContext) {
        if (!this.parentType.aggregateType.controller.allowFieldSelection()) {
            return;
        }

        if (isEnabled != this.isEnabled) {
            this.isEnabled = isEnabled;
            this.parentType.aggregateType.controller._notifyFieldChange(this, enableFieldContext);
        }
    }

    TypeExplorerField.prototype.getChildType = function() {
        return this.childType == null ? null : this.childType.type();
    }

    TypeExplorerField.prototype.setChildType = function(newType) {
        if (newType != null && !DbgObjectType.is(newType)) {
            throw new Error("Invalid type.");
        }
        if (this.childType != null) {
            this.childType.disableCompletely();
        }

        if (newType != null) {
            this.childType = new TypeExplorerAggregateType(newType, this, this.parentType.aggregateType.controller);
        } else {
            this.childType = null;
        }
    }

    function TypeExplorerController(dbgObject, options) {
        this.container = null;
        this.dbgObject = dbgObject;
        this.options = options;
        this.rootType = new TypeExplorerAggregateType(dbgObject.type, null, this);
    }

    TypeExplorerController.prototype.render = function(explorerContainer) {
        explorerContainer.classList.add("type-explorer");

        this.container = document.createElement("div");
        explorerContainer.appendChild(this.container);
        this.hasRequestedRerender = false;

        var that = this;
        return UserDbgObjectExtensions.EnsureLoaded()
        .then(function () {
            that.container.classList.add("collapsed");
            return that._renderType(that.rootType, that.container, /*changeFocus*/true);
        });
    }

    TypeExplorerController.prototype.focus = function() {
        this.container.querySelector("input").focus();
    }

    TypeExplorerController.prototype.requestRerender = function(changeFocus) {
        if (this.hasRequestedRerender) {
            return;
        }

        this.hasRequestedRerender = true;
        var that = this;
        window.requestAnimationFrame(function () {
            if (that.hasRequestedRerender) {
                that.hasRequestedRerender = false;

                if (that.container != null) {
                    var scrollTops = [];
                    var currentElement = that.container;

                    if (!changeFocus) {
                        // Capture the current scroll positions of all the ancestors.
                        while (currentElement != null) {
                            scrollTops.push(currentElement.scrollTop);
                            currentElement = currentElement.parentNode;
                        }
                    }
                    
                    that._renderType(that.rootType, that.container, changeFocus)
                    .then(function () {
                        if (!changeFocus) {
                            // Restore the scroll positions of the all the ancestors.
                            currentElement = that.container;
                            while (currentElement != null) {
                                currentElement.scrollTop = scrollTops.shift();
                                currentElement = currentElement.parentNode;
                            }
                        }
                    })
                }
            }
        });
    }

    TypeExplorerController.prototype.enableField = function(path, context) {
        var that = this;
        return UserDbgObjectExtensions.EnsureLoaded()
        .then(function() {
            return that._enableRemainingPath(that.rootType, path, 0, context);
        });
    }

    TypeExplorerController.prototype.toggleExpansion = function() {
        this.rootType.toggleExpansion();
        this.requestRerender(/*changeFocus*/true);
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
            path.push(obj.type.toString());
            return this._appendPath(obj.aggregateType, path);
        } else if (obj instanceof TypeExplorerAggregateType) {
            if (obj.parentField != null) {
                return this._appendPath(obj.parentField, path);
            }
        }
    }

    TypeExplorerController.prototype._enableRemainingPath = function (obj, path, currentIndex, enableFieldContext) {
        var that = this;
        if (currentIndex == path.length) {
            if (obj instanceof TypeExplorerField) {
                obj.setIsEnabled(true, enableFieldContext);
            }
        } else {
            if (obj instanceof TypeExplorerField) {
                return that._enableRemainingPath(obj.childType, path, currentIndex, enableFieldContext);
            } else if (obj instanceof TypeExplorerSingleType) {
                var collection = path[currentIndex];
                collection = obj[collection];
                currentIndex++;

                return Promise.resolve(collection)
                .then(function (collection) {
                    for (var i = 0; i < collection.length; ++i) {
                        if (collection[i].name == path[currentIndex]) {
                            return that._enableRemainingPath(collection[i], path, currentIndex + 1, enableFieldContext);
                        }
                    }
                })
            } else if (obj instanceof TypeExplorerAggregateType) {
                return obj.prepareForRendering()
                .then(function () {
                    for (var i = 0; i < obj.backingTypes.length; ++i) {
                        if (obj.backingTypes[i].type.equals(path[currentIndex])) {
                            return that._enableRemainingPath(obj.backingTypes[i], path, currentIndex + 1, enableFieldContext);
                        }
                    }
                });
            }
        }
    }

    TypeExplorerController.prototype.allowFieldSelection = function() {
        return !!this.options.onFieldChange;
    }

    TypeExplorerController.prototype.allowFieldRendering = function() {
        return !this.dbgObject.isNull();
    }

    TypeExplorerController.prototype.includeBaseTypesByDefault = function() {
        return !!this.options.includeBaseTypesByDefault;
    }

    TypeExplorerController.prototype._notifyFieldChange = function(field, context) {
        if (this.options.onFieldChange) {
            this.options.onFieldChange(this.dbgObject, this._getFieldForNotification(field), context);
        }
    }

    TypeExplorerController.prototype._getFieldForNotification = function(field) {
        var result = {
            context: field.clientContext,
            getter: field.getNestedField.bind(field),
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

    TypeExplorerController.prototype._renderType = function(type, typeContainer, changeFocus) {
        if (typeContainer == null) {
            return Promise.resolve(null);
        }

        if (!typeContainer.currentType) {
            typeContainer.classList.add("fields-container");
            typeContainer.innerHTML = [
                "<input class=\"small-input\" placeholder=\"Search...\" type=\"search\">",
                "<button class=\"small-button base-types\"></button>",
                "<button class=\"small-button extend\">Extend</button>",
                "<div></div>",
                "<div></div>"
            ].join("");
            typeContainer.querySelector("input").addEventListener("input", function () {
                typeContainer.currentType.setSearchQuery(filterTextBox.value);
                typeContainer.currentType.controller._renderFieldList(typeContainer.currentType, fieldListContainer);
            });
            typeContainer.querySelector(".base-types").addEventListener("click", function() {
                var type = typeContainer.currentType;
                type.toggleIncludeBaseTypes();
                showBaseTypesControl.textContent = type.includeBaseTypes ? "Exclude Base Types" : "Include Base Types";
                type.controller._renderFieldList(type, fieldListContainer);
            });
            typeContainer.querySelector(".extend").addEventListener("click", function() {
                var type = typeContainer.currentType;
                UserDbgObjectExtensions.Create(type.type(), type);
            });
        }
        typeContainer.currentType = type;
        var filterTextBox = typeContainer.firstChild;
        var showBaseTypesControl = filterTextBox.nextSibling;
        var newExtensionButton = showBaseTypesControl.nextSibling;
        var actionContainer = newExtensionButton.nextSibling;
        var fieldListContainer = actionContainer.nextSibling;

        if (!type.requiresRendering()) {
            typeContainer.style.display = "none";
            return Promise.resolve(null);
        }

        var that = this;
        return type.prepareForRendering()
        .then(function () {
            if (type.isTypeInvalid) {
                typeContainer.classList.add("invalid-type");
            } else {
                typeContainer.classList.remove("invalid-type");
            }

            if (!type.isExpanded()) {
                typeContainer.classList.add("collapsed");
            } else {
                typeContainer.classList.remove("collapsed");
                filterTextBox.value = type.searchQuery;

                if (type.hasBaseTypes()) {
                    showBaseTypesControl.textContent = type.includeBaseTypes ? "Exclude Base Types" : "Include Base Types";
                    showBaseTypesControl.style.display = "";
                } else {
                    showBaseTypesControl.style.display = "none";
                }
            }

            if ((type.parentField != null) && type.parentField.returnsArray() && that.allowFieldRendering()) {
                return type.parentField.getNestedField(that.dbgObject)
                .then(function (arrayToRender) {
                    // Only add array item fields if they haven't already been added.
                    if (!type.backingTypes[0].hasArrayItemField()) {
                        if (arrayToRender.length > 0) {
                            arrayToRender.forEach(function (entry, index) {
                                var arrayItemField = new TypeExplorerField("[" + index + "]", type.backingTypes[0].type.nonArrayType(), function() { return entry; }, type.backingTypes[0], "arrayItemFields");
                                type.backingTypes[0].arrayItemFields.push(arrayItemField);
                            });
                        }
                    }
                });
            } else {
                return that._renderActions(type, actionContainer);
            }
        })
        .then(function () {
            return that._renderFieldList(type, fieldListContainer);
        })
        .then(function() {
            typeContainer.style.display = "";
            if (type.isExpanded() && changeFocus) {
                filterTextBox.focus();
            }
        })
    }

    TypeExplorerController.prototype._renderActions = function(type, actionsContainer) {
        if (!this.allowFieldRendering()) {
            return;
        }

        actionsContainer.innerHTML = "";
        var objectToRender = null;
        if (type.parentField != null) {
            objectToRender = type.parentField.getNestedField(this.dbgObject);
        } else {
            objectToRender = this.dbgObject;
        }
        var that = this;
        return DbgObject.render(objectToRender, actionsContainer, function (dbgObject) {
            return dbgObject.actions()
            .then(function (actions) {
                var result = document.createElement("span");

                actions.forEach(function (action) { 
                    if (typeof action.action == "function") {
                        var button = document.createElement("button");
                        button.className = "action-button";
                        button.textContent = action.description;
                        button.addEventListener("click", function () {
                            Promise.resolve(null)
                            .then(action.action)
                            .then(null, function () { })
                            .then(function () {
                                that.requestRerender(/*changeFocus*/false);
                            })
                        });
                        result.appendChild(button);
                        result.appendChild(document.createTextNode(" "));
                    } else if (typeof action.action == "string") {
                        var link = document.createElement("a");
                        link.className = "action-button";
                        link.href = action.action;
                        if (typeof action.target == "string") {
                            link.target = action.target;
                        }
                        link.textContent = action.description;
                        result.appendChild(link);
                        result.appendChild(document.createTextNode(" "));
                    }
                })

                return result;
            })
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

        var existingFields = Array.prototype.slice.call(fieldsContainer.childNodes).filter(function (x) { return x.tagName == "DIV"; });
        var existingFieldIndex = 0;
        function getNextFieldContainer() {
            var fieldContainer = null;
            if (existingFieldIndex < existingFields.length) {
                fieldContainer = existingFields[existingFieldIndex++];
                fieldContainer.style.display = "";
            } else {
                fieldContainer = document.createElement("div");
                fieldsContainer.appendChild(fieldContainer);
            }
            return fieldContainer;
        }

        function hideExistingFields(existingFields, existingFieldIndex) {
            while (existingFieldIndex < existingFields.length) {
                var container = existingFields[existingFieldIndex];
                container.style.display = "none";
                ++existingFieldIndex;
            }
        }

        if (type.hasArrayItemField()) {
            var arrayItemFields = type.getArrayItemFieldsToRender();

            // Find any collisions in the fields.
            var arrayItemFieldCollisions = findFieldNameCollisions(arrayItemFields, type);

            return Promise.map(arrayItemFields, function (arrayItemField) {
                return that._renderField(arrayItemField, type, getNextFieldContainer(), arrayItemFieldCollisions);
            })
            .then(function () {
                hideExistingFields(existingFields, existingFieldIndex);
            })
        } else {
            var perInstanceFields = type.getPerInstanceFieldsToRender();
            var fields = type.getFieldsToRender();
            var extendedFields = type.getExtendedFieldsToRender();
            var arrayFields = type.getArrayFieldsToRender();
            var descriptions = type.getDescriptionsToRender();
            extendedFields = perInstanceFields.concat(extendedFields).concat(arrayFields).concat(descriptions);

            // Find any collisions in the fields.
            var fieldCollisions = findFieldNameCollisions(fields, type);
            var extendedFieldCollisions = findFieldNameCollisions(extendedFields, type);
    
            return Promise.map(extendedFields, function (extendedField) {
                return that._renderField(extendedField, type, getNextFieldContainer(), extendedFieldCollisions);
            })
            .then(function() {
                var hr = Array.prototype.slice.call(fieldsContainer.childNodes).filter(function (x) { return x.tagName == "HR"; }).pop();
                if (!hr) {
                    hr = document.createElement("hr");
                    fieldsContainer.appendChild(hr);
                }
    
                if (extendedFields.length > 0 && type.isExpanded()) {
                    if (existingFieldIndex < existingFields.length) {
                        fieldsContainer.insertBefore(hr, existingFields[existingFieldIndex]);
                    } else {
                        fieldsContainer.appendChild(hr);
                    }
                    hr.style.display = "";
                } else {
                    hr.style.display = "none";
                }
    
                return Promise.map(fields, function (field) {
                    return that._renderField(field, type, getNextFieldContainer(), fieldCollisions);
                })
            })
            .then(function () {
                hideExistingFields(existingFields, existingFieldIndex);
            })
        }
    }

    TypeExplorerController.prototype._renderField = function (field, renderingType, fieldContainer, nameCollisions) {
        if (!fieldContainer.currentField) {
            fieldContainer.innerHTML = [
                "<label>",
                    "<input type=\"checkbox\">",
                    "<span class=\"field-name\"></span>",
                    "<span class=\"field-type\"></span>",
                    "<button class=\"small-button edit-button\">Edit</button>",
                    "<button class=\"small-button delete-button\">Delete</button>",
                    "<div class=\"rendering\"></div>",
                "</label>",
                "<div class=\"subfields\"></div>"
            ].join("");

            if (!this.allowFieldSelection()) {
                fieldContainer.querySelector("input").style.display = "none";
            }

            fieldContainer.querySelector("input").addEventListener("change", function () {
                fieldContainer.currentField.setIsEnabled(input.checked);
            });
            fieldContainer.querySelector(this.allowFieldSelection() ? ".field-type" : "label").addEventListener("click", function(e) {
                if (fieldContainer.querySelector(".rendering").contains(e.target)) {
                    e.preventDefault();
                    return;
                }

                var field = fieldContainer.currentField;
                if (field.childType != null) {
                    e.preventDefault();
                    field.childType.toggleExpansion();
                    subFieldsContainer.classList.toggle("collapsed");
                    field.parentType.aggregateType.controller._renderType(field.childType, subFieldsContainer, /*changeFocus*/true);
                }
            });
            fieldContainer.querySelector(".edit-button").addEventListener("click", function(e) {
                fieldContainer.currentField.beginEditing();
                e.stopPropagation();
                e.preventDefault();
            });
            fieldContainer.querySelector(".delete-button").addEventListener("click", function(e) {
                fieldContainer.currentField.delete();
                e.stopPropagation();
                e.preventDefault();
            });

            if (!this.allowFieldRendering()) {
                fieldContainer.querySelector(".rendering").style.display = "none";
            }
        }

        fieldContainer.currentField = field;
        var label = fieldContainer.firstChild;
        var subFieldsContainer = label.nextSibling;
        var input = label.firstChild;
        var fieldNameContainer = input.nextSibling;
        var fieldTypeContainer = fieldNameContainer.nextSibling;
        var editButton = fieldTypeContainer.nextSibling;
        var deleteButton = editButton.nextSibling;
        var rendering = deleteButton.nextSibling;

        var currentType = field.parentType;
        var areAllTypesExpanded = true;
        while (areAllTypesExpanded && currentType != null) {
            areAllTypesExpanded = currentType.isExpanded;
            currentType = currentType.aggregateType.parentField != null ? currentType.aggregateType.parentField.parentType : null;
        }

        input.checked = field.isEnabled;

        var currentField = field;
        var names = [field.name];
        while (currentField.parentType.aggregateType != renderingType) {
            currentField = currentField.parentType.aggregateType.parentField;
            names.push(currentField.name);
        }
        if (currentField.name in nameCollisions) {
            names[names.length - 1] = (currentField.parentType.type.name()) + "::" + names[names.length - 1];
        }

        fieldNameContainer.textContent = names.reverse().join(".");
        
        var fieldType = field.getChildType();
        if (fieldType != null) {
            if (areAllTypesExpanded) {
                fieldTypeContainer.textContent = fieldType.fullName() + (field.isUserDefinedArray() ? "[]" : "");
                fieldTypeContainer.style.display = "";
            } else {
                fieldTypeContainer.style.display = "none";
            }
            label.title = fieldType.qualifiedName() + " " + field.name;
        } else {
            label.title = field.name;
            fieldTypeContainer.style.display = "none";
        }

        editButton.style.display = field.isEditable() ? "" : "none";
        deleteButton.style.display = field.canBeDeleted() ? "" : "none";

        var renderingPromise = Promise.resolve(null);
        if (this.allowFieldRendering()) {
            rendering.innerHTML = "<span></span>";
            renderingPromise = DbgObject.render(field.getNestedField(this.dbgObject), rendering.firstChild, function (dbgObject) {
                return dbgObject.desc();
            })
        }

        if (field.childType == null || !areAllTypesExpanded) {
            subFieldsContainer.style.display = "none";
            return renderingPromise;
        }

        var that = this;
        return renderingPromise.then(function() {
            return that._renderType(field.childType, subFieldsContainer, /*changeFocus*/false);
        })
    }

    function create(dbgObject, options) {
        return new TypeExplorerController(dbgObject, options);
    }

    TypeExplorer = {
        Create: create
    };
});
