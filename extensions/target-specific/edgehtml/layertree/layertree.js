//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var LayerTree = undefined;
Loader.OnLoad(function() {
    // Define the tree.
    LayerTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            return DbgObject.create(MSHTML.Type("void"), address).vcast();
        },
        GetRoots: function() {
            return MSHTML.GetCDocs()
            .filter(function (doc) {
                return doc.f("_spLayerManager.m_pT").isNull()
                .then(function (isNull) {
                    return !isNull;
                })
            })
            .then(function(docsWithLayerManagers) {
                if (docsWithLayerManagers.length == 0) {
                    return Promise.reject();
                }
                return docsWithLayerManagers;
            })
            .then(null, function(error) {
                var errorMessage =
                    "No Layer Managers were found.\
                    Possible reasons:\
                    <ul>\
                        <li>The debuggee is not IE 11 or Edge.</li>\
                        <li>No page is loaded.</li>\
                        <li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li>\
                        <li>Symbols aren't available.</li>\
                    </ul>\
                    Refresh the page to try again, or specify an object explicitly.";

                if (error) {
                    errorMessage = "<h4>" + error.toString() + "</h4>" + errorMessage;
                }
                return Promise.reject(errorMessage);
            });
        },
        DefaultTypes: [],
    };

    LayerTree.Tree.addChildren(MSHTML.Type("CDoc"), function (doc) {
        return doc.f("_spLayerManager.m_pT").vcast();
    });

    LayerTree.Renderer.addNameRenderer(MSHTML.Type("CDoc"), function (doc) {
        return doc.F("PrimaryMarkup").desc("URL")
        .then(function (url) {
            if (url != null) {
                return "CDoc (" + url + ")"
            } else {
                return "CDoc";
            }
        })
    })

    LayerTree.Renderer.addNameRenderer(function (x) { return (x.name().indexOf("RefCounted") == 0); }, function (refCounted) {
        var typeString = refCounted.type.htmlName();
        typeString = typeString.substr(typeString.indexOf("&lt;") + 4);
        typeString = typeString.substr(0, typeString.lastIndexOf(","));
        return typeString;
    })

    LayerTree.Tree.addChildren(MSHTML.Type("CWUCLayerManager"), function (layerManager) {
        return layerManager.f("_spRootLayer.m_pT").vcast();
    })

    LayerTree.Tree.addChildren(MSHTML.Type("CDCompLayerManager"), function (layerManager) {
        return layerManager.f("_spRootLayer.m_pT").vcast();
    })

    LayerTree.Tree.addChildren(MSHTML.Type("CWUCLayer"), function (layerManager) {
        return layerManager.f("_pFirstChildLayer").list("_pNextLayer").vcast();
    })

    LayerTree.Tree.addChildren(MSHTML.Type("CDCompLayer"), function (layerManager) {
        return layerManager.f("_pFirstChildLayer").list("_pNextLayer").vcast();
    })

    function getDocOrLayerManager(layerManager) {
        // Check if there's a CDoc that owns it.
        return MSHTML.GetCDocs()
        .filter(function (doc) {
            return doc.f("_spLayerManager.m_pT").vcast().equals(layerManager)
        })
        .then(function (docs) {
            if (docs.length > 0) {
                return docs[0];
            } else {
                return layerManager;
            }
        })
    }

    // Add DbgObject actions for links to the display tree.
    DbgObject.AddAction(MSHTML.Type("IDispLayer"), "LayerTree", function (layer) {
        return layer.vcast().f("_pLayerManager").vcast()
        .then(getDocOrLayerManager)
        .then(function (rootNode) {
            return TreeInspector.GetActions("layertree", "Layer Tree", rootNode, layer);
        })
    });

    DbgObject.AddAction(MSHTML.Type("IDispLayerManager"), "LayerTree", function (layerManager) {
        return getDocOrLayerManager(layerManager)
        .then(function (rootNode) {
            return TreeInspector.GetActions("layertree", "Layer Tree", rootNode, layerManager);
        })
    });

    DbgObject.AddAction(MSHTML.Type("CDoc"), "LayerTree", function (doc) {
        return TreeInspector.GetActions("layertree", "Layer Tree", doc);
    });
});
