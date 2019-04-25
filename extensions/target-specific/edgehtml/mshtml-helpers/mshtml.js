//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

//
// mshtml.js
// Peter Salas
//
// Some mshtml-specific helpers.

var MSHTML = undefined;

(function() {
    // Figure out which module to use.
    var moduleName = null;

    Loader.OnLoadAsync(function(onComplete) {
        DbgObject.global("edgehtml", "g_pts")
        .then(
            function() {
                moduleName = "edgehtml";
            },
            function() {
                moduleName = "mshtml";
            }
        )
        .finally(onComplete);
    });

    mshtmlType = function(type) {
        return DbgObjectType(moduleName, type);
    }

    // Figure out whether CTreeNode exists
    var treeNodeType = null;

    Loader.OnLoadAsync(function(onComplete) {
        JsDbg.LookupTypeSize(moduleName, "CTreeNode", function (result) {
            if (result.error) {
                treeNodeType = mshtmlType("Tree::ElementNode");
            } else {
                treeNodeType = mshtmlType("CTreeNode");
            }
            onComplete();
        });
    })

    Loader.OnLoad(function() {
        function GetDocsAndThreadstates(){
            return DbgObject.global(moduleName, "g_pts").deref()
            .list("ptsNext").as("THREADSTATEUI")
            .map(function (threadstate) {
                return threadstate.f("_paryDoc")
                .array("Items")
                .map(function (doc) {
                    return {
                        threadstate: threadstate,
                        doc: doc
                    };
                })
            })
            .then(function (outerArray) {
                var result = [];
                outerArray.forEach(function (innerArray) {
                    result = result.concat(innerArray);
                });
                return result;
            })
        }

        function GetCDocs() {
            return new PromisedDbgObject.Array(
                // Sort the CDocs by _ulRefs as a proxy for interesting-ness
                Promise.sort(
                    Promise.map(GetDocsAndThreadstates(), function(obj) { return obj.doc; }),    
                    function (doc) {
                        return doc.f("_ulRefs").val().then(function (v) { return 0 - v; });
                    }
                )
            );
        }

        function IsCBaseGCNative(base) {
            return Promise.all([base.f("_ulAllRefsAndFlags").val(), DbgObject.constantValue(mshtmlType("CBase"), "BRF_GCNATIVE")])
            .thenAll((ulAllRefsAndFlags, BRF_GCNATIVE) => {
                var isGCNative = ulAllRefsAndFlags & BRF_GCNATIVE;
                return isGCNative;
            });
        }

        function GetJSTypeIdMap() {
            if (!this.javascriptTypeIdMap) {
                return Promise.all([DbgObject.globalConstantValue("edgehtml", "JSIntegration::JSTypeID_ReservedRangeStart"), DbgObject.globalConstantValue("edgehtml", "JSIntegration::JSTypeID_ReservedRangeEnd")])
                .thenAll((reservedRangeStart, reservedRangeEnd) => {
                    this.javascriptTypeIdMap = {};
                    return FillJSTypeIdMap(/*currentTypeId*/reservedRangeStart, /*lastTypeId*/reservedRangeEnd, this.javascriptTypeIdMap);
                });
            } else {
                return Promise.resolve(this.javascriptTypeIdMap);
            }
        }

        function FillJSTypeIdMap(currentTypeId, lastTypeId, typeIdMap) {
            if (currentTypeId == lastTypeId) {
                return Promise.resolve(typeIdMap);
            } else {
                return DbgObject.globalConstantNames("edgehtml", currentTypeId)
                .then((names) => {
                    typeIdMap[currentTypeId] = names.find((str) => {
                        return str.includes("JSIntegration::JSTypeID") && !IsReservedTypeIdName(str);
                    });
                    return FillJSTypeIdMap(currentTypeId + 1, lastTypeId, typeIdMap);
                });
            }
        }

        function IsReservedTypeIdName(typeIdName) {
            return (typeIdName == "JSIntegration::JSTypeID_Unspecified")
                || (typeIdName == "JSIntegration::JSTypeID_SafeCBaseCastStart")
                || (typeIdName == "JSIntegration::JSTypeID_SafeCBaseCastEnd")
                || (typeIdName == "JSIntegration::JSTypeID_ReservedRangeStart")
                || (typeIdName == "JSIntegration::JSTypeID_ReservedRangeEnd")
                || (typeIdName == "JSIntegration::JSTypeID_ReservedRangeCodeGenStart")
                || (typeIdName == "JSIntegration::JSTypeID_ReservedRangeCodeGenEnd")
                || (typeIdName == "JSIntegration::JSTypeID_NotCBaseBegin")
                || (typeIdName == "JSIntegration::JSTypeID_NotCBaseEnd")
        }

        function IsCBaseOrSimilarType(typeId) {
            return Promise.all([DbgObject.globalConstantValue("edgehtml", "JSIntegration::JSTypeID_SafeCBaseCastStart"), DbgObject.globalConstantValue("edgehtml", "JSIntegration::JSTypeID_SafeCBaseCastEnd")])
            .thenAll((safecbasecaststart, safecbasecastend) => {
                return safecbasecaststart <= typeId && typeId < safecbasecastend;
            });
        }

        DbgObject.AddTypeDescription(mshtmlType("CBase"), "Refs", false, UserEditableFunctions.Create(function(base) {
            return Promise.all([
                base.f("_ulRefs").val(), 
                base.f("_ulInternalRefs").val(), 
                base.f("_ulAllRefsAndFlags").val(),
                DbgObject.constantValue(mshtmlType("CBase"), "BRF_FLAGS_SHIFT"),
                DbgObject.constantValue(mshtmlType("CBase"), "BRF_PASSIVATING"),
                DbgObject.constantValue(mshtmlType("CBase"), "BRF_PASSIVATED"),
                DbgObject.constantValue(mshtmlType("CBase"), "BRF_DESTRUCTING")
            ])
            .thenAll(function (ulRefs, ulInternalRefs, ulAllRefsAndFlags, BRF_FLAGS_SHIFT, BRF_PASSIVATING, BRF_PASSIVATED, BRF_DESTRUCTING) {
                var flags = "";
                var isPassivating = ulAllRefsAndFlags & BRF_PASSIVATING;
                var isPassivated = ulAllRefsAndFlags & BRF_PASSIVATED;
                var isDestructing = ulAllRefsAndFlags & BRF_DESTRUCTING;
                if (isPassivating || isPassivated || isDestructing) {
                    flags = " <span style='color:red'>" + 
                        (isPassivating ? " passivating " : "") + 
                        (isPassivated ? " passivated " : "") + 
                        (isDestructing ? " desctructing " : "") + 
                    "</span>";
                }

                return "strong:" + ulRefs + " weak:" + (ulAllRefsAndFlags >> BRF_FLAGS_SHIFT) + " gc:" + ulInternalRefs + flags;
            });
        }));


        DbgObject.AddTypeDescription(mshtmlType("CBase"), "RefsAndVar", false, UserEditableFunctions.Create(function(base) {
            return Promise.all([base.desc("Refs"), base.f("_JSBind_Var._ptr")])
            .thenAll(function(refsDesc, jsBindVar) {
                var varDesc = "";
                var jsBindVarPtr = new PointerMath.Pointer(jsBindVar.pointerValue().and(bigInt(1).not())).toFormattedString();
                var isVarRooted = !jsBindVar.pointerValue().and(1).isZero();

                if (!jsBindVar.isNull()) {
                    varDesc += "(var: " + "<span style='color:#aaa'>" + jsBindVarPtr + "</span>";
                    if (isVarRooted) {
                        varDesc += " <span style='color:rgb(240,120,0)'>rooted</span>";
                    }
                    varDesc += ")";
                }

                return refsDesc + " " + varDesc;
            });
        }));

        if (treeNodeType.equals("CTreeNode")) {
            DbgObject.AddExtendedField(mshtmlType("CMarkup"), "Root", "CTreeNode", UserEditableFunctions.Create(function (markup) {
                return markup.f("rootElement", "root")
                .then(function (root) {
                    // !TEXTNODEMERGE && NEWTREECONNECTION
                    return root.unembed("CTreeDataPos", "_fIsElementNode")
                    .then(null, function () {
                        // TEXTNODEMERGE && NEWTREECONNECTION
                        return root.as("CTreeNode");
                    })
                }, function () {
                    // !TEXTNODEMERGE && !NEWTREECONNECTION
                    return markup.f("_ptpFirst").unembed("CTreeNode", "_tpBegin");
                })
            }));

            DbgObject.AddExtendedField(mshtmlType("Tree::ElementNode"), "TreeNode", "CTreeNode", function (element) {
                return element.unembed("CTreeNode", "_fIsElementNode")
                .then(null, function () {
                    return DbgObject.create(treeNodeType, 0).baseTypes()
                    .then(function (baseTypes) {
                        if (baseTypes.filter(function(b) { return b.type.name() == "Tree::ElementNode"}).length > 0) {
                            return element.as("CTreeNode");
                        } else if (baseTypes.filter(function(b) { return b.type.name() == "CBase"; }).length > 0) {
                            // CBase is in the ancestry.
                            return element.as("CTreePos").unembed("CTreeNode", "_tpBegin");
                        } else {
                            return element.f("placeholder")
                            .then(function () {
                                // We're in legacy chk, offset by the size of a void*.
                                return element.as("void*").idx(1).as("CTreeNode");
                            }, function () {
                                return element.as("CTreeNode");
                            })
                        }
                    })
                });
            });
        } else {
            DbgObject.AddExtendedField(mshtmlType("CMarkup"), "Root", "Tree::ElementNode", UserEditableFunctions.Create(function (markup) {
                return markup.f("root");
            }));
        }

        DbgObject.AddTypeDescription(mshtmlType("CMarkup"), "URL", false, UserEditableFunctions.Create(function (markup) {
            return markup.f("_pMarkupLocationContext._pchUrl").string()
            .catch(function() {
                return markup.f("_pHtmCtx")
                .then(function (parserContext) {
                    return parserContext.vcast().catch(function () { return parserContext; });
                })
                .then(function (parserContext) {
                    if (!parserContext.isNull()) {
                        return parserContext.f("_pDwnInfo._cusUri.m_LPWSTRProperty");
                    } else {
                        return DbgObject.NULL;
                    }
                })
                .then(function (str) {
                     if (!str.isNull()) {
                        return str.string();
                     } else {
                        return null;
                     }
                })
            })
        }));

        DbgObject.AddExtendedField(mshtmlType("CMarkup"), "MasterElement", "CElement", UserEditableFunctions.Create(function (markup) {
            return markup.F("Root").then(function(root) {
                return Promise.all([root.f("isSubordinateRoot").val(), root.f("elementMaster")])
                .thenAll(function (isSubordinateRoot, masterElement) {
                    if (isSubordinateRoot) {
                        return masterElement.as("CElement");
                    } else {
                        return DbgObject.NULL;
                    }
                })
                .catch(function() {
                    return GetElementLookasidePointer2(root, "LOOKASIDE2_MASTER").as("CElement");
                })
            });
        }));

        DbgObject.AddExtendedField(mshtmlType("CMarkup"), "TopmostMarkup", "CMarkup", UserEditableFunctions.Create(function (markup) {
            var currentMarkup = markup;
            return markup.F("MasterElement")
            .then(function(masterElement) {
                if (masterElement.isNull()) {
                    return currentMarkup;
                } else {
                    return masterElement.F("Markup").then(function(masterMarkup) {
                        if (masterMarkup.isNull()) {
                            return currentMarkup;
                        } else {
                            currentMarkup = masterMarkup;
                            return masterMarkup.F("TopmostMarkup");
                        }
                    });
                }
            });
        }));

        DbgObject.AddExtendedField(mshtmlType("CDoc"), "PrimaryMarkup", "CMarkup", UserEditableFunctions.Create(function (doc) {
            return doc.f("_pWindowPrimary._pCWindow._pMarkup");
        }));

        function GetRootCTreeNodes() {
            return GetCDocs().F("PrimaryMarkup.Root")
            .filter(function (root) {
                 return !root.isNull();
            });
        }

        var canCastTreeNodeTypeToCElement = new Promise(function (resolve) {
            JsDbg.LookupFieldOffset(moduleName, treeNodeType.name(), "_pElement", function (result) {
                if (result.error) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
        });

        DbgObject.AddExtendedField(treeNodeType, "CElement", "CElement", UserEditableFunctions.Create(function (treeNode) {
            return canCastTreeNodeTypeToCElement.then(function (canCast) {
                if (canCast) {
                    return treeNode.as("CElement");
                } else {
                    return treeNode.f("_pElement");
                }
            });
        }));

        DbgObject.AddExtendedField(treeNodeType, "ComputedBlock", "Tree::ComputedBlock", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetLayoutAssociationFromTreeNode(treeNode, 0x1).vcast();
        }));

        DbgObject.AddExtendedField(treeNodeType, "Threadstate", "THREADSTATEUI", UserEditableFunctions.Create(function (treeNode) {
            return treeNode.F("Markup.Doc.Threadstate");
        }))

        DbgObject.AddExtendedField(treeNodeType, "FancyFormat", "CFancyFormat", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetObjectFromDataCache(treeNode.F("Threadstate").f("_pFancyFormatCache"), treeNode.f("_iFF").val());
        }));

        DbgObject.AddExtendedField(treeNodeType, "CharFormat", "CCharFormat", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetObjectFromDataCache(treeNode.F("Threadstate").f("_pCharFormatCache"), treeNode.f("_iCF").val());
        }));

        DbgObject.AddExtendedField(treeNodeType, "ParaFormat", "CParaFormat", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetObjectFromDataCache(treeNode.F("Threadstate").f("_pParaFormatCache"), treeNode.f("_iPF").val());
        }));

        DbgObject.AddExtendedField(treeNodeType, "SvgFormat", "CSvgFormat", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetObjectFromDataCache(treeNode.F("Threadstate").f("_pSvgFormatCache"), treeNode.f("_iSF").val());
        }));

        DbgObject.AddExtendedField(treeNodeType, "SubordinateMarkup", "CMarkup", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetElementLookasidePointer(treeNode, "LOOKASIDE_SUBORDINATE")
            .then(function (result) {
                if (!result.isNull()) {
                    return result.as("CElement").F("Markup");
                } else {
                    return DbgObject.NULL;
                }
            })
        }));

        DbgObject.AddExtendedField(treeNodeType, "AccessibleObject", "Aria::AccessibleObject", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetElementLookasidePointer(treeNode, "LOOKASIDE_ARIAOBJECT").as("Aria::AccessibleObject").vcast();
        }));

        function GetLayoutAssociationFromTreeNode(treeNode, flag) {
            var conversion = ({
                0x1: function(pointer) {
                    return pointer.as("void*").unembed("Tree::ComputedBlock", "associationLink");
                },
                0x2: function(pointer) {
                    return pointer.as("AssociatedTextBlock").f("textBlock");
                },
                0x4: function(pointer) {
                    return pointer.as("AssociatedStyleCache").f("styleCache");
                },
                0x8: function(pointer) {
                    return pointer.as("Layout::LayoutBox");
                }
            })[flag];

            var promise = treeNode.f("_fHasLayoutAssociationPtr").val()
                .then(function (layoutAssociationBits) {
                    if (layoutAssociationBits & flag) {
                        var bits = 0;

                        // for each bit not counting the 0x8 bit, dereference the pointer.
                        layoutAssociationBits = layoutAssociationBits & (flag - 1);
                        var pointer = treeNode.f("_pLayoutAssociation");
                        while (layoutAssociationBits > 0) {
                            if (layoutAssociationBits & 1) {
                                pointer = pointer.deref();
                            }
                            layoutAssociationBits = layoutAssociationBits >>1;
                        }

                        return conversion(pointer);
                    } else {
                        return DbgObject.NULL;
                    }
                });
            return new PromisedDbgObject(promise);
        }

        function GetFirstAssociatedLayoutBoxFromTreeNode(treeNode) {
            return GetLayoutAssociationFromTreeNode(treeNode, 0x8);
        }

        DbgObject.AddExtendedField(treeNodeType, "Markup", "CMarkup", UserEditableFunctions.Create(function (element) {
            return element.F("CElement.Markup");
        }));

        DbgObject.AddExtendedField(mshtmlType("CElement"), "Markup", "CMarkup", UserEditableFunctions.Create(function (element) {
            return element.f("rootNodeOrMarkup")
            .then(function(rootNodeOrMarkup) {
                return Promise.all([
                    element.f("parent"),
                    element.f("isSubordinateRoot").val()
                ])
                .thenAll(function (parent, isSubordinateRoot) {
                    if (parent.isNull() || isSubordinateRoot) {
                        return rootNodeOrMarkup.as("CMarkup");
                    } else {
                        return rootNodeOrMarkup.as("Tree::ANode").f("rootNodeOrMarkup").as("CMarkup");
                    }
                });
            })
            .catch(function () {
                return element.f("markup");
            })
            .catch(function() {
                return Promise.all([
                    element.f("_fHasLayoutPtr").val().catch(function() { return 0; }),
                    element.f("_fHasLayoutAry").val().catch(function() { return 0; }),
                    element.f("_fHasMarkupPtr").val().catch(function() { return 0; })
                ])
                .thenAll(function(hasLayoutPtr, hasLayoutAry, hasMarkupPtr) {
                    if (hasLayoutPtr || hasLayoutAry) {
                        return element.f("_pLayoutInfo", "_pLayout", "_chain._pLayoutInfo", "_chain._pLayout")
                        .then(function (layout) {
                            return layout.as("char").idx(0 - layout.pointerValue().mod(4)).as(layout.type.name()).f("_pMarkup");
                        })
                    } else if (hasMarkupPtr) {
                        return element.f("_chain._pMarkup", "_pMarkup")
                        .then(function (markup) {
                            return markup.as("char").idx(0 - markup.pointerValue().mod(4)).as("CMarkup");
                        })
                    } else {
                        throw new Error();
                    }
                });
            })
            .catch(function () {
                return DbgObject.create(mshtmlType("CMarkup"), 0);
            });
        }));

        DbgObject.AddExtendedField(mshtmlType("CDOMTextNode"), "Markup", "CMarkup", UserEditableFunctions.Create(function (domTextNode) {
            // TODO: older versions of the tree will require fetching the markup from the CDOMTextNode's CMarkupPointer
            return domTextNode.f("markup");
        }));

        DbgObject.AddExtendedField(mshtmlType("Tree::TextNode"), "Markup", "CMarkup", UserEditableFunctions.Create(function (textNode) {
            return textNode.f("rootNodeOrMarkup").as("Tree::ANode").f("rootNodeOrMarkup").as("CMarkup");
        }));

        DbgObject.AddExtendedField(mshtmlType("CMarkup"), "Doc", "CDoc", UserEditableFunctions.Create(function (markup) {
            return markup.f("_spSecCtx.m_pT", "_pSecCtx").f("_pDoc");
        }));

        DbgObject.AddExtendedField(mshtmlType("CStyleSheet"), "Markup", "CMarkup", UserEditableFunctions.Create(function (stylesheet) {
            return stylesheet.f("_pParentElement")
            .then(function (parentElement) {
                if (parentElement.isNull()) {
                    return stylesheet.f("_pMarkup");
                } else {
                    return parentElement.F("Markup");
                }
            })
        }))

        function searchForHtPvPvMatch(firstEntry, entryCount, index, stride, key) {
            if (index > entryCount) {
                index = index % entryCount;
            }

            return firstEntry.idx(index).then(function(entry) {
                return entry.f("pvKey").pointerValue()
                .then(function (entryKey) {
                    if ((entryKey - (entryKey % 2)) == key) {
                        return entry.f("pvVal");
                    } else if ((entryKey % 2) == 0) {
                        // No more entries with this hash.
                        return DbgObject.NULL;
                    } else {
                        return searchForHtPvPvMatch(firstEntry, entryCount, index + stride, stride, key);
                    }
                })
            });
        }

        function LookupHtPvPvValue(htpvpv, key) {
            var promise = Promise.all([htpvpv.f("_cEntMax").val(), htpvpv.f("_cStrideMask").val(), htpvpv.f("_pEnt"), key])
            .thenAll(function (entryCount, strideMask, firstEntry, key) {
                var probe = key % entryCount;
                var stride = (strideMask & (key >> 2)) + 1

                return searchForHtPvPvMatch(firstEntry, entryCount, probe, stride, key);
            });
            return new PromisedDbgObject(promise);
        }

        function GetElementLookasidePointer2(treeNode, name)
        {
            var elementPromise = treeNode.F("CElement");

            var hasLookasidePtrPromise = elementPromise
            .then(function (element) {
                return element.f("_fHasLookasidePtr2").val();
            });

            var lookasideNumberPromise = DbgObject.constantValue(mshtmlType("CElement::LOOKASIDE2"), name);

            var result = Promise.all([
                elementPromise,
                hasLookasidePtrPromise,
                lookasideNumberPromise
            ])
            .thenAll(function (element, lookasides, lookasideIndex) {
                if (lookasides & (1 << lookasideIndex)) {
                    var hashtable = element.F("Markup.Doc").f("_HtPvPv2");
                    return MSHTML.GetObjectLookasidePointer(element, lookasideIndex, hashtable);
                } else {
                    return DbgObject.NULL;
                }
            })

            return new PromisedDbgObject(result);
        }

        function GetElementLookasidePointer(treeNode, name)
        {
            var elementPromise = treeNode.F("CElement")

            var hasLookasidePtrPromise = elementPromise
            .then(function (element) {
                return element.f("elementNodeHasLookasidePointer", "_fHasLookasidePtr").val();
            });

            // During the CTreeNode/CElement merger some lookaside enum values moved around.  Currently, they're on the CTreeNode type.
            var lookasideNumberPromise = DbgObject.constantValue(treeNodeType, name)
            .then(function (index) {
                return {
                    offset:0,
                    index:index
                };
            }, function() {
                // The index is not on the CTreeNode, so it must be on the CElement.
                return DbgObject.constantValue(mshtmlType("CElement::LOOKASIDE"), name)
                .then(function (lookasideSubordinate) {
                    // Two additional cases to try: first (in reverse chronological order), when the CElement lookasides were offset by CTreeNode::LOOKASIDE_NODE_NUMBER.
                    // We identify this case by the presence of the _dwNodeFlags1 field which was added in inetcore 1563867.
                    return (DbgObject.create(DbgObjectType("edgehtml", treeNodeType), 0)).f("_dwNodeFlags1")
                    .then(
                        function () {
                            return DbgObject.constantValue(treeNodeType, "LOOKASIDE_NODE_NUMBER")
                            .then(function(lookasideNodeNumber) {
                                return {
                                    offset: lookasideNodeNumber,
                                    index: lookasideSubordinate
                                };
                            });
                        }, function () {
                            return {
                                offset:0,
                                index: lookasideSubordinate
                            };
                        }
                    )
                })
            });

            var result = Promise.all([
                elementPromise,
                hasLookasidePtrPromise,
                lookasideNumberPromise
            ])
            .thenAll(function (element, lookasides, lookasideNumber) {
                if (lookasides & (1 << lookasideNumber.index)) {
                    var hashtable = element.F("Markup.Doc").f("_HtPvPv");
                    return MSHTML.GetObjectLookasidePointer(element, lookasideNumber.offset + lookasideNumber.index, hashtable);
                } else {
                    return DbgObject.NULL;
                }
            })

            return new PromisedDbgObject(result);
        }

        function GetObjectLookasidePointer(lookasideObject, lookasideNumber, hashtable) {
            return lookasideObject.as("int").idx(lookasideNumber).pointerValue()
            .then(function (lookasideKey) {
                return MSHTML.LookupHtPvPvValue(hashtable, lookasideKey);
            });
        }

        DbgObject.AddExtendedField(mshtmlType("CMarkup"), "Threadstate", "THREADSTATEUI", UserEditableFunctions.Create(function (markup) {
            return markup.F("Doc.Threadstate");
        }));

        DbgObject.AddExtendedField(mshtmlType("CDoc"), "Threadstate", "THREADSTATEUI", UserEditableFunctions.Create(function (doc) {
            return Promise.resolve(GetDocsAndThreadstates())
            .then(function(docsAndThreadstates) {
                for (var i = 0; i < docsAndThreadstates.length; ++i) {
                    if (docsAndThreadstates[i].doc.equals(doc)) {
                        return docsAndThreadstates[i].threadstate;
                    }
                }
                return DbgObject.create(mshtmlType("THREADSTATEUI"), 0);
            });
        }));

        function GetObjectFromDataCache(cache, index) {
            var promise = Promise.all([cache, index])
            .thenAll(function(cache, index) {
                var templateMatches = cache.type.name().match(/<.*>/);
                var resultType = "void";
                if (templateMatches) {
                    resultType = templateMatches[0].substr(1, templateMatches[0].length - 2);
                }

                if (index < 0) {
                    return DbgObject.create(mshtmlType(resultType), 0);
                }

                var bucketSize = 128;
                return cache.f("_paelBuckets").idx(Math.floor(index / bucketSize)).deref().idx(index % bucketSize).f("_pvData").as(resultType);
            });

            return new PromisedDbgObject(promise);
        }

        function PatchManager() {
            var savedVersion = window.sessionStorage.getItem(this.sessionStorageKey);
            if (savedVersion == null) {
                // Default to the UI thread.
                savedVersion = Infinity;
            } else {
                savedVersion = this.parseVersion(savedVersion);
            }
            this.version = savedVersion;
            this.updateUIWidgets = function() {};
        }
        PatchManager.prototype.sessionStorageKey = "MSHTML-PatchManager-Version";

        PatchManager.prototype.getCurrentVersion = function (patchableObject) {
            function findMatchingPatch(patchPromise, versionToFind) {
                return Promise.resolve(patchPromise)
                .then(function (patch) {
                    return patch.field("_iVersion").val()
                    .then(function (version) {
                        if (version > versionToFind) {
                            return findMatchingPatch(patch.field("_pNextPatch").deref());
                        } else {
                            return {
                                patch: patch,
                                version: version
                            };
                        }
                    })
                })
            }

            return Promise.all([
                patchableObject.field("_iVersion").val(),
                findMatchingPatch(patchableObject.field("_pNextPatch").deref(), this.version)
            ])
            .thenAll(function (objectVersion, matchingPatchAndVersion) {
                var matchingPatch = matchingPatchAndVersion.patch;
                var matchingVersion = matchingPatchAndVersion.version;
                // If there is no matching patch, or the given object was actually a patch and is a better match
                // than the best patch, use the original object.  This means that getCurrentVersion can be called
                // multiple times without effect as long as the initial object was not already an earlier patch
                // the current version.
                if (matchingPatch.isNull() || (objectVersion > matchingVersion && that.version >= objectVersion)) {
                    return patchableObject;
                } else {
                    return matchingPatch.as(patchableObject.type)
                }
            });
        }
        PatchManager.prototype.setVersion = function (newVersion) {
            newVersion = this.parseVersion(newVersion);
            this.version = newVersion;
            window.sessionStorage.setItem(this.sessionStorageKey, newVersion.toString());
            this.updateUIWidgets();
        }

        PatchManager.prototype.parseVersion = function (version) {
            if (version === "Infinity" || typeof(version) == "Number") {
                return version;
            } else {
                return parseInt(version);
            }
        }

        PatchManager.prototype.createUIWidget = function (onChange) {
            function setValueAndEnsureOption(select, value) {
                if (select.querySelector("[value=\"" + value + "\"]") == null) {
                    var option = document.createElement("option");
                    option.setAttribute("value", value);
                    option.textContent = value;
                    select.appendChild(option);
                }
                select.value = value;
            }

            var that = this;
            var select = document.createElement("select");
            select.innerHTML = "<option value=Infinity>UI Thread</option><option value=0>Render Thread</option><option value=-1>Other Version...</option>";
            setValueAndEnsureOption(select, this.version);

            select.addEventListener("change", function () {
                if (select.value == -1) {
                    var promptedVersion = prompt("Which version would you like to use?");
                    if (promptedVersion == null) {
                        promptedVersion = that.version;
                    } else {
                        promptedVersion = that.parseVersion(promptedVersion);
                    }
                    setValueAndEnsureOption(select, promptedVersion)
                }

                var selectedVersion = that.parseVersion(select.value);
                if (selectedVersion != that.version) {
                    that.setVersion(selectedVersion);
                    onChange();
                }
            });

            var previousUpdateWidgets = this.updateUIWidgets;
            this.updateUIWidgets = function() {
                if (that.parseVersion(select.value) != that.version) {
                    setValueAndEnsureOption(select, that.version);
                    onChange();
                }
                previousUpdateWidgets();
            };

            return select;
        }

        var patchManager = null;
        function ensurePatchManager() {
            if (patchManager == null) {
                patchManager = new PatchManager();
                DbgObject.RegisterFHandler(function (dbgObject, path, next) {
                    return dbgObject.isType("CPatchableObject")
                    .then(function (isPatchableObject) {
                        if (isPatchableObject) {
                            return patchManager.getCurrentVersion(dbgObject);
                        } else {
                            return dbgObject;
                        }
                    })
                    .then(function (dbgObjectToUse) {
                        return next(dbgObjectToUse, path);
                    })
                })
            }
            return patchManager;
        }

        // Provide additional type info on some fields.
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bVisibility", "styleVisibility");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bDisplay", "styleDisplay");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bStyleFloat", "styleStyleFloat");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bPositionType", "stylePosition");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bOverflowX", "styleOverflow");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bOverflowY", "styleOverflow");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bPageBreakBefore", "stylePageBreak");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bPageBreakAfter", "stylePageBreak");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_uTextOverflow", "styleTextOverflow");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_fImageInterpolation", "styleInterpolation");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_uTransformStyle)", "styleTransformStyle");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_uBackfaceVisibility)", "styleBackfaceVisibility");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bMsTouchAction", "styleMsTouchAction");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bMsScrollTranslation", "styleMsTouchAction");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bMsTextCombineHorizontal", "styleMsTextCombineHorizontal");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bWrapFlow", "styleWrapFlow");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bWrapThrough", "styleWrapThrough");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_layoutPlacement", "Tree::LayoutPlacementEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_layoutType", "Tree::LayoutTypeEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedPositionType", "Tree::CssPositionEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedStyleFloat", "Tree::CssFloatEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedOverflowX", "Tree::CssOverflowEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedOverflowY", "Tree::CssOverflowEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedBreakBefore", "Tree::CssBreakEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedBreakAfter", "Tree::CssBreakEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedBreakInside", "Tree::CssBreakInsideEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedVisibility", "Tree::CssVisibilityEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedFlowDirection", "Tree::CssWritingModeEnum");
        DbgObject.AddTypeOverride(mshtmlType("CFancyFormat"), "_bNormalizedContentZooming", "Tree::CssContentZoomingEnum");
        DbgObject.AddTypeOverride(treeNodeType, "_etag", "ELEMENT_TAG");
        DbgObject.AddTypeOverride(mshtmlType("CBorderDefinition"), "_bBorderStyles", "Tree::CssBorderStyleEnum[4]");
        DbgObject.AddTypeOverride(mshtmlType("CBorderInfo"), "abStyles", "Tree::CssBorderStyleEnum[4]");
        DbgObject.AddTypeOverride(mshtmlType("CInput"), "_type", "htmlInput");
        DbgObject.AddTypeOverride(mshtmlType("Tree::RenderSafeTextBlockRun"), "_runType", "Tree::TextBlockRunTypeEnum");

        // Provide some type descriptions.
        DbgObject.AddTypeDescription(treeNodeType, "Tag", false, UserEditableFunctions.Create(function (treeNode) {
            // Get the tag representation.
            return treeNode.f("_etag").constant()
            .then(function (etagValue) {
                if (etagValue == "ETAG_GENERIC") {
                    // For generic elements, get the tag name/namespace.
                    return treeNode.F("CElement").vcast()
                    .then(function (element) {
                        return Promise.all([element.f("_cstrTagName._pch").string(), element.f("_cstrNamespace._pch").string(), element.f("_cstrNamespace._pch").isNull()])
                    })
                    .thenAll(function (tag, namespace, namespaceIsNull) {
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
                    var tag = etagValue.substr("ETAG_".length).toLowerCase();
                    return treeNode.f("isMarkupTreeNode", "hasScriptableIdentity").val()
                    .then((isMarkupTreeNode) => {
                        return !isMarkupTreeNode ? ("::" + tag) : tag;
                    }, () => {
                        return tag;
                    });
                }
            })
            .then(function (tag) {
                return "&lt;" + tag + "&gt;";
            })
        }));

        DbgObject.AddTypeDescription(treeNodeType, "Default", true, function (treeNode) {
            return treeNode.desc("Tag")
            .then(function (tag) {
                return treeNode.ptr() + " (" + tag + ")";
            })
        })

        DbgObject.AddTypeDescription(function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^_?(style[A-z0-9]+)$/); }, "CSS Value", true, function(enumObj) {
            var enumString = enumObj.type.name().replace(/^_?(style[A-z0-9]+)$/, "$1");
            return Promise.resolve(enumObj.as("_" + enumString).constant())
            .then(
                function(k) { return k.substr(enumString.length); },
                function(err) { 
                    return enumObj.val()
                    .then(function(v) { 
                        return v + "?";
                    });
                }
            )
        });

        DbgObject.AddTypeDescription(function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^(Tree|Layout).*::(.*Enum)$/); }, "Enum Value", true, function (enumObj) {
            var enumString = enumObj.type.name().replace(/^(Tree|Layout).*::(.*Enum)$/, "$2_");
            return Promise.resolve(enumObj.constant())
                .then(
                    function(k) { return k.indexOf(enumString) == 0 ? k.substr(enumString.length) : k; },
                    function(err) {
                        return enumObj.val()
                        .then(function(v) { 
                            return v + "?";
                        });
                    }
                );
        });

        var colorTypesWithInlineColorRef = {"CT_COLORREF":true, "CT_COLORREFA":true, "CT_POUND1":true, "CT_POUND2":true, "CT_POUND3":true, "CT_POUND4":true, "CT_POUND5":true, "CT_POUND6":true, "CT_RGBSPEC":true, "CT_RGBASPEC":true, "CT_HSLSPEC":true, "CT_HSLASPEC":true};
        var colorTypesWithAlpha = {"CT_COLORREFA": true, "CT_RGBASPEC": true, "CT_HSLASPEC": true};

        DbgObject.AddTypeDescription(mshtmlType("CColorValue"), "Color", true, function(color) {
            return Promise.all([color.f("_ct").as("CColorValue::COLORTYPE").constant(), color.f("_crValue").val(), color.f("_flAlpha").val()])
            .thenAll(function(colorType, inlineColorRef, alpha) {
                inlineColorRef = inlineColorRef & 0xFFFFFF;
                var hasInlineColorRef = colorType in colorTypesWithInlineColorRef;
                var hasAlpha = colorType in colorTypesWithAlpha;
                function cssColor(colorRef, alpha) {
                    if (!hasAlpha) {
                        // Ignore alpha unless the type has alpha (see CColorValue::HasAlpha).
                        alpha = 1.0;
                    }
                    var rgb = [colorRef & 0xFF, (colorRef >> 8) & 0xFF, (colorRef >> 16) & 0xFF];
                    return "rgba(" + rgb[0].toString() + ", " + rgb[1].toString() + ", " + rgb[2].toString() + ", " + alpha + ")";
                }

                function swatch(color) {
                    return "<div style='display:inline-block;border:thin solid black;width:2ex;height:1ex;background-color:" + color + ";'></div>";
                }

                function getSystemColor(index) {
                    return DbgObject.global("user32", "gpsi").deref().f("argbSystem").idx(index).val();
                }

                var indirectColorRefs = {
                    "CT_NAMEDHTML" : function() {
                        return DbgObject.global(mshtmlType("g_HtmlColorTable")).f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val();
                    },
                    "CT_NAMEDCSS" : function() {
                        return DbgObject.global(mshtmlType("g_CssColorTable")).f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val();
                    },
                    "CT_NAMEDSYS" : function() {
                        return Promise.resolve(DbgObject.global(mshtmlType("g_SystemColorTable")).f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val())
                            .then(function(x) {
                                return x & 0xFFFFFF;
                            })
                            .then(getSystemColor);
                    },
                    "CT_SYSCOLOR" : function() {
                        return getSystemColor(color.f("_iColor").val());
                    }
                };

                var colorRef;
                if (colorType in indirectColorRefs) {
                    colorRef = indirectColorRefs[colorType]();
                } else if (hasInlineColorRef) {
                    colorRef = inlineColorRef;
                } else {
                    return colorType;
                }

                // If we have a color ref, use that.
                return Promise.resolve(colorRef)
                .then(function(colorRef) {
                    colorRef = colorRef & 0xFFFFFF;
                    var color = cssColor(colorRef, alpha);
                    return swatch(color) + " " + colorType + " " + color;
                }, function(error) {
                    return colorType + " 0x" + inlineColorRef.toString(16) + " " + alpha;
                });
            });
        });

        DbgObject.AddTypeDescription(mshtmlType("CAttrValue"), "Name", false, UserEditableFunctions.Create(function (attrVal) {
            return attrVal.f("_wFlags.fAA_Extra_HasDispId").val()
            .then(function (hasDispId) {
                if (hasDispId) {
                    return attrVal.f("_dispid").uval()
                    .then(function (dispid) {
                        var names = MSHTML.GetDispIdNames(dispid);
                        if (names == null) {
                            return "DISPID(0x" + dispid.toString(16) + ")";
                        } else if (names.indexOf("DISPID_CElement_propdescname") > 0) {
                            // This DISPID has lots of collisions and is common enoguh that enumerating every "name" variant is annoying.
                            return "name";
                        } else {
                            // There are multiple colliding dispids.
                            return names.join("/");
                        }
                    })
                } else {
                    return attrVal.f("_pPropertyDesc.pstrName").string();
                }
            })
        }));

        DbgObject.AddTypeOverride(mshtmlType("CAttrValue::AttrFlags"), "_aaType", "CAttrValue::AATYPE");
        DbgObject.AddTypeOverride(mshtmlType("CAttrValue::AttrFlags"), "_aaVTType", "VARENUM");

        DbgObject.AddTypeDescription(mshtmlType("CAttrValue"), "Value", false, UserEditableFunctions.Create(function (attrVal) {
            return attrVal.f("_wFlags.fAA_Extra_HasDispId").val()
            .then(function (hasDispId) {
                if (hasDispId) {
                    return undefined;
                } else {
                    return attrVal.f("_pPropertyDesc.pfnHandleProperty").pointerValue()
                    .then(DbgObject.symbol)
                    .then(function (symbol) {
                        var handleProperty = symbol.split("!")[1];
                        if (handleProperty == "PROPERTYDESC::HandleColorProperty") {
                            return attrVal.f("uVal._llVal").as("CColorValue");
                        } else if (handleProperty == "PROPERTYDESC::HandleEnumProperty") {
                            return attrVal.f("uVal._lVal").val()
                            .then(function (enumValue) {
                                return attrVal.f("_pPropertyDesc").F("EnumDesc").array("Values")
                                .filter(function (enumPair) {
                                    return enumPair.f("iVal").val().then(function (constantValue) {
                                        return constantValue == enumValue;
                                    })
                                })
                                .f("pszName").string()
                                .then(function (results) {
                                    return results.length == 0 ? enumValue : results[0];
                                })
                            })
                        } else if (handleProperty == "PROPERTYDESC::HandleTypedValueProperty") {
                            return attrVal.f("uVal._llVal").as("CUnitValue");
                        }
                    })
                }
            })
            .then(function (result) {
                if (result == undefined) {
                    return attrVal.f("_wFlags._aaVTType").constant()
                    .then(null, function (err) {
                        // If it's not a valid VARENUM, it could be one of the extended ones defined on CAttrValue.
                        return attrVal.f("_wFlags._aaVTType").as("CAttrValue").constant();
                    })
                    .then(null, function (err) {
                        return "";
                    })
                    .then(function (dataType) {
                        var dataValue = attrVal.f("uVal");
                        var cases = {
                            "VT_BSTR": function () { return dataValue.f("_bstrVal") },
                            "VT_LPWSTR": function () { return dataValue.f("_lpstrVal") },
                            "VT_I4": function () { return dataValue.f("_intVal") },
                            "VT_I8": function () { return dataValue.f("_llVal") },
                            "VT_R4": function () { return dataValue.f("_fltVal") },
                            "VT_R8": function () { return dataValue.f("_dblVal") },
                            "VT_UNKNOWN": function() { return dataValue.f("_pUnk").vcast() },
                            "VT_ATTRARRAY": function() { return dataValue.f("_pAA") },
                            "VT_AAHEADER": function() { return dataValue.f("_pAAHeader") },
                            "VT_NSATTR": function() { return dataValue.f("_pNSAttr") },
                            "VT_PTR": function () { return dataValue.f("_pvVal") },
                        };

                        if (dataType in cases) {
                            return cases[dataType]();
                        } else {
                            return attrVal.f("uVal._llVal").ubigval()
                            .then(function (val) {
                                return dataType + " 0x" + val.toString(16);
                            })
                        }
                    })
                } else {
                    return result;
                }
            })
        }));

        DbgObject.AddExtendedField(mshtmlType("PROPERTYDESC"), "EnumDesc", "ENUMDESC", UserEditableFunctions.Create(function (propDesc) {
            return propDesc.as("PROPERTYDESC_BASIC").f("b.dwPPFlags").as("PROPPARAM_FLAGS")
            .then(function (flags) {
                return flags.hasConstantFlag("PROPPARAM_ENUM")
                .then(function (hasEnum) {
                    if (!hasEnum) {
                        return DbgObject.NULL;
                    } else {
                        return flags.hasConstantFlag("PROPPARAM_ANUMBER")
                        .then(function (hasNumber) {
                            if (hasNumber) {
                                return propDesc.as("PROPERTYDESC_NUMPROP_ENUMREF").f("pE").as("ENUMDESC");
                            } else {
                                return propDesc.as("PROPERTYDESC_NUMPROP").f("b.lMax").as("ENUMDESC*").deref();
                            }
                        });
                    }
                })
            });
        }));

        DbgObject.AddArrayField(mshtmlType("ENUMDESC"), "Values", "ENUMDESC::ENUMPAIR", UserEditableFunctions.Create(function (enumDesc) {
            return enumDesc.f("aenumpairs").array(enumDesc.f("cEnums").val());
        }));

        DbgObject.AddTypeDescription(mshtmlType("CUnitValue"), "UnitValue", true, function(unitval) {
            var SCALEMULT_NULLVALUE        = 0;
            var SCALEMULT_POINT            = 1000;
            var SCALEMULT_PICA             = 100;
            var SCALEMULT_INCH             = 1000;
            var SCALEMULT_CM               = 1000;
            var SCALEMULT_MM               = 100;
            var SCALEMULT_EM               = 100;
            var SCALEMULT_EX               = 100;
            var SCALEMULT_LAYOUTPIXELS     = 1;
            var SCALEMULT_DOCPIXELS        = 100;
            var SCALEMULT_PERCENT          = 100;
            var SCALEMULT_TIMESRELATIVE    = 100;
            var SCALEMULT_FLOAT            = 10000;
            var SCALEMULT_INTEGER          = 1;
            var SCALEMULT_RELATIVE         = 1;
            var SCALEMULT_ENUM             = 1;
            var SCALEMULT_VH               = 100;
            var SCALEMULT_VW               = 100;
            var SCALEMULT_VMIN             = 100;
            var SCALEMULT_CH               = 100;
            var SCALEMULT_REM              = 100;
            var SCALEMULT_FRACTION         = 10000;

            var typedUnits = {
                "UNIT_POINT": {scale: SCALEMULT_POINT, suffix:"pt"},
                "UNIT_PICA": {scale: SCALEMULT_PICA, suffix:"pc"},
                "UNIT_INCH": {scale: SCALEMULT_INCH, suffix:"in"},
                "UNIT_CM": {scale: SCALEMULT_CM, suffix:"cm"},
                "UNIT_MM": {scale: SCALEMULT_MM, suffix:"mm"},
                "UNIT_EM": {scale: SCALEMULT_EM, suffix:"em"},
                "UNIT_EX": {scale: SCALEMULT_EX, suffix:"ex"},
                "UNIT_LAYOUTPIXELS": {scale: SCALEMULT_LAYOUTPIXELS, suffix:"Lpx"},
                "UNIT_DOCPIXELS": {scale: SCALEMULT_DOCPIXELS, suffix:"px"},
                "UNIT_PERCENT": {scale: SCALEMULT_PERCENT, suffix:"%"},
                "UNIT_TIMESRELATIVE": {scale: SCALEMULT_TIMESRELATIVE, suffix:"*"},
                "UNIT_FLOAT": {scale: SCALEMULT_FLOAT, suffix:"float"},
                "UNIT_INTEGER": {scale: SCALEMULT_INTEGER, suffix:""},
                "UNIT_RELATIVE": {scale: SCALEMULT_RELATIVE, suffix:""},
                // ENUM is handled elsewhere.
                "UNIT_VH": {scale: SCALEMULT_VH, suffix:"vh"},
                "UNIT_VW": {scale: SCALEMULT_VW, suffix:"vw"},
                "UNIT_VMIN": {scale: SCALEMULT_VMIN, suffix:"vmin"},
                "UNIT_CH": {scale: SCALEMULT_CH, suffix:"ch"},
                "UNIT_REM": {scale: SCALEMULT_REM, suffix:"rem"},
                "UNIT_FRACTION": {scale: SCALEMULT_FRACTION, suffix:"fr"}
            };

            var type = unitval.f("_byteType").as("CUnitValue::UNITVALUETYPE").constant();
            var storageType = unitval.f("_storageType").as("CTypedValue::PRECISION_TYPE").constant();

            return Promise.all([type, storageType])
            .thenAll(function(type, storageType) {
                var storageField = storageType == "PRECISION_FLOAT" ? "_flValue" : "_lValue";

                if (type in typedUnits) {
                    var unit = typedUnits[type];
                    return unitval.f(storageField).val()
                    .then(function(value) {
                        return value / unit.scale + unit.suffix;
                    });
                } else if (type == "UNIT_NULLVALUE") {
                    return "_";
                } else {
                    return unitval.f(storageField).val()
                    .then(function(value) {
                        return type + " " + value;
                    })
                }
            });
        });

        DbgObject.AddTypeDescription(mshtmlType("Tree::SComputedValue"), "ComputedValue", true, function(computedValue) {
            return Promise.resolve(computedValue.as("CUnitValue").desc())
            .then(function(unitvalueDesc) {
                if (unitvalueDesc == "_") {
                    return "auto";
                } else {
                    return unitvalueDesc;
                }
            })
        });

        function describeLayoutMeasure(layoutMeasure) {
            return layoutMeasure.val().then(function(val) { return val / 100 + "px"; });
        }

        DbgObject.AddTypeDescription(mshtmlType("Math::SLayoutMeasure"), "Length", true, describeLayoutMeasure);
        DbgObject.AddTypeDescription(mshtmlType("Utilities::SLayoutMeasure"), "Length", true, describeLayoutMeasure);

        DbgObject.AddTypeDescription(mshtmlType("Layout::SBoxFrame"), "Frame", true, function(rect) {
            var sideNames = ["top", "right", "bottom", "left"];
            return Promise.all(sideNames.map(function(side) { return rect.f(side).desc(); }))
            .then(function (sides) {
                return sides.join(" ");
            });
        });

        function describePoint(point) {
            var fieldNames = ["x", "y"];
             return Promise.all(fieldNames.map(function(side) { return point.f(side).desc(); }))
             .then(function (values) {
                 return "(" + values[0] + ", " + values[1] + ")";
             }); 
        }

        DbgObject.AddTypeDescription(mshtmlType("Math::SPoint"), "Point", true, describePoint);
        DbgObject.AddTypeDescription(mshtmlType("Utilities::SPoint"), "Point", true, describePoint);

        DbgObject.AddTypeDescription(mshtmlType("Microsoft::CFlat::ReferenceCount"), "RefCount", true, function (refCount) {
            return refCount.f("_refCount").val();
        });

        DbgObject.AddTypeDescription(function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^TSmartPointer<.*>$/) != null; }, "Pointer", true, function (smartPointer) {
            return smartPointer.f("m_pT").desc();
        })

        DbgObject.AddArrayField(
            function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^SArray<.*>$/) != null; },
            "Items",
            function (type) { return type.name().match(/^SArray<(.*)>$/)[1]; },
            function (array) {
                var arrayStart = array.f("_array");
                return arrayStart.array(arrayStart.as("SArrayHeader").idx(-1).f("Length"));
            }
        );

        DbgObject.AddArrayField(
            function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^Microsoft::CFlat::Array<.*,1>$/) != null; },
            "Items",
            function (type) { return type.name().match(/^Microsoft::CFlat::Array<(.*),1>$/)[1]; },
            function (array) {
                if (array.isNull()) {
                    return [];
                } else {
                    return array.f("_data._data", "_data").array(array.f("_data._bounds.Length", "_bounds.Length").val());
                }
            }
        );

        DbgObject.AddArrayField(
            function(type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^Layout::.*PatchableArray<.*>$/) != null; },
            "Items",
            function (type) { return type.name().match(/^Layout::.*PatchableArray<(.*)>$/)[1]; },
            function(array) {
                return array.f("data.Array").array("Items");
            }
        );

        DbgObject.AddArrayField(
            function(type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^(Collections|CFlatRuntime)::SRawArray<.*>$/) != null; },
            "Items",
            function(type) { return type.name().match(/^(Collections|CFlatRuntime)::SRawArray<(.*)>$/)[2]; },
            function(array) {
                return array.f("data").f("ptr", "").array(array.f("length"));
            }
        );

        DbgObject.AddArrayField(
            function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^Microsoft::CFlat::TrailingArrayField<.*>$/) != null; },
            "Items",
            function (type) { return type.name().match(/^Microsoft::CFlat::TrailingArrayField<(.*)>$/)[1]; },
            function (array) {
                if (array.isNull()) {
                    return [];
                } else {
                    return array.f("_elements").array(array.f("_length").val());
                }
            }
        );

        DbgObject.AddArrayField(
            function(type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^CDataAry<.*>$/) != null; },
            "Items",
            function(type) {
                return DbgObjectType(type.templateParameters()[0], type);
            },
            function (array) {
                return array.f("_pv").as(DbgObjectType(array.type.templateParameters()[0], array.type)).array(array.f("_c"));
            }
        );

        DbgObject.AddArrayField(
            function(type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^CPtrAry<.*>$/) != null; },
            "Items",
            function(type) {
                return DbgObjectType(type.templateParameters()[0], type).dereferenced();
            },
            function (array) {
                return array.f("_pv").as(DbgObjectType(array.type.templateParameters()[0], array.type)).array(array.f("_c")).deref();
            }
        );

        function getCircularBufferItems(items, count, offset) {
            var upperItemCount = Math.min(arrayLength - offset, count);
            var lowerItemCount = Math.max(offset + count - arrayLength, 0);
            return Promise.all([
                arrayStart.idx(offset).array(upperItemCount),
                arrayStart.idx(0).array(lowerItemCount)
            ])
            .thenAll(function(firstArray, secondArray) {
                // Return the circular buffer as a single array in the correct order
                return firstArray.concat(secondArray);
            });
        }

        DbgObject.AddArrayField(
            function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^(Collections|Utilities)::SCircularBuffer<.*>$/) != null; },
            "Items",
            function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^(Collections|Utilities)::SCircularBuffer<(.*)>$/)[2]; },
            function (buffer) {
                return Promise.all([
                    buffer.f("items.m_pT").array("Items"),
                    buffer.f("count").val(),
                    buffer.f("offset").val()
                ])
                .thenAll(function (items, count, offset) {
                    var upperItemCount = Math.min(items.length - offset, count);
                    var lowerItemCount = Math.max(offset + count - items.length, 0);
                    return items.slice(offset, upperItemCount).concat(items.slice(0, lowerItemCount));
                });
            }
        );

        DbgObject.AddArrayField(
            function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^Collections::SGrowingArray<.*>$/) != null; },
            "Items",
            function (type) { return type.name().match(/^Collections::SGrowingArray<(.*)>$/)[1]; },
            function (growingArray) {
                return growingArray.f("items._array").array(growingArray.f("count"));
            }
        );

        DbgObject.AddArrayField(
            function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^Utilities::SGrowingArray<.*>$/) != null; },
            "Items",
            function (type) { return type.name().match(/^Utilities::SGrowingArray<(.*)>$/)[1]; },
            function (growingArray) {

                if (growingArray.isNull()) {
                    return [];
                } else {
                    return Promise.all([growingArray.f("items.m_pT").array("Items"), growingArray.f("count").val()])
                    .thenAll(function (items, count) {
                        return items.slice(0, count);
                    })
                }
            }
        );

        function separateTemplateArguments(templateArguments) {
            var result = [];
            // Find the commas that are not contained within other template arguments.
            var stackDepth = 0;
            var characterAfterLastComma = 0;
            for (var i = 0; i < templateArguments.length; ++i) {
                var c = templateArguments[i];
                if (c == "," && stackDepth == 0) {
                    result.push(templateArguments.substr(characterAfterLastComma, i - characterAfterLastComma));
                    characterAfterLastComma = i + 1;
                } else if (c == "<") {
                    ++stackDepth;
                } else if (c == ">") {
                    --stackDepth;
                }
            }
            return result;
        }

        DbgObject.AddArrayField(
            function(type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^(CModernArray)<.*>$/) != null; },
            "Items",
            function(type) {
                return type.templateParameters()[0];
            },
            function (array) {
                var innerType = separateTemplateArguments(array.type.name().match(/^(CModernArray)<(.*)>$/)[2])[0];
                var result = array.f("_aT").as(innerType).array(array.f("_nSize"));
                return result;
            }
        )

        DbgObject.AddArrayField(
            function (type) { return type.moduleOrSyntheticName() == moduleName && type.name().indexOf("CHtPvPv") == 0; },
            "Items",
            mshtmlType("HashTableEntry"),
            function (ht) {
                return ht.f("_pEnt").array(ht.f("_cEntMax"))
                .filter(
                    function (entry) {
                        return entry.f("pvKey").pointerValue()
                        .then(function (pointerVal) {
                            return pointerVal > 3;
                        })
                    }
                );
            }
        );

        DbgObject.AddExtendedField(
            function(type) { return type.moduleOrSyntheticName() == moduleName && type.name().match(/^PointerBitReuse<(.*)>$/) != null; },
            "Object",
            function (type) {
                return type.templateParameters()[0];
            },
            function (pointerBitReuse) {
                return pointerBitReuse.field("_ptr").deref()
                .then(function (deref) {
                    var address = deref.pointerValue();
                    address = address.minus(address.mod(4));
                    return DbgObject.create(deref.type, address);
                })
            })

        var dispidNameToValue = {};
        var dispidValueToName = {};
        function registerDispId(name, value) {
            if (!(value in dispidValueToName)) {
                dispidValueToName[value] = [];
            }
            dispidValueToName[value].push(name);
            dispidNameToValue[name] = value;
        }

        DbgObject.AddExtendedField(DbgObjectType("edgehtml!void"), "Var", DbgObjectType("chakra!Js::RecyclableObject"), (voidObject) => {
            return voidObject.dcast("chakra!Js::RecyclableObject");
        });

        DbgObject.AddExtendedField(DbgObjectType("chakra!Js::RecyclableObject"), "Custom External Object", DbgObjectType("chakra!Js::CustomExternalObject"), (recycableObject) => {
            return recycableObject.dcast("chakra!Js::CustomExternalObject");
        });

        DbgObject.AddTypeDescription(DbgObjectType("chakra!Js::RecyclableObject"), "Var description", false, (recycableObject) => {
            return Promise.all([recycableObject.f("type").f("typeId").val(), recycableObject.f("type").desc("Type name")])
            .thenAll((typeId, typeName) => {
                return IsCBaseOrSimilarType(typeId)
                .then((isCBaseOrSimilarType) => {
                    if (isCBaseOrSimilarType) {
                        return Promise.all([recycableObject.F("Custom External Object").F("VarExtensionBase").F("Base"), recycableObject.F("Custom External Object").F("VarExtensionBase").F("Base").vcast()])
                        .thenAll((cbase, vcasted) => {
                            var description = "<span style='color:blue'>" + typeName + "</span> Var";
                            if (!cbase.isNull()) {
                                description += ", CBase: <span style='color:#aaa'>" + cbase.ptr() + "</span> (" + vcasted.type.name() + ")";
                            }
                            return description;
                        });
                    } else {
                        var description;
                        if (typeName === "Unspecified") {
                            description = "<span style='color:red'>";
                        } else {
                            description = "<span style='color:blue'>";
                        }
                        description += typeName + "</span> Var";
                        return description;
                    }
                });
            });
        });

        DbgObject.AddTypeDescription(DbgObjectType("chakra!Js::TypeId"), "Name", true, (typeId) => {
            return Promise.all([typeId.val(), MSHTML.GetJSTypeIdMap(), DbgObject.globalConstantValue("edgehtml", "JSIntegration::JSTypeID_ReservedRangeStart"), DbgObject.globalConstantValue("edgehtml", "JSIntegration::JSTypeID_ReservedRangeEnd")])
            .thenAll((typeIdVal, typeIdMap, reservedRangeStart, reservedRangeEnd) => {
                var typeIdName = typeIdMap[typeIdVal];
                if (typeIdName) {
                    return typeIdName;
                } else if (typeIdVal < reservedRangeStart) {
                    return typeId.constant();
                } else {
                    console.assert(typeIdVal > reservedRangeEnd);
                    return "Unspecified";
                }
            });
        });

        DbgObject.AddTypeDescription(DbgObjectType("chakra!Js::Type"), "Type name", false, (type) => {
            return type.f("typeId").desc("Name")
            .then((typeIdName) => {
                return typeIdName.replace("JSIntegration::JSTypeID_", "").replace("TypeIds_", "");
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("chakra!Js::CustomExternalObject"), "VarExtensionBase", DbgObjectType("edgehtml!VarExtensionBase"), (customExternalObject) => {
            return customExternalObject.f("type").f("typeId").val()
            .then((typeId) => {
                return IsCBaseOrSimilarType(typeId)
                .then((isCBaseOrSimilarType) => {
                    if (isCBaseOrSimilarType) {
                        return customExternalObject.idx(1).as("edgehtml!VarExtensionBase", true);
                    } else {
                        return DbgObject.NULL;
                    }
                });
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("chakra!Js::CustomExternalObject"), "DispatchMethodInfo", DbgObjectType("edgehtml!DispatchMethodInfo"), (customExternalObject) => {
            return customExternalObject.f("type").f("typeId").desc("Name")
            .then((typeIdName) => {
                if ((typeIdName == "JSIntegration::JSTypeID_DispatchMethod") || (typeIdName == "JSIntegration::JSTypeID_ExternalMethod")) {
                    return customExternalObject.idx(1).as("edgehtml!DispatchMethodInfo", true);
                } else {
                    return DbgObject.NULL;
                }
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("chakra!Js::CustomExternalObject"), "CustomVar", DbgObjectType("edgehtml!VarArray"), (customExternalObject) => {
            return customExternalObject.f("type").f("typeId").desc("Name")
            .then((typeIdName) => {
                if (typeIdName == "JSIntegration::JSTypeID_CustomVar") {
                    return customExternalObject.idx(1).as("edgehtml!VarArray", true);
                } else {
                    return DbgObject.NULL;
                }
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("chakra!Js::CustomExternalObject"), "FunctionWrapper", DbgObjectType("chakra!Js::RecyclableObject"), (customExternalObject) => {
            return customExternalObject.f("type").f("typeId").desc("Name")
            .then((typeIdName) => {
                if (typeIdName == "JSIntegration::JSTypeID_FunctionWrapper") {
                    return customExternalObject.idx(1).as("chakra!Js::RecyclableObject", true);
                } else {
                    return DbgObject.NULL;
                }
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("chakra!Js::CustomExternalObject"), "MirrorContext", DbgObjectType("chakra!Js::RecyclableObject"), (customExternalObject) => {
            return customExternalObject.f("type").f("typeId").desc("Name")
            .then((typeIdName) => {
                if (typeIdName == "JSIntegration::JSTypeID_MirrorContext") {
                    return customExternalObject.idx(1).as("chakra!Js::RecyclableObject", true);
                } else {
                    return DbgObject.NULL;
                }
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("chakra!Js::CustomExternalObject"), "MirrorFunction", DbgObjectType("chakra!Js::RecyclableObject"), (customExternalObject) => {
            return customExternalObject.f("type").f("typeId").desc("Name")
            .then((typeIdName) => {
                if (typeIdName == "JSIntegration::JSTypeID_MirrorFunction") {
                    return customExternalObject.idx(1).as("chakra!Js::RecyclableObject", true);
                } else {
                    return DbgObject.NULL;
                }
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("edgehtml!VarExtensionBase"), "VarExtension", DbgObjectType("edgehtml!VarExtension"), (varExtensionBase) => {
            return varExtensionBase.F("Base")
            .then((cbase) => {
                if (!cbase.isNull()) {
                    return IsCBaseGCNative(cbase)
                    .then((isCBaseGCNative) => {
                        if (isCBaseGCNative) {
                            return DbgObject.NULL;
                        } else {
                            return varExtensionBase.as("edgehtml!VarExtension", true);
                        }
                    });
                } else {
                    return varExtensionBase.as("edgehtml!VarExtension", true);
                }
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("edgehtml!VarExtensionBase"), "GCVarExtension", DbgObjectType("edgehtml!GCVarExtension"), (varExtensionBase) => {
            return varExtensionBase.F("Base")
            .then((cbase) => {
                if (!cbase.isNull()) {
                    return IsCBaseGCNative(cbase)
                    .then((isCBaseGCNative) => {
                        if (isCBaseGCNative) {
                            return varExtensionBase.as("edgehtml!GCVarExtension", true);
                        } else {
                            return DbgObject.NULL;
                        }
                    });
                } else {
                    return DbgObject.NULL;
                }
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("edgehtml!VarExtensionBase"), "Base", DbgObjectType("edgehtml!CBase"), (varExtensionBase) => {
            return varExtensionBase.f("_this").F("Object");
        });

        DbgObject.AddExtendedField(DbgObjectType("edgehtml!CBase"), "Var", DbgObjectType("chakra!Js::CustomExternalObject"), (base) => {
            return base.f("_JSBind_Var").F("Object").F("Var").F("Custom External Object");
        });

        DbgObject.AddArrayField(DbgObjectType("edgehtml!VarExtension"), "Subobjects", DbgObjectType("chakra!Js::CustomExternalObject"), (varExtension) => {
            return varExtension.f("_subobjects").as("chakra!Js::CustomExternalObject", true).list((subObject) => {
                return subObject.F("VarExtensionBase").F("VarExtension")
                .then((subObjectVarExtension) => {
                    return subObjectVarExtension.f("_next").as("chakra!Js::CustomExternalObject", true);
                })
            });
        });

        DbgObject.AddArrayField(DbgObjectType("edgehtml!VarExtension"), "References", DbgObjectType("chakra!Js::RecyclableObject"), (varExtension) => {
            return varExtension.f("_reference")
            .then((reference) => {
                var hasNoReferences = reference.isNull();
                if (hasNoReferences) {
                    return [];
                } else {
                    return varExtension.f("_this").deref()
                    .then((pointerbitreuse) => {
                        var hasSingleReference = new PointerMath.Pointer(pointerbitreuse.pointerValue().and(bigInt(1))).isNull();
                        if (hasSingleReference) {
                            return [reference.as("chakra!Js::RecyclableObject")];
                        } else {
                            // reference is array of multiple references
                            return reference.F("Var").F("Custom External Object")
                            .then((customExternalObject) => {
                                return customExternalObject.idx(1).as("edgehtml!VarArray", true).array("Vars");
                            })
                        }
                    })
                }
            });
        });

        DbgObject.AddExtendedField(DbgObjectType("edgehtml!VarExtension"), "Subobject Parent", DbgObjectType("chakra!Js::CustomExternalObject"), (varExtension) => {
            return getSubobjectParentFromVarExtension(varExtension);
        });

        function getSubobjectParentFromVarExtension(varExtension) {
            return varExtension.f("_prev")
            .then((previousVarAsVoid) => {
                if (!previousVarAsVoid.isNull()) {
                    return Promise.all([previousVarAsVoid.F("Var").F("Custom External Object"), previousVarAsVoid.F("Var").F("Custom External Object").F("VarExtensionBase").F("VarExtension")])
                    .thenAll((previousCustomExternalObject, previousVarExtension) => {
                        return previousVarExtension.f("_subObjects")
                        .then((firstSubobjectOfPreviousVar) => {
                            if (!firstSubobjectOfPreviousVar.isNull()) {
                                return firstSubobjectOfPreviousVar.F("Var").F("Custom External Object").F("VarExtensionBase").F("VarExtension")
                                .then((varExtensionOfFirstSubobjectOfPreviousVar) => {
                                    if (varExtensionOfFirstSubobjectOfPreviousVar.equals(varExtension)) {
                                        // parent found
                                        return varExtension.f("_prev").F("Var").F("Custom External Object");
                                    } else {
                                        return getSubobjectParentFromVarExtension(previousVarExtension);
                                    }
                                });
                            } else {
                                return getSubobjectParentFromVarExtension(previousVarExtension);
                            }
                        });
                    });
                } else {
                    return DbgObject.NULL;
                }
            });
        }

        DbgObject.AddArrayField(DbgObjectType("edgehtml!VarExtension"), "Private slots", DbgObjectType("chakra!Js::RecyclableObject"), (varExtension) => {
            return getInstanceSlotsFromVarExtension(varExtension);
        });

        DbgObject.AddArrayField(DbgObjectType("edgehtml!GCVarExtension"), "Instance slots", DbgObjectType("chakra!Js::RecycableObject"), (gcVarExtension) => {
            return getInstanceSlotsFromVarExtension(gcVarExtension);
        });

        function getInstanceSlotsFromVarExtension(varExtension) {
            return varExtension.F("Base").F("Var").then((customExternalObject) => {
                return Promise.all([DbgObject.globalConstantValue("edgehtml", "JSIntegration::JSTypeID_ReservedRangeStart"), customExternalObject.f("type").f("typeId").val()])
                .thenAll((reservedRangeStart, typeId) => {
                    return DbgObject.global("edgehtml", "CJScript9Holder::m_StaticTypeDescriptors").idx(typeId - reservedRangeStart).f("VarExtensionPointerCount").val()
                    .then((varExtensionPointerCount) => {
                        return getFirstInstanceSlotFromVarExtensionBase(varExtension)
                        .then((firstInstanceSlot) => {
                            return firstInstanceSlot.deref()
                            .then((firstInstanceSlotValue) => {
                                if (!firstInstanceSlotValue.isNull()) {
                                    return varExtension.as("edgehtml!void*", true).size()
                                    .then((voidptrSize) => {
                                        var varExtensionFieldsSize = firstInstanceSlot.pointerValue().minus(varExtension.pointerValue());
                                        var varExtensionFieldsCount = (varExtensionFieldsSize / voidptrSize);
                                        var numInstanceSlots = varExtensionPointerCount - varExtensionFieldsCount;
                                        return firstInstanceSlot.array(numInstanceSlots)
                                        .map((varAsVoidPtr) => {
                                            return varAsVoidPtr.deref().F("Var");
                                        });
                                    });
                                } else {
                                    return [];
                                }
                            });
                        });
                    });
                });
            });
        }
    
        function getFirstInstanceSlotFromVarExtensionBase(varExtensionBase) {
            return varExtensionBase.as("edgehtml!VarExtensionBase", true).F("Base")
            .then((cbase) => {
                if (!cbase.isNull()) {
                    return IsCBaseGCNative(cbase)
                    .then((isCBaseGCNative) => {
                        if (isCBaseGCNative) {
                            return varExtensionBase.as("edgehtml!GCVarExtension", true).f("_instanceSlots");
                        } else {
                            return varExtensionBase.as("edgehtml!VarExtension", true).f("_privateSlots");
                        }
                    });
                } else {
                    return varExtensionBase.as("edgehtml!VarExtension", true).f("_privateSlots");
                }
            });
        }

        DbgObject.AddArrayField(DbgObjectType("edgehtml!VarArray"), "Vars", DbgObjectType("chakra!Js::RecyclableObject"), (varArray) => {
            return varArray.f("_size").val()
            .then((size) => {
                return varArray.f("_vars").array(size)
                .map((varAsVoidPtr) => {
                    return varAsVoidPtr.deref().F("Var");
                });
            });
        });

        MSHTML = {
            _help : {
                name: "MSHTML",
                description: "mshtml.dll/edgehtml.dll-specific functionality."
            },

            _help_IsCBaseGCNative: {
                description:"Checks if the given CBase is GC-native.",
                arguments: [
                    {name: "base", type:"DbgObject", description: "DbgObject representing the base to test."},
                ],
                returns: "(A promise to) a bool: true if the given base is GC-native, false otherwise."
            },
            IsCBaseGCNative: IsCBaseGCNative,

            _help_GetJSTypeIdMap: {
                description:"Retrieves map of all Javascript Type Ids.",
                returns: "(A promise to) a dictionary of type ids to type id names."
            },
            GetJSTypeIdMap: GetJSTypeIdMap,

            _help_IsCBaseOrSimilarType: {
                description:"Checks if the given type id is associated with a CBase or similar (mirror, script engine sentinel, root list) type.",
                arguments: [
                    {name: "base", type:"DbgObject", description: "DbgObject representing the base to test."},
                ],
                returns: "(A promise to) a bool: true if the given type id is associated with a CBase or similar type, false otherwise."
            },
            IsCBaseOrSimilarType: IsCBaseOrSimilarType,

            _help_GetCDocs: {
                description:"Gets all of the CDocs loaded in the process from the threadstate.",
                returns: "(A promise to) an array of DbgObjects."
            },
            GetCDocs: GetCDocs,

            _help_GetRootCTreeNodes: {
                description:"Gets all the root CTreeNodes from the threadstate via the CDocs.",
                returns: "(A promise to) an array of DbgObjects."
            },
            GetRootCTreeNodes: GetRootCTreeNodes,

            _help_GetLayoutAssociationFromTreeNode: {
                description: "Gets a layout association from a tree node (CTreeNode/Tree::ElementNode).",
                arguments: [
                    {name: "treenode", type:"(Promise to a) DbgObject", description: "The tree node from which to retrieve the layout association."},
                    {name: "flag", type:"int", description: "The flag for the layout association."}
                ],
                returns: "(A promise to) a DbgObject."
            },
            GetLayoutAssociationFromTreeNode: GetLayoutAssociationFromTreeNode,

            _help_GetFirstAssociatedLayoutBoxFromTreeNode: {
                description:"Gets the first associated Layout::LayoutBox from a CTreeNode.",
                arguments: [{name:"element", type:"(Promise to a) DbgObject", description: "The CTreeNode from which to retrieve the first associated LayoutBox."}],
                returns: "(A promise to) a DbgObject."
            },
            GetFirstAssociatedLayoutBoxFromTreeNode: GetFirstAssociatedLayoutBoxFromTreeNode,

            _help_GetObjectFromDataCache: {
                description: "Gets an object from a CDataCache/CFormatCache by index.",
                arguments: [
                    {name:"cache", type:"(Promise to a) DbgObject.", description: "The DbgObject representing the CDataCache/CFormatCache."},
                    {name:"index", type:"(Promise to an) int.", description: "The index in the cache."}
                ]
            },
            GetObjectFromDataCache: GetObjectFromDataCache,

            _help_Module: {
                description: "The name of the Trident DLL (e.g. \"mshtml\" or \"edgehtml\")"
            },
            Module: moduleName,

            _help_Type: {
                description: "Gets a DbgObjectType in the Web Platform module.",
                arguments: [{name:"typeName", type:"string", description: "The type name."}],
            },
            Type: mshtmlType,

            _help_TreeNodeType: {
                description: "The tree node type (either \"CTreeNode\" or \"Tree::ElementNode\")."
            },
            TreeNodeType: treeNodeType,

            _help_LookupHtPvPvValue: {
                description: "Looks up an object in an HtPvPv hashtable.",
                arguments: [
                    {name:"htpvpv", type:"(Promise to a) DbgObject.", description: "The hashtable."},
                    {name:"key", type:"(Promise to an) integer.", description:"The hashtable key."}
                ],
                returns: "A promised DbgObject representing the stored object or null if it is not present."
            },
            LookupHtPvPvValue: LookupHtPvPvValue,

            _help_GetObjectLookasidePointer: {
                description: "Gets a lookaside pointer from an object.",
                arguments: [
                    {name:"lookasideObject", type:"(Promise to a) DbgObject.", description: "The object whose lookaside pointer will be retrieved."},
                    {name:"lookasideNumber", type:"(Promise to an) integer.", description:"The lookaside index."},
                    {name:"hashtable", type:"(Promise to a) DbgObject.", description:"The hashtable containing the lookaside pointer."}
                ],
                returns: "A promised DbgObject representing the stored object or null if it is not present."
            },
            GetObjectLookasidePointer: GetObjectLookasidePointer,

            _help_GetElementLookasidePointer: {
                description: "Gets a lookaside pointer from a CTreeNode.",
                arguments: [
                    {name:"lookasideObject", type:"(Promise to a) DbgObject.", description: "The object whose lookaside pointer will be retrieved."},
                    {name:"lookasideName", type:"string", description:"The lookaside to get (e.g. \"LOOKASIDE_SUBORDINATE\")."},
                ],
                returns: "A promised DbgObject representing the lookaside object or null if it is not present."
            },
            GetElementLookasidePointer: GetElementLookasidePointer,

            _help_CreatePatchVersionControl: {
                description: "Creates a UI control that allows the user to select the patch version to use.",
                arguments: [
                    {name:"onChange", type:"function", description:"A function that is called when the version is changed."}
                ]
            },
            CreatePatchVersionControl: function (onChange) { return ensurePatchManager().createUIWidget(onChange); },

            RegisterDispId: registerDispId,
            GetDispIdNames: function(value) {
                return dispidValueToName[value] || null;
            },
            GetDispIdValue: function(name) {
                return dispidNameToValue[name] || null;
            },
        };

        Help.Register(MSHTML);
    });
})();
