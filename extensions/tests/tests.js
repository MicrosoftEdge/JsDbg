//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var Tests = undefined;
Loader.OnLoad(function() {
    var registeredSuites = [];

    function renderSuite(suite) {
        var container = document.createElement("div");
        container.classList.add("test-suite");

        var title = document.createElement("div");
        title.classList.add("test-suite-title");
        title.textContent = suite.name;

        var description = document.createElement("div");
        description.classList.add("test-suite-description");
        description.textContent = suite.description;

        var cases = document.createElement("div");
        cases.classList.add("test-suite-cases");

        container.appendChild(title);
        container.appendChild(description);
        container.appendChild(cases);

        suite.cases.map(renderCase).forEach(function (e) {
            cases.appendChild(e);
        });

        return container;
    }

    function renderCase(testCase) {
        var container = document.createElement("div");
        container.classList.add("test-case");
        container.runTestCase = function () { return runTest(testCase, container) };

        var description = document.createElement("div");
        description.classList.add("test-case-description");
        description.textContent = testCase.description;

        var status = document.createElement("div");
        status.classList.add("test-case-status");

        status.addEventListener("click", function() {
            container.runTestCase();
        });

        container.appendChild(description);
        container.appendChild(status);

        return container;
    }

    function canUsePromises() {
        return typeof Promise !== "undefined" && Promise.resolve !== undefined;
    }

    function runTest(testCase, container) {
        var assertsRun = 0;
        var assert = function(condition, message) {
            ++assertsRun;
            if (!condition) {
                throw new Error("Assertion failed: " + message);
            }
        };
        assert.equals = function(expected, actual, message) {
            ++assertsRun;
            if (expected !== actual) {
                throw new Error("Assertion failed: " + message + " Expected: " + expected + " of type " + typeof(expected) + ", got: " + actual + " of type " + typeof(actual));
            }
        }
        assert.notEquals = function (expectedNotEqualTo, actual, message) {
            ++assertsRun;
            if (expectedNotEqualTo === actual) {
                throw new Error("Assertion failed: " + message + " Expected not equal to " + expectedNotEqualTo + " of type " + typeof(expectedNotEqualTo) + ", but objects were equal.");
            }
        }
        assert.arrayEquals = function (expected, actual, message) {
            ++assertsRun;
            var equals = true;
            if (expected.length != actual.length) {
                equals = false;
            } else {
                for (var i = 0; i < expected.length; ++i) {
                    equals = equals && actual[i] == expected[i];
                }
            }

            if (!equals) {
                throw new Error("Assertion failed: " + message + " Expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual) + ".");
            }
        }

        var status = container.querySelector(".test-case-status")

        var start = new Date();

        if (canUsePromises()) {
            if (testCase.isRunning) {
                return false;
            }
            testCase.isRunning = true;

            // Mark status field as running.
            status.classList.add("running");
            status.classList.remove("passed");
            status.classList.remove("failed");

            // Promise based test.
            return Promise.resolve(false)
            .then(function () {
                return testCase.test(assert);
            })
            .then(
                function () {
                    // Test passed.
                    status.classList.add("passed");
                    status.setAttribute("data-asserts", assertsRun);
                },
                function(err) {
                    // Test failed.
                    status.classList.add("failed");
                    status.setAttribute("data-error", err.message);
                }
            )
            .then(function() {
                // Test is completed.
                status.classList.remove("running");
                testCase.isRunning = false;

                var stop = new Date();
                var seconds = (stop - start) / 1000;
                status.setAttribute("data-runtime", seconds + "s");
            });
        } else {
            // Exception based test.
            status.classList.remove("passed");
            status.classList.remove("failed");

            try {
                testCase.test(assert);
                status.classList.add("passed");
                status.setAttribute("data-asserts", assertsRun);
            } catch (err) {
                status.classList.add("failed");
                status.setAttribute("data-error", err.message);
            }

            var stop = new Date();
            var seconds = (stop - start) / 1000;
            status.setAttribute("data-runtime", seconds + "s");
        }
    }

    Loader.OnPageReady(function () {
        if (Loader.GetCurrentExtension()== "tests") {
            var container = document.body;
            container.innerHTML = "";
            registeredSuites.map(renderSuite).forEach(function (e) { container.appendChild(e); })

            var testCaseElements = document.querySelectorAll(".test-case");
            var allTests = [];
            for (var i = 0; i < testCaseElements.length; ++i) {
                allTests.push(testCaseElements[i]);
            }
            if (canUsePromises()) {
                var currentStatus = Promise.resolve(false);
                allTests.forEach(function (container) {
                    currentStatus = currentStatus.then(function () {
                        return container.runTestCase();
                    });
                })
            } else {
                allTests.forEach(function (container ) {
                    container.runTestCase();
                });
            }
        }
    });

    Tests = {
        CreateTestSuite: function (name, description) {
            var suite = {
                name: name,
                description: description,
                cases: []
            };

            registeredSuites.push(suite);
            return suite;
        },

        AddTest: function(suite, description, test) {
            suite.cases.push({
                description: description,
                test: test
            });
        }
    };
});