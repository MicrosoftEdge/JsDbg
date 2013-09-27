//
// mshtml.js
// Peter Salas
//
// Some mshtml-specific helpers.

var MSHTML = (function() {
    function getRootCTreeNodesWithLayoutAssociations() {
        var roots = [];
        var docArrayObj = DbgObject.sym("mshtml!g_pts").as("THREADSTATEUI").f("_paryDoc");
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

    return {
        GetRootCTreeNodesWithLayoutAssociations: getRootCTreeNodesWithLayoutAssociations
    }
})();
