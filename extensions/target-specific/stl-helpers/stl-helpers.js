
DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^std::vector<(.*)>$/) != null;
    },
    "Elements",
    (type) => {
        return type.templateParameters()[0];
    },
    (vector) => {
        return vector.f("_Myfirst").array(vector.desc("Size"));
    }
);

DbgObject.AddTypeDescription(
    (type) => {
        return type.name().match(/^std::vector<(.*)>$/) != null;
    },
    "Size",
    false,
    (vector) => {
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
        return Promise.map(list.f("_Myhead").f("_Next").list("_Next", list.f("_Myhead")), (listNode) => listNode.f("_Myval"));
    }
);