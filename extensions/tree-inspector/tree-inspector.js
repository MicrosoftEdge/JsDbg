"use strict";

var TreeInspector = (function() {
    var rootsElement = null;
    var pointerField = null;
    var treeContainer = null;
    var treeRoot = null;
    var lastRenderedPointer = null;
    var treeAlgorithm = TallTree;
    var treeAlgorithms = { };

    return {
        Initialize: function(namespace, container) {
            function createAndRender() {
                if (lastRenderedPointer != pointerField.value) {
                    // Don't re-render if we've already rendered.
                    lastRenderedPointer = pointerField.value;
                    treeRoot = namespace.Create(parseInt(pointerField.value));
                    namespace.Render(treeAlgorithm, treeRoot, treeContainer);
                }
            }

            function loadRoots(useDefault) {
                try {
                    var roots = namespace.Roots();
                } catch (ex) {
                    rootsElement.className = "roots error";
                    rootsElement.innerHTML = ex;
                    return;
                }

                rootsElement.className = "roots success";
                rootsElement.innerHTML = namespace.BasicType + " Roots: ";

                if (roots.length == 0) {
                    rootsElement.innerHTML += "(none)";
                }

                roots.forEach(function(root) {
                    var link = document.createElement("a");
                    link.setAttribute("href", "#");
                    link.addEventListener("click", function(e) {
                        e.preventDefault();
                        pointerField.value = root;
                        saveHash();
                        createAndRender();
                    });
                    link.innerHTML = root;
                    rootsElement.appendChild(link);
                    rootsElement.appendChild(document.createTextNode(" "));
                });

                if (useDefault && roots.length > 0) {
                    pointerField.value = roots[0];
                    createAndRender();
                }
            }

            function unpackHash() {
                if (window.location.hash && window.location.hash.length > 1) {
                    var value = window.location.hash.substr(1);
                    pointerField.value = value;
                    createAndRender();
                }
            }

            function saveHash() {
                window.location.hash = pointerField.value;
            }

            function treeAlgorithmRadioChanged(e) {
                if (e.target.checked) {
                    var oldTreeAlgorithm = treeAlgorithm;
                    treeAlgorithm = treeAlgorithms[e.target.id];

                    if (treeRoot != null && treeAlgorithm != oldTreeAlgorithm) {
                        renderTreeFn(treeAlgorithm, treeRoot, treeContainer);
                    }
                }
            }

            function createElement(tag, innerHTML, attributes, events) {
                var e = document.createElement(tag);
                if (innerHTML) {
                    e.innerHTML = innerHTML;
                }

                if (attributes) {
                    for (var key in attributes) {
                        e.setAttribute(key, attributes[key]);
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
                "click": function() { saveHash(); createAndRender(); }
            }));

            treeAlgorithms[id("TallTree")] = TallTree;
            treeAlgorithms[id("WideTree")] = WideTree;

            container.appendChild(createElement("input", null, {
                name: "treeAlgorithm",
                id: id("TallTree"),
                type: "radio",
                checked: "checked"
            }, {
                "change": treeAlgorithmRadioChanged
            }));
            container.appendChild(createElement("label", "Tall Tree", {
                "for": id("TallTree")
            }));
            container.appendChild(createElement("input", null, {
                name: "treeAlgorithm",
                id: id("WideTree"),
                type: "radio"
            }, {
                "change": treeAlgorithmRadioChanged
            }));
            container.appendChild(createElement("label", "Wide Tree", {
                "for": id("WideTree")
            }));
            container.appendChild(createElement("div", "Click a " + namespace.BasicType + " to show its children.  Ctrl-Click to expand or collapse a subtree."));

            treeContainer = createElement("div");
            container.appendChild(treeContainer);

            // On a hash change, reload.
            window.addEventListener("hashchange", unpackHash);

            // Load the roots to start, and try to unpack the hash.
            loadRoots(!window.location.hash);
            unpackHash();
        }
    }
})();