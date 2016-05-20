"use strict";

var DbgObjectTree = (function() {

    function create(name) {
        return new DbgObjectTree(name);
    }

    function map(root, f) {
        return mapHelper(root, f, null);
    }

    function mapHelper(root, f, parent) {
        // Before giving the node to the mapping function, lazily apply the map to all the children as well.
        // If the mapping function wants to control the children, it can do so without having the map applied again.
        var childrenPromise = null;
        var rootWithMappedChildren = Object.create(root, {
            parent: {
                value: parent,
            },
            getChildren: {
                value: function() {
                    if (childrenPromise == null) {
                        childrenPromise = Promise.map(root.getChildren(), function (child) { return mapHelper(child, f, rootWithMappedChildren); });
                    }
                    return childrenPromise;
                }
            }
        });

        return Promise.as(f(rootWithMappedChildren))
        .then(function (mappedRoot) {
            function connectChildToParent(object) {
                return Object.create(object, { parent: { value: mappedRoot } });
            }

            function connectChildrenToParent() {
                return Object.create(mappedRoot, {
                    getChildren: {
                        value: function() {
                            return Promise.map(mappedRoot.getChildren(), connectChildToParent);
                        }
                    }
                });
            }

            if (mappedRoot == rootWithMappedChildren) {
                return mappedRoot;
            } else {
                // The children should point the to correct parent.
                return connectChildrenToParent();
            }
        })
    }

    function filter(root, f) {
        return filterNodes([root], f)
        .then(function (filteredNodes) {
            if (filteredNodes.length == 1) {
                return map(filteredNodes[0], applyFilterToPermittedNode(f));
            } else {
                return {
                    getObject: function() { return "Root"; },
                    getChildren: function() {
                        return Promise.map(filteredNodes, applyFilterToPermittedNode(f));
                    }
                }
            }
        })
    }

    function applyFilterToPermittedNode(f) {
        return function (node) {
            return Object.create(node, {
                getChildren: {
                    value: function() {
                        return filterNodes(node.getChildren(), f);
                    }
                }
            });
        }
    }

    function filterNodes(nodes, f) {
        return Promise.map(nodes, function (node) {
            return Promise.as(f(node))
            .then(function (isPermitted) {
                if (isPermitted) {
                    return [node];
                } else {
                    return filterNodes(node.getChildren(), f);
                }
            })
        })
        .then(function (arrayOfArrays) {
            return arrayOfArrays.reduce(function (a, b) { return a.concat(b); }, []);
        })
    }

    function DbgObjectTree(name) {
        this.name = name;
        this.typeExtension = new DbgObject.TypeExtension();
        this.nextId = 1;
    }

    DbgObjectTree.prototype.createTree = function(rootObject) {
        return new DbgObjectTreeNode(rootObject, null, this);
    }

    DbgObjectTree.prototype.filter = function(f) {
        var that = this;
        return Object.create(this, {
            createTree: {
                value: function (rootObject) {
                    return filter(that.createTree(rootObject), f);
                }
            }
        })
    }

    DbgObjectTree.prototype.map = function(f) {
        var that = this;
        return Object.create(this, {
            createTree: {
                value: function (rootObject) {
                    return map(that.createTree(rootObject), f);
                }
            }
        })
    }

    DbgObjectTree.prototype.addChildren = function (module, typename, getChildren) {
        var name = (this.nextId++).toString();
        this.typeExtension.addExtension(module, typename, name, new ChildExpansion(name, getChildren));
        return name;
    }

    DbgObjectTree.prototype.removeChildren = function (module, typename, name) {
        this.typeExtension.removeExtension(module, typename, name);
    }

    DbgObjectTree.prototype._getDbgObjectChildren = function(node) {
        var tree = this;
        return this.typeExtension.getAllExtensionsIncludingBaseTypes(node.object)
        .then(function (results) {
            // Evaluate each of the child expansions.
            return Promise.map(results, function (x) {
                return Promise.as(null)
                .then(function() {
                    return x.extension.getChildren(node.object);
                })
                .then(null, function (error) {
                    node._childrenErrors.push(error);
                    return [];
                })
            })
        })
        .then(function (childrenLists) {
            // Flatten the list.
            return childrenLists.reduce(function (a, b) { return a.concat(b); }, []);
        })
        .then(function (children) {
            return children.map(function (child) { return new DbgObjectTreeNode(child, node, tree); });
        })
    }

    function ChildExpansion(name, getChildren) {
        this.name = name;
        this.getChildren = getChildren;
    }

    ChildExpansion.prototype.bind = function(dbgObject) {
        var that = this;
        var result = function() {
            return that.getChildren(dbgObject);
        }
        result.expansionName = this.name;
        return result;
    }

    function DbgObjectTreeNode(nodeObject, parent, tree) {
        this.object = nodeObject;
        this.tree = tree;
        this.parent = parent;
        this._childrenPromise = null;
        this._childrenErrors = [];

        if (this.parent != null) {
            this.allDbgObjects = this.parent.allDbgObjects;
        } else {
            this.allDbgObjects = new Set();
        }

        this._isDuplicate = false;
        if (nodeObject instanceof DbgObject) {
            if (this.allDbgObjects.has(nodeObject.ptr())) {
                this._isDuplicate = true;
            } else {
                this.allDbgObjects.add(nodeObject.ptr());
            }
        }
    }

    DbgObjectTreeNode.prototype.getObject = function() {
        return this.object;
    }

    DbgObjectTreeNode.prototype.isDuplicate = function() {
        return this._isDuplicate;
    }

    DbgObjectTreeNode.prototype.getChildrenErrors = function() {
        return this._childrenErrors.slice(0);
    }

    DbgObjectTreeNode.prototype.getChildren = function() {
        if (this._childrenPromise == null) {
            var that = this;
            var childrenPromise = Promise.as([]);

            if (this.isDuplicate()) {
                return childrenPromise;
            }

            if (this.object instanceof DbgObject) {
                // Get the all the registered children expansions.
                childrenPromise = this.tree._getDbgObjectChildren(this);
            }

            if ((typeof this.object.getChildren) == (typeof function() {})) {
                childrenPromise = childrenPromise
                .then(function (children) {
                    return Promise.as(that.object.getChildren())
                    .then(function (additionalChildren) {
                        return children.concat(additionalChildren);
                    })
                })
                .then(function (childObjects) {
                    return childObjects.map(function (childObject) {
                        return new DbgObjectTreeNode(childObject, that, that.tree);
                    })
                })
            }
            this._childrenPromise = childrenPromise;
        }
        
        return this._childrenPromise;
    }

    return {
        Create: create,
        Map: map,
        Filter: filter,
    }
})();