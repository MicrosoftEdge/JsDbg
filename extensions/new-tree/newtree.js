var Tree = (function() {
    var registeredTypes = {};
    var registeredRoots = [];

    function flatten(array, result) {
        if (result === undefined) {
            result = [];
        }
        for (var i = 0; i < array.length; ++i) {
            var item = array[i];
            if (item && item.length !== undefined) {
                flatten(item, result);
            } else {
                result.push(item);
            }
        }
        return result;
    }

    function TreeNode(dbgObject, basicDescription) {
        this.dbgObject = dbgObject;
        this.basicDescription = basicDescription === undefined || basicDescription === null ? this.dbgObject.htmlTypeDescription() : basicDescription;
        this.childrenPromise = null;
        this.matchingRegistrationsPromise = null;
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
                    baseTypes.filter(function (object) { return object.typeDescription() in registeredTypes; }),

                    // Get the children.
                    function (object) {
                        return Promise
                        // Filter out any registrations that don't match.
                        .filter(
                            registeredTypes[object.typeDescription()],
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
        if (this.childrenPromise == null) {
            var that = this;
            this.childrenPromise = this.getMatchingRegistrations(this.dbgObject)
            .then(function (registrations) {
                return Promise.map(registrations, function (registration) { return registration.getChildren ? registration.getChildren(that.dbgObject) : []; })
            })
            .then(flatten)
            .then(function (children) {
                return children.map(function (child) { return new TreeNode(child); });
            });
        }
        return this.childrenPromise;
    }

    TreeNode.prototype.createRepresentation = function() {
        var that = this;
        return this.getMatchingRegistrations()
        .then(function (registrations) {
            return registrations.filter(function (registration) { return registration.getBasicDescription; })
        })
        .then(function (descriptionRegistrations) {
            if (descriptionRegistrations.length == 0) {
                return that.dbgObject.htmlTypeDescription();
            } else {
                return descriptionRegistrations[descriptionRegistrations.length - 1].getBasicDescription(that.dbgObject);
            }
        })
        .then(function (basicDescription) {
            var result = document.createElement("div");
            result.textContent = basicDescription + " " + that.dbgObject.ptr();
            return result;
        });
    }

    return {
        AddType: function(typename, discriminant, getChildren, getBasicDescription) {
            if (!(typename in registeredTypes)) {
                registeredTypes[typename] = [];
            }
            registeredTypes[typename].push({
                isMatched: discriminant ? discriminant : function() { return true; },
                getChildren: getChildren,
                getBasicDescription: typeof(getBasicDescription) == typeof("") ? function() { return getBasicDescription; } : getBasicDescription
            });
        },

        AddRoot: function(name, getRoots) {
            registeredRoots.push({
                name: name,
                getRoots: getRoots
            });
        },

        Render: function(element) {
            // Get all the roots.
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
                    var rootTreeNode = new TreeNode(root);
                    var innerElement = document.createElement("div");
                    element.appendChild(innerElement);
                    TallTree.BuildTree(innerElement, rootTreeNode, true);
                });
            })
            .then(null, function(err) {
                alert(err);
            })
        }
    }
})();