//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var TextBlock = undefined;
Loader.OnLoad(function() {

    DbgObject.AddTypeDescription(MSHTML.Module, "Tree::TextBlock", "TextBlock", true, function(textBlock) {
        return "<a href=\"/textblock/#" + textBlock.ptr() + "\">" + textBlock.ptr() + "</a>";
    });

    if (Loader.GetCurrentExtension()== "textblock") {
        DbgObjectTree.AddRoot("TextBlock", function() { 
            return [];
        });
        DbgObjectTree.AddType(null, MSHTML.Module, "Tree::TextBlock", null, function (object) {
            return object.f("_aryRuns").array("Items");
        });

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return DbgObject.create(SHTML.Module, "Tree::TextBlock", address).vcast();
        });
    }

    var builtInFields = [
        {
            type: "TextBlock",
            fullType: {
                module: MSHTML.Module,
                type: "Tree::TextBlock"
            },
            fullname: "Flags",
            shortname: "",
            html: function() {
                return Promise.filter(this.fields(), function(f) { return f.name.indexOf("_f") == 0; })
                .then(function (fields) {
                    return Promise.filter(fields, function (f) { return f.value.val(); });
                })
                .then(function (activeFields) {
                    return activeFields.map(function (f) { return f.name.substr(2); }).join(" ");
                });
            }
        },
        {
            type: "TextBlockRun",
            fullType: {
                module: MSHTML.Module,
                type: "Tree::TextBlockRun"
            },
            fullname: "RunType",
            shortname: "type",
            html: function() {
                return this.f("_runType").as("Tree::TextBlockRunTypeEnum");
            }
        }
    ];

    TextBlock = {
        Name: "TextBlock",
        RootType: "TextBlock",
        DefaultFieldType: {
            module: MSHTML.Module,
            type: "Tree::TextBlock"
        },
        BuiltInFields: builtInFields
    };
});