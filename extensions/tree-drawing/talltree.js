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

    DrawingTreeNode.prototype.buildTree = function(shouldExpand) {
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
            that.isExpanded = shouldExpand(that) || children.length == 0;
            if (that.isExpanded) {
                return Promise.throttledMap(children, function (child) { return child.buildTree(shouldExpand); });
            }
        });
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

    DrawingTreeNode.prototype.render = function(parentNode, notify) {
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
            notify(that);
            return that.renderChildren(renderedElement, renderedElement, notify);
        });
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
                    var timer = Timer.Start();
                    return that.buildTree(function shouldExpand(node) {
                        if (e.ctrlKey) {
                            return true;
                        } else {
                            return node == that;
                        }
                    })
                    .then(function () {
                        timer.Mark("Finished Subtree Construction");
                        timer = Timer.Start();
                        // Render the children into a document fragment so that the appearance in the DOM is atomic.
                        return that.renderChildren(renderedElement, document.createDocumentFragment(), function() {})
                        .then(function(documentFragment) {
                            renderedElement.appendChild(documentFragment);
                            timer.Mark("Finished DOM Rendering");
                        })
                    })
                } else if (e.ctrlKey) {
                    // Collapse the node.  Remove all the children that are NOT the inner representation, i.e. not the first child.
                    var nodeToRemove = renderedElement.firstChild.nextSibling;
                    while (nodeToRemove != null) {
                        var next = nodeToRemove.nextSibling;
                        renderedElement.removeChild(nodeToRemove);                        
                        nodeToRemove = next;
                    }

                    return that.buildTree(function shouldExpand(node) { return false; })
                    .then(function () {
                        return that.renderChildren(renderedElement, renderedElement, function() {});
                    })
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

                container.innerHTML = "";
                var renderedNodes = document.createTextNode("0");
                container.appendChild(renderedNodes);
                container.appendChild(document.createTextNode("/"));
                var discoveredNodes = document.createTextNode("0");
                container.appendChild(discoveredNodes);
                container.appendChild(document.createTextNode(" nodes rendered..."));

                var timer = new Timer();
                return drawingNode.buildTree(function (node) {
                    discoveredNodes.nodeValue = parseInt(discoveredNodes.nodeValue) + 1;
                    return expandFully;
                })
                .then(function() {
                    timer.Mark("Finished Tree Construction");
                    return drawingNode.render(document.createDocumentFragment(), function() {
                        renderedNodes.nodeValue = parseInt(renderedNodes.nodeValue) + 1;
                    });
                })
                .then(function(rendering) {
                    container.innerHTML = "";
                    container.className = "tall-node-container";
                    container.appendChild(rendering);
                    timer.Mark("Finished DOM Rendering");
                });
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