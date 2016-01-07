"use strict";

// fieldsupport.js
// Peter Salas
//

var FieldSupport = (function() {
    function FieldSupportController(container, updateTreeUI) {
        this.knownTypes = [];
        this.typeListContainer = document.createElement("div");
        this.updateTreeUI = updateTreeUI;
        this.isUpdateQueued = false;

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
        var that = this;
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
            onFieldChange: function(path, changeType, renderer) {
                return that.onFieldChange(dbgObject, path, changeType, renderer);
            }
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
        
        return this.renderRootType(newType, newTypeContainer);
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

        var fieldsContainer = document.createElement("div");
        fieldsContainer.classList.add("fields-container");
        typeContainer.appendChild(fieldsContainer);

        typeContainer.style.display = "none";
        return rootType.explorer.render(fieldsContainer)
        .then(function () {
            typeContainer.style.display = "";
        })
    }

    FieldSupportController.prototype.onFieldChange = function(rootDbgObject, path, changeType, dbgObjectRenderer) {
        if (changeType == "enabled") {
            DbgObjectTree.AddField(rootDbgObject.module, rootDbgObject.typeDescription(), dbgObjectRenderer);
            this.queueUpdate();
        } else if (changeType == "disabled") {
            DbgObjectTree.RemoveField(rootDbgObject.module, rootDbgObject.typeDescription(), dbgObjectRenderer);
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