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
        this.nodeChildren = node.getChildren();
        this.parent = parent;
        this.children = [];
        this.representation = null;
        this.childContainer = null;
        this.isExpanded = this.nodeChildren.length == 0;
        this.createRepresentation();
        if (this.innerNode.drawingTreeNodeIsExpanded) {
            this.expand();
        }
    }

    DrawingTreeNode.prototype.createRepresentation = function() {
        this.representation = this.innerNode.createRepresentation();

        var childrenCount = document.createElement("div");
        childrenCount.className = "children";
        childrenCount.innerHTML = this.nodeChildren.length;
        if (this.representation.firstChild != null) {
            this.representation.insertBefore(document.createTextNode(" "), this.representation.firstChild);
            this.representation.insertBefore(childrenCount, this.representation.firstChild);
        } else {
            this.representation.appendChild(childrenCount);
        }

        var that = this;
        this.representation.addEventListener("click", function(e) {
            if (!that.isExpanded) {
                var clock = Timer.Start();
                that.expand(e.ctrlKey);
                console.log("Expansion took " + clock.Elapsed() + "s");
                that.invalidate();
                console.log("Full Redraw took " + clock.Elapsed() + "s");
            } else if (e.ctrlKey) {
                that.collapse(false);
                that.invalidate();
            }
        });
        this.representation.addEventListener("mousedown", function(e) {
            if (e.ctrlKey) {
                e.preventDefault();
            }
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

            this.createRepresentation();

            parent.insertBefore(this.representation, oldChild);
            parent.removeChild(oldChild);

            this.representation.className = styles[0];
        }

        var that = this;
        window.setImmediate(function() { that.children.forEach(function(x) { x.updateRepresentation(); }); });
    }

    DrawingTreeNode.prototype.expand = function(recurse) {
        var that = this;
        this.children = this.nodeChildren.map(function(x) { 
            var node = new DrawingTreeNode(x, that);
            if (recurse) {
                node.expand(true);
            }
            return node;
        });
        this.isExpanded = true;
        this.innerNode.drawingTreeNodeIsExpanded = true;
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

    DrawingTreeNode.prototype.invalidate = function() {
        if (this.parent) {
            this.parent.invalidate();
        } else {
            this.redraw();
        }
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
            container.innerHTML = "";
            container.className = "tall-node-container";
            var drawingRoot = new DrawingTreeNode(root)
            drawingRoot.draw(container);

            return {
                updateRepresentation: function() {
                    drawingRoot.updateRepresentation();
                }
            }
        }
    }
})();