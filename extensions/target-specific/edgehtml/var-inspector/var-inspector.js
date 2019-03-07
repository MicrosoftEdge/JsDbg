//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var VarInspector = undefined;
Loader.OnLoad(function() {
    VarInspector = {
        Tree: new DbgObjectTree.DbgObjectTreeReader(),
        Renderer: new DbgObjectTree.DbgObjectRenderer(),
        InterpretAddress: function(address) {
            var voidObject = DbgObject.create("edgehtml!void", address);
            if (!voidObject.isNull()) {
                return voidObject.F("Var")
                .then((recyclableObject) => {
                    if (!recyclableObject.isNull()) {
                        return {
                            toString : () => {
                                return recyclableObject.desc("Var description");
                            },
                            ptr : () => {
                                return address;
                            },
                            getChildren : () => {
                                return recyclableObject.F("Custom External Object")
                                .then((customExternalObject) => {
                                    if (!customExternalObject.isNull()) {
                                        return Promise.all([customExternalObject.f("type").f("typeId").val(), customExternalObject.f("type").f("typeId").desc("Name")])
                                        .thenAll((typeId, typeIdName) => {
                                            return MSHTML.IsCBaseOrSimilarType(typeId)
                                            .then((isCBaseOrSimilarType) => {
                                                if (isCBaseOrSimilarType) {
                                                    return Promise.all([customExternalObject.F("VarExtensionBase"), customExternalObject.F("VarExtensionBase").F("Base")])
                                                    .thenAll((varExtensionBase, cbase) => {
                                                        if (!cbase.isNull()) {
                                                            return MSHTML.IsCBaseGCNative(cbase)
                                                            .then((isCBaseGCNative) => {
                                                                if (isCBaseGCNative) {
                                                                    return Promise.all([customExternalObject, varExtensionBase.F("GCVarExtension")]);
                                                                } else {
                                                                    return Promise.all([customExternalObject, varExtensionBase.F("VarExtension")]);
                                                                }
                                                            })
                                                        } else {
                                                            if ((typeIdName == "JSIntegration::JSTypeID_RootList")) {
                                                                return Promise.all([customExternalObject, varExtensionBase.F("VarExtension")]);
                                                            } else {
                                                                return Promise.all([voidObject.vcast()]);
                                                            }
                                                        }
                                                    });
                                                } else {
                                                    if ((typeIdName == "JSIntegration::JSTypeID_DispatchMethod") || (typeIdName == "JSIntegration::JSTypeID_ExternalMethod")) {
                                                        return Promise.all([customExternalObject, customExternalObject.F("DispatchMethodInfo")]);
                                                    } else if (typeIdName == "JSIntegration::JSTypeID_CustomVar") {
                                                        return Promise.all([customExternalObject, customExternalObject.F("CustomVar")]);
                                                    } else if (typeIdName == "JSIntegration::JSTypeID_FunctionWrapper") {
                                                        return Promise.all([customExternalObject, customExternalObject.F("FunctionWrapper")]);
                                                    } else if (typeIdName == "JSIntegration::JSTypeID_MirrorContext") {
                                                        return Promise.all([customExternalObject, customExternalObject.F("MirrorContext")]);
                                                    } else if (typeIdName == "JSIntegration::JSTypeID_MirrorFunction") {
                                                        return Promise.all([customExternalObject, customExternalObject.F("MirrorFunction")]);
                                                    } else {
                                                        return [customExternalObject];
                                                    }
                                                }
                                            });
                                        });
                                    } else {
                                        return Promise.all([voidObject.vcast()]);
                                    }
                                });
                            }
                        };
                    } else {
                        return voidObject.vcast();
                    }
                });
            } else {
                return DbgObject.NULL;
            }
        },
        GetRoots: () => { return Promise.resolve([]); },
        DefaultTypes: [],
    };

    VarInspector.Tree.addChildren(DbgObjectType("edgehtml!VarExtension"), (varExtension) => {
        return Promise.all([
            {
                toString : () => {
                    return "Subobject relationships (two-way references)";
                },
                getChildren : () => {
                    return getSubobjectRelationshipsFromVarExtension(varExtension);
                }
            },
            {
                toString : () => {
                    return "References (one-way references)";
                },
                getChildren : () => {
                    return varExtension.array("References");
                }
            },
            {
                toString : () => {
                    return "Private slots";
                },
                getChildren : () => {
                    return varExtension.array("Private slots");
                }
            }
        ]);
    });

    
    function getSubobjectRelationshipsFromVarExtension(varExtension) {
        return [{
            toString : () => {
                return "Subobjects";
            },
            getChildren : () => {
                return varExtension.array("Subobjects");
            }
        },
        {
            toString : () => {
                return "Parent";
            },
            getChildren : () => {
                return varExtension.F("Subobject Parent").array(1);
            }
        }];
    }

    VarInspector.Tree.addChildren(DbgObjectType("edgehtml!GCVarExtension"), (gcVarExtension) => {
        return Promise.all([
            {
                toString : () => {
                    return "Instance slots";
                },
                getChildren : () => {
                    return gcVarExtension.array("Instance slots");
                }
            }
        ]);
    });

    VarInspector.Tree.addChildren(DbgObjectType("edgehtml!VarArray"), (varArray) => {
        return Promise.all([
            {
                toString : () => {
                    return "Vars";
                },
                getChildren : () => {
                    return varArray.array("Vars");
                }
            }
        ]);
    });


    DbgObject.AddAction(DbgObjectType("chakra!Js::RecyclableObject"), "VarInspector", (recyclableObject) => {
        return TreeInspector.GetActions("varinspector", "Var Inspector", recyclableObject);
    });

});