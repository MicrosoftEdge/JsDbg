"use strict";

var MarkupTree = undefined;
JsDbg.OnLoad(function() {

    // Add a type description for CTreeNode to link to the BoxTree.
    DbgObject.AddTypeDescription(MSHTML.Module, "CTreeNode", "MarkupTree", true, function(treeNode) {
        if (treeNode.isNull()) {
            return "null";
        } else {
            return "<a href=\"/markuptree/#" + treeNode.ptr() + "\">" + treeNode.ptr() + "</a>";
        }
    });
    DbgObject.AddTypeDescription(MSHTML.Module, "Tree::ElementNode", "MarkupTree", true, function(elementNode) {
        return MSHTML.GetCTreeNodeFromTreeElement(elementNode)
        .then(function (treeNode) {
            if (treeNode.isNull()) {
                return "null";
            } else {
                return "<a href=\"/markuptree/#" + treeNode.ptr() + "\">" + elementNode.ptr() + "</a>";
            }
        });
    });
    DbgObject.AddTypeDescription(MSHTML.Module, "Tree::TextNode", "MarkupTree", true, function (textNode) {
        return "<a href=\"/markuptree/#" + textNode.ptr() + "\">" + textNode.ptr() + "</a>";
    });

    // Old Tree Connection, convert a CTreePos into a CTreeNode/CTreeDataPos
    function promoteTreePos(treePos) {
        // What kind of tree pos is this?
        return treePos.f("_elementTypeAndFlags", "_cElemLeftAndFlags").val()
        .then(function (treePosFlags) {
            if (treePosFlags & 0x01) {
                return treePos.unembed("CTreeNode", "_tpBegin").then(function (treeNode) {
                    return treeNode.vcast()
                    .then(null, function () {
                        return treeNode;
                    })
                });
            } else if (treePosFlags & 0x04) {
                return treePos.unembed("CDOMTextNode", "treePos")
                .then(null, function () {
                    return treePos.as("CTreeDataPos");
                });
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
                    return aNode.unembed("CTreeNode", "_fIsElementNode").vcast();
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
                    return treeNode.as("Tree::GeneratedElementNode").f("_generatedContentType", "_gctype").constant()
                    .then(null, function() {
                        // Tree::GeneratedElementNode replaced CGeneratedTreeNode in the RS1 milestone.
                        return treeNode.as("CGeneratedTreeNode").f("_gctype").constant();
                    })
                    .then(function (gcType) {
                        return "::" + gcType.replace(/GC_/, "").toLowerCase();
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
            .then(function (index) {
                return {
                    offset:0,
                    index:index
                };
            }, function() {
                // The index is not on the CTreeNode, so it must be on the CElement.
                return DbgObject.constantValue(MSHTML.Module, "CElement::LOOKASIDE", "LOOKASIDE_SUBORDINATE")
                .then(function (lookasideSubordinate) {
                    // Two additional cases to try: first (in reverse chronological order), when the CElement lookasides were offset by CTreeNode::LOOKASIDE_NODE_NUMBER.
                    // We identify this case by the presence of the _dwNodeFlags1 field which was added in inetcore 1563867.
                    return (new DbgObject("edgehtml", "CTreeNode", 0)).f("_dwNodeFlags1")
                    .then(
                        function () {
                            return DbgObject.constantValue(MSHTML.Module, "CTreeNode", "LOOKASIDE_NODE_NUMBER")
                            .then(function(lookasideNodeNumber) {
                                // Add this number to the CElement::LOOKASIDE_SUBORDINATE
                                return {
                                    offset: lookasideNodeNumber,
                                    index: lookasideSubordinate
                                };
                            });
                        }, function () {
                            return {
                                offset:0,
                                index: lookasideSubordinate
                            }
                        }
                    )
                })
            });

            return Promise.join([
                elementPromise,
                lookasidePromise,
                lookasideSubordinatePromise
            ])
            .then(function (results) {
                var element = results[0];
                var lookasides = results[1];
                var lookasideSubordinateOffset = results[2].offset;
                var lookasideSubordinateIndex = results[2].index;

                if (lookasides & (1 << lookasideSubordinateIndex)) {
                    var hashtable = MSHTML.GetDocFromMarkup(MSHTML.GetMarkupFromElement(element)).f("_HtPvPv");
                    return MSHTML.GetObjectLookasidePointer(element, lookasideSubordinateOffset + lookasideSubordinateIndex, hashtable)
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
            return markup.F("Root");
        }, function (markup) {
            return markup.desc("URL")
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

    DbgObject.AddTypeDescription(MSHTML.Module, "Tree::ATextData", "Text", false, UserEditableFunctions.Create(function (textData) {
        function processCharacters(characters) {
            var length = characters.length;
            var textArray = new Array();
            for (var i = 0; i < length; i++) {
                textArray.push(String.fromCharCode(characters[i]));
            }
        
            return "\"" + textArray.join("") + "\"";
        }

        return textData.f("isTextDataSlice", "_fIsTextDataSlice").val()
        .then(null, function() { return 0; }) // Handle no _fIsTextDataSlice field
        .then(function (isSlice) {
            if (!isSlice) {
                return textData.as("Tree::TextData")
                    .f("text", "_pText")
                    .vals(textData.f("textLength", "_ulTextLength"));
            } else {
                var textDataSlice = textData.as("Tree::TextDataSlice");
                return Promise.join([
                    textDataSlice.f("originalTextData.m_pT", "_spOriginalTextData.m_pT"),
                    textDataSlice.f("textLength", "_ulTextLength"),
                    textDataSlice.f("offset", "_ulOffset")
                ])
                .then(function (results) {
                    var originalTextData = results[0];
                    var sliceLength = results[1];
                    var sliceOffset = results[2];
                    return originalTextData.f("text", "_pText").idx(sliceOffset.val()).vals(sliceLength.val());
                });
            }
        })
        .then(function (characters) {
            return document.createTextNode(processCharacters(characters));
        });
    }));

    DbgObject.AddTypeDescription(MSHTML.Module, "CDOMTextNode", "Text", false, UserEditableFunctions.Create(function (textNode) {
        return textNode.f("textData.m_pT").desc("Text");
    }))

    MarkupTree = {
        Name: "MarkupTree",
        RootType: "CDoc",
        DefaultTypes: [
            { module: MSHTML.Module, type: "CTreeNode" },
            { module: MSHTML.Module, type: "CBase" }
        ]
    }
});