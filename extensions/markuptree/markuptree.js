"use strict";

var MarkupTree = undefined;
JsDbg.OnLoad(function() {

    // Add a type description for CTreeNode to link to the BoxTree.
    DbgObject.AddTypeDescription(MSHTML.Module, "CTreeNode", "Markup Tree", JsDbg.GetCurrentExtension() == "markuptree", function(treeNode) {
        if (treeNode.isNull()) {
            return "null";
        } else {
            return "<a href=\"/markuptree/#" + treeNode.ptr() + "\">" + treeNode.ptr() + "</a>";
        }
    });
    DbgObject.AddTypeDescription(MSHTML.Module, "Tree::ElementNode", "Markup Tree", JsDbg.GetCurrentExtension() == "markuptree", function(elementNode) {
        return MSHTML.GetCTreeNodeFromTreeElement(elementNode)
        .then(function (treeNode) {
            if (treeNode.isNull()) {
                return "null";
            } else {
                return "<a href=\"/markuptree/#" + treeNode.ptr() + "\">" + elementNode.ptr() + "</a>";
            }
        });
    });

    // Old Tree Connection, convert a CTreePos into a CTreeNode/CTreeDataPos
    function promoteTreePos(treePos) {
        // What kind of tree pos is this?
        return treePos.f("_elementTypeAndFlags", "_cElemLeftAndFlags").val()
        .then(function (treePosFlags) {
            if (treePosFlags & 0x01) {
                return treePos.unembed("CTreeNode", "_tpBegin")
            } else if (treePosFlags & 0x04) {
                return treePos.as("CTreeDataPos");
            } else if (treePosFlags & 0x08) {
                return treePos.as("CTreeDataPos").f("p._dwPointerAndGravityAndCling").bigval()
                .then(function (pointerandGravityAndCling) {
                    return new DbgObject(MSHTML.Module, "CMarkupPointer", pointerandGravityAndCling.or(3).minus(3));
                })
            } else {
                return null;
            }
        })
    }

    // New Tree Connection, convert a ANode into a CTreeNode/CDOMTextNode/CTreeDataPos
    function promoteANode(aNode) {
        // TEXTNODEMERGE -- ANode is part of the CTreeNode/CDOMTextNode virtual inheritance hierarchy
        return aNode.vcast()
        .then(null, function () {
            // !TEXTNODEMERGE -- Check _fIsElementNode to see what kind of node we are
            return aNode.as("CTreeDataPos").f("t._fIsElementNode").val()
            .then(function (isElementNode) {
                if (isElementNode) {
                    return aNode.unembed("CTreeNode", "_fIsElementNode");
                } else {
                    return aNode.as("CTreeDataPos");
                }
            })
        });
    }

    // Old Tree Connection - Get all direct children of CTreeNode
    function getAllDirectChildrenLegacy(object) {
        return object.f("_tpBegin").f("_ptpThreadRight")
        .list(
            function (treePos) {
                // What kind of tree pos is this?
                return treePos.f("_elementTypeAndFlags", "_cElemLeftAndFlags").val()
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
       .map(promoteTreePos);
    }

    // New Tree Connection - Get all direct children of CTreeNode
    function getAllDirectChildren(object)
    {
        return object.f("firstChild")
        .list(
            function (aNode) {
                return promoteANode(aNode)
                .then(function (realType) {
                    return realType.f("nextSibling");
                })
            },
            //Stop when there is no more siblings
            null
        )
        .map(promoteANode)
    }

    if (JsDbg.GetCurrentExtension() == "markuptree") {
        DbgObjectTree.AddRoot("Markup Tree", function() {
            // Sort by the _ulRefs of the CDoc as a proxy for interesting-ness.
            return Promise.sort(
                MSHTML.GetCDocs(), 
                function (doc) {
                    return doc.f("_ulRefs").val().then(function (v) { return 0 - v; });
                }
            );
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CDoc", null, function (object) {
            // Get the primary markup.
            return object.f("_pWindowPrimary._pCWindow._pMarkup");
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CTreeNode", null, function (object) {
            return getAllDirectChildren(object)
            .then(null, function () {
                // Old Tree Connection
                return getAllDirectChildrenLegacy(object);
                    })
            .then(function(children) {
                return children.filter(function(child) { return child != null; });
            })
        }, function (treeNode) {
            // Get the tag representation.
            return treeNode.f("_etag").constant()
            .then(function (etagValue) {
                if (etagValue == "ETAG_GENERIC") {
                    // For generic elements, get the tag name/namespace.
                    return treeNode.f("_pElement").vcast()
                    .then(null, function () {
                        // The _pElement pointer was removed in RS1.  The treeNode can now be directly cast as an element.
                        return treeNode.vcast();
                    })
                    .then(function (element) {
                        return Promise.join([element.f("_cstrTagName._pch").string(), element.f("_cstrNamespace._pch").string(), element.f("_cstrNamespace._pch").isNull()])
                    })
                    .then(function (tagAndNamespace) {
                        var tag = tagAndNamespace[0];
                        var namespace = tagAndNamespace[1];
                        var namespaceIsNull = tagAndNamespace[2];

                        if (namespaceIsNull) {
                            return tag;
                        } else {
                            return namespace + ":" + tag;
                        }
                    })
                } else if (etagValue == "ETAG_ROOT") {
                    return "$root";
                } else if (etagValue == "ETAG_GENERATED") {
                    return treeNode.as("Tree::GeneratedElementNode").f("_gctype").constant()
                    .then(null, function() {
                        // Tree::GeneratedElementNode replaced CGeneratedTreeNode in the RS1 milestone.
                        return treeNode.as("CGeneratedTreeNode").f("_gctype").constant();
                    })
                    .then(function (gcType) {
                        return "::" + gcType.substr("GC_".length).toLowerCase();
                    });
                } else {
                    // Non-generic elements: just strip the tag identifier.
                    return etagValue.substr("ETAG_".length).toLowerCase();
                }
            })
            .then(function (tag) {
                return "&lt;" + tag + "&gt;";
            })
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CTreeNode", null, function (object) {
            // Get the subordinate markup.
            var elementPromise = object.f("_pElement")
            .then(null, function () {
                // The _pElement pointer was removed in RS1.  The object can now be directly cast as an element.
                return object.as("CElement");
            });

            var lookasidePromise = elementPromise
            .then(function (element) {
                return element.f("_fHasLookasidePtr").val();
            });

            // During the CTreeNode/CElement merger the LOOKASIDE_SUBORDINATE enum value moved around.  Currently, it's on the CTreeNode type.
            var lookasideSubordinatePromise = DbgObject.constantValue(MSHTML.Module, "CTreeNode", "LOOKASIDE_SUBORDINATE")
            .then(null, function() {
                // Two additional cases to try: first (in reverse chronological order), when the CElement lookasides were offset by CTreeNode::LOOKASIDE_NODE_NUMBER
                return DbgObject.constantValue(MSHTML.Module, "CTreeNode", "LOOKASIDE_NODE_NUMBER")
                .then(
                    // Success
                    function(lookasideNodeNumber) {
                        // Add this number to the CElement::LOOKASIDE_SUBORDINATE
                        return DbgObject.constantValue(MSHTML.Module, "CElement::LOOKASIDE", "LOOKASIDE_SUBORDINATE")
                        .then(function(lookasideSubordinate) {
                            return lookasideSubordinate + lookasideNodeNumber;
                        });
                    },
                    // Failed, try second case when CElement had a LOOKASIDE_SUBORDINATE value that could be used directly
                    function() {
                        return DbgObject.constantValue(MSHTML.Module, "CElement::LOOKASIDE", "LOOKASIDE_SUBORDINATE");
                    }
                );
            });

            return Promise.join([
                elementPromise,
                lookasidePromise,
                lookasideSubordinatePromise
            ])
            .then(function (results) {
                var element = results[0];
                var lookasides = results[1];
                var lookasideSubordinate = results[2];

                if (lookasides & (1 << lookasideSubordinate)) {
                    var hashtable = MSHTML.GetDocFromMarkup(MSHTML.GetMarkupFromElement(element)).f("_HtPvPv");
                    return MSHTML.GetObjectLookasidePointer(element, lookasideSubordinate, hashtable)
                    .then(function (result) {
                        if (!result.isNull()) {
                            return MSHTML.GetMarkupFromElement(result.as("CElement"))
                        }
                    });
                }
            })
        });

        DbgObjectTree.AddType("Text", MSHTML.Module, "CTreeDataPos"); // TEXTNODEMERGE
        DbgObjectTree.AddType("TextNode", MSHTML.Module, "CDOMTextNode"); // !TEXTNODEMERGE

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "CBase", address).vcast()
            .then(undefined, function (err) {
                // Virtual-table cast failed, so presume a CTreeNode.
                return new DbgObject(MSHTML.Module, "CTreeNode", address);
            });
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CMarkup", null, function (markup) {
            return markup.f("root")
            .then(function (root) {
                // !TEXTNODEMERGE && NEWTREECONNECTION
                return root.unembed("CTreeDataPos", "_fIsElementNode")
                .then(null, function () {
                    // TEXTNODEMERGE && NEWTREECONNECTION
                    return root.as("CTreeNode");
                })
            }, function () {
                // !TEXTNODEMERGE && !NEWTREECONNECTION
                return promoteTreePos(markup.f("_ptpFirst"));
            })
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

        FieldSupport.RegisterTypeAlias(MSHTML.Module, "CDOMTextNode", "TextNode");
    }

    var builtInFields = [
        /*ElementNode Fields*/
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "_iFF",
            shortname: "_iFF",
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
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "_iCF",
            shortname: "_iCF",
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
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "_iPF",
            shortname: "_iPF",
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
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "_iSF",
            shortname: "_iSF",
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
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "parent",
            shortname: "p",
            html: function ()
            {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("parent", "_pNodeParent"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "nextSibling",
            shortname: "ns",
            html: function ()
            {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("nextSibling"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "previousOrLastSibling",
            shortname: "ps",
            html: function ()
            {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("previousOrLastSibling"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "firstChild",
            shortname: "fc",
            html: function ()
            {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("firstChild"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeNode"
            },
            fullname: "ordinals",
            shortname: "ord",
            html: function ()
            {
                return Promise.join([this.f("beginOrdinal").val(), this.f("endOrdinal").val()])
                .then(function (result)
                {
                    return result[0] + "," + result[1];
                });
            }
        },

        /*TextNode fields (TEXTNODEMERGE)*/
        {
            fullType: {
                module: MSHTML.Module,
                type: "CDOMTextNode"
            },
            fullname: "parent",
            shortname: "p",
            html: function () {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("parent", "_pNodeParent"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CDOMTextNode"
            },
            fullname: "nextSibling",
            shortname: "ns",
            html: function () {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("nextSibling"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CDOMTextNode"
            },
            fullname: "previousOrLastSibling",
            shortname: "ps",
            html: function () {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("previousOrLastSibling"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CDOMTextNode"
            },
            fullname: "Text",
            shortname: "t",
            html: function () {
                var that = this;

                function processCharacters(characters) {
                    var length = characters.length;
                    var textArray = new Array();
                    for (var i = 0; i < length; i++) {
                        textArray.push(String.fromCharCode(characters[i]));
                    }

                    return "\"" + textArray.join("") + "\"";
                }

                return this.f("textData.m_pT")
                    .f("isTextDataSlice", "_fIsTextDataSlice").val()
                    .then(null, function () { return 0; }) // Handle no _fIsTextDataSlice field
                    .then(function (isSlice) {
                        if (!isSlice) {
                            return that.f("textData.m_pT")
                                .as("Tree::TextData")
                                .f("text", "_pText")
                                .array(that.f("textData.m_pT").f("textLength", "_ulTextLength"))
                                .then(processCharacters);
                        } else {
                            var textDataSlicePromise = that.f("textData.m_pT").as("Tree::TextDataSlice");
                            return Promise.join([
                                textDataSlicePromise.f("originalTextData.m_pT", "_spOriginalTextData.m_pT"),
                                textDataSlicePromise.f("textLength", "_ulTextLength"),
                                textDataSlicePromise.f("offset", "_ulOffset")
                            ])
                            .then(function (results) {
                                var originalTextData = results[0];
                                var sliceLength = results[1];
                                var sliceOffset = results[2];
                                return originalTextData.f("text", "_pText").idx(sliceOffset.val()).array(sliceLength.val()).then(processCharacters);
                            });
                        }
                    })
                    .then(function (text) {
                        return document.createTextNode(text);
                    });
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CDOMTextNode"
            },
            fullname: "TextLength",
            shortname: "len",
            html: function () {
                return this.f("_pTextData", "_spTextData.m_pT")
                    .as("Tree::TextData", "Tree::ATextData")
                    .f("textLength", "_ulTextLength");
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CDOMTextNode"
            },
            fullname: "TextBlock",
            shortname: "tb",
            html: function () {
                return this.f("_pTextBlockOrLayoutAssociations", "_pTextBlock");
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CDOMTextNode"
            },
            fullname: "ordinal",
            shortname: "ord",
            html: function () {
                return this.f("beginOrdinal").val();
            }
        },

        /*TextNode fields (!TEXTNODEMERGE)*/
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeDataPos"
            },
            fullname: "parent",
            shortname: "p",
            html: function ()
            {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("parent", "_pNodeParent"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeDataPos"
            },
            fullname: "nextSibling",
            shortname: "ns",
            html: function ()
            {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("nextSibling"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeDataPos"
            },
            fullname: "previousOrLastSibling",
            shortname: "ps",
            html: function ()
            {
                return MSHTML.GetCTreeNodeFromTreeElement(this.f("previousOrLastSibling"));
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeDataPos"
            },
            fullname: "Text",
            shortname: "t",
            html: function() {
                var that = this;

                function processCharacters(characters) {
                    var length = characters.length;
                    var textArray = new Array();
                    for (var i = 0; i < length; i++) {
                        textArray.push(String.fromCharCode(characters[i]));
                    }
    
                    return "\"" + textArray.join("") + "\"";
                }

                return this.f( "_spTextData.m_pT", "_pTextData")
                    .f("isTextDataSlice", "_fIsTextDataSlice").val()
                    .then(null, function() { return 0; }) // Handle no _fIsTextDataSlice field
                    .then(function (isSlice) {
                        if (!isSlice) {
                            return that.f("_spTextData.m_pT", "_pTextData")
                                .as("Tree::TextData")
                                .f("text", "_pText")
                                .array(that.f("_spTextData.m_pT", "_pTextData").f("textLength", "_ulTextLength"))
                                .then(processCharacters);
                        } else {
                            var textDataSlicePromise = that.f("_spTextData.m_pT", "_pTextData").as("Tree::TextDataSlice");
                            return Promise.join([
                                textDataSlicePromise.f("originalTextData.m_pT", "_spOriginalTextData.m_pT"),
                                textDataSlicePromise.f("textLength", "_ulTextLength"),
                                textDataSlicePromise.f("offset", "_ulOffset")
                            ])
                            .then(function (results) {
                                var originalTextData = results[0];
                                var sliceLength = results[1];
                                var sliceOffset = results[2];
                                return originalTextData.f("text", "_pText").idx(sliceOffset.val()).array(sliceLength.val()).then(processCharacters);
                            });
                        }
                    })
                    .then(function (text) {
                        return document.createTextNode(text);
                    });
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeDataPos"
            },
            fullname: "TextLength",
            shortname: "len",
            html: function() {
                return this.f("_pTextData", "_spTextData.m_pT")
                    .as("Tree::TextData", "Tree::ATextData")
                    .f("textLength", "_ulTextLength");
                }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeDataPos"
            },
            fullname: "TextBlock",
            shortname: "tb",
            html: function () {
                return this.f("_pTextBlockOrLayoutAssociations", "_pTextBlock");
            }
        },
        {
            fullType: {
                module: MSHTML.Module,
                type: "CTreeDataPos"
            },
            fullname: "ordinal",
            shortname: "ord",
            html: function ()
            {
                return this.f("beginOrdinal").val();
            }
        },
    ];

    MarkupTree = {
        Name: "MarkupTree",
        RootType: "CDoc",
        DefaultFieldType: {
            module: "edgehtml",
            type: "CTreeNode"
        },
        BuiltInFields: builtInFields
    }
});