
var TreeSaver = (function() {

    function Save(node) {
        SerializeNode(node)
        .then(function(nodeHtml) {
            var preamble =
"<!doctype html>\n\
<html>\
<head>\
<style type=\"text/css\">\
body { \
    font-family:Consolas; \
    font-size:9pt;\
}\
p {\
    display:inline;\
    margin:0;\
    margin-left:1em;\
}\
p:first-child {\
    margin:0;\
}\
div.node {\
    margin-top:0.4em;\
}\
div.children {\
    margin-left:2em;\
    border-left:thin solid gray;\
    padding-left:5px;\
}\
</style>\
<body>";

            var postamble =
"</body>\
</html>";
            var child = window.open("/tree-drawing/savedtree.html", "_blank");
            child.postMessage(preamble + nodeHtml + postamble, window.location.protocol + "//" + window.location.host);
        })
    }

    function SerializeNode(node) {
        var html = ["<div class=\"node\">"]
        return node.createRepresentation()
        .then(function(representation) {
            html.push(representation.outerHTML);
            return node.getChildren();
        })
        .then(function(children) {
            if (node.drawingTreeNodeIsExpanded) {
                return Promise.map(children, SerializeNode);
            } else if (children.length > 1) {
                return ["(" + children.length + " collapsed children" + "...)"];
            } else if (children.length == 1) {
                return ["(1 collapsed child...)"];
            } else {
                return [];
            }
        })
        .then(function(children) {
            if (children.length > 0) {
                html.push("<div class=\"children\">");
                children.forEach(function(child) {
                    html.push(child);
                });
                html.push("</div>");
            }
            html.push("</div>");
            return html.join("");
        })
    }

    return {
        Save: Save,
    };
})();