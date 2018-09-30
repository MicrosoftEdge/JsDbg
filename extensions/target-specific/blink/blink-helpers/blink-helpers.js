"use strict";

Loader.OnLoad(function() {
    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "blink::CharacterData"), "data", false, (characterDataNode) => {
        return characterDataNode.f("data_").desc("Text");
    });

    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "blink::CharacterData"), "length", false, (characterDataNode) => {
        return characterDataNode.f("data_").desc("TextLength");
    });

    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "blink::Element"), "id", false, (element) => {
        return element.f("element_data_.raw_").then((elementData) => !elementData.isNull() ? elementData.f("id_for_style_resolution_").desc("Text") : "");
    });

    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "blink::Document"), "URL", false, (document) => {
        return document.f("base_url_").f("string_").desc("Text");
    });

    DbgObject.AddArrayField(Blink.ChildProcessType("blink_core", "blink::ContainerNode"), "Child Nodes", Blink.ChildProcessType("blink_core", "blink::Node"), (containerNode) => {
        return containerNode.f("first_child_.raw_")
        .list((containerNode) => {
            return containerNode.f("next_.raw_")
        })
        .map((child) => {
            return child.vcast();
        });
    });

    DbgObject.AddExtendedField(Blink.ChildProcessType("blink_core", "blink::Element"), "shadowRoot", Blink.ChildProcessType("blink_core", "blink::ShadowRoot"), (element) => {
        return Promise.all([element.f("node_flags_").val(), DbgObject.constantValue(Blink.ChildProcessType("blink_core", "blink::Node::NodeFlags"), "kHasRareDataFlag")])
        .thenAll((nodeFlags, hasRareDataFlag) => {
            var elementHasRareData = nodeFlags & hasRareDataFlag;
            if (elementHasRareData) {
                return element.f("data_").f("rare_data_")
                .then((rareDataBase) => {
                    return rareDataBase.as(Blink.ChildProcessType("blink_core", "blink::NodeRareData")).f("is_element_rare_data_").val()
                    .then((isElementRareData) => {
                        if (isElementRareData) {
                            return rareDataBase.as(Blink.ChildProcessType("blink_core", "blink::ElementRareData")).f("shadow_root_.raw_").vcast();
                        } else {
                            return DbgObject.NULL;
                        }
                    });
                });
            } else {
                return DbgObject.NULL;
            }
        })
    });

    DbgObject.AddExtendedField(Blink.ChildProcessType("blink_core", "blink::HTMLFrameOwnerElement"), "contentWindow", Blink.ChildProcessType("blink_core", "blink::DOMWindow"), (frameOwnerElement) => {
        return frameOwnerElement.f("content_frame_.raw_").then((contentFrame) => (!contentFrame.isNull() ? contentFrame.f("dom_window_.raw_") : DbgObject.NULL));
    });

    DbgObject.AddExtendedField(Blink.ChildProcessType("blink_core", "blink::HTMLFrameOwnerElement"), "contentDocument", Blink.ChildProcessType("blink_core", "blink::Document"), (frameOwnerElement) => {
        return frameOwnerElement.F("contentWindow").F("document");
    });

    DbgObject.AddExtendedField(Blink.ChildProcessType("blink_core", "blink::DOMWindow"), "document", Blink.ChildProcessType("blink_core", "blink::Document"), (domWindow) => {
        return domWindow.dcast(Blink.ChildProcessType("blink_core", "blink::LocalDOMWindow"))
        .then((localDomWindow) => {
            return !localDomWindow.isNull() ? localDomWindow.f("document_.raw_") : DbgObject.NULL;
        });
    });

    DbgObject.AddExtendedField(Blink.ChildProcessType("blink_core", "blink::HTMLTemplateElement"), "content", Blink.ChildProcessType("blink_core", "blink::TemplateContentDocumentFragment"), (templateElement) => {
        return templateElement.f("content_.raw_");
    });
});