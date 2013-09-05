"use strict";

// timer.js
// Peter Salas
//
// A simple wall clock timer for measuring performance.

var Timer = (function() {
    return {
        Start: function() {
            var start = new Date();
            return {
                Elapsed: function() {
                    var end = new Date();
                    var result = end - start;
                    return Math.round(result / 10) / 100;
                }
            }
        }
    }
})();