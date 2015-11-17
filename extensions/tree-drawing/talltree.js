"use strict";

// tree.js
// Peter Salas
//
// A tree drawing library.  It provides one method, TallTree.BuildTree, which takes a DOM element in which to create the tree,
// and a "backing node" which implements two methods:
//  - getChildren -> array of backing nodes
//  - createRepresentation -> dom element that represents the node
//
// TallTree.BuildTree returns an object with a single method
//  - updateRepresentation
// which can be used to notify the tree that node representations returned by createRepresentation may have changed.

var TallTree = (function() {

    var enqueueWork = (function() {
        var currentOperation = Promise.as(true);
        return function enqueueWork(work) {
            var workPromise = currentOperation.then(work);
            // currentOperation is not allowed to be in a failed state, so trivially handle the error.
            currentOperation = workPromise.then(function() {}, function(error) {})

            // However, the caller might want to see the error, so hand them a promise that might fail.
            return workPromise;
        }
    })(); 

    function DrawingTreeNode(node, parent) {
        this.innerNode = node;
        this.parent = parent;
        this.children = [];
        this.representation = null;
        this.childContainer = null;
    }

    DrawingTreeNode._instantiate = function(node, parent) {
        var drawingNode = new DrawingTreeNode(node, parent);
        return drawingNode._realize()
            .then(function() { return drawingNode; });

    }

    DrawingTreeNode.prototype._realize = function() {
        var that = this;
        return that.innerNode.getChildren()
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
            prefix += "&nbsp;";
            remainder--;
        }

        return prefix + numberString;
    }

    DrawingTreeNode.prototype._createRepresentation = function() {
        var that = this;
        return this.innerNode.createRepresentation()
            .then(function(innerRepresentation) {
                that.representation = innerRepresentation;

                var childrenCount = document.createElement("div");
                childrenCount.className = "children";
                childrenCount.innerHTML = pad(that.nodeChildren.length, 2);
                if (that.representation.firstChild != null) {
                    that.representation.insertBefore(document.createTextNode(" "), that.representation.firstChild);
                    that.representation.insertBefore(childrenCount, that.representation.firstChild);
                } else {
                    that.representation.appendChild(childrenCount);
                }

                that.representation.addEventListener("click", function(e) {
                    if (e.target.tagName == "A") {
                        return;
                    }
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

    DrawingTreeNode.prototype.updateRepresentation = function() {
        var that = this;
        return enqueueWork(function() {
            var clock = Timer.Start();
            return that._updateRepresentation()
            .then(function(value) {
                console.log("Tree update took " + clock.Elapsed() + "s");
                return value;
            });
        });
    }

    DrawingTreeNode.prototype._updateRepresentation = function() {
        var that = this;
        if (this.representation != null && this.representation.parentNode) {
            var parent = this.representation.parentNode;
            var styles = [
                this.representation.className
            ];

            var oldChild = this.representation;

            this.representation = null;

            return this._createRepresentation()
            .then(function recreatedRepresentation() {
                parent.insertBefore(that.representation, oldChild);
                parent.removeChild(oldChild);
                that.representation.className = styles[0];

                // Update the children as well.
                return Promise.map(that.children, function(child) { return child._updateRepresentation(); })
                    // Undefine the result.
                    .then(function() {});
            });
        } else {
            // Update the children.
            return Promise.map(that.children, function(child) { return child._updateRepresentation(); });
        }
    }

    DrawingTreeNode.prototype._expand = function(recurse) {
        var that = this;

        // Construct the children.
        this.children = this.nodeChildren.map(function(x) {
            return new DrawingTreeNode(x, that);
        })

        // Realize them and expand them as needed...
        return Promise
            .join(this.children.map(function(child) { 
                return child._realize()
                    .then(function() {
                        if (recurse) {
                            return child._expand(true);
                        }
                    })
            }))
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
        element.className = "node" + (this.isExpanded ? "" : " collapsed");
        if (element.parentNode != container) {
            container.appendChild(element);
        }

        var children = this.children;
        var childContainer = this._getChildContainer();
        if (children.length > 0) {
            // recurse into each of the children
            for (var i = 0; i < children.length; ++i) {
                children[i]._draw(childContainer);
            }
        }

        if (childContainer != null && childContainer.parentNode != container) {
            container.appendChild(childContainer);
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

    // empty function to simplify callback management
    function emptyCallback() {}

    // utility method to get the next preorder node with an optional callback for whenever it exits the scope of a node previously returned by this function
    function getNextPreorderNode(root, current, onExitNode) {
        // simplify callback code by ensuring we always have a callback function
        if (typeof(onExitNode) !== typeof(Function)) {
            onExitNode = emptyCallback;
        }

        // null means this is the first call, begin by visiting root
        if (current === null) {
            return root;
        }

        if (current.firstChild !== null) {
            return current.firstChild;
        }

        // empty root case
        if (current === root) {
            // exit the root
            onExitNode(root);
            return null;
        }

        if (current.nextSibling !== null) {
            // exit current
            onExitNode(current);
            return current.nextSibling;
        }

        while (current.nextSibling === null) {
            // exit current
            onExitNode(current);
            
            current = current.parentNode;

            // ran out of nodes
            if (current === root) {
                // exit the root
                onExitNode(root);
                return null;
            }
        }

        // exit current
        onExitNode(current);
        return current.nextSibling;
    }

    // utility method to get the next preorder element node with an optional callback for whenever it exits the scope of a node previously returned by this function
    function getNextPreorderElementNode(root, current, onExitElementNode) {
        var onExitNode = null;
        if (typeof(onExitElementNode) === typeof(Function)) {
            onExitNode = function(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    onExitElementNode(node);
                }
            };
        }

        do {
            current = getNextPreorderNode(root, current, onExitNode);
        } while (current !== null && current.nodeType !== Node.ELEMENT_NODE);

        return current;
    }

    // utility method to get the node which occurs after the gap in the tree indicated using the DOM Range {container, offset} convention
    function getNodeAfterBoundaryPoint(container, offset) {
        if (container.firstChild === null) {
            // containers which don't or can't have children are the 'after' node
            return container;
        }

        var node = container.firstChild;
        while (offset > 0) {
            offset--;

            // boundary point at end of container means the container is the 'after' node
            if (node.nextSibling == null) {
                return node.parentNode;
            }

            node = node.nextSibling;
        }

        return node;
    }

    // utility method to get the element node which occurs after the gap in the tree indicated using the DOM Range {container, offset} convention
    function getElementNodeAfterBoundaryPoint(container, offset) {
        var node = getNodeAfterBoundaryPoint(container, offset);
        if (node.nodeType !== node.ELEMENT_NODE) {
            var root = node;
            while (root.parentNode !== null) {
                root = root.parentNode;
            }

            var firstExitNode = null;
            var nextPreorderElement = getNextPreorderElementNode(root, node, function(exitNode) {
                if (firstExitNode === null) {
                    firstExitNode = exitNode;
                }
            });
            node = firstExitNode !== null ? firstExitNode : nextPreorderElement;
        }

        return node;
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

    return {
        BuildTree: function(container, root, expandFully) {
            return enqueueWork(function() {
                return DrawingTreeNode._instantiate(root)
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
                    return drawingRoot;
                });
            });
        },

        GetTreeRangeAsText: function(range) {
            var current = getElementNodeAfterBoundaryPoint(range.startContainer);
            var end = getElementNodeAfterBoundaryPoint(range.endContainer);

            if (!current || !end) {
                // strange case with no elements after the boundary point
                return null;
            }

            var matchNode = getNearestAncestorMatchingFilter(current, function(node) {
                return node.className === "node";
            });

            if (matchNode != null) {
                // started inside a node element, update current to this better starting node so we write it out as text too
                current = matchNode;
            }

            // a node to root our search for selected nodes in the tree
            var limitNode = range.commonAncestorContainer;

            // determine the depth of the current node
            var depth = 0;
            var parent = range.startContainer;
            while (parent !== null && parent !== limitNode) {
                if (parent.className === "child-container") {
                    depth++;
                }
                parent = parent.parentNode;
            }

            // visit all nodes from current until end to build text
            var treeAsText = "";
            do {
                if (current.className === "node") {
                    // write a representation of this tree node
                    treeAsText += repeatString("\t", depth) + current.textContent + "\r\n";
                } else if (current.className === "child-container") {
                    // increase depth when a new child-container is returned
                    depth++;
                }

                current = getNextPreorderElementNode(/*root*/limitNode, current, function(node) {
                    if (node.className === "child-container") {
                        // when exiting a child-container scope decrease depth
                        depth--;
                    }
                });
            } while (current != null && current != end);

            return treeAsText;
        }
    };



})();