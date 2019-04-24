//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// tree.js
// Peter Salas
//
// A tree drawing library.  It provides one method, TallTree.BuildTree, which takes a DOM element in which to create the tree,
// and a "backing node" which implements two methods:
//  - getChildren -> array of backing nodes
//  - createRepresentation -> dom element that represents the node

var TallTree = undefined;
Loader.OnLoad(function() {
    var enqueueWork = (function() {
        var currentOperation = Promise.resolve(true);
        return function enqueueWork(work) {
            var workPromise = currentOperation.then(work);
            // currentOperation is not allowed to be in a failed state, so trivially handle the error.
            currentOperation = workPromise.then(function() {}, function(error) {})

            // However, the caller might want to see the error, so hand them a promise that might fail.
            return workPromise;
        }
    })();

    function DrawingTreeNode(treeReader, node) {
        this.treeReader = treeReader;
        this.innerNode = node;
        this.children = null;
        this.isExpanded = false;
    }

    function pad(number, digits) {
        var prefix = "";
        var numberString = number.toString();
        var remainder = digits - numberString.length;

        while (remainder > 0) {
            prefix += " ";
            remainder--;
        }

        return prefix + numberString;
    }

    DrawingTreeNode.prototype.render = function(parentNode, notifyRendered) {
        var renderedElement = document.createElement("div");

        // Add the node the parent immediately so that the caller has explicit control over the ordering.
        parentNode.appendChild(renderedElement);

        renderedElement.classList.add("node");
        renderedElement.setAttribute("data-children-count", pad(this.children.length, 3));
        renderedElement.addEventListener("click", this.onclickHandler(renderedElement));
        renderedElement.addEventListener("mousedown", function(e) {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        });

        var that = this;
        return this.treeReader.createRepresentation(this.innerNode)
        .then(function(innerRepresentation) {
            renderedElement.appendChild(innerRepresentation);
            if (innerRepresentation.customStyles) {
                renderedElement.customStyles = innerRepresentation.customStyles;
                renderedElement.customStyles.forEach((className) => {
                    renderedElement.classList.add(className);
                });
            }
            notifyRendered(that);
            return that.renderChildren(renderedElement, renderedElement, notifyRendered);
        });
    }

    DrawingTreeNode.prototype.removeChildrenRepresentations = function(renderedElement) {
        // Remove all the children that are NOT the inner representation, i.e. not the first child.
        var nodeToRemove = renderedElement.firstChild.nextSibling;
        while (nodeToRemove != null) {
            var next = nodeToRemove.nextSibling;
            renderedElement.removeChild(nodeToRemove);
            nodeToRemove = next;
        }

        if (renderedElement.customStyles) {
            renderedElement.customStyles.forEach((className) => {
                renderedElement.classList.remove(className);
            });
        }
    }

    DrawingTreeNode.prototype.onclickHandler = function (renderedElement) {
        var that = this;
        return function (e) {
            if (e.target.tagName == "A") {
                return;
            }

            e.stopPropagation();
            e.preventDefault();

            enqueueWork(function() {
                if (!that.isExpanded) {
                    that.removeChildrenRepresentations(renderedElement);
                    return that.buildAndRenderIntoFragment(renderedElement, function shouldExpand(node) {
                        if (e.ctrlKey) {
                            return true;
                        } else {
                            return node == that;
                        }
                    })
                    .then(function (fragment) {
                        renderedElement.appendChild(fragment);
                    }, function (error) {
                        that.isExpanded = false;
                        var errorMessage = document.createElement("div");
                        errorMessage.className = "popup-message error";
                        errorMessage.textContent = error;
                        renderedElement.appendChild(errorMessage);
                    });
                } else if (e.ctrlKey && renderedElement.firstChild.contains(e.target)) {
                    // Collapse the node.  
                    that.removeChildrenRepresentations(renderedElement);
                    return that.buildAndRenderIntoFragment(renderedElement, function shouldExpand(node) { return false; })
                    .then(function (fragment) {
                        renderedElement.appendChild(fragment);
                    });
                }
            });
        }
    }

    DrawingTreeNode.prototype.renderChildren = function(rendering, parentNode, notify) {
        if (this.isExpanded) {
            var that = this;
            return Promise.throttledMap(this.children, function (child) { return child.render(parentNode, notify); })
            .then(function() {
                rendering.classList.remove("collapsed");
                return parentNode;
            })
        } else {
            rendering.classList.add("collapsed");
            return Promise.resolve(parentNode);
        }
    }

    DrawingTreeNode.prototype.buildAndRenderIntoFragment = function(existingRendering, shouldExpand) {
        var renderedNodes = 0;
        var discoveredNodes = 0;
        var isAborted = false;

        var messageProvider = function() {
            return renderedNodes + "/" + discoveredNodes + " items rendered...";
        }

        var notifyDiscovered = function() {
            if (isAborted) {
                throw new Error("Tree rendering was cancelled.");
            }
            ++discoveredNodes;
        }

        var notifyRendered = function() {
            if (isAborted) {
                throw new Error("Tree rendering was cancelled.");
            }
            ++renderedNodes;
        }

        JsDbgLoadingIndicator.AddMessageProvider(messageProvider, function() { isAborted = true; });

        // We do a two pass algorithm (build, render) so that we discover the amount work sooner and provide meaningful progress.
        var that = this;
        var timer = new Timer("Tree Expansion");
        return this.buildTree(shouldExpand, notifyDiscovered)
        .then(function() {
            timer.Mark("Finished tree construction");
            if (!existingRendering) {
                return that.render(document.createDocumentFragment(), notifyRendered);
            } else {
                notifyRendered(that);
                return that.renderChildren(existingRendering, document.createDocumentFragment(), notifyRendered)
            }
        })
        .finally(function() {
            timer.Mark("Finished rendering into DOM");
            JsDbgLoadingIndicator.RemoveMessageProvider(messageProvider);
        })
    }

    DrawingTreeNode.prototype.buildTree = function(shouldExpand, notifyBuilt) {
        var that = this;
        return Promise.resolve(this.children)
        .then(function (children) {
            if (children == null) {
                // We haven't yet built the children.
                return that.treeReader.getChildren(that.innerNode)
                .then(function (children) {
                    that.children = children.map(function (child) { return new DrawingTreeNode(that.treeReader, child); });
                    return that.children;
                })
            } else {
                return children;
            }
        })
        .then(function (children) {
            var shouldBeExpanded = children.length == 0 || shouldExpand(that);
            notifyBuilt(that);
            if (shouldBeExpanded) {
                return Promise.throttledMap(children, function (child) { return child.buildTree(shouldExpand, notifyBuilt); })
                .then(function() {
                    that.isExpanded = true;
                })
            } else {
                that.isExpanded = false;
            }
        })
    }

    // utility method to repeat string s repeatCount times 
    function repeatString(s, repeatCount) {
        var repeat = "";
        while (repeatCount > 0) {
            repeat += s;
            repeatCount--;
        }

        return repeat;
    }

    // utility method that returns the nearest ancestor of node (inclusive) that the filter matches (or null if there's no match)
    function getNearestAncestorMatchingFilter(node, filter) {
        while (node != null) {
            if (filter(node)) {
                return node;
            } else {
                node = node.parentNode;
            }
        }

        return null;
    }

    // utility method to determine if node intersects range
    function intersectsNode(range, node) {
        var nodeRange = document.createRange();
        nodeRange.selectNode(node);

        if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) === -1 &&
            range.compareBoundaryPoints(Range.START_TO_END, nodeRange) === 1) {
            // start is before end and end is after start so there is an intersection
            return true;
        }

        return false;
    }

    // utility method to recurse a tree and write a text representation of interesting nodes that intersect range
    function getTreeRangeAsTextRecursive(node, depth, range, result) {
        if (!intersectsNode(range, node)) {
            return;
        }

        if (node.classList && node.classList.contains("node")) {
            depth++;
        }

        if (node.previousSibling == null && node.parentNode.classList && node.parentNode.classList.contains("node")) {
            // the nodes we save don't contain other nodes to save so we can return from the recursion here
            result.text += repeatString("\t", depth) + node.textContent + "\r\n";
            result.nodes++;

            return;
        }

        var child = node.firstChild;
        while (child !== null) {
            getTreeRangeAsTextRecursive(child, depth, range, result);
            child = child.nextSibling;
        }
    }

    TallTree = {
        BuildTree: function(container, treeReader, root, expandFully) {
            return enqueueWork(function() {
                var drawingNode = new DrawingTreeNode(treeReader, root);
                return drawingNode.buildAndRenderIntoFragment(null, function (node) { return expandFully; })
                .then(function(fragment) {
                    container.className = "tall-node-container";
                    container.innerHTML = "";
                    container.appendChild(fragment);
                })
            });
        },

        // represent rows instersected by the range as a string
        GetTreeRangeAsText: function(range) {
            // if collapsed in a row we can copy, copy that single row
            if (range.collapsed) {
                var matchNode = getNearestAncestorMatchingFilter(range.startContainer, function(node) {
                    return node.classList && node.classList.contains("node");
                });

                if (matchNode) {
                    return matchNode.textContent;
                }
                
                return null;
            }

            // otherwise we recurse the tree testing nodes for their intersection with range
            var result = { text: "", nodes: 0 };
            getTreeRangeAsTextRecursive(range.commonAncestorContainer, /*depth*/-1, range, result);

            return result.nodes > 1 ? result.text : null;
        }
    };
})