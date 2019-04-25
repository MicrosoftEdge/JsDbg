//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var FieldSelector = (function() {
    function CheckedFields() {
        this.checkedFields = {};
    }

    CheckedFields.prototype.markEnabled = function (type, path) {
        var key = type.nonArrayComparisonName();
        if (!(key in this.checkedFields)) {
            this.checkedFields[key] = [path];
        } else {
            var paths = this._removePath(this.checkedFields[key], path);
            paths.push(path);
            this.checkedFields[key] = paths;
        }
        this.serialize();
    }

    CheckedFields.prototype.markDisabled = function (type, path) {
        var key = type.nonArrayComparisonName();
        if (!(key in this.checkedFields)) {
            return;
        }
        this.checkedFields[key] = this._removePath(this.checkedFields[key], path);
        this.serialize();
    }

    CheckedFields.prototype.getEnabledPaths = function (type) {
        var key = type.nonArrayComparisonName();
        if (!(key in this.checkedFields)) {
            return [];
        } else {
            return this.checkedFields[key];
        }
    }

    CheckedFields.prototype._removePath = function(paths, path) {
        return paths.filter(function (existingPath) {
            var areEqual = existingPath.length == path.length;
            for (var i = 0; i < path.length && areEqual; ++i) {
                areEqual = path[i] == existingPath[i];
            }
            return !areEqual;
        });
    }

    CheckedFields.prototype.serialize = function() {
        window.sessionStorage.setItem('FieldSelector-CheckedFields', JSON.stringify(this.checkedFields));
    }

    CheckedFields.prototype.deserialize = function() {
        var data = window.sessionStorage.getItem('FieldSelector-CheckedFields');
        if (data) {
            this.checkedFields = JSON.parse(data);
        }
    }

    function ActiveField(rootDbgObject, renderer) {
        this.rootDbgObject = rootDbgObject;
        this.renderer = renderer;
    }

    ActiveField.prototype.shouldBeApplied = function (dbgObject) {
        return dbgObject.type.equals(this.rootDbgObject.type);
    }

    ActiveField.prototype.apply = function(dbgObject, container) {
        return this.renderer(dbgObject, container);
    }

    function FieldSelectorController(container, updateTreeUI) {
        this.knownTypes = [];
        this.activeFields = [];
        this.typeListContainer = document.createElement("div");
        this.updateTreeUI = updateTreeUI;
        this.dbgObjectUpdaterWeakMap = new WeakMap();
        this.updatedDbgObjects = [];
        this.checkedFields = new CheckedFields();
        this.checkedFields.deserialize();

        var that = this;
        this.activeFieldGetterListener = function(updatedDbgObject) {
            that._queueUpdate(updatedDbgObject);
        };

        var isHidden = window.sessionStorage.getItem("FieldSelector-HideTypes") == "true";
        var showHide = document.createElement("button");
        showHide.classList.add("small-button");
        showHide.classList.add("show-hide");
        container.appendChild(showHide);
        var updateIsHidden = function() {
            if (isHidden) {
                container.classList.add("hidden");
                showHide.textContent = "Show";
            } else {
                container.classList.remove("hidden");
                showHide.textContent = "Hide";
            }
            window.sessionStorage.setItem("FieldSelector-HideTypes", isHidden);
        }
        showHide.addEventListener("click", function() {
            isHidden = !isHidden;
            updateIsHidden();
        });
        updateIsHidden();

        var instructionText = document.createElement("div");
        instructionText.classList.add("instructions");
        container.appendChild(instructionText);
        instructionText.textContent = "To annotate the tree with additional data, use the types below to select properties to render on the tree.";


        var showAllTypes = document.createElement("button");
        showAllTypes.textContent = "Show More Types";
        showAllTypes.classList.add("small-button");
        showAllTypes.classList.add("more-types");
        container.appendChild(showAllTypes);
        showAllTypes.addEventListener("click", function () {
            that.typeListContainer.classList.toggle("show-all-types");
            showAllTypes.textContent = that.typeListContainer.classList.contains("show-all-types") ? "Show Fewer Types" : "Show More Types";
        });

        container.appendChild(this.typeListContainer);

        container.classList.add("field-selection");
    }

    FieldSelectorController.prototype.addType = function (type, isBaseType) {
        for (var i = 0; i < this.knownTypes.length; ++i) {
            var knownType = this.knownTypes[i];
            if (knownType.type.equals(type)) {
                if (!isBaseType) {
                    // We may have rendered it as a base type before.  If so, remove the class.
                    this.typeListContainer.childNodes[i].classList.remove("base-type");
                }
                return Promise.resolve(false);
            }
        }

        // A type we haven't seen before.
        var newTypeContainer = document.createElement("div");
        if (isBaseType) {
            newTypeContainer.classList.add("base-type");
        }

        var that = this;
        var dbgObject = DbgObject.create(type, 0);
        var explorer = TypeExplorer.Create(dbgObject, {
            onFieldChange: this._onFieldChange.bind(this)
        });

        // Put it into the list, re-sort, and mirror the position in the DOM.
        var newType = {
            type: type,
            explorer: explorer
        };
        this.knownTypes.push(newType);
        this.knownTypes.sort(function (a, b) {
            return a.type.name().localeCompare(b.type.name());
        });
        var index = this.knownTypes.indexOf(newType);
        if (index < this.typeListContainer.childNodes.length) {
            var nodeAfter = this.typeListContainer.childNodes[index];
            this.typeListContainer.insertBefore(newTypeContainer, nodeAfter);
        } else {
            this.typeListContainer.appendChild(newTypeContainer);
        }
        
        var that = this;
        var enabledPaths = this.checkedFields.getEnabledPaths(type);
        return Promise.map(enabledPaths, function (path) { return explorer.enableField(path, /*context*/true); })
        .then(function () {
            return that._renderRootType(newType, newTypeContainer);
        });
    }

    FieldSelectorController.prototype.includeDbgObjectTypes = function(dbgObject) {
        var that = this;
        return this.addType(dbgObject.type, /*isBaseType*/false)
        .then(function (alreadyPresent) {
            if (!alreadyPresent) {
                // The type wasn't there before.  Add the base types as well.
                return Promise.map(
                    dbgObject.baseTypes(),
                    function (dbgObject) {
                        return that.addType(dbgObject.type, /*isBaseType*/true);
                    }
                );
            }
        })
    }

    FieldSelectorController.prototype.renderFields = function(dbgObject, container) {
        if (this.activeFields.length > 0) {
            var that = this;
            var fieldsToApply = this.activeFields.slice();

            return dbgObject.baseTypes()
            .then(function (baseTypes) {
                baseTypes.unshift(dbgObject);

                function applyRemainingFieldsAndReturnContainer() {
                    if (fieldsToApply.length == 0) {
                        return container;
                    }

                    var fieldToApply = fieldsToApply.shift();
                    for (var i = 0; i < baseTypes.length; ++i) {
                        if (fieldToApply.shouldBeApplied(baseTypes[i])) {
                            return Promise.resolve(fieldToApply.apply(baseTypes[i], container))
                            .then(applyRemainingFieldsAndReturnContainer);
                        }
                    }

                    return applyRemainingFieldsAndReturnContainer();
                }

                return Promise.resolve(applyRemainingFieldsAndReturnContainer())
            });
        } else {
            return container;
        }
    }

    FieldSelectorController.prototype._renderRootType = function(rootType, typeContainer) {
        var that = this;
        typeContainer.innerHTML = "";
        typeContainer.classList.add("type-container");
        typeContainer.classList.add("root-collapsed");

        var typeName = document.createElement("div");
        typeName.classList.add("type-name");
        typeName.appendChild(document.createTextNode(rootType.type.name()));
        typeName.addEventListener("click", function () {
            rootType.explorer.toggleExpansion();
            typeContainer.classList.toggle("root-collapsed");
        })
        typeContainer.appendChild(typeName);

        var typeExplorerContainer = document.createElement("div");
        typeContainer.appendChild(typeExplorerContainer);

        typeContainer.style.display = "none";
        return rootType.explorer.render(typeExplorerContainer)
        .then(function () {
            typeContainer.style.display = "";
        })
    }

    FieldSelectorController.prototype._getFieldListener = function(rootDbgObject) {
        if (this.dbgObjectUpdaterWeakMap.has(rootDbgObject)) {
            return this.dbgObjectUpdaterWeakMap.get(rootDbgObject);
        } else {
            var that = this;
            var result = function() {
                that._queueUpdate(rootDbgObject);
            };
            this.dbgObjectUpdaterWeakMap.set(rootDbgObject, result);
            return result;
        }
    }

    FieldSelectorController.prototype._onFieldChange = function(rootDbgObject, field, enableFieldContext) {
        var that = this;
        if (field.isEnabled) {
            field.context.renderer = this._createRenderer(field);
            this.activeFields = this.activeFields.concat([new ActiveField(rootDbgObject, field.context.renderer)]);

            var listener = this._getFieldListener(rootDbgObject);
            field.allGetters.forEach(function (getter) {
                UserEditableFunctions.AddListener(getter, listener);
            });
            this.checkedFields.markEnabled(rootDbgObject.type, field.path);

            // When we're explicitly enabling a field we don't need to queue an update
            // because the request came from adding the type.
            if (enableFieldContext !== true) {
                this._queueUpdate(rootDbgObject);
            }
        } else if (field.context.renderer) {
            this.activeFields = this.activeFields.filter(function (af) { return af.renderer != field.context.renderer; });
            field.context.renderer = null;
            var listener = this._getFieldListener(rootDbgObject);
            field.allGetters.forEach(function (getter) {
                UserEditableFunctions.RemoveListener(getter, listener);
            });
            this.checkedFields.markDisabled(rootDbgObject.type, field.path);
            this._queueUpdate(rootDbgObject);
        }
    }

    function getDescs(obj) {
        return Promise.resolve()
        .then(function() {
            if (obj instanceof DbgObject) {
                if (obj.isNull()) {
                    return undefined;
                } else {
                    return DbgObjectInspector.Inspect(obj, obj.ptr());
                }
            } else if (Array.isArray(obj)) {
                if (obj.length == 0) {
                    return undefined;
                } else {
                    return Promise.map(obj, getDescs)
                    .then(function (array) {
                        return "[" + array.join(", ").toString() + "]";
                    });
                }
            } else {
                return obj;
            }
        });
    }

    FieldSelectorController.prototype._createRenderer = function(field) {
        function insertFieldList(names, container) {
            var fieldList = document.createElement("span");
            container.appendChild(fieldList);
            fieldList.textContent = names.join(".") + ":";
        }

        return function (dbgObject, element) {
            return Promise.resolve(null)
            .then(function() {
                var valueContainer = document.createElement("span");
                return DbgObject.render(
                    field.getter(dbgObject), 
                    valueContainer, 
                    function (dbgObject) {
                        if (dbgObject.type.isArray()) {
                            return dbgObject.array();
                        } else {
                            return dbgObject.desc().then(function (desc) {
                                return DbgObjectInspector.Inspect(dbgObject, desc);
                            })
                        }
                    },
                    element
                )
                .then(function (didRenderSomething) {
                    if (didRenderSomething) {
                        var fieldAndValue = document.createElement("span");
                        insertFieldList(field.names, fieldAndValue);
                        fieldAndValue.appendChild(valueContainer);
                        element.appendChild(fieldAndValue);
                    }
                })
            });
        }
    }

    FieldSelectorController.prototype._queueUpdate = function(updatedDbgObject) {
        if (this.updatedDbgObjects.length > 0) {
            var alreadyPresent = this.updatedDbgObjects.reduce(function (accumulator, currentValue) { return accumulator || updatedDbgObject == currentValue; }, false);
            if (!alreadyPresent) {
                this.updatedDbgObjects.push(updatedDbgObject);
            }
        } else {
            this.updatedDbgObjects.push(updatedDbgObject);
            var that = this;
            window.requestAnimationFrame(function() {
                that.updateTreeUI(that.updatedDbgObjects);
                that.updatedDbgObjects = [];
            })
        }
    }

    // FieldTreeReader augments a DbgObjectTree.DbgObjectTreeRenderer with fields selected from the field control.
    function FieldTreeReader(treeRenderer, fieldSupportController) {
        this.treeRenderer = treeRenderer;
        this.fieldSupportController = fieldSupportController;
    }

    FieldTreeReader.prototype.createRoot = function(object) {
        var that = this;
        return this.treeRenderer.createRoot(object)
        .then(function (root) {
            return that._notifyControllerOfDbgObjectTypes([object])
            .then(function() {
                return root;
            });
        })
    }

    FieldTreeReader.prototype.getObject = function(node) {
        return this.treeRenderer.getObject(node);
    }

    FieldTreeReader.prototype.getChildren = function(node) {
        var that = this;
        return this.treeRenderer.getChildren(node)
        .then(function (children) {
            return that._notifyControllerOfDbgObjectTypes(
                children.map(function (child) { return that.getObject(child); })
            )
            .then(function() {
                return children;
            });
        })
    }

    FieldTreeReader.prototype.createRepresentation = function(node) {
        var that = this;
        return this.treeRenderer.createRepresentation(node)
        .then(function (container) {
            var object = that.getObject(node);
            if (object instanceof DbgObject) {
                return that.fieldSupportController.renderFields(object, container);
            } else {
                return container;
            }
        })
    }

    FieldTreeReader.prototype._notifyControllerOfDbgObjectTypes = function(objects) {
        var that = this;
        return Promise.all(
            objects.map(function (object) {
                if (object instanceof DbgObject) {
                    return that.fieldSupportController.includeDbgObjectTypes(object);
                } else {
                    return true;
                }
            })
        );
    }

    FieldTreeReader.prototype.getTreeRenderer = function() {
        return this.treeRenderer;
    }

    FieldTreeReader.prototype.updateFields = function(treeRoot, updatedDbgObjects) {
        var that = this;

        var isAborted = false;
        var nodesDiscovered = 0;
        var nodesUpdated = 0;
        var messageProvider = function () { return nodesUpdated + "/" + nodesDiscovered + " items updated..."; };
        var abort = function() { isAborted = true; }
        JsDbgLoadingIndicator.AddMessageProvider(messageProvider, abort);

        var timer = new Timer("Update Fields");

        return this.getNodesToUpdate(treeRoot, updatedDbgObjects, function() {
            if (isAborted) {
                throw new Error("Tree update was cancelled.");
            }
            ++nodesDiscovered;
        })
        .then(function (nodesToUpdate) {
            timer.Mark("Finished finding nodes to update");
            return Promise.throttledMap(nodesToUpdate, function (node, i) {
                var lastRepresentation = that.treeRenderer.getLastRepresentation(node);
                return that.createRepresentation(node)
                .then(function (newRepresentation) {
                    if (isAborted) {
                        throw new Error("Tree update was cancelled.");
                    }
                    ++nodesUpdated;
                    // Don't actually replace it yet -- doing so would thrash the DOM while we're updating the rest of them.
                    // Instead, wait until they're all done and replace them en masse.
                    return function() {
                        lastRepresentation.parentNode.replaceChild(newRepresentation, lastRepresentation);
                    }
                })
            })
            .then(function (replaceFunctions) {
                replaceFunctions.forEach(function (f) { f(); });
                timer.Mark("Finished updating DOM");
            })
        })
        .finally(function () {
            JsDbgLoadingIndicator.RemoveMessageProvider(messageProvider);
        })
    }

    FieldTreeReader.prototype.getNodesToUpdate = function(subtreeRoot, updatedDbgObjects, notifyNodeFound) {
        var lastRepresentation = this.treeRenderer.getLastRepresentation(subtreeRoot);
        if (lastRepresentation == null || !document.documentElement.contains(lastRepresentation)) {
            return Promise.resolve([]);
        }

        var dbgObject = this.getObject(subtreeRoot);

        var requiresUpdatePromise;
        if (dbgObject instanceof DbgObject) {
            requiresUpdatePromise = Promise.all(updatedDbgObjects.map(function (updatedDbgObject) { return dbgObject.isType(updatedDbgObject.type); }))
            .then(function (requiresUpdateArray) {
                return requiresUpdateArray.reduce(function (accumulator, currentValue) { return accumulator || currentValue; }, false);
            })
        } else {
            requiresUpdatePromise = Promise.resolve(false);
        }

        var that = this;
        return requiresUpdatePromise
        .then(function (requiresUpdate) {
            if (requiresUpdate) {
                notifyNodeFound(subtreeRoot);
            }

            return Promise.throttledMap(that.treeRenderer.getChildren(subtreeRoot), function (child) { return that.getNodesToUpdate(child, updatedDbgObjects, notifyNodeFound); })
            .then(function (childNodesToUpdate) {
                // Flatten the child arrays into a single array.
                return childNodesToUpdate.reduce(function (accumulator, item) { return accumulator.concat(item); }, requiresUpdate ? [subtreeRoot] : []);
            })
        });
    }

    return {
        Create: function(container, updateUI) {
            return new FieldSelectorController(container, updateUI);
        },

        TreeReader: FieldTreeReader
    };
})();