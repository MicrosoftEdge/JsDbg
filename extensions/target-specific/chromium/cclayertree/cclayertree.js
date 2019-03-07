//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var CCLayerTree = undefined;
Loader.OnLoad(function() {
    CCLayerTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            // Handle both Layer and LayerTreeHost (the latter should only ever appear
            // at the root)
            var voidObj = DbgObject.create("ntdll!void", address);
            if (!voidObj.isNull()) {
                return voidObj.dcast(Chromium.RendererProcessType("cc::Layer"))
                .then(layer => {
                    if (!layer.isNull()) {
                        return layer.vcast();
                    } else {
                        return voidObj.dcast(Chromium.RendererProcessType("cc::LayerTreeHost"));
                    }
                })
            }
            return DbgObject.NULL;
        },
        GetRoots: function() {
            // Grovel around the global view map to find a LayerTreeHost pointer.
            // At this point in time, we've only ever seen a single RenderWidget
            // (the renderViewImplPointer) in a given renderer process. Once this
            // map is better understood, we may want to add sorting functionlity
            // to have the 'most important' layer tree host be the first entry.
            return DbgObject.global(Chromium.RendererProcessSyntheticModuleName, "g_view_map")
            .then((viewMap) => {
                return Promise.map(viewMap.F("Object").array("Values"), renderViewImplPointer => renderViewImplPointer.deref().f("render_widget_", "").f("layer_tree_view_").F("Object").f("layer_tree_host_").F("Object"));
            })
            .then(null, (error) => {
                var errorMessage = ErrorMessages.CreateErrorsList(error) +
                    ErrorMessages.CreateErrorReasonsList(ErrorMessages.WrongDebuggee("the Chromium renderer process"), ErrorMessages.SymbolsUnavailable);
                return Promise.reject(errorMessage);
            });
        },
        DefaultTypes: []
    };

    CCLayerTree.Tree.addChildren(Chromium.RendererProcessType("cc::Layer"), (parentLayer) => {
        return parentLayer.f("inputs_").f("children").array("Elements").map(scoped_ref_ptr => scoped_ref_ptr.f("ptr_").vcast());
    });

    CCLayerTree.Tree.addChildren(Chromium.RendererProcessType("cc::LayerTreeHost"), (layerTreeHost) => {
        return layerTreeHost.f("root_layer_.ptr_").vcast();
    });

    DbgObject.AddAction(Chromium.RendererProcessType("cc::LayerTreeHost"), "CCLayerTree", (layerTreeHost) => {
        return TreeInspector.GetActions("cclayertree", "CCLayerTree", layerTreeHost);
    });

    DbgObject.AddAction(Chromium.RendererProcessType("cc::Layer"), "CCLayerTree", (layer) => {
        return TreeInspector.GetActions("cclayertree", "CCLayerTree", layer);
    });

    DbgObject.AddExtendedField(Chromium.RendererProcessType("cc::LayerTreeHost"), "layer_tree_host_impl_", Chromium.RendererProcessType("cc::LayerTreeHostImpl"), UserEditableFunctions.Create((layerTreeHost) => {
        return layerTreeHost.f("proxy_").F("Object").vcast().f("proxy_impl_").F("Object").f("host_impl_").F("Object");
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("cc::LayerTreeHostImpl"), "sync_tree_", Chromium.RendererProcessType("cc::LayerTreeImpl"), UserEditableFunctions.Create((layerTreeHostImpl) => {
        return layerTreeHostImpl.f("settings_").f("commit_to_active_tree").val()
        .then((commitToActiveTree) => commitToActiveTree ? layerTreeHostImpl.f("active_tree_").F("Object") : layerTreeHostImpl.f("pending_tree_").F("Object"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("cc::Layer"), "layer_impl_", Chromium.RendererProcessType("cc::LayerImpl"), UserEditableFunctions.Create((layer) => {
        return layer.f("layer_tree_host_").F("layer_tree_host_impl_").F("sync_tree_").f("layers_").F("Object").array("Elements").filter((layerImpl) => {
            return Promise.all([layer.desc("layer_id_"), layerImpl.F("Object").f("layer_id_").val()])
            .thenAll((layerId, layerImplId) => layerId == layerImplId);
        })
        .then((layerImpl) => {
            console.assert(layerImpl.length <= 1);
            return (layerImpl.length == 1) ? layerImpl[0].F("Object").vcast() : DbgObject.NULL;
        });
    }));

    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("cc::Layer"),
        "bounds",
        false,
        UserEditableFunctions.Create((layer) => layer.f("inputs_").f("bounds").desc())
    );

    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("cc::Layer"),
        "layer_id_",
        false,
        UserEditableFunctions.Create((layer) => layer.f("inputs_").f("layer_id").val())
    );

    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("cc::ElementId"),
        "id",
        true,
        UserEditableFunctions.Create((elementId) => elementId.f("id_").val())
    );

});
