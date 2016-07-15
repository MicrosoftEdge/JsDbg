
var TreeSaver = (function() {

    function Save(reader, node) {
        SerializeNode(reader, node)
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
div.node > div:first-child > div {\
    display:inline;\
    margin:0;\
    margin-left:1em;\
}\
div.node > div:first-child > div:first-child {\
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
            var childWindow = null;
            function receiveMessage(e) {
                if (e.source == childWindow && e.data == "READY") {
                    // The child window is ready to get the data.  Send it over.
                    childWindow.postMessage(preamble + nodeHtml + postamble, window.location.protocol + "//" + window.location.host);
                    window.removeEventListener("message", receiveMessage);
                }
            }
            window.addEventListener("message", receiveMessage);
            var childWindow = window.open("/tree-drawing/savedtree.html", "_blank");
        })
    }

    function SerializeNode(reader, node) {
        var html = ["<div class=\"node\">"]
        return reader.createRepresentation(node)
        .then(function(representation) {
            html.push(representation.outerHTML);
            return reader.getChildren(node);
        })
        .then(function(children) {
            if (node.drawingTreeNodeIsExpanded) {
                return Promise.map(children, function (child) { return SerializeNode(reader, child); });
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