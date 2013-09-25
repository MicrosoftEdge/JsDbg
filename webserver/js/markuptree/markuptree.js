"use strict";

var MarkupTree = (function() {
    function createMarkupTree(pointer) {
        if (pointer) {
            return new CTreeNode(new DbgObject("mshtml", "CTreeNode", pointer));
        } else {
            return null;
        }
    }

    var renderTreeRoot = null;
    function renderMarkupTree(renderer, markupTree, container) {
        renderTreeRoot = renderer.BuildTree(container, markupTree);
        return renderTreeRoot;
    }
    function updateTreeRepresentation() {
        if (renderTreeRoot != null) {
            renderTreeRoot.updateRepresentation();
        }
    }


    function CTreeNode(treeNode) {
        this.treeNode = treeNode;
        this.cachedChildren = null;
    }

    CTreeNode.prototype.getChildren = function() {
        if (this.cachedChildren == null)
        {
            var treePosBegin = this.treeNode.f("_tpBegin");
            var treePosEnd = this.treeNode.f("_tpEnd");
            this.cachedChildren = [];

            var treePosNext = treePosBegin.f("_ptpThreadRight");
            while(treePosNext.pointer != treePosEnd.pointer)
            {
                var treePosFlags = treePosNext.f("_cElemLeftAndFlags").val();
                if (treePosFlags & 0x01)
                {
                    // We are at a node begin;
                    var childTreeNode = treePosNext.unembed("CTreeNode", "_tpBegin");
                    this.cachedChildren.push(new CTreeNode(childTreeNode));

                    // jump to the end of the node
                    treePosNext = childTreeNode.f("_tpEnd");
                }
                treePosNext = treePosNext.f("_ptpThreadRight");
            }
        }
        return this.cachedChildren;
    }

    CTreeNode.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        var tag = this.treeNode.f("_etag").as("ELEMENT_TAG").constant().substr("ETAG_".length);
        element.innerHTML = "<p>" + tag + "</p> <p>" + this.treeNode.ptr() + "</p> ";
        FieldSupport.RenderFields(this, this.treeNode, element);
        return element;
    }

    document.addEventListener("DOMContentLoaded", function() {
        // Initialize the field support.
        FieldSupport.Initialize("MarkupTree", MarkupTreeBuiltInFields, "CTreeNode", {"CTreeNode": CTreeNode}, updateTreeRepresentation);
    });

    return {
        Create: createMarkupTree,
        Render: renderMarkupTree,
    }
})();