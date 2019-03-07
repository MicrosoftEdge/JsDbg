//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

Loader.OnLoad(function() {
    var methods = ["f", "F", "array", "val"];
    DbgObject.profileData = [];
    
    methods.forEach(function(method) {
        DbgObject.profileData[method] = [];
        var existing = DbgObject.prototype[method];
        DbgObject.prototype[method] = function(a) {
            var start = performance.now();
            var record = { method: method, name: a, start: start, stop: null, time: 0 };
            DbgObject.profileData.push(record);

            var existingResult = existing.apply(this, Array.from(arguments))
            existingResult.then(function() {
                record.stop = performance.now();
            }, function() {
                record.stop = performance.now();
            })

            return existingResult;
        }
    });

    DbgObject.analyzeProfileData = function() {
        var starts = DbgObject.profileData;
        var stops = starts.slice(0);
        stops.sort(function(a, b) { return a.stop - b.stop; });

        var ends = [];
        var startIndex = 0;
        var stopIndex = 0;
        while (startIndex < starts.length && stopIndex < stops.length) {
            var startTime = starts[startIndex].start;
            var stopTime = stops[stopIndex].stop;

            if (startTime < stopTime) {
                ends.push({ record: starts[startIndex], isStart: true });
                startIndex++;
            } else {
                ends.push({ record: stops[stopIndex], isStart: false })
                stopIndex++;
            }
        }

        while (stopIndex < stops.length) {
            ends.push({ record: stops[stopIndex], isStart: false });
            stopIndex++;
        } 

        while (startIndex < starts.length) {
            ends.push({ record: starts[startIndex], isStart: true });
            startIndex++;
        }

        var openRecords = [];
        var currentSegmentStart = 0;
        ends.forEach(function (end) {
            // Distribute the time evenly across all the open records.
            var newSegmentStart = end.isStart ? end.record.start : end.record.stop;
            openRecords.forEach(function (openRecord) {
                openRecord.time += (newSegmentStart - currentSegmentStart) / openRecords.length;
            });
            currentSegmentStart = newSegmentStart;
            if (end.isStart) {
                openRecords.push(end.record);
            } else {
                openRecords = openRecords.filter(function (record) { record != end.record; });
            }
        })

        var map = new Map();
        DbgObject.profileData.forEach(function (entry) {
            var arg;
            var key = entry.method + "(\"" + entry.name + "\")";
            if (map.has(key)) {
                arg = map.get(key);
            } else {
                arg = { name: key, count: 0, time: 0 };
                map.set(key, arg);
            }
            arg.count++;
            arg.time += entry.time;
        });

        var array = Array.from(map).map(function (x) { return x[1]; });
        array.sort(function (a, b) { return b.time - a.time; });
        array = array.slice(0, 30);

        array.forEach(function (item) {
            console.log(item.name + " " + item.count + " times, " + Math.round(item.time) + "ms");
        })

        var totalTime = 0;
        DbgObject.profileData.forEach(function (entry) {
            totalTime += entry.time;
        });

        console.log("Total Time: " + totalTime + "ms");
    }
})