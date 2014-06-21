"use strict";

var TextBlock = (function() {

    function createTextBlock(pointer) {
        if (pointer) {
            return new TextBlock(new DbgObject("mshtml", "Tree::TextBlock", pointer));
        } else {
            return null;
        }
    }

    DbgObject.AddTypeDescription("mshtml", "Tree::TextBlock", function(textBlock) {
        if (textBlock.isNull()) {
            return "null";
        } else {
            return "<a href=\"/textblock/#" + textBlock.ptr() + "\">" + textBlock.ptr() + "</a>";
        }
    });

    function TextBlock(textBlock) {
        this.textBlock = textBlock;
        this.childrenPromise = null;
        this.drawingTreeNodeIsExpanded = true;
    }

    TextBlock.prototype.getChildren = function() {
        if (this.childrenPromise == null) {
            this.childrenPromise = this.textBlock.f("_aryRuns._pv").as("Tree::TextBlockRun*").array(this.textBlock.f("_aryRuns._c").val())
            .then(function (textBlockRuns) {
                return textBlockRuns.map(function(run) {
                    return new TextBlockRun(run);
                })
            });
        }

        return this.childrenPromise;
    }

    TextBlock.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        
        element.innerHTML = "<p>TextBlock</p> <p>" + this.textBlock.ptr() + "</p> ";
        return FieldSupport.RenderFields(this, this.textBlock, element);
    }

    function TextBlockRun(textBlockRun) {
        this.textBlockRun = textBlockRun;
    }

    TextBlockRun.prototype.getChildren = function() {
        return Promise.as([]);
    }

    TextBlockRun.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        
        element.innerHTML = "<p>TextBlockRun</p> <p>" + this.textBlockRun.ptr() + "</p> ";
        return FieldSupport.RenderFields(this, this.textBlockRun, element);
    }

    var builtInFields = [
        {
            type: "TextBlock",
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
            fullname: "RunType",
            shortname: "type",
            async:true,
            html: function() {
                return this.f("_runType").as("Tree::TextBlockRunTypeEnum").desc();
            }
        }
    ];

    return {
        Name: "TextBlock",
        BasicType: "TextBlock",
        BuiltInFields: builtInFields,
        TypeMap: {"TextBlock": TextBlock, "TextBlockRun": TextBlockRun },
        Create: createTextBlock,
        Roots: function() { return Promise.as([]); }
    };
})();