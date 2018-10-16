"use strict";

Loader.OnLoad(function() {
    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "WTF::AtomicString"), "Text", true, (wtfAtomicString) => {
        return wtfAtomicString.f("string_").desc("Text");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "WTF::AtomicString"), "TextLength", false, (wtfAtomicString) => {
        return wtfAtomicString.f("string_").desc("TextLength");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "WTF::String"), "Text", true, (wtfString) => {
        return wtfString.f("impl_").f("ptr_").desc("Text");
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "WTF::String"), "TextLength", false, (wtfString) => {
        return wtfString.f("impl_").f("ptr_").then((wtfStringImpl) => !wtfStringImpl.isNull() ? wtfStringImpl.f("length_").val() : 0);
    });

    DbgObject.AddTypeDescription(Chromium.ChildProcessType("blink_core", "WTF::StringImpl"), "Text", true, (wtfStringImpl) => {
        return !wtfStringImpl.isNull() ? wtfStringImpl.idx(1).as("char", /*disregardSize*/true).string(wtfStringImpl.f("length_")) : "";
    });

    DbgObject.AddArrayField(
        (type) => {
            return type.name().match(/^WTF::HashTable<(.*)>$/) != null;
        },
        "Pairs",
        (type) => {
            return type.templateParameters()[1];
        },
        UserEditableFunctions.Create((hashTable) => {
            return hashTable.f("table_").array(hashTable.f("table_size_"));
        })
    );

    DbgObject.AddTypeDescription(
        (type) => (type.name().match(/^WTF::KeyValuePair<.*>$/) != null),
        "Pair",
        true,
        UserEditableFunctions.Create((pair) => {
            return Promise.all([pair.f("key").desc(), pair.f("value").desc()])
            .thenAll((first, second) => `{${first}, ${second}}`);
        })
    );
});