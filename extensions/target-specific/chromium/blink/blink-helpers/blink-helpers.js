//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var BlinkHelpers = null;
Loader.OnLoad(function() {
    DbgObject.AddExtendedField(
        (type) => type.name().match(/^blink::DataRef<.*>$/) != null,
        "Data",
        (type) => type.templateParameters()[0],
        (dataRef) => dataRef.f("data_.ptr_")
    );

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::CharacterData"), "data", false, UserEditableFunctions.Create((characterDataNode) => {
        return characterDataNode.f("data_").desc("Text").then(WhitespaceFormatter.CreateFormattedText);
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::CharacterData"), "length", false, UserEditableFunctions.Create((characterDataNode) => {
        return characterDataNode.f("data_").desc("TextLength");
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::Document"), "URL", false, UserEditableFunctions.Create((document) => document.f("base_url_").f("string_").desc("Text")));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "body", Chromium.RendererProcessType("blink::HTMLElement"), UserEditableFunctions.Create((document) => {
        return document.f("document_element_.raw_").dcast(Chromium.RendererProcessType("blink::HTMLHtmlElement"))
        .then((htmlElement) => {
            if (!htmlElement.isNull()) {
                return htmlElement.array("child_nodes_").filter((childNode) => {
                    return Promise.all([childNode.dcast(Chromium.RendererProcessType("blink::HTMLBodyElement")), childNode.dcast(Chromium.RendererProcessType("blink::HTMLFrameSetElement"))])
                    .thenAll((bodyElement, frameSetElement) => (!bodyElement.isNull() || !frameSetElement.isNull()));
                })
                .then((bodies) => ((bodies.length > 0) ? bodies[0] : DbgObject.NULL));
            } else {
                return DbgObject.NULL;
            }
        });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Node"), "rare_data_", Chromium.RendererProcessType("blink::NodeRareData"), UserEditableFunctions.Create((node) => {
        return Promise.all([node.f("node_flags_").val(), DbgObject.constantValue(Chromium.RendererProcessType("blink::Node::NodeFlags"), "kHasRareDataFlag")])
        .thenAll((nodeFlags, hasRareDataFlag) => {
            var nodeHasRareData = nodeFlags & hasRareDataFlag;
            if (nodeHasRareData) {
                return node.f("data_").f("rare_data_").as(Chromium.RendererProcessType("blink::NodeRareData"));
            } else {
                return DbgObject.NULL;
            }
        });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::NodeRareData"), "element_rare_data_", Chromium.RendererProcessType("blink::ElementRareData"), UserEditableFunctions.Create((nodeRareData) => {
        return nodeRareData.f("is_element_rare_data_").val()
        .then((isElementRareData) => {
            if (isElementRareData) {
                return nodeRareData.as(Chromium.RendererProcessType("blink::ElementRareData"));
            } else {
                return DbgObject.NULL;
            }
        });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::ElementData"), "unique_element_data_", Chromium.RendererProcessType("blink::UniqueElementData"), UserEditableFunctions.Create((elementData) => {
        return elementData.f("is_unique_").val()
        .then((isUnique) => {
            if (isUnique) {
                return elementData.as(Chromium.RendererProcessType("blink::UniqueElementData"));
            } else {
                return DbgObject.NULL;
            }
        });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::ElementData"), "shareable_element_data_", Chromium.RendererProcessType("blink::ShareableElementData"), UserEditableFunctions.Create((elementData) => {
        return elementData.f("is_unique_").val()
        .then((isUnique) => {
            if (!isUnique) {
                return elementData.as(Chromium.RendererProcessType("blink::ShareableElementData"));
            } else {
                return DbgObject.NULL;
            }
        });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Node"), "node_layout_data_", Chromium.RendererProcessType("blink::NodeRenderingData"), UserEditableFunctions.Create((node) => {
        return node.F("rare_data_")
        .then((nodeRareData) => (!nodeRareData.isNull() ? nodeRareData : node.f("data_")))
        .then((nodeData) => nodeData.f("node_layout_data_"));
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

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::ContainerNode"), "children", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((containerNode) => {
        return getCollectionFromOwnerNode(containerNode, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kNodeChildren"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "all", Chromium.RendererProcessType("blink::HTMLAllCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDocAll"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "images", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDocImages"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "applets", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDocApplets"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "embeds", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDocEmbeds"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "scripts", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDocScripts"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "links", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDocLinks"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "forms", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDocForms"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "anchors", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((document) => {
        return getCollectionFromOwnerNode(document, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDocAnchors"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Document"), "DOMSelection", Chromium.RendererProcessType("blink::DOMSelection"), UserEditableFunctions.Create((document) => {
        return document.f("tree_scope_.raw_").f("selection_.raw_");
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::ShadowRoot"), "DOMSelection", Chromium.RendererProcessType("blink::DOMSelection"), UserEditableFunctions.Create((shadowRoot) => {
        return shadowRoot.f("tree_scope_.raw_").f("selection_.raw_");
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::DOMSelection"), "FrameSelection", Chromium.RendererProcessType("blink::FrameSelection"), UserEditableFunctions.Create((domSelection) => {
        return validExecutionContextOrNull(domSelection.f("execution_context_.raw_"))
        .then((validExecutionContextOrNull) => validExecutionContextOrNull.dcast(Chromium.RendererProcessType("blink::Document")).f("frame_.raw_").dcast(Chromium.RendererProcessType("blink::LocalFrame")).f("selection_.raw_"));
    }));

    function validExecutionContextOrNull(executionContext) {
        return Promise.all([executionContext, executionContext.f("is_context_destroyed_").val()])
        .thenAll((executionContext, isContextDestroyed) => ((executionContext.isNull() || isContextDestroyed) ? DbgObject.NULL : executionContext));
    }

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Range"), "startContainer", Chromium.RendererProcessType("blink::Node"), UserEditableFunctions.Create((range) => {
        return range.f("start_").f("container_node_.raw_");
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::Range"), "startOffset", false, UserEditableFunctions.Create((range) => {
        return range.f("start_").f("offset_in_container_");
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Range"), "endContainer", Chromium.RendererProcessType("blink::Node"), UserEditableFunctions.Create((range) => {
        return range.f("end_").f("container_node_.raw_");
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::Range"), "endOffset", false, UserEditableFunctions.Create((range) => {
        return range.f("end_").f("offset_in_container_");
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::Element"), "id", false, UserEditableFunctions.Create((element) => {
        return element.f("element_data_.raw_")
        .then((elementData) => (!elementData.isNull() ? elementData.f("id_for_style_resolution_").desc("Text") : ""));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Node"), "ownerDocument", Chromium.RendererProcessType("blink::Document"), UserEditableFunctions.Create((node) => {
        return node.f("tree_scope_.raw_").f("document_.raw_")
        .then((document) => (!node.equals(document) ? document : DbgObject.NULL));
    }));

    DbgObject.AddArrayField(Chromium.RendererProcessType("blink::ContainerNode"), "child_nodes_", Chromium.RendererProcessType("blink::Node"), UserEditableFunctions.Create((containerNode) => {
        return containerNode.f("first_child_.raw_")
        .list((containerNode) => containerNode.f("next_.raw_"))
        .map((child) => child.vcast());
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Node"), "childNodes", Chromium.RendererProcessType("blink::NodeList"), UserEditableFunctions.Create((node) => {
        return node.F("rare_data_").f("node_lists_.raw_").f("child_node_list_.raw_");
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLDataListElement"), "options", Chromium.RendererProcessType("blink::HTMLDataListOptionsCollection"), UserEditableFunctions.Create((htmlDataListElement) => {
        return getCollectionFromOwnerNode(htmlDataListElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kDataListOptions"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLFormElement"), "elements", Chromium.RendererProcessType("blink::HTMLFormControlsCollection"), UserEditableFunctions.Create((htmlFormElement) => {
        return getCollectionFromOwnerNode(htmlFormElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kFormControls"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLMapElement"), "areas", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((htmlMapElement) => {
        return getCollectionFromOwnerNode(htmlMapElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kMapAreas"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLSelectElement"), "options", Chromium.RendererProcessType("blink::HTMLOptionsCollection"), UserEditableFunctions.Create((htmlSelectElement) => {
        return getCollectionFromOwnerNode(htmlSelectElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kSelectOptions"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLSelectElement"), "selectedOptions", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((htmlSelectElement) => {
        return getCollectionFromOwnerNode(htmlSelectElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kSelectedOptions"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLTableElement"), "rows", Chromium.RendererProcessType("blink::HTMLTableRowsCollection"), UserEditableFunctions.Create((htmlTableElement) => {
        return getCollectionFromOwnerNode(htmlTableElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kTableRows"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLTableElement"), "tBodies", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((htmlTableElement) => {
        return getCollectionFromOwnerNode(htmlTableElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kTableTBodies"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLTableRowElement"), "cells", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((htmlTableRowElement) => {
        return getCollectionFromOwnerNode(htmlTableRowElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kTRCells"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLTableSectionElement"), "rows", Chromium.RendererProcessType("blink::HTMLCollection"), UserEditableFunctions.Create((htmlTableSectionElement) => {
        return getCollectionFromOwnerNode(htmlTableSectionElement, DbgObject.constantValue(Chromium.RendererProcessType("blink::CollectionType"), "kTSectionRows"));
    }));

    DbgObject.AddArrayField(Chromium.RendererProcessType("blink::Element"), "attributes_", Chromium.RendererProcessType("blink::Attribute"), UserEditableFunctions.Create((element) => {
        return element.f("element_data_.raw_")
        .then((elementData) => {
            if (!elementData.isNull()) {
                return Promise.all([elementData.F("unique_element_data_"), elementData.F("shareable_element_data_")])
                .thenAll((uniqueElementData, shareableElementData) => {
                    if (!uniqueElementData.isNull()) {
                        return uniqueElementData.f("attribute_vector_").array("Elements");
                    } else {
                        console.assert(!shareableElementData.isNull());
                        return shareableElementData.array("attributes_");
                    }
                });
            } else {
                return [];
            }
        });
    }));

    DbgObject.AddArrayField(Chromium.RendererProcessType("blink::ShareableElementData"), "attributes_", Chromium.RendererProcessType("blink::Attribute"), UserEditableFunctions.Create((shareableElementData) => {
        return shareableElementData.f("attribute_array_").array(shareableElementData.f("array_size_"));
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::Element"), "shadowRoot", Chromium.RendererProcessType("blink::ShadowRoot"), UserEditableFunctions.Create((element) => {
        return element.F("rare_data_").F("element_rare_data_").f("shadow_root_.raw_").vcast();
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::Element"), "tagName", false, UserEditableFunctions.Create((element) => {
        return Promise.all([element.f("tag_name_"), element.dcast(Chromium.RendererProcessType("blink::HTMLElement")), element.F("ownerDocument").f("document_classes_").val()])
        .thenAll((tagQualifiedName, htmlElement, documentClass) => {
            return tagQualifiedName.desc("ToString")
            .then((lowerCaseTagName) => ((!htmlElement.isNull() && (documentClass == /*HTMLDocument*/1)) ? lowerCaseTagName.toUpperCase() : lowerCaseTagName));
        });
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::QualifiedName"), "Prefix", false, UserEditableFunctions.Create((qualifiedName) => {
        return qualifiedName.f("impl_").f("ptr_").f("prefix_").desc("Text");
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::QualifiedName"), "LocalName", false, UserEditableFunctions.Create((qualifiedName) => {
        return qualifiedName.f("impl_").f("ptr_").f("local_name_").desc("Text");
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::QualifiedName"), "NamespaceURI", false, UserEditableFunctions.Create((qualifiedName) => {
        return qualifiedName.f("impl_").f("ptr_").f("namespace_").desc("Text");
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::QualifiedName"), "ToString", true, UserEditableFunctions.Create((qualifiedName) => {
        return Promise.all([qualifiedName.desc("Prefix"), qualifiedName.desc("LocalName")])
        .thenAll((prefix, localName) => {
            var name = "";
            if (prefix.length > 0) {
                name += prefix + ":";
            }
            name += localName;
            return name;
        });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLFrameOwnerElement"), "contentWindow", Chromium.RendererProcessType("blink::DOMWindow"), UserEditableFunctions.Create((frameOwnerElement) => {
        return frameOwnerElement.f("content_frame_.raw_").f("dom_window_.raw_");
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLFrameOwnerElement"), "contentDocument", Chromium.RendererProcessType("blink::Document"), UserEditableFunctions.Create((frameOwnerElement) => {
        return frameOwnerElement.F("contentWindow").F("document");
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::DOMWindow"), "document", Chromium.RendererProcessType("blink::Document"), UserEditableFunctions.Create((domWindow) => {
        return domWindow.dcast(Chromium.RendererProcessType("blink::LocalDOMWindow")).f("document_.raw_");
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::HTMLTemplateElement"), "content", Chromium.RendererProcessType("blink::TemplateContentDocumentFragment"), UserEditableFunctions.Create((templateElement) => {
        return templateElement.f("content_.raw_");
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::HTMLInputElement"), "type", false, UserEditableFunctions.Create((inputElement) => {
        return Promise.filter(inputElement.array("attributes_"), (attribute) => {
            return attribute.f("name_").desc()
            .then((attributeName) => (attributeName == "type"));
        })
        .then((attribute) => {
            if (attribute.length > 0) {
                console.assert(attribute.length == 1);
                return attribute[0].f("value_").desc();
            } else {
                return "text";
            }
        });
    }));

    DbgObject.AddArrayField(Chromium.RendererProcessType("blink::LayoutObject"), "child_objects_", Chromium.RendererProcessType("blink::LayoutObject"), UserEditableFunctions.Create((layoutObject) => {
        return layoutObject.vcast().f("children_")
        .then((layoutObjectChildList) => layoutObjectChildList.array("entries_"),
              () => []);
    }));

    DbgObject.AddArrayField(Chromium.RendererProcessType("blink::LayoutObjectChildList"), "entries_", Chromium.RendererProcessType("blink::LayoutObject"), UserEditableFunctions.Create((layoutObjectChildList) => {
        return layoutObjectChildList.f("first_child_").list("next_").vcast();
    }));

    DbgObject.AddArrayField(
        (type) => type.name().match(/^blink::InlineBoxList<(.*)>$/) != null,
        "entries_",
        (type) => type.templateParameters()[0],
        (inlineBoxList) => inlineBoxList.f("first_").list("next_").vcast()
    );

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::Color"), "Color", true, UserEditableFunctions.Create((color) => {
        return color.f("color_").val()
        .then((colorValue) => {
            var rgbaChannels = [(colorValue >> 16) & 0xFF, (colorValue >> 8) & 0xFF, colorValue & 0xFF, (colorValue >> 24) & 0xFF];
            var rgbaString = "rgba(" + rgbaChannels[0].toString() + ", " + rgbaChannels[1].toString() + ", " + rgbaChannels[2].toString() + ", " + rgbaChannels[3].toString() + ")";
            return "<div style='display:inline-block;border:thin solid black;width:2ex;height:1ex;background-color:" + rgbaString + ";'></div> " + rgbaString;
        });
    }));

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "white_space_", "blink::EWhiteSpace");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "list_style_type_", "blink::EListStyleType");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "cursor_", "blink::ECursor");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "display_", "blink::EDisplay");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "original_display_", "blink::EDisplay");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "break_after_", "blink::EBreakBetween");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "break_before_", "blink::EBreakBetween");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "pointer_events_", "blink::EPointerEvents");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "text_align_", "blink::ETextAlign");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "break_inside_", "blink::EBreakInside");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "clear_", "blink::EClear");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "floating_", "blink::EFloat");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "overflow_x_", "blink::EOverflow");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "overflow_y_", "blink::EOverflow");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "position_", "blink::EPosition");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "unicode_bidi_", "blink::UnicodeBidi");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "inside_link_", "blink::EInsideLink");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "overflow_anchor_", "blink::EOverflowAnchor");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "overscroll_behavior_x_", "blink::EOverscrollBehavior");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "overscroll_behavior_y_", "blink::EOverscrollBehavior");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "text_transform_", "blink::ETextTransform");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "visibility_", "blink::EVisibility");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "writing_mode_", "blink::WritingMode");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "border_collapse_", "blink::EBorderCollapse");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "box_direction_", "blink::EBoxDirection");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "direction_", "blink::TextDirection");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "empty_cells_", "blink::EEmptyCells");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "list_style_position_", "blink::EListStylePosition");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "print_color_adjust_", "blink::EPrintColorAdjust");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "rtl_ordering_", "blink::EOrder");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "scroll_snap_stop_", "blink::EScrollSnapStop");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "table_layout_", "blink::ETableLayout");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase"), "transform_box_", "blink::ETransformBox");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleBoxData"), "box_decoration_break_", "blink::EBoxDecorationBreak");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleBoxData"), "box_sizing_", "blink::EBoxSizing");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleGridData"), "grid_auto_repeat_columns_type_", "blink::AutoRepeatType");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleGridData"), "grid_auto_repeat_rows_type_", "blink::AutoRepeatType");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "blend_mode_", "blink::BlendMode");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "column_rule_style_", "blink::EBorderStyle");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "grid_auto_flow_", "blink::GridAutoFlow");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "object_fit_", "blink::EObjectFit");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "text_decoration_style_", "blink::ETextDecorationStyle");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "scroll_behavior_ ", "blink::ScrollBehavior");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "column_fill_", "blink::EColumnFill");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "column_span_", "blink::EColumnSpan");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "isolation_", "blink::EIsolation");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan100PercentData"), "transform_style_3d_", "blink::ETransformStyle3D");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan33PercentData"), "touch_action_ ", "blink::TouchAction");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan33PercentData"), "outline_style_", "blink::EBorderStyle");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan33PercentData"), "resize_", "blink::EResize");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan33PercentData"), "flex_wrap_", "blink::EFlexWrap");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan33PercentData"), "backface_visibility_ ", "blink::EBackfaceVisibility");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "appearance_", "blink::ControlPart");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "scroll_customization_ ", "blink::scroll_customization::ScrollDirection");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "box_align_", "blink::EBoxAlignment");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "box_pack_", "blink::EBoxPack");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "draggable_region_mode_", "blink::EDraggableRegionMode");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "margin_after_collapse_ ", "blink::EMarginCollapse");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "margin_before_collapse_ ", "blink::EMarginCollapse");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "page_size_type_", "blink::EPageSizeType");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "user_drag_", "blink::EUserDrag");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentSubData"), "box_orient_", "blink::EBoxOrient");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentData"), "flex_direction_", "blink::EFlexDirection");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareNonInheritedUsageLessThan13PercentData"), "text_overflow_", "blink::ETextOverflow");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleSurroundData"), "border_bottom_style_", "blink::EBorderStyle");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleSurroundData"), "border_left_style_", "blink::EBorderStyle");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleSurroundData"), "border_right_style_", "blink::EBorderStyle");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleSurroundData"), "border_top_style_", "blink::EBorderStyle");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleVisualData"), "text_decoration_", "blink::TextDecoration");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan100PercentData"), "text_align_last_", "blink::ETextAlignLast");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan100PercentData"), "hyphens_", "blink::Hyphens");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan100PercentData"), "text_justify_", "blink::TextJustify");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan100PercentData"), "text_orientation_", "blink::ETextOrientation");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan100PercentData"), "text_combine_", "blink::ETextCombine");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan100PercentData"), "text_decoration_skip_ink_", "blink::ETextDecorationSkipInk");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "effective_touch_action_", "blink::TouchAction");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "line_break_", "blink::LineBreak");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "text_emphasis_mark_", "blink::TextEmphasisMark");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "text_emphasis_position_", "blink::TextEmphasisPosition");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "text_security_", "blink::ETextSecurity");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "user_modify_", "blink::EUserModify");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "ruby_position_", "blink::RubyPosition");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "text_emphasis_fill_", "blink::TextEmphasisFill");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "text_indent_line_", "blink::TextIndentLine");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentSubData"), "text_indent_type_", "blink::TextIndentType");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentData"), "image_rendering_", "blink::EImageRendering");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentData"), "speak_", "blink::ESpeak");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentData"), "user_select_", "blink::EUserSelect");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentData"), "word_break_", "blink::EWordBreak");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::ComputedStyleBase::StyleRareInheritedUsageLessThan40PercentData"), "overflow_wrap_", "blink::EOverflowWrap");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::StyleSelfAlignmentData"), "position_", "blink::ItemPosition");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::StyleSelfAlignmentData"), "overflow_", "blink::OverflowAlignment");

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::StyleContentAlignmentData"), "position_", "blink::ContentPosition");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::StyleContentAlignmentData"), "distribution_", "blink::ContentDistributionType");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::StyleContentAlignmentData"), "overflow_", "blink::OverflowAlignment");

    function layoutValueToPx(layout_unit) {
      // kFixedPointDenominator is not present in the PDBs, so we define it here.
      const kFixedPointDenominator = 64;
      return (layout_unit / kFixedPointDenominator) + "px";
    }

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::LayoutUnit"), "RawValue", true, UserEditableFunctions.Create((layoutUnit) => {
        return layoutUnit.f("value_").val().then((unit) => layoutValueToPx(unit));
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::LayoutSize"), "Size", true, UserEditableFunctions.Create((size) => {
        return Promise.all([size.f("width_").val(), size.f("height_").val()])
        .thenAll((first, second) => `{${layoutValueToPx(first)}, ${layoutValueToPx(second)}}`);
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::NGPhysicalSize"), "Size", true, UserEditableFunctions.Create((size) => {
        return Promise.all([size.f("width").val(), size.f("height").val()])
        .thenAll((first, second) => `{${layoutValueToPx(first)}, ${layoutValueToPx(second)}}`);
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::LayoutPoint"), "Point", true, UserEditableFunctions.Create((point) => {
        return Promise.all([point.f("x_").val(), point.f("y_").val()])
        .thenAll((first, second) => `{${layoutValueToPx(first)}, ${layoutValueToPx(second)}}`);
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::NGPhysicalOffset"), "offset", true, UserEditableFunctions.Create((offset) => {
        return Promise.all([offset.f("left").val(), offset.f("top").val()])
        .thenAll((first, second) => `{${layoutValueToPx(first)}, ${layoutValueToPx(second)}}`);
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("blink::Length"), "Length", true, UserEditableFunctions.Create((dbgObject) => {
        return Promise.all([dbgObject.f("type_").as(Chromium.RendererProcessType("blink::Length::Type")).desc(), dbgObject.f("int_value_").val(), dbgObject.f("float_value_").val(), dbgObject.f("is_float_").val()]).thenAll((type, int_val, float_val, is_float) => {
          let val = "";
          if (type == "kFixed" || type == "kPercent")
            val = is_float ? float_val : int_val;
          return "Length::" + type.substr(1) + "(" + val + ")";
        });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "[as container fragment]", Chromium.RendererProcessType("blink::NGPhysicalContainerFragment"), UserEditableFunctions.Create((fragment) => {
        return fragment.f("type_").desc().then((type) => {
            if (type == "kFragmentBox" || type == "kFragmentLineBox" || type == "kFragmentRenderedLegend")
                return fragment.as(Chromium.RendererProcessType("blink::NGPhysicalContainerFragment"));
            return DbgObject.NULL;
      });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "[as box fragment]", Chromium.RendererProcessType("blink::NGPhysicalBoxFragment"), UserEditableFunctions.Create((fragment) => {
        return fragment.f("type_").desc().then((type) => {
            if (type == "kFragmentBox" || type == "kFragmentRenderedLegend")
                return fragment.as(Chromium.RendererProcessType("blink::NGPhysicalBoxFragment"));
            return DbgObject.NULL;
      });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "[as line box fragment]", Chromium.RendererProcessType("blink::NGPhysicalLineBoxFragment"), UserEditableFunctions.Create((fragment) => {
        return fragment.f("type_").desc().then((type) => {
            if (type == "kFragmentLineBox")
                return fragment.as(Chromium.RendererProcessType("blink::NGPhysicalLineBoxFragment"));
            return DbgObject.NULL;
      });
    }));

    DbgObject.AddExtendedField(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "[as text fragment]", Chromium.RendererProcessType("blink::NGPhysicalTextFragment"), UserEditableFunctions.Create((fragment) => {
        return fragment.f("type_").desc().then((type) => {
            if (type == "kFragmentText")
                return fragment.as(Chromium.RendererProcessType("blink::NGPhysicalTextFragment"));
            return DbgObject.NULL;
      });
    }));

    DbgObject.AddArrayField(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "children_", Chromium.RendererProcessType("blink::NGLinkStorage"), UserEditableFunctions.Create((fragment) => {
        return fragment.F("[as container fragment]").then((container) => {
            if (!container.isNull())
                return container.f("buffer_").array(container.f("num_children_"));
            return [];
        });
    }));

    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "type_", "blink::NGPhysicalFragment::NGFragmentType");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "style_variant_", "blink::NGStyleVariant");
    DbgObject.AddTypeOverride(Chromium.RendererProcessType("blink::NGPhysicalFragment"), "line_orientation_", "blink::NGLineOrientation");

    BlinkHelpers = {
        _help : {
            name: "BlinkHelpers",
            description: "Helpers for Blink-specific functionality."
        },

        _help_GetDocuments: {
            description: "Returns (a promise to) a collection of documents for all web frames in the current renderer process."
        },
        GetDocuments: () => {
            return DbgObject.global(Chromium.RendererProcessSyntheticModuleName, "g_frame_map", undefined, "content::(anonymous namespace)")
            .then((frameMap) => Promise.map(frameMap.F("Object").array("Keys"), (webFramePointer) => webFramePointer.deref()))
            .then((webFrames) => {
                // Put the main frame (frame with a null parent) at the front of the array.
                return Promise.sort(webFrames, (webFrame) => {
                    return webFrame.f("parent_")
                    .then((parentFrame) => !parentFrame.isNull());
                });
            })
            .then((sortedWebFrames) => Promise.map(sortedWebFrames, (webFrame) => webFrame.vcast().f("frame_.raw_").f("dom_window_.raw_").F("document")))
            .then((sortedDocuments) => Promise.filter(sortedDocuments, (document) => !document.isNull()))
        },
    };

    Help.Register(BlinkHelpers);
});
