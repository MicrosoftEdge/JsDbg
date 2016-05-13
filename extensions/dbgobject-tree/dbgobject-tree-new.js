"use strict";

var DbgObjectTreeNew = (function() {

    function create(name) {
        return new DbgObjectTree(name);
    }

    function map(root, f) {
        return mapHelper(root, f, null);
    }

    function mapHelper(root, f, parent) {
        return Promise.as(f(root))
        .then(function (newRoot) {
            var childrenPromise = null;
            function getChildren() {
                if (childrenPromise == null) {
                    childrenPromise = Promise.map(newRoot.getChildren(), function (child) { return map(child, f, newRoot); });
                }

                return childrenPromise;
            }

            return Object.create(newRoot, {
                parent: {
                    value: parent,
                },
                getChildren: {
                    value: getChildren
                }
            })
        });
    }

    function DbgObjectTree(name) {
        this.name = name;
        this.typeExtension = new DbgObject.TypeExtension();
        this.nextId = 1;
    }

    DbgObjectTree.prototype.createTree = function(rootObject) {
        return new DbgObjectTreeNode(rootObject, null, this);
    }

    DbgObjectTree.prototype.addChildren = function (module, typename, getChildren) {
        var name = (this.nextId++).toString();
        this.typeExtension.addExtension(module, typename, name, new ChildExpansion(name, getChildren));
        return name;
    }

    DbgObjectTree.prototype.removeChildren = function (module, typename, name) {
        this.typeExtension.removeExtension(module, typename, name);
    }

    DbgObjectTree.prototype._getChildren = function(node) {
        var tree = this;
        return this.typeExtension.getAllExtensionsIncludingBaseTypes(node.object)
        .then(function (results) {
            // Evaluate each of the child expansions.
            return Promise.map(results, function (x) {
                return x.extension.getChildren(node.object)
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
                childrenPromise = this.tree._getChildren(this);
            }

            if ((typeof this.object.getChildren) == (typeof function() {})) {
                childrenPromise = childrenPromise
                .then(function (children) {
                    var newChildren = that.object.getChildren();
                    return children.concat(newChildren);
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
    }
})();