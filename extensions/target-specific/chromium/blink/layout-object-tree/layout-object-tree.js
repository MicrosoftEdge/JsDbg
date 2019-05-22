//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var LayoutObjectTree = undefined;
Loader.OnLoad(function() {
    LayoutObjectTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            var voidObject = DbgObject.create(Chromium.RendererProcessType("void"), address);
            if (!voidObject.isNull()) {
                return voidObject.dcast(Chromium.RendererProcessType("blink::LayoutObject"))
                .then((layoutObject) => (!layoutObject.isNull() ? layoutObject.vcast() : voidObject.vcast()));
            } else {
                return DbgObject.NULL;
            }
        },
        GetRoots: function() {
            return BlinkHelpers.GetRootLayoutObjects("blink::LayoutObject");
        },
        DefaultTypes: [Chromium.RendererProcessType("blink::LayoutObject")]
    };

    LayoutObjectTree.Tree.addChildren(Chromium.RendererProcessType("blink::LayoutObject"), (layoutObject) => {
        return layoutObject.array("child_objects_");
    });

    DbgObject.AddAction(Chromium.RendererProcessType("blink::LayoutObject"), "LayoutObjectTree", (layoutObject) => {
        return TreeInspector.GetActions("layoutobjecttree", "LayoutObjectTree", layoutObject);
    });
});
