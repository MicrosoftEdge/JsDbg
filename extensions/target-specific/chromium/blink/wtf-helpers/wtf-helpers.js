//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

Loader.OnLoad(function() {
    DbgObject.AddTypeDescription(Chromium.RendererProcessType("WTF::AtomicString"), "Text", true, UserEditableFunctions.Create((wtfAtomicString) => wtfAtomicString.f("string_").desc("Text")));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("WTF::AtomicString"), "TextLength", false, UserEditableFunctions.Create((wtfAtomicString) => wtfAtomicString.f("string_").desc("TextLength")));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("WTF::String"), "Text", true, UserEditableFunctions.Create((wtfString) => wtfString.f("impl_").f("ptr_").desc("Text")));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("WTF::String"), "TextLength", false, UserEditableFunctions.Create((wtfString) => {
        return wtfString.f("impl_").f("ptr_")
        .then((wtfStringImpl) => !wtfStringImpl.isNull() ? wtfStringImpl.f("length_").val() : 0);
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("WTF::StringImpl"), "Text", true, UserEditableFunctions.Create((wtfStringImpl) => {
        if (!wtfStringImpl.isNull()) {
            return wtfStringImpl.desc("is_8bit_")
            .then((is8bit) => wtfStringImpl.idx(1).as(is8bit ? "LChar" : "UChar", /*disregardSize*/true))
            .then((firstChar) => firstChar.string(wtfStringImpl.f("length_")));
        } else {
            return "";
        }
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("WTF::StringImpl"), "TextLength", false, UserEditableFunctions.Create((wtfStringImpl) => {
        return !wtfStringImpl.isNull() ? wtfStringImpl.f("length_") : 0;
    }));

    DbgObject.AddTypeDescription(Chromium.RendererProcessType("WTF::StringImpl"), "is_8bit_", false, UserEditableFunctions.Create((wtfStringImpl) => {
        return wtfStringImpl.f("is_8bit_")
        .then((is8Bit) => is8Bit.val(), () => {
            return wtfStringImpl.f("hash_and_flags_").F("Object").val()
            .then((is8BitValue) => is8BitValue & (1 << 0));
        })
    }));

    DbgObject.AddArrayField(
        (type) => {
            return type.name().match(/^WTF::Vector<(.*)>$/) != null;
        },
        "Elements",
        (type) => {
            return type.templateParameters()[0];
        },
        UserEditableFunctions.Create((vector) => {
            return vector.f("buffer_").array(vector.f("size_"));
        })
    );

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