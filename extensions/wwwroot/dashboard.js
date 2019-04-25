//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var Dashboard = undefined;
Loader.OnLoad(function() {
    var panels = [];

    if (Loader.GetCurrentExtension() == "wwwroot") {
        Loader.OnPageReady(function() {
            panels.sort(function(a, b) {
                return a.priority - b.priority;
            });

            return Promise.all(panels.map(function (panel) {
                return Promise.resolve(panel.panel)
                .catch(function () { return null; });
            }))
            .then(function (resolvedPanels) {
                resolvedPanels.forEach(function (panel) {
                    if (panel != null) {
                        document.body.appendChild(panel);
                    }
                })
            })
        });
    }

    Dashboard = {
        AddPanel: function (panel, priority) {
            panels.push({
                panel: panel,
                priority: priority
            })
        }
    }
})