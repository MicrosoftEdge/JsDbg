//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// actions.js
// Functionality for specifying user actions on DbgObjects.
Loader.OnLoad(function() {
    DbgObject.Actions = new DbgObject.TypeExtension();

    DbgObject.AddAction = function(typeNameOrFn, name, getActions) {
        return DbgObject.Actions.addExtension(typeNameOrFn, name, getActions);
    }

    DbgObject.RemoveAction = function(typeNameOrFn, name) {
        return DbgObject.Actions.removeExtension(typeNameOrFn, name);
    }

    DbgObject.prototype.actions = function(name) {
        var that = this;
        return this.baseTypes()
        .then(function (baseTypes) {
            baseTypes.unshift(that);
            var existingActions = {};
            var allActions = [];
            baseTypes.forEach(function (dbgObject) {
                var actions = DbgObject.Actions.getAllExtensions(dbgObject.type);
                actions.forEach(function (action) {
                    if (!(action.name in existingActions)) {
                        existingActions[action.name] = true;
                        allActions.push(action);
                    }
                })
            });

            return Promise.map(allActions, function (action) {
                if (name !== undefined && action.name != name) {
                    return null;
                }

                return Promise.resolve(action.extension(that))
                .then(
                    function (objectActions) {
                        if (objectActions == null || objectActions === undefined) {
                            return null;
                        } else if (!Array.isArray(objectActions)) {
                            objectActions = [objectActions];
                        }

                        return {
                            name: action.name,
                            actions: objectActions
                        };
                    },
                    function (error) { 
                        return null;
                    }
                );
            })
            .then(function (result) {
                result = result.filter(function (x) { return x != null; });
                // Sort the items so the ordering is consistent.
                result.sort(function (a, b) {
                    return a.name.localeCompare(b.name);
                })

                return result
                .map(function (x) { return x.actions; })
                .reduce(function (previous, current) { return previous.concat(current); }, []);
            });
        })
    }
})