"use strict";

// displaytree.js
// Peter Salas
//
// Display tree visualization.
//
// This file has the mshtml-specific logic for constructing a display tree.  The methods that new types implement are
//  - typename -> string               [a name that identifies the type]
//  - getChildren() -> promised array  [collects the children in the array]
//
// These types also act as backing nodes drawn by widetree/talltree.js, which means that CDispNode implements
//  - getChildren -> array of backing nodes
//  - createRepresentation -> dom element
var DisplayTree = (function() {
    var DispNodeCache = {};
    var DispNodeTypes = {};
    var FieldTypeMap = {};

    // Add a type description for CDispNode to link to the DisplayTree.
    DbgObject.AddTypeDescription(MSHTML.Module, "CDispNode", function(dispNode) {
        if (dispNode.isNull()) {
            return "null";
        } else {
            return "<a href=\"/displaytree/#" + dispNode.ptr() + "\">" + dispNode.ptr() + "</a>";
        }
    });

    function createDisplayTree(pointer) {
        if (pointer) {
            var dispNode = new DbgObject(MSHTML.Module, "CDispNode", pointer);
            DispNodeCache = {};
            return CreateDispNode(dispNode);
        }

        return null;
    }

    function getRootDispNodes() {
        return MSHTML.GetCDocs()
            .then(function(docs) {
                return Promise.map(docs, function(doc) { return doc.f("_view._pDispRoot"); });
            })
            .then(function(dispRoots) {
                return Promise.filter(Promise.join(dispRoots), function(dispRoot) { return !dispRoot.isNull(); })
            })
            .then(function(nonNullDispRoots) {
                if (nonNullDispRoots.length == 0) {
                    return Promise.fail();
                }
                return nonNullDispRoots.map(function(root) { return root.ptr(); });
            })
            .then(
                function(roots) { return roots; },
                function(error) {
                    return Promise.fail("No CDispRoots were found. Possible reasons:<ul><li>The debuggee is not IE 11.</li><li>No page is loaded.</li><li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li><li>Symbols aren't available.</li></ul>Refresh the page to try again, or specify a CDispNode explicitly.");
                }
            );
    }

    function CreateDispNode(obj) {
        if (obj.ptr() in DispNodeCache) {
            return DispNodeCache[obj.ptr()];
        }

        return obj.vtable()
            .then(function(type) {
                if (type in DispNodeTypes) {
                    var result = new DispNodeTypes[type](obj);
                } else {
                    var result = new CDispNode(obj);
                }

                DispNodeCache[obj.ptr()] = result;
                return result;
            })
    }

    function MapDispNodeType(typename, type) {
        DispNodeTypes[typename] = type;
    }

    function CreateDispNodeType(typename, superType) {
        var name = typename.substr("CDisp".length);
        var fieldName = typename;

        var newType = function(dispNode, vtableType) {
            superType.call(this, dispNode, vtableType);
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

    function CDispNode(dispNode, vtableType) {
        this.dispNode = dispNode;
        this.childrenPromise = null;
        this.vtableType = vtableType;
    }
    FieldTypeMap["CDispNode"] = CDispNode;

    CDispNode.prototype.typename = function() { return this.vtableType; }

    CDispNode.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        element.innerHTML = "<p>" + this.typename() + "</p> <p>" + this.dispNode.ptr() + "</p> ";
        return FieldSupport.RenderFields(this, this.dispNode, element);
    }
    CDispNode.prototype.getChildren = function() {
        return Promise.as([]);
    }
    var CDispLeafNode = CreateDispNodeType("CDispLeafNode", CDispNode);
    var CDispSVGLeafNode = CreateDispNodeType("CDispSVGLeafNode", CDispNode);
    var CDispProxyNode = CreateDispNodeType("CDispProxyNode", CDispNode);

    var CDispParentNode = CreateDispNodeType("CDispParentNode", CDispNode);
    CDispParentNode.prototype.getChildren = function() {
        return this.dispNode.f("_pFirstChild").latestPatch().list(function (node) {
            return node.f("_pNext").latestPatch();
        }).map(CreateDispNode);
    }

    var CDispStructureNode = CreateDispNodeType("CDispStructureNode", CDispParentNode);
    var CDispSVGStructureNode = CreateDispNodeType("CDispSVGStructureNode", CDispParentNode);

    var CDispContainer = CreateDispNodeType("CDispContainer", CDispParentNode);
    var CDispClipNode = CreateDispNodeType("CDispClipNode", CDispContainer);
    var CDispRoot = CreateDispNodeType("CDispRoot", CDispClipNode);
    var CDispScroller = CreateDispNodeType("CDispScroller", CDispClipNode);
    var CDispTopLevelScroller = CreateDispNodeType("CDispTopLevelScroller", CDispScroller);

    var builtInFields = [
        {
            type: "CDispNode",
            fullname: "Bounds",
            shortname: "b",
            async:true,
            html: function() {
                var rect = this.f("_rctBounds");
                return Promise.map(["left", "top", "right", "bottom"], function(f) { return rect.f(f).val(); })
                    .then(function(values) { return values.join(" "); });
            }
        },
        {
            type: "CDispNode",
            fullname: "Client",
            shortname: "c",
            async:true,
            html: function() {
                // Get the latest patch...
                return this.latestPatch()

                // Check if it has advanced display...
                .then(function(node) {
                    return node.f("_flags._fAdvanced").val()

                    // And get the disp client.
                    .then(function(hasAdvanced) {
                        if (hasAdvanced) {
                            return node.f("_pAdvancedDisplay._pDispClient").vcast();
                        } else {
                            return node.f("_pDispClient").vcast();
                        }
                    });
                });
            }
        },
        {
            type: "CDispNode",
            fullname: "All Flags",
            shortname: "flags",
            async:true,
            html: function() {
                return Promise
                    .filter(this.f("_flags").fields(), function(f) {
                        if (f.name.indexOf("_fUnused") != 0 && f.value.bitcount == 1) {
                            return f.value.val();
                        } else {
                            return false;
                        }
                    })
                    .then(function(flags) {
                        return flags
                            .map(function(flag) { return flag.name; })
                            .join(" ");
                    });
            }
        }
    ];

    return {
        Name: "DisplayTree",
        BasicType: "CDispNode",
        BuiltInFields: builtInFields,
        TypeMap: FieldTypeMap,
        Create: createDisplayTree,
        Roots: getRootDispNodes
    };
})();
