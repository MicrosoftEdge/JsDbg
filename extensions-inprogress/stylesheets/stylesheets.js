"use strict";

var StyleSheets = undefined;
JsDbg.OnLoad(function() {

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
        return MSHTML.GetMarkupFromElement(stylesheet.f("_pParentElement")).f("_pSecCtx","_spSecCtx.m_pT").f("_pDoc");
    }

    function getAtom(stylesheet, atom) {
        return MSHTML.GetMarkupFromElement(stylesheet.f("_pParentElement"))
        .f("_pSecCtx._pDoc._CSSAtomTable")
        .then(function (atomTable) {
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
            })
        })
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
                selector.f("_eElementType").as("ELEMENT_TAG").desc(),
                getSelectorDescription(selector.f("_pParent"), stylesheet),
                selector.f("_ePseudoElement").as("EPseudoElement").constant(),
                selector.f("_eNavigate").as("CStyleSelector::ENavigate").constant(),
                selector.f("_pSelectorPart").vcast(),
                selector.f("_fHover").val()
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
                } else if (props[3] != "UNKNOWN") {
                    return prefix + props[3].toLowerCase() + suffix;
                } else if (prefix == "" && suffix == "") {
                    return "???";
                } else {
                    return prefix + suffix;
                }
            });
        })
    }

    DbgObject.AddTypeDescription(MSHTML.Module, "CStyleSheet", "StyleSheet", JsDbg.GetCurrentExtension() == "stylesheets", function(stylesheet) {
        return "<a href=\"/stylesheets/#" + stylesheet.ptr() + "\">" + stylesheet.ptr() + "</a>";
    });

    if (JsDbg.GetCurrentExtension() == "stylesheets") {
        DbgObjectTree.AddRoot("StyleSheet", function() { 
            return Promise.sort(MSHTML.GetCDocs().f("_pWindowPrimary._pCWindow._pMarkup"), function(markup) {
                return markup.f("_pStyleSheetArray._aStyleSheets").array()
                .then(function (stylesheetArray) {
                    return 0 - stylesheetArray.length;
                });
            });
        });

        DbgObjectTree.AddType(null, MSHTML.Module, "CMarkup", null, function(markup) {
            return markup.f("_pStyleSheetArray._aStyleSheets").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_pSSSheet._apMediaLists").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CMediaList", null, function(stylesheet) {
            return stylesheet.f("_apMediaQueries").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CMediaQuery", null, function(stylesheet) {
            return stylesheet.f("_pAA").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_pSSSheet._apFontBlocks").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_pSSSheet._apPageBlocks").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_pSSSheet._apViewportBlocks").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_pSSSheet._apImportBlocks").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleSheet", null, function(stylesheet) {
            return stylesheet.f("_pSSSheet._apRulesList").array();
        })

        DbgObjectTree.AddType(null, MSHTML.Module, "CStyleRule", null, function(styleRule) {
            return styleRule.f("_paaStyleProperties").array();
        }, function (rule, stylesheet) {
            return getSelectorDescription(rule.f("_pFirstSelector"), stylesheet);
        })

        DbgObjectTree.AddAddressInterpreter(function (address) {
            return new DbgObject(MSHTML.Module, "CMarkup", address);
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