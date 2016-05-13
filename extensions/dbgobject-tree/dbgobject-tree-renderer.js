"use strict";

var DbgObjectTreeRenderer = (function() {
    function Renderer() {
        this.names = new DbgObject.TypeExtension();
        this.fields = new DbgObject.TypeExtension();
        this.nextFieldId = 1;
    }

    Renderer.prototype.addNameRenderer = function(module, typename, renderer) {
        this.names.addExtension(module, typename, "", renderer);
    }

    Renderer.prototype.addField = function(module, typename, fieldRenderer) {
        var name = (this.nextFieldId++).toString();
        this.fields.addExtension(module, typename, name, fieldRenderer);
        return name;
    }

    Renderer.prototype.removeField = function(module, typename, id) {
        this.fields.removeExtension(module, typename, id);
    }

    Renderer.prototype.createRenderRoot = function(dbgObjectTreeNode) {
        var renderer = this;

        return DbgObjectTreeNew.Map(dbgObjectTreeNode, function(node) {
            return Object.create(node, {
                createRepresentation: {
                    value: function() { return createRepresentation(this, renderer);  }
                }
            });
        });
    }

    Renderer.prototype.getName = function(node) {
        if (!(node.getObject() instanceof DbgObject)) {
            return Promise.as(node.getObject().toString());
        }

        return this.names.getExtensionIncludingBaseTypes(node.getObject(), "")
        .then(function (result) {
            if (result == null) {
                return node.getObject().htmlTypeDescription();
            } else {
                return result.extension(node.getObject());
            }
        })
    }

    function createRepresentation(node, renderer) {
        var result = document.createElement("div");
        return renderer.getName(node)
        .then(function (name) {
            if (node.isDuplicate()) {
                result.style.color = "#aaa";
            }

            var description = document.createElement("div");
            description.innerHTML = node.getObject().htmlTypeDescription(); // XXX/psalas: needs to support non-dbgobjects
            result.appendChild(description);

            if (!(node.getObject() instanceof DbgObject)) {
                // For non-DbgObjects, return a representation which is just the basic description.
                return;
            }

            var dbgObject = node.getObject();

            result.appendChild(document.createTextNode(" "));

            var pointer = DbgObjectInspector.Inspect(dbgObject, dbgObject.ptr());
            result.appendChild(pointer);
            result.appendChild(document.createTextNode(" "));

            return renderer.fields.getAllExtensionsIncludingBaseTypes(dbgObject)
            .then(function (fieldsToApply) {
                fieldsToApply.sort(function (a, b) {
                    return parseInt(a.name) - parseInt(b.name);
                });
                fieldsToApply = fieldsToApply.map(function (x) { return x.extension; });

                // Serialize the rendering of the fields.
                var fieldPromise = Promise.as(null);
                fieldsToApply.forEach(function (field) {
                    fieldPromise = fieldPromise.then(function () {
                        return field(dbgObject, result);
                    })
                    .then(null, function () { });
                });

                return fieldPromise;
            })
        })
        .then(function () {
            var errors = node.getChildrenErrors();
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

    return Renderer;
})();