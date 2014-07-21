"use strict";

var DbgObjectNavigator = (function() {

    function provideNavigation(dbgObject, element, listener) {
        element.classList.add("dbgobject-navigator");
        dumpFields(dbgObject, element, listener);
    }

    function dumpFields(dbgObject, element, listener) {
        return dbgObject.fields()
        .then(function (fields) {
            element.innerHTML = "";
            fields.forEach(function(field) {
                var fieldElement = document.createElement("div");
                fieldElement.className = "field";

                var typeElement = document.createElement("span");
                typeElement.className = "type";
                var typeDescription = field.value.typeDescription();
                if (typeDescription.length > 32) {
                    typeElement.setAttribute("title", typeDescription);
                    typeDescription = typeDescription.substr(0, 29) + "...";
                }
                typeElement.textContent = typeDescription;

                var nameElement  = document.createElement("span");
                nameElement.className = "name";
                nameElement.textContent = field.name;

                nameElement.addEventListener("click", function () {
                    dumpFields(dbgObject.f(field.name), element, listener);
                });

                fieldElement.appendChild(typeElement);
                fieldElement.appendChild(nameElement);
                
                element.appendChild(fieldElement);
            });
        })
    }

    return {
        ProvideNavigation: function (dbgObject, element, listener) {
            provideNavigation(dbgObject, element, listener);
        }
    };
})();