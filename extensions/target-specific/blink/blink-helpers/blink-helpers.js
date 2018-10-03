"use strict";

Loader.OnLoad(function() {
    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::CharacterData"), "data", false, (characterDataNode) => {
        return characterDataNode.f("data_").desc("Text");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::CharacterData"), "length", false, (characterDataNode) => {
        return characterDataNode.f("data_").desc("TextLength");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::Element"), "id", false, (element) => {
        return element.f("element_data_.raw_")
        .then((elementData) => (!elementData.isNull() ? elementData.f("id_for_style_resolution_").desc("Text") : ""));
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "blink::Document"), "URL", false, (document) => {
        return document.f("base_url_").f("string_").desc("Text");
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Node"), "ownerDocument", Blink.ChildProcessType("blink_core", "blink::Document"), (node) => {
        return node.f("tree_scope_.raw_").f("document_.raw_")
        .then((document) => (!node.equals(document) ? document : DbgObject.NULL));
    });

    DbgObject.AddArrayField(Chromium.ChildProcessType("blink_core", "blink::ContainerNode"), "Child Nodes", Blink.ChildProcessType("blink_core", "blink::Node"), (containerNode) => {
        return containerNode.f("first_child_.raw_")
        .list((containerNode) => containerNode.f("next_.raw_"))
        .map((child) => child.vcast());
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::Element"), "shadowRoot", Chromium.ChildProcessType("blink_core", "blink::ShadowRoot"), (element) => {
        return Promise.all([element.f("node_flags_").val(), DbgObject.constantValue(Chromium.ChildProcessType("blink_core", "blink::Node::NodeFlags"), "kHasRareDataFlag")])
        .thenAll((nodeFlags, hasRareDataFlag) => {
            var elementHasRareData = nodeFlags & hasRareDataFlag;
            if (elementHasRareData) {
                return element.f("data_").f("rare_data_")
                .then((rareDataBase) => {
                    return rareDataBase.as(Chromium.ChildProcessType("blink_core", "blink::NodeRareData")).f("is_element_rare_data_").val()
                    .then((isElementRareData) => {
                        if (isElementRareData) {
                            return rareDataBase.as(Chromium.ChildProcessType("blink_core", "blink::ElementRareData")).f("shadow_root_.raw_").vcast();
                        } else {
                            return DbgObject.NULL;
                        }
                    });
                });
            } else {
                return DbgObject.NULL;
            }
        });
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
        return domWindow.dcast(Chromium.ChildProcessType("blink_core", "blink::LocalDOMWindow"))
    });

    DbgObject.AddExtendedField(Chromium.ChildProcessType("blink_core", "blink::HTMLTemplateElement"), "content", Chromium.ChildProcessType("blink_core", "blink::TemplateContentDocumentFragment"), (templateElement) => {
        return templateElement.f("content_.raw_");
    });
});