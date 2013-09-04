var Tree = (function() {

    var BOX_WIDTH = 75;
    var BOX_MARGIN_X = 10;
    var BOX_HEIGHT = 80;
    var BOX_MARGIN_Y = 20;

    function DrawingTreeNode(node) {
        var children = node.getChildren();
        this.children = children.map(function(x) { return new DrawingTreeNode(x); });
        this.requiredWidth = -1;
        this.representation = node.createRepresentation();
    }

    DrawingTreeNode.prototype.getRequiredWidth = function() {
        if (this.requiredWidth == -1) {
            this.requiredWidth = 0;

            for (var i = 0; i < this.children.length; ++i) {
                this.requiredWidth += this.children[i].getRequiredWidth();
            }
            if (this.children.length > 0) {
                this.requiredWidth += BOX_MARGIN_X * (this.children.length - 1);
            }

            if (this.requiredWidth < BOX_WIDTH) {
                this.requiredWidth = BOX_WIDTH;
            }
        }

        return this.requiredWidth;
    }

    function drawBoxSubtree(box, container, viewport) {
        // create the element for the box itself.
        var element = box.representation;
        element.className = "box";
        element.style.left = (viewport.x + viewport.width / 2 - BOX_WIDTH / 2) + "px";
        element.style.top = viewport.y + "px";
        container.appendChild(element);

        var children = box.children;
        if (children.length > 0) {
            var firstWidth = children[0].getRequiredWidth();
            var lastWidth = children[children.length - 1].getRequiredWidth();
            var totalWidth = box.getRequiredWidth();

            // draw the child bar for this guy.
            var vertical = document.createElement("div");
            vertical.className = "vertical";
            vertical.style.left = (viewport.x + totalWidth / 2) + "px";
            vertical.style.top = (viewport.y + BOX_HEIGHT) + "px";
            container.appendChild(vertical);

            // draw the horizontal bar. it spans from the middle of the first viewport to the middle of the last viewport.
            var horizontalBarWidth = totalWidth - firstWidth / 2 - lastWidth / 2;
            var horizontal = document.createElement("div");
            horizontal.className = "horizontal";
            horizontal.style.width =  horizontalBarWidth + "px";
            horizontal.style.left = (viewport.x + firstWidth / 2) + "px";
            horizontal.style.top = (viewport.y + BOX_HEIGHT + BOX_MARGIN_Y / 2) + "px";
            container.appendChild(horizontal);

            viewport.y += BOX_HEIGHT + BOX_MARGIN_Y;

            // recurse into each of the children and draw a vertical.
            for (var i = 0; i < children.length; ++i) {
                var requiredWidth = children[i].getRequiredWidth();

                // draw the parent bar for this child.
                var childVertical = document.createElement("div");
                childVertical.className = "vertical";
                childVertical.style.left = (viewport.x + requiredWidth / 2) + "px";
                childVertical.style.top = (viewport.y - BOX_MARGIN_Y / 2) + "px";
                container.appendChild(childVertical);

                drawBoxSubtree(children[i], container, {x:viewport.x, y:viewport.y, width:requiredWidth});
                viewport.x += requiredWidth + BOX_MARGIN_X;
            }
        }
    }

    return {
        DrawTree: function(container, root) {
            var drawingRoot = new DrawingTreeNode(root)
            drawBoxSubtree(drawingRoot, container, {x: 0, y:0, width:drawingRoot.getRequiredWidth() });
        }
    }
})();