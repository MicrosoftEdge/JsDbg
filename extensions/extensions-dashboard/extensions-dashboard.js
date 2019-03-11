//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

Loader.OnLoad(function() {
    var panel = document.createElement("ul");
    var currentExtensionNames = [];
    function realizeExtension(ext) {
        if (ext.headless) {
            return;
        }

        var li = document.createElement("li");
        li.className = "loadedExtension";
        li.innerHTML = "<a href='/" + ext.name.toLowerCase() + "/'>" + ext.name + "</a>" +
            (ext.author ? "<p class='author'>" + ext.author + "</p>" : "") +
            (ext.description ? "<p class='description'>" + ext.description + "</p>" : "") +
            "";
        panel.appendChild(li);
    }

    function reloadExtensions(oncomplete) {
        JsDbg.GetExtensions(function(result) {
            result.extensions.sort(function(a, b) { return a.name.localeCompare(b.name); });
            var extensionNames = result.extensions.map((ext) => ext.name);
            if (JSON.stringify(extensionNames) !== JSON.stringify(currentExtensionNames)) {
                // Only update the dashboard if the set of extensions has changed.
                currentExtensionNames = extensionNames;

                panel.innerHTML = "";
                result.extensions.forEach(realizeExtension);
            }
            if (oncomplete) {
                oncomplete();
            }
        });
    }

    JsDbg.RegisterOnBreakListener(function () {
        reloadExtensions();
    });

    var panelPromise = new Promise(function (onsuccess) {
        Loader.OnPageReady(function() {
            // Get any startup extensions.
            JsDbg.GetPersistentData(function(data) {
                if (typeof(data) == typeof({}) && "_CATALOG-extension-manager" in data) {
                    var extensions = data["_CATALOG-extension-manager"];
                    if (extensions.startup && Array.isArray(extensions.startup) && extensions.startup.length > 0) {
                        var remainingLoads = extensions.startup.length;
                        extensions.startup.forEach(function (path) {
                            JsDbg.LoadExtension(path, function() {
                                if (--remainingLoads == 0) {
                                    reloadExtensions();
                                }
                            });
                        });
                    } else {
                        reloadExtensions(onsuccess);
                    }
                } else {
                    reloadExtensions(onsuccess);
                }
            });
        });
    })
    .then(function() {
        return panel;
    })

    panel.className = "extensions dashboard-panel";
    Dashboard.AddPanel(panelPromise, 5);
})