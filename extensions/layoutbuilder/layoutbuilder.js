"use strict";

var LayoutBuilder = undefined;
Loader.OnLoad(function() {

    LayoutBuilder = {
        Tree: new TreeReader.DbgObjectTreeReader(new TreeReader.ObjectTreeReader()),
        Renderer: new DbgObjectTreeRenderer(),
        InterpretAddress: function(address) {
            return new DbgObject(MSHTML.Module, "void", address).vcast();
        },
        GetRoots: function() {
            return DbgObject.locals(MSHTML.Module, "Layout::LayoutBuilderDriver::BuildPageLayout", "layoutBuilder").f("sp.m_pT")
            .then(undefined, function (err) {
                if (err.message.indexOf("Could not find local symbol") == 0) {
                    // Try other places.
                    var otherMethods = [
                        "Layout::LayoutBuilder::BuildBoxItem",
                        "Layout::LayoutBuilder::EnterBlock",
                        "Layout::LayoutBuilder::ReEnterBlock",
                        "Layout::LayoutBuilder::EnterInitialBlock",
                        "Layout::LayoutBuilder::EnterInitialBlock",
                        "Layout::LayoutBuilder::ExitBlock"
                    ];
                    return Promise.join(
                        otherMethods.map(function(method) {
                            return DbgObject.locals(MSHTML.Module, method, "this")
                            .then(
                                function (result) {
                                    if (result.length > 0 && result[0].isPointer()) {
                                        return result[0].deref();
                                    }
                                },
                                function(err) { return null; }
                            )
                        })
                    )
                    .then(function (results) {
                        return results.filter(function (r) { return r != null; });
                    });
                } else {
                    return [];
                }
            })
            .then(function (layoutBuilders) {
                if (layoutBuilders.length == 0) {
                    return Promise.fail("No LayoutBuilders were found on the call stack. Possible reasons:<ul><li>The debuggee is not broken in layout.</li><li>The debuggee is not IE 11.</li><li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li><li>Symbols aren't available.</li></ul>Refresh the page to try again, or specify a LayoutBuilder explicitly.")
                } else {
                    return layoutBuilders;
                }
            });
        },
        DefaultTypes: [{ module: MSHTML.Module, type: "Layout::ContainerBoxBuilder" }, { module: MSHTML.Module, type: "Layout::LayoutBoxBuilder" }],
    }

    LayoutBuilder.Tree.addChildren(MSHTML.Module, "Layout::LayoutBuilder", function (object) {
        return object.f("currentBuilder.m_pT").vcast();
    });

    LayoutBuilder.Tree.addChildren(MSHTML.Module, "Layout::LayoutBoxBuilder", function (object) {
        return object.f("parentBuilder.m_pT").vcast().then(function (parentBuilder) {
            if (parentBuilder.isNull()) {
                return [];
            } else {
                return parentBuilder;
            }
        })
    })

    // Add a type description for LayoutBoxBuilder to link to the LayoutBuilder stack
    DbgObject.AddAction(MSHTML.Module, "Layout::LayoutBoxBuilder", "LayoutBuilder", function(boxBuilder) {
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

    DbgObject.AddAction(MSHTML.Module, "Layout::LayoutBox", "LayoutBuilder", function(box) {
        return box.vcast()
        .then(function (vcastedBox) {
            return Promise.join(
                [vcastedBox.f("builder"), vcastedBox.f("isAttachedToBuilder").val()],
                function (builder, isAttachedToBuilder) {
                    if (isAttachedToBuilder) {
                        return builder.actions("LayoutBuilder");
                    }
                }
            );
        });
    });
});