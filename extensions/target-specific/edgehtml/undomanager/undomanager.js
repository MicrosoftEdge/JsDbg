//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var UndoManager = undefined;
Loader.OnLoad(function() {
    UndoManager = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            return DbgObject.create(MSHTML.Type("CDoc"), address);
        },
        GetRoots: function() { return MSHTML.GetCDocs() },
        DefaultTypes: [],
    };

    UndoManager.Tree.addChildren(MSHTML.Type("CDoc"), function (object) {
        // Get the undo manager from the CDoc.
        return object.f("edgeUndoManager._object.m_pT", "edgeUndoManager.m_pT").vcast();
    });

    function getChildrenForUndoManager(undoManager, memberName) {
        return undoManager.f(memberName).f("m_pT", "").array("Items")
        .map(function (item) {
            return item.f("m_pT").vcast();
        })
        .then(function (items) {
            return items.filter(function (item) { return !item.isNull(); })
        })
    }

    UndoManager.Tree.addChildren(MSHTML.Type("Undo::UndoManager"), function (undoManager) {
        // Group user, scripted and pending children of the open parent unit with these render-only children of the UndoManager object
        return Promise.all([
            {
                toString : function() {
                    return "User Undo Units"
                },
                getChildren : function() {
                    return getChildrenForUndoManager(undoManager, "userUndoUnits");
                }
            },
            {
                toString : function() {
                    return "Scripted Operations"
                },
                getChildren : function() {
                    return getChildrenForUndoManager(undoManager, "scriptedOperations");
                }
            },
            {
                toString : function() {
                    return "Children of Open Parent Unit"
                },
                getChildren : function() {
                    return getChildrenForUndoManager(undoManager, "childrenForOpenParentUnit");
                }
            }
        ]);
    });

    // Register ParentUndoUnit so its child units will be shown
    UndoManager.Tree.addChildren(MSHTML.Type("Undo::ParentUndoUnit"), function (object) {
        return object.f("childUnits").array("Items").map(function (item) {
            return item.f("m_pT").vcast();
        });
    });

    DbgObject.AddAction(MSHTML.Type("CDoc"), "UndoManager", function(doc) {
        return TreeInspector.GetActions("undomanager", "Undo Manager", doc);
    });
});