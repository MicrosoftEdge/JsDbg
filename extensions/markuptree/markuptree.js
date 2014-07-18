"use strict";

var MarkupTree = (function() {

    // Add a type description for CTreeNode to link to the BoxTree.
    DbgObject.AddTypeDescription(MSHTML.Module, "CTreeNode", function(treeNode) {
        if (treeNode.isNull()) {
            return "null";
        } else {
            return "<a href=\"/markuptree/#" + treeNode.ptr() + "\">" + treeNode.ptr() + "</a>";
        }
    });
    DbgObject.AddTypeDescription(MSHTML.Module, "Tree::ElementNode", function(elementNode) {
        return MSHTML.GetCTreeNodeFromTreeElement(elementNode)
        .then(function (treeNode) {
            if (treeNode.isNull()) {
                return "null";
            } else {
                return "<a href=\"/markuptree/#" + treeNode.ptr() + "\">" + elementNode.ptr() + "</a>";
            }
        });
    });

    function promoteTreePos(treePos) {
        // What kind of tree pos is this?
        return treePos.f("_cElemLeftAndFlags").val()
        .then(function (treePosFlags) {
            if (treePosFlags & 0x01) {
                return treePos.unembed("CTreeNode", "_tpBegin")
            } else if (treePosFlags & 0x04) {
                return treePos.as("CTreeDataPos");
            } else if (treePosFlags & 0x08) {
                return treePos.as("CTreeDataPos").f("p._dwPointerAndGravityAndCling").val()
                .then(function (pointerandGravityAndCling) {
                    return new DbgObject(MSHTML.Module, "CMarkupPointer", (pointerandGravityAndCling | 3) - 3);
                })
            } else {
                return null;
            }
        })
    }

    if (JsDbg.GetCurrentExtension() == "markuptree") {
        Tree.AddRoot("Markup Tree", function() { return MSHTML.GetRootCTreeNodes(); });
        Tree.AddType(null, MSHTML.Module, "CTreeNode", null, function (object) {
            return object.f("_tpBegin").f("_ptpThreadRight")
            .list(
                function (treePos) {
                    // What kind of tree pos is this?
                    return treePos.f("_cElemLeftAndFlags").val()
                    .then(function (treePosFlags) {
                        if (treePosFlags & 0x01) {
                            // Node begin, skip to the end.
                            treePos = treePos.unembed("CTreeNode", "_tpBegin").f("_tpEnd");
                        }
                        // Get the next tree pos.
                        return treePos.f("_ptpThreadRight");
                    })
                },
                // Stop when we reach the end of the node.
                object.f("_tpEnd")
            )
            .map(promoteTreePos)
            .then(function(children) {
                return children.filter(function(child) { return child != null; });
            })
        }, function (treeNode) {
            return treeNode.f("_etag").desc()
            .then(function (tag) {
                return "<" + tag + ">";
            })
        });
        Tree.AddType("Text", MSHTML.Module, "CTreeDataPos");

        Tree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "CTreeNode", address);
        });
    }

    var builtInFields = [
        {
            type: "CTreeNode",
            fullname: "_iFF",
            shortname: "_iFF",
            async:true,
            html: function() {                
                var that = this;
                return Promise
                    .join([this.f("_iFF").val(), this.f("_fIFFValid").val()])
                    .then(function (valueAndValidity) {
                        return valueAndValidity[0] + (!valueAndValidity[1] ? " _fIFFValid:0" : "");
                    })
            }
        },
        {
            type: "CTreeNode",
            fullname: "_iCF",
            shortname: "_iCF",
            async:true,
            html: function() {
                var that = this;
                return Promise
                    .join([this.f("_iCF").val(), this.f("_fIPCFValid").val()])
                    .then(function (valueAndValidity) {
                        return valueAndValidity[0] + (!valueAndValidity[1] ? " _fIPCFValid:0" : "");
                    })
            }
        },
        {
            type: "CTreeNode",
            fullname: "_iPF",
            shortname: "_iPF",
            async:true,
            html: function() {
                var that = this;
                return Promise
                    .join([this.f("_iPF").val(), this.f("_fIPCFValid").val()])
                    .then(function (valueAndValidity) {
                        return valueAndValidity[0] + (!valueAndValidity[1] ? " _fIPCFValid:0" : "");
                    })
            }
        },
        {
            type: "CTreeNode",
            fullname: "_iSF",
            shortname: "_iSF",
            async:true,
            html: function() {
                var that = this;
                return Promise
                    .join([this.f("_iSF").val(), this.f("_fISFValid").val()])
                    .then(function (valueAndValidity) {
                        return valueAndValidity[0] + (!valueAndValidity[1] ? " _fISFValid:0" : "");
                    })
            }
        },
        {
            type: "Text",
            fullname: "TextBlock",
            shortname: "tb",
            async:true,
            html: function() {
                return this.f("_pTextBlock").ptr()
                .then(function (ptr) {
                    if (ptr != "NULL") {
                        return "<a href=\"/textblock/#" + ptr + "\">" + ptr + "</a>";
                    }
                })
            }
        }
    ];

    return {
        Name: "MarkupTree",
        BasicType: "CTreeNode",
        BuiltInFields: builtInFields,
        TypeMap: { "CTreeNode": "CTreeNode", "Text":"CTreeDataPos" }
    }
})();