
function createBoxTree(rootBoxPointer) {   
    var container = document.getElementById("boxtree_root");
    container.innerHTML = "";
    if (rootBoxPointer) {
        var rootBox = createBox(rootBoxPointer);
        drawBoxTree(rootBox, container);
    }
}


var BOX_WIDTH = 75;
var BOX_MARGIN_X = 10;
var BOX_HEIGHT = 80;
var BOX_MARGIN_Y = 20;

function createBox(pointer) {
    if (pointer == 0) {
        throw "Cannot create a null box reference!";
    }

    var children = null;
    var requiredWidth = -1;
    var type = null;

    function getType() {
        if (type == null) {
            var object = new DbgObject("mshtml", "Layout::LayoutBox", pointer);
            type = getTypeSpecificMethods(object.vtable());
        }
        return type;
    }

    function getChildren(){
        if (children == null) {
            children = getType().getChildren(pointer);
        }

        return children;
    }

    function getRequiredWidth() {
        if (requiredWidth == -1) {
            var children = getChildren();
            requiredWidth = 0;

            for (var i = 0; i < children.length; ++i) {
                requiredWidth += children[i].getRequiredWidth();
            }
            if (children.length > 0) {
                requiredWidth += BOX_MARGIN_X * (children.length - 1);
            }

            if (requiredWidth < BOX_WIDTH) {
                requiredWidth = BOX_WIDTH;
            }
        }

        return requiredWidth;
    }

    function createRepresentation() {
        var element = document.createElement("div");
        var type = getType();
        element.innerHTML = type.getTypeName() + "<br />0x" + pointer.toString(16) + "<br />" + type.getDescription(pointer);

        return element;
    }

    return {
        getChildren: getChildren,
        getRequiredWidth: getRequiredWidth,
        createRepresentation: createRepresentation
    }
}

function drawBoxTree(box, container) {
    drawBoxSubtree(box, container, {x: 0, y:0, width:box.getRequiredWidth() });
}

function drawBoxSubtree(box, container, viewport) {
    // create the element for the box itself.
    var element = box.createRepresentation();
    element.className = "box";
    element.style.left = (viewport.x + viewport.width / 2 - BOX_WIDTH / 2) + "px";
    element.style.top = viewport.y + "px";
    container.appendChild(element);

    var children = box.getChildren();
    if (children.length > 0) {
        var firstWidth = children[0].getRequiredWidth();
        var lastWidth = children[children.length - 1].getRequiredWidth();
        var totalWidth = box.getRequiredWidth();

        // draw the child bar for this guy.
        var vertical = document.createElement("div");
        vertical.className = "vertical";
        vertical.style.left = (viewport.x + totalWidth / 2) + "px";
        vertical.style.top = (viewport.y + BOX_HEIGHT) + "px";
        container.appendChild(vertical);

        // draw the horizontal bar. it spans from the middle of the first viewport to the middle of the last viewport.
        var horizontalBarWidth = totalWidth - firstWidth / 2 - lastWidth / 2;
        var horizontal = document.createElement("div");
        horizontal.className = "horizontal";
        horizontal.style.width =  horizontalBarWidth + "px";
        horizontal.style.left = (viewport.x + firstWidth / 2) + "px";
        horizontal.style.top = (viewport.y + BOX_HEIGHT + BOX_MARGIN_Y / 2) + "px";
        container.appendChild(horizontal);

        viewport.y += BOX_HEIGHT + BOX_MARGIN_Y;

        // recurse into each of the children and draw a vertical.
        for (var i = 0; i < children.length; ++i) {
            var requiredWidth = children[i].getRequiredWidth();

            // draw the parent bar for this child.
            var childVertical = document.createElement("div");
            childVertical.className = "vertical";
            childVertical.style.left = (viewport.x + requiredWidth / 2) + "px";
            childVertical.style.top = (viewport.y - BOX_MARGIN_Y / 2) + "px";
            container.appendChild(childVertical);

            drawBoxSubtree(children[i], container, {x:viewport.x, y:viewport.y, width:requiredWidth});
            viewport.x += requiredWidth + BOX_MARGIN_X;
        }
    }
}

