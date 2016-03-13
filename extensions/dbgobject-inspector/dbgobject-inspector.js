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

    function initializeInspector(dbgObject, inspector, objectPtr) {
        var typeExplorer = TypeExplorer.Create(dbgObject, { includeBaseTypesByDefault: true });
        inspector.typeExplorer = typeExplorer;

        var dropDown = document.createElement("div");
        inspector.insertBefore(dropDown, objectPtr);
        dropDown.classList.add("drop-down");

        var title = document.createElement("div");
        title.classList.add("title");
        title.textContent = dbgObject.ptr() + " " + dbgObject.typeDescription();
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
                dropDown.style.transform = "";
                currentWindowAdjustment = {x: 0, y:0};
                activateInspector(inspector);
                typeExplorer.focus();
            } else if (objectPtr.contains(e.target)) {
                // Close it out.
                deactivateCurrentInspector();
            }

            e.stopPropagation();
            e.preventDefault();
        });

        var currentWindowAdjustment = { x: 0, y: 0 };
        function beginWindowMove(mouseDownEvent) {
            trackMouseDrag(
                mouseDownEvent, 
                currentWindowAdjustment, 
                function onWindowMove(newX, newY) {
                    currentWindowAdjustment.x = newX;
                    currentWindowAdjustment.y = newY;
                    var transform = "translate(" + currentWindowAdjustment.x + "px, " + currentWindowAdjustment.y + "px)";
                    dropDown.style.transform = transform;
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
            if (e.target == container && e.offsetY < parseInt(getComputedStyle(container).borderTopWidth)) {
                return beginWindowMove(e);
            } else if (e.target == dropDown) {
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