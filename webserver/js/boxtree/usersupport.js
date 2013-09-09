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
                var oldPrototype = field.type.prototype.__proto__;
                var newPrototype = Object.create(oldPrototype);
                field.type.prototype.__proto__ = newPrototype;
                newPrototype.collectUserFields = function(fields) {
                    if (oldPrototype.collectUserFields) {
                        oldPrototype.collectUserFields(fields);
                    }
                    fields.push(field);
                };
                modifiedTypes.push(field.type);
            }
        });
    }

    function uninject() {
        // Unwind the modified type stack.
        while (modifiedTypes.length > 0) {
            var injectedType = modifiedTypes.pop();
            injectedType.prototype.__proto__ = injectedType.prototype.__proto__.__proto__;
        }
    }

    return function () {
        uninject();
        inject();
    }
})();
reinjectUserFields();

// Extend DbgObject with the capability to eval a string against itself.
DbgObject.prototype.BoxTreeEvaluate = function(string, e) {
    return eval(string);
}

document.addEventListener("DOMContentLoaded", function() {
    function refreshTreeUIAfterFieldChange() {
        reinjectUserFields();
        if (rootTreeNode != null) {
            rootTreeNode.updateRepresentation();
        }
    }

    function constructTable(rows) {
        var columnCount = rows.reduce(function(max, row) { return Math.max(max, row.length); }, 0);
        var table = document.createElement("table");
        for (var i = 0; i < columnCount; ++i) {
            table.appendChild(document.createElement("col"));
        }
        for (var i = 0; i < rows.length; ++i) {
            var row = rows[i];
            var rowElement = document.createElement("tr");
            for (var j = 0; j < row.length; ++j) {
                var cellContents = row[j];
                var cellElement = document.createElement("td");

                cellElement.appendChild(cellContents);
                rowElement.appendChild(cellElement);
            }
            table.appendChild(rowElement);
        }

        return table;
    }

    function nativeCodeToString(f) {
        f = f.toString();
        // trim prologue
        f = f.substr(f.indexOf("{") + 1);

        // trim epilogue
        f = f.substr(0, f.lastIndexOf("}") - 1);

        // get rid of common whitespace
        var lines = f.split("\n");
        var interestingLines = [];
        var minSpace = lines
            .filter(function(s) { return s.match(/^\s*[^\s]/); }) // has some non-whitespace
            .map(function(s) { return s.match(/^\s*/)[0].length; }) // count white-space at start of line
            .reduce(function(x, y) { return Math.min(x, y); }, Infinity); // get the min

        while (lines.length > 0 && lines[0].match(/^\s*$/)) {
            lines = lines.slice(1);
        }

        return lines
            .map(function(s) { return s.substr(minSpace) })
            .join("\n");
    }

    function insertTextAtCursor(input, text) {
        if (input.selectionStart || input.selectionStart == 0) {
            var start = input.selectionStart;
            var end = input.selectionEnd;
            input.value = input.value.substring(0, start)
                + text
                + input.value.substring(end, input.value.length);
            input.selectionStart = end + text.length;
            input.selectionEnd = end + text.length;
        } else {
            input.value += text;
        }
    }

    function buildFieldUI(f) {
        var container = document.createElement("div");
        container.className = "field";

        var checkbox = document.createElement("input");
        checkbox.setAttribute("type", "checkbox");
        checkbox.setAttribute("id", f.fullname);
        checkbox.checked = f.enabled;
        container.appendChild(checkbox);
        checkbox.addEventListener("change", function() {
            f.enabled = checkbox.checked;
            refreshTreeUIAfterFieldChange();
        })

        var label = document.createElement("label");
        label.setAttribute("for", f.fullname);
        label.innerHTML = f.fullname;
        container.appendChild(label);

        var edit = document.createElement("span");
        edit.className = "edit button";
        edit.addEventListener("mousedown", function() { editField(f, container); });
        container.appendChild(edit);

        var remove = document.createElement("span");
        remove.className = "remove button";
        remove.addEventListener("mousedown", function() { removeField(f, container); });
        container.appendChild(remove);

        // Build the editor.
        var editor = document.createElement("div");
        editor.className = "editor";

        var typeInput = document.createElement("input");
        typeInput.className = "edit-type";
        typeInput.value = f.fullname.substr(0, f.fullname.indexOf("."));
        typeInput.addEventListener("change", function() { updateField(f, container); });
        typeInput.setAttribute("type", "text");

        var typeLabel = document.createElement("label");
        typeLabel.innerHTML = "Type: ";

        var nameInput = document.createElement("input");
        nameInput.className = "edit-name";
        nameInput.setAttribute("type", "text");
        nameInput.value = f.fullname.substr(f.fullname.indexOf(".") + 1);
        nameInput.addEventListener("change", function() { updateField(f, container); });

        var nameLabel = document.createElement("label");
        nameLabel.innerHTML = "Name: ";

        var shortNameInput = document.createElement("input");
        shortNameInput.className = "edit-shortName";
        shortNameInput.setAttribute("type", "text");
        shortNameInput.value = f.shortname;
        shortNameInput.addEventListener("change", function() { updateField(f, container); });

        var shortNameLabel = document.createElement("label");
        shortNameLabel.innerHTML = "Short Name: ";

        var codeInput = document.createElement("textarea");
        codeInput.className = "edit-code";
        codeInput.setAttribute("spellcheck", "false");
        codeInput.addEventListener("change", function() { updateField(f, container); });
        codeInput.setAttribute("placeholder", "See built-in fields for examples.");
        codeInput.value = nativeCodeToString(f.html);
        codeInput.addEventListener("keydown", function(e) {
            if (e.keyCode == 9) {
                // Replace tab keypresses with 4 spaces.
                e.preventDefault();
                insertTextAtCursor(codeInput, "    ");
            }
        })

        var codeLabel = document.createElement("label");
        codeLabel.setAttribute("for", codeInput.getAttribute("id"));
        codeLabel.innerHTML = "Code: ";

        editor.appendChild(constructTable([
            [typeLabel, typeInput],
            [nameLabel, nameInput],
            [shortNameLabel, shortNameInput],
            [codeLabel, codeInput]
        ]));

        container.appendChild(editor);

        return container;
    }

    function editField(f, container) {
        if (container.className.indexOf(" editing") >= 0) {
            // Already being edited, so save.
            if (checkField(f, container)) {
                container.className = container.className.replace(" editing", "");
            }
        } else {
            // Start editing.
            container.className += " editing";
        }
    }

    function removeField(f, container) {
        if (f.enabled) {
            f.enabled = false;
            refreshTreeUIAfterFieldChange();
        }

        container.parentNode.removeChild(container);        
    }

    function evaluate(box, code) {
        return eval(codeString);
    }

    function checkField(f, container) {
        try {
            var type = DbgObject.prototype.BoxTreeEvaluate(typeString);
            return true;
        } catch (ex) {
            return false;
        }
    }

    function updateField(f, container) {
        var typeString = container.querySelector(".edit-type").value;
        var nameString = container.querySelector(".edit-name").value;
        var shortNameString = container.querySelector(".edit-shortName").value;
        var codeString = container.querySelector(".edit-code").value;

        try {
            f.type = DbgObject.prototype.BoxTreeEvaluate(typeString)
            container.querySelector(".edit-type").style.color = "";
        } catch (ex) {
            container.querySelector(".edit-type").style.color = "red";
        }
        f.fullname = typeString + "." + nameString;
        f.shortname = shortNameString;
        f.html = function(e) { 
            try {
                return this.BoxTreeEvaluate("(function() { " + codeString + "}).call(this, e)", e);
            } catch (ex) {
                return "<span style='color:red' title='" + ex + "'>[ERROR]</span>";
            }
        };

        container.querySelector("label").innerHTML = f.fullname;

        if (f.enabled) {
            refreshTreeUIAfterFieldChange();
        }
    }

    // Add the field selection UI.
    var container = document.createElement("div");
    container.className = "field-selection";

    var showHide = document.createElement("div");
    showHide.className = "show-hide button";
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
            var ui = buildFieldUI(f);
            fields.appendChild(ui);
        });

    // Add a button for adding a new field.
    var addNew = document.createElement("span");
    addNew.className = "add button";
    container.appendChild(addNew);

    var addedFieldCounter = 0;
    addNew.addEventListener("click", function() {
        UserFields.push({
            type: LayoutBox,
            editable:true,
            fullname: "LayoutBox.Custom" + (++addedFieldCounter),
            shortname: "f" + addedFieldCounter,
            html: function(box) { return "_"; }
        });

        fields.appendChild(buildFieldUI(UserFields[UserFields.length - 1]));
    });

    document.body.appendChild(container);
});