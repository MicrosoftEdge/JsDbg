//
// mshtml.js
// Peter Salas
//
// Some mshtml-specific helpers.

var MSHTML = undefined;

(function() {
    // Figure out which module to use.
    var moduleName = null;

    JsDbg.OnLoadAsync(function(onComplete) {
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
        .then(onComplete);
    });

    JsDbg.OnLoad(function() {
        function GetDocsAndThreadstates(){
            return DbgObject.global(moduleName, "g_pts").deref()
            .list("ptsNext")
            .map(function (threadstate) {
                return threadstate.as("THREADSTATEUI").f("_paryDoc")
                .array()
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

        function GetRootCTreeNodes() {
            var markups = GetCDocs().f("_pWindowPrimary._pCWindow._pMarkup");

            return markups.f("root").unembed("CTreeNode", "_fIsElementNode")
                .filter(function (treeNode) { return !treeNode.isNull(); })
                .then(null, function () {
                    return markups.f("_ptpFirst").unembed("CTreeNode", "_tpBegin")
                    .filter(function (treeNode) { return !treeNode.isNull(); });
                });
        }

        function GetCTreeNodeFromTreeElement(element) {
            return new PromisedDbgObject(
                element.f("placeholder")
                .then(
                    function() {
                        // We're in legacy chk, offset by the size of a void*.
                        return element.as("void*").idx(1).as("CTreeNode");
                    }, function() {
                        return new DbgObject(MSHTML.Module, "CTreeNode", 0).baseTypes()
                        .then(function (baseTypes) {
                            if (baseTypes.filter(function (b) { return b.typename == "CBase"; }).length > 0) {
                                // CBase is in CTreeNode's ancestry, unembed.
                                return element.as("CTreeNode").unembed("CTreeNode", "_fIsElementNode")
                                .then(null, function () {
                                    return element.as("CTreePos").unembed("CTreeNode", "_tpBegin");
                                });
                            } else {
                                // Not in the ancestry, just cast it.
                                return element.as("CTreeNode");
                            }
                        })
                    }
                )
            );
        }

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
            var promise = Promise.join([element.f("_fHasLayoutPtr").val(), element.f("_fHasLayoutAry", "_fHasLayoutPtr").val(), element.f("_fHasMarkupPtr").val()])
            .then(function(bits) {
                if (bits[0] || bits[1]) {
                    return element.f("_pLayoutInfo", "_pLayout").f("_pMarkup");
                } else if (bits[2]) {
                    return element.f("_chain._pMarkup", "_pMarkup")
                    .then(function (markup) {
                        return markup.as("char").idx(0 - markup.pointerValue().mod(4)).as("CMarkup");
                    })
                } else {
                    return DbgObject.NULL;
                }
            });

            return new PromisedDbgObject(promise);
        }

        function GetDocFromMarkup(markup) {
            return markup.f("_pSecCtx", "_spSecCtx.m_pT").f("_pDoc");
        }

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
            var promise = Promise.join([htpvpv.f("_cEntMax").val(), htpvpv.f("_cStrideMask").val(), htpvpv.f("_pEnt"), key])
            .then(function (values) {
                var entryCount = values[0];
                var strideMask = values[1];
                var firstEntry = values[2];
                var key = values[3];

                var probe = key % entryCount;
                var stride = (strideMask & (key >> 2)) + 1

                return searchForHtPvPvMatch(firstEntry, entryCount, probe, stride, key);
            });
            return new PromisedDbgObject(promise);
        }

        function GetObjectLookasidePointer(lookasideObject, lookasideNumber, hashtable) {
            return lookasideObject.as("int").idx(lookasideNumber).pointerValue()
            .then(function (lookasideKey) {
                return MSHTML.LookupHtPvPvValue(hashtable, lookasideKey);
            });
        }

        function GetThreadstateFromObject(object) {
            var promise = Promise.as(object)
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
                    return Promise.as(object.f("_fHasMarkupPtr").val())
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
                    // Once we have a Doc, we can walk the threadstate pointers to find the corresponding threadstate.
                    return Promise.as(GetDocsAndThreadstates())
                    .then(function(docsAndThreadstates) {
                        for (var i = 0; i < docsAndThreadstates.length; ++i) {
                            if (docsAndThreadstates[i].doc.equals(object)) {
                                return docsAndThreadstates[i].threadstate;
                            }
                        }
                        return DbgObject.NULL;
                    });
                }
            });

            return new PromisedDbgObject(promise);
        }

        function GetObjectFromDataCache(cache, index) {
            var promise = Promise.join([cache, index])
            .then(function(cacheAndIndex) {
                var cache = cacheAndIndex[0];
                var index = cacheAndIndex[1];

                if (index < 0) {
                    return DbgObject.NULL;
                }
                var type = cache.typeDescription();
                var templateMatches = type.match(/<.*>/);
                var resultType = "void";
                if (templateMatches) {
                    resultType = templateMatches[0].substr(1, templateMatches[0].length - 2);
                }

                var bucketSize = 128;
                return cache.f("_paelBuckets").idx(Math.floor(index / bucketSize)).deref().idx(index % bucketSize).f("_pvData").as(resultType);
            });

            return new PromisedDbgObject(promise);
        }

        function GetObjectFromThreadstateCache(object, cacheType, index) {
            return GetObjectFromDataCache(GetThreadstateFromObject(object).f("_p" + cacheType + "Cache"), index);
        }

        // Extend DbgObject to ease navigation of patchable objects.
        DbgObject.prototype._help_latestPatch = {
            description: "(injected by MSHTML) Gets the latest patch from a CPatchableObject, casted back to the original type.",
            returns: "(A promise to) a DbgObject"
        },
        DbgObject.prototype.latestPatch = function() {
            var that = this;        
            return this.f("_pNextPatch")
            .then(function(nextPatch) {
                if (!nextPatch.isNull()) {
                    return nextPatch.as(that.typename);
                } else {
                    return that;
                }
            });
        }
        PromisedDbgObject.IncludePromisedMethod("latestPatch", PromisedDbgObject);

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


        // Provide some type descriptions.
        DbgObject.AddTypeDescription(moduleName, "ELEMENT_TAG", function(tagObj) {
            return Promise.as(tagObj.constant()).then(function(k) { return k.substr("ETAG_".length); });
        });

        DbgObject.AddTypeDescription(moduleName, function (type) { return type.match(/^_?(style[A-z0-9]+)$/); }, function(enumObj) {
            var enumString = enumObj.typeDescription().replace(/^_?(style[A-z0-9]+)$/, "$1");
            return Promise.as(enumObj.as("_" + enumString).constant())
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

        DbgObject.AddTypeDescription(moduleName, function (type) { return type.match(/^(Tree|Layout).*::(.*Enum)$/); }, function (enumObj) {
            var enumString = enumObj.typeDescription().replace(/^(Tree|Layout).*::(.*Enum)$/, "$2_");
            return Promise.as(enumObj.constant())
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

        DbgObject.AddTypeDescription(moduleName, "CColorValue", function(color) {
            return Promise.join([color.f("_ct").as("CColorValue::COLORTYPE").constant(), color.f("_crValue").val(), color.f("_flAlpha").val()])
            .then(function(colorTypeAndRefAndAlpha) {
                var colorType = colorTypeAndRefAndAlpha[0];
                var inlineColorRef = colorTypeAndRefAndAlpha[1] & 0xFFFFFF;
                var alpha = colorTypeAndRefAndAlpha[2];
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
                    "CT_NAMEDSYS" : function() {
                        return Promise.as(DbgObject.global(moduleName, "g_SystemColorTable").f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val())
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
                return Promise.as(colorRef)
                .then(function(colorRef) {
                    colorRef = colorRef & 0xFFFFFF;
                    var color = cssColor(colorRef, alpha);
                    return swatch(color) + " " + colorType + " " + color;
                }, function(error) {
                    return colorType + " 0x" + inlineColorRef.toString(16) + " " + alpha;
                });
            });
        });

        DbgObject.AddTypeDescription(moduleName, "CUnitValue", function(unitval) {
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

            return Promise.join([type, storageType])
            .then(function(typeAndStorageType) {
                var type = typeAndStorageType[0];
                var storageType = typeAndStorageType[1];
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

        DbgObject.AddTypeDescription(moduleName, "Tree::SComputedValue", function(computedValue) {
            return Promise.as(computedValue.as("CUnitValue").desc())
            .then(function(unitvalueDesc) {
                if (unitvalueDesc == "_") {
                    return "auto";
                } else {
                    return unitvalueDesc;
                }
            })
        });

        DbgObject.AddTypeDescription(moduleName, "Math::SLayoutMeasure", function(layoutMeasure) {
            return Promise.as(layoutMeasure.val())
                .then(function(val) { return val / 100 + "px"; });
        });

        DbgObject.AddTypeDescription(moduleName, "Layout::SBoxFrame", function(rect) {
            var sideNames = ["top", "right", "bottom", "left"];
            return Promise.join(sideNames.map(function(side) { return rect.f(side).desc(); }))
            .then(function (sides) {
                return sides.join(" ");
            });
        });

        DbgObject.AddTypeDescription(moduleName, "Math::SPoint", function(point) {
           var fieldNames = ["x", "y"];
            return Promise.join(fieldNames.map(function(side) { return point.f(side).desc(); }))
            .then(function (values) {
                return "(" + values[0] + ", " + values[1] + ")";
            }); 
        });

        DbgObject.AddDynamicArrayType(moduleName, function(type) { return type.match(/^SArray<.*>$/) != null; }, function(array) {
            var arrayStart = array.f("_array");
            return arrayStart.array(arrayStart.as("SArrayHeader").idx(-1).f("Length"));
        });

        DbgObject.AddDynamicArrayType(moduleName, function(type) { return type.match(/^Layout::PatchableArray<.*>$/) != null; }, function(array) {
            return array.f("data.Array").array();
        });

        DbgObject.AddDynamicArrayType(moduleName, function(type) { return type.match(/^Collections::SRawArray<.*>$/) != null; }, function(array) {
            return array.f("data").array(array.f("length"));
        });

        DbgObject.AddDynamicArrayType(moduleName, function(type) { return type.match(/^(CDataAry|CPtrAry)<.*>$/) != null; }, function (array) {
            var innerType = array.typeDescription().match(/^(CDataAry|CPtrAry)<(.*)>$/)[2];
            return array.f("_pv").as(innerType).array(array.f("_c"));
        });

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
            GetObjectLookasidePointer: GetObjectLookasidePointer
        };

        Help.Register(MSHTML);
    })
})();
