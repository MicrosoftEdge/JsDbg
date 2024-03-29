//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

DbgObject.AddExtendedField(
    (type) => type.name().match(/^std::unique_ptr<.*>$/) != null,
    "Object",
    (type) => type.templateParameters()[0],
    (uniquePtr) => uniquePtr.f("_Mypair._Myval2")
);

DbgObject.AddExtendedField(
    (type) => type.name().match(/^std::(__)?(Cr|1)::unique_ptr<.*>$/) != null,
    "Object",
    (type) => type.templateParameters()[0],
    (uniquePtr) => uniquePtr.f("__ptr_.__value_")
);

DbgObject.AddTypeDescription(
    (type) => type.name().match(/^std::__(Cr|1)::atomic<(.*)>$/) != null,
    "Value",
    false,
    (atomic) => atomic.val()
);

DbgObject.AddExtendedField(
    (type) => type.name().match(/^std::Cr::atomic<(.*)>$/) != null,
    "Object",
    (type) => DbgObjectType(type.templateParameters()[0], type),
    (atomic) => atomic.f("__a_.__a_value").as(atomic.type.templateParameters()[0])
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::vector<(.*)>$/) != null;
    },
    "Elements",
    (type) => {
        return type.templateParameters()[0];
    },
    (vector) => {
        return vector.f("_Mypair._Myval2", "").f("_Myfirst").array(vector.desc("Size"));
    }
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::__(Cr|1)::vector<(.*)>$/) != null;
    },
    "Elements",
    (type) => {
        return type.templateParameters()[0];
    },
    (vector) => {
        return vector.f("__begin_").array(vector.desc("Size"));
    }
);

function computeVectorSize(firstElement, lastElement, elementSize) {
    if (!firstElement.isNull()) {
        console.assert(!lastElement.isNull());
        return lastElement.pointerValue().minus(firstElement.pointerValue()).divide(elementSize);
    } else {
        return 0;
    }
}

DbgObject.AddTypeDescription(
    (type) => {
        return type.name().match(/^std::vector<(.*)>$/) != null;
    },
    "Size",
    false,
    (vector) => {
        vector = vector.f("_Mypair._Myval2", "");
        return Promise.all([vector.f("_Myfirst"), vector.f("_Mylast"), vector.f("_Myfirst").size()])
        .thenAll(computeVectorSize);
    }
);

DbgObject.AddTypeDescription(
    (type) => {
        return type.name().match(/^std::__(Cr|1)::vector<(.*)>$/) != null;
    },
    "Size",
    false,
    (vector) => {
        return Promise.all([vector.f("__begin_"), vector.f("__end_"), vector.f("__begin_").size()])
        .thenAll(computeVectorSize);
    }
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::list<(.*)>$/) != null;
    },
    "Elements",
    (type) => {
        return type.templateParameters()[0];
    },
    (list) => {
        list = list.f("_Mypair._Myval2", "");
        return Promise.map(list.f("_Myhead").f("_Next").list("_Next", list.f("_Myhead")), (listNode) => listNode.f("_Myval"));
    }
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::map<(.*)>$/) != null;
    },
    "Pairs",
    (type) => {
        var dummyMap = DbgObject.create(type, 0);
        return dummyMap.f("_Mypair._Myval2._Myval2._Myhead", "_Myhead")
        .then((headNode) => {
            return headNode.type.templateParameters()[0];
        });
    },
    (map) => {
        return map.f("_Mypair._Myval2._Myval2._Myhead", "_Myhead")
        .then((headNode) => {
            var resultArray = [];
            return inOrderTraversal(headNode.f("_Parent"), "_Left", "_Right", "_Myval", headNode, resultArray)
            .then(() => {
                return Promise.all(resultArray);
            });
        });
    }
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::__(Cr|1)::map<(.*)>$/) != null;
    },
    "Pairs",
    (type) => {
        var allocator = type.templateParameters()[3];
        var pair = new DbgObjectType(allocator, type).templateParameters()[0];
        return new DbgObjectType(pair, type);
    },
    (map) => map.f("__tree_").then((tree) => {
        var fromType = map.type.templateParameters()[0];
        var toType = map.type.templateParameters()[1];
        var prefix = map.type.name().match(/^std::(__[a-zA-Z0-9]+)/)[0];
        var nodeTypeName = `${prefix}::__tree_node<${prefix}::__value_type<${fromType},${toType}>,void *>`;
        var nodeType = new DbgObjectType(nodeTypeName, tree.type);
        return tree.f("__pair3_.__value_").val().then((size) => {
            return Promise.map(tree.f("__begin_node_").as(nodeType).list(nextRbTreeNode, null, size), (node) => {
                return node.f("__value_.__cc");
            });
        });
    })
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::Cr::map<(.*)>$/) != null;
    },
    "Pairs",
    (type) => {
        var allocator = type.templateParameters()[3];
        var pair = new DbgObjectType(allocator, type).templateParameters()[0];
        return new DbgObjectType(pair, type);
    },
    (map) => {
        return map.f("__tree_").then((tree) => {
            var fromType = map.type.templateParameters()[0];
            var toType = map.type.templateParameters()[1];
            var prefix = map.type.name().match(/^std::([a-zA-Z0-9]+)/)[0];
            var nodeTypeName = `${prefix}::__tree_node<${prefix}::__value_type<${fromType},${toType}>,void *>`;
            var nodeType = new DbgObjectType(nodeTypeName, tree.type);
            return tree.f("__pair3_.__value_").val().then((size) => {
                return Promise.map(tree.f("__begin_node_").as(nodeType).list(nextRbTreeNode, null, size), (node) => {
                    return node.f("__value_.__cc_");
                });
            });
        });
    }
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::Cr::map<(.*)>$/) != null;
    },
    "Keys",
    (type) => {
        return type.templateParameters()[0];
    },
    (map) => {
        return Promise.map(map.array("Pairs"), (pair) => pair.field("first"));
    }
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::Cr::map<(.*)>$/) != null;
    },
    "Values",
    (type) => {
        return type.templateParameters()[1];
    },
    (map) => {
        return Promise.map(map.array("Pairs"), (pair) => pair.field("second"));
    }
);

