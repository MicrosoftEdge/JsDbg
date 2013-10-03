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

    function getRootCTreeNodesWithLayoutAssociations() {
        var roots = [];
        var docArray = getCDocs();
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

    return {
        GetCDocs: getCDocs,
        GetRootCTreeNodesWithLayoutAssociations: getRootCTreeNodesWithLayoutAssociations,
        GetCTreeNodeFromTreeElement: getCTreeNodeFromTreeElement
    }
})();
