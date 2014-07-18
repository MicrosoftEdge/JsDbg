var LayoutBuilder = (function() {
    // Add a type description for LayoutBoxBuilder to link to the LayoutBuilder stack.
    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::LayoutBoxBuilder", function(boxBuilder) {
        if (boxBuilder.isNull()) {
            return "null";
        } else {
            return "<a href=\"/layoutbuilder/#" + boxBuilder.ptr() + "\">" + boxBuilder.ptr() + "</a>";
        }
    });
    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::LayoutBuilder", function(layoutBuilder) {
        if (layoutBuilder.isNull()) {
            return "null";
        } else {
            return "<a href=\"/layoutbuilder/#" + layoutBuilder.ptr() + "\">" + layoutBuilder.ptr() + "</a>";
        }
    });

    if (JsDbg.GetCurrentExtension() == "layoutbuilder") {
        Tree.AddRoot("LayoutBuilder Stack", function() {
            return DbgObject.locals(MSHTML.Module, "Layout::LayoutBuilderDriver::BuildPageLayout", "layoutBuilder").f("sp.m_pT")
            .then(function (layoutBuilders) {
                if (layoutBuilders.length == 0) {
                    return Promise.fail("No LayoutBuilders were found on the call stack. Possible reasons:<ul><li>The debuggee is not broken in layout.</li><li>The debuggee is not IE 11.</li><li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li><li>Symbols aren't available.</li></ul>Refresh the page to try again, or specify a LayoutBuilder explicitly.")
                } else {
                    return layoutBuilders;
                }
            });
        });

        Tree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "Layout::LayoutBuilder", address).vcast();
        });

        Tree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "Layout::LayoutBoxBuilder", address).vcast();
        });

        Tree.AddType(null, MSHTML.Module, "Layout::LayoutBuilder", null, function (object) {
            return object.f("currentBuilder.m_pT").vcast().then(function (builder) { return [builder]; });
        });

        Tree.AddType(null, MSHTML.Module, "Layout::LayoutBoxBuilder", null, function (object) {
            return object.f("parentBuilder.m_pT").vcast().then(function (builder) { return [builder]; });
        })

        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::LayoutBuilder", "LayoutBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::LayoutBoxBuilder", "LayoutBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::ContainerBoxBuilder", "ContainerBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::FlowBoxBuilder", "FlowBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::FlexBoxBuilder", "FlexBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::GridBoxBuilder", "GridBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::MultiColumnBoxBuilder", "MultiColumnBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::ReplacedBoxBuilder", "ReplacedBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::TableGridBoxBuilder", "TableGridBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::TableBoxBuilder", "TableBoxBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::ContainerBoxInitialLayoutBuilder", "ContainerBoxInitialLayoutBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::FlowBoxInitialLayoutBuilder", "FlowBoxInitialLayoutBuilder");
        FieldSupport.RegisterTypeAlias(MSHTML.Module, "Layout::InitialLayoutBoxBuilderDriver", "InitialLayoutBoxBuilderDriver");
    }

    return {
        Name: "LayoutBuilder",
        BasicType: "LayoutBoxBuilder",
        BuiltInFields: []
    };
})();