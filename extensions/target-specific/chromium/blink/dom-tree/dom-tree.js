"use strict";

var DOMTree = undefined;
Loader.OnLoad(function() {
    DOMTree = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            var voidObject = DbgObject.create(Chromium.RendererProcessType("void"), address);
            if (!voidObject.isNull()) {
                return voidObject.dcast(Chromium.RendererProcessType("blink::ContainerNode"))
                .then((containerNode) => (!containerNode.isNull() ? containerNode.vcast() : voidObject.vcast()));
            } else {
                return DbgObject.NULL;
            }
        },
        GetRoots: function() {
            return DbgObject.global(Chromium.RendererProcessSyntheticModuleName, "g_frame_map")
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
            .then((documents) => {
                if (documents.length == 0) {
                    var errorMessage = ErrorMessages.CreateErrorsList("No documents found.") +
                        ErrorMessages.CreateErrorReasonsList(ErrorMessages.WrongDebuggee("the Chromium renderer process"),
                            "The debuggee has been broken into prior to <i>g_frame_map</i> being populated.",
                            ErrorMessages.SymbolsUnavailable) +
                        "You may still specify a blink::Node explicitly.";
                    return Promise.reject(errorMessage);
                } else {
                    return documents;
                }
            }, (error) => {
                var errorMessage = ErrorMessages.CreateErrorsList(error) +
                    ErrorMessages.CreateErrorReasonsList(ErrorMessages.WrongDebuggee("the Chromium renderer process"), ErrorMessages.SymbolsUnavailable);
                return Promise.reject(errorMessage);
            });
        },
        DefaultTypes: [Chromium.RendererProcessType("blink::ContainerNode")]
    };

    DOMTree.Tree.addChildren(Chromium.RendererProcessType("blink::ContainerNode"), (containerNode) => {
        return containerNode.array("child_nodes_");
    });

    DOMTree.Tree.addChildren(Chromium.RendererProcessType("blink::Element"), (element) => {
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

    DOMTree.Tree.addChildren(Chromium.RendererProcessType("blink::HTMLFrameOwnerElement"), (frameOwnerElement) => {
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

    DOMTree.Tree.addChildren(Chromium.RendererProcessType("blink::HTMLTemplateElement"), (templateElement) => {
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

    DbgObject.AddAction(Chromium.RendererProcessType("blink::Node"), "DOMTree", (node) => {
        return TreeInspector.GetActions("domtree", "DOMTree", node);
    });
});