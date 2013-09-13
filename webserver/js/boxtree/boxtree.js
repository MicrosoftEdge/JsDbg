"use strict";

// boxtree.js
// Peter Salas
//
// mshtml-specific logic for constructing a box tree.  The methods that new types implement are
//  - typename -> string               [a name that identifies the type]
//  - collectChildren(array) -> void   [adds children to the given array]
//
// These types also act as backing nodes drawn by tree.js, which means that LayoutBox implements
//  - getChildren -> array of backing nodes
//  - createRepresentation -> dom element


// public:

var rootTreeNode = null;

function createBoxTree(pointer, isTreeNode, container) {
    if (pointer) {
        var box = null;
        if (isTreeNode) {
            // Get the box pointer from the tree node.
            var treeNode = new DbgObject("mshtml", "CTreeNode", pointer);
            var layoutAssociationPtrBits = treeNode.f("_fHasLayoutAssociationPtr").val();
            if (layoutAssociationPtrBits & 0x8) {
                var bits = 0;

                // for each bit not counting the 0x8 bit, dereference the pointer.
                layoutAssociationPtrBits = layoutAssociationPtrBits & 0x7;
                var pointer = treeNode.f("_pLayoutAssociation");
                while (layoutAssociationPtrBits > 0) {
                    if (layoutAssociationPtrBits & 1) {
                        pointer = pointer.deref();
                    }
                    layoutAssociationPtrBits = layoutAssociationPtrBits>>1;
                }

                box = pointer.as("Layout::LayoutBox");
            } else {
                alert("No box was attached to the tree node.");
            }
        } else {
            box = new DbgObject("mshtml", "Layout::LayoutBox", pointer);
        }

        if (box != null) {
            boxCache = {};
            var rootBox = CreateBox(box);
            rootTreeNode = Tree.BuildTree(container, rootBox);
        }
    }
}

function getRootCTreeNodesWithLayoutAssociations() {
    var roots = [];
    var docArrayObj = DbgObject.sym("mshtml!g_pts").as("THREADSTATEUI*").deref().f("_paryDoc");
    var docArray = docArrayObj.f("_pv").as("CDoc*").array(docArrayObj.f("_c").val());
    for (var i = 0; i < docArray.length; ++i) {
        var doc = docArray[i];
        var primaryWindow = doc.f("_pWindowPrimary");
        if (!primaryWindow.isNull()) {
            var markup = primaryWindow.f("_pCWindow._pMarkup");
            var rootTreeNode = markup.f("_ptpFirst").unembed("CTreeNode", "_tpBegin");
            if (rootTreeNode.f("_fHasLayoutAssociationPtr").val()) {
                roots.push(rootTreeNode.ptr());
            }
        }
    }

    return roots;
}

// private:

var boxCache = {};

var BoxTypes = {};

