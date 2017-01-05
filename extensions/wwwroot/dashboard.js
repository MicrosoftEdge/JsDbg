"use strict";

var Dashboard = undefined;
Loader.OnLoad(function() {
    var panels = [];

    if (Loader.GetCurrentExtension() == "wwwroot") {
        Loader.OnPageReady(function() {
            panels.sort(function(a, b) {
                return a.priority - b.priority;
            });

            panels.forEach(function (panel) {
                document.body.appendChild(panel.panel);
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