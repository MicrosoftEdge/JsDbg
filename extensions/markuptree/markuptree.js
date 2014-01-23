"use strict";

var MarkupTree = (function() {
    function createMarkupTree(pointer) {
        if (pointer) {
            return new CTreeNode(new DbgObject("mshtml", "CTreeNode", pointer));
        } else {
            return null;
        }
    }

    function getRootCTreeNodes() {
        return MSHTML.GetRootCTreeNodes()
            .then(function(promisedRoots) {
                if (promisedRoots.length == 0) {
                    return Promise.fail();
                }
                // Sort the roots to favor the ones that have layout.
                return Promise.sort(Promise.join(promisedRoots), function(root) { return root.f("_fHasLayoutAssociationPtr").val(); }, function(a, b) { return b - a; });
            })
            .then(
                function(sortedValues) { return sortedValues.map(function(root) { return root.ptr(); }); },
                function() {
                    return Promise.fail("No root CTreeNodes were found. Possible reasons:<ul><li>The debuggee is not IE 11.</li><li>No page is loaded.</li><li>The debugger is in 64-bit mode on a WoW64 process (\".effmach x86\" will fix).</li><li>Symbols aren't available.</li></ul>Refresh the page to try again, or specify a CTreeNode explicitly.");
                }
            );
    }

    function CTreeNode(treeNode) {
        this.treeNode = treeNode;
        this.childrenPromise = null;
    }

    CTreeNode.prototype.getChildren = function() {
        if (this.childrenPromise == null)
        {    
            var lastTreePos = this.treeNode.f("_tpEnd");
            var children = [];

            var collectRemainingChildren = function(firstTreePosToConsider) {
                return Promise
                    // In order to compare the first tree pos and the last tree pos, get the pointers...
                    .join([firstTreePosToConsider.pointerValue(), lastTreePos.pointerValue()])
                    .then(function (pointers) {
                        if (pointers[0] != pointers[1]) {
                            // We haven't reached the end.  Check the flags to see if its a node begin and keep going...
                            return firstTreePosToConsider.f("_cElemLeftAndFlags").val()

                            // If this TreePos is a node begin, note it and skip its children.
                            .then(function (treePosFlags) {
                                if (treePosFlags & 0x01) {
                                    // We are at a node begin.  Note the child and skip to the end of it.
                                    var childTreeNode = firstTreePosToConsider.unembed("CTreeNode", "_tpBegin");
                                    children.push(childTreeNode);
                                    firstTreePosToConsider = childTreeNode.f("_tpEnd");
                                } else if (treePosFlags & 0x4) {
                                    // We are at a text node.
                                    children.push(firstTreePosToConsider.as("CTreeDataPos"));
                                }
                            })

                            // Advance to the next one...
                            .then(function() { return firstTreePosToConsider.f("_ptpThreadRight"); })
                            
                            // And collect the remaining children.
                            .then(collectRemainingChildren);
                        }
                    });
            }

            var that = this;

            // Collect all the children as promised DbgObjects...
            this.childrenPromise = collectRemainingChildren(that.treeNode.f("_tpBegin").f("_ptpThreadRight"))

            // And map them to our JS CTreeNode representation...
            .then(function() {
                return Promise.map(Promise.join(children), function (node) {
                    if (node.typeDescription() == "CTreeNode") {
                        return new CTreeNode(node); 
                    } else {
                        return new TextNode(node);
                    }
                })
            })
        }

        return this.childrenPromise;
    }

    CTreeNode.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        var that = this;
        
        // Get the tag...
        return this.treeNode.f("_etag").as("ELEMENT_TAG").constant()

        // And create the representation with fields.
        .then(function(constant) {
            var tag = constant.substr("ETAG_".length);
            element.innerHTML = "<p>&lt;" + tag + "&gt;</p> <p>" + that.treeNode.ptr() + "</p> ";
            return FieldSupport.RenderFields(that, that.treeNode, element);
        })
    }

    function TextNode(treeDataPos) {
        this.treeDataPos = treeDataPos;
    }

    TextNode.prototype.getChildren = function() {
        return Promise.as([]);
    }

    TextNode.prototype.createRepresentation = function() {
        var element = document.createElement("div");

        element.innerHTML = "<p>Text</p> <p>" + this.treeDataPos.ptr() + "</p> ";
        return Promise.as(FieldSupport.RenderFields(this, this.treeDataPos, element));
    }

    var builtInFields = [
        {
            type: "CTreeNode",
            fullname: "_iFF",
            shortname: "_iFF",
            async:true,
            html: function() {                
                var that = this;
                return Promise
                    .join([this.f("_iFF").val(), this.f("_fIFFValid").val()])
                    .then(function (valueAndValidity) {
                        return valueAndValidity[0] + (!valueAndValidity[1] ? " _fIFFValid:0" : "");
                    })
            }
        },
        {
            type: "CTreeNode",
            fullname: "_iCF",
            shortname: "_iCF",
            async:true,
            html: function() {
                var that = this;
                return Promise
                    .join([this.f("_iCF").val(), this.f("_fIPCFValid").val()])
                    .then(function (valueAndValidity) {
                        return valueAndValidity[0] + (!valueAndValidity[1] ? " _fIPCFValid:0" : "");
                    })
            }
        },
        {
            type: "CTreeNode",
            fullname: "_iPF",
            shortname: "_iPF",
            async:true,
            html: function() {
                var that = this;
                return Promise
                    .join([this.f("_iPF").val(), this.f("_fIPCFValid").val()])
                    .then(function (valueAndValidity) {
                        return valueAndValidity[0] + (!valueAndValidity[1] ? " _fIPCFValid:0" : "");
                    })
            }
        },
        {
            type: "CTreeNode",
            fullname: "_iSF",
            shortname: "_iSF",
            async:true,
            html: function() {
                var that = this;
                return Promise
                    .join([this.f("_iSF").val(), this.f("_fISFValid").val()])
                    .then(function (valueAndValidity) {
                        return valueAndValidity[0] + (!valueAndValidity[1] ? " _fISFValid:0" : "");
                    })
            }
        },
        {
            type: "Text",
            fullname: "TextBlock",
            shortname: "tb",
            async:true,
            html: function() {
                return this.f("_pTextBlock").ptr()
                .then(function (ptr) {
                    if (ptr != "NULL") {
                        return "<a href=\"/textblock/#" + ptr + "\">" + ptr + "</a>";
                    }
                })
            }
        }
    ];

    return {
        Name: "MarkupTree",
        BasicType: "CTreeNode",
        BuiltInFields: builtInFields,
        TypeMap: { "CTreeNode": CTreeNode, "Text":TextNode },
        Create: createMarkupTree,
        Roots: getRootCTreeNodes
    }
})();