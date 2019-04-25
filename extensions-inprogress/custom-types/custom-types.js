//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

//
// custom-types.js
// Peter Salas
//

Loader.OnLoad(function() {
    
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
                if (Array.isArray(catalogValues.descriptions)) {
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
                module: MSHTML.Module,
                type: "Math::SRectangle",
                code: "var fieldNames = [\"x\", \"y\", \"width\", \"height\"];\n\
return Promise.all(fieldNames.map(function(side) { return object.f(side).desc(); }))\n\
.then(function (values) {\n\
    values = values.map(function (v, i) { return \"<span style=\\\"font-size:0.8em\\\">\" + fieldNames[i] + \":</span>\" + v; });\n\
    return \"(\" + values.join(\", \") + \")\";\n\
});"
            });

            descriptions.push({
                name: "CAttrValue",
                module: MSHTML.Module,
                type: "CAttrValue",
                fn: function(object) {
                    return object.f("_wFlags.fAA_Extra_HasDispId").val()
                    .then(function (hasDispId) {
                        if (hasDispId) {
                            return object.f("_dispid").uval().then(function (dispid) { return "DISPID(0x" + dispid.toString(16) + ")"; });
                        } else {
                            return object.f("_pPropertyDesc.pstrName").string();
                        }
                    })
                    .then(function (name) {
                        return object.f("_wFlags._aaVTType").as("VARENUM").constant()
                        .then(function (variantType) {
                            if (variantType == "VT_LPWSTR") {
                                return object.f("uVal._lpstrVal").string();
                            } else if (variantType == "VT_BSTR") {
                                return object.f("uVal._bstrVal").string();
                            } else {
                                return object.f("uVal._ulVal").uval();
                            }
                        }, function (err) {
                            return object.f("uVal._ulVal").uval();
                        })
                        .then(function (value) {
                             return name + "=\"" + value + "\"";
                        }, function (err) { return err; })
                    });
                }
            })


            if (window.location.pathname.toLowerCase().indexOf("/customtypes/") == 0) {
                setupEditor(descriptions);
            } else {
                injectDescriptions(descriptions);
            }
        });
    }

    function injectDescriptions(descriptions) {
        descriptions.forEach(function (description) {
            if (description.code) {
                var implementation = function(value) {
                    return eval("(function(object) { " + description.code + "\n/**/})(value)");
                };
            } else {
                var implementation = description.fn;
            }
            DbgObject.AddTypeDescription(description.module, description.type, "Custom", true, function (value) {
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

    Loader.OnPageReady(init);


    DbgObject.AddTypeDescription(MSHTML.Module, "CRect", "Rect", true, function (value) {
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
});