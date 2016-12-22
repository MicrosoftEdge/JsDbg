"use strict";

(function() {

    // TreeRenderer combines a TreeReader and a DbgObjectRenderer to render a tree of DbgObjects or native JS objects.
    function TreeRenderer(previousReader, renderer) {
        this.previousReader = previousReader;
        this.renderer = renderer;
    }

    TreeRenderer.prototype._wrap = function (parent, node) {
        var isDuplicate = false;
        var object = this.previousReader.getObject(node);
        if (object instanceof DbgObject && parent != null) {
            // Check if it's a duplicate.
            var ptr = object.ptr();
            isDuplicate = parent.allDbgObjects.has(ptr);
            if (!isDuplicate) {
                parent.allDbgObjects.add(ptr);
            }
        }

        return {
            parentNode: parent,
            previousNode: node,
            errors: [],
            isDuplicate: isDuplicate,
            childrenPromise: undefined,
            allDbgObjects: parent == null ? new Set() : parent.allDbgObjects
        };
    }

    TreeRenderer.prototype.createRoot = function(object) {
        console.log("TreeRenderer.createRoot");
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
                node.childrenPromise = Promise.as([]);
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
            if (node.isDuplicate) {
                container.style.color = "#aaa";
                container.insertBefore(document.createTextNode("(DUPLICATE) "), container.firstChild);
            }
            if (object instanceof DbgObject) {
                if (!node.isDuplicate) {
                    container.setAttribute("data-object-address", object.pointerValue().toString(16));
                }
                return container;
            } else {
                return container;
            }
        })
    }

    DbgObjectTree.DbgObjectTreeRenderer = TreeRenderer;
})();