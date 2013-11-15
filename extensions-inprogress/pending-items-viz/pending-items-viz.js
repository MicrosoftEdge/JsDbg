

DbgObject.AddTypeDescription("mshtml", "Layout::PendingCollection", function(collection) {
    var items = [];
    function collectRestOfItems(firstItem, item) {
        return item.vcast().desc()
        .then(function(desc) {
            items.push(desc);
            return item.f("next.m_pT");
        })
        .then(function (nextItem) {
            if (nextItem.equals(firstItem)) {
                return;
            } else {
                return collectRestOfItems(firstItem, nextItem);
            }
        })
    }

    if (collection.isNull()) {
        return collection.ptr();
    }


    return collection.f("lastItem.m_pT")
    .then(function (item) {
        return collectRestOfItems(item, item);
    })
    .then(function() {
        return items.join(", ");
    });
});

DbgObject.AddTypeDescription("mshtml", "Layout::ExportedCollection", function(collection) {
    return collection.f("pendingCollection.m_pT").desc();
});

DbgObject.AddTypeDescription("mshtml", "Layout::UnpositionedElement", function(unpositionedElement) {
    return unpositionedElement.f("PositionedElement.m_pT").desc()
    .then(function (desc) {
        return "Unpositioned(" + desc + ")";
    })
});