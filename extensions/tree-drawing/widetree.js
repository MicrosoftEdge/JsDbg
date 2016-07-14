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

    var NODE_WIDTH = 75;
    var NODE_MARGIN_X = 10;
    var NODE_HEIGHT = 80;
    var NODE_MARGIN_Y = 20;

    function DrawingTreeNode(treeManager, node, parent) {
        this.treeManager = treeManager;
        this.innerNode = node;
        this.parent = parent;
        this.children = [];
        this.representation = null;
        this.childContainer = null;
        this.requiredWidth = -1;
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

    DrawingTreeNode.prototype._createRepresentation = function() {
        var that = this;
        return this.treeManager.createRepresentation(this.innerNode)
            .then(function(innerRepresentation) {
                that.representation = innerRepresentation;

                var childrenCount = document.createElement("div");
                childrenCount.className = "children";
                childrenCount.innerHTML = that.nodeChildren.length;
                that.representation.appendChild(childrenCount);

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
                                that._invalidate();
                                console.log("Full Redraw took " + clock.Elapsed() + "s");
                            });
                        } else if (e.ctrlKey) {
                            that._collapse(false);
                            that._invalidate();
                        }
                    })
                });
                that.representation.addEventListener("mousedown", function(e) {
                    if (e.ctrlKey) {
                        e.preventDefault();
                    }
                });
            });
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
                this.representation.className,
                this.representation.style.left,
                this.representation.style.top
            ];
            var oldRepresentation = this.representation;
            this.representation = null;

            return this._createRepresentation()
            .then(function recreatedRepresentation() {
                oldRepresentation.parentNode.removeChild(oldRepresentation);
                parent.appendChild(that.representation);

                that.representation.className = styles[0];
                that.representation.style.left = styles[1];
                that.representation.style.top = styles[2];

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
            return new DrawingTreeNode(that.treeManager, x, that);
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
            if (e.parentNode) {
                e.parentNode.removeChild(e);
            }
        }
        if (removeSelf) {
            remove(this.representation);
            remove(this._getParentBar());
        }
        remove(this._getChildBar());
        remove(this._getHorizontalBar());

        this.children.map(function(x) { x._collapse(true); });
        this.children = [];
        this.requiredWidth = 0;
        this.isExpanded = this.nodeChildren.length == 0;
        this.innerNode.drawingTreeNodeIsExpanded = this.isExpanded;
    }

    DrawingTreeNode.prototype._invalidate = function() {
        this.requiredWidth = -1;
        if (this.parent) {
            this.parent._invalidate();
        } else {
            this._redraw();
        }
    }

    DrawingTreeNode.prototype._getRequiredWidth = function() {
        if (this.requiredWidth == -1) {
            this.requiredWidth = 0;

            for (var i = 0; i < this.children.length; ++i) {
                this.requiredWidth += this.children[i]._getRequiredWidth();
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

    DrawingTreeNode.prototype._redraw = function() {
        this._draw(this.lastContainer, this.lastViewport);
    }

    DrawingTreeNode.prototype._getChildBar = function() {
        if (!this.childBar) {
            this.childBar = document.createElement("div");
            this.childBar.className = "vertical";
        }

        return this.childBar;
    }

    DrawingTreeNode.prototype._getHorizontalBar = function() {
        if (!this.horizontalBar) {
            this.horizontalBar = document.createElement("div");
            this.horizontalBar.className = "horizontal";
        }

        return this.horizontalBar;
    }

    DrawingTreeNode.prototype._getParentBar = function() {
        if (!this.parentBar) {
            this.parentBar = document.createElement("div");
            this.parentBar.className = "vertical";
        }

        return this.parentBar;
    }

    DrawingTreeNode.prototype._draw = function(container, viewport) {
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
            var firstWidth = children[0]._getRequiredWidth();
            var lastWidth = children[children.length - 1]._getRequiredWidth();
            var totalWidth = this._getRequiredWidth();

            // draw the child bar for this guy.
            var vertical = this._getChildBar();
            vertical.style.left = (viewport.x + NODE_WIDTH / 2) + "px";
            vertical.style.top = (viewport.y + NODE_HEIGHT) + "px";
            if (vertical.parentNode != container) {
                container.appendChild(vertical);
            }

            // draw the horizontal bar. it spans from the middle of the first viewport to the middle of the last viewport.
            var horizontalBarWidth = totalWidth - lastWidth;
            var horizontal = this._getHorizontalBar();
            horizontal.style.width =  horizontalBarWidth + "px";
            horizontal.style.left = (viewport.x + NODE_WIDTH / 2) + "px";
            horizontal.style.top = (viewport.y + NODE_HEIGHT + NODE_MARGIN_Y / 2) + "px";
            if (horizontal.parentNode != container) {
                container.appendChild(horizontal);
            }

            viewport.y += NODE_HEIGHT + NODE_MARGIN_Y;

            // recurse into each of the children and draw a vertical.
            for (var i = 0; i < children.length; ++i) {
                var requiredWidth = children[i]._getRequiredWidth();

                // draw the parent bar for this child.
                var childVertical = children[i]._getParentBar();
                childVertical.style.left = viewport.x + NODE_WIDTH / 2 + "px";
                childVertical.style.top = (viewport.y - NODE_MARGIN_Y / 2) + "px";
                if (childVertical.parentNode != container) {
                    container.appendChild(childVertical);
                }

                children[i]._draw(container, {x:viewport.x, y:viewport.y});
                viewport.x += requiredWidth + NODE_MARGIN_X;
            }
        }
    }

    return {
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
                    container.className = "node-container";
                    drawingRoot._draw(container, {x: 0, y:0});
                    return drawingRoot;
                });
            });
        },

        GetTreeRangeAsText: function(range) {
            return null; // unsupported
        }
    }
})();