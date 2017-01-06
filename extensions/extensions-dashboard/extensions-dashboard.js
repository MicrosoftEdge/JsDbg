"use strict";

Loader.OnLoad(function() {
    var panel = document.createElement("ul");
    function realizeExtension(ext) {
        if (ext.headless) {
            return;
        }

        var li = document.createElement("li");
        li.className = "loadedExtension";
        li.innerHTML = "<h3><a href='/" + ext.name.toLowerCase() + "/'>" + ext.name + "</a> </h3>" +
            (ext.author ? "<p class='author'>" + ext.author + "</p>" : "") +
            (ext.description ? "<p class='description'>" + ext.description + "</p>" : "");
        panel.appendChild(li);
    }

    function reloadExtensions(oncomplete) {
        var loadedExtensions = document.querySelectorAll("li.loadedExtension");
        for (var i = 0; i < loadedExtensions.length; ++i) {
        }

        JsDbg.GetExtensions(function(result) {
            result.extensions.sort(function(a, b) { return a.name.localeCompare(b.name); });
            result.extensions.forEach(realizeExtension);
            if (oncomplete) {
                oncomplete();
            }            
        });
    }

    var panelPromise = new Promise(function (onsuccess) {
        Loader.OnPageReady(function() {
            // Get any startup extensions.
            JsDbg.GetPersistentData(null, function(data) {
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