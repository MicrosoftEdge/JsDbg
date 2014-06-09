"use strict";

var TreeInspector = (function() {
    var rootsElement = null;
    var pointerField = null;
    var treeContainer = null;
    var treeRoot = null;
    var renderTreeRootPromise = null;
    var lastRenderedPointer = null;
    var treeAlgorithm = null;
    var treeAlgorithms = { };

    return {
        Initialize: function(namespace, container) {
            function createAndRender() {
                if (lastRenderedPointer != pointerField.value) {
                    // Don't re-render if we've already rendered.
                    Promise.as(namespace.Create(parseInt(pointerField.value, 16)))
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
                var fullyExpand = window.sessionStorage.getItem(id("FullyExpand"));
                renderTreeRootPromise = treeAlgorithm.BuildTree(treeContainer, treeRoot, fullyExpand !== "false");
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
            function refresh() {
                enqueueWork(function() {
                    lastRenderedPointer = null;
                    unpackHash();
                    return loadRoots(!window.location.hash || window.location.hash.length <= 1);
                })
            }

            function loadRoots(useDefault) {
                rootsElement.className = "roots success";
                rootsElement.innerHTML = namespace.BasicType + " Roots: ";

                return namespace.Roots()
                    .then(function(roots) {
                        if (roots.length == 0) {
                            rootsElement.innerHTML += "(none)";
                        }

                        roots.forEach(function(root) {
                            var link = document.createElement("a");
                            link.setAttribute("href", "#");
                            link.addEventListener("click", function(e) {
                                e.preventDefault();
                                pointerField.value = root;
                                saveHashAndQueueCreateAndRender();
                            });
                            link.innerHTML = root;
                            rootsElement.appendChild(link);
                            rootsElement.appendChild(document.createTextNode(" "));
                        });

                        if (useDefault && roots.length > 0) {
                            pointerField.value = roots[0];
                            createAndRender();
                        }
                    }, function (ex) {
                        rootsElement.className = "roots error";
                        rootsElement.innerHTML = ex;
                    });

                
            }

            function unpackHash() {
                if (window.location.hash && window.location.hash.length > 1) {
                    var value = window.location.hash.substr(1);
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

            // Build up the UI.
            container.className += " tree-inspector-root";

            rootsElement = createElement("div");
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

            var didRegisterBreakListener = JsDbg.RegisterOnBreakListener(function() {
                if (document.getElementById(id("RefreshOnBreak")).checked) {
                    refresh();
                }
            });
            if (didRegisterBreakListener) {
                container.appendChild(ws());
                container.appendChild(createElement("input", null, {
                    name: "refreshOnBreak",
                    id: id("RefreshOnBreak"),
                    type: "checkbox",
                    checked: window.sessionStorage.getItem(id("RefreshOnBreak")) === "true" ? "checked" : undefined
                }, {
                    "change": createCheckboxChangeHandler(id("RefreshOnBreak"))
                }));
                container.appendChild(createElement("label", "Refresh on Break", {
                    "for": id("RefreshOnBreak")
                }));
            }

            container.appendChild(createElement("div", "Click a " + namespace.BasicType + " to show its children.  Ctrl-Click to expand or collapse a subtree."));

            treeContainer = createElement("div");
            container.appendChild(treeContainer);

            // On a hash change, reload.
            window.addEventListener("hashchange", unpackHash);

            refresh();

            FieldSupport.Initialize(
                namespace.Name, 
                namespace.BuiltInFields, 
                namespace.BasicType, 
                namespace.TypeMap, 
                function() {
                    if (renderTreeRootPromise != null) {
                        return renderTreeRootPromise
                            .then(function updateRenderTree(renderTreeRoot) {
                                return renderTreeRoot.updateRepresentation();
                            });
                    }
                }
            )
        }
    }
})();