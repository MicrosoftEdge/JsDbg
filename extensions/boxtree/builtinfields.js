"use strict";

// user.js
// Peter Salas
//
// Visualizations that can be applied on top of the box tree.
//
// These are the built-in fields/visualizations -- it can be extended live using the UI
// provided by fieldsupport.js.

var BoxTreeBuiltInFields = [
    {
        type: "ContainerBox",
        fullname: "CTreeNode",
        shortname: "tn",
        html: function() {
            return MSHTML.GetCTreeNodeFromTreeElement(this.f("element.m_pT")).ptr();
        }
    },

    {
        type: "ContainerBox",
        fullname: "Tag",
        shortname: "tag",
        html: function() {
            return MSHTML.GetCTreeNodeFromTreeElement(this.f("element.m_pT"))
                .f("_etag")
                .as("ELEMENT_TAG")
                .constant()
                .substr("ETAG_".length);
        }
    },
    {
        type: "ContainerBox",
        fullname: "ContentBoxWidth",
        shortname: "w",
        html: function() {
            return this.f("contentBoxWidth").val() / 100 + "px";
        }
    },

    {
        type: "ContainerBox",
        fullname: "ContentBoxHeight",
        shortname: "h",
        html: function() {
            return this.f("contentBoxHeight").val() / 100 + "px";
        }
    },

    {
        type: "ContainerBox",
        fullname: "LayoutPlacement",
        shortname: "lp",
        html: function() {
            return this.f("sourceStyle.fancyFormat._layoutPlacement")
                      .as("Tree::LayoutPlacementEnum")
                      .constant()
                      .substr("LayoutPlacementEnum_".length);
        }
    },

    {
        type: "ContainerBox",
        fullname: "DisplayNode",
        shortname: "d",
        html: function() {
            if (!this.f("isDisplayNodeExtracted").val()) {
                return this.f("rawDisplayNode").ptr();
            } else {
                return "null";
            }
        }
    },

    {
        type: "ContainerBox",
        fullname: "Validity",
        shortname: "validity",
        html: function(e) {
            if (this.f("isLayoutInvalid").val()) {
                e.style.backgroundColor = "#fbc";
            } else if (this.f("isDisplayInvalid").val()) {
                e.style.backgroundColor = "#ffc";
            } else {
                e.style.backgroundColor = "#bfc";
            }
        }
    },

    {
        type: "LineBox",
        fullname: "Text",
        shortname: "text",
        html: function() {
            var runIndexAtStartOfLine = this.f("textBlockRunIndexAtStartOfLine").val();
            var characterIndexInTextBlockRunAtStartOfLine = this.f("characterIndexInTextBlockRunAtStartOfLine").val();
            var runIndexAfterLine = this.f("textBlockRunIndexAfterLine").val();
            var characterIndexInTextBlockRunAfterLine = this.f("characterIndexInTextBlockRunAfterLine").val();

            var textBlock = this.f("textBlock.m_pT");
            var result = "";
            if (!textBlock.isNull() && runIndexAtStartOfLine >= 0) {
                var runCount = textBlock.f("_aryRuns._c").val();
                var runArray = textBlock.f("_aryRuns._pv").as("Tree::TextBlockRun*");

                if (runIndexAfterLine >= 0) {
                    runCount = runIndexAfterLine + 1;
                }

                result = "<em>";

                for (var i = runIndexAtStartOfLine; i < runCount; ++i) {
                    var runType = runArray.idx(i).deref().f("_runType").as("Tree::TextBlockRunTypeEnum").constant().substr("TextBlockRunTypeEnum_".length);
                    if (runType == "CharacterRun") {
                        var textRun = runArray.idx(i).deref().f("_u._pTextRun");
                        var offset = textRun.f("_cchOffset").val();
                        var length = textRun.f("_cchRunLength").val();
                        if (textRun.f("_fHasTextTransformOrPassword").val()) {
                            var textData = textRun.f("_characterSourceUnion._pchTransformedCharacters");
                            offset = 0;
                        } else {
                            var textData = textRun.f("_characterSourceUnion._pTextData._pText");
                        }

                        var stringLength = length;

                        if (i == runIndexAtStartOfLine) {
                            offset += characterIndexInTextBlockRunAtStartOfLine;
                            stringLength -= characterIndexInTextBlockRunAtStartOfLine;
                        }

                        if (i == runIndexAfterLine) {
                            stringLength -= (length - characterIndexInTextBlockRunAfterLine);
                        }

                        var array = textData.idx(offset).array(stringLength);
                        result += array.map(function(x) { return "&#" + x + ";"; }).join("");
                    } else {
                        result += "</em><strong>[" + runType + "]</strong><em>";
                    }
                }
                result += "</em>";
            }

            return result;
        }
    }
];
