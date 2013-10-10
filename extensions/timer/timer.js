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
                Mark: function(msg) {
                    var elapsed = this.Elapsed();
                    console.log(this.Elapsed() + ": " + msg + " (" + JsDbg.GetNumberOfRequests() + " reqs)");
                    return elapsed;
                },
                Elapsed: function() {
                    var end = new Date();
                    var result = end - start;
                    return Math.round(result / 10) / 100;
                }
            }
        }
    }
})();