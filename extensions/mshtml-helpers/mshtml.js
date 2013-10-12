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
        var promise = Promise.as(getCDocs())
            .then(function (docs) {
                return Promise.join(docs.map(function (doc) { return doc.f("_pWindowPrimary"); }));
            })
            .then(function (windows) {
                return windows
                    .filter(function(w) { return !w.isNull(); })
                    .map(function(pw) { return pw.f("_pCWindow._pMarkup._ptpFirst").unembed("CTreeNode", "_tpBegin"); });
            });
        return DbgObject.forcePromiseIfSync(promise);
    }

    function getCTreeNodeFromTreeElement(element) {
        var promise = Promise.as(element)
            .then(function(element) {
                return element.f("placeholder");
            })
            .then(function() {
                // We're in chk, offset by the size of a void*.
                return element.as("void*").idx(1).as("CTreeNode");
            }, function() {
                // We're in fre, cast to CTreeNode.
                return element.as("CTreeNode");
            });
        return DbgObject.forcePromiseIfSync(new PromisedDbgObject(promise));
    }

    function getFirstAssociatedLayoutBoxFromCTreeNode(treeNode) {
        var promise = Promise.as(treeNode.f("_fHasLayoutAssociationPtr").val())
            .then(function (layoutAssociationBits) {
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
            });
        return DbgObject.forcePromiseIfSync(new PromisedDbgObject(promise));
    }

    // Extend DbgObject to ease navigation of patchable objects.
    DbgObject.prototype.latestPatch = function() {
        var that = this;
        var promise = Promise.as(this.f("_pNextPatch"))
            .then(function(nextPatch) {
                if (!nextPatch.isNull()) {
                    return nextPatch.as(that.typename);
                } else {
                    return that;
                }
            });
        return DbgObject.forcePromiseIfSync(new PromisedDbgObject(promise));
    }
    PromisedDbgObject.includePromisedMethod("latestPatch");

    return {
        GetCDocs: getCDocs,
        GetRootCTreeNodes: getRootCTreeNodes,
        GetCTreeNodeFromTreeElement: getCTreeNodeFromTreeElement,
        GetFirstAssociatedLayoutBoxFromCTreeNode: getFirstAssociatedLayoutBoxFromCTreeNode,
    }
})();
