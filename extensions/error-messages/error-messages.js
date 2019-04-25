//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

var ErrorMessages = undefined;
Loader.OnLoad(function() {
    ErrorMessages = {
        CreateErrorsList: createErrorsList,
        CreateErrorReasonsList: createErrorReasonsList,
        SymbolsUnavailable: "Symbols aren't available.",
        WrongDebuggee: wrongDebuggee
    }

    function createListString(listName, ...listItems) {
        var listString = "";
        var listHeaderAdded = false;
        listItems.forEach((listItem) => {
            if (listItem) {
                if (!listHeaderAdded) {
                    listString += listName + ":";
                    listString += "<ul>";
                    listHeaderAdded = true;
                }
                listString += "<li>" + listItem.toString() + "</li>"
            }
        });
        if (listHeaderAdded) {
            listString += "</ul>";
        }
        return listString;
    }

    function createErrorsList(...errors) {
        return "<b>" + createListString("Errors", ...errors) + "</b>";
    }

    function createErrorReasonsList(...reasons) {
        return createListString("Possible reasons", ...reasons);
    }

    function wrongDebuggee(...correctDebuggees) {
        console.assert(correctDebuggees.length > 0, "Must specify at least one correct debugging target.");
        var wrongDebuggeeMessage = "The debuggee is not ";
        if (correctDebuggees.length > 1) {
            for (var i = 0; i < correctDebuggees.length - 1; i++) {
                wrongDebuggeeMessage += correctDebuggees[i] + ", ";
            }
            wrongDebuggeeMessage += "or " + correctDebuggees[correctDebuggees.length - 1];
        } else {
            wrongDebuggeeMessage += correctDebuggees[0];
        }
        wrongDebuggeeMessage += ". (Attach to the correct debugging target and try again.)";
        return wrongDebuggeeMessage;
    }
});