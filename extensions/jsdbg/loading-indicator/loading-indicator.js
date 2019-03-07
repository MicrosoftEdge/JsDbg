//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var JsDbgLoadingIndicator = undefined;
Loader.OnLoad(function () {
    var loadingIndicator = null;
    var loadingPanel = null;
    var abortButton = null;

    function initializeProgressIndicator() {
        loadingIndicator = document.createElement("div")
        loadingIndicator.setAttribute("id", "jsdbg-loading-indicator");

        loadingPanel = document.createElement("div");
        loadingPanel.classList.add("jsdbg-loading-panel");

        loadingIndicator.appendChild(loadingPanel);

        abortButton = document.createElement("button");
        abortButton.addEventListener("click", function () {
            if (messageProviders.length > 0 && messageProviders[0].abort != null) {
                messageProviders[0].abort();
            }
        });
        abortButton.textContent = "Cancel";
        abortButton.className = "abort small-button light";
        loadingPanel.appendChild(abortButton);

        var progress = document.createElement("progress");
        progress.indeterminate = true;
        loadingPanel.appendChild(progress);    

        updateMessage();
    }

    var ambientMessage = "Loading...";

    var ambientMessageTimeout = null;
    function updateAmbientMessage(newMessage) {
        ambientMessage = newMessage;
        if (ambientMessageTimeout != null) {
            window.clearTimeout(ambientMessageTimeout);
        }

        ambientMessageTimeout = window.setTimeout(function() {
            ambientMessage = "Loading...";
            ambientMessageTimeout = null;
        }, 1000);
    }

    function updateMessage() {
        var message = ambientMessage;
        var canBeAborted = false;

        for (var i = 0; i < messageProviders.length; ++i) {
            try {
                message = messageProviders[i].getMessage();
                canBeAborted = !!messageProviders[i].abort;
                window.requestAnimationFrame(updateMessage);
                break;
            } catch (ex) {
                continue;
            }
        }

        loadingPanel.setAttribute("data-loading-message", message);
        abortButton.style.display = (canBeAborted ? "" : "none");
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
        AddMessageProvider: function(f, abort) {
            this.Show();
            messageProviders.push({ getMessage: f, abort: abort });
            updateMessage();
        },
        RemoveMessageProvider: function(f) {
            var newMessageProviders = messageProviders.filter(function(x) { return x.getMessage != f; });
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
        },
        ShowAmbientMessage: function (message) {
            updateAmbientMessage(message);
            updateMessage();
        }
    }

    initializeProgressIndicator();
    document.documentElement.appendChild(loadingIndicator);

    JsDbgLoadingIndicator.Show();
    Loader.OnPageReady(function() {
        JsDbgLoadingIndicator.Hide();
    })
})