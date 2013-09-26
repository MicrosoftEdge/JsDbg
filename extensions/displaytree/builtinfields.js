"use strict";

// user.js
// Peter Salas
//
// Visualizations that can be applied on top of the display tree.  Visualizations can provide an
// "html" function and a "shortname" which will add innerHTML to each tree node.

// These are the built-in fields/visualizations -- it can be extended live using the UI.

var DisplayTreeBuiltInFields = [
    {
        type: "CDispNode",
        fullname: "Bounds",
        shortname: "b",
        html: function() {
            var rect = this.f("_rctBounds");
            return ["left", "top", "right", "bottom"].map(function(f) { return rect.f(f).val(); }).join(" ");
        }
    },
    {
        type: "CDispNode",
        fullname: "Client",
        shortname: "c",
        html: function() {
            return this.f("_pDispClient").ptr();
        }
    },
    {
        type: "CDispNode",
        fullname: "Client Type",
        shortname: "ct",
        html: function() {
            return this.f("_pDispClient").vtable();
        }
    },
];
