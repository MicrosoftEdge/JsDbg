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

    return {
        _help: {
            name:"CatalogViewer",
            description:"Creates UI for selecting items from a namespace across all users."
        },

        _help_Instantiate: {
            description: "Instantiates the selection UI.",
            arguments: [
                {name: "namespace", type:"string", description: "The Catalog namespace to browse."},
                {name: "prompt", type:"string", description: "The user prompt."},
                {name: "ui", type:"function({key: string, value:any, user:string}) -> array of HTML fragments", description: "A function to create the table cells associated with a given entity in the namespace."},
                {name:" selected", type:"function({key: string, value:any, user:string})", description: "A function that is called when the user selects a number of entities."},
                {name: "sortStringifier", type:"function({key: string, value:any, user:string}) -> string", description:"(optional) A function to create sort keys for the entities."}
            ]
        },
        Instantiate: function(namespace, prompt, ui, selected, sortStringifier) {
            // Get all the stores.
            Catalog.LoadAllUsers(namespace, function(stores) {
                if (stores.error) {
                    throw "Unable to get all the user stores.";
                } else {
                    loadAll(stores, function(values) {
                        var rows = [];
                        for (var i = 0; i < values.length; ++i) {
                            for (var key in values[i]) {
                                rows.push({key: key, value: values[i][key], user: stores[i].user.replace(".", "\\") });
                            }
                        }

                        if (sortStringifier) {
                            rows.sort(function(a, b) {
                                return sortStringifier(a).localeCompare(sortStringifier(b));
                            });
                        }

                        var checkBoxes = new Array(rows.length);

                        var uiRows = rows.map(function(value, valueIndex) {
                            var tableRow = document.createElement("tr");

                            var checkBoxCell = document.createElement("td");
                            tableRow.appendChild(checkBoxCell);
                            var checkBox = document.createElement("input");
                            checkBox.setAttribute("type", "checkbox");
                            checkBoxCell.appendChild(checkBox);

                            checkBoxes[valueIndex] = checkBox;

                            tableRow.addEventListener("click", function(e) {
                                if (e.target != checkBox) {
                                    checkBox.checked = checkBox.checked ? "" : "checked";
                                }
                            });

                            var cells = ui(value);
                            for (var i = 0; i < cells.length; ++i) {
                                var cell = document.createElement("td");
                                cell.innerHTML = cells[i];
                                tableRow.appendChild(cell);
                            }

                            return tableRow;
                        });

                        var table = document.createElement("table");
                        uiRows.forEach(function(tr) { table.appendChild(tr); });

                        var container = document.createElement("div");
                        container.className = "catalog-viewer";

                        var tableContainer = document.createElement("div");
                        tableContainer.className = "table-container";

                        var promptP = document.createElement("p");
                        promptP.innerHTML = prompt;
                        tableContainer.appendChild(promptP);
                        tableContainer.appendChild(table);
                        container.appendChild(tableContainer);

                        var buttonContainer = document.createElement("div");
                        buttonContainer.className = "button-container";
                        var doneButton = document.createElement("button");
                        doneButton.innerHTML = "Done";
                        buttonContainer.appendChild(doneButton);

                        container.appendChild(buttonContainer);

                        doneButton.addEventListener("click", function() {
                            // Remove the selection box.
                            document.body.removeChild(container);

                            var selection = [];
                            for (var i = 0; i < rows.length; ++i) {
                                if (checkBoxes[i].checked) {
                                    selection.push(rows[i]);
                                }
                            }

                            selected(selection);
                        });

                        
                        document.body.appendChild(container);
                    });
                }
            });
        }
    }
})();

Help.Register(CatalogViewer);