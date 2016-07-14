"use strict";

var UndoManager = undefined;
Loader.OnLoad(function() {
    UndoManager = {
        Tree: new TreeReader.DbgObjectTreeReader(new TreeReader.ObjectTreeReader()),
        Renderer: new DbgObjectTreeRenderer(),
        InterpretAddress: function(address) {
            return new DbgObject(MSHTML.Module, "CDoc", address);
        },
        GetRoots: function() {
            // Sort by the _ulRefs of the CDoc as a proxy for interesting-ness.
            return Promise.sort(
                MSHTML.GetCDocs(), 
                function (doc) {
                    return doc.f("_ulRefs").val().then(function (v) { return 0 - v; });
                }
            );
        },
        DefaultTypes: [],
    };

    UndoManager.Tree.addChildren(MSHTML.Module, "CDoc", function (object) {
        // Get the undo manager from the CDoc.
        return object.f("edgeUndoManager.m_pT").vcast();
    });

    function getChildrenForUndoManager(undoManager, memberName) {
        return undoManager.f(memberName).array("Items")
        .map(function (item) {
            return item.f("m_pT").vcast();
        })
        .then(function (items) {
            return items.filter(function (item) { return !item.isNull(); })
        })
    }

    UndoManager.Tree.addChildren(MSHTML.Module, "Undo::UndoManager", function (undoManager) {
        // Group user, scripted and pending children of the open parent unit with these render-only children of the UndoManager object
        return Promise.join([
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
    UndoManager.Tree.addChildren(MSHTML.Module, "Undo::ParentUndoUnit", function (object) {
        return object.f("childUnits").array("Items").map(function (item) {
            return item.f("m_pT").vcast();
        });
    });
});