//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var AXTree = undefined;
Loader.OnLoad(function() {
    var wrapperMaps = new Map();
    var managersPromise = null;

    function clearCaches() {
        wrapperMaps = new Map();
        managersPromise = null;
    }

    function getManagers() {
        if (managersPromise == null) {
            managersPromise = DbgObject.global(Chromium.BrowserProcessSyntheticModuleName, "g_ax_tree_id_map").F("Object").array("Pairs").f("second");
        }
        return managersPromise;
    }

    function getWrapperNode(manager, nodeId) {
        var mapPromise = null;
        if (wrapperMaps.has(manager.ptr())) {
            mapPromise = wrapperMaps.get(manager.ptr());
        } else {
            mapPromise = manager.f("id_wrapper_map_").array("Pairs").map((pair) => Promise.all([pair.f("first").val(), pair.f("second").vcast()]))
            .then((pairs) => {
                var newMap = new Map();
                pairs.forEach((pair) => newMap.set(pair[0], pair[1]));
                return newMap;
            });
            wrapperMaps.set(manager.ptr(), mapPromise);
        }

        return mapPromise.then((map) => map.has(nodeId) ? map.get(nodeId) : DbgObject.NULL);
    }

    JsDbg.RegisterOnBreakListener(clearCaches);
    JsDbg.RegisterOnMemoryWriteListener(clearCaches);

    AXTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            var voidObject = DbgObject.create(Chromium.BrowserProcessType("void"), address);
            if (!voidObject.isNull()) {
                return voidObject.vcast();
            } else {
                return DbgObject.NULL;
            }
        },
        GetRoots: function() {
            return getManagers().f("tree_").F("Object").vcast()
            .then((trees) => ((trees.length == 0) ? Promise.reject("No accessibility trees found.") : trees))
            .then(null, (error) => {
                var errorMessage = ErrorMessages.CreateErrorsList(error) +
                    ErrorMessages.CreateErrorReasonsList(ErrorMessages.WrongDebuggee("the Chromium browser process"),
                    "Browser accessibility settings (chrome://accessibility) have not been set.",
                    ErrorMessages.SymbolsUnavailable);
                return Promise.reject(errorMessage);
            });
        },
        DefaultTypes: []
    };

    AXTree.Tree.addChildren(Chromium.BrowserProcessType("ui::AXTree"), (tree) => tree.f("root_"));
    AXTree.Tree.addChildren(Chromium.BrowserProcessType("ui::AXNode"), (node) => node.f("children_").array("Elements").deref());

    AXTree.Renderer.addNameRenderer(Chromium.BrowserProcessType("ui::AXTree"), (tree) => {
        return tree.f("data_.url").desc()
        .then((url) => `AXTree (${url})`);
    });
    AXTree.Renderer.addNameRenderer(Chromium.BrowserProcessType("ui::AXNode"), (node) =>
        Promise.all([
            node.f("data_.role").constant().then((str) => str.substr(1)),
            node.f("data_.id").val()
        ])
        .thenAll((role, id) => `${role}(#${id})`)
    );

    DbgObject.AddExtendedField(
        Chromium.BrowserProcessType("ui::AXNode"),
        "Manager",
        Chromium.BrowserProcessType("content::BrowserAccessibilityManager"),
        (node) => {
            return Promise.all([getManagers(), node.list("parent_")])
            .thenAll((managers, ancestry) => {
                return Promise.filter(managers, (manager) => manager.f("tree_").F("Object").vcast().f("root_").equals(ancestry[ancestry.length - 1]));
            })
            .then((managers) => managers[0]);
        }
    );

    DbgObject.AddExtendedField(
        Chromium.BrowserProcessType("ui::AXNode"),
        "Tree",
        Chromium.BrowserProcessType("ui::AXTree"),
        (node) => node.F("Manager").f("tree_").F("Object").vcast()
    );

    DbgObject.AddExtendedField(
        Chromium.BrowserProcessType("ui::AXNode"),
        "Wrapper",
        Chromium.BrowserProcessType("content::BrowserAccessibility"),
        (node) => Promise.all([node.F("Manager"), node.f("data_.id").val()]).thenAll(getWrapperNode)
    );

    DbgObject.AddExtendedField(
        Chromium.BrowserProcessType("content::BrowserAccessibility"),
        "AsBrowserAccessibilityWin",
        Chromium.BrowserProcessType("content::BrowserAccessibilityWin"),
        (ba) => ba.dcast("content::BrowserAccessibilityWin")
    );

    DbgObject.AddAction(Chromium.BrowserProcessType("ui::AXNode"), "AXTree", (node) => TreeInspector.GetActions("axtree", "AXTree", node.F("Tree"), node));

    DbgObject.AddTypeDescription(Chromium.BrowserProcessType("ui::AXNode"), "Attributes", false, UserEditableFunctions.Create(function (node) {return  node.f("data_").desc("Attributes")}));

    DbgObject.AddTypeDescription(Chromium.BrowserProcessType("ui::AXNodeData"), "Attributes", false, UserEditableFunctions.Create(function (data) {
        return Promise.all([
            data.f("string_attributes").array("Elements"),
            data.f("int_attributes").array("Elements"),
            data.f("float_attributes").array("Elements"),
            data.f("bool_attributes").array("Elements"),
            data.f("intlist_attributes").array("Elements"),
            data.f("stringlist_attributes").array("Elements"),
            data.f("html_attributes").array("Elements"),
        ])
        .thenAll(Array.prototype.concat.bind([]));
    }))
});