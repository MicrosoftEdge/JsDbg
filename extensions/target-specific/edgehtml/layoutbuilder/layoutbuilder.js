//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var LayoutBuilder = undefined;
Loader.OnLoad(function() {

    LayoutBuilder = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            // vcast ensures that the LayoutBuilder is valid and will also cast to LayoutBoxBuilder if necessary.
            return DbgObject.create(MSHTML.Type("Layout::LayoutBuilder"), address).vcast();
        },
        GetRoots: function() {
            return DbgObject.locals(MSHTML.Module, "Layout::LayoutBuilderDriver::BuildPageLayout", "layoutBuilder").f("sp.m_pT")
            .then(function (layoutBuilders) {
                if (layoutBuilders.length == 0) {
                    // Try other places.
                    var otherMethods = [
                        "Layout::LayoutBuilder::BuildBoxItem",
                        "Layout::LayoutBuilder::EnterBlock",
                        "Layout::LayoutBuilder::ReEnterBlock",
                        "Layout::LayoutBuilder::EnterInitialBlock",
                        "Layout::LayoutBuilder::EnterInitialBlock",
                        "Layout::LayoutBuilder::ExitBlock"
                    ];
                    return Promise.map(otherMethods, function (method) {
                        return DbgObject.locals(MSHTML.Module, method, "this")
                        .map(function (local) {
                            if (local.type.isPointer()) {
                                return local.deref();
                            } else {
                                return local;
                            }
                        })
                    })
                    .then(function (results) {
                        // Flatten the array.
                        return results.reduce(function (a, b) { return a.concat(b); }, []);
                    })
                }

                return layoutBuilders;
            })
            .then(function (layoutBuilders) {
                if (layoutBuilders.length == 0) {
                    return Promise.reject("No LayoutBuilders were found on the call stack. Possible reasons:<ul><li>The debuggee is not broken in layout.</li><li>The debuggee is not IE 11.</li><li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li><li>Symbols aren't available.</li></ul>Refresh the page to try again, or specify a LayoutBuilder explicitly.")
                } else {
                    return layoutBuilders;
                }
            });
        },
        DefaultTypes: [MSHTML.Type("Layout::ContainerBoxBuilder"), MSHTML.Type("Layout::LayoutBoxBuilder")],
    }

    LayoutBuilder.Tree.addChildren(MSHTML.Type("Layout::LayoutBuilder"), function (object) {
        return object.f("currentBuilder.m_pT").vcast();
    });

    LayoutBuilder.Tree.addChildren(MSHTML.Type("Layout::LayoutBoxBuilder"), function (object) {
        return object.f("parentBuilder.m_pT").vcast();
    })

    DbgObject.AddAction(MSHTML.Type("Layout::SHoldLayoutBuilder"), "LayoutBuilder", function (layoutBuilder) {
        return TreeInspector.GetActions("layoutbuilder", "Layout Builder", layoutBuilder.f("sp.m_pT"));
    })

    DbgObject.AddAction(MSHTML.Type("Layout::LayoutBuilder"), "LayoutBuilder", function (layoutBuilder) {
        return TreeInspector.GetActions("layoutbuilder", "Layout Builder", layoutBuilder);
    })

    // Add a type description for LayoutBoxBuilder to link to the LayoutBuilder stack
    DbgObject.AddAction(MSHTML.Type("Layout::LayoutBoxBuilder"), "LayoutBuilder", function(boxBuilder) {
        function findTopMostBuilder(builder) {
            return builder.f("parentBuilder.m_pT")
            .then(function (parentBuilder) {
                if (parentBuilder.isNull()) {
                    return builder;
                } else {
                    return findTopMostBuilder(parentBuilder);
                }
            })
        }

        return LayoutBuilder.GetRoots()
        .then(null, function() { return []; })
        .then(function (layoutBuilders) {
            if (layoutBuilders.length == 0) {
                return layoutBuilders;
            } else {
                // Find the builder whose top-most builder is the same as this builder.
                return Promise.map(layoutBuilders, function (layoutBuilder) {
                    return findTopMostBuilder(layoutBuilder.f("currentBuilder.m_pT"));
                })
                .then(function (topMostBuildersForLayoutBuilders) {
                    return findTopMostBuilder(boxBuilder)
                    .then(function (topMostBuilder) {
                        return layoutBuilders.filter(function (layoutBuilder, i) {
                            return topMostBuildersForLayoutBuilders[i].equals(topMostBuilder);
                        })
                    })
                })
            }
        })
        .then(function (layoutBuilders) {
            if (layoutBuilders.length == 0) {
                return TreeInspector.GetActions("layoutbuilder", "Layout Builder", boxBuilder);
            } else {
                return TreeInspector.GetActions("layoutBuilder", "Layout Builder", layoutBuilders[0], boxBuilder);
            }
        })
    });

    DbgObject.AddAction(MSHTML.Type("Layout::LayoutBox"), "LayoutBuilder", function(box) {
        return box.vcast()
        .then(function (vcastedBox) {
            return Promise.all([vcastedBox.f("builder"), vcastedBox.f("isAttachedToBuilder").val()])
            .thenAll(function (builder, isAttachedToBuilder) {
                if (isAttachedToBuilder) {
                    return builder.actions("LayoutBuilder");
                }
            });
        });
    });
});