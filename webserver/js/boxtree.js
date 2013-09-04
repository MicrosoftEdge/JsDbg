
function createBoxTree(rootBoxPointer) {   
    var container = document.getElementById("boxtree_root");
    container.innerHTML = "";
    if (rootBoxPointer) {
        var rootBox = CreateBox(new DbgObject("mshtml", "Layout::LayoutBox", rootBoxPointer));
        Tree.DrawTree(container, rootBox);
    }
}

function CreateBox(obj) {
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

    var type = obj.vtable();
    if (type in boxTypes) {
        return new boxTypes[type](obj);
    } else {
        return new LayoutBox(obj);
    }
}

function LayoutBox(box) {
    this.box = box;
    this.cachedChildren = null;
}

LayoutBox.prototype.typename = function() { return this.box.vtable(); }
LayoutBox.prototype.collectChildren = function(children) { }
LayoutBox.prototype.createRepresentation = function() {
    var element = document.createElement("div");
    element.innerHTML = this.typename() + "<br />0x" + this.box.ptr().toString(16);
    return element;
}
LayoutBox.prototype.getChildren = function() {
    if (this.cachedChildren == null) {
        var children = [];
        this.collectChildren(children);
        this.cachedChildren = children.map(CreateBox);
    }
    return this.cachedChildren;
}

function ContainerBox(box) {
    LayoutBox.call(this, box);
    this.box = this.box.as("Layout::ContainerBox");
}

ContainerBox.prototype = Object.create(LayoutBox.prototype);

ContainerBox.prototype.typename = function() { return "Container"; }
ContainerBox.prototype.collectChildren = function(children) {
    LayoutBox.prototype.collectChildren.call(this, children);

    var firstItem = this.box.f("PositionedItems.firstItem.m_pT");

    if (!firstItem.isNull()) {
        var item = firstItem;
        do {
            if (item.vtable() == "Layout::PositionedBoxItem") {
                var childBox = item.as("Layout::PositionedBoxItem").f("flowItem.data.boxReference.m_pT");
                children.push(childBox);
            }

            item = item.f("next.m_pT");
        } while (!item.equals(firstItem));
    }
}
ContainerBox.prototype.createRepresentation = function() {
    var result = LayoutBox.prototype.createRepresentation.call(this);
    result.innerHTML += "w:" + this.box.f("contentBoxWidth.value").value() + 
        "<br />h:" + this.box.f("contentBoxHeight.value").value() + 
        "<br />lp:" + this.box.f("sourceStyle.fancyFormat._layoutPlacement").bits(0, 5);
    return result;
}

function FlowBox(box) {
    ContainerBox.call(this, box);
    this.box = this.box.as("Layout::FlowBox");
}

FlowBox.prototype = Object.create(ContainerBox.prototype);
FlowBox.prototype.typename = function() { return "Flow"; }
FlowBox.collectChildrenInFlow = function(flow, children) {
    var initialFlow = flow;
    if (!flow.isNull()) {
        do {
            children.push(flow.f("data.boxReference.m_pT"));
            flow = flow.f("data.next");
        } while (!flow.equals(initialFlow));
    }
}
FlowBox.prototype.collectChildren = function(children) {
    ContainerBox.prototype.collectChildren.call(this, children);

    var flow = this.box.f("flow");
    var initialFlow = flow;

    FlowBox.collectChildrenInFlow(flow, children);

    // add floaters
    var floaterArray = this.box.f("geometry._array");
    if (!floaterArray.isNull()) {
        var array = floaterArray.array(floaterArray.as("int").idx(-1).value());
        for (var i = 0; i < array.length; ++i) {
            var box = array[i].f("floaterBoxReference.m_pT.data.BoxReference.m_pT");
            children.push(box);
        }
    }
}

function TableBox(box) {
    ContainerBox.call(this, box);
    this.box = this.box.as("Layout::TableBox");
}

TableBox.prototype = Object.create(ContainerBox.prototype);
TableBox.prototype.typename = function() { return "Table"; }
TableBox.prototype.collectChildren = function(children) {
    ContainerBox.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("flow"), children);
}

function TableGridBox(box) {
    ContainerBox.call(this, box);
    this.box = this.box.as("Layout::TableGridBox");
}

