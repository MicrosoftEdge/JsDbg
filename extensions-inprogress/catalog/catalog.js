
var Catalog = (function() {
    var isOperationPending = false;
    var pendingOperations = [];
    function waitForOperation(retry) {
        if (isOperationPending) {
            pendingOperations.push(retry);
            return false;
        } else {
            isOperationPending = true;
            return true;
        }
    }

    function completedOperation() {
        isOperationPending = false;
        if (pendingOperations.length > 0) {
            var operation = pendingOperations[0];
            pendingOperations = pendingOperations.slice(1);
            operation();
        }
    }

    function Store(namespace, user) {
        this.namespace = "_CATALOG-" + namespace;
        this.user = user;
    };

    Store.prototype.all = function(callback) {
        var that = this;

        if (waitForOperation(function() { that.all(callback); })) {
            JsDbg.GetPersistentData(this.user, function(result) {
                if (that.namespace in result) {
                    callback(result[that.namespace]);
                } else {
                    callback({});
                }
                completedOperation();
            });
        }
    };

    Store.prototype.set = function(key, value, callback) {
        if (this.user) {
            throw "You cannot set data on a different user.";
        }

        if (!callback) {
            callback = function() { };
        }

        // Read the current object.
        var that = this;
        if (waitForOperation(function() { that.set(key, value, callback); })) {
            JsDbg.GetPersistentData(/*user*/null, function(result) {
                if (!(that.namespace in result)) {
                    result[that.namespace] = {};
                } else if (typeof(result[that.namespace]) != typeof({})) {
                    callback({error: "The namespace collides with an existing value."});
                    completedOperation();
                    return;
                }

                // Update it with the new value.
                result[that.namespace][key] = value;

                // And save it.
                JsDbg.SetPersistentData(result, function(result) {
                    callback(result);
                    completedOperation();
                });
            });
        }
    };

    Store.prototype.setMultiple = function(keysAndValues, callback) {
        if (this.user) {
            throw "You cannot set data on a different user.";
        }

        if (!callback) {
            callback = function() { };
        }

        // Read the current object.
        var that = this;
        if (waitForOperation(function() { that.setMultiple(keysAndValues, callback); })) {
            JsDbg.GetPersistentData(/*user*/null, function(result) {
                if (!(that.namespace in result)) {
                    result[that.namespace] = {};
                } else if (typeof(result[that.namespace]) != typeof({})) {
                    callback({error: "The namespace collides with an existing value."});
                    completedOperation();
                    return;
                }

                // Update it with the new values.
                for (var key in keysAndValues) {
                    result[that.namespace][key] = keysAndValues[key];
                }

                // And save it.
                JsDbg.SetPersistentData(result, function(result) {
                    callback(result);
                    completedOperation();
                });
            });
        }
    }

    Store.prototype.delete = function(key, callback) {
        if (this.user) {
            throw "You cannot delete keys from a different user.";
        }

        if (!callback) {
            callback = function() { };
        }

        // Read the current object.
        var that = this;
        if (waitForOperation(function() { that.delete(key, callback); })) {
            JsDbg.GetPersistentData(/*user*/null, function(result) {
                if (!(that.namespace in result) || typeof(result[that.namespace]) != typeof({})) {
                    callback({error: "The namespace was not found."});
                    completedOperation();
                    return;
                }

                // Update it with the new value.
                delete result[that.namespace][key];

                // And save it.
                JsDbg.SetPersistentData(result, function(result) {
                    callback(result);
                    completedOperation();
                });
            });
        }
    };

    return {
        Load: function(namespace) {
            (new Store(namespace + "-metadata", null)).set("Last Access Date", new Date());
            return new Store(namespace, null);;
        },

        LoadAllUsers: function(namespace, callback) {
            JsDbg.GetPersistentDataUsers(function (result) {
                if (result.error) {
                    callback(result);
                } else {
                    callback(result.users.map(function(username) { return new Store(namespace, username); }));
                }
            });
        },
    }
})();