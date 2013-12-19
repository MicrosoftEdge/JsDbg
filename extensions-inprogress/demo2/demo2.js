
DbgObject.AddTypeDescription("mshtml", function(type) { return type.match(/^SArray<(.*)>$/); }, function(object) {
    var itemType = object.typeDescription().replace(/^SArray<\s*(.*?)\s*>$/, "$1");
    return Promise.as(object.f("_array"))
    .then(function (arrayObj) {
        if (arrayObj.isNull()) {
            return "NULL";
        } else {
            return Promise.as(arrayObj.as("SArrayHeader").idx(-1).f("Length").val())
            .then(function(count) {
                return arrayObj.as(itemType + "[" + count + "]").desc();
            });
        }
    });
});

DbgObject.AddTypeDescription("mshtml", function(type) { return type.match(/^SP<(.*)>$/); }, function(object) {
    var itemType = object.typeDescription().replace(/^SP<\s*(.*?)\s*>$/, "$1");
    return Promise.as(object.f("m_pT"))
    .then(function (referencedObject) {
        return object.htmlTypeDescription() + " -> " + referencedObject.ptr();
    });
});

DbgObject.AddTypeDescription("mshtml", "Tree::AryTextBlockRuns", function(object) {
    return object.f("_c").val()
    .then(function (count) {
        return object.f("_pv").as("Tree::TextBlockRun*[" + count + "]").desc();
    })
});