TableGridBox.prototype = Object.create(ContainerBox.prototype);
TableGridBox.prototype.typename = function() { return "TableGrid"; }
TableGridBox.prototype.collectChildren = function(children) {
    ContainerBox.prototype.collectChildren.call(this, children);

    var rowLayout = this.box.f("firstRowLayout.m_pT");

    while (!rowLayout.isNull()) {
        var columns = rowLayout.f("Columns.m_pT");
        if (!columns.isNull()) {
            var array = columns.f("data.Array.data").array(columns.f("data.Array.length").value());
            for (var i = 0; i < array.length; ++i) {
                var box = array[i].f("cellBoxReference.m_pT");
                if (!box.isNull()) {
                    children.push(box);
                }
            }
        }

        rowLayout = rowLayout.f("nextRowLayout.m_pT");
    }
}

function GridBox(box) {
    ContainerBox.call(this, box);
    this.box = this.box.as("Layout::GridBox");
}

GridBox.prototype = Object.create(ContainerBox.prototype);
GridBox.prototype.typename = function() { return "Grid"; }
GridBox.prototype.collectChildren = function(children) {
    ContainerBox.prototype.collectChildren.call(this, children);

    var gridBoxItemArray = this.box.f("Items.m_pT");

    if (!gridBoxItemArray.isNull()) {
        var array = gridBoxItemArray.f("data.Array.data").array(gridBoxItemArray.f("data.Array.length").value());
        for (var i = 0; i < array.length; ++i) {
            var childBox = array[i].f("BoxReference.m_pT");
            if (!childBox.isNull()) {
                children.push(childBox);
            }
        }
    }
}

function FlexBox(box) {
    ContainerBox.call(this, box);
    this.box = this.box.as("Layout::FlexBox");
}

FlexBox.prototype = Object.create(ContainerBox.prototype);
FlexBox.prototype.typename = function() { return "Flex"; }
FlexBox.prototype.collectChildren = function(children) {
    ContainerBox.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("flow"), children);
}

function MultiColumnBox(box) {
    ContainerBox.call(this, box);
    this.box = this.box.as("Layout::MultiColumnBox");
}

MultiColumnBox.prototype = Object.create(ContainerBox.prototype);
MultiColumnBox.prototype.typename = function() { return "MultiColumn"; }
MultiColumnBox.prototype.collectChildren = function(children) {
    ContainerBox.prototype.collectChildren.call(this, children);
    var items = this.box.f("items.m_pT");

    if (!items.isNull()) {
        var array = items.f("data.Array.data").array(this.box.f("itemsCount").value());
        for (var i = 0; i < array.length; ++i) {
            var childBox = array[i].f("BoxReference.m_pT");
            children.push(childBox);
        }
    }
}

function LineBox(box) {
    LayoutBox.call(this, box);
    this.box = this.box.as("Layout::LineBox");
}
LineBox.prototype = Object.create(LayoutBox.prototype);
LineBox.prototype.typename = function() { return "LineBox"; }
LineBox.prototype.collectChildren = function(children) {
    LayoutBox.prototype.collectChildren.call(this, children);

    if ((this.box.f("lineBoxFlags").value() & 0x8) > 0) {
        var run = this.box.f("firstRun.m_pT");
        while (!run.isNull()) {
            var type = run.vtable();
            if (type == "Layout::InlineBlockLineBoxRun" || 
                type == "Layout::InlineBlockWithBreakConditionLineBoxRun"
            ) {
                var box = run.as("Layout::InlineBlockLineBoxRun").f("boxReference.m_pT");
                children.push(box);
            }
            run = run.f("next.m_pT");
        }
    }
}
LineBox.prototype.createRepresentation = function() {
    var element = LayoutBox.prototype.createRepresentation.call(this);

    var runIndexAtStartOfLine = this.box.f("textBlockRunIndexAtStartOfLine").value();
    var characterIndexInTextBlockRunAtStartOfLine = this.box.f("characterIndexInTextBlockRunAtStartOfLine").value();
    var runIndexAfterLine = this.box.f("textBlockRunIndexAfterLine").value();
    var characterIndexInTextBlockRunAfterLine = this.box.f("characterIndexInTextBlockRunAfterLine").value();

    var textBlock = this.box.f("textBlock.m_pT");
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
    
    element.innerHTML += result;
    return element;
}
