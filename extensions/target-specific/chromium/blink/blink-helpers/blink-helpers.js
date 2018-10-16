"use strict";

Loader.OnLoad(function() {
    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::CharacterData"), "data", false, (characterDataNode) => {
        return characterDataNode.f("data_").desc("Text").then(WhitespaceFormatter.CreateFormattedText);
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::CharacterData"), "length", false, (characterDataNode) => {
        return characterDataNode.f("data_").desc("TextLength");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::Document"), "URL", false, (document) => {
        return document.f("base_url_").f("string_").desc("Text");
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "body", Chromium.ChildProcessType("blink_core", "blink::HTMLElement"), UserEditableFunctions.Create((document) => {
        return document.f("document_element_.raw_").dcast(Chromium.ChildProcessType("blink_core", "blink::HTMLHtmlElement"))
        .then((htmlElement) => {
            if (!htmlElement.isNull()) {
                return htmlElement.array("child_nodes_").filter((childNode) => {
                    return Promise.all([childNode.dcast(Chromium.ChildProcessType("blink_core", "blink::HTMLBodyElement")), childNode.dcast(Chromium.ChildProcessType("blink_core", "blink::HTMLFrameSetElement"))])
                    .thenAll((bodyElement, frameSetElement) => (!bodyElement.isNull() || !frameSetElement.isNull()));
                })
                .then((bodies) => ((bodies.length > 0) ? bodies[0] : DbgObject.NULL));
            } else {
                return DbgObject.NULL;
            }
        });
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Node"), "rare_data_", Chromium.ChildProcessType("blink_core", "blink::NodeRareData"), UserEditableFunctions.Create((node) => {
        return Promise.all([node.f("node_flags_").val(), DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::Node::NodeFlags"), "kHasRareDataFlag")])
        .thenAll((nodeFlags, hasRareDataFlag) => {
            var nodeHasRareData = nodeFlags & hasRareDataFlag;
            if (nodeHasRareData) {
                return node.f("data_").f("rare_data_").as(Chromium.ChildProcessType("blink_core", "blink::NodeRareData"));
            } else {
                return DbgObject.NULL;
            }
        });
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::NodeRareData"), "element_rare_data_", Chromium.ChildProcessType("blink_core", "blink::ElementRareData"), UserEditableFunctions.Create((nodeRareData) => {
        return nodeRareData.f("is_element_rare_data_").val()
        .then((isElementRareData) => {
            if (isElementRareData) {
                return nodeRareData.as(Chromium.ChildProcessType("blink_core", "blink::ElementRareData"));
            } else {
                return DbgObject.NULL;
            }
        });
    }));

    function getCollectionFromOwnerNode(node, collectionTypeOrPromise) {
        return node.F("rare_data_").f("node_lists_.raw_").f("atomic_name_caches_").f("impl_")
        .then((hashTable) => {
            if (!hashTable.isNull()) {
                return Promise.all([hashTable.array("Pairs"), collectionTypeOrPromise])
                .thenAll((pairs, collectionType) => {
                    return Promise.filter(pairs, (pair) => {
                        return pair.f("key").f("first").val()
                        .then((firstVal) => (firstVal == collectionType));
                    });
                })
                .then((pairForCollectionType) => {
                    console.assert(pairForCollectionType.length <= 1);
                    return (pairForCollectionType.length > 0) ? pairForCollectionType[0].f("value.raw_").vcast() : DbgObject.NULL;
                });
            } else {
                return DbgObject.NULL;
            }
        });
    }

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::ContainerNode"), "children", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((containerNode) => {
        return getCollectionFromOwnerNode(containerNode, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kNodeChildren"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "all", Chromium.ChildProcessType("blink_core", "blink::HTMLAllCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDocAll"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "images", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDocImages"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "applets", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDocApplets"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "embeds", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDocEmbeds"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "scripts", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDocScripts"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "links", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDocLinks"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "forms", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDocForms"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "anchors", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDocAnchors"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Document"), "DOMSelection", Chromium.ChildProcessType("blink_core", "blink::DOMSelection"), UserEditableFunctions.Create((document) => {
        return document.f("tree_scope_.raw_").f("selection_.raw_");
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::ShadowRoot"), "DOMSelection", Chromium.ChildProcessType("blink_core", "blink::DOMSelection"), UserEditableFunctions.Create((shadowRoot) => {
        return shadowRoot.f("tree_scope_.raw_").f("selection_.raw_");
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::DOMSelection"), "FrameSelection", Chromium.ChildProcessType("blink_core", "blink::FrameSelection"), UserEditableFunctions.Create((domSelection) => {
        return validExecutionContextOrNull(domSelection.f("execution_context_.raw_"))
        .then((validExecutionContextOrNull) => validExecutionContextOrNull.dcast(Chromium.ChildProcessType("blink_core", "blink::Document")).f("frame_.raw_").dcast(Chromium.ChildProcessType("blink_core", "blink::LocalFrame")).f("selection_.raw_"));
    }));

    function validExecutionContextOrNull(executionContext) {
        return Promise.all([executionContext, executionContext.f("is_context_destroyed_").val()])
        .thenAll((executionContext, isContextDestroyed) => ((executionContext.isNull() || isContextDestroyed) ? DbgObject.NULL : executionContext));
    }

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Range"), "startContainer", Chromium.ChildProcessType("blink_core", "blink::Node"), UserEditableFunctions.Create((range) => {
        return range.f("start_").f("container_node_.raw_");
    }));

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::Range"), "startOffset", false, UserEditableFunctions.Create((range) => {
        return range.f("start_").f("offset_in_container_");
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Range"), "endContainer", Chromium.ChildProcessType("blink_core", "blink::Node"), UserEditableFunctions.Create((range) => {
        return range.f("end_").f("container_node_.raw_");
    }));

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::Range"), "endOffset", false, UserEditableFunctions.Create((range) => {
        return range.f("end_").f("offset_in_container_");
    }));

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::Element"), "id", false, (element) => {
        return element.f("element_data_.raw_")
        .then((elementData) => (!elementData.isNull() ? elementData.f("id_for_style_resolution_").desc("Text") : ""));
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Node"), "ownerDocument", Chromium.ChildProcessType("blink_core", "blink::Document"), (node) => {
        return node.f("tree_scope_.raw_").f("document_.raw_")
        .then((document) => (!node.equals(document) ? document : DbgObject.NULL));
    });

    DbgObject.AddArrayField(Chromium.ChildProcessType("blink_core", "blink::ContainerNode"), "child_nodes_", Chromium.ChildProcessType("blink_core", "blink::Node"), (containerNode) => {
        return containerNode.f("first_child_.raw_")
        .list((containerNode) => containerNode.f("next_.raw_"))
        .map((child) => child.vcast());
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Node"), "childNodes", Chromium.ChildProcessType("blink_core", "blink::NodeList"), UserEditableFunctions.Create((node) => {
        return node.F("rare_data_").f("node_lists_.raw_").f("child_node_list_.raw_");
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLDataListElement"), "options", Chromium.ChildProcessType("blink_core", "blink::HTMLDataListOptionsCollection"), UserEditableFunctions.Create((htmlDataListElement) => {
        return getCollectionFromOwnerNode(htmlDataListElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kDataListOptions"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLFormElement"), "elements", Chromium.ChildProcessType("blink_core", "blink::HTMLFormControlsCollection"), UserEditableFunctions.Create((htmlFormElement) => {
        return getCollectionFromOwnerNode(htmlFormElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kFormControls"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLMapElement"), "areas", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((htmlMapElement) => {
        return getCollectionFromOwnerNode(htmlMapElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kMapAreas"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLSelectElement"), "options", Chromium.ChildProcessType("blink_core", "blink::HTMLOptionsCollection"), UserEditableFunctions.Create((htmlSelectElement) => {
        return getCollectionFromOwnerNode(htmlSelectElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kSelectOptions"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLSelectElement"), "selectedOptions", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((htmlSelectElement) => {
        return getCollectionFromOwnerNode(htmlSelectElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kSelectedOptions"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLTableElement"), "rows", Chromium.ChildProcessType("blink_core", "blink::HTMLTableRowsCollection"), UserEditableFunctions.Create((htmlTableElement) => {
        return getCollectionFromOwnerNode(htmlTableElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kTableRows"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLTableElement"), "tBodies", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((htmlTableElement) => {
        return getCollectionFromOwnerNode(htmlTableElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kTableTBodies"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLTableRowElement"), "cells", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((htmlTableRowElement) => {
        return getCollectionFromOwnerNode(htmlTableRowElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kTRCells"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLTableSectionElement"), "rows", Chromium.ChildProcessType("blink_core", "blink::HTMLCollection"), UserEditableFunctions.Create((htmlTableSectionElement) => {
        return getCollectionFromOwnerNode(htmlTableSectionElement, DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::CollectionType"), "kTSectionRows"));
    }));

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Element"), "shadowRoot", Chromium.ChildProcessType("blink_core", "blink::ShadowRoot"), (element) => {
        return element.F("rare_data_").F("element_rare_data_").f("shadow_root_.raw_").vcast();
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::Element"), "tagName", false, (element) => {
        return Promise.all([element.f("tag_name_"), element.dcast(Chromium.ChildProcessType("blink_core", "blink::HTMLElement")), element.F("ownerDocument").f("document_classes_").val()])
        .thenAll((tagQualifiedName, htmlElement, documentClass) => {
            return tagQualifiedName.desc("ToString")
            .then((lowerCaseTagName) => ((!htmlElement.isNull() && (documentClass == /*HTMLDocument*/1)) ? lowerCaseTagName.toUpperCase() : lowerCaseTagName));
        });
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::QualifiedName"), "Prefix", false, (qualifiedName) => {
        return qualifiedName.f("impl_").f("ptr_").f("prefix_").desc("Text");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::QualifiedName"), "LocalName", false, (qualifiedName) => {
        return qualifiedName.f("impl_").f("ptr_").f("local_name_").desc("Text");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::QualifiedName"), "NamespaceURI", false, (qualifiedName) => {
        return qualifiedName.f("impl_").f("ptr_").f("namespace_").desc("Text");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::QualifiedName"), "ToString", true, (qualifiedName) => {
        return Promise.all([qualifiedName.desc("Prefix"), qualifiedName.desc("LocalName")])
        .thenAll((prefix, localName) => {
            var name = "";
            if (prefix.length > 0) {
                name += prefix + ":";
            }
            name += localName;
            return name;
        });
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLFrameOwnerElement"), "contentWindow", Chromium.ChildProcessType("blink_core", "blink::DOMWindow"), (frameOwnerElement) => {
        return frameOwnerElement.f("content_frame_.raw_").f("dom_window_.raw_");
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLFrameOwnerElement"), "contentDocument", Chromium.ChildProcessType("blink_core", "blink::Document"), (frameOwnerElement) => {
        return frameOwnerElement.F("contentWindow").F("document");
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::DOMWindow"), "document", Chromium.ChildProcessType("blink_core", "blink::Document"), (domWindow) => {
        return domWindow.dcast(Chromium.ChildProcessType("blink_core", "blink::LocalDOMWindow")).f("document_.raw_");
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLTemplateElement"), "content", Chromium.ChildProcessType("blink_core", "blink::TemplateContentDocumentFragment"), (templateElement) => {
        return templateElement.f("content_.raw_");
    });
});