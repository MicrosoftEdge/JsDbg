//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var CounterManager = null;
Loader.OnLoad(function() {
    if (Loader.GetCurrentExtension()== "counter-manager") {
        DbgObjectTree.AddRoot("Counter Manager", function() {
            return MSHTML.GetCDocs().f("_pWindowPrimary._pCWindow._pMarkup._pCounterManager")
                .filter(function (counterManager) { return !counterManager.isNull(); })
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CCounterManager", null, function (object) {
            return Promise.all([object.f("_scopeArray"), object.f("_arrayCounterTextNode")]);
        })

        DbgObjectTree.AddType("nodes", MSHTML.Module, "Tree::CArrayTextNodeCounter", null, function(object) {
            return object.array("Items");
        })

        DbgObjectTree.AddType("counters", MSHTML.Module, "CCPIndexedArray<CElementCounter>", null, function(object) {
            return new PromisedDbgObject.Array(object.f("_aItems").array("Items")).f("data");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CCPIndexedArray<CElementCounter>::SArrayItem", null, function (object) {
            return object.f("data");
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CElementCounter", null, function (object) {
            return object.f("_pCounterValues");
        }, function (object) { return object.f("_bstrName").string(); });

        DbgObjectTree.AddType("mutations", MSHTML.Module, "CCPIndexedArray<CCounterValue>", null, function(object) {
            return new PromisedDbgObject.Array(object.f("_aItems").array("Items")).f("data");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CCounterValue", null, null, function (object) {
            return Promise.all([object.f("_fIsReset").val(), object.f("_lValue").val(), object.f("_lIncrement").val()])
            .thenAll(function (isReset, value, increment) {
                return (isReset ? "reset" : "increment") + " " + increment + " -> " + value;
            });
        });
    }

    CounterManager = {
        Name: "CounterManager",
        RootType: "CCounterManager",
        DefaultFieldType: {
            module: "edgehtml",
            type: "CCounterManager"
        },
        BuiltInFields: []
    };
});