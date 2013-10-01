"use strict";

// fieldsupport.js
// Peter Salas
//
// Functionality for augmenting types with a method, collectUserFields(fieldsArray), which allows a visualization
// of DbgObjects to be extended live with built-in or user-defined fields.  Each field exposes the following API:
//    - fullname: a descriptive name
//    - shortname: an optional short name to be used when displaying the visualization
//    - html: a method, called on the DbgObject, that takes the representation DOM element and returns undefined, HTML, or a DOM node

var FieldSupport = (function() {
    function initialize(StoragePrefix, UserFields, DefaultTypeName, TypeMap, UpdateUI) {

        var reinjectUserFields = (function() {
            var modifiedTypes = [];

            function inject() {
                UserFields.forEach(function(field) {
                    if (field.enabled && field.type in TypeMap) {
                        var type = TypeMap[field.type];
                        var oldPrototype = type.prototype.__proto__;
                        var newPrototype = Object.create(oldPrototype);
                        type.prototype.__proto__ = newPrototype;
                        newPrototype.collectUserFields = function(fields) {
                            if (oldPrototype.collectUserFields) {
                                oldPrototype.collectUserFields(fields);
                            }
                            fields.push(field);
                        };
                        modifiedTypes.push(type);
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

        // Extend DbgObject with the capability to eval a string against itself.
        DbgObject.prototype.InjectedFieldEvaluate = function(string, e) {
            return eval(string);
        }

        function refreshTreeUIAfterFieldChange() {
            reinjectUserFields();
            UpdateUI();
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

                    if (cellContents) {
                        cellElement.appendChild(cellContents);
                    }
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
            checkbox.setAttribute("id", "field-cb-" + f.id);
            checkbox.checked = f.enabled;
            container.appendChild(checkbox);
            checkbox.addEventListener("change", function() {
                f.enabled = checkbox.checked;
                refreshTreeUIAfterFieldChange();
            })

            var label = document.createElement("label");
            label.setAttribute("for", "field-cb-" + f.id);
            label.innerHTML = f.type + "." + f.fullname;
            container.appendChild(label);

            var edit = document.createElement("span");
            edit.className = "edit button";
            edit.addEventListener("mousedown", function() { editField(f, container); });
            container.appendChild(edit);

            if (f.localstorageid) {
                var remove = document.createElement("span");
                remove.className = "remove button";
                remove.addEventListener("mousedown", function() {
                    if (confirm("Are you sure you want to remove " + f.type + "." + f.fullname + "?")) {
                        removeField(f, container);
                    }
                });
                container.appendChild(remove);
            }

            // Build the editor.
            var editor = document.createElement("div");
            editor.className = "editor";

            var typeInput = document.createElement("input");
            typeInput.className = "edit-type";
            typeInput.value = f.type;
            typeInput.addEventListener("change", function() { updateField(f, container); });
            typeInput.setAttribute("type", "text");

            var typeLabel = document.createElement("label");
            typeLabel.innerHTML = "Type: ";

            var nameInput = document.createElement("input");
            nameInput.className = "edit-name";
            nameInput.setAttribute("type", "text");
            nameInput.value = f.fullname;
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
            codeInput.value = f.htmlString ? f.htmlString : nativeCodeToString(f.html);
            codeInput.addEventListener("keydown", function(e) {
                if (e.keyCode == 9) {
                    // Replace tab keypresses with 4 spaces.
                    e.preventDefault();
                    insertTextAtCursor(codeInput, "    ");
                }
            })

            var codeLabel = document.createElement("label");
            codeLabel.setAttribute("for", codeInput.getAttribute("id"));
            codeLabel.innerHTML = "JavaScript:";

            var codeDescription = document.createElement("span");
            codeDescription.className = "code-description";
            var lines = [
                "<em>this</em> = DbgObject that represents the item; <em>e</em> = dom element",
                "return an html string or dom element to be displayed, or just modify <em>e.</em>"
            ]
            codeDescription.innerHTML = lines.join("<br />");

            editor.appendChild(constructTable([
                [typeLabel, typeInput],
                [nameLabel, nameInput],
                [shortNameLabel, shortNameInput],
                [codeLabel, codeDescription],
                [null, codeInput]
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

            if (f.localstorageid) {
                storage.delete(f.localstorageid);
                delete f.localstorageid;
            }

            container.parentNode.removeChild(container);        
        }

        function saveField(f, container) {
            if (f.localstorageid) {
                var typeString = container.querySelector(".edit-type").value;
                var nameString = container.querySelector(".edit-name").value;
                var shortNameString = container.querySelector(".edit-shortName").value;
                var codeString = container.querySelector(".edit-code").value;

                storage.set(f.localstorageid, {
                    type: typeString,
                    name: nameString,
                    shortName: shortNameString,
                    codeString: codeString
                });
            }
        }

        function checkField(f, container) {
            return container.querySelector(".edit-type").value in TypeMap;
        }

        function codeStringToFunction(codeString) {
            return function(e) { 
                try {
                    return this.InjectedFieldEvaluate("(function() { " + codeString + "}).call(this, e)", e);
                } catch (ex) {
                    return "<span style='color:red' title='" + ex + "'>[ERROR]</span>";
                }
            };
        }

        function updateField(f, container) {
            var typeString = container.querySelector(".edit-type").value;
            var nameString = container.querySelector(".edit-name").value;
            var shortNameString = container.querySelector(".edit-shortName").value;
            var codeString = container.querySelector(".edit-code").value;


            if (typeString in TypeMap) {
                f.type = typeString;
                container.querySelector(".edit-type").style.color = "";
            } else {
                container.querySelector(".edit-type").style.color = "red";
            }
            f.fullname = nameString;
            f.shortname = shortNameString;
            f.html = codeStringToFunction(codeString);
            f.htmlString = codeString;

            container.querySelector("label").innerHTML = f.type + "." + f.fullname;

            if (f.enabled) {
                refreshTreeUIAfterFieldChange();
            }

            saveField(f, container);
        }

        var storage = Catalog.Load(StoragePrefix + ".UserFields");

        // Check if there's anything stored in local storage, and if so, upgrade it to the persistent store.
        var resultsToSave = {};
        var keysToDelete = [];
        for (var key in window.localStorage) {
            if (key.indexOf(StoragePrefix + ".UserField.") == 0) {
                try {
                    var savedField = JSON.parse(window.localStorage.getItem(key));
                    var newKey = key.substr((StoragePrefix + ".UserField.").length);
                    savedField.localstorageid = newKey;
                    resultsToSave[newKey] = savedField;
                    keysToDelete.push(key);
                } catch (ex) { }
            }
        }

        if (keysToDelete.length > 0) {
            storage.setMultiple(resultsToSave);
            keysToDelete.forEach(function(key) { window.localStorage.removeItem(key); });
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

        storage.all(function(saved) {
            for (var key in saved) {
                var savedField = saved[key];

                // Populate the UserFields array from localStorage.
                UserFields.push({
                    type: savedField.type,
                    enabled: false,
                    fullname: savedField.name,
                    localstorageid: key,
                    shortname: savedField.shortName,
                    html: codeStringToFunction(savedField.codeString),
                    htmlString: savedField.codeString
                });
            }

            var uniqueId = 0;
            UserFields
                .sort(function(a, b) { return (a.type + "." + a.fullname).localeCompare((b.type + "." + b.fullname)); })
                .forEach(function(f) {
                    f.id = ++uniqueId;
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
                    type: DefaultTypeName,
                    enabled:true,
                    id: ++uniqueId,
                    fullname: "Custom" + (++addedFieldCounter),
                    localstorageid: (new Date() - 0) + "-" + Math.round(Math.random() * 1000000),
                    shortname: "f" + addedFieldCounter,
                    html: function() { return "_"; }
                });

                var fieldUI = buildFieldUI(UserFields[UserFields.length - 1]);
                fieldUI.className += " editing";
                fields.appendChild(fieldUI);

                saveField(UserFields[UserFields.length - 1], fieldUI);

                refreshTreeUIAfterFieldChange();
            });

            var browse = document.createElement("span");
            browse.className = "browse button";
            container.appendChild(document.createTextNode(" "));
            container.appendChild(browse);

            browse.addEventListener("click", function() {
                CatalogViewer.Instantiate(
                    StoragePrefix + ".UserFields", 
                    "Select fields to add:",
                    function(obj) { return [obj.user, obj.value.type, obj.value.name] },
                    function(selected) {
                        selected.forEach(function (object) {
                            var field = object.value;
                            UserFields.push({
                                type: field.type,
                                id:++uniqueId,
                                enabled: false,
                                fullname: field.name,
                                shortname: field.shortName,
                                html: codeStringToFunction(field.codeString),
                                htmlString: field.codeString
                            });

                            fields.appendChild(buildFieldUI(UserFields[UserFields.length - 1]));
                        });
                    },
                    function(a) {
                        return (a.user + "." + a.value.type + "." + a.value.name)
                    }
                );
            });

            reinjectUserFields();

            document.body.appendChild(container);
        });
    }

    function renderFields(injectedObject, dbgObject, representation) {
        var fields = [];
        if (injectedObject.collectUserFields) {
            injectedObject.collectUserFields(fields);
        }

        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            var html = field.html.call(dbgObject, representation);
            if (html !== undefined) {
                var p = document.createElement("p");
                if (field.shortname.length > 0) {
                    p.innerHTML = field.shortname + ":";
                }
                try {
                    p.appendChild(html);
                } catch (ex) {
                    p.innerHTML += html;
                }
                representation.appendChild(p);
                representation.appendChild(document.createTextNode(" "));
            }
        };
    }

    return {
        Initialize: initialize,
        RenderFields: renderFields
    };
})();