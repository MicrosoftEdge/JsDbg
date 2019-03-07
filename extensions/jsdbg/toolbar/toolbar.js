//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// jsdbg-toolbar.js
// Renders a toolbar at the top of all JsDbg pages.

var JsDbgToolbar = undefined;
Loader.OnLoad(function () {
    var currentExtensionNames = [];
    function updateExtensionList() {
        var content = document.querySelector(".jsdbg-extensions-pane-content");
        if (content == null) {
            return;
        }

        JsDbg.GetExtensions(function (extensions) {
            var currentExtension = Loader.GetCurrentExtension();
            extensions = extensions.extensions.filter(function (e) { 
                if (e.name.toLowerCase() == currentExtension) {
                    if (currentExtension != "wwwroot") {
                        document.querySelector(".jsdbg-title").textContent = e.name;
                    }
                    return false;
                } else if (e.name == "wwwroot") {
                    return true;
                } else {
                    return !e.headless;
                }
            });
            extensions.sort(function (e1, e2) {
                if (e1.name == "wwwroot") {
                    return -1;
                } else if (e2.name == "wwwroot") {
                    return +1;
                } else {
                    return e1.name.localeCompare(e2.name);
                }
            });

            var extensionNames = extensions.map((ext) => ext.name).sort();
            if (JSON.stringify(extensionNames) !== JSON.stringify(currentExtensionNames)) {
                // Only update the toolbar if the set of extensions has changed.
                currentExtensionNames = extensionNames;

                content.innerHTML = "";
                extensions.forEach(function (e) {
                    var link = document.createElement("a");
                    if (e.name == "wwwroot") {
                        link.setAttribute("href", "/");
                    } else {
                        link.setAttribute("href", "/" + e.name.toLowerCase() + "/");
                    }
    
                    var name = document.createElement("span");
                    name.classList.add("jsdbg-extension-name");
                    if (e.name == "wwwroot") {
                        name.appendChild(document.createTextNode("JsDbg"));
                    } else {
                        name.appendChild(document.createTextNode(e.name));
                    }
                    link.appendChild(name);
    
                    if (e.description != null) {
                        var description = document.createElement("span");
                        description.classList.add("jsdbg-extension-description");
                        description.appendChild(document.createTextNode(" " + e.description));
                        link.appendChild(description);
                    }
                    content.appendChild(link);
                    content.appendChild(document.createTextNode(" "));
                });
    
                // Configure the drop-down pane so that it has the proper height.
                document.querySelector(".jsdbg-toolbar").style.display = "";
                content.parentNode.style.height = content.offsetHeight + "px";
            }
        });
    }

    var queuedExtensionListUpdates = 0;
    function queueExtensionListUpdate() {
        setTimeout(function () {
            if (--queuedExtensionListUpdates == 0) {
                updateExtensionList();
            }
        }, 200);
        ++queuedExtensionListUpdates;
    }

    function updateProcessSelector() {
        JsDbg.GetAttachedProcesses((processIds) => {
            var processSelector = document.getElementById("processSelector");
            var selectedProcessId = -1;
            if (processSelector.selectedOptions.length != 0) {
                console.assert(processSelector.selectedOptions.length == 1);
                selectedProcessId = processSelector.selectedOptions[0].value;
            }
            processSelector.innerHTML = "";
            processIds.forEach((processId) => {
                var option = document.createElement("option");
                option.append(processId);
                option.setAttribute("label", processId + " (0x" + processId.toString(16) + ")");
                if (processId == selectedProcessId) {
                    option.setAttribute("selected", "true");
                }
                processSelector.appendChild(option);
            });

            JsDbg.GetTargetProcess((targetProcessId) => {
                var optionToSelect = [...processSelector.options].filter((option) => (option.value == targetProcessId));
                if (processSelector.selectedOptions.length != 0) {
                    console.assert(processSelector.selectedOptions.length == 1);
                    processSelector.selectedOptions[0].setAttribute("selected", "false");
                }
                if (optionToSelect.length == 1) {
                    optionToSelect[0].setAttribute("selected", "true");
                }
            });
        });
    }

    function updateThreadSelector() {
        JsDbg.GetCurrentProcessThreads((threadIds) => {
            var threadSelector = document.getElementById("threadSelector");
            var selectedThreadId = -1;
            if (threadSelector.selectedOptions.length != 0) {
                console.assert(threadSelector.selectedOptions.length == 1);
                selectedThreadId = threadSelector.selectedOptions[0].value;
            }
            threadSelector.innerHTML = "";
            threadIds.forEach((threadId) => {
                var option = document.createElement("option");
                option.append(threadId);
                option.setAttribute("label", threadId + " (0x" + threadId.toString(16) + ")");
                if (threadId == selectedThreadId) {
                    option.setAttribute("selected", "true");
                }
                threadSelector.appendChild(option);
            });

            JsDbg.GetTargetThread((targetThreadId) => {
                var optionToSelect = [...threadSelector.options].filter((option) => (option.value == targetThreadId));
                if (threadSelector.selectedOptions.length != 0) {
                    console.assert(threadSelector.selectedOptions.length == 1);
                    threadSelector.selectedOptions[0].setAttribute("selected", "false");
                }
                if (optionToSelect.length == 1) {
                    optionToSelect[0].setAttribute("selected", "true");
                }
            });
        });
    }

    function buildToolbar() {
        // Insert the toolbar.
        var toolbar = document.createElement("div");
        toolbar.classList.add("jsdbg-toolbar");
        toolbar.style.display = "none";

        var title = document.createElement("div");
        title.classList.add("jsdbg-title");
        title.textContent = "JsDbg";
        toolbar.appendChild(title);
        toolbar.appendChild(document.createTextNode(" "));

        var extensions = document.createElement("div");
        extensions.classList.add("jsdbg-extensions-list");

        var extensionsPane = document.createElement("div");
        extensionsPane.classList.add("jsdbg-extensions-pane");

        var paneContent = document.createElement("div");
        paneContent.classList.add("jsdbg-extensions-pane-content");
        extensionsPane.appendChild(paneContent);

        extensions.appendChild(document.createTextNode("Other Extensions \u25BE"));
        extensions.appendChild(extensionsPane);
        toolbar.appendChild(extensions);

        if (Loader.GetCurrentExtension() != "about") {
            var aboutLink = document.createElement("div");
            aboutLink.classList.add("jsdbg-about-link");
            aboutLink.innerHTML = "<a href=\"/about/\">About</a>";
            toolbar.appendChild(aboutLink);
        }

        var processSelectorPane = document.createElement("div");
        processSelectorPane.classList.add("jsdbg-process-selector");
        processSelectorPane.append("Current process: ");

        var processSelector = document.createElement("select");
        processSelector.setAttribute("id", "processSelector");
        processSelectorPane.appendChild(processSelector);

        processSelector.addEventListener("change", () => {
            console.assert(processSelector.selectedOptions.length == 1)
            JsDbg.SetTargetProcess(processSelector.selectedOptions[0].value);
        }, false);

        toolbar.appendChild(processSelectorPane);

        var threadSelectorPane = document.createElement("div");
        threadSelectorPane.classList.add("jsdbg-thread-selector");
        threadSelectorPane.append("Current thread: ");

        var threadSelector = document.createElement("select");
        threadSelector.setAttribute("id", "threadSelector");
        threadSelectorPane.appendChild(threadSelector);

        threadSelector.addEventListener("change", () => {
            console.assert(threadSelector.selectedOptions.length == 1)
            JsDbg.SetTargetThread(threadSelector.selectedOptions[0].value);
        }, false);

        toolbar.appendChild(threadSelectorPane);

        document.documentElement.insertBefore(toolbar, document.documentElement.firstChild);
        
        updateExtensionList();
    }

    JsDbgToolbar = {
        UpdateExtensionList: queueExtensionListUpdate
    };

    buildToolbar();

    updateProcessSelector();
    updateThreadSelector();

    JsDbg.RegisterOnBreakListener(function () {
        updateExtensionList();
        updateProcessSelector();
        updateThreadSelector();
    });
})