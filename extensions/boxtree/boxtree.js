"use strict";

// boxtree.js
// Peter Salas
//
// LayoutBox tree visualization.
//
// This file has the mshtml-specific logic for constructing a box tree.  The methods that new types implement are
//  - typename -> string               [a name that identifies the type]
//  - collectChildren(array) -> void   [adds children to the given array]
//
// These types also act as backing nodes drawn by widetree/talltree.js, which means that LayoutBox implements
//  - getChildren -> array of backing nodes
//  - createRepresentation -> dom element
var BoxTree = (function() {
    var BoxCache = {};
    var BoxTypes = {};
    var FieldTypeMap = {};

    function createBoxTree(pointer) {
        if (pointer) {
            var box = new DbgObject("mshtml", "Layout::LayoutBox", pointer);
            BoxCache = {};
            return CreateBox(box);
        }

        return null;
    }

    function getRootLayoutBoxes() {
        return Promise.map(MSHTML.GetRootCTreeNodes(), MSHTML.GetFirstAssociatedLayoutBoxFromCTreeNode)
            .then(function(layoutBoxes) {
                return layoutBoxes
                    .filter(function(box) { return !box.isNull(); })
                    .map(function(box) { return box.ptr(); });
            })
            .then(function(boxPtrs) {
                if (boxPtrs.length == 0) {
                    return Promise.fail();
                } else {
                    return boxPtrs;
                }
            })
            .then(
                function(results) { return results; },
                function() {
                    return Promise.fail("No root CTreeNodes with LayoutBoxes were found. Possible reasons:<ul><li>The debuggee is not IE 11.</li><li>No page is loaded.</li><li>The docmode is < 8.</li><li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li><li>Symbols aren't available.</li></ul>Refresh the page to try again, or specify a LayoutBox explicitly.");
                }
            );
    }

    function CreateBox(obj) {
        return Promise
            .join([Promise.as(obj), obj.vtable()])
            .then(function(objectAndVtable) {
                var obj = objectAndVtable[0];
                var type = objectAndVtable[1];

                if (obj.ptr() in BoxCache) {
                    return BoxCache[obj.ptr()];
                }

                if (type in BoxTypes) {
                    var result = new BoxTypes[type](obj, type);
                } else {
                    var result = new LayoutBox(obj, type);
                }

                BoxCache[obj.ptr()] = result;
                return result;
            });
    }

    function MapBoxType(typename, type) {
        BoxTypes[typename] = type;
    }

    function CreateBoxType(typename, superType) {
        // For the description, strip "Layout::" and strip the last "Box".
        var name = typename.substr("Layout::".length);
        var fieldName = name;
        var lastIndexOfBox = name.lastIndexOf("Box");
        name = name.substr(0, lastIndexOfBox) + name.substr(lastIndexOfBox + "Box".length);

        var newType = function(box, vtableType) {
            superType.call(this, box, vtableType);
            this.box = this.box.as(typename);
        }
        newType.prototype = Object.create(superType.prototype);
        newType.prototype.typename = function() { return name; }
        newType.super = superType;
        newType.prototype.rawTypename = typename;

        MapBoxType(typename, newType);
        FieldTypeMap[fieldName] = newType;
        return newType;
    }

    function LayoutBox(box, vtableType) {
        this.box = box;
        this.childrenPromise = null;
        this.vtableType = vtableType;
    }
    FieldTypeMap["LayoutBox"] = LayoutBox;

    LayoutBox.prototype.typename = function() { return this.vtableType.replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    LayoutBox.prototype.collectChildren = function(children) { return Promise.as(children); }

    LayoutBox.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        element.innerHTML = "<p>" + this.typename() + "</p> <p>" + this.box.ptr() + "</p> ";
        return FieldSupport.RenderFields(this, this.box, element);
    }
    LayoutBox.prototype.getChildren = function() {
        if (this.childrenPromise == null) {
            var children = [];
            this.childrenPromise = Promise.map(this.collectChildren(children), CreateBox);
        }
        return this.childrenPromise;
    }

    var ContainerBox = CreateBoxType("Layout::ContainerBox", LayoutBox);
    ContainerBox.prototype.collectChildren = function(children) {
        var that = this;
        return ContainerBox.super.prototype.collectChildren.call(this, children)
            .then(function() {
                return that.box.f("PositionedItems.firstItem.m_pT");
            })
            .then(function(firstItem) {
                if (!firstItem.isNull()) {
                    function collectItemAndAdvance(item) {
                        // Check the vtable...
                        return item.vtable()
                            // If its a PositionedBoxItem, collect it and advance to the next...
                            .then(function(vtable) {
                                if (vtable == "Layout::PositionedBoxItem") {
                                    var childBox = item.as("Layout::PositionedBoxItem").f("flowItem").latestPatch().f(".data.boxReference.m_pT");
                                    children.push(childBox);
                                }

                                return item.f("next.m_pT");                                
                            })
                            // If we're back at the first item, we're done.  Otherwise collect the rest.
                            .then(function(nextItem) {
                                if (!nextItem.equals(firstItem)) {
                                    return collectItemAndAdvance(nextItem);
                                } else {
                                    return children;
                                }
                            })
                    }

                    return collectItemAndAdvance(firstItem);
                } else {
                    return children;
                }
            })
    }

    var FlowBox = CreateBoxType("Layout::FlowBox", ContainerBox);
    FlowBox.collectChildrenInFlow = function(flow, children) {
        return Promise.as(flow)
            .then(function(initialFlowItem) {
                if (!initialFlowItem.isNull()) {
                    function collectFlowItemAndAdvance(flowItem) {
                        flowItem = flowItem.latestPatch();
                        children.push(flowItem.f("data.boxReference.m_pT"));
                        return flowItem.f("data.next")
                            .then(function(nextFlowItem) {
                                if (!nextFlowItem.equals(initialFlowItem)) {
                                    return collectFlowItemAndAdvance(nextFlowItem);
                                } else {
                                    return children;
                                }
                            });
                    }

                    return collectFlowItemAndAdvance(initialFlowItem);
                } else {
                    return children;
                }
            });
    }
    FlowBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the superclass...
        return FlowBox.super.prototype.collectChildren.call(this, children)
            // Collect flow items...
            .then(function() {
                return FlowBox.collectChildrenInFlow(that.box.f("flow"), children)
            })
            // Get the floater array DbgObject...
            .then(function() {
                return that.box.f("geometry._array");
            })
            // Get the array of floaters...
            .then(function(floaterArrayObj) {
                if (!floaterArrayObj.isNull()) {
                    return floaterArrayObj.array(floaterArrayObj.as("int").idx(-1).val());
                } else {
                    return [];
                }
            })
            // Add the floaters and return the children.
            .then(function(floaters) {
                floaters.forEach(function(floater) {
                    var box = floater.f("floaterBoxReference.m_pT").latestPatch().f(".data.BoxReference.m_pT");
                    children.push(box);
                });

                return children;
            })
    }

    var TableBox = CreateBoxType("Layout::TableBox", ContainerBox);
    TableBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the superclass...
        return TableBox.super.prototype.collectChildren.call(this, children)
            // and collect the flow items.
            .then(function() {
                return FlowBox.collectChildrenInFlow(that.box.f("flow"), children);
            })
    }


    var TableGridBox = CreateBoxType("Layout::TableGridBox", ContainerBox);
    TableGridBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the superclass...
        return TableGridBox.super.prototype.collectChildren.call(this, children)
            // Collect fragmented cell contents...
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("fragmentedCellContents"), children); })

            // Collect collapsed cells...
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("collapsedCells"), children); })

            // And collect the cell boxes from the rows.
            .then(function() {
                function collectCellsFromRowLayoutAndAdvance(rowLayoutPromise) {
                    return rowLayoutPromise
                        .then(function(rowLayout) {
                            if (rowLayout.isNull()) {
                                // All done.
                                return children;
                            }
                            
                            // Get the columns DbgObject...
                            return rowLayout.f("Columns.m_pT")
                                // Get the columns array...
                                .then(function(columnsObj) {
                                    if (!columnsObj.isNull()) {
                                        return columnsObj.latestPatch().f("data.Array.data").array(columnsObj.f("data.Array.length").val());
                                    } else {
                                        return [];
                                    }
                                })
                                // Collect the box references...
                                .then(function(columns) {
                                    return Promise.map(columns, function(column) {
                                        // Get the box...
                                        return column.f("cellBoxReference.m_pT")
                                            // If the box isn't null, add it to the children.
                                            .then(function(box) {
                                                if (!box.isNull()) {
                                                    children.push(box);
                                                }
                                            });
                                    });
                                })
                                // And look at the remaining TableRowLayouts.
                                .then(function() {
                                    return collectCellsFromRowLayoutAndAdvance(rowLayout.f("nextRowLayout.m_pT"));
                                })
                        })
                }

                return collectCellsFromRowLayoutAndAdvance(that.box.f("firstRowLayout.m_pT"));
            });
    }

    var GridBox = CreateBoxType("Layout::GridBox", ContainerBox);
    GridBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the superclass...
        return GridBox.super.prototype.collectChildren.call(this, children)
            // Get the GridBoxItemsArray DbgObject...
            .then(function() {
                return that.box.f("Items.m_pT");
            })
            // Get the items in the array...
            .then(function(gridBoxItemsArrayObj) {
                if (!gridBoxItemsArrayObj.isNull()) {
                    return gridBoxItemsArrayObj.latestPatch().f("data.Array.data").array(gridBoxItemsArrayObj.f("data.Array.length").val())
                } else {
                    return [];
                }
            })
            // Map each item to the box reference...
            .then(function(gridBoxItems) {
                return Promise.map(gridBoxItems, function(item) { return item.f("BoxReference.m_pT"); });
            })
            // Filter null boxes and add them to the children array.
            .then(function(itemBoxes) {
                itemBoxes
                    .filter(function(box) { return !box.isNull(); })
                    .forEach(function(box) { children.push(box); });
                return children;
            });
    }

    var FlexBox = CreateBoxType("Layout::FlexBox", ContainerBox);
    FlexBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the super class...
        return FlexBox.super.prototype.collectChildren.call(this, children)
            // And collect the flow items.
            .then(function() {
                return FlowBox.collectChildrenInFlow(that.box.f("flow"), children);
            })
    }

    var MultiFragmentBox = CreateBoxType("Layout::MultiFragmentBox", ContainerBox);
    var MultiColumnBox = CreateBoxType("Layout::MultiColumnBox", MultiFragmentBox);
    MultiColumnBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the super class...
        return MultiColumnBox.super.prototype.collectChildren.call(this, children)
            // Get the items array DbgObject...
            .then(function() {
                return that.box.f("items.m_pT");
            })
            // Get the items...
            .then(function(itemsArrayObj) {
                if (!itemsArrayObj.isNull()) {
                    return itemsArrayObj.latestPatch().f("data.Array.data").array(that.box.f("itemsCount").val())
                } else {
                    return [];
                }
            })
            // And collect the box references.
            .then(function(items) {
                items.forEach(function(item) { children.push(item.f("BoxReference.m_pT")); });
                return children;
            });
    }

    var LineBox = CreateBoxType("Layout::LineBox", LayoutBox);
    LineBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the super class...
        return LineBox.super.prototype.collectChildren.call(this, children)
            // Get the LineBox flags...
            .then(function() { return that.box.f("lineBoxFlags").val(); })

            // Get the first run if we might have inline blocks...
            .then(function(lineBoxFlags) {
                if ((lineBoxFlags & 0x8) > 0) {
                    return that.box.f("firstRun.m_pT");
                } else {
                    // No inline-blocks, so don't use a run.
                    return DbgObject.NULL;
                }
            })

            // Collect any inline-blocks from the run.
            .then(function(firstRun) {
                function collectInlineBlocksFromRunAndAdvance(run) {
                    if (!run.isNull()) {
                        // Get the vtable type...
                        return run.vtable()
                            // If it's an inline-block run, grab the inline block; then advance...
                            .then(function(type) {
                                if (type == "Layout::InlineBlockLineBoxRun" || 
                                    type == "Layout::InlineBlockWithBreakConditionLineBoxRun"
                                ) {
                                    var box = run.as("Layout::InlineBlockLineBoxRun").f("boxReference.m_pT");
                                    children.push(box);
                                }

                                // Advance to the next run.
                                return run.f("next.m_pT");
                            })
                            // And collect the rest of the inline-blocks.
                            .then(collectInlineBlocksFromRunAndAdvance);
                    } else {
                        // Run is null; all done.
                        return children;
                    }
                }

                return collectInlineBlocksFromRunAndAdvance(firstRun);
            })
    }

    MapBoxType("Layout::LineBoxCompactShort", LineBox)
    MapBoxType("Layout::LineBoxCompactInteger", LineBox)
    MapBoxType("Layout::LineBoxFullInteger", LineBox)
    MapBoxType("Layout::LineBoxFullIntegerWithVisibleBounds", LineBox)
    MapBoxType("Layout::LineBoxFullShort", LineBox)

    var ReplacedBox = CreateBoxType("Layout::ReplacedBox", ContainerBox);

    var ReplacedBoxIFrame = CreateBoxType("Layout::ReplacedBoxIFrame", ReplacedBox);
    ReplacedBoxIFrame.prototype.collectChildren = function(children) {
        var that = this;
        return ReplacedBoxIFrame.super.prototype.collectChildren.call(this, children)
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("flow"), children); })
    }

    var ReplacedBoxCLayout = CreateBoxType("Layout::ReplacedBoxCLayout", ReplacedBox);
    var ReplacedBoxCOleLayout = CreateBoxType("Layout::ReplacedBoxCOleLayout", ReplacedBoxCLayout);

    var ReplacedBoxNative = CreateBoxType("Layout::ReplacedBoxNative", ReplacedBox);

    var ReplacedBoxNativeImage = CreateBoxType("Layout::ReplacedBoxNativeImage", ReplacedBoxNative);
    var ReplacedBoxNativeGeneratedImage = CreateBoxType("Layout::ReplacedBoxNativeGeneratedImage", ReplacedBoxNative);
    var ReplacedBoxNativeMSWebView = CreateBoxType("Layout::ReplacedBoxNativeMSWebView", ReplacedBoxNative);
    var ReplacedBoxNativeCheckBoxValue = CreateBoxType("Layout::ReplacedBoxNativeCheckBoxValue", ReplacedBoxNative);
    var ReplacedBoxNativeComboBoxValue = CreateBoxType("Layout::ReplacedBoxNativeComboBoxValue", ReplacedBoxNative);
    var ReplacedBoxNativeInputFileAction = CreateBoxType("Layout::ReplacedBoxNativeInputFileAction", ReplacedBoxNative);

    var BoxContainerBox = CreateBoxType("Layout::BoxContainerBox", ReplacedBox);
    BoxContainerBox.prototype.collectChildren = function(children) {
        var that = this;
        return BoxContainerBox.super.prototype.collectChildren.call(this, children)
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("flowItem"), children); })
    }
    var PageFrameBox = CreateBoxType("Layout::PageFrameBox", BoxContainerBox);


    var SvgCssContainerBox = CreateBoxType("Layout::SvgCssContainerBox", ContainerBox);
    SvgCssContainerBox.prototype.collectChildren = function(children) {
        var that = this;
        return SvgCssContainerBox.super.prototype.collectChildren.call(this, children)
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("firstSvgItem"), children); })
    }

    var SvgBox = CreateBoxType("Layout::SvgBox", LayoutBox);

    var SvgContainerBox = CreateBoxType("Layout::SvgContainerBox", SvgBox);
    SvgContainerBox.prototype.collectChildren = function(children) {
        var that = this;
        return SvgContainerBox.super.prototype.collectChildren.call(this, children)
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("firstSvgItem"), children); })
    }

    var SvgTextBox = CreateBoxType("Layout::SvgTextBox", SvgBox);
    SvgTextBox.prototype.collectChildren = function(children) {
        var that = this;
        return SvgTextBox.super.prototype.collectChildren.call(this, children)
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("flow"), children); })
    }

    var SvgPrimitiveBox = CreateBoxType("Layout::SvgPrimitiveBox", SvgBox);
    var SvgLinePrimitiveBox = CreateBoxType("Layout::SvgLinePrimitiveBox", SvgPrimitiveBox);
    var SvgImagePrimitiveBox = CreateBoxType("Layout::SvgImagePrimitiveBox", SvgPrimitiveBox);
    var SvgGeometryBox = CreateBoxType("Layout::SvgGeometryBox", SvgPrimitiveBox);
    var SvgLineBox = CreateBoxType("Layout::SvgLineBox", LineBox);

    var builtInFields = [
        {
            type: "ContainerBox",
            fullname: "CTreeNode",
            shortname: "tn",
            html: function() {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("element.m_pT")).ptr()
                    .then(function(ptr) {
                        return "<a href='/markuptree/#" + ptr + "' target='markuptree'>" + ptr + "</a>";
                    })
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
                    .then(function(tag) { return tag.substr("ETAG_".length); });
            }
        },
        {
            type: "ContainerBox",
            fullname: "ContentBoxWidth",
            shortname: "w",
            html: function() {
                return this.f("contentBoxWidth").val()
                    .then(function(width) { return width / 100 + "px"; });
            }
        },

        {
            type: "ContainerBox",
            fullname: "ContentBoxHeight",
            shortname: "h",
            html: function() {
                return this.f("contentBoxHeight").val()
                    .then(function(height) { return height / 100 + "px"; });
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
                          .then(function(lp) { return lp.substr("LayoutPlacementEnum_".length); });
            }
        },

        {
            type: "ContainerBox",
            fullname: "DisplayNode",
            shortname: "d",
            html: function() {
                // Check if it's been extracted...
                var that = this;
                return this.f("isDisplayNodeExtracted").val()
                    // If it hasn't been extracted, grab the rawDisplayNode...
                    .then(function(isExtracted) { return isExtracted ? DbgObject.NULL : that.f("rawDisplayNode"); })

                    // and return the HTML.
                    .then(function(dispNode) {
                        if (!dispNode.isNull()) {
                            return "<a href='/displaytree/#" + dispNode.ptr() + "' target='displaytree'>" + dispNode.ptr() + "</a>" 
                        } else {
                            return "null";
                        }
                    })
            }
        },

        {
            type: "ContainerBox",
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
            type: "LineBox",
            fullname: "Text",
            shortname: "text",
            html: function() {
                return Promise
                    .join([
                        this.f("textBlockRunIndexAtStartOfLine").val(), 
                        this.f("characterIndexInTextBlockRunAtStartOfLine").val(),
                        this.f("textBlockRunIndexAfterLine").val(),
                        this.f("characterIndexInTextBlockRunAfterLine").val(),
                        this.f("textBlock.m_pT")
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
                                    textData = textRun.f("_characterSourceUnion._pTextData._pText");
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
                            return textBlock.f("_aryRuns._pv").as("Tree::TextBlockRun*").array(textBlock.f("_aryRuns._c").val())

                            // Get an array of HTML fragments...
                            .then(function (runArray) {
                                // Only consider runs within the scope of the line.
                                runArray = runArray.slice(runIndexAtStartOfLine, runIndexAfterLine < 0 ? undefined : runIndexAfterLine);

                                // Map each run to a string.
                                return Promise.map(
                                    runArray,
                                    function(run, runIndex) {
                                        // Get the run type...
                                        return run.f("_runType").as("Tree::TextBlockRunTypeEnum").constant()

                                        // If it's a CharacterRun, get the text it represents.  Otherwise return a placeholder.
                                        .then(function(runType) {
                                            runType = runType.substr("TextBlockRunTypeEnum_".length);
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
                                return htmlFragments.join("");
                            })
                        } else {
                            return "";
                        }
                    });
            }
        }
    ];

    return {
        Name: "BoxTree",
        BasicType: "LayoutBox",
        BuiltInFields: builtInFields,
        TypeMap: FieldTypeMap,
        Create: createBoxTree,
        Roots: getRootLayoutBoxes
    };
})();
