"use strict";

var TextBlock = undefined;
JsDbg.OnLoad(function() {

    DbgObject.AddTypeDescription(MSHTML.Module, "Tree::TextBlock", function(textBlock) {
        return "<a href=\"/textblock/#" + textBlock.ptr() + "\">" + textBlock.ptr() + "</a>";
    });

    if (JsDbg.GetCurrentExtension() == "textblock") {
        DbgObjectTree.AddRoot("TextBlock", function() { 
            return [];
        });
        DbgObjectTree.AddType(null, MSHTML.Module, "Tree::TextBlock", null, function (object) {
            return object.f("_aryRuns").array();
        });

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "Tree::TextBlock", address).vcast();
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
            async:true,
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
            async:true,
            html: function() {
                return this.f("_runType").as("Tree::TextBlockRunTypeEnum");
            }
        }
    ];

    TextBlock = {
        Name: "TextBlock",
        BasicType: "TextBlock",
        DefaultFieldType: {
            module: MSHTML.Module,
            type: "Tree::TextBlock"
        },
        BuiltInFields: builtInFields
    };
});