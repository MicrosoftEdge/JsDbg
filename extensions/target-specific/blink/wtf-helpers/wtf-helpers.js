"use strict";

Loader.OnLoad(function() {
    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "WTF::AtomicString"), "Text", false, (wtfAtomicString) => {
        return wtfAtomicString.f("string_").desc("Text");
    });

    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "WTF::AtomicString"), "TextLength", false, (wtfAtomicString) => {
        return wtfAtomicString.f("string_").desc("TextLength");
    });

    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "WTF::String"), "Text", false, (wtfString) => {
        return wtfString.f("impl_").f("ptr_").desc("Text");
    });

    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "WTF::String"), "TextLength", false, (wtfString) => {
        return wtfString.f("impl_").f("ptr_").then((wtfStringImpl) => !wtfStringImpl.isNull() ? wtfStringImpl.f("length_").val() : 0);
    });

    DbgObject.AddTypeDescription(Blink.ChildProcessType("blink_core", "WTF::StringImpl"), "Text", false, (wtfStringImpl) => {
        return !wtfStringImpl.isNull() ? wtfStringImpl.idx(1).as("char", /*disregardSize*/true).string(wtfStringImpl.f("length_")) : "";
    });
});