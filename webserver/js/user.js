"use strict";

// Visualizations that can be applied on top of the box tree.  Visualizations can provide an
// "html" function and a "shortname" which will add innerHTML to each tree node, or they can
// directly manipulate the node element by providing an "element" function.

// This is designed to be easily extendable by the end user during a live debugging session.

var UserFields = [
    {
        type: ContainerBox,
        fullname: "ContainerBox.ContentBoxWidth",
        shortname: "w",
        html: function(box) {
            return box.f("contentBoxWidth").val();
        }
    },

    {
        type: ContainerBox,
        fullname: "ContainerBox.ContentBoxHeight",
        shortname: "h",
        html: function(box) {
            return box.f("contentBoxHeight").val();
        }
    },

    {
        type:ContainerBox,
        fullname: "ContainerBox.LayoutPlacement",
        shortname: "lp",
        html: function(box) {
            return box.f("sourceStyle.fancyFormat._layoutPlacement").bits(0, 5);
        }
    },

    {
        type:ContainerBox,
        fullname: "ContainerBox.DisplayNode",
        shortname: "d",
        html: function(box) {
            if (!box.f("isDisplayNodeExtracted").bits(2, 1)) {
                return "0x" + box.f("rawDisplayNode").ptr().toString(16);
            } else {
                return "null";
            }
        }
    },

    {
        type: ContainerBox,
        fullname: "ContainerBox.Validity",
        element: function(box, e) {
            if (box.f("isLayoutInvalid").bits(0, 1)) {
                e.style.backgroundColor = "#fbc";
            } else if (box.f("isDisplayInvalid").bits(1, 1)) {
                e.style.backgroundColor = "#ffc";
            } else {
                e.style.backgroundColor = "#bfc";
            }
        }
    },

    {
        type: LineBox,
        fullname: "LineBox.Text",
        shortname: "text",
        html: function(box) {
            var runIndexAtStartOfLine = box.f("textBlockRunIndexAtStartOfLine").val();
            var characterIndexInTextBlockRunAtStartOfLine = box.f("characterIndexInTextBlockRunAtStartOfLine").val();
            var runIndexAfterLine = box.f("textBlockRunIndexAfterLine").val();
            var characterIndexInTextBlockRunAfterLine = box.f("characterIndexInTextBlockRunAfterLine").val();

            var textBlock = box.f("textBlock.m_pT");
            var result = "";
            if (!textBlock.isNull() && runIndexAtStartOfLine >= 0) {
                var runCount = textBlock.f("_aryRuns._c").val();
                var runArray = textBlock.f("_aryRuns._pv").as("Tree::TextBlockRun*");

                if (runIndexAfterLine >= 0) {
                    runCount = runIndexAfterLine + 1;
                }

                result = "<em>";

                for (var i = runIndexAtStartOfLine; i < runCount; ++i) {
                    var runType = runArray.idx(i).deref().f("_runType").bits(0, 3);
                    if (runType == 0x1) {
                        // It's a character run.
                        var textRun = runArray.idx(i).deref().f("_u._pTextRun");
                        var offset = textRun.f("_cchOffset").val();
                        var length = textRun.f("_cchRunLength").val();
                        if (textRun.f("_fHasTextTransformOrPassword").bits(4, 1)) {
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
                        result += "</em><strong>[RT=" + runType + "]</strong><em>";
                    }
                }
                result += "</em>";
            }

            return result;
        }
    }
];
