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

        var promise = Promise.as(DbgObject.sym("mshtml!g_pts")).then(collectRemainingDocs);
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
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_layoutPlacement", "Tree::LayoutPlacementEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_layoutType", "Tree::LayoutTypeEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedStyleFloat", "Tree::CssFloatEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedOverflowX", "Tree::CssOverflowEnum");
    DbgObject.AddTypeOverride("mshtml", "CFancyFormat", "_bNormalizedOverflowY", "Tree::CssOverflowEnum");
    DbgObject.AddTypeOverride("mshtml", "CTreeNode", "_etag", "ELEMENT_TAG");


    // Provide some type descriptions.
    DbgObject.AddTypeDescription("mshtml", "ELEMENT_TAG", function(tagObj) {
        return Promise.as(tagObj.constant()).then(function(k) { return k.substr("ETAG_".length); });
    });

    var treeLayoutEnumRegex = /^(Tree|Layout)::(.*Enum)$/;
    DbgObject.AddTypeDescription("mshtml", function (type) { return type.match(treeLayoutEnumRegex); }, function (enumObj) {
        var enumString = enumObj.typeDescription().replace(treeLayoutEnumRegex, "$2_");
        return Promise.as(enumObj.constant())
            .then(
                function(k) { return k.substr(enumString.length); },
                function(err) { return "???"; }
            );
    });

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
