"use strict";

var UndoManager = undefined;
Loader.OnLoad(function() {
    DbgObjectTree.AddRoot("Undo Manager", function() {
        // Sort by the _ulRefs of the CDoc as a proxy for interesting-ness.
        return Promise.sort(
            MSHTML.GetCDocs(), 
            function (doc) {
                return doc.f("_ulRefs").val().then(function (v) { return 0 - v; });
            }
        );
    });

    DbgObjectTree.AddType(null, MSHTML.Module, "CDoc", null, function (object) {
        // Get the undo manager from the CDoc.
        return object.f("edgeUndoManager.m_pT").vcast();
    });

    DbgObjectTree.AddType(null, MSHTML.Module, "Undo::UndoManager", null, function (object) {
        // Group user, scripted and pending children of the open parent unit with these render-only children of the UndoManager object
        return Promise.join([
            {
                getBasicDescription : function() {
                    return "User Undo Units"
                },
                getChildren : function() {
                    return this.undoManager.f("userUndoUnits").array("Items").map(function (item) {
                        return item.f("m_pT").vcast();
                    });
                },
                undoManager: object
            },
            {
                getBasicDescription : function() {
                    return "Scripted Operations"
                },
                getChildren : function() {
                    return this.undoManager.f("scriptedOperations").array(this.undoManager.f("scriptedOperationCount")).map(function (item) {
                        return item.f("m_pT").vcast();
                    });
                },
                undoManager: object
            },
            {
                getBasicDescription : function() {
                    return "Children of Open Parent Unit"
                },
                getChildren : function() {
                    return this.undoManager.f("childrenForOpenParentUnit").array("Items").map(function (item) {
                        return item.f("m_pT").vcast();
                    });
                },
                undoManager: object
            }
        ]);
    });

    // Register ParentUndoUnit so its child units will be shown
    DbgObjectTree.AddType(null, MSHTML.Module, "Undo::ParentUndoUnit", null, function (object) {
        return object.f("childUnits").array("Items").map(function (item) {
            return item.f("m_pT").vcast();
        });
    });

    UndoManager = {
        Name: "UndoManager",
        RootType: "CDoc"
    }
});