function CreateBox(obj) {
    if (obj.ptr() in boxCache) {
        return boxCache[obj.ptr()];
    }

    var type = obj.vtable();
    if (type in BoxTypes) {
        var result = new BoxTypes[type](obj);
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

function MapBoxType(typename, type) {
    BoxTypes[typename] = type;
}

function CreateBoxType(typename, superType) {
    // For the description, strip "Layout::" and strip the last "Box".
    var name = typename.substr("Layout::".length);
    var lastIndexOfBox = name.lastIndexOf("Box");
    name = name.substr(0, lastIndexOfBox) + name.substr(lastIndexOfBox + "Box".length);

    var newType = function(box) {
        superType.call(this, box);
        this.box = this.box.as(typename);
    }
    newType.prototype = Object.create(superType.prototype);
    newType.prototype.typename = function() { return name; }
    newType.super = superType;
    newType.prototype.rawTypename = typename;

    MapBoxType(typename, newType);
    return newType;
}

function LayoutBox(box) {
    this.box = box;
    this.cachedChildren = null;
}

LayoutBox.prototype.typename = function() { return this.box.vtable(); }
LayoutBox.prototype.collectChildren = function(children) { }

LayoutBox.prototype.createRepresentation = function() {
    var element = document.createElement("div");
    element.innerHTML = this.typename() + "<br />" + this.box.ptr();

    var fields = [];
    if (this.collectUserFields) {
        this.collectUserFields(fields);
    }

    for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var html = field.html.call(this.box, element);
        if (html !== undefined) {
            element.innerHTML += "<br />";
            if (field.shortname.length > 0) {
                element.innerHTML += field.shortname + ":";
            }
            try {
                element.appendChild(html);
            } catch (ex) {
                element.innerHTML += html;
            }
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

var ContainerBox = CreateBoxType("Layout::ContainerBox", LayoutBox);
ContainerBox.prototype.collectChildren = function(children) {
    ContainerBox.super.prototype.collectChildren.call(this, children);

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

var FlowBox = CreateBoxType("Layout::FlowBox", ContainerBox);
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
    FlowBox.super.prototype.collectChildren.call(this, children);

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

var TableBox = CreateBoxType("Layout::TableBox", ContainerBox);
TableBox.prototype.collectChildren = function(children) {
    TableBox.super.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("flow"), children);
}


var TableGridBox = CreateBoxType("Layout::TableGridBox", ContainerBox);
TableGridBox.prototype.collectChildren = function(children) {
    TableGridBox.super.prototype.collectChildren.call(this, children);

    FlowBox.collectChildrenInFlow(this.box.f("fragmentedCellContents"), children);
    FlowBox.collectChildrenInFlow(this.box.f("collapsedCells"), children);

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

var GridBox = CreateBoxType("Layout::GridBox", ContainerBox);
GridBox.prototype.collectChildren = function(children) {
    GridBox.super.prototype.collectChildren.call(this, children);

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

var FlexBox = CreateBoxType("Layout::FlexBox", ContainerBox);
FlexBox.prototype.collectChildren = function(children) {
    FlexBox.super.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("flow"), children);
}

var MultiFragmentBox = CreateBoxType("Layout::MultiFragmentBox", ContainerBox);
var MultiColumnBox = CreateBoxType("Layout::MultiColumnBox", MultiFragmentBox);
MultiColumnBox.prototype.collectChildren = function(children) {
    MultiColumnBox.super.prototype.collectChildren.call(this, children);
    var items = this.box.f("items.m_pT");

    if (!items.isNull()) {
        var array = items.latestPatch().f("data.Array.data").array(this.box.f("itemsCount").val());
        for (var i = 0; i < array.length; ++i) {
            var childBox = array[i].f("BoxReference.m_pT");
            children.push(childBox);
        }
    }
}

var LineBox = CreateBoxType("Layout::LineBox", LayoutBox);
LineBox.prototype.collectChildren = function(children) {
    LineBox.super.prototype.collectChildren.call(this, children);

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

MapBoxType("Layout::LineBoxCompactShort", LineBox)
MapBoxType("Layout::LineBoxCompactInteger", LineBox)
MapBoxType("Layout::LineBoxFullInteger", LineBox)
MapBoxType("Layout::LineBoxFullIntegerWithVisibleBounds", LineBox)
MapBoxType("Layout::LineBoxFullShort", LineBox)

var ReplacedBox = CreateBoxType("Layout::ReplacedBox", ContainerBox);

var ReplacedBoxIFrame = CreateBoxType("Layout::ReplacedBoxIFrame", ReplacedBox);
ReplacedBoxIFrame.prototype.collectChildren = function(children) {
    ReplacedBoxIFrame.super.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("flow"), children);
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
    BoxContainerBox.super.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("flowItem"), children);
}
var PageFrameBox = CreateBoxType("Layout::PageFrameBox", BoxContainerBox);


var SvgCssContainerBox = CreateBoxType("Layout::SvgCssContainerBox", ContainerBox);
SvgCssContainerBox.prototype.collectChildren = function(children) {
    SvgCssContainerBox.super.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("firstSvgItem"), children);
}

var SvgBox = CreateBoxType("Layout::SvgBox", LayoutBox);

var SvgContainerBox = CreateBoxType("Layout::SvgContainerBox", SvgBox);
SvgContainerBox.prototype.collectChildren = function(children) {
    SvgContainerBox.super.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("firstSvgItem"), children);
}

var SvgTextBox = CreateBoxType("Layout::SvgTextBox", SvgBox);
SvgTextBox.prototype.collectChildren = function(children) {
    SvgTextBox.super.prototype.collectChildren.call(this, children);
    FlowBox.collectChildrenInFlow(this.box.f("flow"), children);
}

var SvgPrimitiveBox = CreateBoxType("Layout::SvgPrimitiveBox", SvgBox);
var SvgLinePrimitiveBox = CreateBoxType("Layout::SvgLinePrimitiveBox", SvgPrimitiveBox);
var SvgImagePrimitiveBox = CreateBoxType("Layout::SvgImagePrimitiveBox", SvgPrimitiveBox);
var SvgGeometryBox = CreateBoxType("Layout::SvgGeometryBox", SvgPrimitiveBox);
var SvgLineBox = CreateBoxType("Layout::SvgLineBox", LineBox);
