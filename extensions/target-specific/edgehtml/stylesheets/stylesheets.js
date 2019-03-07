//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var StyleSheets = undefined;
Loader.OnLoad(function() {
    StyleSheets = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            return DbgObject.create(MSHTML.Type("CBase"), address).vcast()
            .then(null, function (err) {
                return DbgObject.create(MSHTML.Type("CSharedStyleSheet"), address);
            })
        },
        GetRoots: function() { 
            return Promise.sort(Promise.filter(MSHTML.GetCDocs().F("PrimaryMarkup"), function (m) { return !m.isNull(); }), function(markup) {
                return markup.f("_pStyleSheetArray").f("_pageStyleSheets", "_aStyleSheets").array("Items").deref()
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
            var prefix = Promise.resolve("");
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
        return Promise.resolve(selector.isNull())
        .then(function (isNull) {
            if (isNull) {
                return null;
            }

            return Promise.all([
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
            .thenAll(function (suffix, classSelector, idAtom, tag, prefix, pseudoElement, combinator, selectorPart, hover, universalExplicit) {
                suffix = (suffix == null ? "" : ", " + suffix);

                if (prefix != null) {
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

                if (pseudoElement != "pelemNone") {
                    suffix = "::" + hyphenate(pseudoElement.substr("pelem".length)).toLowerCase() + suffix;
                }

                if (hover == 1) {
                    suffix = ":hover" + suffix;
                }

                if (!selectorPart.isNull() && !(tag == "ETAG_GENERIC" && selectorPart.type.name() == "CNamespaceSelectorPart")) {
                    suffix = "[" + selectorPart.type.htmlName() + "]" + suffix;
                }

                if (!classSelector.isNull()) {
                    return getClassSelectorDescription(classSelector, stylesheet)
                    .then(function (classDescription) {
                        return prefix + classDescription + suffix;
                    })
                } else if (idAtom >= 0) {
                    return getAtomFromAtomTable(getDocFromStylesheet(stylesheet).f("_AtomTable"), idAtom)
                    .then(function (idName) {
                        return prefix + "#" + idName + suffix;
                    })
                } else if (tag != "ETAG_UNKNOWN") {
                    var tagNamePromise = Promise.resolve(tag.toLowerCase().substr("ETAG_".length));
                    if (tag == "ETAG_GENERIC" && selectorPart.type.name() == "CNamespaceSelectorPart") {
                        tagNamePromise = selectorPart.f("_cstrLocalName._pch").string()
                    }

                    return tagNamePromise
                    .then(function (tagName) {
                        return prefix + tagName + suffix;  
                    })
                } else if (universalExplicit) {
                    return prefix + "*" + suffix;
                } else if (prefix == "" && suffix == "") {
                    return "???";
                } else {
                    return prefix + suffix;
                }
            });
        })
    }

    DbgObject.AddAction(MSHTML.Type("CStyleSheet"), "StyleSheetViewer", function(stylesheet) {
        return TreeInspector.GetActions("stylesheets", "Stylesheets", stylesheet);
    });

    DbgObject.AddAction(MSHTML.Type("CMarkup"), "StyleSheetViewer", function(markup) {
        return TreeInspector.GetActions("stylesheets", "Stylesheets", markup);
    });

    DbgObject.AddAction(MSHTML.Type("CDoc"), "StyleSheetViewer", function(doc) {
        return doc.F("PrimaryMarkup").actions("StyleSheetViewer");
    });

    StyleSheets.Tree.addChildren(MSHTML.Type("CStyleSheetArray"), function(array) {
        return array.f("_pageStyleSheets", "_aStyleSheets").array("Items").deref();
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CStyleSheetArray"), function(array) {
        return array.f("_extensionStyleSheets").array("Items").deref();
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CMarkup"), function(markup) {
        return markup.f("_pStyleSheetArray");
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CStyleSheet"), function(stylesheet) {
        return stylesheet.f("_pSSSheet");
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CSharedStyleSheet"), function(stylesheet) {
        return stylesheet.f("_apMediaLists").array("Items");
    })        

    StyleSheets.Tree.addChildren(MSHTML.Type("CMediaList"), function(stylesheet) {
        return stylesheet.f("_apMediaQueries").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CMediaQuery"), function(stylesheet) {
        return stylesheet.f("_pAA").array("Items");
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CStyleSheet"), function(stylesheet) {
        return stylesheet.f("_pImportedStyleSheets")
        .then(function (imports) {
            if (imports.isNull()) {
                return [];
            } else {
                return [imports];
            }
        })
    })        

    StyleSheets.Tree.addChildren(MSHTML.Type("CSharedStyleSheet"), function(stylesheet) {
        return stylesheet.f("_apFontBlocks").array("Elements").f("m_pT")
        .catch(function () {
            // Fallback for when the field was not a std::vector.
            return stylesheet.f("_apFontBlocks").array("Items");
        })
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CSharedStyleSheet"), function(stylesheet) {
        return stylesheet.f("_apPageBlocks").array("Elements").f("m_pT")
        .catch(function () {
            // Fallback for when the field was not a std::vector.
            return stylesheet.f("_apPageBlocks").array("Items");
        })
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CSharedStyleSheet"), function(stylesheet) {
        return stylesheet.f("_apViewportBlocks").array("Elements").f("m_pT")
        .catch(function () {
            // Fallback for when the field was not a std::vector.
            return stylesheet.f("_apViewportBlocks").array("Items");
        })
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CSharedStyleSheet"), function(stylesheet) {
        return stylesheet.f("_apImportBlocks").array("Elements").f("m_pT")
        .catch(function () {
            // Fallback for when the field was not a std::vector.
            return stylesheet.f("_apImportBlocks").array("Items");
        })
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CSharedStyleSheet"), function(stylesheet) {
        return stylesheet.f("_apRulesList").array("Elements").f("m_pT")
        .catch(function () {
            // Fallback for when the field was not a std::vector.
            return stylesheet.f("_apRulesList").array("Items");
        })
    })

    StyleSheets.Tree.addChildren(MSHTML.Type("CStyleRule"), function(styleRule) {
        return styleRule.f("_spSpecifiedStyle.m_pT.attrArray.m_pT", "_paaStyleProperties", "_pStyleRuleData._paaStyleProperties").array("Items");
    })

    StyleSheets.Renderer.addNameRenderer(MSHTML.Type("CMarkup"), function (markup) {
        return markup.desc("URL")
        .then(function (url) {
            return "CMarkup (" + url + ")";
        })
    });

    StyleSheets.Renderer.addNameRenderer(MSHTML.Type("CStyleSheet"), function (stylesheet) {
        return stylesheet.f("_pSSSheet").f("_strAbsoluteHref._pch", "_achAbsoluteHref").string()
        .then(function (href) {
            return "CStyleSheet (" + href + ")";
        })
    });

    StyleSheets.Renderer.addNameRenderer(MSHTML.Type("CStyleRule"), function (rule, sharedStyleSheet) {
        return getSelectorDescription(rule.f("_pFirstSelector"), sharedStyleSheet);
    })

    StyleSheets.Renderer.addNameRenderer(MSHTML.Type("CAttrValue"), function(attrValue) {
        return Promise.all([attrValue.desc("Name"), attrValue.desc("Value")])
        .thenAll(function (name, value) {
            if (name.split("/").length > 1) {
                var prefix = "DISPID_CCSSStyleDeclaration_";
                var formattedNames = name.split("/")
                    .filter(function (dispid) { return dispid.indexOf(prefix) == 0; })
                    .map(function (dispid) { return dispid.substr(prefix.length); })

                if (formattedNames.length == 1) {
                    name = formattedNames[0];
                }
            }
            
            if (value instanceof DbgObject) {
                value = value.desc();
            }
            return Promise.resolve(value)
            .then(function (value) {
                return name.toLowerCase() + ":" + value;
            })
        })
    })
});