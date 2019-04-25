//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

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

    function Store(namespace) {
        this.namespace = "_CATALOG-" + namespace;
    };

    Help.Register(Store);
    Store._help = {
        name: "Catalog.Store",
        description: "A data store for a particular namespace."
    }

    Store.prototype._help_all = {
        description: "Retrieves every key/value pair in the given store.",
        arguments: [{name:"callback", type:"function(object)", description:"The callback."}]
    };
    Store.prototype.all = function(callback) {
        var that = this;

        if (waitForOperation(function() { that.all(callback); })) {
            JsDbg.GetPersistentData(function(result) {
                if (result.error) {
                    callback(result);
                } else if (that.namespace in result.data) {
                    callback(result.data[that.namespace]);
                } else {
                    callback({});
                }
                completedOperation();
            });
        }
    };

    Store.prototype._help_set = {
        description:"Sets a value in the store.",
        arguments: [
            {name:"key", type:"string", description:"The key."},
            {name:"value", type:"object", description:"The value."},
            {name:"callback", type:"function(object)", description:"(optional) The callback when the operation completes."}
        ]
    };
    Store.prototype.set = function(key, value, callback) {
        if (!callback) {
            callback = function() { };
        }

        // Read the current object.
        var that = this;
        if (waitForOperation(function() { that.set(key, value, callback); })) {
            JsDbg.GetPersistentData(function(result) {
                if (result.error) {
                    callback(result);
                    completedOperation();
                    return;
                } else if (!(that.namespace in result.data)) {
                    result.data[that.namespace] = {};
                } else if (typeof(result.data[that.namespace]) != typeof({})) {
                    callback({error: "The namespace collides with an existing value."});
                    completedOperation();
                    return;
                }

                // Update it with the new value.
                result.data[that.namespace][key] = value;

                // And save it.
                JsDbg.SetPersistentData(result.data, function(result) {
                    callback(result);
                    completedOperation();
                });
            });
        }
    };

    Store.prototype._help_setMultiple = {
        description:"Sets multiple values in the store.",
        arguments: [
            {name:"keysAndValues", type:"object", description:"The keys and values to store."},
            {name:"callback", type:"function(object)", description:"(optional) The callback when the operation completes."}
        ]
    };
    Store.prototype.setMultiple = function(keysAndValues, callback) {
        if (!callback) {
            callback = function() { };
        }

        // Read the current object.
        var that = this;
        if (waitForOperation(function() { that.setMultiple(keysAndValues, callback); })) {
            JsDbg.GetPersistentData(function(result) {
                if (result.error) {
                    callback(result);
                    completedOperation();
                    return;
                } else if (!(that.namespace in result.data)) {
                    result.data[that.namespace] = {};
                } else if (typeof(result.data[that.namespace]) != typeof({})) {
                    callback({error: "The namespace collides with an existing value."});
                    completedOperation();
                    return;
                }

                // Update it with the new values.
                for (var key in keysAndValues) {
                    result.data[that.namespace][key] = keysAndValues[key];
                }

                // And save it.
                JsDbg.SetPersistentData(result.data, function(result) {
                    callback(result);
                    completedOperation();
                });
            });
        }
    }

    Store.prototype._help_delete = {
        description:"Deletes a key from the store.",
        arguments: [
            {name:"key", type:"string", description:"The keys to remove from the store."},
            {name:"callback", type:"function(object)", description:"(optional) The callback when the operation completes."}
        ]
    };
    Store.prototype.delete = function(key, callback) {
        if (!callback) {
            callback = function() { };
        }

        // Read the current object.
        var that = this;
        if (waitForOperation(function() { that.delete(key, callback); })) {
            JsDbg.GetPersistentData(function(result) {
                if (result.error) {
                    callback(result);
                    completedOperation();
                    return;
                } else if (!(that.namespace in result.data) || typeof(result.data[that.namespace]) != typeof({})) {
                    callback({error: "The namespace was not found."});
                    completedOperation();
                    return;
                }

                // Update it with the new value.
                delete result.data[that.namespace][key];

                // And save it.
                JsDbg.SetPersistentData(result.data, function(result) {
                    callback(result);
                    completedOperation();
                });
            });
        }
    };

    return {
        _help: {
            name:"Catalog",
            description:"Abstracts JsDbg persistent storage into namespaces."
        },

        _help_Load: {
            description:"Loads a data store for a namespace.",
            arguments: [{name:"namespace", type:"string", description:"The namespace."}],
            returns: "A Catalog.Store object for the current user.",
        },
        Load: function(namespace) {
            (new Store(namespace + "-metadata", null)).set("Last Access Date", new Date());
            return new Store(namespace, null);;
        },
    }
})();

Help.Register(Catalog);