"use strict";

var MarkupTree = undefined;
Loader.OnLoad(function() {

    // Create an action that will highlight the dbgObject within its markup (dbgObject must support .F('Markup'))
    function getMarkupTreeNodeActions(dbgObject) {
        var anodePromise = new PromisedDbgObject(dbgObject);
        if (dbgObject.typename == "Tree::ANode") {
            anodePromise = promoteANode(dbgObject);
        }

        var markupPromise = anodePromise.F("Markup");
        var docPromise = markupPromise.F("Doc");
        var primaryMarkupPromise = docPromise.F("PrimaryMarkup");
        var topmostMarkupPromise = markupPromise.F("TopmostMarkup");

        return Promise.join([anodePromise, markupPromise, topmostMarkupPromise, docPromise, primaryMarkupPromise])
        .then(function (result) {
            var anode = result[0];
            var markup = result[1];
            var topmostMarkup = result[2];
            var doc = result[3];
            var primaryMarkup = result[4];

            var rootPtr;
            if (markup.isNull()) {
                return []; // Nodes that aren't in a markup don't need a markup tree action as there is no tree to show
            } else if (topmostMarkup.equals(primaryMarkup)) {
                rootPtr = doc.ptr(); 
            } else {
                rootPtr = topmostMarkup.ptr();
            }

            return [
                {
                    description: "Markup Tree",
                    action: "/markuptree/#r=" + rootPtr + ";n=" + anode.ptr(),
                },
                {
                    description: "Markup Tree (window-" + rootPtr + ")",
                    action: "/markuptree/#r=" + rootPtr + ";n=" + anode.ptr(),
                    target: "window-" + rootPtr
                }
            ];            
        });
    }

    // Create an action that will render the dbgObject as the root of the markup tree
    function getMarkupTreeActions(dbgObject) {
        return {
            description: "Markup Tree",
            action: "/markuptree/#r=" + dbgObject.ptr()
        }
    }

    DbgObject.AddAction(MSHTML.Module, "CTreeNode", "MarkupTree", getMarkupTreeNodeActions);
    DbgObject.AddAction(MSHTML.Module, "CElement", "MarkupTree", getMarkupTreeNodeActions);
    DbgObject.AddAction(MSHTML.Module, "Tree::ANode", "MarkupTree", getMarkupTreeNodeActions);
    DbgObject.AddAction(MSHTML.Module, "CMarkup", "MarkupTree", getMarkupTreeActions);
    DbgObject.AddAction(MSHTML.Module, "CDoc", "MarkupTree", getMarkupTreeActions);

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

    if (Loader.GetCurrentExtension()== "markuptree") {
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
            return treeNode.desc("Tag");
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CTreeNode", null, function (object) {
            return object.F("SubordinateMarkup");
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
            return markup.F("Root").then(function (root) {
                return root.vcast().then(null, function () { return root; })
            });
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