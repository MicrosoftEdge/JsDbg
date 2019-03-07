//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var TreeExtensionTemplate = undefined;
Loader.OnLoad(function() {
    TreeExtensionTemplate = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            return DbgObject.create("ntdll!void", address);
        },
        GetRoots: function() {
            return Promise.resolve([]);
        },
        DefaultTypes: []
    };

    // TreeExtensionTemplate.Tree.addChildren(DbgObjectType("ntdll!void"), (voidObj) => {
    //     return [DbgObject.NULL];
    // });

    // TreeExtensionTemplate.Renderer.addNameRenderer(DbgObjectType("ntdll!void"), (voidObj) => {
    //     return "Type name to render";
    // });

    // DbgObject.AddAction(DbgObjectType("ntdll!void"), "TreeExtensionTemplate", (voidObj) => {
    //     return TreeInspector.GetActions("treeExtensionTemplate", "TreeExtensionTemplate", voidObj);
    // });
});