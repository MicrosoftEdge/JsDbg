//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var ObjectDashboard = undefined;;
Loader.OnLoad(function() {
    var panel = document.createElement("div");
    var objectGetters = [];

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

    var currentPromise = Promise.resolve(null);
    function serialize(f) {
        var result = currentPromise.then(function () { return f(); });
        currentPromise = result.catch(function() { });
        return result;
    }

    function renderObjects() {
        var registeredObjects = [];
        return Promise.map(objectGetters, function (getter) {
            return getter(function (object, renderer) {
                registeredObjects.push({ object: object, renderer: renderer });
            })
            .catch(function() { })
        })
        .then(function () {
            return Promise.map(registeredObjects, function (registration) { return renderDbgObject(registration.object, registration.renderer); })
            .then(function (renderedObjects) {
                panel.innerHTML = "";
                renderedObjects.forEach(function(rendering) {
                    rendering.classList.add("dashboard-object");
                    rendering.classList.add("dashboard-panel");
                    panel.appendChild(rendering);
                })
            })
        })
    }

    var onPageReadyPromise = new Promise(function (onSuccess) { Loader.OnPageReady(onSuccess); });
    serialize(function () {
        return onPageReadyPromise;
    })

    var panelPromise = serialize(renderObjects)
    .finally(function() {
        JsDbg.RegisterOnBreakListener(function () {
            serialize(renderObjects);
        });
    })
    .then(function () {
        return panel;
    })

    panel.className = "dashboard-object-container";
    Dashboard.AddPanel(panelPromise, 0);
    
    ObjectDashboard = {
        AddGetter: function (getter) {
            objectGetters.push(getter);
        }
    }
})