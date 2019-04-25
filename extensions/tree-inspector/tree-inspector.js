//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var TreeInspector = (function() {
    function id(str) {
        return Loader.GetCurrentExtension() + "." + str;
    }

    function TreeInspectorUIController(getRoots, treeDefinition, dbgObjectRenderer, interpretAddress) {
        this.expandTreeAutomatically = (window.sessionStorage.getItem(id("FullyExpand")) !== "false");

        this.refreshOnBreak = (window.sessionStorage.getItem(id("RefreshOnBreak")) === "true");
        this.notifyOnBreak = !this.refreshOnBreak;
        this.debuggerHasRunSinceLastRefresh = false;
        var that = this;
        JsDbg.RegisterOnBreakListener(function() {
            that.debuggerHasRunSinceLastRefresh = true;
            if (that.refreshOnBreak) {
                that.refreshIfNecessary();
            }
        })

        this.rootsElement = null;
        this.pointerField = null;
        this.treeContainer = null;
        this.fieldSupportContainer = null;
        this.treeRoot = null;
        this.lastRenderedPointer = null;
        this.lastRenderedPointerRootIndex = -1;
        this.currentRoots = [];
        this.fieldSupportController = null;
        this.treeReader = null;
        this.interpretAddress = interpretAddress;
        this.getRoots = getRoots;
        this.treeDefinition = treeDefinition;
        this.dbgObjectRenderer = dbgObjectRenderer;
        this.currentOperation = Promise.resolve(true);

        window.addEventListener("beforeunload", function() {
            window.name = "";
        })
    }

    TreeInspectorUIController.prototype.setExpandTreeAutomatically = function (value) {
        this.expandTreeAutomatically = value;
        window.sessionStorage.setItem(id("FullyExpand"), value);
    }

    TreeInspectorUIController.prototype.setRefreshOnBreak = function(value) {
        this.refreshOnBreak = value;
        window.sessionStorage.setItem(id("RefreshOnBreak"), value);
        if (value) {
            this.refreshIfNecessary();
            this.setNotifyOnBreak(false);
        } else {
            this.setNotifyOnBreak(true);
        }
    }

    TreeInspectorUIController.prototype.setNotifyOnBreak = function(value) {
        this.notifyOnBreak = value;
    }

    TreeInspectorUIController.prototype.createAndRender = function(emphasisNodePtr) {
        if (this.lastRenderedPointer != this.pointerField.value) {
            // Don't re-render if we've already rendered.
            this.pointerField.value = this.pointerField.value.trim();

            var that = this;
            this.lastRenderedPointerRootIndex = -1;
            Promise.resolve(this.interpretAddress(new PointerMath.Pointer(this.pointerField.value, 16)))
            .then(function(rootObject) { 
                // If this object is one of the roots, record the index.
                that.currentRoots.forEach(function (root, index) {
                    if (that.lastRenderedPointerRootIndex == -1 && root.equals(rootObject)) {
                        that.lastRenderedPointerRootIndex = index;
                    }
                });

                that.treeReader = new FieldSelector.TreeReader(new DbgObjectTree.DbgObjectTreeRenderer(that.treeDefinition, that.dbgObjectRenderer), that.fieldSupportController);
                return that.treeReader.createRoot(rootObject)
            })
            .then(function (rootNode) {
                window.name = Loader.GetCurrentExtension().toLowerCase() + "-" + that.treeReader.getObject(rootNode).ptr();
                that.treeRoot = rootNode;
                that.lastRenderedPointer = that.pointerField.value;
                return that.enqueueWork(function() { return TallTree.BuildTree(that.treeContainer, that.treeReader, that.treeRoot, that.expandTreeAutomatically) })
            })
            .then(function () {
                if (emphasisNodePtr != null) {
                    that.emphasizeNode(emphasisNodePtr, that.treeRoot, that.treeReader);
                }
            })
            .catch(function(error) {
                // If the object address failed interpretation but it was previously a root, switch to the corresponding root.
                if (that.lastRenderedPointerRootIndex != -1 && that.currentRoots.length > 0) {
                    var correspondingIndex = that.currentRoots.length > that.lastRenderedPointerRootIndex ? that.lastRenderedPointerRootIndex : 0;
                    that.pointerField.value = that.currentRoots[correspondingIndex].ptr();
                    that.saveHashAndQueueCreateAndRender();
                } else {
                    return that.showError(error);
                }
            });
        } else {
            if (emphasisNodePtr != null) {
                this.emphasizeNode(emphasisNodePtr, this.treeRoot, this.treeReader);
            }
        }
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

    TreeInspectorUIController.prototype.refreshIfNecessary = function() {
        if (this.debuggerHasRunSinceLastRefresh) {
            this.refresh();
        }
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
                return that.dbgObjectRenderer.createRepresentation(root, null, [], false)
                .then(function (representation) {
                    var link = document.createElement("a");
                    link.setAttribute("href", "#r=" + root.ptr());
                    representation.classList.add("tree-inspector-root-link");
                    link.appendChild(representation);
                    return link;
                })
            })
            .then(function (rootLinks) {
                rootLinks.forEach(function (link) {
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
        var hash = decodeURI(window.location.hash);
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

        if (this.currentRoots.length > 0 && rootPtr == null) {
            rootPtr = this.currentRoots[0].ptr();
        }

        this.pointerField.value = rootPtr;
        this.createAndRender(nodePtr);
    }

    TreeInspectorUIController.prototype.saveHashAndQueueCreateAndRender = function() {
        window.location.hash = "r=" + this.pointerField.value;
        // Changing the hash will trigger a create and render on the hash change.
    }

    TreeInspectorUIController.prototype.instantiateFieldController = function(defaultTypes) {
        if (this.fieldSupportContainer == null) {
            throw new Error("UI must be instantiated before the field controller.");
        }

        var that = this;
        this.fieldSupportController = FieldSelector.Create(this.fieldSupportContainer, function updateRenderTree(updatedDbgObjects) {
            that.enqueueWork(function() {
                return that.treeReader.updateFields(that.treeRoot, updatedDbgObjects);
            })
        });

        return Promise.map(
            defaultTypes, 
            function (type) { return that.fieldSupportController.addType(type); }
        );
    }

    TreeInspectorUIController.prototype.instantiateUI = function(container) {
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

        pointerInputControl.appendChild(createElement("label",  "Address:", {"for": id("pointer")}));
        pointerInputControl.appendChild(ws());

        var loadButton = createElement("button", "Load", null, {
            "click": function() { that.saveHashAndQueueCreateAndRender(); }
        });
        this.pointerField = createElement("input", null, {
            "type": "text", 
            "id": id("pointer")
        }, {
            "keypress": function (e) {
                if (e.which == 13) {
                    loadButton.click();
                }
            }
        });
        pointerInputControl.appendChild(this.pointerField);

        toolbar.appendChild(ws());

        toolbar.appendChild(loadButton);

        toolbar.appendChild(ws());

        toolbar.appendChild(ws());
        var expandTreeControl = createElement("nobr");
        toolbar.appendChild(expandTreeControl);

        expandTreeControl.appendChild(createElement("input", null, {
            name: "fullyExpand",
            id: id("FullyExpand"),
            type: "checkbox",
            checked: this.expandTreeAutomatically ? "checked" : undefined
        }, {
            "change": function(e) {
                that.setExpandTreeAutomatically(e.target.checked);
            }
        }));

        var that = this;
        expandTreeControl.appendChild(createElement("label", "Expand Tree Automatically", {
            "for": id("FullyExpand")
        }));

        var updateCheckboxControl = createElement("nobr");
        toolbar.appendChild(updateCheckboxControl);
        updateCheckboxControl.appendChild(ws());

        var messageContainer = createElement("div", null, {
            id: id("RefreshOnBreakMessage"),
            class: "popup-message-container"
        });

        var message = createElement("div", "The debugged process has run since the tree was last updated.", {
            class: "popup-message"
        });
        var buttons = createElement("div", null, { class: "buttons" });
        buttons.appendChild(createElement("button", "Update Tree", {
            class: "small-button light"
        }, { 
            click: function () {
                messageContainer.classList.remove("show");
                that.refreshIfNecessary();
            }
        }));
        buttons.appendChild(createElement("button", "Not Now", {
            class: "small-button light"
        }, {
            click: function () {
                messageContainer.classList.remove("show");
                that.setNotifyOnBreak(false);
            }
        }));

        JsDbg.RegisterOnBreakListener(function() {
            if (that.notifyOnBreak) {
                messageContainer.classList.add("show");
            }
        });

        message.appendChild(buttons);
        messageContainer.appendChild(message);

        updateCheckboxControl.appendChild(messageContainer);
        updateCheckboxControl.appendChild(createElement("input", null, {
            name: "refreshOnBreak",
            id: id("RefreshOnBreak"),
            type: "checkbox",
            checked: window.sessionStorage.getItem(id("RefreshOnBreak")) === "true" ? "checked" : undefined
        }, {
            "change": function (e) {
                messageContainer.classList.remove("show");
                that.setRefreshOnBreak(e.target.checked);
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

            var t = TallTree.GetTreeRangeAsText(r);
            if (t) {
                event.clipboardData.setData("text/plain", t);
                event.preventDefault();
            }
        });
    }

    return {
        GetActions: function (extension, description, rootObjectPromise, emphasisObjectPromise) {
            return Promise.all([rootObjectPromise, emphasisObjectPromise])
            .thenAll(function (rootObject, emphasisObject) {
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
                window.requestAnimationFrame(function() { uiController.refresh(); });
            })

            return function() {
                return uiController.refresh();
            }
        }
    }
})();