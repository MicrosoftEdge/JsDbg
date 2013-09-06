"use strict";

// usersupport.js
// Peter Salas
//
// Support functionality for user.js.

var reinjectUserFields = (function() {
    var modifiedTypes = [];

    function inject() {
        UserFields.forEach(function(field) {
            if (field.enabled) {
                var previous = field.type.prototype.collectUserFields;
                modifiedTypes.push([field.type, previous]);
                field.type.prototype.collectUserFields = function(fields) {
                    previous(fields);
                    fields.push(field);
                };
            }
        });
    }

    function uninject() {
        // Unwind the modified type stack.
        while (modifiedTypes.length > 0) {
            var injection = modifiedTypes.pop();
            injection[0].prototype.collectUserFields = injection[1];
        }
    }

    return function () {
        uninject();
        inject();
    }
})();
reinjectUserFields();

document.addEventListener("DOMContentLoaded", function() {
    // Add the field selection UI.
    var container = document.createElement("div");
    container.className = "field-selection";

    var showHide = document.createElement("div");
    showHide.className = "show-hide";
    var isCollapsed = false;
    showHide.addEventListener("click", function() {
        if (isCollapsed) {
            container.className = "field-selection";
        } else {
            container.className = "field-selection collapsed";
        }
        isCollapsed = !isCollapsed;
    })
    container.appendChild(showHide);

    var fields = document.createElement("div");
    fields.className = "fields";
    container.appendChild(fields);

    UserFields
        .sort(function(a, b) { return a.fullname.localeCompare(b.fullname); })
        .forEach(function(f) {
            var checkbox = document.createElement("input");
            checkbox.setAttribute("type", "checkbox");
            checkbox.setAttribute("id", f.fullname);
            checkbox.checked = f.enabled;
            fields.appendChild(checkbox);
            checkbox.addEventListener("change", function() {
                f.enabled = checkbox.checked;
                reinjectUserFields();
                if (rootTreeNode != null) {
                    rootTreeNode.updateRepresentation();
                }
            })

            var label = document.createElement("label");
            label.setAttribute("for", f.fullname);
            label.innerHTML = f.fullname;
            fields.appendChild(label);

            fields.appendChild(document.createElement("br"));
        });

    document.body.appendChild(container);
});