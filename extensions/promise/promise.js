var Promise = (function() {
    var DEBUG_PROMISES = false;
    var nextPromiseId = 0;
    var allPromises = {};

    var queue = (function() {
        var entry = [];
        var exit = [];

        return {
            enqueue: function(item) {
                entry.push(item);
            },
            dequeue: function() {
                if (exit.length == 0) {
                    exit = entry;
                    exit.reverse();
                    entry = [];
                }

                if (exit.length > 0) {
                    return exit.pop();
                } else {
                    return null;
                }
            },
            length: function() {
                return entry.length + exit.length;
            }
        };
    })();

    var fireCallbackDepth = 0;
    function fireCallbacks(callbacks) {
        var shouldFire = fireCallbackDepth == 0;
        callbacks.forEach(function (f) { queue.enqueue(f); });

        ++fireCallbackDepth;

        try {
            while (shouldFire && queue.length() > 0) {
                queue.dequeue()();
            }
        } catch (ex) {

        } finally {
            --fireCallbackDepth;
        }
    }

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
                    throw new Error("You cannot complete a promise that has already been completed.");
                }
                that.isCompleted = true;
                that.result = completedResult;
                that.getPromisedValue = function getPromisedValue() { return completedResult; }

                fireCallbacks(that.callbacks);
            }, function workFailed(errorResult) {
                if (that.isError || that.isCompleted) {
                    throw new Error("You cannot trigger an error on a promise that has already been completed.");
                }
                that.isError = true;
                that.result = errorResult;

                if (DEBUG_PROMISES) {
                    console.log("Promise #" + that.promiseId + " failed: " + JSON.stringify(errorResult));
                }

                fireCallbacks(that.callbacks);
            },
            this
        );
    }
    Help.Register(Promise);
    
    Promise._help = {
        name: "Promise",
        description: "Represents a value or error that is retrieved asynchronously.",
        notes: "<p>Promises are immutable, and Promises may be fulfilled immediately.</p>",
        _help_constructor: {
            arguments: [{name: "doAsynchronousWork", type:"function(completed: function(object), failed: function(object))", description: "A function that notifies the promise of success or failure.  The constructor will call this function exactly once."}]
        }
    }

    Promise._help_enablePromiseDebugging = {
        description: "Enables promise debugging at a significant performance expense.",
        notes:"Once enabled:<ul>\
        <li>Promises are given a unique identifier, <code>this.promiseId</code>.</li>\
        <li><code>Promise.allPromises</code> contains a reference to every promise.</li>\
        <li><code>Promise.findUnfinishedPromises()</code> will attempt to find any promise that did not finish.</li>\
        <li><code>this.createError.stack</code> will include the stack where a promise was created.</li>\
        <li>Failed promises will be logged to the console.</li></ul>",
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

    Promise._help_isPromise = {
        description: "Indicates if a given object is a promise.",
        returns: "A bool.",
        arguments: [{name:"obj", type:"any", description:"The value to test."}]
    }
    Promise.isPromise = function(obj) {
        return obj && typeof(obj.then) == typeof(function() {});
    }

    Promise._help_as = {
        description: "Creates a promise that represents the given value.",
        returns: "A Promise.",
        arguments: [{name:"value", type:"any", description:"The value to make a promise."}],
        notes: "If the given value is already a promise, the value is returned as-is."
    }
    Promise.as = function(value) {
        if (Promise.isPromise(value)) {
            return value;
        } else {
            return { 
                then: function simpleThen(f) {
                    try {
                        if (!f) {
                            return this;
                        }
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

    Promise._help_fail = {
        description: "Creates a failed promise with the given failure result.",
        returns: "A Promise.",
        arguments: [{name:"errorMessage", type:"any", description:"The failure result."}]
    }
    Promise.fail = function(errorMessage) {
        return new Promise(function promiseFail(success, failure) {
            failure(errorMessage);
        });
    }

    Promise._help_log = {
        description: "Logs the result of a promise or value and forwards it on.",
        returns: "A Promise.",
        arguments: [{name:"promise", type:"any", description:"The promise whose value should be logged."}]
    }
    Promise.log = function(promise) {
        return Promise.as(promise).then(function promiseLog(value) { 
            console.log(JSON.stringify(value));
            return value;
        });
    }

    Promise._help_debug = {
        description: "Breaks into the debugger when a given promise is fulfilled.",
        returns: "A Promise.",
        arguments: [{name:"promise", type:"any", description:"The promise to break when fulfilled."}]
    }
    Promise.debug = function(promise) {
        return Promise.as(promise).then(function promiseDebug(value) {
            debugger;
            return value;
        });
    }

    Promise._help_join = {
        description: "Waits for all promises in an array to complete.",
        returns: "A Promise to an array of fulfilled results.",
        arguments: [{name:"promises", type:"array of any", description:"The array of promises/values to wait for."}],
        notes:"The given array can contain any combination of promises or values."
    }
    Promise.join = function(promises) {
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
                            error(errorResult);
                        }
                    });
                }
            });
        })
    }

    Promise._help_map = {
        description: "Maps every object in an array or promised array and waits for the mapped values to be fulfilled.",
        returns: "A Promise to an array of fulfilled results.",
        arguments: [
            {name:"array", type:"array, or a Promise to an array", description:"The array to map."},
            {name:"f", type:"f(any) -> any", description:"The function.  If the function returns a promise, the mapped array will include the promised value."}
        ]
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

    Promise._help_filter = {
        description: "Filters a (promised) array of values based on a predicate that can return promises.",
        returns: "A promise to a filtered array.",
        arguments: [
            {name:"promisedArray", type:"array, or a Promise to an array", description: "The array to filter."},
            {name:"f", type:"f(any) -> bool or Promise", description:"The predicate to evaluate each item against.  The predicate may return a promise in which case the promised value will be used to filter."}
        ]
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

    Promise._help_sort = {
        description: "Sorts a (promised) array of values based on a key generator that can return promises.",
        returns: "A promise to a <em>new</em> sorted array.",
        arguments: [
            {name:"promisedArray", type:"array, or Promise to an array", description: "The array to sort."},
            {name:"keyGenerator", type:"f(any) -> any", description:"Maps a value to a (promised) value to use for comparisons."},
            {name:"keyComparer", type:"f(any, any) -> int", description: "(optional) A comparer to use for the keys returned by keyGenerator."}
        ]
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

    Promise._help_CreatePromisedType = {
        description: "Creates a new type that can be treated both as a promise to a type or as an instance of that type where every method returns a promise.",
        returns: "A type constructor.",
        arguments: [
            {name:"constructor", type:"type constructor", description:"A constructor to the promised type."}
        ],
        notes:"This effectively provides sugaring for promise chaining to minimize <code>.then()</code> chaining.  For example: \
        <p><code>promiseToObject.then(function (obj) { return obj.method(); })</code></p> can become <p><code>promiseToObject.method();</code></p>"
    }
    Promise.CreatePromisedType = function(constructor, sameTypeMethods, arrayMethods) {
        var promisedType = function(promise) { 
            this.promise = Promise.as(promise);
        };
        promisedType.prototype.then = function() {
            return this.promise.then.apply(this.promise, arguments);
        };

        promisedType.Array = function(promise) { this.promise = promise; }
        promisedType.Array.prototype.then = function() {
            return this.promise.then.apply(this.promise, arguments);
        };
        promisedType.Array.prototype.filter = function(f) {
            return new promisedType.Array(Promise.filter(this.promise, f));
        }
        promisedType.Array.prototype.map = function(f) {
            return Promise.map(this.promise, f);
        }
        promisedType.Array.prototype.forEach = function(f) {
            return this.map(function (item) {
                return Promise.as(f(item))
                .then(function () {
                    return item;
                });
            });
        }
        promisedType.IncludePromisedMethod = function(methodName, resultPromisedType) {
            var method = constructor.prototype[methodName];
            if (resultPromisedType != null) {
                // Wrap the original method in a method to return a promised type instead.
                constructor.prototype[methodName] = function wrappedPromisedMethod() {
                    var returnValue = method.apply(this, arguments);
                    if (Promise.isPromise(returnValue)) {
                        return new resultPromisedType(returnValue);
                    } else {
                        return returnValue;
                    }
                };
            }
            if (typeof(method) == typeof(function() {})) {
                promisedType.prototype[methodName] = function promisedMethod() {
                    var forwardedArguments = arguments;
                    var resultPromise = this.promise.then(function callPromisedMethodOnRealizedObject(result) {
                        if (!(result instanceof constructor)) {
                            var prettyArguments = Array.from(forwardedArguments).join(", ");
                            throw new Error("You can only call " + constructor.name + " methods (like \"" + methodName + "(" + prettyArguments + ")\") on " + constructor.name + " objects.");
                        }
                        return result[methodName].apply(result, forwardedArguments);
                    });
                    if (resultPromisedType != null) {
                        resultPromise = new resultPromisedType(resultPromise);
                    }
                    return resultPromise;
                };

                promisedType.Array.prototype[methodName] = function promisedArrayMethod() {
                    var forwardedArguments = arguments;
                    var resultPromise = Promise.map(this.promise, function callPromisedMethodOnMappedItem(item) {
                        if (!(item instanceof constructor)) {
                            var prettyArguments = Array.from(forwardedArguments).join(", ");
                            throw new Error("You can only call " + constructor.name + " methods (like \"" + methodName + "(" + prettyArguments + ")\") on " + constructor.name + " objects.");
                        }
                        return item[methodName].apply(item, forwardedArguments);
                    });
                    if (resultPromisedType != null && resultPromisedType.Array != null) {
                        resultPromise = new resultPromisedType.Array(resultPromise);
                    }
                    return resultPromise;
                };
            }
        }

        for (var methodName in constructor.prototype) {
            var method = constructor.prototype[methodName];
            if (typeof(method) == typeof(function() {})) {
                promisedType.IncludePromisedMethod(methodName, null);
            }
        }
        
        return promisedType;
    }

    Promise.prototype._addCallback = function(callback) {
        if (this.isCompleted || this.isError) {
            fireCallbacks([callback]);
        } else {
            this.callbacks.push(callback);
        }
    }

    Promise.prototype._help_then = {
        description: "Provides a callback to handle the fulfilled value of a promise.",
        returns:"A Promise to the value returned by the fulillment handler.",
        arguments: [
            {name:"fulfilled", type:"function(any) -> any", description:"(optional) The fulfillment callback."},
            {name:"error", type:"function(any) -> any", description:"(optional) The error callback."},
        ],
        notes: "<p>This method returns a promise to the value returned by the fulfillment handler.\
        If the fulfillment handler itself returns a promise, then the returned promise will be a promise\
        to the value of that promise; a fulfillment handler given to <code>then</code> will never be given\
        a promise.  If this promise has an error, the error handler will be called instead.  If no error\
        handler is specified, the error will be forwarded to the returned promise.  Finally, if either\
        the fulfillment or error handlers throw an exception, the returned promise will fail with the\
        exception.</p>"
    }
    Promise.prototype.then = function(fulfilled, error) {
        var that = this;
        var result = new Promise(function thenPromiseWork(newPromiseWorkFinished, newPromiseWorkErred, newPromise) {
            that._addCallback(function thenCallback() {
                if (that.isCompleted) {
                    if (fulfilled) {
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
                    } else {
                        // Forward it to the new promise instead.
                        newPromiseWorkFinished(that.result);
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