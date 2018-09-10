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

        var feedback = document.createElement("div");
        feedback.classList.add("jsdbg-feedback-container");

        var feedbackLink = document.createElement("a");
        feedbackLink.setAttribute("href", "#feedback");
        feedbackLink.appendChild(document.createTextNode("Send Feedback"));
        feedbackLink.addEventListener("click", function (e) {
            e.preventDefault();
            feedback.classList.toggle("showing-pane");
            feedbackPane.querySelector("textarea").focus();
        })
        feedback.appendChild(feedbackLink);

        var feedbackPane = document.createElement("div");
        feedbackPane.classList.add("jsdbg-feedback-pane");
        feedbackPane.innerHTML = "<textarea placeholder=\"Please report any bugs, suggestions, or other feedback here.\"></textarea><br><button>Send Feedback</submit>";

        feedbackPane.querySelector("button").addEventListener("click", function() {
            var feedbackMessage = feedbackPane.querySelector("textarea").value.trim();
            if (feedbackMessage.length > 0) {
                JsDbg.SendFeedback(feedbackMessage, function (result) {
                    if (result.success) {
                        feedbackPane.querySelector("textarea").value = "";
                        feedback.classList.toggle("showing-pane");
                        feedbackLink.textContent = "Thank you for your feedback!";
                        setTimeout(function () {
                            feedbackLink.textContent = "Send Feedback";
                        }, 3000);
                    } else {
                        alert(result.error);
                    }
                })
            } else {
                feedback.classList.toggle("showing-pane");
            }
        })
        feedback.appendChild(feedbackPane);

        toolbar.appendChild(feedback);

        document.documentElement.insertBefore(toolbar, document.documentElement.firstChild);
        
        updateExtensionList();
    }

    JsDbgToolbar = {
        UpdateExtensionList: queueExtensionListUpdate
    };

    buildToolbar();

    JsDbg.RegisterOnBreakListener(function () {
        updateExtensionList();
    });
})