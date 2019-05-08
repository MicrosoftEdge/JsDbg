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

        DbgObject.AddExtendedField(
            (type) => type.name().match(/^base::NoDestructor<.*>/),
            "Object",
            (type) => DbgObjectType(type.templateParameters()[0], type),
            (noDestructor) => noDestructor.f("storage_").as(noDestructor.type.templateParameters()[0])
        );

        Chromium = {
            _help : {
                name: "Chromium",
                description: "Chromium-specific functionality."
            },

            RendererProcessName: "renderer",
            BrowserProcessName: "browser",
            GpuProcessName: "gpu",

            _help_SetTargetProcess: {
                description: "Sets the name of Chromium process being debugged.",
                arguments: [
                    {name:"processName", type:"string", description: "The process name."},
                ]
            },
            SetTargetProcess: setTargetProcess,

            RendererProcessSyntheticModuleName: "renderer-module",
            BrowserProcessSyntheticModuleName: "browser-module",
            GpuProcessSyntheticModuleName: "gpu-module",

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

            _help_GpuProcessType: {
                description: "Creates a DbgObjectType in the Chromium gpu process.",
                arguments: [
                    {name:"typeName", type:"string", description: "The type name."}
                ]
            },
            GpuProcessType: (typeName) => DbgObjectType(Chromium.GpuProcessSyntheticModuleName, typeName),

            _help_RendererProcessEquivalentModules: {
                description: "List of modules used in the Chromium renderer process.",
            },
            RendererProcessEquivalentModules: ["blink_core", "blink_common", "blink_platform", "blink_modules", "blink_android_mojo_bindings_shared",
                "blink_embedded_frame_sink_mojo_bindings_shared", "blink_core_mojo_bindings_shared", "blink_controller", "cc", "cc_animation", "cc_paint",
                "cc_base", "cc_debug", "cc_mojo_embedder"],

            _help_BrowserProcessEquivalentModules: {
                description: "List of modules used in the Chromium browser process.",
            },
            BrowserProcessEquivalentModules: ["msedge", "accessibility", "chrome"],

            _help_GpuProcessEquivalentModules: {
                description: "List of modules used in the Chromium gpu process.",
            },
            GpuProcessEquivalentModules: ["service", "viz_common"],

            _help_MultiProcessModules: {
                description: "List of modules used in multiple Chromium processes.",
            },
            MultiProcessModules: ["msedge_child", "chrome_child", "content", "content_shell", "browser_tests", "content_browsertests"],
        };

        function setTargetProcess(targetProcessName) {
            // Set equivalency for multi process modules based on target process.
            if (currentTargetProcessName != targetProcessName) {
                if (currentTargetProcessName) {
                    if (currentTargetProcessName == Chromium.BrowserProcessName) {
                        SyntheticModules.RemoveEquivalentModules(Chromium.BrowserProcessSyntheticModuleName, ...Chromium.MultiProcessModules);
                    } else if (currentTargetProcessName == Chromium.RendererProcessName) {
                        SyntheticModules.RemoveEquivalentModules(Chromium.RendererProcessSyntheticModuleName, ...Chromium.MultiProcessModules);
                    } else if (currentTargetProcessName == Chromium.GpuProcessName) {
                        SyntheticModules.RemoveEquivalentModules(Chromium.GpuProcessSyntheticModuleName, ...Chromium.MultiProcessModules);
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
                    } else if (currentTargetProcessName == Chromium.GpuProcessName) {
                        SyntheticModules.AddEquivalentModules(Chromium.GpuProcessSyntheticModuleName, ...Chromium.MultiProcessModules);
                    } else {
                        console.assert(false);
                    }
                }
            }
        }

        SyntheticModules.RegisterSyntheticName(Chromium.RendererProcessSyntheticModuleName, ...Chromium.RendererProcessEquivalentModules);
        SyntheticModules.RegisterSyntheticName(Chromium.BrowserProcessSyntheticModuleName, ...Chromium.BrowserProcessEquivalentModules);
        SyntheticModules.RegisterSyntheticName(Chromium.GpuProcessSyntheticModuleName, ...Chromium.GpuProcessEquivalentModules);

        Help.Register(Chromium);
    });
})();