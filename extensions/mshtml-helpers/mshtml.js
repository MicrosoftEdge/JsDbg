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
                DbgObject.AddModuleFilter(function (module) {
                    if (module == "mshtml") {
                        return "edgehtml";
                    }
                    return module;
                });
            },
            function() {
                moduleName = "mshtml";
                DbgObject.AddModuleFilter(function (module) {
                    if (module == "edgehtml") {
                        return "mshtml";
                    }
                    return module;
                });
            }
        )
        .finally(onComplete);
    });

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
                Promise.map(GetDocsAndThreadstates(), function(obj) { return obj.doc; })
            );
        }

        DbgObject.AddTypeDescription(moduleName, "CBase", "RefsAndVar", false, UserEditableFunctions.Create(function(base) {
            return Promise.all([
                base.f("_ulRefs").val(), 
                base.f("_ulInternalRefs").val(), 
                base.f("_ulAllRefsAndFlags").val(), 
                base.f("_JSBind_Var._ptr")
            ])
            .thenAll(function (ulRefs, ulInternalRefs, ulAllRefsAndFlags, jsBindVar) {
                var varFields = "";
                var jsBindVarPtr = new PointerMath.Pointer(jsBindVar.pointerValue().and(bigInt(1).not())).toFormattedString();
                var isVarRooted = !jsBindVar.pointerValue().and(1).isZero();

                if (!jsBindVar.isNull()) {
                    if (isVarRooted) {
                        varFields = " (var:" + jsBindVarPtr + " <span style='color:rgb(240,120,0)'>rooted</span>)";
                    } else {
                        varFields = " var:" + jsBindVarPtr;
                    }
                }

                var flags = "";
                var isPassivating = ulAllRefsAndFlags & 1;
                var isPassivated = ulAllRefsAndFlags & 2;
                var isDestructing = ulAllRefsAndFlags & 1;
                if (isPassivating || isPassivated || isDestructing) {
                    flags = " <span style='color:red'>" + 
                        (isPassivating ? " passivating " : "") + 
                        (isPassivated ? " passivated " : "") + 
                        (isDestructing ? " desctructing " : "") + 
                    "</span>";
                }

                return "strong:" + ulRefs + " weak:" + (ulAllRefsAndFlags >> 3) + " gc:" + ulInternalRefs + varFields + flags;
            });
        }));

        DbgObject.AddExtendedField(moduleName, "CMarkup", "Root", "CTreeNode", UserEditableFunctions.Create(function (markup) {
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

        DbgObject.AddTypeDescription(moduleName, "CMarkup", "URL", false, UserEditableFunctions.Create(function (markup) {
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
        }));

        DbgObject.AddExtendedField(moduleName, "CMarkup", "MasterElement", "CElement", UserEditableFunctions.Create(function (markup) {
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

        DbgObject.AddExtendedField(moduleName, "CMarkup", "TopmostMarkup", "CMarkup", UserEditableFunctions.Create(function (markup) {
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

        DbgObject.AddExtendedField(moduleName, "CDoc", "PrimaryMarkup", "CMarkup", UserEditableFunctions.Create(function (doc) {
            return doc.f("_pWindowPrimary._pCWindow._pMarkup");
        }));

        function GetRootCTreeNodes() {
            return GetCDocs().F("PrimaryMarkup.Root")
            .filter(function (root) {
                 return !root.isNull();
            });
        }

        DbgObject.AddExtendedField(moduleName, "Tree::ElementNode", "TreeNode", "CTreeNode", function (element) {
            return MSHTML.GetCTreeNodeFromTreeElement(element);
        });

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "ComputedBlock", "Tree::ComputedBlock", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetLayoutAssociationFromCTreeNode(treeNode, 0x1).vcast();
        }));

        function GetCTreeNodeFromTreeElement(element) {
            return new PromisedDbgObject(
                element.unembed("CTreeNode", "_fIsElementNode")
                .then(null, function () {
                    return DbgObject.create(MSHTML.Module, "CTreeNode", 0).baseTypes()
                    .then(function (baseTypes) {
                        if (baseTypes.filter(function(b) { return b.typeDescription() == "Tree::ElementNode"}).length > 0) {
                            return element.as("CTreeNode");
                        } else if (baseTypes.filter(function(b) { return b.typeDescription() == "CBase"; }).length > 0) {
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
                })
            );
        }

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "Threadstate", "THREADSTATEUI", UserEditableFunctions.Create(function (treeNode) {
            return treeNode.F("Markup.Doc.Threadstate");
        }));

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "FancyFormat", "CFancyFormat", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetObjectFromDataCache(treeNode.F("Threadstate").f("_pFancyFormatCache"), treeNode.f("_iFF").val());
        }));

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "CharFormat", "CCharFormat", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetObjectFromDataCache(treeNode.F("Threadstate").f("_pCharFormatCache"), treeNode.f("_iCF").val());
        }));

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "ParaFormat", "CParaFormat", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetObjectFromDataCache(treeNode.F("Threadstate").f("_pParaFormatCache"), treeNode.f("_iPF").val());
        }));

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "SvgFormat", "CSvgFormat", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetObjectFromDataCache(treeNode.F("Threadstate").f("_pSvgFormatCache"), treeNode.f("_iSF").val());
        }));

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "SubordinateMarkup", "CMarkup", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetElementLookasidePointer(treeNode, "LOOKASIDE_SUBORDINATE")
            .then(function (result) {
                if (!result.isNull()) {
                    return result.as("CElement").F("Markup");
                } else {
                    return DbgObject.NULL;
                }
            })
        }));

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "AccessibleObject", "Aria::AccessibleObject", UserEditableFunctions.Create(function (treeNode) {
            return MSHTML.GetElementLookasidePointer(treeNode, "LOOKASIDE_ARIAOBJECT").as("Aria::AccessibleObject").vcast();
        }));

        function GetLayoutAssociationFromCTreeNode(treeNode, flag) {
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

        function GetFirstAssociatedLayoutBoxFromCTreeNode(treeNode) {
            return GetLayoutAssociationFromCTreeNode(treeNode, 0x8);
        }

        function GetMarkupFromElement(element) {
            return element.F("Markup");
        }

        DbgObject.AddExtendedField(moduleName, "CTreeNode", "Markup", "CMarkup", UserEditableFunctions.Create(function (element) {
            return element.f("_pElement", "").as("CElement").F("Markup");
        }));

        DbgObject.AddExtendedField(moduleName, "CElement", "Markup", "CMarkup", UserEditableFunctions.Create(function (element) {
            return element.f("markup")
            .catch(function () {
                return Promise.all([
                    element.f("_fHasLayoutPtr").val().catch(function() { return 0; }),
                    element.f("_fHasLayoutAry").val().catch(function() { return 0; }),
                    element.f("_fHasMarkupPtr").val()
                ])
                .thenAll(function(hasLayoutPtr, hasLayoutAry, hasMarkupPtr) {
                    if (hasLayoutPtr || hasLayoutAry) {
                        return element.f("_pLayoutInfo", "_pLayout", "_chain._pLayoutInfo", "_chain._pLayout")
                        .then(function (layout) {
                            return layout.as("char").idx(0 - layout.pointerValue().mod(4)).as(layout.typeDescription()).f("_pMarkup");
                        })
                    } else if (hasMarkupPtr) {
                        return element.f("_chain._pMarkup", "_pMarkup")
                        .then(function (markup) {
                            return markup.as("char").idx(0 - markup.pointerValue().mod(4)).as("CMarkup");
                        })
                    } else {
                        return DbgObject.create(moduleName, "CMarkup", 0);
                    }
                });
            })
        }));

        DbgObject.AddExtendedField(moduleName, "CDOMTextNode", "Markup", "CMarkup", UserEditableFunctions.Create(function (domTextNode) {
            // TODO: older versions of the tree will require fetching the markup from the CDOMTextNode's CMarkupPointer
            return domTextNode.f("markup");
        }));

        function GetDocFromMarkup(markup) {
            return markup.F("Doc");
        }

        DbgObject.AddExtendedField(moduleName, "CMarkup", "Doc", "CDoc", UserEditableFunctions.Create(function (markup) {
            return markup.f("_pSecCtx", "_spSecCtx.m_pT").f("_pDoc");
        }));

        DbgObject.AddExtendedField(moduleName, "CStyleSheet", "Markup", "CMarkup", UserEditableFunctions.Create(function (stylesheet) {
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
            // Get the element from the treenode for older versions of the tree.
            var elementPromise = treeNode.f("_pElement")
            .then(null, function () {
                // The _pElement pointer was removed in RS1.  The object can now be directly cast as an element.
                return treeNode.as("CElement");
            });

            var hasLookasidePtrPromise = elementPromise
            .then(function (element) {
                return element.f("_fHasLookasidePtr2").val();
            });

            var lookasideNumberPromise = DbgObject.constantValue(MSHTML.Module, "CElement::LOOKASIDE2", name);

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
            // Get the element from the treenode for older versions of the tree.
            var elementPromise = treeNode.f("_pElement")
            .then(null, function () {
                // The _pElement pointer was removed in RS1.  The object can now be directly cast as an element.
                return treeNode.as("CElement");
            });

            var hasLookasidePtrPromise = elementPromise
            .then(function (element) {
                return element.f("elementNodeHasLookasidePointer", "_fHasLookasidePtr").val();
            });

            // During the CTreeNode/CElement merger some lookaside enum values moved around.  Currently, they're on the CTreeNode type.
            var lookasideNumberPromise = DbgObject.constantValue(MSHTML.Module, "CTreeNode", name)
            .then(function (index) {
                return {
                    offset:0,
                    index:index
                };
            }, function() {
                // The index is not on the CTreeNode, so it must be on the CElement.
                return DbgObject.constantValue(MSHTML.Module, "CElement::LOOKASIDE", name)
                .then(function (lookasideSubordinate) {
                    // Two additional cases to try: first (in reverse chronological order), when the CElement lookasides were offset by CTreeNode::LOOKASIDE_NODE_NUMBER.
                    // We identify this case by the presence of the _dwNodeFlags1 field which was added in inetcore 1563867.
                    return (DbgObject.create("edgehtml", "CTreeNode", 0)).f("_dwNodeFlags1")
                    .then(
                        function () {
                            return DbgObject.constantValue(MSHTML.Module, "CTreeNode", "LOOKASIDE_NODE_NUMBER")
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

        function GetThreadstateFromObject(object) {
            var promise = Promise.resolve(object)
            .then(function(object) {
                if (object.typeDescription() == "Tree::ElementNode") {
                    return GetThreadstateFromObject(GetCTreeNodeFromTreeElement(object));
                } else if (object.typeDescription() == "CTreeNode") {
                    var elementPromise = object.f("_pElement")
                    .then(null, function () {
                        // The _pElement pointer was removed in RS1.  The treeNode can now be directly cast as an element.
                        return object.as("CElement");
                    });
                    return GetThreadstateFromObject(elementPromise);
                } else if (object.typeDescription() == "CElement") {
                    return GetThreadstateFromObject(GetMarkupFromElement(object));
                } else if (object.typeDescription() == "CLayoutInfo") {
                    return Promise.resolve(object.f("_fHasMarkupPtr").val())
                    .then(function(hasMarkupPtr) {
                        if (hasMarkupPtr) {
                            return GetThreadstateFromObject(object.f("_pMarkup"));
                        } else {
                            return DbgObject.NULL;
                        }
                    });
                } else if (object.typeDescription() == "CMarkup") {
                    return GetThreadstateFromObject(GetDocFromMarkup(object));
                } else if (object.typeDescription() == "CDoc") {
                    return object.F("Threadstate");
                } else {
                    return DbgObject.NULL;
                }
            })
            .then(function (object) {
                if (object.isNull()) {
                    throw new Error("Unable to reach a threadstate.");
                } else {
                    return object;
                }
            })

            return new PromisedDbgObject(promise);
        }

        DbgObject.AddExtendedField(moduleName, "CDoc", "Threadstate", "THREADSTATEUI", UserEditableFunctions.Create(function (doc) {
            return Promise.resolve(GetDocsAndThreadstates())
            .then(function(docsAndThreadstates) {
                for (var i = 0; i < docsAndThreadstates.length; ++i) {
                    if (docsAndThreadstates[i].doc.equals(doc)) {
                        return docsAndThreadstates[i].threadstate;
                    }
                }
                return DbgObject.create(moduleName, "THREADSTATEUI", 0);
            });
        }));

        function GetObjectFromDataCache(cache, index) {
            var promise = Promise.all([cache, index])
            .thenAll(function(cache, index) {
                var type = cache.typeDescription();
                var templateMatches = type.match(/<.*>/);
                var resultType = "void";
                if (templateMatches) {
                    resultType = templateMatches[0].substr(1, templateMatches[0].length - 2);
                }

                if (index < 0) {
                    return DbgObject.create(cache.module, resultType, 0);
                }

                var bucketSize = 128;
                return cache.f("_paelBuckets").idx(Math.floor(index / bucketSize)).deref().idx(index % bucketSize).f("_pvData").as(resultType);
            });

            return new PromisedDbgObject(promise);
        }

        function GetObjectFromThreadstateCache(object, cacheType, index) {
            return GetObjectFromDataCache(GetThreadstateFromObject(object).f("_p" + cacheType + "Cache"), index);
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
                    return matchingPatch.as(patchableObject.typename)
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
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bVisibility", "styleVisibility");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bDisplay", "styleDisplay");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bStyleFloat", "styleStyleFloat");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bPositionType", "stylePosition");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bOverflowX", "styleOverflow");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bOverflowY", "styleOverflow");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bPageBreakBefore", "stylePageBreak");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bPageBreakAfter", "stylePageBreak");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_uTextOverflow", "styleTextOverflow");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_fImageInterpolation", "styleInterpolation");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_uTransformStyle)", "styleTransformStyle");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_uBackfaceVisibility)", "styleBackfaceVisibility");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bMsTouchAction", "styleMsTouchAction");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bMsScrollTranslation", "styleMsTouchAction");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bMsTextCombineHorizontal", "styleMsTextCombineHorizontal");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bWrapFlow", "styleWrapFlow");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bWrapThrough", "styleWrapThrough");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_layoutPlacement", "Tree::LayoutPlacementEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_layoutType", "Tree::LayoutTypeEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedPositionType", "Tree::CssPositionEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedStyleFloat", "Tree::CssFloatEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedOverflowX", "Tree::CssOverflowEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedOverflowY", "Tree::CssOverflowEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedBreakBefore", "Tree::CssBreakEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedBreakAfter", "Tree::CssBreakEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedBreakInside", "Tree::CssBreakInsideEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedVisibility", "Tree::CssVisibilityEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedFlowDirection", "Tree::CssWritingModeEnum");
        DbgObject.AddTypeOverride(moduleName, "CFancyFormat", "_bNormalizedContentZooming", "Tree::CssContentZoomingEnum");
        DbgObject.AddTypeOverride(moduleName, "CTreeNode", "_etag", "ELEMENT_TAG");
        DbgObject.AddTypeOverride(moduleName, "CBorderDefinition", "_bBorderStyles", "Tree::CssBorderStyleEnum[4]");
        DbgObject.AddTypeOverride(moduleName, "CBorderInfo", "abStyles", "Tree::CssBorderStyleEnum[4]");
        DbgObject.AddTypeOverride(moduleName, "CInput", "_type", "htmlInput");
        DbgObject.AddTypeOverride(moduleName, "Tree::RenderSafeTextBlockRun", "_runType", "Tree::TextBlockRunTypeEnum");

        // Provide some type descriptions.
        DbgObject.AddTypeDescription(moduleName, "CTreeNode", "Tag", false, UserEditableFunctions.Create(function (treeNode) {
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
                    // Non-generic elements: just strip the tag identifier.
                    return etagValue.substr("ETAG_".length).toLowerCase();
                }
            })
            .then(function (tag) {
                return "&lt;" + tag + "&gt;";
            })
        }));

        DbgObject.AddTypeDescription(moduleName, "CTreeNode", "Default", true, function (treeNode) {
            return treeNode.desc("Tag")
            .then(function (tag) {
                return treeNode.ptr() + " (" + tag + ")";
            })
        })

        DbgObject.AddTypeDescription(moduleName, function (type) { return type.match(/^_?(style[A-z0-9]+)$/); }, "CSS Value", true, function(enumObj) {
            var enumString = enumObj.typeDescription().replace(/^_?(style[A-z0-9]+)$/, "$1");
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

        DbgObject.AddTypeDescription(moduleName, function (type) { return type.match(/^(Tree|Layout).*::(.*Enum)$/); }, "Enum Value", true, function (enumObj) {
            var enumString = enumObj.typeDescription().replace(/^(Tree|Layout).*::(.*Enum)$/, "$2_");
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

        DbgObject.AddTypeDescription(moduleName, "CColorValue", "Color", true, function(color) {
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
                        return DbgObject.global(moduleName, "g_HtmlColorTable").f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val();
                    },
                    "CT_NAMEDCSS" : function() {
                        return DbgObject.global(moduleName, "g_CssColorTable").f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val();
                    },
                    "CT_NAMEDSYS" : function() {
                        return Promise.resolve(DbgObject.global(moduleName, "g_SystemColorTable").f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val())
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

        DbgObject.AddTypeDescription(moduleName, "CAttrValue", "Name", false, UserEditableFunctions.Create(function (attrVal) {
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

        DbgObject.AddTypeOverride(moduleName, "CAttrValue::AttrFlags", "_aaType", "CAttrValue::AATYPE");
        DbgObject.AddTypeOverride(moduleName, "CAttrValue::AttrFlags", "_aaVTType", "VARENUM");

        DbgObject.AddTypeDescription(moduleName, "CAttrValue", "Value", false, UserEditableFunctions.Create(function (attrVal) {
            return attrVal.f("_wFlags.fAA_Extra_HasDispId").val()
            .then(function (hasDispId) {
                if (hasDispId) {
                    return undefined;
                } else {
                    return attrVal.f("_pPropertyDesc.pfnHandleProperty").pointerValue()
                    .then(DbgObject.symbol)
                    .then(function (handleProperty) {
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

        DbgObject.AddExtendedField(moduleName, "PROPERTYDESC", "EnumDesc", "ENUMDESC", UserEditableFunctions.Create(function (propDesc) {
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

        DbgObject.AddArrayField(moduleName, "ENUMDESC", "Values", "ENUMDESC::ENUMPAIR", UserEditableFunctions.Create(function (enumDesc) {
            return enumDesc.f("aenumpairs").array(enumDesc.f("cEnums").val());
        }));

        DbgObject.AddTypeDescription(moduleName, "CUnitValue", "UnitValue", true, function(unitval) {
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

        DbgObject.AddTypeDescription(moduleName, "Tree::SComputedValue", "ComputedValue", true, function(computedValue) {
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

        DbgObject.AddTypeDescription(moduleName, "Math::SLayoutMeasure", "Length", true, describeLayoutMeasure);
        DbgObject.AddTypeDescription(moduleName, "Utilities::SLayoutMeasure", "Length", true, describeLayoutMeasure);

        DbgObject.AddTypeDescription(moduleName, "Layout::SBoxFrame", "Frame", true, function(rect) {
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

        DbgObject.AddTypeDescription(moduleName, "Math::SPoint", "Point", true, describePoint);
        DbgObject.AddTypeDescription(moduleName, "Utilities::SPoint", "Point", true, describePoint);

        DbgObject.AddTypeDescription(moduleName, "Microsoft::CFlat::ReferenceCount", "RefCount", true, function (refCount) {
            return refCount.f("_refCount").val();
        });

        DbgObject.AddTypeDescription(moduleName, function (type) { return type.match(/^TSmartPointer<.*>$/) != null; }, "Pointer", true, function (smartPointer) {
            return smartPointer.f("m_pT").desc();
        })

        DbgObject.AddArrayField(
            moduleName,
            function (type) { return type.match(/^SArray<.*>$/) != null; },
            "Items",
            function (type) { return type.match(/^SArray<(.*)>$/)[1]; },
            function (array) {
                var arrayStart = array.f("_array");
                return arrayStart.array(arrayStart.as("SArrayHeader").idx(-1).f("Length"));
            }
        );

        DbgObject.AddArrayField(
            moduleName,
            function (type) { return type.match(/^Microsoft::CFlat::Array<.*,1>$/) != null; },
            "Items",
            function (type) { return type.match(/^Microsoft::CFlat::Array<(.*),1>$/)[1]; },
            function (array) {
                if (array.isNull()) {
                    return [];
                } else {
                    return array.f("_data").array(array.f("_bounds.Length").val());
                }
            }
        );

        DbgObject.AddArrayField(
            moduleName, 
            function(type) { return type.match(/^Layout::PatchableArray<.*>$/) != null; },
            "Items",
            function (type) { return type.match(/^Layout::PatchableArray<(.*)>$/)[1]; },
            function(array) {
                return array.f("data.Array").array("Items");
            }
        );

        DbgObject.AddArrayField(
            moduleName, 
            function(type) { return type.match(/^(Collections|CFlatRuntime)::SRawArray<.*>$/) != null; },
            "Items",
            function(type) { return type.match(/^(Collections|CFlatRuntime)::SRawArray<(.*)>$/)[2]; },
            function(array) {
                return array.f("data").f("ptr", "").array(array.f("length"));
            }
        );

        DbgObject.AddArrayField(
            moduleName,
            function (type) { return type.match(/^Microsoft::CFlat::TrailingArrayField<.*>$/) != null; },
            "Items",
            function (type) { return type.match(/^Microsoft::CFlat::TrailingArrayField<(.*)>$/)[1]; },
            function (array) {
                if (array.isNull()) {
                    return [];
                } else {
                    return array.f("_elements").array(array.f("_length").val());
                }
            }
        );

        DbgObject.AddArrayField(
            moduleName, 
            function(type) { return type.match(/^(CDataAry|CPtrAry)<.*>$/) != null; },
            "Items",
            function(type) {
                var matches = type.match(/^(CDataAry|CPtrAry)<(.*)>$/);
                if (matches[2].match(/\*$/) != null) {
                    return matches[2].substr(0, matches[2].length - 1).trim();
                } else {
                    return matches[2];
                }
            },
            function (array) {
                var innerType = array.typeDescription().match(/^(CDataAry|CPtrAry)<(.*)>$/)[2];
                var result = array.f("_pv").as(innerType).array(array.f("_c"));
                return result;
            }
        );

        function getCircularBufferItems(arrayStart, arrayLength, count, offset) {
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
            moduleName,
            function (type) { return type.match(/^Collections::SCircularBuffer<.*>$/) != null; },
            "Items",
            function (type) { return type.match(/^Collections::SCircularBuffer<(.*)>$/)[1]; },
            function (buffer) {
                var arrayStart = buffer.f("items._array");
                var arrayLength = arrayStart.as("SArrayHeader").idx(-1).f("Length").val();
                var count = buffer.f("count").val();
                var offset = buffer.f("offset").val();

                return Promise.all([arrayStart, arrayLength, count, offset]).thenAll(getCircularBufferItems);
            }
        );

        DbgObject.AddArrayField(
            moduleName,
            function (type) { return type.match(/^Utilities::SCircularBuffer<.*>$/) != null; },
            "Items",
            function (type) { return type.match(/^Utilities::SCircularBuffer<(.*)>$/)[1]; },
            function (buffer) {
                var items = buffer.f("items.m_pT")

                var arrayStart = items.f("_data");
                var arrayLength = items.f("_bounds.Length").val();
                var count = buffer.f("count").val();
                var offset = buffer.f("offset").val();

                return Promise.all([arrayStart, arrayLength, count, offset]).thenAll(getCircularBufferItems);
            }
        );

        DbgObject.AddArrayField(
            moduleName,
            function (type) { return type.match(/^Collections::SGrowingArray<.*>$/) != null; },
            "Items",
            function (type) { return type.match(/^Collections::SGrowingArray<(.*)>$/)[1]; },
            function (growingArray) {
                return growingArray.f("items._array").array(growingArray.f("count"));
            }
        );

        DbgObject.AddArrayField(
            moduleName,
            function (type) { return type.match(/^Utilities::SGrowingArray<.*>$/) != null; },
            "Items",
            function (type) { return type.match(/^Utilities::SGrowingArray<(.*)>$/)[1]; },
            function (growingArray) {

                if (growingArray.isNull()) {
                    return [];
                } else {
                    return growingArray.f("items.m_pT._data").array(growingArray.f("count"));
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
            moduleName, 
            function(type) { return type.match(/^(CModernArray)<.*>$/) != null; },
            "Items",
            function(type) {
                var matches = type.match(/^(CModernArray)<(.*)>$/);
                var innerType = separateTemplateArguments(matches[2])[0];
                if (innerType.match(/\*$/) != null) {
                    return innerType.substr(0, innerType.length - 1).trim();
                } else {
                    return innerType;
                }
            },
            function (array) {
                var innerType = separateTemplateArguments(array.typeDescription().match(/^(CModernArray)<(.*)>$/)[2])[0];
                var result = array.f("_aT").as(innerType).array(array.f("_nSize"));
                return result;
            }
        )

        var dispidNameToValue = {};
        var dispidValueToName = {};
        function registerDispId(name, value) {
            if (!(value in dispidValueToName)) {
                dispidValueToName[value] = [];
            }
            dispidValueToName[value].push(name);
            dispidNameToValue[name] = value;
        }

        MSHTML = {
            _help : {
                name: "MSHTML",
                description: "mshtml.dll/edgehtml.dll-specific functionality."
            },

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

            _help_GetCTreeNodeFromTreeElement: {
                description:"Gets a CTreeNode from a Tree::ElementNode.",
                arguments: [{name:"element", type:"(Promise to a) DbgObject", description: "The Tree::ElementNode from which to retrieve a CTreeNode."}],
                returns: "(A promise to) a DbgObject."
            },
            GetCTreeNodeFromTreeElement: GetCTreeNodeFromTreeElement,

            _help_GetMarkupFromElement: {
                description:"Gets a CMarkup from a CElement.",
                arguments: [{name:"element", type:"(Promise to a) DbgObject", description: "The CElement from which to retrieve the CMarkup."}],
                returns: "A promise to a DbgObject representing the CMarkup."
            },
            GetMarkupFromElement: GetMarkupFromElement,

            _help_GetDocFromMarkup: {
                description:"Gets a CDoc from a CMarkup.",
                arguments: [{name:"markup", type:"(Promise to a) DbgObject", description: "The CMarkup from which to retrieve a CDoc."}],
                returns: "A promise to a DbgObject representing the CDoc."
            },
            GetDocFromMarkup: GetDocFromMarkup,

            _help_GetLayoutAssociationFromCTreeNode: {
                description: "Gets a layout association from a CTreeNode.",
                arguments: [
                    {name: "treenode", type:"(Promise to a) DbgObject", description: "The CTreeNode from which to retrieve the layout association."},
                    {name: "flag", type:"int", description: "The flag for the layout association."}
                ],
                returns: "(A promise to) a DbgObject."
            },
            GetLayoutAssociationFromCTreeNode: GetLayoutAssociationFromCTreeNode,

            _help_GetFirstAssociatedLayoutBoxFromCTreeNode: {
                description:"Gets the first associated Layout::LayoutBox from a CTreeNode.",
                arguments: [{name:"element", type:"(Promise to a) DbgObject", description: "The CTreeNode from which to retrieve the first associated LayoutBox."}],
                returns: "(A promise to) a DbgObject."
            },
            GetFirstAssociatedLayoutBoxFromCTreeNode: GetFirstAssociatedLayoutBoxFromCTreeNode,

            _help_GetThreadstateFromObject: {
                description:"Gets the threadstate associated with the given markup object.",
                arguments: [{name:"object", type:"(Promise to a) DbgObject", description: "The object may be a Tree::ElementNode, CTreeNode, CElement, CMarkup, CLayoutInfo, CSecurityContext, or a CDoc."}],
                returns: "(A promise to) a DbgObject."
            },
            GetThreadstateFromObject: GetThreadstateFromObject,

            _help_GetObjectFromDataCache: {
                description: "Gets an object from a CDataCache/CFormatCache by index.",
                arguments: [
                    {name:"cache", type:"(Promise to a) DbgObject.", description: "The DbgObject representing the CDataCache/CFormatCache."},
                    {name:"index", type:"(Promise to an) int.", description: "The index in the cache."}
                ]
            },
            GetObjectFromDataCache: GetObjectFromDataCache,

            _help_GetObjectFromThreadstateCache: {
                description: "Gets an object from a CDataCache/CFormatCache on the threadstate by index.",
                arguments: [
                    {name:"object", type:"(Promise to a) DbgObject.", description: "The object whose threadstate will be retrieved."},
                    {name:"cacheType", type:"A string.", description: "The cache to retrieve (e.g. \"FancyFormat\")."},
                    {name:"index", type:"(Promise to an) int.", description: "The index in the cache."}
                ]
            },
            GetObjectFromThreadstateCache: GetObjectFromThreadstateCache,

            _help_Module: {
                description: "The name of the Trident DLL (e.g. \"mshtml\" or \"edgehtml\")"
            },
            Module: moduleName,

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
