//
// mshtml.js
// Peter Salas
//
// Some mshtml-specific helpers.

var MSHTML = (function() {
    function GetCDocs() {
        var collectedDocs = [];
        function collectRemainingDocs(threadstate) {
            if (threadstate.isNull()) {
                return collectedDocs;
            }

            var docArrayObj = threadstate.as("THREADSTATEUI").f("_paryDoc");
            return Promise.as(docArrayObj.f("_pv").as("CDoc*").array(docArrayObj.f("_c").val()))
            .then(function(docs) {
                collectedDocs = collectedDocs.concat(docs);
                return Promise.as(threadstate.f("ptsNext")).then(collectRemainingDocs);
            })
        }

        var promise = Promise.as(DbgObject.global("mshtml!g_pts").deref()).then(collectRemainingDocs);
        return DbgObject.ForcePromiseIfSync(promise);
    }

    function GetRootCTreeNodes() {
        var promise = Promise.as(GetCDocs())
            .then(function (docs) {
                return Promise.join(docs.map(function (doc) { return doc.f("_pWindowPrimary"); }));
            })
            .then(function (windows) {
                return windows
                    .filter(function(w) { return !w.isNull(); })
                    .map(function(pw) { return pw.f("_pCWindow._pMarkup._ptpFirst").unembed("CTreeNode", "_tpBegin"); });
            });
        return DbgObject.ForcePromiseIfSync(promise);
    }

    function GetCTreeNodeFromTreeElement(element) {
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
        return DbgObject.ForcePromiseIfSync(new PromisedDbgObject(promise));
    }

    function GetFirstAssociatedLayoutBoxFromCTreeNode(treeNode) {
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
        return DbgObject.ForcePromiseIfSync(new PromisedDbgObject(promise));
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
        return DbgObject.ForcePromiseIfSync(new PromisedDbgObject(promise));
    }
    PromisedDbgObject.IncludePromisedMethod("latestPatch");

    // Provide additional type info on some fields.
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bVisibility", "styleVisibility");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bDisplay", "styleDisplay");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bStyleFloat", "styleStyleFloat");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bPositionType", "stylePosition");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bOverflowX", "styleOverflow");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bOverflowY", "styleOverflow");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bPageBreakBefore", "stylePageBreak");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bPageBreakAfter", "stylePageBreak");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_uTextOverflow", "styleTextOverflow");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_fImageInterpolation", "styleInterpolation");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_uTransformStyle)", "styleTransformStyle");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_uBackfaceVisibility)", "styleBackfaceVisibility");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bMsTouchAction", "styleMsTouchAction");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bMsScrollTranslation", "styleMsTouchAction");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bMsTextCombineHorizontal", "styleMsTextCombineHorizontal");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bWrapFlow", "styleWrapFlow");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bWrapThrough", "styleWrapThrough");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_layoutPlacement", "Tree::LayoutPlacementEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_layoutType", "Tree::LayoutTypeEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedPositionType", "Tree::CssPositionEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedStyleFloat", "Tree::CssFloatEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedOverflowX", "Tree::CssOverflowEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedOverflowY", "Tree::CssOverflowEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedBreakBefore", "Tree::CssBreakEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedBreakAfter", "Tree::CssBreakEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedBreakInside", "Tree::CssBreakInsideEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedVisibility", "Tree::CssVisibilityEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedFlowDirection", "Tree::CssWritingModeEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedContentZooming", "Tree::CssContentZoomingEnum");
    DbgObject.AddTypeOverride("mshtml", "CTreeNode", "_etag", "ELEMENT_TAG");
    DbgObject.AddTypeOverride("mshtml", "CBorderDefinition", "_bBorderStyles", "Tree::CssBorderStyleEnum[4]");
    DbgObject.AddTypeOverride("mshtml", "CBorderInfo", "abStyles", "Tree::CssBorderStyleEnum[4]");


    // Provide some type descriptions.
    DbgObject.AddTypeDescription("mshtml", "ELEMENT_TAG", function(tagObj) {
        return Promise.as(tagObj.constant()).then(function(k) { return k.substr("ETAG_".length); });
    });

    var cssEnumRegex = /^_?(style[A-z0-9]+)$/;
    DbgObject.AddTypeDescription("mshtml", function (type) { return type.match(cssEnumRegex); }, function(enumObj) {
        var enumString = enumObj.typeDescription().replace(cssEnumRegex, "$1");
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

    var treeLayoutEnumRegex = /^(Tree|Layout)::(.*Enum)$/;
    DbgObject.AddTypeDescription("mshtml", function (type) { return type.match(treeLayoutEnumRegex); }, function (enumObj) {
        var enumString = enumObj.typeDescription().replace(treeLayoutEnumRegex, "$2_");
        return Promise.as(enumObj.constant())
            .then(
                function(k) { return k.substr(enumString.length); },
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

    DbgObject.AddTypeDescription("mshtml", "CColorValueNoInit", function(color) { return color.as("CColorValue").desc(); });
    DbgObject.AddTypeDescription("mshtml", "CColorValue", function(color) {
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
                return DbgObject.global("user32!gpsi").deref().f("argbSystem").idx(index).val();
            }

            var indirectColorRefs = {
                "CT_NAMEDHTML" : function() {
                    return DbgObject.global("mshtml!g_HtmlColorTable").f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val();
                },
                "CT_NAMEDSYS" : function() {
                    return Promise.as(DbgObject.global("mshtml!g_SystemColorTable").f("_prgColors").idx(color.f("_iColor").val()).f("dwValue").val())
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

    DbgObject.AddTypeDescription("mshtml", "CUnitValueNoInit", function(color) { return color.as("CUnitValue").desc(); });
    DbgObject.AddTypeDescription("mshtml", "CUnitValue", function(unitval) {
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

    DbgObject.AddTypeDescription("mshtml", "Tree::SComputedValue", function(computedValue) {
        return Promise.as(computedValue.as("CUnitValue").desc())
        .then(function(unitvalueDesc) {
            if (unitvalueDesc == "_") {
                return "auto";
            } else {
                return unitvalueDesc;
            }
        })
    });

    DbgObject.AddTypeDescription("mshtml", "Math::SLayoutMeasure", function(layoutMeasure) {
        return Promise.as(layoutMeasure.val())
            .then(function(val) { return val / 100 + "px"; });
    });

    DbgObject.AddTypeDescription("mshtml", "Layout::SBoxFrame", function(rect) {
        var sideNames = ["top", "right", "bottom", "left"];
        return Promise.join(sideNames.map(function(side) { return rect.f(side).desc(); }))
        .then(function (sides) {
            return sides.join(" ");
        });
    });

    DbgObject.AddTypeDescription("mshtml", "Math::SPoint", function(point) {
       var fieldNames = ["x", "y"];
        return Promise.join(fieldNames.map(function(side) { return point.f(side).desc(); }))
        .then(function (values) {
            return "(" + values[0] + ", " + values[1] + ")";
        }); 
    });

    return {
        GetCDocs: GetCDocs,
        GetRootCTreeNodes: GetRootCTreeNodes,
        GetCTreeNodeFromTreeElement: GetCTreeNodeFromTreeElement,
        GetFirstAssociatedLayoutBoxFromCTreeNode: GetFirstAssociatedLayoutBoxFromCTreeNode,
    }
})();
