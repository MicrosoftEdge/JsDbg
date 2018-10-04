"use strict";

var DOMTree = undefined;
Loader.OnLoad(function() {
    DOMTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            var voidObject = DbgObject.create(Chromium.ChildProcessType("blink_core", "void"), address);
            if (!voidObject.isNull()) {
                return voidObject.dcast(Chromium.ChildProcessType("blink_core", "blink::ContainerNode"))
                .then((containerNode) => (!containerNode.isNull() ? containerNode.vcast() : voidObject.vcast()));
            } else {
                return DbgObject.NULL;
            }
        },
        GetRoots: function() {
            return Promise.all([DbgObject.global(Chromium.ChildProcessModuleName("content"), "g_frame_map"), DbgObject.global(Chromium.ChildProcessModuleName("content"), "g_frame_map").f("private_buf_")])
            .thenAll((frameMap, frameMapPrivateBuffer) => {
                var typeName = frameMap.type.templateParameters()[0];
                return Promise.map(frameMapPrivateBuffer.as(Chromium.ChildProcessType("content", typeName)).array("Keys"), (webFramePointer) => webFramePointer.deref());
            })
            .then((webFrames) => {
                // Put the main frame (frame with a null parent) at the front of the array.
                return Promise.sort(webFrames, (webFrame) => {
                    return webFrame.f("parent_")
                    .then((parentFrame) => !parentFrame.isNull());
                });
            })
            .then((sortedWebFrames) => Promise.map(sortedWebFrames, (webFrame) => webFrame.vcast().f("frame_.raw_").f("dom_window_.raw_").F("document")))
            .then((sortedDocuments) => Promise.filter(sortedDocuments, (document) => !document.isNull()));
        },
        DefaultTypes: [Chromium.ChildProcessType("blink_core", "blink::ContainerNode")]
    };

    DOMTree.Tree.addChildren(Chromium.ChildProcessType("blink_core", "blink::ContainerNode"), (containerNode) => {
        return containerNode.array("Child Nodes");
    });

    DOMTree.Tree.addChildren(Chromium.ChildProcessType("blink_core", "blink::Element"), (element) => {
        return element.F("shadowRoot")
        .then((shadowRoot) => {
            if (!shadowRoot.isNull()) {
                return Promise.all([
                    {
                        customStyles : () => {
                            return ["alt-child-container"];
                        },
                        toString : () => {
                            return "<span style='color:grey'>" + "Shadow Tree" + "</span>";
                        },
                        getChildren : () => {
                            return [shadowRoot];
                        }
                    }
                ]);
            } else {
                return [];
            }
        });
    });

    DOMTree.Tree.addChildren(Chromium.ChildProcessType("blink_core", "blink::HTMLFrameOwnerElement"), (frameOwnerElement) => {
        return frameOwnerElement.F("contentDocument")
        .then ((document) => {
            if (!document.isNull()) {
                return Promise.all([
                    {
                        customStyles : () => {
                            return ["alt-child-container"];
                        },
                        toString : () => {
                            return "<span style='color:grey'>" + "Content Document" + "</span>";
                        },
                        getChildren : () => {
                            return [document];
                        }
                    }
                ]);
            } else {
                return [];
            }
        });
    });

    DOMTree.Tree.addChildren(Chromium.ChildProcessType("blink_core", "blink::HTMLTemplateElement"), (templateElement) => {
        return templateElement.F("content")
        .then ((templateContentDocumentFragment) => {
            if (!templateContentDocumentFragment.isNull()) {
                return Promise.all([
                    {
                        customStyles : () => {
                            return ["alt-child-container"];
                        },
                        toString : () => {
                            return "<span style='color:grey'>" + "Content Fragment" + "</span>";
                        },
                        getChildren : () => {
                            return [templateContentDocumentFragment];
                        }
                    }
                ]);
            } else {
                return [];
            }
        });
    });

    DbgObject.AddAction(Chromium.ChildProcessType("blink_core", "blink::Node"), "DOMTree", (node) => {
        return TreeInspector.GetActions("domtree", "DOMTree", node);
    });
});