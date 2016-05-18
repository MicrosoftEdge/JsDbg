"use strict";

var TreeInspector = (function() {
    var rootsElement = null;
    var pointerField = null;
    var treeContainer = null;
    var treeRoot = null;
    var renderRoot = null;
    var renderTreeRootPromise = null;
    var lastRenderedPointer = null;
    var currentRoots = [];
    var treeAlgorithm = null;
    var treeAlgorithms = { };

    return {
        GetActions: function (extension, description, rootObjectPromise, emphasisObjectPromise) {
            return Promise.join([rootObjectPromise, emphasisObjectPromise])
            .then(function (results) {
                var rootObject = results[0];
                var emphasisObject = results[1];

                if (!(rootObject instanceof DbgObject) || rootObject.isNull()) {
                    return [];
                }

                var hash;
                if (emphasisObject instanceof DbgObject) {
                    hash = "#r=" + rootObject.ptr() + ";n=" + emphasisObject.ptr();
                } else {
                    hash = "#r=" + rootObject.ptr();
                }

                extension = extension.toLowerCase();

                return [{
                    description: description,
                    action: "/" + extension + "/" + hash,
                    target: extension + "-" + rootObject.ptr()
                }];
            })
        },

        Initialize: function(getRoots, treeDefinition, treeRenderer, interpretAddress, defaultTypes, container) {
            function createAndRender(emphasisNodePtr) {
                if (lastRenderedPointer != pointerField.value) {
                    // Don't re-render if we've already rendered.
                    pointerField.value = pointerField.value.trim();
                    Promise.as(interpretAddress(new PointerMath.Pointer(pointerField.value, 16)))
                    .then(function(rootObject) { 
                        render(treeDefinition.createTree(rootObject), emphasisNodePtr); 
                    }, showError);
                } else {
                    emphasizeNode(emphasisNodePtr);
                }
            }

            function render(rootObject, emphasisNodePtr) {
                treeRoot = rootObject;
                lastRenderedPointer = pointerField.value;

                var fullyExpand = window.sessionStorage.getItem(id("FullyExpand")) !== "false";
                window.name = Loader.GetCurrentExtension().toLowerCase() + "-" + treeRoot.getObject().ptr();

                renderTreeRootPromise = treeRenderer.createRenderRoot(treeRoot)
                .then(function (renderRoot) {
                    return FieldSupport.Initialize(
                        renderRoot,
                        defaultTypes, 
                        function() {
                            var defer = window.setImmediate || window.msSetImmediate || (function (f) { window.setTimeout(f, 0); });
                            defer(function() {
                                if (renderTreeRootPromise != null) {
                                    return renderTreeRootPromise
                                    .then(function updateRenderTree(renderTreeRoot) {
                                        return renderTreeRoot.updateRepresentation();
                                    });
                                }
                            })
                        },
                        createFieldSupportContainer()
                    )
                })
                .then(function (renderRoot) {
                    return treeAlgorithm.BuildTree(treeContainer, renderRoot, fullyExpand);
                })
                .then(function(renderTreeNodeResult) {
                    emphasizeNode(emphasisNodePtr);
                    return renderTreeNodeResult;
                }, showError);
                return renderTreeRootPromise;
            }

            function emphasizeNode(emphasisNodePtr) {
                // Deemphasize old node.
                var oldEmphasizedNode = treeContainer.querySelector(".emphasize.node");
                if (oldEmphasizedNode != null) {
                    oldEmphasizedNode.classList.remove("emphasize"); 
                };

                // Emphasize new node.
                if (emphasisNodePtr != null) {
                    var emphasisNode = treeContainer.querySelector("#object-" + emphasisNodePtr.replace("`", ""));
                    if (emphasisNode != null) {
                        if (!isVisible(emphasisNode)) {
                            emphasisNode.scrollIntoView();
                        }
                        emphasisNode.classList.add("emphasize");
                    } else {
                        if (confirm("The object you selected was not found in the tree.  Use it as the root instead?")) {
                            pointerField.value = emphasisNodePtr;
                            saveHashAndQueueCreateAndRender();
                        }
                    }
                }
            }

            function isVisible(node) {
                var rect = node.getBoundingClientRect();
                var x = rect.left + 3;
                var y = rect.top + 3;
                var hit = document.elementFromPoint(x, y);
                return (node == hit || node.contains(hit));
            }

            function showError(error) {
                // Some JS error occurred.
                lastRenderedPointer = null;
                treeRoot = null;
                treeContainer.className = "invalid-tree";
                var errorMessage = "<h3>An error occurred loading the tree.</h3>";
                var suggestions = [
                    "Make sure the address (" + new PointerMath.Pointer(pointerField.value, 16).toFormattedString() + ") is correct.",
                    "If you're using an iDNA trace, try indexing the trace first.",
                    "Try refreshing the page.",
                    "You can also try to debug the exception using the F12 tools.",
                    "<a href=\"mailto:psalas&subject=JsDbg%20Help\">Need help?</a>"
                ]
                var errorSuggestions = "<ul>" + suggestions.map(function(x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
                var errorString = error instanceof Error ? error.toString() : JSON.stringify(error, undefined, 4);
                var errorObject = "<code>" + errorString.replace(/\\n/g, "\n").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</code>";
                treeContainer.innerHTML = [errorMessage, errorSuggestions, errorObject].join("\n");
            }

            var enqueueWork = (function() {
                var currentOperation = Promise.as(true);
                return function enqueueWork(work) {
                    var workPromise = currentOperation.then(work);
                    // currentOperation is not allowed to be in a failed state, so trivially handle the error.
                    currentOperation = workPromise.then(function() {}, function(error) {})

                    // However, the caller might want to see the error, so hand them a promise that might fail.
                    return workPromise;
                }
            })();

            var debuggerHasRunSinceLastRefresh = false;
            function refresh() {
                debuggerHasRunSinceLastRefresh = false;
                enqueueWork(function() {
                    lastRenderedPointer = null;
                    return loadRoots()
                    .then(unpackHash, unpackHash);
                })
            }

            function loadRoots() {
                return getRoots()
                .then(function (roots) {
                    rootsElement.className = "roots success";
                    rootsElement.innerHTML = "";

                    currentRoots = roots;

                    roots.forEach(function (root, index) {
                        var link = document.createElement("a");
                        var rootPtr = root.ptr();
                        link.setAttribute("href", "#r=root" + index);
                        link.innerText = rootPtr;
                        rootsElement.appendChild(link);
                        rootsElement.appendChild(document.createTextNode(" "));
                    });

                }, function (error) {
                    rootsElement.className = "roots error";
                    rootsElement.innerHTML = error;
                });
            }

            function unpackHash() {
                var hash = window.location.hash;
                var hashParts = [];
                var rootPtr = null; // address for root of tree
                var nodePtr = null; // address within tree to emphasize

                // Parse semi-colon delimited, name-value pairs from the hash of the URL
                if (hash && hash.length > 1) {
                    hashParts = hash.substr(1).split(";");
                }

                for (var i = 0; i < hashParts.length; i++) {
                    var nameValue = hashParts[i].split("=");
                    if (nameValue.length > 1) {
                        var name = nameValue[0].toLowerCase();
                        var value = nameValue[1].toLowerCase();

                        if (name === "r") {
                            rootPtr = value;
                        } else if (name === "n") {
                            nodePtr = value;
                        }
                    }
                }

                if (currentRoots.length > 0) {
                    if (rootPtr == null) {
                        rootPtr = currentRoots[0].ptr();
                    } else if (rootPtr.indexOf("root") == 0) {
                        // support for r=rootN syntax where N is the Nth root in currentRoots
                        var rootIndex = rootPtr.substr("root".length);
                        rootIndex = Math.min(rootIndex, currentRoots.length - 1);
                        rootPtr = currentRoots[rootIndex].ptr();
                    }
                }

                pointerField.value = rootPtr;
                createAndRender(nodePtr);
            }

            function saveHashAndQueueCreateAndRender() {
                window.location.hash = "r=" + pointerField.value;
                // Changing the hash will trigger a create and render on the hash change.
            }

            function treeAlgorithmRadioChanged(e) {
                if (e.target.checked) {
                    var oldTreeAlgorithm = treeAlgorithm;
                    treeAlgorithm = treeAlgorithms[e.target.id];
                    window.sessionStorage.setItem(id("TreeAlgorithm"), e.target.id);

                    if (treeRoot != null && treeAlgorithm != oldTreeAlgorithm) {
                        render(treeRoot);
                    }
                }
            }

            function createCheckboxChangeHandler(checkboxId) {
                return function() {
                    window.sessionStorage.setItem(checkboxId, document.getElementById(checkboxId).checked);
                };
            }

            function createElement(tag, innerHTML, attributes, events) {
                var e = document.createElement(tag);
                if (innerHTML) {
                    e.innerHTML = innerHTML;
                }

                if (attributes) {
                    for (var key in attributes) {
                        if (attributes[key] !== undefined) {
                            e.setAttribute(key, attributes[key]);
                        }
                    }
                }

                if (events) {
                    for (var key in events) {
                        e.addEventListener(key, events[key]);
                    }
                }
                return e;
            }

            function ws() {
                return document.createTextNode(" ");
            }

            function id(str) {
                return Loader.GetCurrentExtension() + "." + str;
            }

            // Handles copy event to pretty print the selected portion of the tree to the clipboard.
            function copyTreeSelection(event) {
                var s = getSelection();
                var r = s.getRangeAt(0);

                var t = treeAlgorithm.GetTreeRangeAsText(r);
                if (t) {
                    event.clipboardData.setData("text/plain", t);
                    event.preventDefault();
                }
            }

            function createFieldSupportContainer() {
                var newNode = createElement("div", null, { class: "field-support-container" });
                if (fieldSupportContainer != null) {
                    container.replaceChild(newNode, fieldSupportContainer);
                } else {
                    container.appendChild(newNode);
                }
                return newNode;
            }

            // Build up the UI.
            container.classList.add("tree-inspector-root");

            var fieldSupportContainer = createFieldSupportContainer();

            var topPane = createElement("div", null, { class: "tree-inspector-top-pane" });
            container.appendChild(topPane);

            rootsElement = createElement("div");
            rootsElement.className = "roots success";
            topPane.appendChild(rootsElement);

            var pointerInputControl = createElement("nobr");
            topPane.appendChild(pointerInputControl);

            pointerInputControl.appendChild(createElement("label",  "Pointer:", {"for": id("pointer")}));
            pointerInputControl.appendChild(ws());

            pointerField = createElement("input", null, {
                "type": "text", 
                "id": id("pointer")
            });
            pointerInputControl.appendChild(pointerField);

            topPane.appendChild(ws());

            var loadSaveControl = createElement("nobr");
            topPane.appendChild(loadSaveControl);
            loadSaveControl.appendChild(createElement("button", "Load", null, {
                "click": function() { saveHashAndQueueCreateAndRender(); }
            }));
            loadSaveControl.appendChild(ws());
            loadSaveControl.appendChild(createElement("button", "Save", null, {
                "click": function() {
                    if (treeRoot != null) {
                        TreeSaver.Save(treeRoot);
                    }
                }
            }))

            topPane.appendChild(ws());

            treeAlgorithms[id("TallTree")] = TallTree;
            treeAlgorithms[id("WideTree")] = WideTree;
            treeAlgorithm = TallTree;
            if (window.sessionStorage.getItem(id("TreeAlgorithm")) == id("WideTree")) {
                treeAlgorithm = WideTree;
            }

            var treeAlgorithmControl = createElement("nobr");
            topPane.appendChild(treeAlgorithmControl);
            treeAlgorithmControl.appendChild(createElement("input", null, {
                name: "treeAlgorithm",
                id: id("TallTree"),
                type: "radio",
                checked: treeAlgorithm == TallTree ? "checked" : undefined
            }, {
                "change": treeAlgorithmRadioChanged
            }));
            treeAlgorithmControl.appendChild(createElement("label", "Tall Tree", {
                "for": id("TallTree")
            }));

            treeAlgorithmControl.appendChild(createElement("input", null, {
                name: "treeAlgorithm",
                id: id("WideTree"),
                type: "radio",
                checked: treeAlgorithm == WideTree ? "checked" : undefined
            }, {
                "change": treeAlgorithmRadioChanged
            }));
            treeAlgorithmControl.appendChild(createElement("label", "Wide Tree", {
                "for": id("WideTree")
            }));

            topPane.appendChild(ws());
            var expandTreeControl = createElement("nobr");
            topPane.appendChild(expandTreeControl);
            expandTreeControl.appendChild(createElement("input", null, {
                name: "fullyExpand",
                id: id("FullyExpand"),
                type: "checkbox",
                checked: window.sessionStorage.getItem(id("FullyExpand")) === "false" ? undefined : "checked"
            }, {
                "change": createCheckboxChangeHandler(id("FullyExpand"))
            }));
            expandTreeControl.appendChild(createElement("label", "Expand Tree Automatically", {
                "for": id("FullyExpand")
            }));

            var notifyOnBreak = true;
            JsDbg.RegisterOnBreakListener(function() {
                debuggerHasRunSinceLastRefresh = true;
                if (document.getElementById(id("RefreshOnBreak")).checked) {
                    refresh();
                } else {
                    if (notifyOnBreak) {
                        messageContainer.classList.add("show");
                    }
                }
            });
            
            topPane.appendChild(ws());
            var updateCheckboxControl = createElement("nobr");
            topPane.appendChild(updateCheckboxControl);

            var messageContainer = createElement("div", null, {
                id: id("RefreshOnBreakMessage"),
                class: "popup-message-container"
            });
            messageContainer.appendChild(document.createElement("br"));
            var message = createElement("div", "The debugged process has run since the tree was last updated.", {
                class: "popup-message"
            });
            var buttons = createElement("div", null, { class: "buttons" });
            buttons.appendChild(createElement("button", "Update Tree", {
                class: "small-button light"
            }, { 
                click: function () {
                    messageContainer.classList.remove("show");
                    refresh();
                }
            }));
            buttons.appendChild(createElement("button", "Not Now", {
                class: "small-button light"
            }, {
                click: function () {
                    messageContainer.classList.remove("show");
                    notifyOnBreak = false;
                }
            }));
            message.appendChild(buttons);
            messageContainer.appendChild(message);

            updateCheckboxControl.appendChild(messageContainer);
            updateCheckboxControl.appendChild(createElement("input", null, {
                name: "refreshOnBreak",
                id: id("RefreshOnBreak"),
                type: "checkbox",
                checked: window.sessionStorage.getItem(id("RefreshOnBreak")) === "true" ? "checked" : undefined
            }, {
                "change": function () {
                    createCheckboxChangeHandler(id("RefreshOnBreak"))();
                    messageContainer.classList.remove("show");
                    if (debuggerHasRunSinceLastRefresh) {
                        refresh();
                    }
                }
            }));
            updateCheckboxControl.appendChild(createElement("label", "Update When Debugger Breaks", {
                "for": id("RefreshOnBreak")
            }));

            topPane.appendChild(createElement("div", "Click a node to show its children.  Ctrl-Click to expand or collapse a subtree."));

            treeContainer = createElement("div");
            topPane.appendChild(treeContainer);

            // On a hash change, reload.
            window.addEventListener("hashchange", unpackHash);

            // On copy, update the clipboard with some representation for the selected part of the tree.
            document.addEventListener("copy", copyTreeSelection);

            refresh();
        }
    }
})();