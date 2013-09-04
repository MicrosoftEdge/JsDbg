"use strict";

var rootTreeNode = null;
var boxCache = {};

function createBoxTree(rootBoxPointer, container) {
    if (rootBoxPointer) {
        boxCache = {};
        var rootBox = CreateBox(new DbgObject("mshtml", "Layout::LayoutBox", rootBoxPointer));
        rootTreeNode = Tree.BuildTree(container, rootBox);
    }
}

function CreateBox(obj) {
    if (obj.ptr() in boxCache) {
        return boxCache[obj.ptr()];
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
        "Layout::LineBoxFullIntegerWithVisibleBounds" : LineBox,
        "Layout::LineBoxFullShort" : LineBox,
    };

    var type = obj.vtable();
    if (type in boxTypes) {
        var result = new boxTypes[type](obj);
    } else {
        var result = new LayoutBox(obj);
    }

    boxCache[obj.ptr()] = result;
    return result;
}

// Extend DbgObject to ease navigation of patchable objects.
DbgObject.prototype.latestPatch = function() {
    var nextPatch = this.f("_pNextPatch");
    if (!nextPatch.isNull()) {
        return nextPatch.as(this.typename);
    } else {
        return this;
    }
}

function LayoutBox(box) {
    this.box = box;
    this.cachedChildren = null;
}

LayoutBox.prototype.typename = function() { return this.box.vtable(); }
LayoutBox.prototype.collectChildren = function(children) { }
LayoutBox.prototype.collectUserFields = function(fields) { }
LayoutBox.prototype.createRepresentation = function() {
    var element = document.createElement("div");
    element.innerHTML = this.typename() + "<br />0x" + this.box.ptr().toString(16);

    var fields = [];
    this.collectUserFields(fields);

    for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (field.html) {
            element.innerHTML += "<br />" + field.shortname + ":" + field.html(this.box);
        } else if (field.element) {
            field.element(this.box, element);
        }
    };

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
                var childBox = item.as("Layout::PositionedBoxItem").f("flowItem").latestPatch().f(".data.boxReference.m_pT");
                children.push(childBox);
            }

            item = item.f("next.m_pT");
        } while (!item.equals(firstItem));
    }
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
            flow = flow.latestPatch();
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
        var array = floaterArray.array(floaterArray.as("int").idx(-1).val());
        for (var i = 0; i < array.length; ++i) {
            var box = array[i].f("floaterBoxReference.m_pT").latestPatch().f(".data.BoxReference.m_pT");
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
            var array = columns.latestPatch().f("data.Array.data").array(columns.f("data.Array.length").val());
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
        var array = gridBoxItemArray.latestPatch().f("data.Array.data").array(gridBoxItemArray.f("data.Array.length").val());
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
        var array = items.latestPatch().f("data.Array.data").array(this.box.f("itemsCount").val());
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
LineBox.prototype.typename = function() { return "Line"; }
LineBox.prototype.collectChildren = function(children) {
    LayoutBox.prototype.collectChildren.call(this, children);

    if ((this.box.f("lineBoxFlags").val() & 0x8) > 0) {
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
