//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var About = undefined;
Loader.OnLoad(function() {
    var allSections = [];

    About = {
        AddSection: function (node) {
            if (typeof(node) == typeof("")) {
                var wrapper = document.createElement("div");
                wrapper.innerHTML = node;
                node = wrapper;
            }

            allSections.push(node);
        },

        GetAllSections: function() {
            return allSections;
        }
    }

    About.AddSection("<a href=\"https://github.com/voodootikigod/logo.js\">logo.js</a> \
 \
<p>The MIT License (MIT) \
 \
<p>Copyright (c) 2011 Christopher Williams &lt;chris@iterativedesigns.com&gt; \
 \                     Manuel Strehl &lt;boldewyn@gmail.com&gt; \
 \
<p>Permission is hereby granted, free of charge, to any person obtaining a copy \
of this software and associated documentation files (the \"Software\"), to deal \
in the Software without restriction, including without limitation the rights \
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell \
copies of the Software, and to permit persons to whom the Software is \
furnished to do so, subject to the following conditions: \
\
<p>The above copyright notice and this permission notice shall be included in \
all copies or substantial portions of the Software. \
\
<p>THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR \
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, \
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE \
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER \
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, \
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN \
THE SOFTWARE.");
})