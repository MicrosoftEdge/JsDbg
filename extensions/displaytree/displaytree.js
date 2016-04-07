"use strict";

var DisplayTree = undefined;
Loader.OnLoad(function() {
    // Add a type description for CDispNode to link to the DisplayTree.
    DbgObject.AddAction(MSHTML.Module, "CDispNode", "DisplayTree", function (dispNode) {
        function getTopMostDispNode(node) {
            return node.f("_pParent")
            .then(function (parentNode) {
                if (parentNode.isNull()) {
                    return node;
                } else {
                    return getTopMostDispNode(parentNode);
                }
            })
        }

        return getTopMostDispNode(dispNode)
        .then(function (topMostDispNode) {
            // Check if there's a CDoc that owns it.
            return MSHTML.GetCDocs()
            .filter(function (doc) {
                return doc.f("_view._pDispRoot").equals(topMostDispNode)
            })
            .then(function (docs) {
                if (docs.length > 0) {
                    return docs[0];
                } else {
                    return topMostDispNode;
                }
            })
        })
        .then(function (rootNode) {
            return TreeInspector.GetActions("displaytree", "Display Tree", rootNode, dispNode);
        })
    });
    DbgObject.AddAction(MSHTML.Module, "CDoc", "DisplayTree", function (doc) {
        return TreeInspector.GetActions("displaytree", "Display Tree", doc);
    })
    DbgObject.AddAction(MSHTML.Module, "CView", "DisplayTree", function (view) {
        return TreeInspector.GetActions("displaytree", "Display Tree", view.unembed("CDoc", "_view"), view);
    });

    if (Loader.GetCurrentExtension() == "displaytree") {
        DbgObjectTree.AddRoot("Display Tree", function() {
            return MSHTML.GetCDocs()
            .filter(function (doc) {
                return doc.f("_view._pDispRoot").isNull()
                .then(function (isNull) {
                    return !isNull;
                })
            })
            .then(function(docsWithDispRoots) {
                if (docsWithDispRoots.length == 0) {
                    return Promise.fail();
                }
                return docsWithDispRoots;
            })
            .then(null, function(error) {
                var errorMessage =
                    "No CDispRoots were found.\
                    Possible reasons:\
                    <ul>\
                        <li>The debuggee is not IE 11 or Edge.</li>\
                        <li>No page is loaded.</li>\
                        <li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li>\
                        <li>Symbols aren't available.</li>\
                    </ul>\
                    Refresh the page to try again, or specify a CDispNode explicitly.";

                if (error) {
                    errorMessage = "<h4>" + error.toString() + "</h4>" + errorMessage;
                }
                return Promise.fail(errorMessage);
            });
        });

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "CDispNode", address).vcast()
            .then(null, function (err) {
                return new DbgObject(MSHTML.Module, "CDoc", address).vcast();
            })
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CDoc", null, function (object) {
            return object.f("_view");
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CView", null, function (object) {
            return object.f("_pDispRoot");
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CDispParentNode", null, function (object) {
            return object.f("_pFirstChild").latestPatch().list(function (node) {
                return node.f("_pNext").latestPatch()
            }).vcast();
        });
    }

    DbgObject.AddExtendedField(MSHTML.Module, "CDispNode", "Client", "CDispClient", UserEditableFunctions.Create(function (dispNode) {
        // Get the latest patch...
        return dispNode.latestPatch()

        // Check if it has advanced display...
        .then(function(latestPatch) {
            return latestPatch.f("_flags._fAdvanced").val()

            // And get the disp client.
            .then(
                function(hasAdvanced) {
                    if (hasAdvanced) {
                        return latestPatch.f("_pAdvancedDisplay._pDispClient").vcast();
                    } else {
                        return latestPatch.f("_pDispClient").vcast();
                    }
                },
                function() {
                    return latestPatch.f("_pDispClient").vcast();
                }
            );
        });
    }));

    DbgObject.AddExtendedField(MSHTML.Module, "CDispClient", "AsContainerBox", "Layout::ContainerBox", UserEditableFunctions.Create(function (client) {
        return client.dcast("Layout::ContainerBox");
    }));

    DbgObject.AddTypeDescription(MSHTML.Module, "CDispFlags", "AllFlags", false, UserEditableFunctions.Create(function (flags) {
        return Promise
        .filter(flags.fields(), function(f) {
            if (f.name.indexOf("_fUnused") != 0 && f.value.bitcount == 1) {
                return f.value.val();
            } else {
                return false;
            }
        })
        .then(function(enabledFlags) {
            return enabledFlags
            .map(function(flag) { return flag.name; })
            .join(" ");
        });
    }));

    DisplayTree = {
        Name: "DisplayTree",
        RootType: "CDispNode",
        DefaultTypes: [
            { module: MSHTML.Module, type: "CDispNode" }
        ]
    };
});
