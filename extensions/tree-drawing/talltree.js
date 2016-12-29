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

    function DrawingTreeNode(treeManager, node, parent) {
        this.treeManager = treeManager;
        this.innerNode = node;
        this.parent = parent;
        this.children = [];
        this.representation = null;
        this.childContainer = null;
    }

    DrawingTreeNode._instantiate = function(treeManager, node, parent) {
        var drawingNode = new DrawingTreeNode(treeManager, node, parent);
        return drawingNode._realize()
            .then(function() { return drawingNode; });

    }

    DrawingTreeNode.prototype._realize = function() {
        var that = this;
        return that.treeManager.getChildren(that.innerNode)
            .then(function gotChildren(children) {
                that.nodeChildren = children;
                that.isExpanded = that.nodeChildren.length == 0;

                return that._createRepresentation();
            })
            .then(function representationCreated() {
                if (that.innerNode.drawingTreeNodeIsExpanded) {
                    return that._expand(false);
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

    DrawingTreeNode.prototype._createRepresentation = function() {
        var that = this;
        return this.treeManager.createRepresentation(this.innerNode)
        .then(function(innerRepresentation) {
            that.representation = document.createElement("div");
            that.representation.appendChild(innerRepresentation);
            that.representation.setAttribute("data-children-count", pad(that.nodeChildren.length, 3));

            that.representation.addEventListener("click", function(e) {
                if (e.target.tagName == "A") {
                    return;
                }

                e.stopPropagation();
                e.preventDefault();

                enqueueWork(function() {
                    if (!that.isExpanded) {
                        var clock = Timer.Start();
                        return that._expand(e.ctrlKey)
                        .then(function expanded() {
                            console.log("Expansion took " + clock.Elapsed() + "s");
                            that._redraw();
                            console.log("Full Redraw took " + clock.Elapsed() + "s");
                        });
                    } else if (e.ctrlKey) {
                        that._collapse(false);
                        that._redraw();
                    }
                });
            });

            that.representation.addEventListener("mousedown", function(e) {
                if (e.ctrlKey) {
                    e.preventDefault();
                }
            });
        });
    }

    DrawingTreeNode.prototype._getChildContainer = function() {
        if (this.childContainer == null && this.nodeChildren.length > 0) {
            this.childContainer = document.createElement("div");
            this.childContainer.className = "child-container";
        }
        return this.childContainer;
    }

    DrawingTreeNode.prototype._expand = function(recurse) {
        var that = this;

        // Construct the children.
        this.children = this.nodeChildren.map(function(x) {
            return new DrawingTreeNode(that.treeManager, x, that);
        })

        // Realize them and expand them as needed...
        return Promise.map(this.children, function(child) { 
                return child._realize()
                .then(function() {
                    if (recurse) {
                        return child._expand(true);
                    }
                })
            })
            // And mark ourself as expanded.
            .then(function() {
                that.isExpanded = true;
                that.innerNode.drawingTreeNodeIsExpanded = true;
            })
    }

    DrawingTreeNode.prototype._collapse = function(removeSelf) {
        function remove(e) {
            if (e && e.parentNode) {
                e.parentNode.removeChild(e);
            }
        }
        if (removeSelf) {
            remove(this.representation);
            remove(this.childContainer);
        }

        this.children.map(function(x) { x._collapse(true); });
        this.children = [];
        this.isExpanded = this.nodeChildren.length == 0;
        this.innerNode.drawingTreeNodeIsExpanded = this.isExpanded;
    }

    DrawingTreeNode.prototype._redraw = function() {
        this._draw(this.lastContainer);
    }

    DrawingTreeNode.prototype._draw = function(container) {
        this.lastContainer = container;

        // create the element for the node itself.
        var element = this.representation;
        element.classList.add("node");
        if (!this.isExpanded) {
            element.classList.add("collapsed");
        } else {
            element.classList.remove("collapsed");
        }
        
        if (element.parentNode != container) {
            container.appendChild(element);
        }

        var children = this.children;
        if (children.length > 0) {
            // recurse into each of the children
            for (var i = 0; i < children.length; ++i) {
                children[i]._draw(element);
            }
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
        BuildTree: function(container, treeManager, root, expandFully) {
            return enqueueWork(function() {
                return DrawingTreeNode._instantiate(treeManager, root)
                .then(function(drawingRoot) {
                    if (expandFully && !drawingRoot.isExpanded) {
                        return drawingRoot._expand(true)
                        .then(function() {
                            return drawingRoot;
                        })
                    } else {
                        return drawingRoot;
                    }
                })
                .then(function(drawingRoot) {
                    container.innerHTML = "";
                    container.className = "tall-node-container";
                    drawingRoot._draw(container);
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