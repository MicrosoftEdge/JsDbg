"use strict";

var Help = (function() {
    var registrations = [];


    function createElement(tag, innerHTML, attributes, events) {
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
            description: "The Help namespace allows namespaces, types, and objects to document themselves.",
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
            return registrations.slice();
        },

        _help_Summarize : {
            arguments: [{name: "object", description: "An object from which to retrieve documentation."}],
            description: "Briefly summarizes documentation for a given type, namespace, or object that provides _help_ annotations.",
            returns: "A DOM element containing the formatted summary."
        },
        Summarize: function(object) {
            var summary = createElement("div", null, {"class": "help-summary"});

            if (object._help) {
                if (object._help.name) {
                    summary.appendChild(createElement("div", object._help.name, {"class": "name"}));
                }
                if (object._help.description) {
                    summary.appendChild(createElement("div", object._help.description, {"class": "description"}));
                }
            }

            return summary;
        },

        _help_Describe : {
            arguments: [{name: "object", description: "An object from which to retrieve documentation."}],
            description: "Discovers documentation for a given type, namespace, or object that provides _help_ annotations.",
            returns: "A DOM element containing the formatted documentation."
        },
        Describe: function(object) {
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
                var fieldDiv = createElement("div", null, {"class": "field"});
                var fieldIsFunction = typeof(field.value) == typeof(function() {});

                if (fieldIsFunction) {
                    var argStrings = field.help.arguments ? field.help.arguments.map(function(arg) {
                        return arg.name ? arg.name : "_";
                    }) : [];
                    var titleString = field.name + "(" + argStrings.join(", ") + ")";

                    fieldDiv.appendChild(createElement("div", titleString, {"class": "name"}));
                } else {
                    fieldDiv.appendChild(createElement("div", field.name, {"class": "name"}));
                }

                if (field.help.description) {
                    fieldDiv.appendChild(createElement("div", field.help.description, {"class": "description"}));
                }

                if (field.help.arguments && field.help.arguments.length > 0) {
                    var argsUL = createElement("ul", null, {"class": "arguments"});
                    field.help.arguments.forEach(function(arg) {
                        var argLI = createElement("li");
                        argLI.appendChild(createElement("div", arg.name, {"class": "name"}));
                        if (arg.type) {
                            argLI.appendChild(createElement("div", arg.type, {"class": "type"}));
                        }
                        if (arg.description) {
                            argLI.appendChild(createElement("div", arg.description, {"class": "description"}));
                        }
                        argsUL.appendChild(argLI);
                    });
                    fieldDiv.appendChild(argsUL);
                }

                if (field.help.returns) {
                    fieldDiv.appendChild(createElement("div", field.help.returns, {"class": "returns"}));
                }

                if (field.help.notes) {
                    fieldDiv.appendChild(createElement("div", field.help.notes, {"class": "notes"}));
                }

                return fieldDiv;
            }

            var isType = typeof(object) == typeof(function() { });
            var helpDiv = createElement("div", null, {"class": "help-div"});

            if (object._help) {
                if (object._help.name) {
                    helpDiv.appendChild(createElement("h3", object._help.name, {"class": "name"}));
                }
                if (object._help.description) {
                    helpDiv.appendChild(createElement("div", object._help.description, {"class": "description"}));
                }

                if (object._help.notes) {
                    helpDiv.appendChild(createElement("div", object._help.notes, {"class": "notes"}));   
                }
            }

            var fields = collectFields(object);
            if (fields.length > 0) {
                helpDiv.appendChild(createElement("h4", "Fields/Methods"));

                fields.map(describeField).forEach(function(field) {
                    helpDiv.appendChild(field);
                });
            }

            if (isType && object.prototype) {
                var prototypeFields = collectFields(object.prototype);
                helpDiv.appendChild(createElement("h4", "Prototype Fields/Methods"));
                prototypeFields.map(describeField).forEach(function(field) {
                    helpDiv.appendChild(field);
                });
            }

            return helpDiv;
        }
    }
})();

// The Help type provides its own documentation.
Help.Register(Help);