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

                        // Inject a collectUserFields method on the type, preserving any existing
                        // injected fields as well as any fields that may be injected on the prototype,
                        // now or in the future.
                        var previousFields;
                        if (type.prototype.hasOwnProperty("collectUserFields")) {
                            // We've already augmented this type, so use the existing method.
                            previousFields = type.prototype.collectUserFields;
                        } else {
                            // We haven't yet augmented this type, so provide a method that
                            // will go up to the prototype at _runtime_ since we might inject
                            // one of the prototypes in the meantime.
                            previousFields = function(fields) {
                                var proto = Object.getPrototypeOf(type.prototype);
                                if (proto.collectUserFields) {
                                    proto.collectUserFields(fields);
                                }
                            };
                        }

                        type.prototype.collectUserFields = function(fields) {
                            previousFields(fields);
                            fields.push(field);
                        }
                        modifiedTypes.push(type);
                    }
                });
            }

            function uninject() {
                // Unwind the modified type stack.
                while (modifiedTypes.length > 0) {
                    var injectedType = modifiedTypes.pop();
                    delete injectedType.prototype.collectUserFields;
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

        function getTextAtCursor(input, count) {
            if (input.selectionStart || input.selectionStart == 0) {
                if (count < 0) {
                    var index = Math.max(input.selectionStart + count, 0);
                    count = input.selectionStart - index;
                    return input.value.substr(index, count);
                } else {
                    var index = input.selectionStart;
                    return input.value.substr(index, count);
                }
            } else {
                return input.value.substr(0, count);
            }
        }

        function replaceTextAtCursor(input, count, string) {
            if (input.selectionStart || input.selectionStart == 0) {
                var prefix = input.value.substr(0, count < 0 ? input.selectionStart + count : input.selectionStart);
                var suffix = input.value.substr(input.selectionStart + ((count > 0) ? count : 0));
                input.value = prefix + string + suffix;
                input.selectionStart = (prefix + string).length;
                input.selectionEnd = (prefix + string).length;
            }
        }

        function getLineAtCursor(input) {
            if (input.selectionStart || input.selectionStart == 0) {
                var index = input.selectionStart;
                var lines = input.value.split("\n");
                for (var i = 0; i < lines.length; ++i) {
                    if (index < lines[i].length + 1) {
                        return {
                            prefix: lines[i].substr(0, index),
                            suffix: lines[i].substr(index)
                        };
                    }

                    index -= lines[i].length + 1;
                }
            }
            return {
                prefix:"",
                suffix:""
            }
        }

        function handleCodeEditorKeyDown(input, e) {
            if (e.keyCode == 9) {
                // Replace tab keypresses with 4 spaces.
                e.preventDefault();
                var tab = "    ";
                if (e.shiftKey) {
                    // Shift+Tab means unindent.
                    if (getTextAtCursor(input, 0 - tab.length) == tab) {
                        replaceTextAtCursor(input, 0 - tab.length, "");
                    }
                } else {
                    replaceTextAtCursor(input, 0, tab);
                }
            } else if (e.keyCode == 13) {
                // When using enter, indent the same amount as the previous line.
                e.preventDefault();
                var currentLine = getLineAtCursor(input);
                var spaces = "";
                while (currentLine.prefix[spaces.length] == " ") {
                    spaces += " ";
                }

                replaceTextAtCursor(input, 0, "\n" + spaces);
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
                if (!f.external) {
                    window.sessionStorage.setItem(getSessionStorageKey(f), f.enabled);
                }
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

            var typeInput = document.createElement("select");
            typeInput.className = "edit-type";
            typeInput.innerHTML = typeSelectInnerHTML;
            typeInput.value = f.type;
            typeInput.addEventListener("change", function() { updateField(f, container); });
            typeInput.setAttribute("tabIndex", "1");

            var typeLabel = document.createElement("label");
            typeLabel.innerHTML = "Type: ";

            var nameInput = document.createElement("input");
            nameInput.className = "edit-name";
            nameInput.setAttribute("type", "text");
            nameInput.value = f.fullname;
            nameInput.addEventListener("change", function() { updateField(f, container); });
            nameInput.setAttribute("tabIndex", "2");

            var nameLabel = document.createElement("label");
            nameLabel.innerHTML = "Name: ";

            var shortNameInput = document.createElement("input");
            shortNameInput.className = "edit-shortName";
            shortNameInput.setAttribute("type", "text");
            shortNameInput.value = f.shortname;
            shortNameInput.addEventListener("change", function() { updateField(f, container); });
            shortNameInput.setAttribute("tabIndex", "3");

            var shortNameLabel = document.createElement("label");
            shortNameLabel.innerHTML = "Short Name: ";

            var asyncLabel = document.createElement("label");
            asyncLabel.innerHTML = "Async: ";

            var asyncInputContainer = document.createElement("div");
            var asyncInput = document.createElement("input");
            asyncInput.className = "edit-async";
            asyncInput.setAttribute("type", "checkbox");
            asyncInput.checked = f.async ? true : false;
            asyncInput.addEventListener("change", function() { updateField(f, container); });
            asyncInputContainer.appendChild(asyncInput);

            var codeInput = document.createElement("textarea");
            codeInput.className = "edit-code";
            codeInput.setAttribute("spellcheck", "false");
            codeInput.addEventListener("change", function() { updateField(f, container); });
            codeInput.setAttribute("placeholder", "See built-in fields for examples.");
            codeInput.value = f.htmlString ? f.htmlString : nativeCodeToString(f.html);
            codeInput.setAttribute("tabIndex", "3");
            codeInput.addEventListener("keydown", function(e) {
                handleCodeEditorKeyDown(codeInput, e);
            })

            var codeLabel = document.createElement("label");
            codeLabel.setAttribute("for", codeInput.getAttribute("id"));
            codeLabel.innerHTML = "JavaScript:";

            var codeDescription = document.createElement("span");
            codeDescription.className = "code-description";
            var lines = [
                "<em>this</em> = DbgObject that represents the item; <em>e</em> = dom element",
                "return an html string, dom element, modify <em>e</em>, or return a promise.",
                "documentation: "
            ]
            codeDescription.innerHTML = lines.join("<br />");
            
            Help.List()
                .map(Help.Link)
                .forEach(function(e) { codeDescription.appendChild(e); })

            editor.appendChild(constructTable([
                [typeLabel, typeInput],
                [nameLabel, nameInput],
                [shortNameLabel, shortNameInput],
                [asyncLabel, asyncInputContainer],
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
                    async: f.async ? true : false,
                    codeString: codeString
                });
            }
        }

        function checkField(f, container) {
            return container.querySelector(".edit-type").value in TypeMap;
        }

        function codeStringToFunction(codeString) {
            return function(e) { 
                return this.InjectedFieldEvaluate("(function() { " + codeString + "\n/**/}).call(this, e)", e);
            };
        }

        function updateField(f, container) {
            var typeString = container.querySelector(".edit-type").value;
            var nameString = container.querySelector(".edit-name").value;
            var shortNameString = container.querySelector(".edit-shortName").value;
            var codeString = container.querySelector(".edit-code").value;
            var isAsync = container.querySelector(".edit-async").checked;

            if (typeString in TypeMap) {
                f.type = typeString;
                container.querySelector(".edit-type").style.color = "";
            } else {
                container.querySelector(".edit-type").style.color = "red";
            }
            f.fullname = nameString;
            f.shortname = shortNameString;
            f.async = isAsync;
            f.html = codeStringToFunction(codeString);
            f.htmlString = codeString;

            container.querySelector("label").innerHTML = f.type + "." + f.fullname;

            if (f.enabled) {
                refreshTreeUIAfterFieldChange();
            }

            saveField(f, container);
        }

        function getSessionStorageKey(f) {
            var key = StoragePrefix + ".UserFields.Enabled.";
            if (f.external) {
                return null;
            } else if (f.localstorageid) {
                key += f.localstorageid;
            } else {
                key += f.type + "." + f.fullname;
            }

            return key;
        }

        var storage = Catalog.Load(StoragePrefix + ".UserFields");

        var typeOptions = [];
        for (var typeString in TypeMap) {
            typeOptions.push(typeString);
        }
        typeOptions.sort();
        var typeSelectInnerHTML = typeOptions.map(function(type) { return "<option value='" + type + "'>" + type + "</option>"; }).join("");

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

        if (window.sessionStorage.getItem(StoragePrefix + ".UserFieldsCollapsed") == "true") {
            container.className = container.className + " collapsed";
        }

        var showHide = document.createElement("div");
        showHide.className = "show-hide button";
        var isCollapsed = false;
        showHide.addEventListener("click", function() {
            if (isCollapsed) {
                window.sessionStorage.setItem(StoragePrefix + ".UserFieldsCollapsed", "false");
                container.className = "field-selection";
            } else {
                window.sessionStorage.setItem(StoragePrefix + ".UserFieldsCollapsed", "true");
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
                    async: savedField.async,
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
                    f.enabled = (window.sessionStorage.getItem(getSessionStorageKey(f)) == "true");

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
                var newField = {
                    type: DefaultTypeName,
                    enabled:true,
                    id: ++uniqueId,
                    async: true,
                    fullname: "Custom" + (++addedFieldCounter),
                    localstorageid: (new Date() - 0) + "-" + Math.round(Math.random() * 1000000),
                    shortname: "f" + addedFieldCounter,
                    html: function() { return "_"; }
                };
                UserFields.push(newField);

                var fieldUI = buildFieldUI(newField);
                fieldUI.className += " editing";
                fields.appendChild(fieldUI);

                saveField(newField, fieldUI);
                window.sessionStorage.setItem(getSessionStorageKey(newField), newField.enabled);

                refreshTreeUIAfterFieldChange();
            });

            var browse = document.createElement("span");
            browse.className = "browse button";
            container.appendChild(document.createTextNode(" "));
            container.appendChild(browse);

            browse.addEventListener("click", function() {
                CatalogViewer.Instantiate(
                    StoragePrefix + ".UserFields", 
                    function(store, user) {
                        var results = [];
                        for (var key in store) {
                            results.push({key: key, value: store[key], user: user});
                        }
                        return results;
                    },
                    "Select fields to add:",
                    function(obj) { return [obj.user, obj.value.type, obj.value.name] },
                    function(selected) {
                        selected.forEach(function (object) {
                            var field = object.value;
                            UserFields.push({
                                type: field.type,
                                id:++uniqueId,
                                enabled: true,
                                external: true,
                                async: field.async,
                                fullname: field.name,
                                shortname: field.shortName,
                                html: codeStringToFunction(field.codeString),
                                htmlString: field.codeString
                            });

                            fields.appendChild(buildFieldUI(UserFields[UserFields.length - 1]));
                        });

                        if (selected.length > 0) {
                            refreshTreeUIAfterFieldChange();
                        }
                    },
                    function(a) {
                        return (a.user + "." + a.value.type + "." + a.value.name)
                    }
                );
            });

            refreshTreeUIAfterFieldChange();

            document.body.appendChild(container);
        });
    }

    function handleFieldException(ex) {
        var errorSpan = document.createElement("span");
        errorSpan.style.color = "red";
        var errorMsg = ex.stack ? ex.toString() : JSON.stringify(ex);
        errorSpan.innerHTML = "(" + errorMsg + ")";
        return errorSpan;
    }

    function descify(obj) {
        if (obj == null || obj == undefined) {
            return obj;
        } else if (typeof(obj.desc) == typeof(descify)) {
            return Promise.as(obj.desc());
        } else if (typeof(obj) == typeof([])) {
            return Promise.map(obj, descify);
        } else {
            return obj;
        }
    }

    function renderFields(injectedObject, dbgObject, representation) {
        var fields = [];
        if (injectedObject.collectUserFields) {
            injectedObject.collectUserFields(fields);
        }

        return Promise
            // Create the representations...
            .join(fields.map(function(field) { 
                try {
                    var result;
                    if (field.async) {
                        result = Promise.as(field.html.call(dbgObject, representation));
                    } else {
                        result = Promise.as(JsDbg.RunSynchronously(field.html.bind(dbgObject, representation)));
                    }

                    return result.then(descify).then(
                        function(x) { return x; }, 
                        function (ex) { return handleFieldException(ex); }
                    );
                } catch (ex) {
                    return handleFieldException(ex);
                }
            }))

            // Apply the representations to the container...
            .then(function(fieldRepresentations) {
                fieldRepresentations.forEach(function(html, i) {
                    if (html !== undefined) {
                        var field = fields[i];
                        var div = document.createElement("div");

                        if (field.shortname.length > 0) {
                            div.innerHTML = field.shortname + ":";
                        }
                        if (typeof(html) == typeof("") || typeof(html) == typeof(1)) {
                            div.innerHTML += html;
                        } else {
                            try {
                                div.appendChild(html);
                            } catch (ex) {
                                div.innerHTML += html;
                            }
                        }
                        representation.appendChild(div);
                        representation.appendChild(document.createTextNode(" "));
                    }
                });
            })

            // And return the container.
            .then(function() { return representation; });
    }

    return {
        Initialize: initialize,
        RenderFields: renderFields
    };
})();