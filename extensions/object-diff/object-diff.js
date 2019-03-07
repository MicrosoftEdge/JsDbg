//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var ObjectDiff = undefined;
Loader.OnLoad(function () {
    var currentObjectToDiff = null;
    DbgObject.AddAction(function() { return true; }, "ObjectDiff", function (dbgObject) {
        if (currentObjectToDiff == null) {
            return {
                description: "Diff...",
                action: function () {
                    currentObjectToDiff = dbgObject;
                }
            }
        } else {
            return Promise.all([currentObjectToDiff.baseTypes(), dbgObject.baseTypes()])
            .thenAll(function (currentObjectBaseTypes, dbgObjectBaseTypes) {
                currentObjectBaseTypes.unshift(currentObjectToDiff);
                dbgObjectBaseTypes.unshift(dbgObject);

                var results = [];

                // Find a common type.
                for (var i = 0; i < currentObjectBaseTypes.length && results.length == 0; ++i) {
                    for (var j = 0; j < dbgObjectBaseTypes.length; ++j) {
                        if (currentObjectBaseTypes[i].type.equals(dbgObjectBaseTypes[j].type) && currentObjectBaseTypes[i].equals(currentObjectToDiff) && dbgObjectBaseTypes[j].equals(dbgObject)) {
                            results.push({
                                description: "Diff with " + currentObjectBaseTypes[i].type.htmlName() + " " + currentObjectToDiff.ptr(),
                                action: "/objectdiff/?type=" + currentObjectBaseTypes[i].type + "&address1=" + currentObjectBaseTypes[i].ptr() + "&address2=" + dbgObjectBaseTypes[j].ptr(),
                                target: "objectdiff-" + currentObjectToDiff.ptr()
                            });
                            break;
                        }
                    }
                }

                results.push({
                    description: "Diff...",
                    action: function() {
                        currentObjectToDiff = dbgObject;
                    }
                });

                return results;
            })
        }
    })

    function getDifferentFields(object1, object2, expansion) {
        if (object1.type.name() != object2.type.name()) {
            throw new Error("Objects passed to GetDifferentFields must be the same type.");
        }

        if (expansion === undefined) {
            expansion = function(field, object1, object2) { return [field.name]; };
        }

        var typeSize = object1.size();
        var fields = object1.fields();

        return Promise.all([fields, object1.as("unsigned char", true).vals(typeSize), object2.as("unsigned char", true).vals(typeSize)])
        .thenAll(function (fields, object1Bytes, object2Bytes) {
            // Get the bytes that are different.
            var differentBytes = {};
            for (var i = 0; i < object1Bytes.length; ++i) {
                if (object1Bytes[i] != object2Bytes[i]) {
                    differentBytes[i] = true;
                }
            }

            // Get the fields that are different.
            var differentFields = [];
            fields.forEach(function (field, fieldIndex) {
                // Iterate over the bytes that the field covers to see it's covered.
                for (var byte = 0; byte < field.size; ++byte) {
                    if (differentBytes[field.offset + byte]) {
                        differentFields.push(fieldIndex);
                        break;
                    }
                }
            });

            // Return the field names.
            return Promise.map(
                Promise.filter(differentFields, function (fieldIndex) {
                    var field = fields[fieldIndex];
                    if (field.value.bitcount > 0) {
                        // For fields with bitcounts, compare the actual values.
                        return Promise.all([object1.field(field.name).val(), object2.field(field.name).val()])
                        .thenAll(function (object1FieldValue, object2FieldValue) {
                            return object1FieldValue != object2FieldValue;
                        })
                    } else {
                        return true;
                    }
                }),
                function (fieldIndex) {
                    // Allow the caller to expand the fields if desired.
                    return expansion(fields[fieldIndex], object1, object2);
                }
            );
        })
        .then(function (nestedResults) {
            // Flatten the nested results.
            var results = [];
            function flatten(array) {
                array.forEach(function (item) {
                    if (Array.isArray(item)) {
                        flatten(item);
                    } else {
                        results.push(item);
                    }
                })
            }
            flatten(nestedResults);
            return results;
        })
    }

    ObjectDiff = {
        GetDifferentFields: getDifferentFields
    };
})