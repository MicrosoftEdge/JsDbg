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

        var mouseleavePending = false;
        inspector.addEventListener("mouseover", function () {
            console.log(activeDropDown);
            if (activeDropDown != null && activeDropDown != container) {
                activeDropDown.style.display = "none";
            }

            container.style.display = "";
            activeDropDown = container;
        });

        inspector.addEventListener("mouseleave", function () {
            if (activeDropDown == container) {
                mouseleavePending = true;
                setTimeout(function () {
                    if (mouseleavePending && activeDropDown == container) {
                        container.style.display = "none";
                        activeDropDown = null;
                    }
                }, 500);
            }
        })
        typeExplorer.toggleExpansion();
        typeExplorer.render(container);
        inspector.appendChild(document.createTextNode(dbgObject.ptr()));
        return inspector;
    }

    DbgObjectInspector = {
        Inspect: inspect
    }
});