function d(v, s){
    if (s) {
        console.log(s + ": " + JSON.stringify(v));
    } else {
        console.log(JSON.stringify(v));
    }
}

function addChildrenInFlow(flow, children) {
    var initialFlow = flow;
    if (!flow.isNull()) {
        do {
            children.push(createBox(flow.f("data.boxReference.m_pT").ptr()));
            flow = flow.f("data.next");
        } while (!flow.equals(initialFlow));
    }
}

var ContainerBox = {
    getChildren: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::ContainerBox", pointer);
        var firstItem = object.f("PositionedItems.firstItem.m_pT");

        var children = [];

        if (!firstItem.isNull()) {
            var item = firstItem;
            do {
                if (item.vtable() == "Layout::PositionedBoxItem") {
                    var childBox = item.as("Layout::PositionedBoxItem").f("flowItem.data.boxReference.m_pT");
                    children.push(createBox(childBox.ptr()));
                }

                item = item.f("next.m_pT");
            } while (!item.equals(firstItem));
        }

        return children;
    },
    getTypeName: function() {
        return "Container";
    },

    getDescription: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::ContainerBox", pointer);
        return "w:" + object.f("contentBoxWidth.value").value() + "<br />h:" + object.f("contentBoxHeight.value").value() + "<br />lp:" + 
            object.f("sourceStyle.fancyFormat._layoutPlacement").bits(0, 5);
    }
};

var FlowBox = {
    super: ContainerBox,
    getChildren: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::FlowBox", pointer);
        var flow = object.f("flow");
        var initialFlow = flow;

        var children = [];
        addChildrenInFlow(flow, children);

        // add floaters
        var floaterArray = object.f("geometry._array");
        if (!floaterArray.isNull()) {
            var array = floaterArray.array(floaterArray.as("int").idx(-1).value());
            for (var i = 0; i < array.length; ++i) {
                var box = array[i].f("floaterBoxReference.m_pT.data.BoxReference.m_pT");
                children.push(createBox(box.ptr()));
            }
        }

        return children;
    },
    getTypeName: function() {
        return "Flow";
    }
}

var TableBox = {
    super: ContainerBox,
    getChildren: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::TableBox", pointer);
        var flow = object.f("flow");
        var initialFlow = flow;

        var children = [];
        addChildrenInFlow(flow, children);
        return children;
    },
    getTypeName: function() {
        return "Table";
    }
}

var TableGridBox = {
    super: ContainerBox,
    getChildren: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::TableGridBox", pointer);
        var children = [];
        var rowLayout = object.f("firstRowLayout.m_pT");
        while (!rowLayout.isNull()) {
            var columns = rowLayout.f("Columns.m_pT");
            if (!columns.isNull()) {
                var array = columns.f("data.Array.data").array(columns.f("data.Array.length").value());
                for (var i = 0; i < array.length; ++i) {
                    var box = array[i].f("cellBoxReference.m_pT");
                    if (!box.isNull()) {
                        children.push(createBox(box.ptr()));
                    }
                }
            }

            rowLayout = rowLayout.f("nextRowLayout.m_pT");
        }

        return children;
    },
    getTypeName: function() {
        return "TableGrid";
    }
}

var GridBox = {
    super: ContainerBox,
    getChildren: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::GridBox", pointer);
        var gridBoxItemArray = object.f("Items.m_pT");
        var children = [];

        if (!gridBoxItemArray.isNull()) {
            var array = gridBoxItemArray.f("data.Array.data").array(gridBoxItemArray.f("data.Array.length").value());
            for (var i = 0; i < array.length; ++i) {
                var childBox = array[i].f("BoxReference.m_pT");
                if (!childBox.isNull()) {
                    children.push(createBox(childBox.ptr()));
                }
            }
        }

        return children;
    },
    getTypeName: function() {
        return "Grid";
    }
}

var FlexBox = {
    super: ContainerBox,
    getChildren: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::FlexBox", pointer);
        var flow = object.f("flow");

        var children = [];
        addChildrenInFlow(flow, children);
        return children;
    },
    getTypeName: function() {
        return "Flex";
    }
}

