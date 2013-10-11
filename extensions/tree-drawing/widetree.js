"use strict";

// tree.js
// Peter Salas
//
// A tree drawing library.  It provides one method, WideTree.BuildTree, which takes a DOM element in which to create the tree,
// and a "backing node" which implements two methods:
//  - getChildren -> array of backing nodes
//  - createRepresentation -> dom element that represents the node
//
// WideTree.BuildTree returns an object with a single method
//  - updateRepresentation
// which can be used to notify the tree that node representations returned by createRepresentation may have changed.

var WideTree = (function() {

    var NODE_WIDTH = 75;
    var NODE_MARGIN_X = 10;
    var NODE_HEIGHT = 80;
    var NODE_MARGIN_Y = 20;

    function DrawingTreeNode(node, parent) {
        this.innerNode = node;
        this.parent = parent;
        this.children = [];
        this.representation = null;
        this.childContainer = null;
        this.requiredWidth = -1;
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
                that.representation.appendChild(childrenCount);

                that.representation.addEventListener("click", function(e) {
                    if (!that.isExpanded) {
                        var clock = Timer.Start();
                        that.expand(e.ctrlKey)
                            .then(function expanded() {
                                console.log("Expansion took " + clock.Elapsed() + "s");
                                that.invalidate();
                                console.log("Full Redraw took " + clock.Elapsed() + "s");
                            });
                    } else if (e.ctrlKey) {
                        that.collapse(false);
                        that.invalidate();
                    }
                });
                that.representation.addEventListener("mousedown", function(e) {
                    if (e.ctrlKey) {
                        e.preventDefault();
                    }
                });
            });
    }

    DrawingTreeNode.prototype.updateRepresentation = function() {
        if (this.representation != null && this.representation.parentNode) {
            var parent = this.representation.parentNode;
            var styles = [
                this.representation.className,
                this.representation.style.left,
                this.representation.style.top
            ];
            var oldRepresentation = this.representation;
            this.representation = null;

            var that = this;
            this.createRepresentation()
                .then(function recreatedRepresentation() {
                    oldRepresentation.parentNode.removeChild(oldRepresentation);
                    parent.appendChild(that.representation);

                    that.representation.className = styles[0];
                    that.representation.style.left = styles[1];
                    that.representation.style.top = styles[2];

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
            if (e.parentNode) {
                e.parentNode.removeChild(e);
            }
        }
        if (removeSelf) {
            remove(this.representation);
            remove(this.getParentBar());
        }
        remove(this.getChildBar());
        remove(this.getHorizontalBar());

        this.children.map(function(x) { x.collapse(true); });
        this.children = [];
        this.requiredWidth = 0;
        this.isExpanded = this.nodeChildren.length == 0;
        this.innerNode.drawingTreeNodeIsExpanded = this.isExpanded;
    }

    DrawingTreeNode.prototype.invalidate = function() {
        this.requiredWidth = -1;
        if (this.parent) {
            this.parent.invalidate();
        } else {
            this.redraw();
        }
    }

    DrawingTreeNode.prototype.getRequiredWidth = function() {
        if (this.requiredWidth == -1) {
            this.requiredWidth = 0;

            for (var i = 0; i < this.children.length; ++i) {
                this.requiredWidth += this.children[i].getRequiredWidth();
            }

            if (this.children.length > 0) {
                this.requiredWidth += NODE_MARGIN_X * (this.children.length - 1);
            }

            if (this.requiredWidth < NODE_WIDTH) {
                this.requiredWidth = NODE_WIDTH;
            }
        }

        return this.requiredWidth;
    }

    DrawingTreeNode.prototype.redraw = function() {
        this.draw(this.lastContainer, this.lastViewport);
    }

    DrawingTreeNode.prototype.getChildBar = function() {
        if (!this.childBar) {
            this.childBar = document.createElement("div");
            this.childBar.className = "vertical";
        }

        return this.childBar;
    }

    DrawingTreeNode.prototype.getHorizontalBar = function() {
        if (!this.horizontalBar) {
            this.horizontalBar = document.createElement("div");
            this.horizontalBar.className = "horizontal";
        }

        return this.horizontalBar;
    }

    DrawingTreeNode.prototype.getParentBar = function() {
        if (!this.parentBar) {
            this.parentBar = document.createElement("div");
            this.parentBar.className = "vertical";
        }

        return this.parentBar;
    }

    DrawingTreeNode.prototype.draw = function(container, viewport) {
        this.lastContainer = container;
        this.lastViewport = {x:viewport.x, y:viewport.y};

        // create the element for the node itself.
        var element = this.representation;
        element.className = "node" + (this.isExpanded ? "" : " collapsed");
        element.style.left = viewport.x + "px";
        element.style.top = viewport.y + "px";
        if (element.parentNode != container) {
            container.appendChild(element);
        }

        var children = this.children;
        if (children.length > 0) {
            var firstWidth = children[0].getRequiredWidth();
            var lastWidth = children[children.length - 1].getRequiredWidth();
            var totalWidth = this.getRequiredWidth();

            // draw the child bar for this guy.
            var vertical = this.getChildBar();
            vertical.style.left = (viewport.x + NODE_WIDTH / 2) + "px";
            vertical.style.top = (viewport.y + NODE_HEIGHT) + "px";
            if (vertical.parentNode != container) {
                container.appendChild(vertical);
            }

            // draw the horizontal bar. it spans from the middle of the first viewport to the middle of the last viewport.
            var horizontalBarWidth = totalWidth - lastWidth;
            var horizontal = this.getHorizontalBar();
            horizontal.style.width =  horizontalBarWidth + "px";
            horizontal.style.left = (viewport.x + NODE_WIDTH / 2) + "px";
            horizontal.style.top = (viewport.y + NODE_HEIGHT + NODE_MARGIN_Y / 2) + "px";
            if (horizontal.parentNode != container) {
                container.appendChild(horizontal);
            }

            viewport.y += NODE_HEIGHT + NODE_MARGIN_Y;

            // recurse into each of the children and draw a vertical.
            for (var i = 0; i < children.length; ++i) {
                var requiredWidth = children[i].getRequiredWidth();

                // draw the parent bar for this child.
                var childVertical = children[i].getParentBar();
                childVertical.style.left = viewport.x + NODE_WIDTH / 2 + "px";
                childVertical.style.top = (viewport.y - NODE_MARGIN_Y / 2) + "px";
                if (childVertical.parentNode != container) {
                    container.appendChild(childVertical);
                }

                children[i].draw(container, {x:viewport.x, y:viewport.y});
                viewport.x += requiredWidth + NODE_MARGIN_X;
            }
        }
    }

    return {
        BuildTree: function(container, root) {
            return DrawingTreeNode.instantiate(root)
                .then(function(drawingRoot) {
                    container.innerHTML = "";
                    container.className = "node-container";
                    drawingRoot.draw(container, {x: 0, y:0});
                    return drawingRoot;
                });
        }
    }
})();