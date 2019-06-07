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

    function layoutObjectChildrenToFragments(layoutObject) {
        return layoutObject.array("child_objects_").dcast(new DbgObjectType("blink::LayoutBox", layoutObject.type)).map((box) => {
            return box.F("NGPhysicalFragment").then((fragment) => {
                if (fragment.isNull())
                    return box.vcast();
                return fragmentToConcreteType(fragment);
            });
        });
    }

    NGPhysicalFragmentTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            var voidObject = DbgObject.create(Chromium.RendererProcessType("void"), address);
            if (voidObject.isNull()) {
                return DbgObject.NULL;
            }
            return voidObject.vcast().then((object) => {
                return object.isType(Chromium.RendererProcessType("blink::LayoutObject")).then((is_layout_object) => {
                    if (is_layout_object)
                        return object;
                    return fragmentToConcreteType(voidObject.as(Chromium.RendererProcessType("blink::NGPhysicalFragment")));
                })
            }, () => fragmentToConcreteType(voidObject.as(Chromium.RendererProcessType("blink::NGPhysicalFragment"))));

        },
        GetRoots: function() {
            return DbgObject.global(Chromium.RendererProcessSyntheticModuleName, "is_layout_ng_enabled_", "bool", "blink::RuntimeEnabledFeatures").val().then((isLayoutNGEnabled) => {
                if (!isLayoutNGEnabled) {
                    var errorMessage = ErrorMessages.CreateErrorsList("LayoutNG is disabled.") +
                        ErrorMessages.CreateErrorReasonsList(
                            "Enable LayoutNG in chrome://flags or run with --enable-blink-features=LayoutNG");
                    return Promise.reject(errorMessage);
                }
                return BlinkHelpers.GetRootLayoutObjects("blink::LayoutObject", "blink::NGPhysicalFragment");
            }, (error) => {
                var errorMessage = ErrorMessages.CreateErrorsList(error) +
                    ErrorMessages.CreateErrorReasonsList(ErrorMessages.WrongDebuggee("the Chromium renderer process"), ErrorMessages.SymbolsUnavailable);
                return Promise.reject(errorMessage);
            });
        },
        DefaultTypes: [Chromium.RendererProcessType("blink::NGPhysicalFragment")]
    };



    NGPhysicalFragmentTree.Tree.addChildren(Chromium.RendererProcessType("blink::NGPhysicalFragment"), (fragment) => {
        return fragment.array("children_").then((children) => {
            if (children.length > 0)
                return children;
            // If this fragment has no children, it's still possible that child layout
            // objects have fragments, or certainly that a descendant has fragments,
            // in case of a legacy/NG boundary.
            return fragment.f("layout_object_").then(layoutObjectChildrenToFragments);
        });
    });

    NGPhysicalFragmentTree.Tree.addChildren(Chromium.RendererProcessType("blink::LayoutObject"), (object) => {
        return layoutObjectChildrenToFragments(object);
    });

    // NGLinkStorage is the old name for NGLink
    NGPhysicalFragmentTree.Tree.addChildren((type) => type.name().match(/^blink::NGLink(Storage)?$/), (link) => {
        return fragmentToConcreteType(link.f("fragment"));
    });

    // NGLinkStorage is the old name for NGLink
    NGPhysicalFragmentTree.Renderer.addNameRenderer((type) => type.name().match(/^blink::NGLink(Storage)?$/), (link) => {
        return link.f("offset").desc().then((offset) => `<span style="color: grey;">${link.type.name()} (offset ${offset})</span>`);
    });

    NGPhysicalFragmentTree.Renderer.addNameRenderer(Chromium.RendererProcessType("blink::LayoutObject"), (object) => {
        return `<span style="color: red;">${object.type.name()} (no fragment)</span>`;
    });


    DbgObject.AddAction(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "NGPhysicalFragmentTree", (fragment) => {
        return TreeInspector.GetActions("fragmenttree", "NGPhysicalFragmentTree", fragment);
    });
});
