//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

Loader.OnLoad(function() {
    var panel = document.createElement("div");

    var currentPromise = Promise.resolve(null);
    function serialize(f) {
        var result = currentPromise.then(function () { return f(); });
        currentPromise = result.catch(function() { });
        return result;
    }

    function renderDbgObject(object, renderer) {
        return Promise.all([renderer.createRepresentation(object, null, [], true), object.actions()])
        .thenAll(function (container, actions) {
            actions.forEach(function (action) { 
                if (typeof action.action == "string") {
                    var link = document.createElement("a");
                    link.className = "action-button";
                    link.href = action.action;
                    if (typeof action.target == "string") {
                        link.target = action.target;
                    }
                    link.textContent = action.description;
                    container.appendChild(link);
                    container.appendChild(document.createTextNode(" "));
                }
            })
            return container;
        })
    }

    function createObjectContainer(name, elements) {
        var container = document.createElement("div");
        if (name != null) {
            var title = document.createElement("h2");
            title.textContent = name;
            container.appendChild(title);
        }

        var registeredObjectContainer = document.createElement("div");
        elements.forEach(function(e) {
            e.classList.add("local");
            registeredObjectContainer.appendChild(e);
        });

        container.appendChild(registeredObjectContainer);
        return container;
    }

    function renderCallStack() {
        // Get the local variables.
        return CallStack.GetStackFrames(10)
        .then(function (stackFrames) {
            // Dereference all the locals.
            return Promise.map(stackFrames, function (frame) {
                function deref(dbgObject) {
                    if (dbgObject.type.isPointer()) {
                        return dbgObject.deref().then(deref).catch(function() { return dbgObject; })
                    } else {
                        return Promise.resolve(dbgObject);
                    }
                }

                var keysAndValues = [];
                frame.locals.forEach(function (value, key) {
                    keysAndValues.push([key, value]);
                });


                return Promise.map(keysAndValues, function (keyAndValue) {
                    return deref(keyAndValue[1])
                    .then(function (dereferenced) {
                        return [keyAndValue[0], dereferenced];
                    })
                })
                .then(function (newLocals) {
                    var newLocalMap = newLocals.reduce(function (accumulator, keyAndValue) {
                        accumulator.set(keyAndValue[0], keyAndValue[1]);
                        return accumulator;
                    }, new Map());

                    frame.locals = newLocalMap;
                    return frame;
                })
            })
        })
        .then(function (stackFrames) {
            return Promise.map(stackFrames, function (frame) {
                var renderings = [];
                frame.locals.forEach(function (value, key) {
                    var renderer = new DbgObjectTree.DbgObjectRenderer();
                    renderer.addNameRenderer(
                        value.module,
                        function() { return true; },
                        function (object) {
                            return key;
                        }
                    );

                    renderings.push(renderDbgObject(value, renderer).catch(function () { return null; }));
                })

                return Promise.all(renderings)
                .then(function (renderings) {
                    renderings = renderings.filter(function(e) { return e != null; });
                    if (renderings.length > 0) {
                        var stackContainer = createObjectContainer(frame.module + "!" + frame.method + "+0x" + frame.offset.toString(16), renderings);
                        stackContainer.classList.add("stack-frame");
                        return stackContainer;
                    }
                })
            })
        })
        .then(function (stackContainers) {
            var header = document.createElement("h1");
            panel.innerHTML = "";
            header.textContent = "Local Variables";
            panel.appendChild(header);
            stackContainers.forEach(function (e) {
                if (e) {
                    panel.appendChild(e);
                }
            })
        })
    }

    Loader.OnPageReady(function() {
        serialize(renderCallStack)
        .finally(function() {
            JsDbg.RegisterOnBreakListener(function () {
                serialize(renderCallStack);
            });
        })
    });

    panel.className = "callstack-dashboard";
    Dashboard.AddPanel(panel, 10);
})