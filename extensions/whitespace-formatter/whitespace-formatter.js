//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

var WhitespaceFormatter = undefined;
Loader.OnLoad(function() {
    WhitespaceFormatter = {
        CreateFormattedText: createFormattedText
    }

    function createFormattedText(text) {
        var span = document.createElement("span");
        span.classList.add("formatted-text");
        span.title = "Alt-Click to change whitespace formatting";
        span.setAttribute("data-text", text);
        setTextWhitespaceFormatting(0, span);
        return span;
    }

    var hasListener = false;
    function setTextWhitespaceFormatting(stateChange, span) {
        if (!hasListener) {
            hasListener = true;
            document.addEventListener("click", function (e) {
                if (e.target.classList.contains("formatted-text") && e.altKey) {
                    setTextWhitespaceFormatting(1, e.target);
                }
            }, true);
        }

        var text = span.getAttribute("data-text");
        var stateAttribute = span.getAttribute("data-text-state");
        var state = (parseInt(stateAttribute == null ? 0 : stateAttribute) + stateChange) % 4;
        span.setAttribute("data-text-state", state);

        if (state == 0) {
            span.textContent = '"' + text + '"';
            span.classList.remove("formatted-text-pre");
        } else if (state == 1) {
            span.textContent = text.replace(/ /g, '\xb7').replace(/\t/g, '\u21E5').replace(/\n/g, '\u21b5');
        } else if (state == 2) {
            span.textContent = text;
            span.classList.add("formatted-text-pre");
        } else if (state == 3) {
            span.textContent = text.replace(/ /g, '\xb7').replace(/\t/g, '\u21E5');
        }
    }
});