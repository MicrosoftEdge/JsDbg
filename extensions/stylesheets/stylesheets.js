"use strict";

var StyleSheets = undefined;
Loader.OnLoad(function() {

    function getAtomFromAtomTable(atomTable, atom) {
        return atomTable.f("_phat")
        .then(function (hashtable) {
            if (!hashtable.isNull()) {
                return hashtable.f("_aryId._pv");
            } else {
                return atomTable.f("_pv");
            }
        })
        .then(function (startOfArray) {
            return startOfArray.as("SAtom*")
            .idx(atom)
            .deref()
            .f("_ach")
            .string();
        });
    }

    function getDocFromStylesheet(stylesheet) {
        return new PromisedDbgObject(
            stylesheet.f("_pManager._pDoc")
            .then(function (doc) {
                if (doc.isNull()) {
                    return stylesheet.f("_apSheetsList").array("Items")
                    .then(function (stylesheets) {
                        if (stylesheets.length == 0) {
                            return doc;
                        } else {
                            return stylesheets[0].f("_pParentElement").F("Markup.Doc");
                        }
                    })
                } else {
                    return doc;
                }
            })
        );
    }

    function getAtom(stylesheet, atom) {
        return getAtomFromAtomTable(getDocFromStylesheet(stylesheet).f("_CSSAtomTable"), atom);
    }

    function hyphenate(string) {
        return string.replace(/(^.+)([A-Z])/g, function(_, prefix, match) {
            return prefix + "-" + match;
        });
    }

    function getClassSelectorDescription(classSelector, stylesheet) {
        return classSelector.f("_pNextClassSelector")
        .then(function (nextClassSelector) {
            var prefix = Promise.as("");
            if (!nextClassSelector.isNull()) {
                prefix = getClassSelectorDescription(nextClassSelector, stylesheet);
            }
            return prefix;
        })
        .then(function (prefix) {
            return getAtomFromAtomTable(getDocFromStylesheet(stylesheet).f("_CSSAtomTable"), classSelector.f("_lAtom").val())
            .then(function (className) {
                return prefix + "." + className;
            })
        });
    }

    function getSelectorDescription(selector, stylesheet) {
        return Promise.as(selector.isNull())
        .then(function (isNull) {
            if (isNull) {
                return null;
            }

            return Promise.join([
                getSelectorDescription(selector.f("_pNextSelector"), stylesheet),
                selector.f("_pClassSelector"), 
                selector.f("_lIDAtom").val(), 
                selector.f("_eElementType").as("ELEMENT_TAG").constant(),
                getSelectorDescription(selector.f("_pParent"), stylesheet),
                selector.f("_ePseudoElement").as("EPseudoElement").constant(),
                selector.f("_eNavigate").as("CStyleSelector::ENavigate").constant(),
                selector.f("_pSelectorPart").vcast(),
                selector.f("_fHover").val(),
                selector.f("_fUniversalExplicit").val()
            ])
            .then(function (props) {
                var suffix = props[0];
                suffix = (suffix == null ? "" : ", " + suffix);
                var prefix = props[4];

                if (prefix != null) {
                    var combinator = props[6];
                    var mapping = {
                        "AncestorNavigation": " ",
                        "ChildNavigation": " > ",
                        "AdjacentNavigation": " + ",
                        "WalkAdjacentNavigation": " ~ "
                    };

                    if (combinator in mapping) {
                        prefix += mapping[combinator];
                    } else {
                        prefix += " ? ";
                    }
                } else {
                    prefix = "";
                }

                if (props[5] != "pelemNone") {
                    suffix = "::" + hyphenate(props[5].substr("pelem".length)).toLowerCase() + suffix;
                }

                if (props[8] == 1) {
                    suffix = ":hover" + suffix;
                }

                if (!props[7].isNull()) {
                    suffix = "[" + props[7].htmlTypeDescription() + "]" + suffix;
                }

                if (!props[1].isNull()) {
                    return getClassSelectorDescription(props[1], stylesheet)
                    .then(function (classDescription) {
                        return prefix + classDescription + suffix;
                    })
                } else if (props[2] >= 0) {
                    return getAtomFromAtomTable(getDocFromStylesheet(stylesheet).f("_AtomTable"), props[2])
                    .then(function (idName) {
                        return prefix + "#" + idName + suffix;
                    })
                } else if (props[3] != "ETAG_UNKNOWN") {
                    return prefix + props[3].toLowerCase().substr("ETAG_".length) + suffix;
                } else if (props[9]) {
                    return prefix + "*" + suffix;
                } else if (prefix == "" && suffix == "") {
                    return "???";
                } else {
                    return prefix + suffix;
                }
            });
        })
    }

    DbgObject.AddAction(MSHTML.Module, "CStyleSheet", "StyleSheetViewer", function(stylesheet) {
        return {
            description: "Stylesheets",
            action: "/stylesheets/#r=" + stylesheet.ptr()
        };
    });

    DbgObject.AddAction(MSHTML.Module, "CMarkup", "StyleSheetViewer", function(markup) {
        return {
            description: "Stylesheets",
            action: "/stylesheets/#r=" + markup.ptr()
        };
    });

    if (Loader.GetCurrentExtension()== "stylesheets") {
        DbgObjectTree.AddRoot("StyleSheet", function() { 
            return Promise.sort(Promise.filter(MSHTML.GetCDocs().F("PrimaryMarkup"), function (m) { return !m.isNull(); }), function(markup) {
                return markup.f("_pStyleSheetArray").f("_aStyleSheets", "_pageStyleSheets").array("Items")
                .then(function (stylesheetArray) {
                    return 0 - stylesheetArray.length;
                });
            });
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheetArray", null, function(array) {
            return array.f("_aStyleSheets", "_pageStyleSheets").array("Items");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CMarkup", null, function(markup) {
            return markup.f("_pStyleSheetArray");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_pSSSheet");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CSharedStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_apMediaLists").array("Items");
        })        

        DbgObjectTree.AddType(null, MSHTML.Module, "CMediaList", null, function(stylesheet) {
            return stylesheet.f("_apMediaQueries").array("Items");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CMediaQuery", null, function(stylesheet) {
            return stylesheet.f("_pAA").array("Items");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_pImportedStyleSheets");
        })        

        DbgObjectTree.AddType(null, MSHTML.Module, "CSharedStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_apFontBlocks").array("Items");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CSharedStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_apPageBlocks").array("Items");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CSharedStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_apViewportBlocks").array("Items");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CSharedStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_apImportBlocks").array("Items");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CSharedStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_apRulesList").array("Items");
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleRule", null, function(styleRule) {
            return styleRule.f("_paaStyleProperties").array("Items");
        }, function (rule, stylesheet) {
            return getSelectorDescription(rule.f("_pFirstSelector"), stylesheet);
        })

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "CBase", address).vcast();
        });
    }

    var builtInFields = [];

    StyleSheets = {
        Name: "StyleSheets",
        RootType: "CMarkup",
        DefaultFieldType: {
            module: MSHTML.Module,
            type: "CStyleSheet"
        },
        BuiltInFields: builtInFields
    };
});