//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

(function() {

    // Readers:
    // createRoot(object) -> returns a promise to the root node from a given object
    // getObject() -> returns the object associated with the node
    // getChildren(node) -> returns a promise to an array of child nodes

    function ObjectTreeReader() {
    }

    ObjectTreeReader.prototype.createRoot = function (object) {
        return Promise.resolve(object);
    }

    ObjectTreeReader.prototype.getObject = function (node) {
        return node;
    }

    ObjectTreeReader.prototype.getChildren = function (node, errors) {
        if ((typeof node.getChildren) == "function") {
            return Promise.resolve(node.getChildren())
            .catch(function (error) { 
                errors.push(error);
                return [];
            });
        } else {
            return Promise.resolve([]);
        }
    }

    function MappedNode(previousNode, object) {
        this.previousNode = previousNode;
        this.object = object;
    }

    function MapTreeReader(previousReader, mapper) {
        this.previousReader = previousReader;
        this.mapper = mapper;
    }

    MapTreeReader.prototype._applyMapToPreviousNode = function(previousNode) {
        return Promise.resolve(this.mapper(this.previousReader.getObject(previousNode)))
        .then(function (mappedObject) {
            return new MappedNode(previousNode, mappedObject);
        });
    }

    MapTreeReader.prototype.createRoot = function(object) {
        return this.previousReader.createRoot(object)
        .then(this._applyMapToPreviousNode.bind(this));
    }

    MapTreeReader.prototype.getObject = function(node) {
        return node.object;
    }

    MapTreeReader.prototype.getChildren = function(node, errors) {
        return Promise.map(this.previousReader.getChildren(node.previousNode), this._applyMapToPreviousNode.bind(this));
    }

    function FilterTreeReader(previousReader, filter, filterEntireSubtree) {
        this.previousReader = previousReader;
        this.filter = filter;
        this.filterEntireSubtree = filterEntireSubtree;
    }

    FilterTreeReader.prototype._shouldIncludeNode = function(node) {
        return Promise.resolve(this.filter(this.previousReader.getObject(node)));
    }

    FilterTreeReader.prototype._getFilteredDescendents = function(node) {
        var that = this;
        return this._shouldIncludeNode(node)
        .then(function (shouldIncludeNode) {
            if (shouldIncludeNode) {
                return [node];
            } else if (that.filterEntireSubtree) {
                return [];
            } else {
                return that.getChildren(node);
            }
        })
    }

    FilterTreeReader.prototype.createRoot = function(object) {
        return this.previousReader.createRoot(object);
    }

    FilterTreeReader.prototype.getObject = function(node) {
        return this.previousReader.getObject(node);
    }

    FilterTreeReader.prototype.getChildren = function(node, errors) {
        return Promise.map(this.previousReader.getChildren(node, errors), this._getFilteredDescendents.bind(this))
        .then(function (nestedArrays) {
            return nestedArrays.reduce(function (concatenated, current) { return concatenated.concat(current); }, []);
        })
    }

    function DbgObjectTreeReader(previousReader) {
        this.previousReader = previousReader ? previousReader : new ObjectTreeReader();
        this.typeExtension = new DbgObject.TypeExtension();
        this.nextId = 1;
    }

    DbgObjectTreeReader.prototype.createRoot = function(object) {
        return this.previousReader.createRoot(object);
    }

    DbgObjectTreeReader.prototype.getObject = function (node) {
        return this.previousReader.getObject(node);
    }

    DbgObjectTreeReader.prototype.getChildren = function (node, errors) {
        var previousChildren = this.previousReader.getChildren(node, errors);

        var object = this.getObject(node);
        var additionalChildren = null;
        if (object instanceof DbgObject) {
            additionalChildren = this._getDbgObjectChildren(object, errors)
        } else {
            additionalChildren = Promise.resolve([]);
        }

        return Promise.all([previousChildren, additionalChildren])
        .thenAll(function (previous, additional) {
            // Filter out any null DbgObject children.
            return previous.concat(additional.filter(function (x) { return !(x instanceof DbgObject && x.isNull()); }));
        });
    }

    // DbgObject children methods

    DbgObjectTreeReader.prototype.addChildren = function (type, getChildren) {
        var name = (this.nextId++).toString();
        this.typeExtension.addExtension(type, name, new ChildExpansion(name, getChildren));
        return name;
    }

    DbgObjectTreeReader.prototype.removeChildren = function (type, name) {
        this.typeExtension.removeExtension(type, name);
    }

    DbgObjectTreeReader.prototype._getDbgObjectChildren = function(dbgObject, errors) {
        var tree = this;
        return this.typeExtension.getAllExtensionsIncludingBaseTypes(dbgObject)
        .then(function (results) {
            // Evaluate each of the child expansions.
            return Promise.map(results, function (x) {
                return Promise.resolve(null)
                .then(function() {
                    return x.extension.getChildren(dbgObject);
                })
                .then(null, function (error) {
                    if (Array.isArray(errors)) {
                        errors.push(error);
                    }
                    return [];
                })
            })
        })
        .then(function (childrenLists) {
            // Flatten the list.
            return childrenLists.reduce(function (a, b) { return a.concat(b); }, []);
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

    function InspectTreeReader(previousReader, inspect) {
        this.previousReader = previousReader;
        this.inspect = inspect;
    }

    InspectTreeReader.prototype.createRoot = function(object) {
        this.inspect(object);
        return this.previousReader.createRoot(object);
    }

    InspectTreeReader.prototype.getObject = function(node) {
        return this.previousReader.getObject(node);
    }

    InspectTreeReader.prototype.getChildren = function(node, errors) {
        var that = this;
        return this.previousReader.getChildren(node, errors)
        .then(function (children) {
            children.forEach(function (child) {
                that.inspect(that.getObject(child));
            })

            return children;
        })
    }
    
    DbgObjectTree.ObjectTreeReader = ObjectTreeReader
    DbgObjectTree.DbgObjectTreeReader = DbgObjectTreeReader;
    DbgObjectTree.MapTreeReader = MapTreeReader;
    DbgObjectTree.FilterTreeReader = FilterTreeReader;
    DbgObjectTree.InspectTreeReader = InspectTreeReader;
})();