//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

var Chromium = null;
(function() {
    // TODO: query the debugger to figure this out
    var currentTargetProcessName = undefined;

    Loader.OnLoad(function() {
        DbgObject.AddExtendedField(
            (type) => type.name().match(/^base::LazyInstance<.*>/),
            "Object",
            (type) => DbgObjectType(type.templateParameters()[0], type),
            (lazyInstance) => lazyInstance.f("private_instance_").as(lazyInstance.type.templateParameters()[0] + "*").deref()
        );

        Chromium = {
            _help : {
                name: "Chromium",
                description: "Chromium-specific functionality."
            },

            RendererProcessName: "renderer",
            BrowserProcessName: "browser",

            _help_SetTargetProcess: {
                description: "Sets the name of Chromium process being debugged.",
                arguments: [
                    {name:"processName", type:"string", description: "The process name."},
                ]
            },
            SetTargetProcess: setTargetProcess,

            RendererProcessSyntheticModuleName: "renderer-module",
            BrowserProcessSyntheticModuleName: "browser-module",

            _help_RendererProcessType: {
                description: "Creates a DbgObjectType in the Chromium renderer process.",
                arguments: [
                    {name:"typeName", type:"string", description: "The type name."}
                ]
            },
            RendererProcessType: (typeName) => DbgObjectType(Chromium.RendererProcessSyntheticModuleName, typeName),

            _help_BrowserProcessType: {
                description: "Creates a DbgObjectType in the Chromium browser process.",
                arguments: [
                    {name:"typeName", type:"string", description: "The type name."}
                ]
            },
            BrowserProcessType: (typeName) => DbgObjectType(Chromium.BrowserProcessSyntheticModuleName, typeName),

            _help_RendererProcessEquivalentModules: {
                description: "List of modules used in the Chromium renderer process.",
            },
            RendererProcessEquivalentModules: ["msedge_child", "blink_core", "blink_common", "blink_platform", "blink_modules", "blink_android_mojo_bindings_shared",
                "blink_embedded_frame_sink_mojo_bindings_shared", "blink_core_mojo_bindings_shared", "blink_controller", "cc", "cc_animation", "cc_paint",
                "cc_base", "cc_debug", "cc_mojo_embedder", "chrome_child"],

            _help_BrowserProcessEquivalentModules: {
                description: "List of modules used in the Chromium browser process.",
            },
            BrowserProcessEquivalentModules: ["msedge", "accessibility", "chrome"],

            _help_MultiProcessModules: {
                description: "List of modules used in multiple Chromium processes.",
            },
            MultiProcessModules: ["content", "content_shell", "browser_tests"],
        };

        function setTargetProcess(targetProcessName) {
            // Set equivalency for multi process modules based on target process.
            if (currentTargetProcessName != targetProcessName) {
                if (currentTargetProcessName) {
                    if (currentTargetProcessName == Chromium.BrowserProcessName) {
                        SyntheticModules.RemoveEquivalentModules(Chromium.BrowserProcessSyntheticModuleName, ...Chromium.MultiProcessModules);
                    } else if (currentTargetProcessName == Chromium.RendererProcessName) {
                        SyntheticModules.RemoveEquivalentModules(Chromium.RendererProcessSyntheticModuleName, ...Chromium.MultiProcessModules);
                    } else {
                        console.assert(false);
                    }
                }
    
                currentTargetProcessName = targetProcessName;
    
                if (currentTargetProcessName) {
                    if (currentTargetProcessName == Chromium.BrowserProcessName) {
                        SyntheticModules.AddEquivalentModules(Chromium.BrowserProcessSyntheticModuleName, ...Chromium.MultiProcessModules);
                    } else if (currentTargetProcessName == Chromium.RendererProcessName) {
                        SyntheticModules.AddEquivalentModules(Chromium.RendererProcessSyntheticModuleName, ...Chromium.MultiProcessModules);
                    } else {
                        console.assert(false);
                    }
                }
            }
        }

        SyntheticModules.RegisterSyntheticName(Chromium.RendererProcessSyntheticModuleName, ...Chromium.RendererProcessEquivalentModules);
        SyntheticModules.RegisterSyntheticName(Chromium.BrowserProcessSyntheticModuleName, ...Chromium.BrowserProcessEquivalentModules);

        Help.Register(Chromium);
    });
})();