function walkDownLeft(node) {
    return node.f("__left_").as(node.type).then((left) => {
        if (left.isNull() || left.equals(node))
            return node;
        return walkDownLeft(left.as(node.type));
    });
}

function walkUpParent(node) {
    return Promise.all([node.f("__parent_").as(node.type), node.f("__parent_").as(node.type).f("__left_")]).thenAll((parent, parentLeft) => {
        if (node.equals(parentLeft))
            return parent;
        return walkUpParent(parent);
    });
}

function nextRbTreeNode(node) {
    return Promise.all([node.f("__right_").as(node.type), node.f("__parent_").as(node.type)]).thenAll((right, parent) => {
        if (!right.isNull())
            return walkDownLeft(node);
        return walkUpParent(node);
    });
}

function inOrderTraversal(rootNodeOrPromise, leftField, rightField, valueField, lastNodeOrPromise, resultArray) {
    return Promise.all([Promise.resolve(rootNodeOrPromise), Promise.resolve(lastNodeOrPromise)])
    .thenAll((rootNode, lastNode) => {
        if (!rootNode.equals(lastNode)) {
            return inOrderTraversal(rootNode.f(leftField), leftField, rightField, valueField, lastNode, resultArray)
            .then(() => {
                resultArray.push(rootNode.f(valueField));
                return inOrderTraversal(rootNode.f(rightField), leftField, rightField, valueField, lastNode, resultArray);
            });
        }
    });
}

DbgObject.AddArrayField(
    (type) => type.name().match(/^std::__(Cr|1)::unordered_map<(.*)>$/) != null,
    "Pairs",
    (type) => {
        var allocator = type.templateParameters()[4];
        var pair = new DbgObjectType(allocator, type).templateParameters()[0];
        return new DbgObjectType(pair, type);
    },
    (map) => {
        return map.f("__table_").then((table) => {
            var fromType = map.type.templateParameters()[0];
            var toType = map.type.templateParameters()[1];
            var prefix = map.type.name().match(/^std::(__[a-zA-Z0-9]+)/)[0];
            var nodeTypeName = `${prefix}::__hash_node<${prefix}::__hash_value_type<${fromType},${toType}>,void *>`;
            var nodeType = DbgObjectType(nodeTypeName, table.type);
            return map.f("__table_.__p1_.__value_.__next_").list("__next_").map(
                (elem) => elem.as(nodeType).f("__value_.__cc"));
        });
    }
);

DbgObject.AddArrayField(
    (type) => type.name().match(/^std::unordered_map<(.*)>$/) != null,
    "Pairs",
    (type) => DbgObject.create(type, 0).f("_List").then((headNode) => headNode.type.templateParameters()[0]),
    (map) => map.f("_List").array("Elements")
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::(__(Cr|1)::)?map<(.*)>$/) != null;
    },
    "Keys",
    (type) => {
        return type.templateParameters()[0];
    },
    (map) => {
        return Promise.map(map.array("Pairs"), (pair) => pair.field("first"));
    }
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::(__(Cr|1)::)?map<(.*)>$/) != null;
    },
    "Values",
    (type) => {
        return type.templateParameters()[1];
    },
    (map) => {
        return Promise.map(map.array("Pairs"), (pair) => pair.field("second"));
    }
);

DbgObject.AddTypeDescription(
    (type) => {
        return type.name().match(/^std::(__(Cr|1)::)?map<(.*)>$/) != null;
    },
    "Size",
    false,
    (map) => {
        return map.f("_Mysize", "_Mypair._Myval2._Myval2._Mysize");
    }
);

DbgObject.AddTypeDescription(
    (type) => type.name().match(/^std::basic_string<.*>$/) != null,
    "Text",
    true,
    (str) => {
        var stringVal = str.f("_Mypair._Myval2");
        return Promise.all([stringVal.f("_Bx._Buf"), stringVal.f("_Myres").val()])
        .thenAll((inlineBuffer, bufferSize) => {
            if (bufferSize > inlineBuffer.type.arrayLength()) {
                return stringVal.f("_Bx._Ptr").string(stringVal.f("_MySize"));
            } else {
                return stringVal.f("_Bx._Buf").string(stringVal.f("_MySize"));
            }
        })
    }
);

DbgObject.AddTypeDescription(
    (type) => type.name().match(/^std::__(Cr|1)::basic_string<.*>$/) != null,
    "Text",
    true,
    (str) => {
        var ss = str.f("__r_.__value_.__s");
        var shortMask = DbgObject.constantValue(str.type, "__short_mask");
        var size = ss.f("__size_").uval();
        return Promise.all([ss, shortMask, size]).thenAll((ss, shortMask, size) => {
            if ((size & shortMask) == 0) {
                var len = (shortMask == 1) ? size >> 1 : size;
                return ss.f("__data_").string(len);
            } else {
                var sl = str.f("__r_.__value_.__l");
                return sl.f("__data_").string(sl.f("__size_"));
            }
        });
    }
);

DbgObject.AddTypeDescription(
    (type) => type.name().match(/^std::(__(Cr|1)::)?pair<.*>$/) != null,
    "Pair",
    true,
    (pair) => Promise.all([pair.f("first").desc(), pair.f("second").desc()]).thenAll((first, second) => `{${first},${second}}`)
);
