
var Catalog = (function() {
    function Store(namespace, user) {
        this.namespace = "_CATALOG-" + namespace;
        this.user = user;
    };

    Store.prototype.all = function(callback) {
        var that = this;
        JsDbg.GetPersistentData(this.user, function(result) {
            if (that.namespace in result) {
                callback(result[that.namespace]);
            } else {
                callback({});
            }
        });
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
        JsDbg.GetPersistentData(/*user*/null, function(result) {
            if (!(that.namespace in result)) {
                result[that.namespace] = {};
            } else if (typeof(result[that.namespace]) != typeof({})) {
                callback({error: "The namespace collides with an existing value."});
                return;
            }

            // Update it with the new value.
            result[that.namespace][key] = value;

            // And save it.
            JsDbg.SetPersistentData(result, callback);
        });
    };

    Store.prototype.delete = function(key, callback) {
        if (this.user) {
            throw "You cannot delete keys from a different user.";
        }

        if (!callback) {
            callback = function() { };
        }

        // Read the current object.
        var that = this;
        JsDbg.GetPersistentData(/*user*/null, function(result) {
            if (!(that.namespace in result) || typeof(result[that.namespace]) != typeof({})) {
                callback({error: "The namespace was not found."});
                return;
            }

            // Update it with the new value.
            delete result[that.namespace][key];

            // And save it.
            JsDbg.SetPersistentData(result, callback);
        });
    };

    return {
        Load: function(namespace) {
            return new Store(namespace, null);
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