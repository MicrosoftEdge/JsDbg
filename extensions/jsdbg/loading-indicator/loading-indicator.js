"use strict";

var JsDbgLoadingIndicator = undefined;
Loader.OnLoad(function () {
    var loadingIndicator = null;

    function initializeProgressIndicator() {
        loadingIndicator = document.createElement("div")
        loadingIndicator.setAttribute("id", "jsdbg-loading-indicator");

        var loadingPanel = document.createElement("div");
        loadingPanel.classList.add("jsdbg-loading-panel");

        loadingIndicator.appendChild(loadingPanel);

        var progress = document.createElement("progress");
        progress.indeterminate = true;
        loadingPanel.appendChild(progress);        
    }

    var loadingReferences = 0;

    JsDbgLoadingIndicator = {
        Show: function () {
            ++loadingReferences;
            if (loadingReferences == 1) {
                loadingIndicator.classList.remove("waiting");
                loadingIndicator.style.display = "block";
            }
        },
        Hide: function () {
            --loadingReferences;
            if (loadingReferences == 0) {
                loadingIndicator.style.display = "none";
            }
        },
        SetIsWaitingForDebugger: function (value) {
            if (value) {
                loadingIndicator.classList.add("waiting");
            } else {
                loadingIndicator.classList.remove("waiting");
            }
        }
    }

    initializeProgressIndicator();
    document.documentElement.appendChild(loadingIndicator);
})