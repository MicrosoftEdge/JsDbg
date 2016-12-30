"use strict";

var JsDbgLoadingIndicator = undefined;
Loader.OnLoad(function () {
    var loadingIndicator = null;
    var loadingPanel = null;

    function initializeProgressIndicator() {
        loadingIndicator = document.createElement("div")
        loadingIndicator.setAttribute("id", "jsdbg-loading-indicator");

        loadingPanel = document.createElement("div");
        loadingPanel.classList.add("jsdbg-loading-panel");

        loadingIndicator.appendChild(loadingPanel);

        var progress = document.createElement("progress");
        progress.indeterminate = true;
        loadingPanel.appendChild(progress);    

        updateMessage();
    }

    function updateMessage() {
        var message = "Loading...";
        for (var i = 0; i < messageProviders.length; ++i) {
            try {
                message = messageProviders[i]();
                window.requestAnimationFrame(updateMessage);
                break;
            } catch (ex) {
                continue;
            }
        }
        loadingPanel.setAttribute("data-loading-message", message);
    }

    var loadingReferences = 0;
    var messageProviders = [];

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
        AddMessageProvider: function(f) {
            this.Show();
            messageProviders.push(f);
            updateMessage();
        },
        RemoveMessageProvider: function(f) {
            var newMessageProviders = messageProviders.filter(function(x) { return x != f; });
            for (var i = 0; i < messageProviders.length - newMessageProviders.length; ++i) {
                this.Hide();
            }
            messageProviders = newMessageProviders;
            updateMessage();
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