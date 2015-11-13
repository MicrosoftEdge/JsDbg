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
    var knownTypes = {};
    var typeOptionHTML = "";
    var typeAliases = {};
    var selectControls = [];

    var requestRebuildTypeOptions = (function() {
        var currentRebuildRequest = null;
        return function() {
            if (currentRebuildRequest == null) {
                currentRebuildRequest = window.setTimeout(function() {
                    rebuildTypeOptions();
                    currentRebuildRequest = null;
                }, 0);
            }
        }
    })();

    function addKnownType(module, type) {
        module = DbgObject.NormalizeModule(module);
        var fullType = module + "!" + type;
        if (!(fullType in knownTypes)) {
            knownTypes[fullType] = {
                module: module,
                type: type,
                aliases: []
            };
        }

        return knownTypes[fullType];
    }

    DbgObjectTree.AddTypeNotifier(function(module, type) {
        addKnownType(module, type);
        requestRebuildTypeOptions();
    });

    function addTypeAlias(module, type, alias) {
        if (alias in typeAliases) {
            throw new Error("A type with that alias already exists.");
        }

        var knownType = addKnownType(module, type);
        knownType.aliases.push(alias);
        typeAliases[alias] = knownType;
        requestRebuildTypeOptions();
    }

    function shortTypeName(key) {
        if (typeof(key) !== typeof("")) {
            key = typeKey(key);
        }
        var type = knownTypes[key];
        var name = null;
        if (type.aliases.length > 0) {
            name = type.aliases[0];
        } else {
            name = type.type;
            // Remove any namespaces, if present.
            var namespaces = name.split("::");
            if (namespaces.length > 1) {
                name = namespaces[namespaces.length - 1];
            }
        }
        return name;
    }

    function typeKey(type) {
        return DbgObject.NormalizeModule(type.module) + "!" + type.type;
    }

    function rebuildTypeOptions() {
        var typeOptions = [];
        for (var key in knownTypes) {
            var type = knownTypes[key];
            var name = shortTypeName(key);

            typeOptions.push({
                module: type.module,
                type: type.type,
                name: name
            });
        }

        typeOptions.sort(function (a, b) { return a.name.localeCompare(b.name); });

        typeOptionHTML = typeOptions.map(function (option) {
            return "<option data-module=\"" + option.module + "\" data-type=\"" + option.type + "\" value=\"" + typeKey(option) + "\">" + option.name + "</option>";
        }).join("\n");

        selectControls.forEach(function (select) { 
            var currentValue = select.value;
            select.innerHTML = typeOptionHTML;
            select.value = currentValue;
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
        } else if (obj instanceof Array) {
            return Promise.map(obj, descify);
        } else {
            return obj;
        }
    }

    function renderField(field, dbgObject, element) {
        return Promise.as(null)
        .then(function () {
            return Promise.as(field.html.call(dbgObject, element)).then(descify);
        })
        .then(null, handleFieldException)
        .then(function (html) {
            if (html !== undefined && html !== null) {
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
                element.appendChild(div);
                element.appendChild(document.createTextNode(" "));
            }
        });
    }

    function initialize(StoragePrefix, UserFields, DefaultType, UpdateUI) {

        var reinjectUserFields = (function() {
            var modifiedTypes = [];
            var addedFields = [];

            function inject() {
                UserFields.forEach(function (field) {
                    if (field.enabled) {
                        var renderThisField = function (dbgObject, element) {
                            return renderField(field, dbgObject, element);
                        };
                        DbgObjectTree.AddField(field.fullType.module, field.fullType.type, renderThisField);

                        addedFields.push({
                            module: field.fullType.module,
                            type: field.fullType.type,
                            code: renderThisField
                        });
                    }
                })
            }

            function uninject() {
                // Unwind the modified type stack.
                while (addedFields.length > 0) {
                    var addedField = addedFields.pop();
                    DbgObjectTree.RemoveField(addedField.module, addedField.type, addedField.code);
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
                window.sessionStorage.setItem(getSessionStorageKey(f), f.enabled);
                refreshTreeUIAfterFieldChange();
            })

            var label = document.createElement("label");
            label.setAttribute("for", "field-cb-" + f.id);
            label.innerHTML = shortTypeName(f.fullType) + "." + f.fullname;
            container.appendChild(label);

            var edit = document.createElement("button");
            edit.className = "edit small-button";
            edit.textContent = "Edit";
            edit.addEventListener("click", function() { 
                if (container.classList.toggle("editing")) {
                    edit.textContent = "Done";
                } else {
                    edit.textContent = "Edit";
                }
            });
            container.appendChild(edit);

            if (f.localstorageid) {
                var remove = document.createElement("button");
                remove.className = "remove small-button";
                remove.textContent = "Remove";
                remove.addEventListener("click", function() {
                    if (confirm("Are you sure you want to remove " + label.innerHTML + "?")) {
                        removeField(f, container);
                    }
                });
                container.appendChild(remove);
            }

            // Build the editor.
            var editor = document.createElement("div");
            editor.className = "editor";

            var typeInput = document.createElement("select");
            selectControls.push(typeInput);
            typeInput.className = "edit-type";
            typeInput.innerHTML = typeOptionHTML;
            typeInput.value = typeKey(f.fullType);
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
                .forEach(function(e) {
                    codeDescription.appendChild(e);
                    codeDescription.appendChild(document.createTextNode(" "));
                })

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
                    fullType: f.fullType,
                    isPrivate: f.isPrivate == true,
                    name: nameString,
                    shortName: shortNameString,
                    codeString: codeString
                });
            }
        }

        function codeStringToFunction(codeString) {
            return function(e) { 
                return this.InjectedFieldEvaluate("(function() { " + codeString + "\n/**/}).call(this, e)", e);
            };
        }

        function updateField(f, container) {
            var typeSelect = container.querySelector(".edit-type");
            var selectedTypeOption = typeSelect.options[typeSelect.selectedIndex];
            var nameString = container.querySelector(".edit-name").value;
            var shortNameString = container.querySelector(".edit-shortName").value;
            var codeString = container.querySelector(".edit-code").value;

            f.fullType = {
                module: selectedTypeOption.getAttribute("data-module"),
                type: selectedTypeOption.getAttribute("data-type")
            };
            container.querySelector(".edit-type").style.color = "";
            f.fullname = nameString;
            f.shortname = shortNameString;
            f.html = codeStringToFunction(codeString);
            f.htmlString = codeString;

            container.querySelector("label").innerHTML = shortTypeName(f.fullType) + "." + f.fullname;

            if (f.enabled) {
                refreshTreeUIAfterFieldChange();
            }

            saveField(f, container);
        }

        function getSessionStorageKey(f) {
            var key = StoragePrefix + ".UserFields.Enabled.";
            if (f.localstorageid) {
                key += f.localstorageid;
            } else {
                key += shortTypeName(f.fullType) + "." + f.fullname;
            }

            return key;
        }

        function createLocalStorageId() {
            return (new Date() - 0) + "-" + Math.round(Math.random() * 1000000);
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

        if (window.sessionStorage.getItem(StoragePrefix + ".UserFieldsCollapsed") == "true") {
            container.classList.add("collapsed");
        }

        var showHide = document.createElement("button");
        showHide.className = "show-hide small-button top-button";

        function updateShowHideButton() {
            if (container.classList.contains("collapsed")) {
                showHide.textContent = "Show";
                showHide.classList.add("light");
            } else {
                showHide.textContent = "Hide";
                showHide.classList.remove("light");
            }
        }
        updateShowHideButton();
        showHide.addEventListener("click", function() {
            var collapsed = container.classList.toggle("collapsed");
            window.sessionStorage.setItem(StoragePrefix + ".UserFieldsCollapsed", collapsed);
            updateShowHideButton();
        })

        var fields = document.createElement("div");
        fields.className = "fields";

        storage.all(function(saved) {
            for (var key in saved) {
                var savedField = saved[key];

                // Populate the UserFields array from localStorage.
                UserFields.push({
                    fullType: savedField.fullType,
                    enabled: false,
                    isPrivate: savedField.isPrivate,
                    fullname: savedField.name,
                    localstorageid: key,
                    shortname: savedField.shortName,
                    html: codeStringToFunction(savedField.codeString),
                    htmlString: savedField.codeString
                });
            }

            addKnownType(DefaultType.module, DefaultType.type);
            UserFields.forEach(function (f) { addKnownType(f.fullType.module, f.fullType.type); })
            rebuildTypeOptions();

            var uniqueId = 0;
            UserFields
                .sort(function(a, b) { 
                    return (shortTypeName(a.fullType) + "." + a.fullname).localeCompare(shortTypeName(b.fullType) + "." + b.fullname);
                })
                .forEach(function(f) {
                    f.enabled = (window.sessionStorage.getItem(getSessionStorageKey(f)) == "true");

                    f.id = ++uniqueId;
                    var ui = buildFieldUI(f);
                    fields.appendChild(ui);
                });

            container.appendChild(fields);

            // Add a button for adding a new field.
            var addNew = document.createElement("button");
            addNew.className = "add small-button top-button";
            addNew.textContent = "New";

            var addedFieldCounter = 0;
            addNew.addEventListener("click", function() {
                var newField = {
                    fullType: DefaultType,
                    enabled:true,
                    isPrivate:false,
                    id: ++uniqueId,
                    fullname: "Custom" + (++addedFieldCounter),
                    localstorageid: createLocalStorageId(),
                    shortname: "f" + addedFieldCounter,
                    html: function() { return "_"; }
                };
                UserFields.push(newField);

                var fieldUI = buildFieldUI(newField);
                fieldUI.className += " editing";
                fieldUI.querySelector(".edit").textContent = "Done";
                fields.appendChild(fieldUI);
                fieldUI.scrollIntoView();

                saveField(newField, fieldUI);
                window.sessionStorage.setItem(getSessionStorageKey(newField), newField.enabled);

                refreshTreeUIAfterFieldChange();
            });

            var browse = document.createElement("button");
            browse.className = "browse small-button top-button";
            browse.textContent = "See More..."

            container.appendChild(addNew);
            container.appendChild(browse);
            container.appendChild(showHide);

            browse.addEventListener("click", function() {
                var currentKeys = {}
                UserFields.forEach(function (field) { currentKeys[field.localstorageid] = true; });

                CatalogViewer.Instantiate(
                    StoragePrefix + ".UserFields", 
                    function(store, user) {
                        var results = [];
                        for (var key in store) {
                            if (!(key in currentKeys) && !store[key].isPrivate) {
                                results.push({key: key, value: store[key], user: user});
                            }
                        }
                        return results;
                    },
                    "Select fields to add:",
                    function(obj) { 
                        addKnownType(obj.value.fullType.module, obj.value.fullType.type);
                        requestRebuildTypeOptions();
                        return [obj.user, shortTypeName(obj.value.fullType), obj.value.name]
                    },
                    function(selected) {
                        selected.forEach(function (object) {
                            var field = object.value;
                            UserFields.push({
                                fullType: field.fullType,
                                id:++uniqueId,
                                enabled: true,
                                localstorageid: createLocalStorageId(),
                                isPrivate: true,
                                fullname: field.name,
                                shortname: field.shortName,
                                html: codeStringToFunction(field.codeString),
                                htmlString: field.codeString
                            });

                            var importedField = UserFields[UserFields.length - 1];
                            var fieldUI = buildFieldUI(importedField);
                            fields.appendChild(fieldUI);
                            saveField(importedField, fieldUI);
                            window.sessionStorage.setItem(getSessionStorageKey(importedField), true);
                        });
                        if (selected.length > 0) {
                            fields.childNodes[fields.childNodes.length - 1].scrollIntoView();
                        }

                        if (selected.length > 0) {
                            refreshTreeUIAfterFieldChange();
                        }
                    },
                    function(a) {
                        addKnownType(a.value.fullType.module, a.value.fullType.type);
                        requestRebuildTypeOptions();
                        return (a.user + "." + shortTypeName(a.value.fullType) + "." + a.value.name)
                    }
                );
            });

            refreshTreeUIAfterFieldChange();

            document.body.appendChild(container);
        });
    }

    return {
        Initialize: initialize,
        RegisterTypeAlias: addTypeAlias
    };
})();