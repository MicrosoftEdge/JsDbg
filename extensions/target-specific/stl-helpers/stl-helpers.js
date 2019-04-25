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

DbgObject.AddTypeDescription(
    (type) => {
        return type.name().match(/^std::vector<(.*)>$/) != null;
    },
    "Size",
    false,
    (vector) => {
        vector = vector.f("_Mypair._Myval2", "");
        return Promise.all([vector.f("_Myfirst"), vector.f("_Mylast"), vector.f("_Myfirst").size()])
        .thenAll((firstElement, lastElement, elementSize) => {
            if (!firstElement.isNull()) {
                console.assert(!lastElement.isNull());
                return lastElement.pointerValue().minus(firstElement.pointerValue()).divide(elementSize);
            } else {
                return 0;
            }
        });
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
    (type) => type.name().match(/^std::unordered_map<(.*)>$/) != null,
    "Pairs",
    (type) => DbgObject.create(type, 0).f("_List").then((headNode) => headNode.type.templateParameters()[0]),
    (map) => map.f("_List").array("Elements")
);

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::map<(.*)>$/) != null;
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
        return type.name().match(/^std::map<(.*)>$/) != null;
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
        return type.name().match(/^std::map<(.*)>$/) != null;
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
    (type) => type.name().match(/^std::pair<.*>$/) != null,
    "Pair",
    true,
    (pair) => Promise.all([pair.f("first").desc(), pair.f("second").desc()]).thenAll((first, second) => `{${first}, ${second}}`)
);
