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

    // Add a type description for LayoutBox to link to the BoxTree.
    DbgObject.AddTypeDescription("mshtml", "Layout::LayoutBox", function(box) {
        if (box.isNull()) {
            return "null";
        } else {
            return "<a href=\"/boxtree/#" + box.ptr() + "\">" + box.ptr() + "</a>";
        }
    });

    function createBoxTree(pointer) {
        if (pointer) {
            var box = new DbgObject("mshtml", "Layout::LayoutBox", pointer);
            BoxCache = {};
            return CreateBox(box);
        }

        return null;
    }

    function getRootLayoutBoxes() {
        return Promise.map(MSHTML.GetRootCTreeNodes(), function(treeNode) {
                return MSHTML.GetFirstAssociatedLayoutBoxFromCTreeNode(treeNode).as("Layout::ContainerBox").list("associatedBoxLink").ptr();
            })
            .then(function(boxPtrs) {
                var flattenedArray = [];
                boxPtrs.forEach(function (innerArray) {
                    flattenedArray = flattenedArray.concat(innerArray);
                });

                if (flattenedArray.length == 0) {
                    return Promise.fail();
                } else {
                    return flattenedArray;
                }
            })
            .then(
                function(results) { return results; },
                function(error) {
                    return Promise.fail("No root CTreeNodes with LayoutBoxes were found. Possible reasons:<ul><li>The debuggee is not IE 11.</li><li>No page is loaded.</li><li>The docmode is < 8.</li><li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li><li>Symbols aren't available.</li></ul>Refresh the page to try again, or specify a LayoutBox explicitly.");
                }
            );
    }

    function CreateBox(obj) {
        return Promise.as(obj)
        .then(function (obj) {
            if (!obj.isNull()) {
                return obj.vtable()
                .then(function (type) {
                    if (obj.ptr() in BoxCache) {
                        return new DuplicateBox(BoxCache[obj.ptr()]);
                    }

                    if (type in BoxTypes) {
                        var result = new BoxTypes[type](obj, type);
                    } else {
                        var result = new LayoutBox(obj, type);
                    }

                    BoxCache[obj.ptr()] = result;
                    return result;
                })
            } else {
                return new NullBox();
            }
        })
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

    // Since some boxes (e.g. floaters) can be in the tree multiple times, after we've seen
    // a given box once we'll proxy it with the duplicate box.
    function DuplicateBox(originalBox) {
        this.originalBox = originalBox;
    }
    DuplicateBox.prototype.createRepresentation = function() {
        return Promise.as(this.originalBox.createRepresentation())
        .then(function (element) {
            element.style.color = "grey";
            element.innerHTML = "<p>(DUPLICATE)</p> " + element.innerHTML;
            return element;
        });
    }
    DuplicateBox.prototype.getChildren = function() {
        return Promise.as([]);
    }

    // Sometimes a box has a null box reference, perhaps during building or otherwise.
    function NullBox() { }
    NullBox.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        element.innerHTML = "<p>NULL</p>";
        return Promise.as(element);
    }
    NullBox.prototype.getChildren = function() {
        return Promise.as([]);
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
            this.childrenPromise = Promise.as(this.collectChildren(children))
            .then(function () {
                return Promise.map(children, CreateBox);
            });
        }
        return this.childrenPromise;
    }

    var ContainerBox = CreateBoxType("Layout::ContainerBox", LayoutBox);
    ContainerBox.prototype.collectChildren = function(children) {
        var that = this;
        return ContainerBox.super.prototype.collectChildren.call(this, children)
        .then(function() {
            // Get the first item in the positioned item list...
            return that.box.f("PositionedItems.firstItem.m_pT")

            // collect all the items in the list...
            .list("next.m_pT")

            // vcast them...
            .vcast()

            // filter out anything that's not a PositionedBoxItem...
            .filter(function (listItem) {
                return listItem.typeDescription() == "Layout::PositionedBoxItem";
            })

            // get the box from each item...
            .f("boxItem", "flowItem").latestPatch().f("data.boxReference.m_pT")

            // and add them to the array.
            .forEach(function (box) {
                children.push(box);
            });
        })
    }

    var FlowBox = CreateBoxType("Layout::FlowBox", ContainerBox);
    FlowBox.collectChildrenInFlow = function(flow, children) {
        return flow
        .latestPatch()
        .list(function (flowItem) {
            return flowItem.f("data.next").latestPatch();
        })
        .f("data.boxReference.m_pT")
        .forEach(function(item) { 
            children.push(item); 
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
        .then(function() {
            return that.box.f("geometry")
            .array()
                .f("floaterBoxReference.m_pT").latestPatch().f("data.BoxReference.m_pT")
            .forEach(function(box) { children.push(box); });
        })
    }
    var FieldsetBox = CreateBoxType("Layout::FieldsetBox", FlowBox);

    var TableBox = CreateBoxType("Layout::TableBox", ContainerBox);
    TableBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the superclass...
        return TableBox.super.prototype.collectChildren.call(this, children)
        // and collect the flow items.
        .then(function() {
            return FlowBox.collectChildrenInFlow(that.box.f("items", "flow"), children);
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
                return that.box.f("firstRowLayout.m_pT")

                // Get the list of table row layouts, and for each of them...
                .list("nextRowLayout.m_pT")

                    // Get the columns array...
                    .f("Columns.m_pT").latestPatch()

                .map(function(columns) {
                    return columns
                    .array()
                        .f("cellBoxReference.m_pT")
                    .forEach(function (box) {
                        if (!box.isNull()) {
                            children.push(box);
                        }
                    });
                });
            });
    }

    var GridBox = CreateBoxType("Layout::GridBox", ContainerBox);
    GridBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the superclass...
        return GridBox.super.prototype.collectChildren.call(this, children)
            // Get the GridBoxItemsArray DbgObject...
            .then(function() {
                // Get the items array...
                return that.box.f("Items.m_pT").latestPatch()
                .array()
                    
                    // Map each item to the box reference...
                    .f("BoxReference.m_pT")

                // And add them to the children array.
                .forEach(function (box) {
                    if (!box.isNull()) {
                        children.push(box);
                    }
                })
            });
    }

    var FlexBox = CreateBoxType("Layout::FlexBox", ContainerBox);
    FlexBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the super class...
        return FlexBox.super.prototype.collectChildren.call(this, children)
        
        // And collect the children.
        .then(function() {
            return that.box.f("items", "flow");
        })
        .then(function (items) {
            if (items.typeDescription().indexOf("FlexBoxItemArray") != -1) {
                return items.f("m_pT").latestPatch()
                .array()
                    .f("BoxReference.m_pT")
                .forEach(function (box) {
                    if (!box.isNull()) {
                        children.push(box);
                    }
                })
            } else if (items.typeDescription() == "Layout::BoxItem") {
                return FlowBox.collectChildrenInFlow(items, children);
            } else if (items.typeDescription() == "SArray<Layout::FlexBox::SFlexBoxItem>") {
                return FlowBox.collectChildrenInFlow(that.box.f("flow"), children);
            } else {
                throw new Error("Unexpected FlexBox child typename: " + items.typeDescription());
            }
        })
    }

    var MultiFragmentBox = CreateBoxType("Layout::MultiFragmentBox", ContainerBox);
    var MultiColumnBox = CreateBoxType("Layout::MultiColumnBox", MultiFragmentBox);
    MultiColumnBox.prototype.collectChildren = function(children) {
        var that = this;
        // Collect children from the super class...
        return MultiColumnBox.super.prototype.collectChildren.call(this, children)

        // Get the items...
        .then(function () {
            return that.box.f("items.m_pT").latestPatch()
            .array()
                .f("BoxReference.m_pT")
            .then(function (boxes) {
                return that.box.f("itemsCount").val()
                .then(function (count) {
                    return boxes.slice(0, count).forEach(function (box) {
                        children.push(box);
                    });
                })
            })
        })
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
            // Get the list of runs...
            return firstRun.list("next.m_pT")

            // vcast them...
            .vcast()

            // filter them to only the inline-blocks...
            .filter(function (run) {
                var type = run.typeDescription();
                return (
                    type == "Layout::InlineBlockLineBoxRun" || 
                    type == "Layout::InlineBlockWithBreakConditionLineBoxRun"
                );
            })

            // get the box reference...
            .f("boxReference.m_pT")

            // and add them to the list.
            .forEach(function (box) {
                children.push(box);
            });
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
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("replacedViewport", "flow"), children); })
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
            .then(function() { return FlowBox.collectChildrenInFlow(that.box.f("boxItem", "flowItem"), children); })
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
            fullname: "Element",
            shortname: "e",
            async:true,
            html: function() {
                return this.f("element.m_pT");
            }
        },

        {
            type: "ContainerBox",
            fullname: "Tag",
            shortname: "tag",
            async:true,
            html: function() {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("element.m_pT")).f("_etag");
            }
        },
        {
            type: "ContainerBox",
            fullname: "ContentBoxWidth",
            shortname: "w",
            async:true,
            html: function() {
                return this.f("contentBoxWidth");
            }
        },

        {
            type: "ContainerBox",
            fullname: "ContentBoxHeight",
            shortname: "h",
            async:true,
            html: function() {
                return this.f("contentBoxHeight");
            }
        },

        {
            type: "ContainerBox",
            fullname: "LayoutPlacement",
            shortname: "lp",
            async:true,
            html: function() {
                return this.f("sourceStyle.fancyFormat._layoutPlacement");
            }
        },

        {
            type: "ContainerBox",
            fullname: "DisplayNode",
            shortname: "d",
            async:true,
            html: function() {
                // Check if it's been extracted...
                var that = this;
                return this.f("isDisplayNodeExtracted").val()

                // If it hasn't been extracted, grab the rawDisplayNode...
                .then(function(isExtracted) { return isExtracted ? DbgObject.NULL : that.f("rawDisplayNode"); })
            }
        },

        {
            type: "ContainerBox",
            fullname: "Validity",
            shortname: "validity",
            async:true,
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
            async:true,
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
                                return "<em>" + htmlFragments.join("") + "</em>";
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
