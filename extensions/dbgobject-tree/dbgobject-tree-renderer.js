//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

(function() {

    // TreeRenderer combines a TreeReader and a DbgObjectRenderer to render a tree of DbgObjects or native JS objects.
    function TreeRenderer(previousReader, renderer) {
        this.previousReader = previousReader;
        this.renderer = renderer;
    }

    TreeRenderer.prototype._wrap = function (parent, node) {
        var object = this.previousReader.getObject(node);

        var result = {
            parentNode: parent,
            previousNode: node,
            errors: [],
            childrenPromise: undefined,
            lastRepresentation: null,
            isDuplicate: false,
            root: null
        };

        if (parent == null) {
            result.root = result;
            result.dbgObjectTreeMap = new Map();
            result.lastEmphasis = null;
        } else {
            result.root = parent.root;
        }

        if (object instanceof DbgObject) {
            // Check if it's a duplicate.
            var ptr = object.ptr();
            if (!result.root.dbgObjectTreeMap.has(ptr)) {
                result.root.dbgObjectTreeMap.set(ptr, result);
            } else {
                result.isDuplicate = true;
            }
        }

        return result;
    }

    TreeRenderer.prototype.createRoot = function(object) {
        var that = this;
        return this.previousReader.createRoot(object)
        .then(function (node) {
            return that._wrap(null, node);
        });
    }

    TreeRenderer.prototype.getObject = function(node) {
        return this.previousReader.getObject(node.previousNode);
    }

    TreeRenderer.prototype.getChildren = function(node) {
        if (node.childrenPromise === undefined) {
            if (node.isDuplicate) {
                node.childrenPromise = Promise.resolve([]);
            } else {
                var that = this;
                node.childrenPromise = Promise.map(
                    this.previousReader.getChildren(node.previousNode, node.errors),
                    function (childNode) {
                        return that._wrap(node, childNode);
                    }
                );
            }
        }
        return node.childrenPromise;
    }

    TreeRenderer.prototype.createRepresentation = function(node) {
        var object = this.getObject(node);
        var that = this;
        return this.renderer.createRepresentation(
            object,
            node.parentNode != null ? this.getObject(node.parentNode) : null,
            node.errors,
            /*includeInspector*/!node.isDuplicate
        )
        .then(function (container) {
            node.lastRepresentation = container;
            if (node.isDuplicate) {
                container.style.color = "#aaa";
                var duplicateElement = document.createElement("div");
                duplicateElement.textContent = "(DUPLICATE)";
                container.insertBefore(duplicateElement, container.firstChild);
                container.style.cursor = "pointer";
                container.addEventListener("click", function() {
                    that.emphasizeDbgObject(object.ptr(), node.root);
                })
            } else if (node.root.lastEmphasis != null && node.root.lastEmphasis == object.ptr()) {
                container.classList.add("emphasized-node");
            }

            if (object instanceof DbgObject) {
                return container;
            } else {
                return container;
            }
        })
    }

    TreeRenderer.prototype.getLastRepresentation = function(node) {
        return node.lastRepresentation;
    }

    function isVisible(node) {
        var rect = node.getBoundingClientRect();
        var x = rect.left;
        var y = rect.top;
        var method = (document.elementsFromPoint || document.msElementsFromPoint).bind(document);
        var nodeList = method(x, y);
        return nodeList != null && Array.from(nodeList).indexOf(node) >= 0;
    }

    TreeRenderer.prototype.emphasizeDbgObject = function(dbgObjectPtr, root) {
        if (!root.dbgObjectTreeMap.has(dbgObjectPtr)) {
            // DbgObject isn't in this tree.
            return false;
        }
        
        var element = root.dbgObjectTreeMap.get(dbgObjectPtr).lastRepresentation;
        if (element == null) {
            // It hasn't been rendered yet.
            return false;
        }

        if (root.lastEmphasis != null) {
            root.dbgObjectTreeMap.get(root.lastEmphasis).lastRepresentation.classList.remove("emphasized-node");
        }
        root.lastEmphasis = dbgObjectPtr;
        element.classList.add("emphasized-node");

        if (!isVisible(element)) {
            element.scrollIntoView();
        }

        return true;
    }

    DbgObjectTree.DbgObjectTreeRenderer = TreeRenderer;
})();