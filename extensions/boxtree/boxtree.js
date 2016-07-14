"use strict";

var BoxTree = undefined;
Loader.OnLoad(function() {
    BoxTree = {
        Tree: new TreeReader.DbgObjectTreeReader(new TreeReader.ObjectTreeReader()),
        Renderer: new DbgObjectTreeRenderer(),
        InterpretAddress: function(address) {
            return new DbgObject(MSHTML.Module, "Layout::LayoutBox", address).vcast();
        },
        GetRoots: function() {
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
        },
        DefaultTypes: [
            { module: MSHTML.Module, type: "Layout::ContainerBox" },
            { module: MSHTML.Module, type: "Layout::LayoutBox" },
            { module: MSHTML.Module, type: "Layout::LineBox" },
        ]
    };

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
        })
        .then(function (results) {
            return results.filter(function (object) { return !object.isNull(); });
        })
    }

    // Add actions to link LayoutBoxes, CMarkups, and CDocs to the box tree.
    DbgObject.AddAction(MSHTML.Module, "Layout::LayoutBox", "BoxTree", function(box) {
        return box.vcast().F("TreeNode.Markup.Doc.PrimaryMarkup.Root")
        .then(function (rootNode) {
            return MSHTML.GetFirstAssociatedLayoutBoxFromCTreeNode(rootNode)
            .then(function (layoutBox) {
                if (layoutBox.isNull()) {
                    return box;
                } else {
                    return layoutBox;
                }
            })
        }, function (err) {
            return box;
        })
        .then(function (rootBox) {
            return TreeInspector.GetActions("boxtree", "Box Tree", rootBox, box);
        })
    });
    DbgObject.AddAction(MSHTML.Module, "CMarkup", "BoxTree", function(markup) { return MSHTML.GetFirstAssociatedLayoutBoxFromCTreeNode(markup.f("root").as("CTreeNode")).actions("BoxTree"); })
    DbgObject.AddAction(MSHTML.Module, "CDoc", "BoxTree", function(doc) { return doc.F("PrimaryMarkup").actions("BoxTree"); })

    
    // Define the BoxTree linkage.
    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::ContainerBox", function (object) {
        return collectChildrenInPositionedItems(object.f("PositionedItems"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::InlineLayout", function (object) {
        return collectChildrenInPositionedItems(object.f("positionedItems"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::FlowBox", function (object) {
        // Collect static flow.
        return collectChildrenInFlow(object.f("flow"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::FlowBox", function (object) {
        // Collect floaters.
        return object.f("geometry").array("Items")
            .f("floaterBoxReference.m_pT")
            .latestPatch()
            .f("data.BoxReference.m_pT")
            .vcast();
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::TableBox", function (object) {
        return collectChildrenInFlow(object.f("items", "flow"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::TableGridBox", function (object) {
        return collectChildrenInFlow(object.f("fragmentedCellContents"))
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::TableGridBox", function (object) {
        return collectChildrenInFlow(object.f("collapsedCells")).then(null, function() { return []; });
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::TableGridBox", function (object) {
        return object.f("firstRowLayout.m_pT")
        .list("nextRowLayout.m_pT")
            .f("Columns.m_pT").latestPatch()
        .map(function(columns) {
            return columns.array("Items")
                .f("cellBoxReference.m_pT").vcast()
        })
        .then(function (arrayOfArrays) {
            return arrayOfArrays.reduce(function(a, b) { return a.concat(b); }, []);
        })
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::GridBox", function (object) {
        return object.f("Items.m_pT").latestPatch().array("Items").f("BoxReference.m_pT").vcast()
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::FlexBox", function (object) {
        return object.f("items", "flow")
        .then(function (items) {
            if (items.typeDescription().indexOf("FlexBoxItemArray") != -1) {
                return items.f("m_pT").latestPatch().array("Items").f("BoxReference.m_pT").vcast();
            } else if (items.typeDescription() == "Layout::BoxItem") {
                return collectChildrenInFlow(items);
            } else if (items.typeDescription() == "SArray<Layout::FlexBox::SFlexBoxItem>") {
                return collectChildrenInFlow(object.f("flow"));
            } else {
                throw new Error("Unexpected FlexBox child typename: " + items.typeDescription());
            }
        })
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::MultiColumnBox", function (object) {
        return object.f("items.m_pT").latestPatch().array("Items").f("BoxReference.m_pT").vcast();
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::LineBox", function(object) {
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

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::ReplacedBoxIFrame", function (object) {
        return collectChildrenInFlow(object.f("replacedViewport", "flow"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::BoxContainerBox", function (object) {
        return collectChildrenInFlow(object.f("boxItem", "flowItem"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::SvgCssContainerBox", function (object) {
        return collectChildrenInFlow(object.f("firstSvgItem", "firstChildItem"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::SvgContainerBox", function (object) {
        return collectChildrenInFlow(object.f("firstSvgItem", "firstChildItem"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::SvgTextBox", function (object) {
        return collectChildrenInFlow(object.f("flow"));
    });

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::LayoutBox", "AsContainerBox", "Layout::ContainerBox", UserEditableFunctions.Create(function (box) {
        return box.dcast("Layout::ContainerBox");
    }))

    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::ContainerBox", "Validity", false, UserEditableFunctions.Create(function (dbgObject, e) {
        return Promise.join([dbgObject.f("isLayoutInvalid").val(), dbgObject.f("isDisplayInvalid").val()])
        .then(function(invalidBits) {
            if (invalidBits[0]) {
                // Layout is invalid.
                e.style.backgroundColor = "#fbc";
                return "Layout Invalid";
            } else if (invalidBits[1]) {
                // Display is invalid.
                e.style.backgroundColor = "#ffc";
                return "Display Invalid";
            } else {
                // Box is valid.
                e.style.backgroundColor = "#bfc";
                return "Valid";
            }
        });
    }))

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::ContainerBox", "TreeNode", "CTreeNode", UserEditableFunctions.Create(function (containerBox) {
        return containerBox.f("elementInternal", "element.m_pT").F("TreeNode");
    }));

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::SvgBox", "TreeNode", "CTreeNode", UserEditableFunctions.Create(function (containerBox) {
        return containerBox.f("elementInternal", "element.m_pT").F("TreeNode");
    }));

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::ContainerBox", "FancyFormat", "CFancyFormat", UserEditableFunctions.Create(function (containerBox) {
        return MSHTML.GetObjectFromDataCache(containerBox.F("TreeNode.Threadstate").f("_pFancyFormatCache"), containerBox.f("sourceStyle").f("iFF", "_iFF").val());
    }));

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::ContainerBox", "CharFormat", "CCharFormat", UserEditableFunctions.Create(function (containerBox) {
        return MSHTML.GetObjectFromDataCache(containerBox.F("TreeNode.Threadstate").f("_pCharFormatCache"), containerBox.f("sourceStyle").f("iCF", "_iCF").val());
    }));

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::ContainerBox", "ParaFormat", "CParaFormat", UserEditableFunctions.Create(function (containerBox) {
        return MSHTML.GetObjectFromDataCache(containerBox.F("TreeNode.Threadstate").f("_pParaFormatCache"), containerBox.f("sourceStyle").f("iPF", "_iPF").val());
    }));

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::ContainerBox", "SvgFormat", "CSvgFormat", UserEditableFunctions.Create(function (containerBox) {
        return MSHTML.GetObjectFromDataCache(containerBox.F("TreeNode.Threadstate").f("_pSvgFormatCache"), containerBox.f("sourceStyle").f("iSF", "_iSF").val());
    }));

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::ContainerBox", "DisplayNode", "CDispNode", UserEditableFunctions.Create(function (containerBox) {
        return Promise.join([containerBox.f("isDisplayNodeExtracted").val(), containerBox.f("rawDisplayNode")])
        .then(function (results) {
            if (!results[0]) {
                return results[1];
            } else {
                return new DbgObject(MSHTML.Module, "CDispNode", 0);
            }
        })
    }));

    DbgObject.AddArrayField(MSHTML.Module, "Layout::BoxItem", "Items", "Layout::BoxItemDataMembers", UserEditableFunctions.Create(function (flowItem) {
        return flowItem.latestPatch().f("data").list(function (current) {
            return current.f("next").latestPatch().f("data");
        })
    }));

    DbgObject.AddArrayField(MSHTML.Module, "Layout::FlowBox", "FlowItems", "Layout::BoxItemDataMembers", UserEditableFunctions.Create(function (flowBox) {
        return flowBox.f("flow").array("Items");
    }));

    DbgObject.AddArrayField(MSHTML.Module, "Layout::LineBox", "Runs", "Layout::LineBox::SRenderSafeTextBlockRunAndCp", UserEditableFunctions.Create(function (lineBox) {
        return lineBox.vcast().f("Runs").array(lineBox.f("numberOfRuns"));
    }));

    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::LineBox", "Text", false, UserEditableFunctions.Create(function (lineBox) {
        return Promise
        .join([
            lineBox.f("textBlockRunIndexAtStartOfLine").val(), 
            lineBox.f("charOffsetInTextBlockRunAtStartOfLine", "characterIndexInTextBlockRunAtStartOfLine").val(),
            lineBox.f("textBlockRunIndexAfterLine").val(),
            lineBox.f("charOffsetInTextBlockRunAfterLine", "characterIndexInTextBlockRunAfterLine").val(),
            lineBox.f("textBlock", "textBlockOrNode", "textBlock.m_pT")
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
                    return textData.idx(offset).vals(stringLength)

                    // and convert it to an HTML fragment.
                    .then(function(characterArray) {
                        return characterArray.map(function(x) { return "&#" + x + ";"; }).join("");  
                    })
                })
            }

            // Get the text.
            if (!textBlock.isNull() && runIndexAtStartOfLine >= 0) {
                // Get the TextBlockRuns...
                return textBlock.f("_aryRuns").array("Items")

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
    }));
});
