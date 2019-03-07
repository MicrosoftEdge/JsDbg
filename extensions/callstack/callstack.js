//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var CallStack = undefined;
Loader.OnLoad(function() {
    var JsDbgPromise = Promise.promisify(JsDbg, function (result) {
        if (result.error) {
            return Promise.reject(result.error);
        } else {
            return result;
        }
    });

    CallStack = {
        GetStackFrames: function (count) {
            return JsDbgPromise.GetCallStack(count)
            .then(function (stackFrames) {
                return Promise.all(
                    [
                        Promise.map(stackFrames, function (frame) {
                            return JsDbgPromise.LookupSymbolName(frame.instructionAddress)
                            .catch(function (error) {
                                return null;
                            })
                        }),
                        Promise.map(stackFrames, function (frame) {
                            return JsDbgPromise.LookupLocalsInStackFrame(frame.instructionAddress, frame.stackAddress, frame.frameAddress)
                        })
                    ]
                )
                .thenAll(function (frameNames, locals) {
                    return frameNames.map(function (frame, i) {
                        return {
                            module: DbgObject.NormalizeModule(frame.module),
                            method: frame.name,
                            offset: frame.displacement,
                            instructionAddress: stackFrames[i].instructionAddress,
                            stackAddress: stackFrames[i].stackAddress,
                            frameAddress: stackFrames[i].frameAddress,
                            locals: locals[i].reduce(
                                function (accumulator, item) {
                                    accumulator.set(item.name, DbgObject.create(DbgObjectType(item.module, item.type), item.address));
                                    return accumulator
                                },
                                new Map()
                            )
                        };
                    })
                })
            })
        }
    }
})