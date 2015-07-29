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
        DbgObjectTree.AddRoot("Markup Tree", function() { 
            return MSHTML.GetCDocs()
            .f("_pWindowPrimary._pCWindow._pMarkup")
            .filter(function (markup) {
                return !markup.isNull();
            })
            .then(function (markups) {
                // Sort them by the length of the CMarkup's CAttrArray as a proxy for interesting-ness.
                return Promise.sort(markups, function (markup) {
                    return markup.f("_pAA._c").val()
                    .then(function (value) {
                        return 0 - value;
                    })
                });
            });
        });
        DbgObjectTree.AddType(null, MSHTML.Module, "CTreeNode", null, function (object) {
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
                return "&lt;" + tag + "&gt;";
            })
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CTreeNode", null, function (object) {
            // Get the subordinate markup.
            var element = object.f("_pElement");
            return Promise.join([
                element.f("_fHasLookasidePtr").val(),
                DbgObject.constantValue(MSHTML.Module, "CElement::LOOKASIDE", "LOOKASIDE_SUBORDINATE"),
                DbgObject.constantValue(MSHTML.Module, "CTreeNode", "LOOKASIDE_NODE_NUMBER")
            ])
            .then(function (results) {
                var lookasides = results[0];
                var lookasideSubordinate = results[1];
                var lookasideNodeNumber = results[2];

                if (lookasides & (1 << lookasideSubordinate)) {
                    var hashtable = MSHTML.GetDocFromMarkup(MSHTML.GetMarkupFromElement(element)).f("_HtPvPv");
                    // With the CTreeNode/CElement merger, CElement lookasides come after CTreeNode lookasides.
                    return MSHTML.GetObjectLookasidePointer(element, lookasideSubordinate + lookasideNodeNumber, hashtable)
                    .then(function (result) {
                        if (result.isNull()) {
                            // No result, but the lookaside bit was set...try the pre-merger behavior.
                            return MSHTML.GetObjectLookasidePointer(element, lookasideSubordinate, hashtable);
                        } else {
                            return result;
                        }
                    })
                    .then(function (result) {
                        if (!result.isNull()) {
                            return MSHTML.GetMarkupFromElement(result.as("CElement"))
                        }
                    });
                }
            })
        });

        DbgObjectTree.AddType("Text", MSHTML.Module, "CTreeDataPos");

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "CMarkup", address).vcast()
            .then(undefined, function (err) {
                // Virtual-table cast failed, so presume a CTreeNode.
                return new DbgObject(MSHTML.Module, "CTreeNode", address);
            });
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CMarkup", null, function (markup) {
            return promoteTreePos(markup.f("_ptpFirst"));
        }, function (markup) {
            return markup.f("_pHtmCtx._pDwnInfo._cusUri.m_LPWSTRProperty")
            .then(function (str) {
                 if (!str.isNull()) {
                    return str.string();
                 } else {
                    return null;
                 }
            })
            .then(function (url) {
                if (url != null) {
                    return "CMarkup (" + url + ")";
                } else {
                    return "CMarkup";
                }
            })
        });

        FieldSupport.RegisterTypeAlias(MSHTML.Module, "CTreeDataPos", "Text");
    }

    var builtInFields = [
        {
            type: "CTreeNode",
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
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
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
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
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
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
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
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
            fullType: {
                module: MSHTML.Module,
                type: "CTreeDataPos"
            },
            fullname: "TextBlock",
            shortname: "tb",
            async:true,
            html: function() {
                return this.f("_pTextBlock");
            }
        }
    ];

    return {
        Name: "MarkupTree",
        BasicType: "CMarkup",
        DefaultFieldType: {
            module: "edgehtml",
            type: "CTreeNode"
        },
        BuiltInFields: builtInFields
    }
})();