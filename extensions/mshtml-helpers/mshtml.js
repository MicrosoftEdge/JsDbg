//
// mshtml.js
// Peter Salas
//
// Some mshtml-specific helpers.

var MSHTML = (function() {
    function getCDocs() {
        var docArrayObj = DbgObject.sym("mshtml!g_pts").as("THREADSTATEUI").f("_paryDoc");
        return docArrayObj.f("_pv").as("CDoc*").array(docArrayObj.f("_c").val());
    }

    function getRootCTreeNodes() {
        return getCDocs()
            .map(function(doc) { return doc.f("_pWindowPrimary")})
            .filter(function(pw) { return !pw.isNull(); })
            .map(function(pw) { return pw.f("_pCWindow._pMarkup._ptpFirst").unembed("CTreeNode", "_tpBegin"); })
    }

    function getCTreeNodeFromTreeElement(element) {
        var treeNode = null;
        try {
            element.f("placeholder");
            // We're in chk, offset by the size of a void*.
            treeNode = element.as("void*").idx(1).as("CTreeNode");
        } catch (ex) {
            // We're in fre, cast to CTreeNode.
            treeNode = element.as("CTreeNode");
        }
        return treeNode;
    }

    function getFirstAssociatedLayoutBoxFromCTreeNode(treeNode) {
        var layoutAssociationBits = treeNode.f("_fHasLayoutAssociationPtr").val();
        if (layoutAssociationBits & 0x8) {
            var bits = 0;

            // for each bit not counting the 0x8 bit, dereference the pointer.
            layoutAssociationBits = layoutAssociationBits & 0x7;
            var pointer = treeNode.f("_pLayoutAssociation");
            while (layoutAssociationBits > 0) {
                if (layoutAssociationBits & 1) {
                    pointer = pointer.deref();
                }
                layoutAssociationBits = layoutAssociationBits >>1;
            }

            return pointer.as("Layout::LayoutBox");
        } else {
            return new DbgObject("mshtml", "Layout::LayoutBox", 0x0);
        }
    }

    return {
        GetCDocs: getCDocs,
        GetRootCTreeNodes: getRootCTreeNodes,
        GetCTreeNodeFromTreeElement: getCTreeNodeFromTreeElement,
        GetFirstAssociatedLayoutBoxFromCTreeNode: getFirstAssociatedLayoutBoxFromCTreeNode,
    }
})();
