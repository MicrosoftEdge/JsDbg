"use strict";

var StyleSheets = undefined;
Loader.OnLoad(function() {
    StyleSheets = {
        Tree: DbgObjectTreeNew.Create("StyleSheets"),
        Renderer: new DbgObjectTreeRenderer(),
        InterpretAddress: function(address) {
            return new DbgObject(MSHTML.Module, "CBase", address).vcast()
            .then(null, function (err) {
                return new DbgObject(MSHTML.Module, "CSharedStyleSheet", address);
            })
        },
        GetRoots: function() { 
            return Promise.sort(Promise.filter(MSHTML.GetCDocs().F("PrimaryMarkup"), function (m) { return !m.isNull(); }), function(markup) {
                return markup.f("_pStyleSheetArray").f("_pageStyleSheets", "_aStyleSheets").array("Items")
                .then(function (stylesheetArray) {
                    return 0 - stylesheetArray.length;
                });
            });
        },
        DefaultTypes: []
    };

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
                            return stylesheets[0].F("Markup.Doc");
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

                if (!props[7].isNull() && !(props[3] == "ETAG_GENERIC" && props[7].typeDescription() == "CNamespaceSelectorPart")) {
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
                    var tagNamePromise = Promise.as(props[3].toLowerCase().substr("ETAG_".length));
                    if (props[3] == "ETAG_GENERIC" && props[7].typeDescription() == "CNamespaceSelectorPart") {
                        tagNamePromise = props[7].f("_cstrLocalName._pch").string()
                    }

                    return tagNamePromise
                    .then(function (tagName) {
                        return prefix + tagName + suffix;  
                    })
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
        return TreeInspector.GetActions("stylesheets", "Stylesheets", stylesheet);
    });

    DbgObject.AddAction(MSHTML.Module, "CMarkup", "StyleSheetViewer", function(markup) {
        return TreeInspector.GetActions("stylesheets", "Stylesheets", markup);
    });


    StyleSheets.Tree.addChildren(MSHTML.Module, "CStyleSheetArray", function(array) {
        return array.f("_pageStyleSheets", "_aStyleSheets").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CStyleSheetArray", function(array) {
        return array.f("_extensionStyleSheets").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CMarkup", function(markup) {
        return markup.f("_pStyleSheetArray");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CStyleSheet", function(stylesheet) {
        return stylesheet.f("_pSSSheet");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CSharedStyleSheet", function(stylesheet) {
        return stylesheet.f("_apMediaLists").array("Items");
    })        

    StyleSheets.Tree.addChildren(MSHTML.Module, "CMediaList", function(stylesheet) {
        return stylesheet.f("_apMediaQueries").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CMediaQuery", function(stylesheet) {
        return stylesheet.f("_pAA").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CStyleSheet", function(stylesheet) {
        return stylesheet.f("_pImportedStyleSheets")
        .then(function (imports) {
            if (imports.isNull()) {
                return [];
            } else {
                return [imports];
            }
        })
    })        

    StyleSheets.Tree.addChildren(MSHTML.Module, "CSharedStyleSheet", function(stylesheet) {
        return stylesheet.f("_apFontBlocks").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CSharedStyleSheet", function(stylesheet) {
        return stylesheet.f("_apPageBlocks").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CSharedStyleSheet", function(stylesheet) {
        return stylesheet.f("_apViewportBlocks").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CSharedStyleSheet", function(stylesheet) {
        return stylesheet.f("_apImportBlocks").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CSharedStyleSheet", function(stylesheet) {
        return stylesheet.f("_apRulesList").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Module, "CStyleRule", function(styleRule) {
        return styleRule.f("_paaStyleProperties").array("Items");
    })

    StyleSheets.Renderer.addNameRenderer(MSHTML.Module, "CMarkup", function (markup) {
        return markup.desc("URL")
        .then(function (url) {
            return "CMarkup (" + url + ")";
        })
    });

    StyleSheets.Renderer.addNameRenderer(MSHTML.Module, "CStyleSheet", function (stylesheet) {
        return stylesheet.f("_pSSSheet._achAbsoluteHref").string()
        .then(function (href) {
            return "CStyleSheet (" + href + ")";
        })
    });

    StyleSheets.Renderer.addNameRenderer(MSHTML.Module, "CStyleRule", function (rule, ruleNode) {
        return getSelectorDescription(rule.f("_pFirstSelector"), ruleNode.parent.getObject());
    })

    StyleSheets.Renderer.addNameRenderer(MSHTML.Module, "CAttrValue", function(attrValue) {
        return Promise.join([attrValue.desc("Name"), attrValue.desc("Value")])
        .then(function (nameAndValue) {
            var name = nameAndValue[0];
            var value = nameAndValue[1];
            if (value instanceof DbgObject) {
                value = value.desc();
            }
            return Promise.as(value)
            .then(function (value) {
                return name.toLowerCase() + ":" + value;
            })
        })
    })
});