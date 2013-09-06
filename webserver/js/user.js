"use strict";

// user.js
// Peter Salas
//
// Visualizations that can be applied on top of the box tree.  Visualizations can provide an
// "html" function and a "shortname" which will add innerHTML to each tree node, or they can
// directly manipulate the node element by providing an "element" function.

// This is designed to be easily extendable by the end user during a live debugging session.

var UserFields = [
    {
        type: ContainerBox,
        fullname: "ContainerBox.CTreeNode",
        shortname: "tn",
        html: function(box) {
            var element = box.f("element.m_pT");
            var treeNode = null;
            try {
                element.f("placeholder");
                // We're in chk, offset by the size of a void*.
                treeNode = element.as("void*").idx(1).as("CTreeNode");
            } catch (ex) {
                // We're in fre, cast to CTreeNode.
                treeNode = element.as("CTreeNode");
            }

            return "0x" + treeNode.ptr().toString(16);
        }
    },

    {
        type: ContainerBox,
        fullname: "ContainerBox.Tag",
        shortname: "tag",
        html: function(box) {
            var element = box.f("element.m_pT");
            var treeNode = null;
            try {
                element.f("placeholder");
                // We're in chk, offset by the size of a void*.
                treeNode = element.as("void*").idx(1).as("CTreeNode");
            } catch (ex) {
                // We're in fre, cast to CTreeNode.
                treeNode = element.as("CTreeNode");
            }

            return treeNode.f("_etag").as("ELEMENT_TAG").constant(0, 16).substr("ETAG_".length);
        }
    },
    {
        type: ContainerBox,
        fullname: "ContainerBox.ContentBoxWidth",
        shortname: "w",
        html: function(box) {
            return box.f("contentBoxWidth").val() / 100 + "px";
        }
    },

    {
        type: ContainerBox,
        fullname: "ContainerBox.ContentBoxHeight",
        shortname: "h",
        html: function(box) {
            return box.f("contentBoxHeight").val() / 100 + "px";
        }
    },

    {
        type:ContainerBox,
        fullname: "ContainerBox.LayoutPlacement",
        shortname: "lp",
        html: function(box) {
            return box.f("sourceStyle.fancyFormat._layoutPlacement")
                      .as("Tree::LayoutPlacementEnum")
                      .constant(0, 5)
                      .substr("LayoutPlacementEnum_".length);
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
        type:ContainerBox,
        fullname: "ContainerBox.HasOpacity",
        shortname: "o",
        html: function(box) {
            return box.f("sourceStyle.fancyFormat._fHasOpacity").bits(6, 1) ? true : false;
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
                    var runType = runArray.idx(i).deref().f("_runType").as("Tree::TextBlockRunTypeEnum").constant(0, 3).substr("TextBlockRunTypeEnum_".length);
                    if (runType == "CharacterRun") {
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
                        result += "</em><strong>[" + runType + "]</strong><em>";
                    }
                }
                result += "</em>";
            }

            return result;
        }
    }
];
