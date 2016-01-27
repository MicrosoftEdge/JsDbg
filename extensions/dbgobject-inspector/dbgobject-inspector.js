"use strict";

// dbgobject-inspector.js
// Provides UI for inspecting a single DbgObject.
var DbgObjectInspector = undefined;
JsDbg.OnLoad(function() {

    var activeDropDown = null;

    function inspect(dbgObject) {
        var typeExplorer = TypeExplorer.Create(dbgObject, {});
        var inspector = document.createElement("div");
        inspector.classList.add("dbgobject-inspector")
        var container = document.createElement("div");
        inspector.appendChild(container);
        container.classList.add("drop-down");
        container.style.display = "none";

        var isInitialized = false;
        inspector.addEventListener("click", function () {
            if (activeDropDown != null && activeDropDown != container) {
                activeDropDown.style.display = "none";
            }

            if (!isInitialized) {
                isInitialized = true;
                typeExplorer.toggleExpansion();
                typeExplorer.render(container)
                .then(function () {
                    container.style.display = "";
                    activeDropDown = container;
                })
            } else {
                if (activeDropDown != container) {
                    container.style.display = "";
                    container.style.transform = "";
                    currentAdjustment = {x: 0, y:0};
                    activeDropDown = container;
                }
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
                    container.style.transform = transform;
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

        inspector.appendChild(document.createTextNode(dbgObject.ptr()));
        return inspector;
    }

    DbgObjectInspector = {
        Inspect: inspect
    }
});