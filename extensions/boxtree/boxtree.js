"use strict";

var BoxTree = undefined;
Loader.OnLoad(function() {
    BoxTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            return DbgObject.create(MSHTML.Module, "Layout::LayoutBox", address).vcast();
        },
        GetRoots: function() {
            // Sort by the _ulRefs of the CDoc as a proxy for interesting-ness.
            return Promise.sort(
                MSHTML.GetCDocs(),
                function (doc) {
                    return doc.f("_ulRefs").val().then(function (v) { return 0 - v; });
                }
            )
            .then(function (cdocs) {
                // In addition to CDocs with viewboxes, we also want each of the non-primary boxes.
                return Promise.map(cdocs, function (doc) {
                    return doc.f("_view._pFlow").f("data.boxReference.m_pT")
                    .then(function (viewBox) {
                        return Promise.filter(doc.F("PrimaryMarkup.Root").array("LayoutBoxes"), function (box) { return !box.equals(viewBox); })
                        .then(function (nonViewBoxes) {
                            if (!viewBox.isNull()) {
                                return [doc].concat(nonViewBoxes);
                            } else {
                                return nonViewBoxes;
                            }
                        })
                    })
                });
            })
            .then(function(boxes) {
                var flattenedArray = boxes.reduce(function (a, b) { return a.concat(b); }, []);
                if (flattenedArray.length == 0) {
                    return Promise.reject();
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
                return Promise.reject(errorMessage);
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
        .list("data.next")
            .f("data.boxReference.m_pT")
            .vcast();
    }

    function collectChildrenInPositionedItems(positionedItemsList) {
        return positionedItemsList.f("firstItem.m_pT").list("next.m_pT")
        .vcast()
        .map(function (listItem) {
            if (listItem.typeDescription() == "Layout::PositionedBoxItem") {
                return listItem.f("boxItem", "flowItem").f("data.boxReference.m_pT").vcast();
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
        return box.vcast().f("isAttachedToBuilder").val()
        .then(null, function () { return false; })
        .then(function (isAttachedToBuilder) {
            if (!isAttachedToBuilder) {
                return box.vcast().F("TreeNode.Markup.Doc")
                .then(null, function (err) { return box; })
                .then(function (root) {
                    return TreeInspector.GetActions("boxtree", "Box Tree", root, box);
                })
            } else {
                return box.vcast().f("builder").actions("BoxTree");
            }
        })
    });
    DbgObject.AddAction(MSHTML.Module, "CMarkup", "BoxTree", function(markup) { 
        return TreeInspector.GetActions("boxtree", "Box Tree", markup.F("Doc"), MSHTML.GetFirstAssociatedLayoutBoxFromCTreeNode(markup.f("root").as("CTreeNode")));
    })
    DbgObject.AddAction(MSHTML.Module, "CDoc", "BoxTree", function(doc) {
        return TreeInspector.GetActions("boxtree", "Box Tree", doc);
    })
    DbgObject.AddAction(MSHTML.Module, "CView", "BoxTree", function(view) {
        return TreeInspector.GetActions("boxtree", "Box Tree", view.unembed("CDoc", "_view"), view);
    })

    DbgObject.AddAction(MSHTML.Module, "Layout::LayoutBoxBuilder", "BoxTree", function(builder) {
        return builder.list("parentBuilder.m_pT").f("boxReference.m_pT")
        .then(function (boxReferences) {
            // Use the top-most box as the root.
            var firstBox = boxReferences[0];
            var lastBox;
            do {
                lastBox = boxReferences.pop();
            } while (lastBox.isNull());

            return TreeInspector.GetActions("boxtree", "Box Tree", lastBox, firstBox);
        })
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "CDoc", function (object) {
        return object.f("_view");
    })

    BoxTree.Renderer.addNameRenderer(MSHTML.Module, "CDoc", function (doc) {
        return doc.F("PrimaryMarkup").desc("URL")
        .then(function (url) {
            if (url != null) {
                return "CDoc (" + url + ")"
            } else {
                return "CDoc";
            }
        })
    })

    BoxTree.Tree.addChildren(MSHTML.Module, "CView", function (object) {
        return object.f("_pFlow").f("data.boxReference.m_pT").vcast();
    })
    
    // Define the BoxTree linkage.
    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::ContainerBox", function (object) {
        return collectChildrenInPositionedItems(object.f("PositionedItems"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::InlineLayout", function (object) {
        return collectChildrenInPositionedItems(object.f("positionedItems"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::InlineLayoutDisplayClient", function (object) {
        return collectChildrenInPositionedItems(object.f("positionedItems"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::FlowBox", function (object) {
        // Collect static flow.
        return collectChildrenInFlow(object.f("flow"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::InlineBox", function (object) {
        return collectChildrenInFlow(object.f("firstItem"));
    })
    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::FlowBox", function (object) {
        // Collect floaters.
        return object.f("geometry").f("m_pT", "").array("Items")
            .f("floaterBoxReference.m_pT")
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
            .f("Columns.m_pT")
        .map(function(columns) {
            return columns.array("Items")
                .f("cellBoxReference.m_pT").vcast()
        })
        .then(function (arrayOfArrays) {
            return arrayOfArrays.reduce(function(a, b) { return a.concat(b); }, []);
        })
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::GridBox", function (object) {
        return object.f("Items.m_pT").array("Items").f("BoxReference.m_pT").vcast()
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::FlexBox", function (object) {
        return object.f("items", "flow")
        .then(function (items) {
            if (items.typeDescription().indexOf("FlexBoxItemArray") != -1) {
                return items.f("m_pT").array("Items").f("BoxReference.m_pT").vcast();
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
        return object.f("items.m_pT").array("Items").f("BoxReference.m_pT").vcast();
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
        return collectChildrenInFlow(object.f("firstChildItem", "firstSvgItem"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::SvgContainerBox", function (object) {
        return collectChildrenInFlow(object.f("firstChildItem", "firstSvgItem"));
    });

    BoxTree.Tree.addChildren(MSHTML.Module, "Layout::SvgTextBox", function (object) {
        return collectChildrenInFlow(object.f("flow"));
    });

    DbgObject.AddExtendedField(MSHTML.Module, "Layout::LayoutBox", "AsContainerBox", "Layout::ContainerBox", UserEditableFunctions.Create(function (box) {
        return box.dcast("Layout::ContainerBox");
    }))

    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::ContainerBox", "Validity", false, UserEditableFunctions.Create(function (dbgObject, e) {
        return Promise.all([dbgObject.f("isLayoutInvalid").val(), dbgObject.f("isDisplayInvalid").val()])
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
        return Promise.all([containerBox.f("isDisplayNodeExtracted").val(), containerBox.f("rawDisplayNode")])
        .thenAll(function (isDisplayNodeExtracted, displayNode) {
                if (!isDisplayNodeExtracted) {
                    return displayNode;
                } else {
                    return DbgObject.create(MSHTML.Module, "CDispNode", 0);
                }
            }
        );
    }));

    DbgObject.AddArrayField(MSHTML.Module, "CTreeNode", "LayoutBoxes", "Layout::LayoutBox", UserEditableFunctions.Create(function(treeNode) {
        return MSHTML.GetFirstAssociatedLayoutBoxFromCTreeNode(treeNode)
        .then(function (layoutBox) {
            return layoutBox.list(["nextLayoutBox", "associatedBoxLink"]);
        })
        .then(function (layoutBoxes) {
            return Promise.all(layoutBoxes.map(function (layoutBox) { return layoutBox.vcast(); }));
        })
    }));

    DbgObject.AddArrayField(MSHTML.Module, "Layout::BoxItem", "Items", "Layout::BoxItemDataMembers", UserEditableFunctions.Create(function (flowItem) {
        return flowItem.f("data").list(function (current) {
            return current.f("next").f("data");
        })
    }));

    DbgObject.AddArrayField(MSHTML.Module, "Layout::FlowBox", "FlowItems", "Layout::BoxItemDataMembers", UserEditableFunctions.Create(function (flowBox) {
        return flowBox.f("flow").array("Items");
    }));

    DbgObject.AddArrayField(MSHTML.Module, "Layout::LineBox", "Runs", "Layout::LineBox::SRunBoxAndCp", UserEditableFunctions.Create(function (lineBox) {
        return lineBox.vcast().f("runArray").array("Items");
    }));

    DbgObject.AddTypeDescription(MSHTML.Module, "Layout::LineBox", "Text", false, UserEditableFunctions.Create(function (lineBox) {
        return Promise.all([
            lineBox.f("textBlockRunIndexAtStartOfLine").val(), 
            lineBox.f("charOffsetInTextBlockRunAtStartOfLine", "characterIndexInTextBlockRunAtStartOfLine").val(),
            lineBox.f("textBlockRunIndexAfterLine").val(),
            lineBox.f("charOffsetInTextBlockRunAfterLine", "characterIndexInTextBlockRunAfterLine").val(),
            lineBox.f("textBlock", "textBlockOrNode", "textBlock.m_pT")
        ])
        .thenAll(function(runIndexAtStartOfLine, characterIndexInTextBlockRunAtStartOfLine, runIndexAfterLine, characterIndexInTextBlockRunAfterLine, textBlock) {
            // Helper function to convert a text run to an HTML fragment.
            function convertTextRunToHTML(textRun, runIndex, runArrayLength) {
                // Get some fields from the text run...
                return Promise.all([
                    textRun.f("_cchOffsetInTextData", "_cchOffset").val(),
                    textRun.f("_cchRunLength").val(),
                    textRun.f("_fHasTextTransformOrPassword").val()
                ])
                // Get the text data...
                .thenAll(function(offset, textRunLength, hasTextTransformOrPassword) {
                    var textData;
                    if (hasTextTransformOrPassword) {
                        textData = new PromisedDbgObject(textRun.f("_pTextData").f("text").then(null, function () { return textRun.f("_characterSourceUnion._pchTransformedCharacters") }));
                        offset = 0; // No offset when transformed.
                    } else {
                        textData = textRun.f("_pTextData", "_characterSourceUnion._pTextData").as("Tree::TextData").f("text", "_pText");
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
