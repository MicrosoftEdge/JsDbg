//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

(function() {
    function Renderer() {
        this.names = new DbgObject.TypeExtension();
    }

    Renderer.prototype.addNameRenderer = function(type, renderer) {
        this.names.addExtension(type, "", renderer);
    }

    Renderer.prototype.getName = function(object, parentObject) {
        if (!(object instanceof DbgObject)) {
            if (object == null) {
                return Promise.resolve("(null)");
            } else {
                return Promise.resolve(object.toString());
            }
        }

        return this.names.getExtensionIncludingBaseTypes(object, "")
        .then(function (result) {
            if (result != null) {
                return result.extension(object, parentObject);
            } else {
                return null;
            }
        })
        .catch(function() {
             return null;
        })
        .then(function(typeName) {
            if (typeName == null) {
                typeName = object.type.htmlName();

                var templateIndex = typeName.indexOf("&lt;");
                var beforeTemplates = typeName.substr(0, templateIndex < 0 ? typeName.length : templateIndex);
                var namespaces = beforeTemplates.split("::");
                if (namespaces.length > 1) {
                    var namespace = namespaces.slice(0, namespaces.length - 1).join("::");
                    var type = namespaces[namespaces.length - 1];
                    typeName = "<span class=\"namespace\">" + namespace + "::</span>" + type + typeName.substr(beforeTemplates.length);
                }
            }

            return typeName;
        })
    }

    Renderer.prototype.createRepresentation = function(object, parentObject, errors, includeInspector) {
        var result = document.createElement("div");
        return this.getName(object, parentObject)
        .then(function (name) {
            var description = document.createElement("div");
            description.innerHTML = name;
            result.appendChild(description);

            if (!(object instanceof DbgObject)) {
                // For non-DbgObjects, return a representation which is just the basic description.
                if (object.customStyles) {
                    result.customStyles = object.customStyles();
                }
                return;
            }

            result.appendChild(document.createTextNode(" "));

            var pointer = null;
            if (includeInspector) {
                pointer = DbgObjectInspector.Inspect(object, object.ptr());
            } else {
                pointer = document.createTextNode(object.ptr());
            }
            result.appendChild(pointer);
            result.appendChild(document.createTextNode(" "));
        })
        .then(function () {
            if (errors.length > 0) {
                var errorContainer = document.createElement("div");
                errorContainer.className = "error-container";

                var errorDiv = document.createElement("div");
                errorDiv.className = "error-icon";
                errorDiv.textContent = "!";
                errorContainer.appendChild(errorDiv);

                var descriptions = document.createElement("div");
                descriptions.className = "error-descriptions";
                errors.forEach(function (error) {
                    var errorElement = document.createElement("div");
                    if (error instanceof Error) {
                        errorElement.textContent = error.toString();
                    } else {
                        errorElement.textContent = JSON.stringify(error);
                    }
                    descriptions.appendChild(errorElement);
                })
                errorContainer.appendChild(descriptions);
                result.appendChild(errorContainer);
            }
        })
        .then(
            function () { return result; },
            function () { return result; }
        );
    }

    DbgObjectTree.DbgObjectRenderer = Renderer;
})();