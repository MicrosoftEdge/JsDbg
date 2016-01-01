"use strict";

// dbgobject.js
// This only contains the minimal functionality that depends on all of the DbgObject components,
// most of the DbgObject implementation is in dbgobject-core.js.
var PromisedDbgObject = undefined;
JsDbg.OnLoad(function() {
    PromisedDbgObject = Promise.CreatePromisedType(DbgObject);
    PromisedDbgObject.IncludePromisedMethod("f", PromisedDbgObject);
    PromisedDbgObject.IncludePromisedMethod("F", PromisedDbgObject);
    PromisedDbgObject.IncludePromisedMethod("as", PromisedDbgObject); 
    PromisedDbgObject.IncludePromisedMethod("deref", PromisedDbgObject); 
    PromisedDbgObject.IncludePromisedMethod("idx", PromisedDbgObject); 
    PromisedDbgObject.IncludePromisedMethod("unembed", PromisedDbgObject); 
    PromisedDbgObject.IncludePromisedMethod("vcast", PromisedDbgObject);
    PromisedDbgObject.IncludePromisedMethod("dcast", PromisedDbgObject);
    PromisedDbgObject.IncludePromisedMethod("list", PromisedDbgObject.Array);
    PromisedDbgObject.IncludePromisedMethod("array", PromisedDbgObject.Array);
    PromisedDbgObject.IncludePromisedMethod("baseTypes", PromisedDbgObject.Array);
});
