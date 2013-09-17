"use strict";

// user.js
// Peter Salas
//
// Visualizations that can be applied on top of the box tree.  Visualizations can provide an
// "html" function and a "shortname" which will add innerHTML to each tree node, or they can
// directly manipulate the node element by providing an "element" function.

// These are the built-in fields/visualizations -- it can be extended live using the UI.

var MarkupTreeBuiltInFields = [
    {
        type: "CTreeNode",
        fullname: "CTreeNode._iFF",
        shortname: "_iFF",
        enabled: true,
        html: function() {
            var validityString = "";
            if (this.f("_fIFFValid").val() != "1")
            {
                validityString = " _fIFFValid:0"
            }
            return this.f("_iFF").val() + validityString;
        }
    },
    {
        type: "CTreeNode",
        fullname: "CTreeNode._iCF",
        shortname: "_iCF",
        enabled: true,
        html: function() {
            var validityString = "";
            if (this.f("_fIPCFValid").val() != "1")
            {
                validityString = " _fIPCFValid:0"
            }
            return this.f("_iCF").val() + validityString;
        }
    },
    {
        type: "CTreeNode",
        fullname: "CTreeNode._iPF",
        shortname: "_iPF",
        enabled: true,
        html: function() {
            var validityString = "";
            if (this.f("_fIPCFValid").val() != "1")
            {
                validityString = " _fIPCFValid:0"
            }
            return this.f("_iPF").val() + validityString;
        }
    },
    {
        type: "CTreeNode",
        fullname: "CTreeNode._iSF",
        shortname: "_iSF",
        html: function() {
            var validityString = "";
            if (this.f("_fISFValid").val() != "1")
            {
                validityString = " _fISFValid:0"
            }
            return this.f("_iSF").val() + validityString;
        }
    }
];
