"use strict";

// fieldsupport.js
// Peter Salas
//

var FieldSupport = (function() {
    function CheckedFields() {
        this.checkedFields = {};
    }

    CheckedFields.prototype.markEnabled = function (module, type, path) {
        var key = module + "!" + type;
        if (!(key in this.checkedFields)) {
            this.checkedFields[key] = [path];
        } else {
            var paths = this._removePath(this.checkedFields[key], path);
            paths.push(path);
            this.checkedFields[key] = paths;
        }
        this.serialize();
    }

    CheckedFields.prototype.markDisabled = function (module, type, path) {
        var key = module + "!" + type;
        if (!(key in this.checkedFields)) {
            return;
        }
        this.checkedFields[key] = this._removePath(this.checkedFields[key], path);
        this.serialize();
    }

    CheckedFields.prototype.getEnabledPaths = function (module, type) {
        var key = module + "!" + type;
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
        window.sessionStorage.setItem('FieldSupport-CheckedFields', JSON.stringify(this.checkedFields));
    }

    CheckedFields.prototype.deserialize = function() {
        var data = window.sessionStorage.getItem('FieldSupport-CheckedFields');
        if (data) {
            this.checkedFields = JSON.parse(data);
        }
    }

    function FieldSupportController(container, updateTreeUI) {
        this.knownTypes = [];
        this.typeListContainer = document.createElement("div");
        this.updateTreeUI = updateTreeUI;
        this.isUpdateQueued = false;
        this.checkedFields = new CheckedFields();
        this.checkedFields.deserialize();

        var that = this;
        this.activeFieldGetterListener = function() {
            that.queueUpdate();
        };

        var isHidden = window.sessionStorage.getItem("FieldSupport-HideTypes") == "true";
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
            window.sessionStorage.setItem("FieldSupport-HideTypes", isHidden);
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

    FieldSupportController.prototype.addType = function (module, typename, isBaseType) {
        for (var i = 0; i < this.knownTypes.length; ++i) {
            var knownType = this.knownTypes[i];
            if (knownType.module == module && knownType.typename == typename) {
                if (!isBaseType) {
                    // We may have rendered it as a base type before.  If so, remove the class.
                    this.typeListContainer.childNodes[i].classList.remove("base-type");
                }
                return;
            }
        }

        // A type we haven't seen before.
        var newTypeContainer = document.createElement("div");
        if (isBaseType) {
            newTypeContainer.classList.add("base-type");
        }

        var that = this;
        var dbgObject = new DbgObject(module, typename, 0);
        var explorer = TypeExplorer.Create(dbgObject, {
            onFieldChange: this.onFieldChange.bind(this)
        });

        // Put it into the list, re-sort, and mirror the position in the DOM.
        var newType = {
            module: module, 
            typename: typename,
            explorer: explorer
        };
        this.knownTypes.push(newType);
        this.knownTypes.sort(function (a, b) {
            return a.typename.localeCompare(b.typename);
        });
        var index = this.knownTypes.indexOf(newType);
        if (index < this.typeListContainer.childNodes.length) {
            var nodeAfter = this.typeListContainer.childNodes[index];
            this.typeListContainer.insertBefore(newTypeContainer, nodeAfter);
        } else {
            this.typeListContainer.appendChild(newTypeContainer);
        }
        
        var that = this;
        var enabledPaths = this.checkedFields.getEnabledPaths(module, typename);
        return Promise.map(enabledPaths, explorer.enableField.bind(explorer))
        .then(function () {
            return that.renderRootType(newType, newTypeContainer);
        });
    }

    FieldSupportController.prototype.renderRootType = function(rootType, typeContainer) {
        var that = this;
        typeContainer.innerHTML = "";
        typeContainer.classList.add("type-container");
        typeContainer.classList.add("root-collapsed");

        var typeName = document.createElement("div");
        typeName.classList.add("type-name");
        typeName.appendChild(document.createTextNode(rootType.typename));
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

    FieldSupportController.prototype.onFieldChange = function(rootDbgObject, path, changeType, dbgObjectRenderer, fieldGetter) {
        if (changeType == "enabled") {
            DbgObjectTree.AddField(rootDbgObject.module, rootDbgObject.typeDescription(), dbgObjectRenderer);
            this.checkedFields.markEnabled(rootDbgObject.module, rootDbgObject.typeDescription(), path);
            UserEditableFunctions.AddListener(fieldGetter, this.activeFieldGetterListener);
            this.queueUpdate();
        } else if (changeType == "disabled") {
            DbgObjectTree.RemoveField(rootDbgObject.module, rootDbgObject.typeDescription(), dbgObjectRenderer);
            UserEditableFunctions.RemoveListener(fieldGetter, this.activeFieldGetterListener);
            this.checkedFields.markDisabled(rootDbgObject.module, rootDbgObject.typeDescription(), path);
            this.queueUpdate();
        }
    }

    FieldSupportController.prototype.queueUpdate = function() {
        if (this.isUpdateQueued) {
            return;
        } else {
            var that = this;
            window.requestAnimationFrame(function() {
                that.updateTreeUI();
                that.isUpdateQueued = false;
            })
        }
    }

    function initialize(unused1, unused2, defaultTypes, updateUI, container) {
        var fieldSupportController = new FieldSupportController(container, updateUI);
        DbgObjectTree.AddTypeNotifier(function (module, typename, isBaseType) {
            fieldSupportController.addType(module, typename, isBaseType);
        });

        if (Array.isArray(defaultTypes)) {
            defaultTypes.forEach(function (type) {
                fieldSupportController.addType(type.module, type.type, /*isBaseType*/false);
            });
        }
    }

    return {
        Initialize: initialize,
        RegisterTypeAlias: function() { }
    };
})();