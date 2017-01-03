"use strict";

Loader.OnLoad(function () {

    var renderer = new DbgObjectTree.DbgObjectRenderer();
    renderer.addNameRenderer(MSHTML.Module, "CDoc", function (doc) {
        return doc.F("PrimaryMarkup").desc("URL")
        .then(function (url) {
            if (url != null) {
                return "CDoc (" + url + ")";
            } else {
                return "CDoc";
            }
        })
    })

    Dashboard.AddObjectGetter(function (addObject) {
        return Promise.sort(
            MSHTML.GetCDocs(),
            function (a) {
                return a.F("PrimaryMarkup").desc("URL");
            },
            function (a, b) {
                if (a == b) {
                    return 0;
                } else if (a == null) {
                    return 1;
                } else if (b == null) {
                    return -1;
                } else {
                    return a.localeCompare(b);
                }
            }
        )
        .then(function (docs) {
            docs.forEach(function (doc) {
                addObject(doc, renderer);
            })
        })
    })
})