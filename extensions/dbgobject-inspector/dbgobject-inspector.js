//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// dbgobject-inspector.js
// Provides UI for inspecting a single DbgObject.
var DbgObjectInspector = undefined;
Loader.OnLoad(function() {

    var activeInspector = null;

    function activateInspector(inspector) {
        deactivateCurrentInspector();
        inspector.classList.add("active");
        activeInspector = inspector;
        if (activeInspector != null) {
            activeInspector.typeExplorer.requestRerender(/*changeFocus*/true);
        }
        applyInitialWindowAdjustment(inspector.querySelector(".drop-down"));
    }

    function deactivateCurrentInspector() {
        if (activeInspector != null) {
            activeInspector.classList.remove("active");
            activeInspector = null;
        }
    }

    function trackMouseDrag(mouseDownEvent, current, onChange, onFinish) {
        var lastPoint = {x: mouseDownEvent.clientX, y: mouseDownEvent.clientY};
        var currentAdjustment = {x: current.x, y: current.y};
        var drag = function(e) {
            var thisPoint = {x: e.clientX, y: e.clientY};
            var delta = {x:thisPoint.x - lastPoint.x, y:thisPoint.y - lastPoint.y};
            lastPoint = thisPoint;
            currentAdjustment.x += delta.x;
            currentAdjustment.y += delta.y;
            onChange(currentAdjustment.x, currentAdjustment.y);
        }

        var mouseUpHandler = function() {
            window.removeEventListener("mousemove", drag);
            window.removeEventListener("mouseup", mouseUpHandler);
            onFinish();
        }
        window.addEventListener("mousemove", drag);
        window.addEventListener("mouseup", mouseUpHandler);
    }

    function inspect(dbgObject, html) {
        var inspector = document.createElement("span");
        inspector.classList.add("dbgobject-inspector")

        var objectPtr = document.createElement("span");
        objectPtr.classList.add("object-ptr");
        objectPtr.innerHTML = html;
        inspector.appendChild(objectPtr);

        function initialize(e) {
            inspector.removeEventListener("click", initialize);
            initializeInspector(dbgObject, inspector, objectPtr);
            e.stopPropagation();
            e.preventDefault();
        }
        inspector.addEventListener("click", initialize);
        return inspector;
    }

    function applyInitialWindowAdjustment(node) {
        node.adjustment = {x:0, y:0};
        var changedAdjustment = true;
        var currentNode = node.parentNode;
        var EDGEBUFFER = 5;
        var dropDownRect = null;

        while (currentNode != null && currentNode.nodeType == Node.ELEMENT_NODE) {
            if (changedAdjustment) {
                applyWindowAdjustment(node);
                dropDownRect = node.getBoundingClientRect()
                changedAdjustment = false;
            }

            if (getComputedStyle(currentNode).overflowX != "visible") {
                var scrollerRect = currentNode.getBoundingClientRect();
                var leftEdgeAdjustment = (scrollerRect.left + EDGEBUFFER) - dropDownRect.left;
                var rightEdgeAdjustment = (scrollerRect.right - EDGEBUFFER) - dropDownRect.right - (currentNode.offsetWidth - currentNode.clientWidth);
                if (rightEdgeAdjustment < 0) {
                    node.adjustment.x += Math.round(Math.max(rightEdgeAdjustment, leftEdgeAdjustment));
                    changedAdjustment = true;
                }
            }

            if (getComputedStyle(currentNode).overflowY != "visible") {
                var scrollerRect = currentNode.getBoundingClientRect();
                var topEdgeAdjustment = (scrollerRect.top + EDGEBUFFER) - dropDownRect.top;
                var bottomEdgeAdjustment = (scrollerRect.bottom - EDGEBUFFER) - dropDownRect.bottom - (currentNode.offsetHeight - currentNode.clientHeight);
                if (bottomEdgeAdjustment < 0) {
                    node.adjustment.y += Math.round(Math.max(bottomEdgeAdjustment, topEdgeAdjustment));
                    changedAdjustment = true;
                }
            }

            currentNode = currentNode.parentNode;
        }
    }

    function applyWindowAdjustment(node) {
        node.style.transform = "translate(" + node.adjustment.x + "px, " + node.adjustment.y + "px)";
    }

    function initializeInspector(dbgObject, inspector, objectPtr) {
        var typeExplorer = TypeExplorer.Create(dbgObject, { includeBaseTypesByDefault: true });
        inspector.typeExplorer = typeExplorer;

        var dropDown = document.createElement("div");
        inspector.insertBefore(dropDown, objectPtr.nextSibling);
        dropDown.classList.add("drop-down");
        dropDown.adjustment = {x:0, y:0};

        var title = document.createElement("div");
        title.classList.add("title");
        var titleWrapper = document.createElement("span");
        titleWrapper.textContent = dbgObject.ptr() + " " + dbgObject.type.name();
        title.appendChild(titleWrapper);
        dropDown.appendChild(title);

        var container = document.createElement("div");
        container.classList.add("window");
        dropDown.appendChild(container);

        var close = document.createElement("button");
        close.classList.add("small-button");
        close.classList.add("light");
        close.classList.add("close");
        dropDown.appendChild(close);
        close.textContent = "Close";
        close.addEventListener("click", function (e) {
            deactivateCurrentInspector();
            e.stopPropagation();
            e.preventDefault();
        });

        inspector.addEventListener("click", function (e) {
            if (activeInspector != inspector) {
                deactivateCurrentInspector();
            }

            if (activeInspector != inspector) {
                activateInspector(inspector);
                typeExplorer.focus();
            } else if (objectPtr.contains(e.target)) {
                // Close it out.
                deactivateCurrentInspector();
            }

            // The popup eats all clicks.
            e.stopPropagation();
        });

        function beginWindowMove(mouseDownEvent) {
            trackMouseDrag(
                mouseDownEvent, 
                dropDown.adjustment, 
                function onWindowMove(newX, newY) {
                    dropDown.adjustment.x = newX;
                    dropDown.adjustment.y = newY;
                    applyWindowAdjustment(dropDown);
                },
                function onWindowMoveFinish() {
                    blocker.parentNode.removeChild(blocker);
                }
            );

            var blocker = document.createElement("div");
            blocker.style.position = "fixed";
            blocker.style.top = "0";
            blocker.style.bottom = "0";
            blocker.style.left = "0";
            blocker.style.right = "0";
            blocker.style.zIndex = "10000";

            inspector.appendChild(blocker);
            mouseDownEvent.preventDefault();
        }

        var currentWindowSize = { x: 0, y: 0};
        function beginWindowResize(mouseDownEvent) {
            function getBorderPaddingFrame(element) {
                var computedStyle = getComputedStyle(element);
                return {
                    top: parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.borderTopWidth),
                    right: parseFloat(computedStyle.paddingRight) + parseFloat(computedStyle.borderRightWidth),
                    bottom: parseFloat(computedStyle.paddingBottom) + parseFloat(computedStyle.borderBottomWidth),
                    left: parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.borderLeftWidth)
                };
            }

            var frame = getBorderPaddingFrame(container);
            currentWindowSize.x = container.offsetWidth - frame.left - frame.right;
            currentWindowSize.y = container.offsetHeight - frame.top - frame.bottom;

            trackMouseDrag(
                mouseDownEvent,
                currentWindowSize,
                function onWindowResize(newX, newY) {
                    currentWindowSize.x = Math.max(newX, 200);
                    currentWindowSize.y = Math.max(newY, 100);
                    container.style.width = currentWindowSize.x + "px";
                    container.style.height = currentWindowSize.y + "px";
                },
                function onWindowMoveFinish() {
                    blocker.parentNode.removeChild(blocker);
                }
            );

            var blocker = document.createElement("div");
            blocker.style.position = "fixed";
            blocker.style.top = "0";
            blocker.style.bottom = "0";
            blocker.style.left = "0";
            blocker.style.right = "0";
            blocker.style.zIndex = "10000";
            blocker.style.cursor = "nwse-resize";

            inspector.appendChild(blocker);
            mouseDownEvent.preventDefault();
        }

        dropDown.addEventListener("mousedown", function(e) {
            var offsetY = e.offsetY;
            var target = e.target;
            if (target == title) {
                target = container;
                offsetY = 0;
            }
            if (target == container && offsetY < parseInt(getComputedStyle(container).borderTopWidth)) {
                return beginWindowMove(e);
            } else if (target == dropDown) {
                return beginWindowResize(e);
            }
        })
        
        typeExplorer.toggleExpansion();
        activateInspector(inspector);
        typeExplorer.render(container).then(null, function (err) {
            console.log(err);
        })
    }

    function rerenderActiveInspector() {
        if (activeInspector != null) {
            activeInspector.typeExplorer.requestRerender(/*changeFocus*/false);
        }
    }

    JsDbg.RegisterOnMemoryWriteListener(rerenderActiveInspector);

    DbgObjectInspector = {
        Inspect: inspect
    }
});