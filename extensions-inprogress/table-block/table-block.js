//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var TableBlock = undefined;
Loader.OnLoad(function() {
    if (Loader.GetCurrentExtension()== "table-block") {
        DbgObjectTree.AddAddressInterpreter(function(address) {
            return DbgObject.create(MSHTML.Module, "Tree::ComputedBlock", address).vcast();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "Tree::TableBlock", null, function (object) {
            return Promise.all([object.f("tableGrid.m_pT")]);
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "Tree::TableGridBlock", null, function (object) {
            return Promise.all([object.f("header.m_pT"), object.f("bodies").array("Items").f("m_pT"), object.f("footer.m_pT")]);
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "Tree::TableRowGroupBlock", null, function (object) {
            return Promise.all([object.f("rows").array("Items").f("m_pT")]);
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "Tree::TableRowBlock", null, function (object) {
            return Promise.all([object.f("cells").array("Items").f("m_pT")]);
        })
    }

    TableBlock = {
        Name: "TableBlock",
        RootType: "ComputedBlock",
        DefaultFieldType: {
            module: "edgehtml",
            type: "Tree::ComputedBlock"
        },
        BuiltInFields: []
    };
});