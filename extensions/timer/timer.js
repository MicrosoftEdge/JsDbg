//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

// timer.js
// Peter Salas
//
// A simple wall clock timer for measuring performance.

var Timer = (function() {
    function Timer(prefix) {
        this.start = performance.now();
        this.prefix = prefix ? (prefix + " @ ") : "";
    }
    Timer._help = {
        name: "Timer",
        description: "A simple wall clock timer for measuring performance."
    }

    Timer._help_Start = {
        description: "Starts a timer.",
        returns: "A Timer."
    }
    Timer.Start = function() {
        return new Timer();
    }

    Timer.prototype._help_Mark = {
        description: "Logs the elapsed time to the console with a message.",
        arguments: [{name: "msg", type:"string", description: "A message to log."}]
    }
    Timer.prototype.Mark = function(msg) {
        var elapsed = this.Elapsed();
        console.log(this.prefix + elapsed + "s: " + msg + " (" + JsDbgTransport.GetNumberOfRequests() + " reqs)");
        return elapsed;
    }

    Timer.prototype._help_Elapsed = {
        description: "Returns the elapsed time, in seconds since the timer was started.",
        returns: "A number."
    }
    Timer.prototype.Elapsed = function() {
        var end = performance.now();
        var result = end - this.start;
        return Math.round(result / 10) / 100;
    }

    Help.Register(Timer);

    return Timer;
})();