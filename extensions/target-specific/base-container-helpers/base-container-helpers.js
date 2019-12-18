//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

DbgObject.AddArrayField(
    (type) => {
        return type.name().match(/^base::span<(.*)>$/) != null;
    },
    "Elements",
    (type) => {
        return type.templateParameters()[0];
    },
    UserEditableFunctions.Create((span) => {
        return span.f("data_").array(span.f("size_"));
    })
);
