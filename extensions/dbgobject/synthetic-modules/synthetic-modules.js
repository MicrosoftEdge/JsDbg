//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

var SyntheticModules = undefined;
Loader.OnLoad(function() {
    SyntheticModules = {
        RegisterSyntheticName: registerSyntheticName,
        AddEquivalentModules: addEquivalentModules,
        RemoveEquivalentModules: removeEquivalentModules,
        EquivalentModuleNames: equivalentModuleNames,
        ModuleOrSyntheticName: moduleOrSyntheticName,
        ModuleLookupSuccessCallback: moduleLookupSuccessCallback
    }

    function registerSyntheticName(syntheticName, ...equivalentModuleNames) {
        syntheticNameToEquivalentModuleNames[syntheticName] = equivalentModuleNames;
        equivalentModuleNames.forEach((moduleName) => {
            moduleNameToSyntheticName[moduleName] = syntheticName;
        });
    }

    function addEquivalentModules(syntheticName, ...equivalentModulesToAdd) {
        if (isSyntheticName(syntheticName)) {
            syntheticNameToEquivalentModuleNames[syntheticName].unshift(...equivalentModulesToAdd);
            equivalentModulesToAdd.forEach((moduleName) => {
                moduleNameToSyntheticName[moduleName] = syntheticName;
            });
        } else {
            registerSyntheticName(syntheticName, equivalentModuleNames);
        }
    }

    function removeEquivalentModules(syntheticName, ...equivalentModulesToRemove) {
        console.assert(isSyntheticName(syntheticName));
        var equivalentModuleNames = syntheticNameToEquivalentModuleNames[syntheticName];
        equivalentModulesToRemove.forEach((moduleName) => {
            var moduleNameIndex = equivalentModuleNames.indexOf(moduleName);
            if (moduleNameIndex != -1) {
                equivalentModuleNames.splice(moduleNameIndex, 1);
                delete moduleNameToSyntheticName[moduleName];
            }
        });
        if (equivalentModuleNames.length == 0) {
            delete syntheticNameToEquivalentModuleNames[syntheticName];
        }
    }

    function isSyntheticName(name) {
        return Object.keys(syntheticNameToEquivalentModuleNames).includes(name);
    }

    function equivalentModuleNames(moduleName) {
        if (isSyntheticName(moduleName)) {
            return syntheticNameToEquivalentModuleNames[moduleName];
        }
        return [moduleName];
    }

    function hasSyntheticName(moduleName) {
        return moduleName in moduleNameToSyntheticName;
    }

    function moduleOrSyntheticName(moduleName) {
        if (hasSyntheticName(moduleName)) {
            return moduleNameToSyntheticName[moduleName];
        }
        return moduleName;
    }

    function moduleLookupSuccessCallback(moduleName) {
        if (hasSyntheticName(moduleName)) {
            var syntheticName = moduleOrSyntheticName(moduleName);
            var equivalentModuleNames = syntheticNameToEquivalentModuleNames[syntheticName];
            if (equivalentModuleNames[0] != moduleName) {
                // Perf optimization: Move the last successful module name to the front of the array so that it is accessed first for the next lookup.
                equivalentModuleNames = equivalentModuleNames.filter((equalivalentModuleName) => (equalivalentModuleName != moduleName));
                equivalentModuleNames.unshift(moduleName);
                syntheticNameToEquivalentModuleNames[syntheticName] = equivalentModuleNames;
            }
        }
    }

    var syntheticNameToEquivalentModuleNames = {};
    var moduleNameToSyntheticName = {};
});