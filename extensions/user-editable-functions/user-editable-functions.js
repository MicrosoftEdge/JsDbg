//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// user-editable-functions.js
// Logic for creating functions that can be edited by the end user in the browser.
var UserEditableFunctions = undefined;
Loader.OnLoad(function() {
    var testSuite = undefined;
    if (typeof Tests !== "undefined") {
        testSuite = Tests.CreateTestSuite("UserEditableFunctions", "Tests for the user-editable-functions extension.");
    }

    function parseFunction(f) {
        var fString = f.toString();
        var argumentNames = fString
        .split("{", 2)[0] // Drop the function body
        .split("=>", 2)[0] // Drop the body for lambdas
        .match(/\(((.|\s)*)\)/)[1] // Grab the argument list
        .replace(/(\/\*.*?\*\/)|\s+/g, "") // Remove any /**/ comments or whitespace
        .split(","); // Split on ','

        var body = fString.match(/{((.|\s)*)}/);
        if (body) {
            body = body[1];
        } else {
            // Handle lambdas without function parentheses.
            body = fString.match(/=>((.|\s)*)/)[1];
        }

        // Strip any carriage returns.
        body = body.replace(/\r/g, "");

        // Cleanup any the whitespace at the start and end.
        body = body.replace(/^\s*\n/, "").replace(/\s*$/, "");

        // Replace any tabs with four spaces.
        body = body.replace(/\t/g, "    ");

        // Calculate the minimum indent and strip it from each of the lines.
        var lines = body.split("\n");
        var minimumIndent = lines.reduce(function (previousValue, currentValue) {
            if (currentValue.match(/[^\s]/) == null) {
                // Only whitespace on this line.
                return previousValue;
            } else {
                // Count the leading whitespace. 
                return Math.min(previousValue, currentValue.match(/^\s*/)[0].length);
            }
        }, body.length);
        body = lines.map(function (line) { return line.substr(minimumIndent); }).join("\n");

        return {
            argumentNames: argumentNames,
            body: body
        };
    }

    if (testSuite) {
        Tests.AddTest(testSuite, "parseFunction Whitespace Cleanup", function(assert) {
            var result = parseFunction(function (a) {
                return a;
            });

            assert.equals("return a;", result.body, "simple whitespace cleanup");

            result = parseFunction(function (a) {
                if (a) {
                    return a;
                }
            });

            assert.equals("if (a) {\n    return a;\n}", result.body, "multi-line whitespace cleanup");

            result = parseFunction(function (a) {
                // a comment
    
                return a;
            });

            assert.equals("// a comment\n\nreturn a;", result.body, "empty line whitespace cleanup");
        });

        Tests.AddTest(testSuite, "parseFunction Reconstruction", function(assert) {
            function testFunction(f, thisObject, args, desc) {
                var parsedFunction = parseFunction(f);
                var functionArguments = parsedFunction.argumentNames.concat([parsedFunction.body]);
                var reconstructedFunction = Function.apply(null, functionArguments);
                assert.equals(f.apply(thisObject, args), reconstructedFunction.apply(thisObject, args), desc);
            }

            testFunction(function() { return 3; }, null, [], "Reconstructing a function with no arguments.");
            testFunction(function (a, b, c) {
                return a * b + c;
            }, null, [2, 3, 4], "Reconstructing a function with arguments.");
            testFunction(function() { return this.result; }, { result: 1 }, [], "Reconstructing a function with a this object.");
            testFunction(function anInterestingName() { return 3; }, null, [], "Reconstructing a function with a name.");
        });
    }

    function EditableFunction(f) {
        this.f = f;
        this.listeners = [];
        var parsedFunction = parseFunction(f);
        this.argumentNames = parsedFunction.argumentNames;
        this.functionBody = parsedFunction.body;

        var that = this;
        this.caller = function() { return that.call(this, arguments); };
        this.caller.editableFunction = this;
    }

    EditableFunction.prototype.call = function(thisObject, args) {
        return this.f.apply(thisObject, args);
    }

    EditableFunction.prototype.edit = function(editingContainer) {
        if (editingContainer instanceof Node) {
            return this._createTextAreaEditor(editingContainer);
        } else {
            // Otherwise, use the modal editor.
            var backdrop = document.createElement("div");
            backdrop.classList.add("function-editor");
            backdrop.classList.add("backdrop");

            document.body.appendChild(backdrop);

            var editor = document.createElement("div");
            editor.classList.add("modal-editor");
            backdrop.appendChild(editor);

            var ensureUpdated = this._createTextAreaEditor(editor);

            var dismiss = function() {
                backdrop.parentNode.removeChild(backdrop);
            }

            backdrop.addEventListener("click", function (e) {
                if (e.target == backdrop) {
                    dismiss();
                    ensureUpdated();
                }
            });

            backdrop.addEventListener("keydown", function (e) {
                if (e.keyCode == 27) {
                    dismiss();
                    ensureUpdated();
                }
            });

            return ensureUpdated;
        }
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
            return true;
        } else if (e.keyCode == 13) {
            // When using enter, indent the same amount as the previous line.
            e.preventDefault();
            var currentLine = getLineAtCursor(input);
            var spaces = "";
            while (currentLine.prefix[spaces.length] == " ") {
                spaces += " ";
            }

            replaceTextAtCursor(input, 0, "\n" + spaces);
            return true;
        } else {
            return false;
        }
    }

    EditableFunction.prototype._createTextAreaEditor = function(editingContainer) {
        var codeRegion = document.createElement("div");
        codeRegion.classList.add("function-editor-code-region");
        editingContainer.appendChild(codeRegion);

        // Prologue for the function prototype.
        var preamble = document.createTextNode("function (" + this.argumentNames.join(", ") + ") {");
        codeRegion.appendChild(preamble);

        // Create a text area that will edit the function.
        var textArea = document.createElement("textarea");
        textArea.setAttribute("spellcheck", "false");
        codeRegion.appendChild(textArea);
        textArea.value = this.functionBody;
        textArea.addEventListener("keydown", function (e) {
            if (handleCodeEditorKeyDown(textArea, e)) {
                updateFiller();
            }
        });
        var that = this;

        // Create a filler that will auto-size the textarea.
        var filler = document.createElement("div");
        filler.classList.add("filler");
        codeRegion.appendChild(filler);
        var updateFiller = function () {
            var contents = textArea.value;
            if (contents[contents.length - 1] == "\n" || contents.length == 0) {
                contents += " ";
            }
            filler.textContent = contents;
        }
        textArea.addEventListener("input", updateFiller);
        updateFiller();

        // Epilogue for the closing curly bracket.
        codeRegion.appendChild(document.createTextNode("}"));

        var editedArgumentNames = this.argumentNames;
        return {
            commit: function() { that._update(editedArgumentNames, textArea.value); },
            updateArguments: function(names) {
                editedArgumentNames = names;
                preamble.textContent = "function (" + editedArgumentNames.join(", ") + ") {";
            }
        }
    }

    EditableFunction.prototype._update = function(newArgumentNames, body) {
        if (this.functionBody != body || newArgumentNames != this.argumentNames) {
            this.argumentNames = newArgumentNames;
            this.functionBody = body;
            var functionArguments = this.argumentNames.concat([this.functionBody]);
            this.f = Function.apply(null, functionArguments);
            var that = this;
            this.listeners.forEach(function (notify) {
                notify(that.caller);
            });
        }
    }

    EditableFunction.prototype.addListener = function(listener) {
        this.listeners.push(listener);
    }

    EditableFunction.prototype.removeListener = function(listener) {
        this.listeners = this.listeners.filter(function (l) { return l != listener; });
    }

    EditableFunction.prototype.serialize = function() {
        return {
            args: this.argumentNames,
            body: this.functionBody
        };
    }

    EditableFunction.deserialize = function(str) {
        var obj = typeof str == typeof "" ? JSON.parse(str) : str;
        var functionArguments = obj.args.concat([obj.body]);
        return new EditableFunction(Function.apply(null, functionArguments)).caller;
    }

    function create(f) {
        return (new EditableFunction(f)).caller;
    }

    function isEditable(f) {
        return f.editableFunction && f.editableFunction instanceof EditableFunction;
    }

    function edit(f, editingContainer) {
        if (!isEditable(f)) {
            throw new Error("You can only edit editable functions.");
        } else {
            return f.editableFunction.edit(editingContainer);
        }
    }

    function addListener(f, listener) {
        if (isEditable(f)) {
            f.editableFunction.addListener(listener);
        }
    }

    function removeListener(f, listener) {
        if (isEditable(f)) {
            f.editableFunction.removeListener(listener);
        }
    }

    function serialize(f) {
        if (!isEditable(f)) {
            throw new Error("You can only serialize editable functions.");
        } else {
            return f.editableFunction.serialize();
        }
    }

    function deserialize(str) {
        return EditableFunction.deserialize(str);
    }

    UserEditableFunctions = {
        Create: create,
        IsEditable: isEditable,
        Edit: edit,
        AddListener: addListener,
        RemoveListener: removeListener,
        Serialize: serialize,
        Deserialize: deserialize
    }

    if (testSuite) {
        Tests.AddTest(testSuite, "Simple Editing", function(assert) {
            var f = UserEditableFunctions.Create(function (a) { return a; });
            assert(UserEditableFunctions.IsEditable(f), "IsEditable");
            assert.equals(1, f(1), "Initial function definition.");

            var container = document.createElement("div");
            var editContext = UserEditableFunctions.Edit(f, container);
            var editor = container.querySelector("textarea");

            assert.equals(editor.value, "return a;", "Editor value population.");
            editor.value = "return a + 1;";
            editContext.commit();
            assert.equals(2, f(1), "Edited function definition.");
        })

        Tests.AddTest(testSuite, "Changing Argument Names", function (assert) {
            var f = UserEditableFunctions.Create(function (a, b) { return a; });
            assert.equals(1, f(1, 2, 3), "Initial function definition.");

            var container = document.createElement("div");
            var editContext = UserEditableFunctions.Edit(f, container);
            var editor = container.querySelector("textarea");

            editContext.updateArguments(["b", "a"]);
            editContext.commit();
            assert.equals(2, f(1, 2, 3), "Updated arguments.");

            container = document.createElement("div");
            editContext = UserEditableFunctions.Edit(f, container);
            editor = container.querySelector("textarea");

            editor.value = "return c;";
            editContext.updateArguments(["a", "b", "c"]);
            editContext.commit();
            assert.equals(3, f(1, 2, 3), "Updated arguments and body.");
        })

        Tests.AddTest(testSuite, "Function Serialization/Deserialization", function (assert) {
            var f = UserEditableFunctions.Create(function (a, b) { return a + b; });
            assert.equals(3, f(1, 2), "Initial function definition.");

            var serialized = JSON.stringify(UserEditableFunctions.Serialize(f));
            assert.equals(typeof "", typeof serialized, "Serialized type should be a string.");

            var g = UserEditableFunctions.Deserialize(JSON.parse(serialized));
            assert.equals(3, g(1, 2), "Deserialized function definition.");
            assert(UserEditableFunctions.IsEditable(g), "Deserialized function should be editable.");
        })
    }
});