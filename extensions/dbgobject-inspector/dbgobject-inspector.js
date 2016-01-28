"use strict";

// dbgobject-inspector.js
// Provides UI for inspecting a single DbgObject.
var DbgObjectInspector = undefined;
JsDbg.OnLoad(function() {

    var activeInspector = null;

    function activateInspector(inspector) {
        deactivateCurrentInspector();
        inspector.classList.add("active");
        activeInspector = inspector;
    }

    function deactivateCurrentInspector() {
        if (activeInspector != null) {
            activeInspector.classList.remove("active");
            activeInspector = null;
        }
    }

    function inspect(dbgObject) {
        var typeExplorer = TypeExplorer.Create(dbgObject, { includeBaseTypesByDefault: true });
        var inspector = document.createElement("div");
        inspector.classList.add("dbgobject-inspector")

        var dropDown = document.createElement("div");
        inspector.appendChild(dropDown);
        dropDown.classList.add("drop-down");

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
        });

        var objectPtr = document.createElement("span");
        objectPtr.classList.add("object-ptr");
        objectPtr.textContent = dbgObject.ptr();
        inspector.appendChild(objectPtr);

        var isInitialized = false;
        inspector.addEventListener("click", function (e) {
            if (activeInspector != inspector) {
                deactivateCurrentInspector();
            }

            if (!isInitialized) {
                isInitialized = true;
                typeExplorer.toggleExpansion();
                typeExplorer.render(container).then(function () {
                    activateInspector(inspector);
                    typeExplorer.focus();
                })
            } else if (activeInspector != inspector) {
                dropDown.style.transform = "";
                currentAdjustment = {x: 0, y:0};
                activateInspector(inspector);
                typeExplorer.focus();
            } else if (e.target == objectPtr) {
                // Close it out.
                deactivateCurrentInspector();
            }
        });

        var currentAdjustment = { x: 0, y: 0 };
        container.addEventListener("mousedown", function(e) {
            if (e.target == container && e.offsetY < parseInt(getComputedStyle(container).borderTopWidth)) {
                var lastPoint = {x: e.clientX, y: e.clientY};
                var drag = function(e) {
                    var thisPoint = {x: e.clientX, y: e.clientY};
                    var delta = {x:thisPoint.x - lastPoint.x, y:thisPoint.y - lastPoint.y};
                    lastPoint = thisPoint;
                    currentAdjustment.x += delta.x;
                    currentAdjustment.y += delta.y;
                    var transform = "translate(" + currentAdjustment.x + "px, " + currentAdjustment.y + "px)";
                    dropDown.style.transform = transform;
                }

                var mouseUpHandler = function() {
                    window.removeEventListener("mousemove", drag);
                    window.removeEventListener("mouseup", mouseUpHandler);
                    blocker.parentNode.removeChild(blocker);
                }
                window.addEventListener("mousemove", drag);
                window.addEventListener("mouseup", mouseUpHandler);


                var blocker = document.createElement("div");
                blocker.style.position = "fixed";
                blocker.style.top = "0";
                blocker.style.bottom = "0";
                blocker.style.left = "0";
                blocker.style.right = "0";
                blocker.style.zIndex = "10000";

                inspector.appendChild(blocker);
                e.preventDefault();
            }
        })

        return inspector;
    }

    DbgObjectInspector = {
        Inspect: inspect
    }
});