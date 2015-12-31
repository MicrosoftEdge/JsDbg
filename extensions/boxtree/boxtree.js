"use strict";

var BoxTree = undefined;
JsDbg.OnLoad(function() {
    function collectChildrenInFlow(flow) {
        return flow
        .latestPatch()
        .list(function (flowItem) { return flowItem.f("data.next").latestPatch(); })
            .f("data.boxReference.m_pT")
            .vcast();
    }

    function collectChildrenInPositionedItems(positionedItemsList) {
        return positionedItemsList.f("firstItem.m_pT").list("next.m_pT")
        .vcast()
        .map(function (listItem) {
            if (listItem.typeDescription() == "Layout::PositionedBoxItem") {
                return listItem
                .f("boxItem", "flowItem")
                .latestPatch()
                .f("data.boxReference.m_pT")
                .vcast();
            } else if (listItem.typeDescription() == "Layout::PositionedInlineLayoutItem") {
                return listItem.f("inlineLayoutReference.m_pT");
            } else {
                return DbgObject.NULL;
            }
        });
    }

    // Add a type description for LayoutBox to link to the BoxTree.
    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::LayoutBox", "BoxTree", true, function(box) {
        if (box.isNull()) {
            return "null";
        } else {
            return "<a href=\"/boxtree/#" + box.ptr() + "\">" + box.ptr() + "</a>";
        }
    });

    if (JsDbg.GetCurrentExtension() == "boxtree") {
        DbgObjectTree.AddRoot("Box Tree", function() {
            return Promise.map(MSHTML.GetRootCTreeNodes(), function(treeNode) {
                return MSHTML.GetFirstAssociatedLayoutBoxFromCTreeNode(treeNode).as("Layout::ContainerBox").list(["nextLayoutBox", "associatedBoxLink"]).vcast();
            })
            .then(function(boxes) {
                var flattenedArray = [];
                boxes.forEach(function (innerArray) {
                    flattenedArray = flattenedArray.concat(innerArray);
                });

                if (flattenedArray.length == 0) {
                    return Promise.fail();
                } else {
                    return flattenedArray;
                }
            })
            .then(null, function(error) {
                var errorMessage =
                    "No root CTreeNodes with LayoutBoxes were found.\
                    Possible reasons:\
                    <ul>\
                        <li>The debuggee is not IE 11 or Edge.</li>\
                        <li>No page is loaded.</li>\
                        <li>The docmode is < 8.</li>\
                        <li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li>\
                        <li>Symbols aren't available.</li>\
                    </ul>\
                    Refresh the page to try again, or specify a LayoutBox explicitly.";

                if (error) {
                    errorMessage = "<h4>" + error.toString() + "</h4>" + errorMessage;
                }
                return Promise.fail(errorMessage);
            });
        });

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "Layout::LayoutBox", address).vcast();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::ContainerBox", null, function (object) {
            return collectChildrenInPositionedItems(object.f("PositionedItems"));
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::InlineLayout", null, function (object) {
            return collectChildrenInPositionedItems(object.f("positionedItems"));
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::FlowBox", null, function (object) {
            // Collect static flow.
            return collectChildrenInFlow(object.f("flow"));
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::FlowBox", null, function (object) {
            // Collect floaters.
            return object.f("geometry").array()
                .f("floaterBoxReference.m_pT")
                .latestPatch()
                .f("data.BoxReference.m_pT")
                .vcast();
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::TableBox", null, function (object) {
            return collectChildrenInFlow(object.f("items", "flow"));
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::TableGridBox", null, function (object) {
            return collectChildrenInFlow(object.f("fragmentedCellContents"))
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::TableGridBox", null, function (object) {
            return collectChildrenInFlow(object.f("collapsedCells")).then(null, function() { return []; });
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::TableGridBox", null, function (object) {
            return object.f("firstRowLayout.m_pT")
            .list("nextRowLayout.m_pT")
                .f("Columns.m_pT").latestPatch()
            .map(function(columns) {
                return columns.array()
                    .f("cellBoxReference.m_pT").vcast()
            });
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::GridBox", null, function (object) {
            return object.f("Items.m_pT").latestPatch().array().f("BoxReference.m_pT").vcast()
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::FlexBox", null, function (object) {
            return object.f("items", "flow")
            .then(function (items) {
                if (items.typeDescription().indexOf("FlexBoxItemArray") != -1) {
                    return items.f("m_pT").latestPatch().array().f("BoxReference.m_pT").vcast();
                } else if (items.typeDescription() == "Layout::BoxItem") {
                    return collectChildrenInFlow(items);
                } else if (items.typeDescription() == "SArray<Layout::FlexBox::SFlexBoxItem>") {
                    return collectChildrenInFlow(object.f("flow"));
                } else {
                    throw new Error("Unexpected FlexBox child typename: " + items.typeDescription());
                }
            })
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::MultiColumnBox", null, function (object) {
            return object.f("items.m_pT").latestPatch().array().f("BoxReference.m_pT").vcast();
        });

        DbgObjectTree.AddType("LineBox", MSHTML.Module, "Layout::LineBox", null, function(object) {
            // Get the LineBox flags...
            return object.f("lineBoxFlags").val()

            // Get the runs if we might have inline blocks...
            .then(function(lineBoxFlags) {
                if ((lineBoxFlags & 0x8) > 0) {
                    return object.f("firstRun.m_pT")
                    .list("next.m_pT")
                        .vcast()
                    .filter(function (run) {
                        var type = run.typeDescription();
                        return (
                            type == "Layout::InlineBlockLineBoxRun" || 
                            type == "Layout::InlineBlockWithBreakConditionLineBoxRun"
                        );
                    })
                        .f("boxReference.m_pT")
                        .vcast();
                } else {
                    return [];
                }
            });
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::ReplacedBoxIFrame", null, function (object) {
            return collectChildrenInFlow(object.f("replacedViewport", "flow"));
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::BoxContainerBox", null, function (object) {
            return collectChildrenInFlow(object.f("boxItem", "flowItem"));
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::SvgCssContainerBox", null, function (object) {
            return collectChildrenInFlow(object.f("firstSvgItem", "firstChildItem"));
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::SvgContainerBox", null, function (object) {
            return collectChildrenInFlow(object.f("firstSvgItem", "firstChildItem"));
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "Layout::SvgTextBox", null, function (object) {
            return collectChildrenInFlow(object.f("flow"));
        });
    }

    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::ContainerBox", "Validity", false, function (dbgObject, e) {
        return Promise.join([dbgObject.f("isLayoutInvalid").val(), dbgObject.f("isDisplayInvalid").val()])
        .then(function(invalidBits) {
            if (invalidBits[0]) {
                // Layout is invalid.
                e.style.backgroundColor = "#fbc";
            } else if (invalidBits[1]) {
                // Display is invalid.
                e.style.backgroundColor = "#ffc";
            } else {
                // Box is valid.
                e.style.backgroundColor = "#bfc";
            }
        });
    })

    var builtInFields = [
        {
            fullType: {
                module: MSHTML.Module,
                type: "Layout::ContainerBox"
            },
            fullname: "Element",
            shortname: "e",
            html: function() {
                return this.f("elementInternal", "element.m_pT");
            }
        },

        {
            fullType: {
                module: MSHTML.Module,
                type: "Layout::ContainerBox"
            },
            fullname: "Tag",
            shortname: "tag",
            html: function() {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("elementInternal", "element.m_pT")).f("_etag");
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "Layout::ContainerBox"
            },
            fullname: "ContentBoxWidth",
            shortname: "w",
            html: function() {
                return this.f("borderBoxModel.ContentBox.Width", "contentBoxWidth");
            }
        },

        {
            fullType: {
                module: MSHTML.Module,
                type: "Layout::ContainerBox"
            },
            fullname: "ContentBoxHeight",
            shortname: "h",
            html: function() {
                return this.f("borderBoxModel.ContentBox.Height", "contentBoxHeight");
            }
        },

        {
            fullType: {
                module: MSHTML.Module,
                type: "Layout::ContainerBox"
            },
            fullname: "LayoutPlacement",
            shortname: "lp",
            html: function() {
                var that = this;
                var ff = that.f("sourceStyle.fancyFormat")
                .then(null, function (err) {
                    return MSHTML.GetObjectFromThreadstateCache(
                        that.f("elementInternal"), 
                        "FancyFormat", 
                        that.f("sourceStyle.iFF").val()
                    );
                });
                return ff.then(function (ff) { return ff.f("_layoutPlacement"); })
            }
        },

        {
            fullType: {
                module: MSHTML.Module,
                type: "Layout::ContainerBox"
            },
            fullname: "DisplayNode",
            shortname: "d",
            html: function() {
                // Check if it's been extracted...
                var that = this;
                return this.f("isDisplayNodeExtracted").val()

                // If it hasn't been extracted, grab the rawDisplayNode...
                .then(function(isExtracted) { return isExtracted ? DbgObject.NULL : that.f("rawDisplayNode"); })
            }
        },

        {
            fullType: {
                module: MSHTML.Module,
                type: "Layout::ContainerBox"
            },
            fullname: "Validity",
            shortname: "validity",
            html: function(e) {
                return Promise.join([this.f("isLayoutInvalid").val(), this.f("isDisplayInvalid").val()])
                    .then(function(invalidBits) {
                        if (invalidBits[0]) {
                            // Layout is invalid.
                            e.style.backgroundColor = "#fbc";
                        } else if (invalidBits[1]) {
                            // Display is invalid.
                            e.style.backgroundColor = "#ffc";
                        } else {
                            // Box is valid.
                            e.style.backgroundColor = "#bfc";
                        }
                    });
            }
        },

        {
            fullType: {
                module: MSHTML.Module,
                type: "Layout::LineBox"
            },
            fullname: "Text",
            shortname: "text",
            html: function() {
                return Promise
                    .join([
                        this.f("textBlockRunIndexAtStartOfLine").val(), 
                        this.f("characterIndexInTextBlockRunAtStartOfLine").val(),
                        this.f("textBlockRunIndexAfterLine").val(),
                        this.f("characterIndexInTextBlockRunAfterLine").val(),
                        this.f("textBlockOrNode", "textBlock.m_pT")
                    ])
                    .then(function(fields) {
                        // Unpack the fields we just retrieved.
                        var runIndexAtStartOfLine = fields[0];
                        var characterIndexInTextBlockRunAtStartOfLine = fields[1];
                        var runIndexAfterLine = fields[2];
                        var characterIndexInTextBlockRunAfterLine = fields[3];
                        var textBlock = fields[4];

                        // Helper function to convert a text run to an HTML fragment.
                        function convertTextRunToHTML(textRun, runIndex, runArrayLength) {
                            // Get some fields from the text run...
                            return Promise
                            .join([
                                textRun.f("_cchOffset").val(),
                                textRun.f("_cchRunLength").val(),
                                textRun.f("_fHasTextTransformOrPassword").val()
                            ])
                            // Get the text data...
                            .then(function(textRunFields) {
                                var offset = textRunFields[0];
                                var textRunLength = textRunFields[1];
                                var textData;

                                if (textRunFields[2]) {
                                    textData = textRun.f("_characterSourceUnion._pchTransformedCharacters");
                                    offset = 0; // No offset when transformed.
                                } else {
                                    textData = textRun.f("_characterSourceUnion._pTextData").as("Tree::TextData").f("text", "_pText");
                                }

                                var stringLength = textRunLength;

                                if (runIndex == 0) {
                                    offset += characterIndexInTextBlockRunAtStartOfLine;
                                    stringLength -= characterIndexInTextBlockRunAtStartOfLine;
                                }

                                if (runIndexAfterLine >= 0 && runIndex == (runArrayLength - 1)) {
                                    stringLength -= (textRunLength - characterIndexInTextBlockRunAfterLine);
                                }

                                // Get the text as numbers...
                                return textData.idx(offset).array(stringLength)

                                // and convert it to an HTML fragment.
                                .then(function(characterArray) {
                                    return characterArray.map(function(x) { return "&#" + x + ";"; }).join("");  
                                })
                            })
                        }

                        // Get the text.
                        if (!textBlock.isNull() && runIndexAtStartOfLine >= 0) {
                            // Get the TextBlockRuns...
                            return textBlock.f("_aryRuns").array()

                            // Get an array of HTML fragments...
                            .then(function (runArray) {
                                // Only consider runs within the scope of the line.
                                runArray = runArray.slice(runIndexAtStartOfLine, runIndexAfterLine < 0 ? undefined : runIndexAfterLine + 1);

                                // Map each run to a string.
                                return Promise.map(
                                    runArray,
                                    function(run, runIndex) {
                                        // Get the run type...
                                        return run.f("_runType").as("Tree::TextBlockRunTypeEnum").desc()

                                        // If it's a CharacterRun, get the text it represents.  Otherwise return a placeholder.
                                        .then(function(runType) {
                                            if (runType == "CharacterRun") {
                                                // Get the text run...
                                                return run.f("_u._pTextRun")

                                                // and get the characters in the text run.
                                                .then(function(textRun) { return convertTextRunToHTML(textRun, runIndex, runArray.length); })

                                            } else {
                                                // Return a placeholder for the other run type.
                                                return "</em><strong>[" + runType + "]</strong><em>"
                                            }
                                        })
                                    }
                                );
                            })

                            // Join the fragments together.
                            .then(function(htmlFragments) {
                                return "<em>" + htmlFragments.join("") + "</em>";
                            })
                        } else {
                            return "";
                        }
                    });
            }
        }
    ];

    BoxTree = {
        Name: "BoxTree",
        RootType: "LayoutBox",
        DefaultFieldType: {
            module: "edgehtml",
            type: "Layout::LayoutBox"
        },
        BuiltInFields: builtInFields
    };
});