var MultiColumnBox = {
    super: ContainerBox,
    getChildren: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::MultiColumnBox", pointer);
        var items = object.f("items.m_pT");
        var children = [];
        if (!items.isNull()) {
            var array = items.f("data.Array.data").array(object.f("itemsCount").value());
            for (var i = 0; i < array.length; ++i) {
                var childBox = array[i].f("BoxReference.m_pT");
                children.push(createBox(childBox.ptr()));
            }
        }

        return children;
    },
    getTypeName: function() {
        return "MultiColumn";
    }
}

var LineBox = {
    getChildren: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::LineBox", pointer);
        var children = [];
        if ((object.f("lineBoxFlags").value() & 0x8) > 0) {
            var run = object.f("firstRun.m_pT");
            while (!run.isNull()) {
                var type = run.vtable();
                if (type == "Layout::InlineBlockLineBoxRun" || 
                    type == "Layout::InlineBlockWithBreakConditionLineBoxRun"
                ) {
                    var box = run.as("Layout::InlineBlockLineBoxRun").f("boxReference.m_pT");
                    children.push(createBox(box.ptr()));
                }
                run = run.f("next.m_pT");
            }
        }

        return children;
    },
    getTypeName: function() {
        return "Line";
    },
    getDescription: function(pointer) {
        var object = new DbgObject("mshtml", "Layout::LineBox", pointer);
        
        var runIndexAtStartOfLine = object.f("textBlockRunIndexAtStartOfLine").value();
        var characterIndexInTextBlockRunAtStartOfLine = object.f("characterIndexInTextBlockRunAtStartOfLine").value();
        var runIndexAfterLine = object.f("textBlockRunIndexAfterLine").value();
        var characterIndexInTextBlockRunAfterLine = object.f("characterIndexInTextBlockRunAfterLine").value();

        var textBlock = object.f("textBlock.m_pT");
        var result = "";
        if (!textBlock.isNull() && runIndexAtStartOfLine >= 0) {
            var runCount = textBlock.f("_aryRuns._c").value();
            var runArray = textBlock.f("_aryRuns._pv").as("Tree::TextBlockRun*");

            if (runIndexAfterLine >= 0) {
                runCount = runIndexAfterLine + 1;
            }

            result = "text:<em>";

            for (var i = runIndexAtStartOfLine; i < runCount; ++i) {
                var runType = runArray.idx(i).deref().f("_runType").bits(0, 3);
                if (runType == 0x1) {
                    // It's a character run.
                    var textRun = runArray.idx(i).deref().f("_u._pTextRun");
                    var offset = textRun.f("_cchOffset").value();
                    var length = textRun.f("_cchRunLength").value();
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


var boxTypes = {
    "Layout::FlowBox" : FlowBox,
    "Layout::FlexBox" : FlexBox,
    "Layout::TableBox" : TableBox,
    "Layout::TableGridBox" : TableGridBox,
    "Layout::GridBox" : GridBox,
    "Layout::MultiColumnBox" : MultiColumnBox,
    "Layout::LineBoxCompactShort" : LineBox,
    "Layout::LineBoxCompactInteger" : LineBox,
    "Layout::LineBoxFullInteger" : LineBox,
    "Layout::LineBoxFullShort" : LineBox,
};

function getTypeSpecificMethods(symbol) {
    var type = null;
    if (symbol in boxTypes) {
        type = boxTypes[symbol];
    }

    return {
        getChildren: function(pointer) {
            var childrenArrays = [];
            var currentType = type;
            while (currentType) {
                childrenArrays.push(currentType.getChildren(pointer));
                currentType = currentType.super;
            }

            var children = [];
            for (var i = childrenArrays.length - 1; i >= 0; i--) {
                 children = children.concat(childrenArrays[i]);
            }

            return children;
        },

        getTypeName: function() {
            if (type) {
                return type.getTypeName();
            } else {
                return symbol;
            }
        },

        getDescription: function(pointer) {
            var descriptions = [];
            var currentType = type;
            while (currentType) {
                if (currentType.getDescription) {
                    descriptions.push(currentType.getDescription(pointer));
                }

                currentType = currentType.super;
            }

            var description = "";
            for (var i = descriptions.length - 1; i >= 0; i--) {
                 description += descriptions[i];
            }

            return description;
        }
    }
}

