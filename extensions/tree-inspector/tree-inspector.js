"use strict";

var TreeInspector = (function() {

    function TreeInspectorUIController(getRoots, treeDefinition, dbgObjectRenderer, interpretAddress) {
        this.rootsElement = null;
        this.pointerField = null;
        this.fullyExpandCheckbox = null;
        this.treeContainer = null;
        this.fieldSupportContainer = null;
        this.treeRoot = null;
        this.renderTreeRootPromise = null;
        this.lastRenderedPointer = null;
        this.currentRoots = [];
        this.treeAlgorithm = null;
        this.treeAlgorithms = { };
        this.fieldSupportController = null;
        this.treeReader = null;
        this.interpretAddress = interpretAddress;
        this.getRoots = getRoots;
        this.treeDefinition = treeDefinition;
        this.dbgObjectRenderer = dbgObjectRenderer;
        this.debuggerHasRunSinceLastRefresh = false;
        this.currentOperation = Promise.as(true);
    }

    TreeInspectorUIController.prototype.createAndRender = function(emphasisNodePtr) {
        if (this.lastRenderedPointer != this.pointerField.value) {
            // Don't re-render if we've already rendered.
            this.pointerField.value = this.pointerField.value.trim();

            var that = this;
            Promise.as(this.interpretAddress(new PointerMath.Pointer(this.pointerField.value, 16)))
            .then(function(rootObject) { 
                that.treeReader = new FieldSelector.TreeReader(new DbgObjectTree.DbgObjectTreeRenderer(that.treeDefinition, that.dbgObjectRenderer), that.fieldSupportController);
                return that.treeReader.createRoot(rootObject)
            })
            .then(
                function (rootNode) {
                    that.render(rootNode, emphasisNodePtr); 
                },
                that.showError.bind(that)
            );
        } else {
            if (emphasisNodePtr != null) {
                this.emphasizeNode(emphasisNodePtr, this.treeRoot, this.treeReader);
            }
        }
    }

    TreeInspectorUIController.prototype.render = function(rootNode, emphasisNodePtr) {
        window.name = Loader.GetCurrentExtension().toLowerCase() + "-" + this.treeReader.getObject(rootNode).ptr();
        this.treeRoot = rootNode;
        this.lastRenderedPointer = this.pointerField.value;

        var that = this;
        this.renderTreeRootPromise = this.treeAlgorithm.BuildTree(this.treeContainer, this.treeReader, this.treeRoot, this.fullyExpandCheckbox.checked)
        .then(function(renderedTree) {
            if (emphasisNodePtr != null) {
                emphasizeNode(emphasisNodePtr, that.treeRoot, that.treeReader);
            }
            return renderedTree;
        })
        .catch(this.showError.bind(this));

        return this.renderTreeRootPromise;
    }

    TreeInspectorUIController.prototype.emphasizeNode = function(emphasisNodePtr, rootNode, fieldRenderer) {
        if (!fieldRenderer.getTreeRenderer().emphasizeDbgObject(emphasisNodePtr, rootNode)) {
            if (confirm("The object you selected was not found in the tree.  Use it as the root instead?")) {
                this.pointerField.value = emphasisNodePtr;
                this.saveHashAndQueueCreateAndRender();
            }
        }
    }

    TreeInspectorUIController.prototype.showError = function(error) {
        // Some JS error occurred.
        this.lastRenderedPointer = null;
        this.treeRoot = null;
        this.treeContainer.className = "invalid-tree";
        var errorMessage = "<h3>An error occurred loading the tree.</h3>";
        var suggestions = [
            "Make sure the address (" + new PointerMath.Pointer(this.pointerField.value, 16).toFormattedString() + ") is correct.",
            "If you're using an iDNA trace, try indexing the trace first.",
            "Try refreshing the page.",
            "You can also try to debug the exception using the F12 tools.",
            "<a href=\"mailto:psalas&subject=JsDbg%20Help\">Need help?</a>"
        ]
        var errorSuggestions = "<ul>" + suggestions.map(function(x) { return "<li>" + x + "</li>"; }).join("") + "</ul>";
        var errorString = error instanceof Error ? error.toString() : JSON.stringify(error, undefined, 4);
        var errorObject = "<code>" + errorString.replace(/\\n/g, "\n").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</code>";
        this.treeContainer.innerHTML = [errorMessage, errorSuggestions, errorObject].join("\n");
    }

    TreeInspectorUIController.prototype.enqueueWork = function(work) {
        var resultPromise = this.currentOperation.then(work);

        // currentOperation is not allowed to be in a failed state, so trivially handle the error.
        this.currentOperation = resultPromise.catch(function() { });

        // However, the caller might want to see the error, so hand them a promise that might fail.
        return resultPromise;
    }

    TreeInspectorUIController.prototype.refresh = function() {
        this.debuggerHasRunSinceLastRefresh = false;
        var that = this;
        this.enqueueWork(function() {
            that.lastRenderedPointer = null;
            return that.loadRoots().then(that.unpackHash.bind(that), that.unpackHash.bind(that));
        })
    }

    TreeInspectorUIController.prototype.loadRoots = function() {
        var that = this;
        return this.getRoots()
        .then(function (roots) {
            that.rootsElement.className = "roots success";
            that.rootsElement.innerHTML = "Roots: ";

            that.currentRoots = roots;

            return Promise.map(that.currentRoots, function (root) {
                return that.dbgObjectRenderer.createRepresentation(root, null, [], false);
            })
            .then(function (rootRepresentations) {
                rootRepresentations.forEach(function (root, index) {
                    var link = document.createElement("a");
                    link.setAttribute("href", "#r=root" + index);
                    root.classList.add("tree-inspector-root-link");
                    link.appendChild(root);
                    that.rootsElement.appendChild(link);
                    that.rootsElement.appendChild(document.createTextNode(" "));
                })
            })
        }, function (error) {
            that.rootsElement.className = "roots error";
            that.rootsElement.innerHTML = error;
        });
    }

    TreeInspectorUIController.prototype.unpackHash = function() {
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

        if (this.currentRoots.length > 0) {
            if (rootPtr == null) {
                rootPtr = this.currentRoots[0].ptr();
            } else if (rootPtr.indexOf("root") == 0) {
                // support for r=rootN syntax where N is the Nth root in this.currentRoots
                var rootIndex = rootPtr.substr("root".length);
                rootIndex = Math.min(rootIndex, this.currentRoots.length - 1);
                rootPtr = this.currentRoots[rootIndex].ptr();
            }
        }

        this.pointerField.value = rootPtr;
        this.createAndRender(nodePtr);
    }

    TreeInspectorUIController.prototype.saveHashAndQueueCreateAndRender = function() {
        window.location.hash = "r=" + that.pointerField.value;
        // Changing the hash will trigger a create and render on the hash change.
    }

    TreeInspectorUIController.prototype.instantiateFieldController = function(defaultTypes) {
        if (this.fieldSupportContainer == null) {
            throw new Error("UI must be instantiated before the field controller.");
        }

        var isRenderTreeUpdateQueued = false;
        var that = this;
        this.fieldSupportController = FieldSelector.Create(this.fieldSupportContainer, function updateRenderTree() {
            if (isRenderTreeUpdateQueued) {
                return;
            } else {
                isRenderTreeUpdateQueued = true;
            }

            window.requestAnimationFrame(function() {
                if (that.renderTreeRootPromise != null) {
                    return that.renderTreeRootPromise
                    .then(function(renderTreeRoot) {
                        isRenderTreeUpdateQueued = false;
                        return renderTreeRoot.updateRepresentation();
                    });
                }
            })
        });

        return Promise.map(
            defaultTypes, 
            function (type) { return that.fieldSupportController.addType(type.module, type.type); }
        );
    }

    TreeInspectorUIController.prototype.instantiateUI = function(container) {
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

        // Build up the UI.
        container.classList.add("tree-inspector-root");

        this.fieldSupportContainer = createElement("div", null, { class: "field-support-container" });
        container.appendChild(this.fieldSupportContainer);

        var topPane = createElement("div", null, { class: "tree-inspector-top-pane" });
        container.appendChild(topPane);

        var toolbar = createElement("div", null, { class: "tree-inspector-toolbar" });
        topPane.appendChild(toolbar);

        this.rootsElement = createElement("div");
        this.rootsElement.className = "roots success";
        toolbar.appendChild(this.rootsElement);

        var pointerInputControl = createElement("nobr");
        toolbar.appendChild(pointerInputControl);

        pointerInputControl.appendChild(createElement("label",  "Pointer:", {"for": id("pointer")}));
        pointerInputControl.appendChild(ws());

        this.pointerField = createElement("input", null, {
            "type": "text", 
            "id": id("pointer")
        });
        pointerInputControl.appendChild(this.pointerField);

        toolbar.appendChild(ws());

        var loadSaveControl = createElement("nobr");
        toolbar.appendChild(loadSaveControl);
        loadSaveControl.appendChild(createElement("button", "Load", null, {
            "click": function() { saveHashAndQueueCreateAndRender(); }
        }));
        loadSaveControl.appendChild(ws());
        loadSaveControl.appendChild(createElement("button", "Save", null, {
            "click": function() {
                if (treeRoot != null) {
                    TreeSaver.Save(treeReader, treeRoot);
                }
            }
        }))

        toolbar.appendChild(ws());

        this.treeAlgorithms[id("TallTree")] = TallTree;
        this.treeAlgorithms[id("WideTree")] = WideTree;
        this.treeAlgorithm = TallTree;
        if (window.sessionStorage.getItem(id("TreeAlgorithm")) == id("WideTree")) {
            thsi.treeAlgorithm = WideTree;
        }

        var that = this;
        function treeAlgorithmRadioChanged(e) {
            if (e.target.checked) {
                var oldTreeAlgorithm = that.treeAlgorithm;
                that.treeAlgorithm = that.treeAlgorithms[e.target.id];
                window.sessionStorage.setItem(id("TreeAlgorithm"), e.target.id);

                if (that.treeRoot != null && that.treeAlgorithm != oldTreeAlgorithm) {
                    that.render(that.treeRoot);
                }
            }
        }

        var treeAlgorithmControl = createElement("nobr");
        toolbar.appendChild(treeAlgorithmControl);
        treeAlgorithmControl.appendChild(createElement("input", null, {
            name: "treeAlgorithm",
            id: id("TallTree"),
            type: "radio",
            checked: this.treeAlgorithm == TallTree ? "checked" : undefined
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
            checked: this.treeAlgorithm == WideTree ? "checked" : undefined
        }, {
            "change": treeAlgorithmRadioChanged
        }));
        treeAlgorithmControl.appendChild(createElement("label", "Wide Tree", {
            "for": id("WideTree")
        }));

        toolbar.appendChild(ws());
        var expandTreeControl = createElement("nobr");
        toolbar.appendChild(expandTreeControl);

        this.fullyExpandCheckbox = createElement("input", null, {
            name: "fullyExpand",
            id: id("FullyExpand"),
            type: "checkbox",
            checked: window.sessionStorage.getItem(id("FullyExpand")) === "false" ? undefined : "checked"
        }, {
            "change": createCheckboxChangeHandler(id("FullyExpand"))
        })
        expandTreeControl.appendChild(this.fullyExpandCheckbox);
        expandTreeControl.appendChild(createElement("label", "Expand Tree Automatically", {
            "for": id("FullyExpand")
        }));

        var notifyOnBreak = true;
        JsDbg.RegisterOnBreakListener(function() {
            that.debuggerHasRunSinceLastRefresh = true;
            if (document.getElementById(id("RefreshOnBreak")).checked) {
                that.refresh();
            } else {
                if (notifyOnBreak) {
                    messageContainer.classList.add("show");
                }
            }
        });
        
        var updateCheckboxControl = createElement("nobr");
        toolbar.appendChild(updateCheckboxControl);
        updateCheckboxControl.appendChild(ws());

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
                that.refresh();
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
                if (that.debuggerHasRunSinceLastRefresh) {
                    that.refresh();
                }
            }
        }));
        updateCheckboxControl.appendChild(createElement("label", "Update When Debugger Breaks", {
            "for": id("RefreshOnBreak")
        }));

        topPane.appendChild(createElement("div", "Click a node to show its children.  Ctrl-Click to expand or collapse a subtree."));

        this.treeContainer = createElement("div");
        topPane.appendChild(this.treeContainer);

        // On a hash change, reload.
        window.addEventListener("hashchange", this.unpackHash.bind(this));

        // On copy, update the clipboard with some representation for the selected part of the tree.
        document.addEventListener("copy", function copyTreeSelection(event) {
            var s = window.getSelection();
            var r = s.getRangeAt(0);

            var t = that.treeAlgorithm.GetTreeRangeAsText(r);
            if (t) {
                event.clipboardData.setData("text/plain", t);
                event.preventDefault();
            }
        });
    }

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

        Initialize: function(getRoots, treeDefinition, dbgObjectRenderer, interpretAddress, defaultTypes, container) {
            var uiController = new TreeInspectorUIController(getRoots, treeDefinition, dbgObjectRenderer, interpretAddress);
            uiController.instantiateUI(container);

            uiController.instantiateFieldController(defaultTypes)
            .then(function () {
                uiController.refresh();
            })

            return function() {
                return uiController.refresh();
            }
        }
    }
})();