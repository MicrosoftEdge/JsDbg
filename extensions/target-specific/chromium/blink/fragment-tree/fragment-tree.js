//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Google LLC. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var NGPhysicalFragmentTree = undefined;
Loader.OnLoad(function() {
    function fragmentToConcreteType(fragment) {
        return Promise.all([fragment.F("[as box fragment]"), fragment.F("[as line box fragment]"), fragment.F("[as text fragment]")]).thenAll((box, linebox, text) =>
                        !box.isNull() ? box : !linebox.isNull() ? linebox : text);
    }

    NGPhysicalFragmentTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            var voidObject = DbgObject.create(Chromium.RendererProcessType("void"), address);
            if (!voidObject.isNull()) {
                return fragmentToConcreteType(voidObject.as(Chromium.RendererProcessType("blink::NGPhysicalFragment")));
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
                        "You may still specify a blink::NGPhysicalFragment explicitly.";
                    return Promise.reject(errorMessage);
                } else {
                    // We have to get the child of the root layout object (the LayoutView) because LayoutView never has a fragment,
                    return Promise.map(documents, (document) => document.F("node_layout_data_").f("layout_object_").vcast().f("children_.first_child_").vcast().f("cached_layout_result_.ptr_.physical_fragment_.ptr_"));
                }
            }, (error) => {
                var errorMessage = ErrorMessages.CreateErrorsList(error) +
                    ErrorMessages.CreateErrorReasonsList(ErrorMessages.WrongDebuggee("the Chromium renderer process"), ErrorMessages.SymbolsUnavailable);
                return Promise.reject(errorMessage);
            });
        },
        DefaultTypes: [Chromium.RendererProcessType("blink::NGPhysicalFragment")]
    };

    NGPhysicalFragmentTree.Tree.addChildren(Chromium.RendererProcessType("blink::NGPhysicalFragment"), (fragment) => {
        return fragment.array("children_");
    });

    NGPhysicalFragmentTree.Tree.addChildren(Chromium.RendererProcessType("blink::NGLinkStorage"), (link) => {
        return fragmentToConcreteType(link.f("fragment"));
    });

    NGPhysicalFragmentTree.Renderer.addNameRenderer(Chromium.RendererProcessType("blink::NGLinkStorage"), (storage) => {
        return storage.f("offset").desc().then((offset) => `NGLinkStorage (offset ${offset})`);
    });

    DbgObject.AddAction(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "NGPhysicalFragmentTree", (fragment) => {
        return TreeInspector.GetActions("fragmenttree", "NGPhysicalFragmentTree", fragment);
    });
});
