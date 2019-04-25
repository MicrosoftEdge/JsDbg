//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var Help = (function() {
    var registrations = [];

    function createElement(document, tag, innerHTML, attributes, events) {
        var e = document.createElement(tag);
        if (innerHTML) {
            e.innerHTML = innerHTML;
        }

        if (attributes) {
            for (var key in attributes) {
                e.setAttribute(key, attributes[key]);
            }
        }

        if (events) {
            for (var key in events) {
                e.addEventListener(key, events[key]);
            }
        }
        return e;
    }

    return {
        _help : {
            name: "Help",
            description: "Provides HTML documentation for objects with <code>_help</code> annotations.",
            notes: "<p>To document a field or method named \"MyField\" on an object, include a field named \"_help_MyField\" on the same object.</p>"
        },

        _help_Register : {
            arguments: [{name: "object", description: "Any object that provides _help_ annotations."}],
            description: "Allows a type's documentation to be enumerated by List()."
        },
        Register: function(object) {
            registrations.push(object);
        },

        _help_List : {
            description: "Returns a list of all registered objects with documentation.",
            returns: "A list of objects."
        },
        List: function() {
            var result = registrations.slice();
            result.sort(function(a, b) {
                if (a._help && b._help) {
                    if (a._help.name && b._help.name) {
                        return a._help.name.localeCompare(b._help.name);
                    } else if (a._help.name) {
                        return -1;
                    } else {
                        return 1;
                    }
                } else if (a._help) {
                    return -1;
                } else {
                    return 1;
                }
            });
            return result;
        },

        _help_Summarize: {
            arguments: [{name: "object", description: "An object from which to retrieve documentation."}],
            description: "Briefly summarizes documentation for a given type, namespace, or object that provides _help_ annotations.",
            returns: "A DOM element containing the formatted summary."
        },
        Summarize: function(object) {
            var summary = createElement(document, "div", null, {"class": "help-summary"});

            if (object._help) {
                if (object._help.name) {
                    summary.appendChild(createElement(document, "div", object._help.name, {"class": "name"}));
                }
                if (object._help.description) {
                    summary.appendChild(createElement(document, "div", object._help.description, {"class": "description"}));
                }
            }

            return summary;
        },

        _help_Link: {
            description: "Creates a link to open the help for a given object in a new window.",
            arguments: [
                {name: "object", description: "An object whose help should be linked."}
            ]
        },
        Link: function(object) {
            var objectName = object._help ? object._help.name : undefined;
            var link = createElement(document, "a", objectName, {"class": "help-link"});
            link.setAttribute("href", "#" + objectName + "-documentation");
            link.addEventListener("click", function(e) {
                e.preventDefault();
                Help.View(object);
            });
            return link;
        },

        _help_Describe : {
            arguments: [
                {name: "object", description: "An object from which to retrieve documentation."},
                {name: "doc", description: "The HTML document that will contain element."}
            ],
            description: "Discovers documentation for a given type, namespace, or object that provides _help_ annotations.",
            returns: "A DOM element containing the formatted documentation."
        },
        Describe: function(object, doc) {
            if (doc) {
                var document = doc;
            } else {
                var document = window.document;                
            }

            function collectFields(object) {
                var fields = [];
                for (var property in object) {
                    var helpKey = "_help_" + property;
                    if (helpKey in object) {
                        // The property is documented.
                        fields.push({name: property, help: object[helpKey], value: object[property]});
                    }
                }
                fields.sort(function(a, b) { return a.name.localeCompare(b.name); });
                return fields;    
            }

            function describeField(field) {
                var fieldDiv = createElement(document, "div", null, {"class": "field"}, {"click": function(e) {
                    if (fieldDiv.className.indexOf("expanded") == -1) {
                        fieldDiv.className = "field expanded";
                    } else {
                        fieldDiv.className = "field";
                    }
                }});
                var fieldIsFunction = typeof(field.value) == typeof(function() {});

                if (fieldIsFunction) {
                    var argStrings = field.help.arguments ? field.help.arguments.map(function(arg) {
                        return arg.name ? arg.name : "_";
                    }) : [];
                    var titleString = field.name + "(" + argStrings.join(", ") + ")";

                    fieldDiv.appendChild(createElement(document, "div", titleString, {"class": "name"}));
                } else {
                    fieldDiv.appendChild(createElement(document, "div", field.name, {"class": "name"}));
                }

                if (field.help.description) {
                    fieldDiv.appendChild(createElement(document, "div", field.help.description, {"class": "description"}));
                }

                if (field.help.arguments && field.help.arguments.length > 0) {
                    var argsUL = createElement(document, "ul", null, {"class": "arguments"});
                    field.help.arguments.forEach(function(arg) {
                        var argLI = createElement(document, "li");
                        argLI.appendChild(createElement(document, "div", arg.name, {"class": "name"}));
                        if (arg.type) {
                            argLI.appendChild(createElement(document, "div", arg.type, {"class": "type"}));
                        }
                        if (arg.description) {
                            argLI.appendChild(createElement(document, "div", arg.description, {"class": "description"}));
                        }
                        argsUL.appendChild(argLI);
                    });
                    fieldDiv.appendChild(argsUL);
                }

                if (field.help.returns) {
                    fieldDiv.appendChild(createElement(document, "div", field.help.returns, {"class": "returns"}));
                }

                if (field.help.notes) {
                    var notes;
                    if (typeof(field.help.notes) == typeof("")) {
                        notes = field.help.notes;
                    } else if (typeof(field.help.notes) == typeof(function() {})) {
                        notes = field.help.notes();
                    } else {
                        notes = field.help.notes.toString();
                    }
                    fieldDiv.appendChild(createElement(document, "div", notes, {"class": "notes"}));
                }

                return fieldDiv;
            }

            var isType = typeof(object) == "function";
            var helpDiv = createElement(document, "div", null, {"class": "help-div"});

            if (object._help) {
                if (object._help.name) {
                    helpDiv.appendChild(createElement(document, "h3", object._help.name, {"class": "name"}));
                }
                if (object._help.description) {
                    helpDiv.appendChild(createElement(document, "div", object._help.description, {"class": "description"}));
                }

                if (object._help.notes) {
                    var notes;
                    if (typeof(object._help.notes) == typeof("")) {
                        notes = object._help.notes;
                    } else if (typeof(object._help.notes) == typeof(function() {})) {
                        notes = object._help.notes();
                    } else {
                        notes = object._help.notes.toString();
                    }
                    helpDiv.appendChild(createElement(document, "div", notes, {"class": "notes"}));   
                }

                if (isType && object._help._help_constructor) {
                    helpDiv.appendChild(describeField({name: "new " + object._help.name, help:object._help._help_constructor, value:object}));
                }
            }

            if (isType && object.prototype) {
                var prototypeFields = collectFields(object.prototype);
                if (prototypeFields.length > 0) {
                    helpDiv.appendChild(createElement(document, "h4", "Prototype Fields/Methods"));
                    prototypeFields.map(describeField).forEach(function(field) {
                        helpDiv.appendChild(field);
                    });
                }
            }

            var fields = collectFields(object);
            if (fields.length > 0) {
                helpDiv.appendChild(createElement(document, "h4", "Fields/Methods"));

                fields
                    .map(function(field) { 
                        if (object._help && object._help.name) {
                            field.name = object._help.name + "." + field.name;
                        }
                        return field;
                    })
                    .map(describeField)
                    .forEach(function(field) {
                        helpDiv.appendChild(field);
                    });
            }

            return helpDiv;
        },

        _help_View: {
            description: "Opens a window displaying the given object's documentation.",
            arguments: [{name:"object", type:"object", description:"The object whose documentation should be opened."}]
        },

        View: function(object) {
            var objectName = object._help ? object._help.name : undefined;
            var childWindow = null;
            function receiveMessage(e) {
                if (e.source == childWindow && e.data == "READYFORHELP") {
                    // The child window is ready to get the data, append the child.
                    window.removeEventListener("message", receiveMessage);
                    childWindow.document.body.appendChild(Help.Describe(object, childWindow.document));
                    childWindow.document.title = objectName;
                    childWindow.focus();
                }
            }
            window.addEventListener("message", receiveMessage);
            childWindow = window.open("/help/helpviewer.html", "helpwindow-" + objectName, "width=500,height=500,resizable=yes,scrollbars=yes");
        }
    }
})();

Help.Register(Help);