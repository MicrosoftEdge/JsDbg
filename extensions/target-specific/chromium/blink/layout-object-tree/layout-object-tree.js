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
            return BlinkHelpers.GetDocuments()
            .then((documents) => {
                if (documents.length == 0) {
                    var errorMessage = ErrorMessages.CreateErrorsList("No documents found.") +
                        ErrorMessages.CreateErrorReasonsList(ErrorMessages.WrongDebuggee("the Chromium renderer process"),
                            "The debuggee has been broken into prior to <i>g_frame_map</i> being populated.",
                            ErrorMessages.SymbolsUnavailable) +
                        "You may still specify a blink::LayoutObject explicitly.";
                    return Promise.reject(errorMessage);
                } else {
                    return Promise.map(documents, (document) => document.F("node_layout_data_").f("layout_object_").vcast());
                }
            }, (error) => {
                var errorMessage = ErrorMessages.CreateErrorsList(error) +
                    ErrorMessages.CreateErrorReasonsList(ErrorMessages.WrongDebuggee("the Chromium renderer process"), ErrorMessages.SymbolsUnavailable);
                return Promise.reject(errorMessage);
            });
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
