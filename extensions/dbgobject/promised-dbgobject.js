//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// dbgobject.js
// This only contains the minimal functionality that depends on all of the DbgObject components,
// most of the DbgObject implementation is in dbgobject-core.js.
var PromisedDbgObject = undefined;
Loader.OnLoad(function() {
    PromisedDbgObject = Promise.CreatePromisedType(DbgObject);
    PromisedDbgObject.IncludePromisedMethod("f", PromisedDbgObject, /*methodReturnsPromise*/true);
    PromisedDbgObject.IncludePromisedMethod("field", PromisedDbgObject, /*methodReturnsPromise*/true);
    PromisedDbgObject.IncludePromisedMethod("F", PromisedDbgObject, /*methodReturnsPromise*/true);
    PromisedDbgObject.IncludePromisedMethod("as", PromisedDbgObject, /*methodReturnsPromise*/false); 
    PromisedDbgObject.IncludePromisedMethod("deref", PromisedDbgObject, /*methodReturnsPromise*/true); 
    PromisedDbgObject.IncludePromisedMethod("idx", PromisedDbgObject, /*methodReturnsPromise*/true); 
    PromisedDbgObject.IncludePromisedMethod("unembed", PromisedDbgObject, /*methodReturnsPromise*/true); 
    PromisedDbgObject.IncludePromisedMethod("vcast", PromisedDbgObject, /*methodReturnsPromise*/true);
    PromisedDbgObject.IncludePromisedMethod("dcast", PromisedDbgObject, /*methodReturnsPromise*/true);
    PromisedDbgObject.IncludePromisedMethod("list", PromisedDbgObject.Array, /*methodReturnsPromise*/true);
    PromisedDbgObject.IncludePromisedMethod("array", PromisedDbgObject.Array, /*methodReturnsPromise*/true);
    PromisedDbgObject.IncludePromisedMethod("baseTypes", PromisedDbgObject.Array, /*methodReturnsPromise*/true);
});
