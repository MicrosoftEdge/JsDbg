

DbgObject.AddTypeDescription(MSHTML.Module, "Layout::PendingCollection", function(collection) {
    return collection.f("lastItem.m_pT").list("next.m_pT").vcast().desc();
});

DbgObject.AddTypeDescription(MSHTML.Module, "Layout::ExportedCollection", function(collection) {
    return collection.f("pendingCollection.m_pT").desc();
});

DbgObject.AddTypeDescription(MSHTML.Module, "Layout::UnpositionedElement", function(unpositionedElement) {
    return unpositionedElement.f("PositionedElement.m_pT").desc()
    .then(function (desc) {
        return unpositionedElement.f("autoPosition.staticPosition").desc()
        .then(function (posDesc) {
            return "Unpositioned(" + desc + ", " + posDesc + ")";
        })
    })
});