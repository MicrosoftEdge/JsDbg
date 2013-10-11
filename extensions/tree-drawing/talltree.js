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

    function DrawingTreeNode(node, parent) {
        this.innerNode = node;
        this.parent = parent;
        this.children = [];
        this.representation = null;
        this.childContainer = null;
    }

    DrawingTreeNode.instantiate = function(node, parent) {
        var drawingNode = new DrawingTreeNode(node, parent);
        return drawingNode.realize()
            .then(function() { return drawingNode; });

    }

    DrawingTreeNode.prototype.realize = function() {
        var that = this;
        return that.innerNode.getChildren()
            .then(function gotChildren(children) {
                that.nodeChildren = children;
                that.isExpanded = that.nodeChildren.length == 0;

                return that.createRepresentation();
            })
            .then(function representationCreated() {
                if (that.innerNode.drawingTreeNodeIsExpanded) {
                    return that.expand(false);
                }
            });
    }

    DrawingTreeNode.prototype.createRepresentation = function() {
        var that = this;
        return this.innerNode.createRepresentation()
            .then(function(innerRepresentation) {
                that.representation = innerRepresentation;

                var childrenCount = document.createElement("div");
                childrenCount.className = "children";
                childrenCount.innerHTML = that.nodeChildren.length;
                if (that.representation.firstChild != null) {
                    that.representation.insertBefore(document.createTextNode(" "), that.representation.firstChild);
                    that.representation.insertBefore(childrenCount, that.representation.firstChild);
                } else {
                    that.representation.appendChild(childrenCount);
                }

                that.representation.addEventListener("click", function(e) {
                    if (!that.isExpanded) {
                        var clock = Timer.Start();
                        that.expand(e.ctrlKey)
                            .then(function expanded() {
                                console.log("Expansion took " + clock.Elapsed() + "s");
                                that.redraw();
                                console.log("Full Redraw took " + clock.Elapsed() + "s");
                            });
                    } else if (e.ctrlKey) {
                        that.collapse(false);
                        that.redraw();
                    }
                });

                that.representation.addEventListener("mousedown", function(e) {
                    if (e.ctrlKey) {
                        e.preventDefault();
                    }
                });
            });
    }

    DrawingTreeNode.prototype.getChildContainer = function() {
        if (this.childContainer == null && this.nodeChildren.length > 0) {
            this.childContainer = document.createElement("div");
            this.childContainer.className = "child-container";
        }
        return this.childContainer;
    }

    DrawingTreeNode.prototype.updateRepresentation = function() {
        if (this.representation != null && this.representation.parentNode) {
            var parent = this.representation.parentNode;
            var styles = [
                this.representation.className
            ];

            var oldChild = this.representation;

            this.representation = null;

            var that = this;
            return this.createRepresentation()
                .then(function recreatedRepresentation() {
                    parent.insertBefore(that.representation, oldChild);
                    parent.removeChild(oldChild);
                    that.representation.className = styles[0];

                    // Update the children as well.
                    return Promise.map(that.children, function(child) { return child.updateRepresentation(); })
                        // Undefine the result.
                        .then(function() {});
                });
        } else {
            // Update the children.
            return Promise.map(that.children, function(child) { return child.updateRepresentation(); });
        }
    }

    DrawingTreeNode.prototype.expand = function(recurse) {
        var that = this;

        // Construct the children.
        this.children = this.nodeChildren.map(function(x) {
            return new DrawingTreeNode(x, that);
        })

        // Realize them and expand them as needed...
        return Promise
            .join(this.children.map(function(child) { 
                return child.realize()
                    .then(function() {
                        if (recurse) {
                            return child.expand(true);
                        }
                    })
            }))
            // And mark ourself as expanded.
            .then(function() {
                that.isExpanded = true;
                that.innerNode.drawingTreeNodeIsExpanded = true;
            })
    }

    DrawingTreeNode.prototype.collapse = function(removeSelf) {
        function remove(e) {
            if (e && e.parentNode) {
                e.parentNode.removeChild(e);
            }
        }
        if (removeSelf) {
            remove(this.representation);
            remove(this.childContainer);
        }

        this.children.map(function(x) { x.collapse(true); });
        this.children = [];
        this.isExpanded = this.nodeChildren.length == 0;
        this.innerNode.drawingTreeNodeIsExpanded = this.isExpanded;
    }

    DrawingTreeNode.prototype.redraw = function() {
        this.draw(this.lastContainer);
    }

    DrawingTreeNode.prototype.draw = function(container) {
        this.lastContainer = container;

        // create the element for the node itself.
        var element = this.representation;
        element.className = "node" + (this.isExpanded ? "" : " collapsed");
        if (element.parentNode != container) {
            container.appendChild(element);
        }

        var children = this.children;
        var childContainer = this.getChildContainer();
        if (children.length > 0) {
            // recurse into each of the children
            for (var i = 0; i < children.length; ++i) {
                children[i].draw(childContainer);
            }
        }

        if (childContainer != null && childContainer.parentNode != container) {
            container.appendChild(childContainer);
        }
    }

    return {
        BuildTree: function(container, root) {
            return DrawingTreeNode.instantiate(root)
                .then(function(drawingRoot) {
                    container.innerHTML = "";
                    container.className = "tall-node-container";
                    drawingRoot.draw(container);
                    return drawingRoot;
                });
        }
    }
})();