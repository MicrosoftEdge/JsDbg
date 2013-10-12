var Promise = (function() {
    var DEBUG_PROMISES = false;
    var nextPromiseId = 0;
    var allPromises = {};

    function Promise(doAsynchronousWork) {
        var that = this;
        this.isCompleted = false;
        this.isError = false;
        this.result = null;
        this.callbacks = [];

        if (DEBUG_PROMISES) {
            this.promiseId = nextPromiseId++;
            allPromises[this.promiseId] = this;

            this.createError = null;
            try {
                Error.stackTraceLimit = Infinity;
                throw new Error();
            } catch (e) {
                this.createError = e;
                Error.stackTraceLimit = 10;
            }

            this.parentPromises = [];
        }

        doAsynchronousWork(
            function workCompleted(completedResult) {
                if (that.isError || that.isCompleted) {
                    throw "You cannot complete a promise that has already been completed.";
                }
                that.isCompleted = true;
                that.result = completedResult;
                that.getPromisedValue = function getPromisedValue() { return completedResult; }

                // Fire all the callbacks.
                for (var i = 0; i < that.callbacks.length; ++i) {
                    that.callbacks[i]();
                }
            }, function workFailed(errorResult) {
                if (that.isError || that.isCompleted) {
                    throw "You cannot trigger an error on a promise that has already been completed.";
                }
                that.isError = true;
                that.result = errorResult;

                if (DEBUG_PROMISES) {
                    console.log("Promise #" + that.promiseId + " failed: " + JSON.stringify(errorResult));
                }

                // Fire all the callbacks.
                for (var i = 0; i < that.callbacks.length; ++i) {
                    that.callbacks[i]();
                }
            },
            this
        );
    }

    Promise.enablePromiseDebugging = function() {
        if (!DEBUG_PROMISES) {
            DEBUG_PROMISES = true;
            Promise.allPromises = allPromises;
            Promise.findUnfinishedPromises = function() {
                function debugPromise(promise, seenPromises) {
                    if (promise.isCompleted || promise.isError) {
                        // Promise has already finished.
                        return null;
                    }

                    if (promise.promiseId in seenPromises) {
                        console.log("Circular promise dependency detected!");
                        return promise;
                    }

                    seenPromises[promise.promiseId] = true;

                    var problematicPromise = null;
                    for (var i = 0; i < promise.parentPromises.length; ++i) {
                        problematicPromise = debugPromise(promise.parentPromises[i], seenPromises);
                        if (problematicPromise != null) {
                            break;
                        }
                    }

                    if (problematicPromise == null) {
                        console.log("Found a promise whose parents are finished but is not finished!");
                        problematicPromise = promise;
                    }

                    delete seenPromises[promise.promiseId];

                    return problematicPromise;
                }

                for (var id in allPromises) {
                    var promise = debugPromise(allPromises[id], {});
                    if (promise != null) {
                        return promise;
                    }
                }
            }
        }
    }

    Promise.isPromise = function(obj) {
        return obj && typeof(obj.then) == typeof(function() {});
    }

    Promise.as = function(value) {
        if (Promise.isPromise(value)) {
            return value;
        } else {
            return { 
                then: function simpleThen(f) {
                    try {
                        var result = f(value);
                        return Promise.as(result);
                    } catch (ex) {
                        return Promise.fail(ex);
                    }
                },
                getPromisedValue: function getPromisedValue() { return value; }
            };
        }
    }

    Promise.realize = function(promise) {
        if (Promise.isPromise(promise) && promise.getPromisedValue) {
            return promise.getPromisedValue();
        } else {
            return promise;
        }
    }

    Promise.fail = function(errorMessage) {
        return new Promise(function promiseFail(success, failure) {
            failure(errorMessage);
        });
    }

    Promise.log = function(promise) {
        return Promise.as(promise).then(function promiseLog(value) { 
            console.log(JSON.stringify(value));
            return value;
        });
    }

    Promise.debug = function(promise) {
        return Promise.as(promise).then(function promiseDebug(value) {
            debugger;
            return value;
        });
    }

    Promise.join = function(promisesArg) {
        // If we weren't given an array or we were given multiple arguments, join the arguments instead.
        if (typeof(promisesArg) != typeof([]) || arguments.length > 1) {
            var promises = [];
            for (var i = 0; i < arguments.length; ++i) {
                promises.push(arguments[i]);
            }
        } else {
            var promises = promisesArg;
        }

        return new Promise(function promiseJoiner(success, error, joinPromise) {
            var results = new Array(promises.length);
            var remaining = promises.length;
            var didError = false;

            if (remaining == 0) {
                success(results);
            }

            promises = promises.map(Promise.realize);
            promises.forEach(function promiseJoinForEach(promise, index) {
                function storeJoinResult(value) {
                    results[index] = value;
                    if (!didError && --remaining == 0) {
                        success(results);
                    }
                }
                if (!Promise.isPromise(promise)) {
                    storeJoinResult(promise);
                } else {
                    if (DEBUG_PROMISES) {
                        joinPromise.parentPromises.push(promise);
                    }

                    promise.then(storeJoinResult, function promiseJoinError(errorResult) {
                        if (!didError) {
                            didError = true;
                            error({item:index, result: errorResult});
                        }
                    });
                }
            });
        })
    }

    Promise.map = function(array, f) {
        array = Promise.realize(array);
        if (!Promise.isPromise(array)) {
            return Promise.join(array.map(f));
        } else {
            return array.then(function (array) {
                return Promise.join(array.map(f));
            })
        }
    }

    Promise.filter = function(promisedArray, f) {
        return Promise.as(promisedArray)
            .then(function (array) {
                return Promise.map(array, f)
                    .then(function promiseFilterer(bools) {
                        return array.filter(function(_, i) {
                            return bools[i];
                        });
                    });
            });
    }

    Promise.sort = function(promisedArray, keyGenerator, keyComparer) {
        if (!keyComparer) {
            // Default comparer compares numbers.
            keyComparer = function(a, b) { return a - b; };
        }

        return Promise.as(promisedArray)
            .then(function (array) {
                return Promise.map(array, keyGenerator)
                    // Get the array of keys.
                    .then(function(keys) {
                        // Create the compound array.
                        var keysAndValues = keys.map(function(key, i) {
                            return {
                                key:key,
                                value:array[i]
                            };
                        });

                        // Sort the compound array by key.
                        keysAndValues.sort(function(a, b) { return keyComparer(a.key, b.key); });

                        // Map the compound array back to the values.
                        return keysAndValues.map(function(keyAndValue) { return keyAndValue.value; });
                    });
            })
    }

    Promise._defer = function(work) {
        if (window.setImmediate) {
            return new Promise(function(success) { window.setImmediate(success); })
                .then(work);
        } else if (window.requestAnimationFrame) {
            return new Promise(function(success) { window.requestAnimationFrame(success); })
                .then(work);
        } else {
            return new Promise(function(success) { window.setTimeout(success, 0); })
                .then(work);
        }
    }

    Promise.promisedType = function(constructor, methods) {
        var promisedType = function(promise) { this.promise = promise; };
        promisedType.prototype.then = function() {
            return this.promise.then.apply(this.promise, arguments);
        };
        var wrappedMethods = {};

        promisedType.includePromisedMethod = function(methodName) {
            wrappedMethods[methodName] = true;
            var method = constructor.prototype[methodName];
            if (typeof(method) == typeof(function() {})) {
                promisedType.prototype[methodName] = function promisedMethod() {
                    var forwardedArguments = arguments;
                    return new promisedType(this.promise.then(function callPromisedMethodOnRealizedObject(result) {
                        return result[methodName].apply(result, forwardedArguments);
                    }));
                }
            }
        }

        methods.forEach(promisedType.includePromisedMethod);

        for (var methodName in constructor.prototype) {
            var method = constructor.prototype[methodName];
            if (!(methodName in wrappedMethods) && typeof(method) == typeof(function() {})) {
                (function(methodName) {
                    promisedType.prototype[methodName] = function promisedMethod() {
                        var forwardedArguments = arguments;
                        return this.promise.then(function callPromisedMethodOnRealizedObject(result) {
                            return result[methodName].apply(result, forwardedArguments);
                        });
                    };
                })(methodName);
            }
        }
        
        return promisedType;
    }

    Promise.prototype._addCallback = function(callback) {
        if (this.isCompleted || this.isError) {
            callback();
        } else {
            this.callbacks.push(callback);
        }
    }

    Promise.prototype.then = function(fulfilled, error) {
        var that = this;
        var result = new Promise(function thenPromiseWork(newPromiseWorkFinished, newPromiseWorkErred, newPromise) {
            that._addCallback(function thenCallback() {
                if (that.isCompleted) {
                    try {
                        var fulfillmentResult = fulfilled(that.result);
                    } catch (fulfillmentError) {
                        console.log("Got exception during fulfillment: " + fulfillmentError);
                        newPromiseWorkErred(fulfillmentError);
                        return;
                    }

                    if (Promise.isPromise(fulfillmentResult)) {
                        // The fulfillment method returned another promise.  Tie this promise to that one.
                        if (DEBUG_PROMISES) {
                            newPromise.parentPromises.push(fulfillmentResult);
                        }
                        fulfillmentResult.then(newPromiseWorkFinished, newPromiseWorkErred);
                    } else {
                        // The fulfillment method returned a value.  The new promise is complete.
                        newPromiseWorkFinished(fulfillmentResult);
                    }
                } else if (that.isError) {
                    if (error) {
                        // Handle the error.
                        try {
                            var errorResult = error(that.result);
                        } catch (errorError) {
                            console.log("Got exception during error handling: " + errorError);
                            newPromiseWorkErred(errorError);
                            return;
                        }
                        if (Promise.isPromise(errorResult)) {
                            if (DEBUG_PROMISES) {
                                newPromise.parentPromises.push(fulfillmentResult);
                            }
                            errorResult.then(newPromiseWorkFinished, newPromiseWorkErred);
                        } else {
                            newPromiseWorkFinished(errorResult);
                        }
                    } else {
                        // Forward it to the new promise instead.
                        newPromiseWorkErred(that.result);
                    }
                }
            });

        });

        if (DEBUG_PROMISES) {
            result.parentPromises.push(this);
        }

        return result;
    }

    return Promise;
})();