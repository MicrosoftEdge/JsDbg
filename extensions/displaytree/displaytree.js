"use strict";

var DisplayTree = undefined;
JsDbg.OnLoad(function() {
    // Add a type description for CDispNode to link to the DisplayTree.
    DbgObject.AddTypeDescription(MSHTML.Module, "CDispNode", "DisplayTree", true, function(dispNode) {
        if (dispNode.isNull()) {
            return "null";
        } else {
            return "<a href=\"/displaytree/#" + dispNode.ptr() + "\">" + dispNode.ptr() + "</a>";
        }
    });

    if (JsDbg.GetCurrentExtension() == "displaytree") {
        DbgObjectTree.AddRoot("Display Tree", function() {
            return MSHTML.GetCDocs()
            .then(function(docs) {
                return Promise.map(docs, function(doc) { return doc.f("_view._pDispRoot"); });
            })
            .then(function(dispRoots) {
                return Promise.filter(Promise.join(dispRoots), function(dispRoot) { return !dispRoot.isNull(); })
            })
            .then(function(nonNullDispRoots) {
                if (nonNullDispRoots.length == 0) {
                    return Promise.fail();
                }
                return nonNullDispRoots;
            })
            .then(null, function(error) {
                var errorMessage =
                    "No CDispRoots were found.\
                    Possible reasons:\
                    <ul>\
                        <li>The debuggee is not IE 11 or Edge.</li>\
                        <li>No page is loaded.</li>\
                        <li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li>\
                        <li>Symbols aren't available.</li>\
                    </ul>\
                    Refresh the page to try again, or specify a CDispNode explicitly.";

                if (error) {
                    errorMessage = "<h4>" + error.toString() + "</h4>" + errorMessage;
                }
                return Promise.fail(errorMessage);
            });
        });

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "CDispNode", address).vcast();
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CDispParentNode", null, function (object) {
            return object.f("_pFirstChild").latestPatch().list(function (node) {
                return node.f("_pNext").latestPatch()
            }).vcast();
        });
    }

    DbgObject.AddExtendedField(MSHTML.Module, "CDispNode", "Client", "CDispClient", UserEditableFunctions.Create(function (dispNode) {
        // Get the latest patch...
        return dispNode.latestPatch()

        // Check if it has advanced display...
        .then(function(latestPatch) {
            return latestPatch.f("_flags._fAdvanced").val()

            // And get the disp client.
            .then(function(hasAdvanced) {
                if (hasAdvanced) {
                    return latestPatch.f("_pAdvancedDisplay._pDispClient");
                } else {
                    return latestPatch.f("_pDispClient");
                }
            });
        });
    }));

    DbgObject.AddExtendedField(MSHTML.Module, "CDispClient", "AsContainerBox", "Layout::ContainerBox", UserEditableFunctions.Create(function (client) {
        return client.dcast("Layout::ContainerBox");
    }));

    DbgObject.AddTypeDescription(MSHTML.Module, "CDispFlags", "AllFlags", false, UserEditableFunctions.Create(function (flags) {
        return Promise
        .filter(flags.fields(), function(f) {
            if (f.name.indexOf("_fUnused") != 0 && f.value.bitcount == 1) {
                return f.value.val();
            } else {
                return false;
            }
        })
        .then(function(enabledFlags) {
            return enabledFlags
            .map(function(flag) { return flag.name; })
            .join(" ");
        });
    }));

    DisplayTree = {
        Name: "DisplayTree",
        RootType: "CDispNode",
        DefaultTypes: [
            { module: MSHTML.Module, type: "CDispNode" }
        ]
    };
});
