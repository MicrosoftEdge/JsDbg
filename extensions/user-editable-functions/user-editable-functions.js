"use strict";

// user-editable-functions.js
// Logic for creating functions that can be edited by the end user in the browser.
var UserEditableFunctions = undefined;
JsDbg.OnLoad(function() {
    var testSuite = undefined;
    if (typeof Tests !== undefined) {
        testSuite = Tests.CreateTestSuite("UserEditableFunctions", "Tests for the user-editable-functions extension.");
    }

    function parseFunction(f) {
        var fString = f.toString();
        var argumentNames = fString.split("{", 2)[0].match(/\((.*)\)/)[1].split(",");
        var body = fString.match(/{((.|\s)*)}/)[1];

        // Strip any carriage returns.
        body = body.replace(/\r/g, "");

        // Cleanup any the whitespace at the start and end.
        body = body.replace(/^\s*\n/, "").replace(/\n\s*$/, "");

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

    function EditableFunction(name, f) {
        this.name = name;
        this.f = f;
        var parsedFunction = parseFunction(f);
        this.argumentNames = parsedFunction.argumentNames;
        this.functionBody = parsedFunction.body;
    }

    EditableFunction.prototype.call = function(thisObject, args) {
        this.f.apply(thisObject, args);
    }

    EditableFunction.prototype.edit = function(editingContainer) {
        // Create a text area that will edit the function.
        var textArea = document.createElement("textarea");
        editingContainer.appendChild(textArea);
        textArea.value = this.functionBody;
    }

    function create(name, f) {
        var ef = new EditableFunction(name, f);
        var result = function() {
            ef.call(this, arguments);
        }
        result.editableFunction = ef;
        return result;
    }

    function isEditable(f) {
        return f.editableFunction && f.editableFunction instanceof EditableFunction;
    }

    function edit(f, editingContainer) {
        if (!isEditable(f)) {
            throw new Error("You can only edit editable functions.");
        } else {
            f.editableFunction.edit(editingContainer);
        }
    }

    UserEditableFunctions = {
        Create: create,
        IsEditable: isEditable,
        Edit: edit
    }
});