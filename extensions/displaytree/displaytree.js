"use strict";

// displaytree.js
// Peter Salas
//
// Display tree visualization.
//
// This file has the mshtml-specific logic for constructing a display tree.  The methods that new types implement are
//  - typename -> string               [a name that identifies the type]
//  - collectChildren(array) -> void   [adds children to the given array]
//
// These types also act as backing nodes drawn by widetree/talltree.js, which means that CDispNode implements
//  - getChildren -> array of backing nodes
//  - createRepresentation -> dom element

var DisplayTree = (function() {
    var DispNodeCache = {};
    var DispNodeTypes = {};
    var FieldTypeMap = {};

    function createDisplayTree(pointer, isTreeNode) {
        if (pointer) {
            var dispNode = null;
            if (isTreeNode) {
                // Get the box pointer from the tree node.
                var treeNode = new DbgObject("mshtml", "CTreeNode", pointer);
                var layoutAssociationPtrBits = treeNode.f("_fHasLayoutAssociationPtr").val();
                if (layoutAssociationPtrBits & 0x8) {
                    var bits = 0;

                    // for each bit not counting the 0x8 bit, dereference the pointer.
                    layoutAssociationPtrBits = layoutAssociationPtrBits & 0x7;
                    var pointer = treeNode.f("_pLayoutAssociation");
                    while (layoutAssociationPtrBits > 0) {
                        if (layoutAssociationPtrBits & 1) {
                            pointer = pointer.deref();
                        }
                        layoutAssociationPtrBits = layoutAssociationPtrBits>>1;
                    }

                    dispNode = pointer.as("Layout::ContainerBox").f("rawDisplayNode");
                } else {
                    alert("No box was attached to the tree node.");
                }
            } else {
                dispNode = new DbgObject("mshtml", "Layout::CDispNode", pointer);
            }

            if (dispNode != null) {
                DispNodeCache = {};
                return CreateDispNode(dispNode);
            }
        }

        return null;
    }

    var renderTreeRoot = null;
    function renderDisplayTree(renderer, displayTree, container) {
        renderTreeRoot = renderer.BuildTree(container, displayTree);
        return renderTreeRoot;
    }

    function updateTreeRepresentation() {
        if (renderTreeRoot != null) {
            renderTreeRoot.updateRepresentation();
        }
    }

    function CreateDispNode(obj) {
        if (obj.ptr() in DispNodeCache) {
            return DispNodeCache[obj.ptr()];
        }

        var type = obj.vtable();
        if (type in DispNodeTypes) {
            var result = new DispNodeTypes[type](obj);
        } else {
            var result = new CDispNode(obj);
        }

        DispNodeCache[obj.ptr()] = result;
        return result;
    }

    // Extend DbgObject to ease navigation of patchable objects.
    DbgObject.prototype.latestPatch = function() {
        var nextPatch = this.f("_pNextPatch");
        if (!nextPatch.isNull()) {
            return nextPatch.as(this.typename);
        } else {
            return this;
        }
    }

    function MapDispNodeType(typename, type) {
        DispNodeTypes[typename] = type;
    }

    function CreateDispNodeType(typename, superType) {
        var name = typename.substr("CDisp".length);
        var fieldName = typename;

        var newType = function(dispNode) {
            superType.call(this, dispNode);
            this.dispNode = this.dispNode.as(typename);
        }
        newType.prototype = Object.create(superType.prototype);
        newType.prototype.typename = function() { return name; }
        newType.super = superType;
        newType.prototype.rawTypename = typename;

        MapDispNodeType(typename, newType);
        FieldTypeMap[fieldName] = newType;
        return newType;
    }

    function CDispNode(dispNode) {
        this.dispNode = dispNode;
        this.cachedChildren = null;
    }
    FieldTypeMap["CDispNode"] = CDispNode;

    CDispNode.prototype.typename = function() { return this.dispNode.vtable(); }
    CDispNode.prototype.collectChildren = function(children) { }

    CDispNode.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        element.innerHTML = "<p>" + this.typename() + "</p> <p>" + this.dispNode.ptr() + "</p> ";
        FieldSupport.RenderFields(this, this.dispNode, element);
        return element;
    }
    CDispNode.prototype.getChildren = function() {
        if (this.cachedChildren == null) {
            var children = [];
            this.collectChildren(children);
            this.cachedChildren = children.map(CreateDispNode);
        }
        return this.cachedChildren;
    }
    var CDispLeafNode = CreateDispNodeType("CDispLeafNode", CDispNode);

    var CDispParentNode = CreateDispNodeType("CDispParentNode", CDispNode);
    CDispParentNode.prototype.collectChildren = function(children) {
        CDispParentNode.super.prototype.collectChildren.call(this, children);

        var child = this.dispNode.f("_pFirstChild");
        while (!child.isNull()) {
            child = child.latestPatch();
            children.push(child);
            child = child.f("_pNext");
        }
    }

    var CDispStructureNode = CreateDispNodeType("CDispStructureNode", CDispParentNode);

    var CDispContainer = CreateDispNodeType("CDispContainer", CDispParentNode);
    var CDispClipNode = CreateDispNodeType("CDispClipNode", CDispContainer);
    var CDispScroller = CreateDispNodeType("CDispScroller", CDispClipNode);
    var CDispTopLevelScroller = CreateDispNodeType("CDispTopLevelScroller", CDispScroller);

    document.addEventListener("DOMContentLoaded", function() {
        // Initialize the field support.
        FieldSupport.Initialize("DisplayTree", DisplayTreeBuiltInFields, "CDispNode", FieldTypeMap, updateTreeRepresentation);
    });

    return {
        CreateFromCTreeNodePointer: function(pointer) { return createDisplayTree(pointer, /*isTreeNode*/true); },
        CreateFromCDispNodePointer: function(pointer) { return createDisplayTree(pointer, /*isTreeNode*/false); },
        Render: renderDisplayTree
    };
})();
