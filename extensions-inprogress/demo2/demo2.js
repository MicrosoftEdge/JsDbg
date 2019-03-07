//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

DbgObject.AddTypeDescription(MSHTML.Module, function(type) { return type.match(/^SArray<(.*)>$/); }, function(object) {
    var itemType = object.type.name().replace(/^SArray<\s*(.*?)\s*>$/, "$1");
    return Promise.resolve(object.f("_array"))
    .then(function (arrayObj) {
        if (arrayObj.isNull()) {
            return "NULL";
        } else {
            return Promise.resolve(arrayObj.as("SArrayHeader").idx(-1).f("Length").val())
            .then(function(count) {
                return arrayObj.as(itemType + "[" + count + "]").desc();
            });
        }
    });
});

DbgObject.AddTypeDescription(MSHTML.Module, function(type) { return type.match(/^SP<(.*)>$/); }, function(object) {
    var itemType = object.type.name().replace(/^SP<\s*(.*?)\s*>$/, "$1");
    return Promise.resolve(object.f("m_pT"))
    .then(function (referencedObject) {
        return object.type.htmlName() + " -> " + referencedObject.ptr();
    });
});

DbgObject.AddTypeDescription(MSHTML.Module, "Tree::AryTextBlockRuns", function(object) {
    return object.f("_c").val()
    .then(function (count) {
        return object.f("_pv").as("Tree::TextBlockRun*[" + count + "]").desc();
    })
});