"use strict";

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



var reinjectUserFields = (function() {
    var modifiedTypes = [];

    function inject() {
        UserFields.forEach(function(field) {
            if (field.enabled) {
                var previous = field.type.prototype.collectUserFields;
                modifiedTypes.push([field.type, previous]);
                field.type.prototype.collectUserFields = function(fields) {
                    previous(fields);
                    fields.push(field);
                };
            }
        });
    }

    function uninject() {
        // Unwind the modified type stack.
        while (modifiedTypes.length > 0) {
            var injection = modifiedTypes.pop();
            injection[0].prototype.collectUserFields = injection[1];
        }
    }

    return function () {
        uninject();
        inject();
    }
})();
reinjectUserFields();

document.addEventListener("DOMContentLoaded", function() {
    // Add the field selection UI.
    var container = document.createElement("div");
    container.className = "field-selection";
    UserFields.forEach(function(f) {
        var checkbox = document.createElement("input");
        checkbox.setAttribute("type", "checkbox");
        checkbox.setAttribute("id", f.fullname);
        checkbox.checked = f.enabled;
        container.appendChild(checkbox);
        checkbox.addEventListener("change", function() {
            f.enabled = checkbox.checked;
            reinjectUserFields();
            if (rootTreeNode != null) {
                rootTreeNode.updateRepresentation();
            }
        })

        var label = document.createElement("label");
        label.setAttribute("for", f.fullname);
        label.innerHTML = f.fullname;
        container.appendChild(label);

        container.appendChild(document.createElement("br"));
    });
    document.body.appendChild(container);
});
