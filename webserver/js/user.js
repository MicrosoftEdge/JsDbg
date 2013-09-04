"use strict";

function UserFields() {
    return [
        {
            type: ContainerBox,
            name: "w",
            enabled: true,
            html: function(box) {
                return box.f("contentBoxWidth").val();
            }
        },

        {
            type: ContainerBox,
            name: "h",
            enabled: true,
            html: function(box) {
                return box.f("contentBoxHeight").val();
            }
        },

        {
            type:ContainerBox,
            name: "lp",
            enabled: false,
            html: function(box) {
                return box.f("sourceStyle.fancyFormat._layoutPlacement").bits(0, 5);
            }
        },

        {
            type: ContainerBox,
            enabled: true,
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
            name: "text",
            enabled: true,
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
}