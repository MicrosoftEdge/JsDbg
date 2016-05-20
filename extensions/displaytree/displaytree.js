"use strict";

var DisplayTree = undefined;
Loader.OnLoad(function() {
    // Define the tree.
    DisplayTree = {
        Tree: DbgObjectTree.Create("Display Tree"),
        Renderer: new DbgObjectTreeRenderer(),
        InterpretAddress: function(address) {
            return new DbgObject(MSHTML.Module, "void", address).vcast();
        },
        GetRoots: function() {
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
        },
        DefaultTypes: [{ module: MSHTML.Module, type: "CDispNode" }],
    };

    DisplayTree.Tree.addChildren(MSHTML.Module, "CDoc", function (doc) {
        return doc.f("_view");
    });

    DisplayTree.Tree.addChildren(MSHTML.Module, "CView", function (view) {
        return view.f("_pDispRoot");
    });

    DisplayTree.Tree.addChildren(MSHTML.Module, "CDispParentNode", function (dispParentNode) {
        return dispParentNode.f("_pFirstChild").list("_pNext").vcast();
    });

    // Add DbgObject actions for links to the display tree.
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
    });

    DbgObject.AddAction(MSHTML.Module, "CView", "DisplayTree", function (view) {
        return TreeInspector.GetActions("displaytree", "Display Tree", view.unembed("CDoc", "_view"), view);
    });

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
});
