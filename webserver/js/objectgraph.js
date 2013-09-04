var types = [
    {
        module: "mshtml",
        type: "CTreeNode",
        edges: [
            {
                name: "Parent",
                field: "_pNodeParent",
                type: "CTreeNode"
            },
            {
                name: "LayoutBox",
                field: "_pLayoutBoxAssociationDbg",
                type: "LayoutBox"
            }
        ]
    },
    {
        module: "mshtml",
        type: "LayoutBox",
        vtable: true,
        edges: []
    }
];

var lastNode = null;

function createGraphNode(pointer, typeName) {
    // Lookup the type name.
    var type = null;
    for (var i = 0; i < types.length; ++i) {
        if (types[i].type == typeName) {
            type = types[i];
            break;
        }
    }

    if (type == null) {
        throw "Unrecognized type name.";
    }

    // Create the node.
    var root = document.getElementById("objectgraph_root");
    var node = document.createElement("div");

    node.className = "node";
    node.style.top = lastNode == null ? "0px" : parseInt(lastNode.style.top) + lastNode.offsetHeight + 20 + "px";
    var pointerText = "0x" + pointer.toString(16);

    node.innerHTML = "<div class=\"type\">" + type.type + "</div><div class=\"pointer\">" + pointerText + "</div>";

    // Create the edges.
    var edgesDiv = document.createElement("div");
    node.appendChild(edgesDiv);
    edgesDiv.className = "edges";

    if (pointer != 0) {
        if (type.vtable) {
            // lookup the vtable symbol
            JsDbg.ReadPointer(pointer, function(memoryResult) {
                JsDbg.LookupSymbolName(memoryResult.value, function(symbolNameResult) {
                    node.innerHTML += symbolNameResult.symbolName;
                });
            });
        }

        for (var i = 0; i < type.edges.length; ++i) {
            var edge = type.edges[i];
            var edgeDiv = document.createElement("div");
            edgesDiv.appendChild(edgeDiv);
            edgeDiv.className = "edge";
            edgeDiv.innerText = edge.name;
            function createEdgeEventHandler(edge) {
                return function() {
                    JsDbg.LookupFieldOffset(type.module, type.type, [edge.field], function(symbolResult) {
                        JsDbg.ReadPointer(pointer + symbolResult.offset, function(memoryResult) {
                            createGraphNode(memoryResult.value, edge.type);
                        });
                    });
                }
            }
            edgeDiv.addEventListener("click", createEdgeEventHandler(edge));       
        }
    }

    root.appendChild(node);
    lastNode = node;
}