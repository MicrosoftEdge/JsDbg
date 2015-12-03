"use strict";

var TreeInspector = (function() {
    var rootsElement = null;
    var pointerField = null;
    var treeContainer = null;
    var treeRoot = null;
    var renderTreeRootPromise = null;
    var lastRenderedPointer = null;
    var currentRoots = [];
    var treeAlgorithm = null;
    var treeAlgorithms = { };

    return {
        Initialize: function(namespace, container) {
            function createAndRender() {
                if (lastRenderedPointer != pointerField.value) {
                    // Don't re-render if we've already rendered.
                    pointerField.value = pointerField.value.trim();
                    Promise.as(DbgObjectTree.InterpretAddress(new PointerMath.Pointer(pointerField.value, 16)))
                    .then(function(createdRoot) {
                        lastRenderedPointer = pointerField.value;
                        treeRoot = createdRoot;
                        return render();
                    })
                    .then(function() {}, function(error) {
                        // Some JS error occurred.
                        window.location.hash = "";
                        lastRenderedPointer = null;
                        treeRoot = null;
                        treeContainer.className = "invalid-tree";
                        var errorMessage = "<h3>An error occurred loading the tree.</h3>";
                        var suggestions = [
                            "Make sure the " + namespace.BasicType + " address (0x" + parseInt(pointerField.value, 16).toString(16)  + ") is correct.",
                            "If you're using an iDNA trace, try indexing the trace first.",
                            "Try refreshing the page.",
                            "You can also try to debug the exception using the F12 tools.",
                            "<a href=\"mailto:psalas&subject=JsDbg%20Help\">Need help?</a>"
                        ]
                        var errorSuggestions = "<ul>" + suggestions.map(function(x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
                        var errorObject = "<code>" + JSON.stringify(error, undefined, 4).replace(/\\n/g, "\n").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</code>";
                        treeContainer.innerHTML = [errorMessage, errorSuggestions, errorObject].join("\n");
                    });
                }
            }

            function render() {
                var fullyExpand = window.sessionStorage.getItem(id("FullyExpand")) !== "false";
                renderTreeRootPromise = DbgObjectTree.RenderTreeNode(treeContainer, treeRoot, fullyExpand, treeAlgorithm);
                return renderTreeRootPromise;
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
                return DbgObjectTree.GetRootTreeNodes()
                .then(function (roots) {
                    rootsElement.className = "roots success";
                    rootsElement.innerHTML = namespace.BasicType + " Roots: ";

                    currentRoots = roots;

                    if (roots.length == 0) {
                        rootsElement.innerHTML += "(none)";
                    }

                    roots.forEach(function (root, index) {
                        var link = document.createElement("a");
                        link.setAttribute("href", "#root" + index);
                        link.innerText = root.dbgObject.ptr();
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
                if (!hash || hash.length <= 1) {
                    hash = "#root0";
                }

                if (hash.indexOf("#root") == 0) {
                    var rootIndex = parseInt(hash.substr("#root".length));
                    rootIndex = Math.min(rootIndex, currentRoots.length - 1);
                    if (rootIndex >= 0 && rootIndex < currentRoots.length) {
                        pointerField.value = currentRoots[rootIndex].dbgObject.ptr();
                        treeRoot = currentRoots[rootIndex];
                        render();
                    } else {
                        window.location.hash = "";
                    }
                } else {
                    var value = hash.substr(1);
                    pointerField.value = value;
                    createAndRender();
                }
            }

            function saveHashAndQueueCreateAndRender() {
                window.location.hash = pointerField.value;
                // Changing the hash will trigger a create and render on the hash change.
            }

            function treeAlgorithmRadioChanged(e) {
                if (e.target.checked) {
                    var oldTreeAlgorithm = treeAlgorithm;
                    treeAlgorithm = treeAlgorithms[e.target.id];
                    window.sessionStorage.setItem(id("TreeAlgorithm"), e.target.id);

                    if (treeRoot != null && treeAlgorithm != oldTreeAlgorithm) {
                        render();
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
                return namespace.Name + "." + str;
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

            // Build up the UI.
            container.className += " tree-inspector-root";

            rootsElement = createElement("div");
            rootsElement.className = "roots success";
            rootsElement.innerHTML = namespace.BasicType + " Roots: ";
            container.appendChild(rootsElement);

            container.appendChild(createElement("label",  "Pointer:", {"for": id("pointer")}));
            container.appendChild(ws());

            pointerField = createElement("input", null, {
                "type": "text", 
                "id": id("pointer")
            });
            container.appendChild(pointerField);

            container.appendChild(ws());
            container.appendChild(createElement("button", "Load", null, {
                "click": function() { saveHashAndQueueCreateAndRender(); }
            }));
            container.appendChild(ws());
            container.appendChild(createElement("button", "Save", null, {
                "click": function() {
                    if (treeRoot != null) {
                        TreeSaver.Save(treeRoot);
                    }
                }
            }))

            treeAlgorithms[id("TallTree")] = TallTree;
            treeAlgorithms[id("WideTree")] = WideTree;
            treeAlgorithm = TallTree;
            if (window.sessionStorage.getItem(id("TreeAlgorithm")) == id("WideTree")) {
                treeAlgorithm = WideTree;
            }

            container.appendChild(createElement("input", null, {
                name: "treeAlgorithm",
                id: id("TallTree"),
                type: "radio",
                checked: treeAlgorithm == TallTree ? "checked" : undefined
            }, {
                "change": treeAlgorithmRadioChanged
            }));
            container.appendChild(createElement("label", "Tall Tree", {
                "for": id("TallTree")
            }));
            container.appendChild(createElement("input", null, {
                name: "treeAlgorithm",
                id: id("WideTree"),
                type: "radio",
                checked: treeAlgorithm == WideTree ? "checked" : undefined
            }, {
                "change": treeAlgorithmRadioChanged
            }));
            container.appendChild(createElement("label", "Wide Tree", {
                "for": id("WideTree")
            }));

            container.appendChild(ws());
            container.appendChild(createElement("input", null, {
                name: "fullyExpand",
                id: id("FullyExpand"),
                type: "checkbox",
                checked: window.sessionStorage.getItem(id("FullyExpand")) === "false" ? undefined : "checked"
            }, {
                "change": createCheckboxChangeHandler(id("FullyExpand"))
            }));
            container.appendChild(createElement("label", "Expand Tree Automatically", {
                "for": id("FullyExpand")
            }));

            var notifyOnBreak = true;
            var didRegisterBreakListener = JsDbg.RegisterOnBreakListener(function() {
                debuggerHasRunSinceLastRefresh = true;
                if (document.getElementById(id("RefreshOnBreak")).checked) {
                    refresh();
                } else {
                    if (notifyOnBreak) {
                        messageContainer.classList.add("show");
                    }
                }
            });
            if (didRegisterBreakListener) {
                container.appendChild(ws());
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

                container.appendChild(messageContainer);
                container.appendChild(createElement("input", null, {
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
                container.appendChild(createElement("label", "Update When Debugger Breaks", {
                    "for": id("RefreshOnBreak")
                }));
            }

            container.appendChild(createElement("div", "Click a node to show its children.  Ctrl-Click to expand or collapse a subtree."));

            treeContainer = createElement("div");
            container.appendChild(treeContainer);

            // On a hash change, reload.
            window.addEventListener("hashchange", unpackHash);

            // On copy, update the clipboard with some representation for the selected part of the tree.
            document.addEventListener("copy", copyTreeSelection);

            refresh();

            FieldSupport.Initialize(
                namespace.Name, 
                namespace.BuiltInFields, 
                namespace.DefaultFieldType, 
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
                }
            )
        }
    }
})();