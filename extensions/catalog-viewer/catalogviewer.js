//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

var CatalogViewer = (function() {
    function loadAll(stores, callback) {
        var counter = stores.length;
        if (counter == 0) {
            callback([]);
            return;
        }
        var results = new Array(stores.length);

        stores.forEach(function(store, i) {
            store.all(function(data) {
                counter--;
                results[i] = data;
                if (counter == 0) {
                    callback(results);
                }
            })
        })
    }

    // The viewer is designed to be modal, therefore it can only be opened once.
    var currentlyActive = false;

    return {
        _help: {
            name:"CatalogViewer",
            description:"Creates UI for selecting items from a namespace across all users."
        },

        _help_Instantiate: {
            description: "Instantiates the selection UI.",
            arguments: [
                {name: "namespace", type:"string", description: "The Catalog namespace to browse."},
                {name: "collectItemsFromStore", type:"function(object, string) -> array of objects", description: "Gathers items from a catalog store."},
                {name: "prompt", type:"string", description: "The user prompt."},
                {name: "ui", type:"function(object) -> array of HTML fragments", description: "A function to create the table cells associated with a given entity in the namespace."},
                {name:" selected", type:"function({key: string, value:any, user:string})", description: "A function that is called when the user selects a number of entities."},
                {name: "sortStringifier", type:"function({key: string, value:any, user:string}) -> string", description:"(optional) A function to create sort keys for the entities."}
            ],
            returns: "A boolean indicating if the viewer is going to open."
        },
        Instantiate: function() {
            if (currentlyActive) {
                return false;
            } else {
                currentlyActive = true;
                return true;
            }
        }
    }
})();

Help.Register(CatalogViewer);