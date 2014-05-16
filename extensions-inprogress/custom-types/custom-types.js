//
// custom-types.js
// Peter Salas
//

(function() {
    
    //
    // Catalog schema:
    // {
    //   descriptions: [ 
    //      {
    //          name: (string), 
    //          module: (string),
    //          type: (string),
    //          code: (string)
    //      }
    //  ]
    // }
    //

    function init() {
        // Get the existing type descriptions.
        Catalog.Load("CustomTypes").all(function (catalogValues) {
            var descriptions = [];
            if ("descriptions" in catalogValues) {
                // Validate the schema.
                var isValid = true;
                if (typeof(catalogValues.descriptions) == typeof([])) {
                    catalogValues.descriptions.forEach(function (description) {
                        if (typeof(description.name) != typeof("") ||
                            typeof(description.module) != typeof("") ||
                            typeof(description.type) != typeof("") ||
                            typeof(description.code) != typeof("")
                        ) { 
                            isValid = false;
                        }
                    });
                } else {
                    isValid = false;
                }

                if (isValid) {
                    descriptions = catalogValues.descriptions;
                }
            }

            descriptions.push({
                name: "Math::SRectangle",
                module: "mshtml",
                type: "Math::SRectangle",
                code: "var fieldNames = [\"x\", \"y\", \"width\", \"height\"];\n\
return Promise.join(fieldNames.map(function(side) { return object.f(side).desc(); }))\n\
.then(function (values) {\n\
    values = values.map(function (v, i) { return \"<span style=\\\"font-size:0.8em\\\">\" + fieldNames[i] + \":</span>\" + v; });\n\
    return \"(\" + values.join(\", \") + \")\";\n\
});"
            });


            if (window.location.pathname.toLowerCase().indexOf("/customtypes/") == 0) {
                setupEditor(descriptions);
            } else {
                injectDescriptions(descriptions);
            }
        });
    }

    function injectDescriptions(descriptions) {
        descriptions.forEach(function (description) {
            var implementation = function(value) {
                return eval("(function(object) { " + description.code + "\n/**/})(value)");
            };
            DbgObject.AddTypeDescription(description.module, description.type, function (value) {
                return implementation(value);
            });
        });
    }


    function setupEditor(descriptions) {
        descriptions.forEach(addDescription);
    }

    function createElement(tag, innerHTML, attributes, events) {
        var e = document.createElement(tag);
        if (innerHTML) {
            e.innerHTML = innerHTML;
        }

        if (attributes) {
            for (var key in attributes) {
                if (attributes[key] !== undefined) {
                    e.setAttribute(key, attributes[key]);
                }
            }
        }

        if (events) {
            for (var key in events) {
                e.addEventListener(key, events[key]);
            }
        }
        return e;
    }

    function addDescription(description) {
        var container = document.querySelector("#loadedDescriptions");
        var outerDiv = createElement("div", null, {"class": "description"});

        outerDiv.appendChild(createElement("div", description.name, {"class":"name"}));
        outerDiv.appendChild(createElement("div", description.module, {"class":"module"}));
        outerDiv.appendChild(createElement("div", description.type, {"class":"type"}));
        outerDiv.appendChild(createElement("code", description.code, {"class":"code"}));

        container.appendChild(outerDiv);
    }

    document.addEventListener("DOMContentLoaded", init); 


    DbgObject.AddTypeDescription("mshtml", "CRect", function (value) {
        return value.fields()
        .then(function (fields) {
            return Promise.map(fields, function (field) { return field.value.desc(); })
            .then(function(descriptions) {
                return "{" + fields.map(function (field, i) {
                    return field.name + ": " + descriptions[i];
                }).join(", ") + "}";
            });
        });
    });
})();