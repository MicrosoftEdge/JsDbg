//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

Loader.OnLoad(function () {
    var renderer = new DbgObjectTree.DbgObjectRenderer();
    renderer.addNameRenderer(MSHTML.Type("CDoc"), function (doc) {
        return doc.F("PrimaryMarkup").desc("URL")
        .then(function (url) {
            if (url != null) {
                return "CDoc (" + url + ")";
            } else {
                return "CDoc";
            }
        })
    })

    ObjectDashboard.AddGetter(function (addObject) {
        return MSHTML.GetCDocs()
        .then(function (docs) {
            docs.forEach(function (doc) {
                addObject(doc, renderer);
            })
        })
    })
})