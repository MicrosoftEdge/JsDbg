"use strict";

var LayoutBuilder = undefined;
Loader.OnLoad(function() {
    // Add a type description for LayoutBoxBuilder to link to the LayoutBuilder stack.
    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::LayoutBoxBuilder", "LayoutBuilders", true, function(boxBuilder) {
        if (boxBuilder.isNull()) {
            return "null";
        } else {
            return "<a href=\"/layoutbuilder/#" + boxBuilder.ptr() + "\">" + boxBuilder.ptr() + "</a>";
        }
    });
    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::LayoutBuilder", "LayoutBuilders", true, function(layoutBuilder) {
        if (layoutBuilder.isNull()) {
            return "null";
        } else {
            return "<a href=\"/layoutbuilder/#" + layoutBuilder.ptr() + "\">" + layoutBuilder.ptr() + "</a>";
        }
    });

    if (Loader.GetCurrentExtension == "layoutbuilder") {
        DbgObjectTree.AddRoot("LayoutBuilder Stack", function() {
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
        });

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "Layout::LayoutBuilder", address).vcast();
        });

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "Layout::LayoutBoxBuilder", address).vcast();
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::LayoutBuilder", null, function (object) {
            return object.f("currentBuilder.m_pT").vcast().then(function (builder) { return [builder]; });
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::LayoutBoxBuilder", null, function (object) {
            return object.f("parentBuilder.m_pT").vcast().then(function (builder) { return [builder]; });
        })
    }

    LayoutBuilder = {
        Name: "LayoutBuilder",
        RootType: "LayoutBoxBuilder",
        DefaultTypes: [
            { module: MSHTML.Module, type: "Layout::ContainerBoxBuilder" },
            { module: MSHTML.Module, type: "Layout::LayoutBoxBuilder" },
            { module: MSHTML.Module, type: "Layout::SvgBoxBuilder" }
        ]
    };
});