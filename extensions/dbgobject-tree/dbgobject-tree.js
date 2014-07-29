"use strict";

var DbgObjectTree = (function() {
    var registeredTypes = {};
    var registeredRoots = [];
    var registeredAddressInterpreters = [];
    var registeredTypeNotifiers = [];
    var knownTypes = {};
    var currentFields = {};

    function flatten(array, result) {
        if (result === undefined) {
            result = [];
        }
        for (var i = 0; i < array.length; ++i) {
            var item = array[i];
            if (item && item instanceof Array) {
                flatten(item, result);
            } else {
                result.push(item);
            }
        }
        return result;
    }

    function TreeNode(dbgObject, existingObjects) {
        this.dbgObject = dbgObject;
        this.childrenPromise = null;
        this.matchingRegistrationsPromise = null;
        this.basicDescriptionPromise = null;
        this.recordedErrors = [];

        this.existingObjects = existingObjects;
        this.isDuplicate = (dbgObject.ptr() in existingObjects);
        if (!this.isDuplicate) {
            existingObjects[dbgObject.ptr()] = true;
        }

        if (!(dbgObject.typeDescription() in knownTypes)) {
            knownTypes[dbgObject.typeDescription()] = true;
            registeredTypeNotifiers.forEach(function (notifier) {
                notifier(dbgObject.module, dbgObject.typeDescription());
            });
        }
    }

    TreeNode.prototype.getMatchingRegistrations = function() {
        if (this.matchingRegistrationsPromise == null) {
            var that = this;
            this.matchingRegistrationsPromise = this.dbgObject
            // Get all the base types.
            .baseTypes()

            // For each base type collect all the children.
            .then(function(baseTypes) {
                baseTypes.reverse();
                baseTypes.push(that.dbgObject);
                return Promise
                .map(
                    // Only consider objects that have a registered type handler.
                    baseTypes.filter(function (object) { return (object.module + "!" + object.typeDescription()) in registeredTypes; }),

                    // Get the children.
                    function (object) {
                        return Promise
                        // Filter out any registrations that don't match.
                        .filter(
                            registeredTypes[object.module + "!" + object.typeDescription()],
                            function (registration) {
                                return registration.isMatched(object);
                            }
                        )
                    }
                )
            })

            // Flatten the list of list of registrations.
            .then(flatten);
        }

        return this.matchingRegistrationsPromise;
    }

    TreeNode.prototype.getChildren = function() {
        if (this.isDuplicate) {
            return Promise.as([]);
        }

        if (this.childrenPromise == null) {
            var that = this;
            this.childrenPromise = this.getMatchingRegistrations(this.dbgObject)
            .then(function (registrations) {
                return Promise.map(registrations, function (registration) { 
                    if (registration.getChildren) {
                        return Promise.as(registration.getChildren(that.dbgObject))
                        .then(null, function (error) {
                            that.recordedErrors.push(error);
                            return [];
                        })
                    } else {
                        return [];
                    }
                });

            })
            .then(flatten)
            .then(function (children) {
                return children
                .filter(function (child) { return !child.isNull(); })
                .map(function (child) { return new TreeNode(child, that.existingObjects); });
            })
            .then(null, function (error) {
                that.recordedErrors.push(error);
                return [];
            });
        }
        return this.childrenPromise;
    }

    TreeNode.prototype.getBasicDescription = function() {
        var that = this;
        if (this.basicDescriptionPromise == null) {
            this.basicDescriptionPromise = this.getMatchingRegistrations()
            .then(function (registrations) {
                var registrationToUse = null;
                var basicDescriptionRegistrations = registrations.filter(function (reg) { return reg.getBasicDescription ? true : false; });
                var namedRegistrations = registrations.filter(function (reg) { return reg.name ? true : false; });

                var backupDescription = null;
                if (namedRegistrations.length > 0) {
                    backupDescription = namedRegistrations[namedRegistrations.length - 1].name;    
                } else {
                    backupDescription = that.dbgObject.htmlTypeDescription();
                    
                    var namespaces = backupDescription.split("::");
                    if (namespaces.length > 1) {
                        var namespace = namespaces.slice(0, namespaces.length - 1).join("::");
                        var type = namespaces[namespaces.length - 1];
                        backupDescription = "<span class=\"namespace\">" + namespace + "::</span>" + type;
                    }
                }

                if (basicDescriptionRegistrations.length > 0) {
                    return basicDescriptionRegistrations[basicDescriptionRegistrations.length - 1].getBasicDescription(that.dbgObject)
                    .then(null, function (error) {
                        that.recordedErrors.push(error);
                        return backupDescription;
                    });
                } else {
                    return backupDescription;
                }
            })
            .then(function (description) {
                return (that.isDuplicate ? "(DUPLICATE) " : "") + description;
            })
        }
        return this.basicDescriptionPromise;
    }

    TreeNode.prototype.createRepresentation = function() {
        var that = this;

        return this.getBasicDescription().then(function (basicDescription) {
            var result = document.createElement("div");
            if (that.isDuplicate) {
                result.style.color = "#aaa";
            }

            var description = document.createElement("div");
            description.innerHTML = basicDescription;
            result.appendChild(description);
            result.appendChild(document.createTextNode(" "));

            var pointer = document.createElement("div");
            pointer.innerHTML = that.dbgObject.ptr();
            result.appendChild(pointer);
            result.appendChild(document.createTextNode(" "));

            return that.dbgObject.baseTypes()
            .then(function (baseTypes) {
                baseTypes.reverse();
                baseTypes.push(that.dbgObject);

                // Collect any fields for each of the base types.
                var fields = baseTypes.map(function (baseType) {
                    var fullyQualifiedType = baseType.module + "!" + baseType.typeDescription();
                    if (fullyQualifiedType in currentFields) {
                        return currentFields[fullyQualifiedType];
                    } else {
                        return [];
                    }
                });

                fields = flatten(fields);

                // Serialize the rendering of the fields.
                var fieldPromise = Promise.as(null);
                fields.forEach(function (field) {
                    fieldPromise = fieldPromise.then(function () {
                        return field(that.dbgObject, result);
                    });
                })

                return fieldPromise.then(function () {
                    if (that.recordedErrors.length > 0) {
                        var errorContainer = document.createElement("div");
                        errorContainer.className = "error-container";

                        var errorDiv = document.createElement("div");
                        errorDiv.className = "error-icon";
                        errorDiv.textContent = "!";
                        errorContainer.appendChild(errorDiv);

                        var descriptions = document.createElement("div");
                        descriptions.className = "error-descriptions";
                        that.recordedErrors.forEach(function (error) {
                            var errorElement = document.createElement("div");
                            errorElement.textContent = JSON.stringify(error);
                            descriptions.appendChild(errorElement);
                        })
                        errorContainer.appendChild(descriptions);
                        result.appendChild(errorContainer);
                    }

                    return result;
                });
            });
        });
    }



    return {
        AddType: function(name, module, typename, discriminant, getChildren, getBasicDescription) {
            var fullTypename = DbgObject.NormalizeModule(module) + "!" + typename;
            if (!(fullTypename in registeredTypes)) {
                registeredTypes[fullTypename] = [];
            }
            registeredTypes[fullTypename].push({
                module: module,
                typename: typename,
                name: name ? name : null,
                isMatched: discriminant ? discriminant : function() { return true; },
                getChildren: getChildren ? getChildren : function() { return []; },
                getBasicDescription: typeof(getBasicDescription) == typeof("") ? function() { return getBasicDescription; } : getBasicDescription
            });
        },

        AddField: function (module, typename, code) {
            var fullTypename = DbgObject.NormalizeModule(module) + "!" + typename;
            if (!(fullTypename in currentFields)) {
                currentFields[fullTypename] = [];
            }

            currentFields[fullTypename].push(code);
        },

        RemoveField: function (module, typename, code) {
            var fullTypename = DbgObject.NormalizeModule(module) + "!" + typename;
            if (fullTypename in currentFields) {
                var index = currentFields[fullTypename].indexOf(code);
                if (index >= 0) {
                    currentFields[fullTypename].splice(index, 1);
                }
            }
        },

        AddRoot: function(name, getRoots) {
            registeredRoots.push({
                name: name,
                getRoots: getRoots
            });
        },

        AddAddressInterpreter: function(addressInterpreter) {
            registeredAddressInterpreters.push(addressInterpreter);
        },

        AddTypeNotifier: function (notifier) {
            registeredTypeNotifiers.push(notifier);
        },

        InterpretAddress: function (address) {
            return Promise.map(registeredAddressInterpreters, function(interpreter) {
                return Promise.as(interpreter(address))
                .then(
                    function (dbgObject) {
                        return new TreeNode(dbgObject, {});
                    },
                    function (error) {
                        return null;
                    }
                )
            })
            .then(function (results) {
                for (var i = 0; i < results.length; ++i) {
                    if (results[i] != null) {
                        return results[i];
                    }
                }

                throw new Error("Invalid root address.");
            })
        },

        RenderTreeNode: function(container, treeNode, fullyExpand, treeAlgorithm) {
            return Promise.as(treeNode)
            .then(function (treeNode) {
                return treeAlgorithm.BuildTree(container, treeNode, fullyExpand);
            })
        },

        GetRootTreeNodes: function() {
            return Promise
            .map(
                registeredRoots,
                function (rootRegistration) {
                    return rootRegistration.getRoots();
                }
            )
            .then(function (roots) {
                return flatten(roots)
                .map(function (root) {                     
                    return new TreeNode(root, {});
                })
            });
        }
    }
})();