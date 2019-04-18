//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

Loader.OnLoad(function() {
    // In Edge and Firefox, the built-in promises are slower than the JS implementation below.
    if (window.navigator.userAgent.indexOf("Edge") >= 0 || window.navigator.userAgent.indexOf("Firefox") >= 0 || !window.Promise) {
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

        window.Promise = function(doAsynchronousWork) {
            var that = this;
            this.isCompleted = false;
            this.isError = false;
            this.result = null;
            this.callbacks = [];

            doAsynchronousWork(
                function workCompleted(completedResult) {
                    if (that.isError || that.isCompleted) {
                        throw new Error("You cannot complete a promise that has already been completed.");
                    }
                    that.isCompleted = true;
                    that.result = completedResult;

                    fireCallbacks(that.callbacks);
                }, function workFailed(errorResult) {
                    if (that.isError || that.isCompleted) {
                        throw new Error("You cannot trigger an error on a promise that has already been completed.");
                    }
                    that.isError = true;
                    that.result = errorResult;

                    fireCallbacks(that.callbacks);
                },
                this
            );
        }
        
        Promise.reject = function(errorMessage) {
            return new Promise(function promiseFail(success, failure) {
                failure(errorMessage);
            });
        }

        Promise.all = function(promises) {
            return new Promise(
                function promiseJoiner(success, error) {
                    var results = new Array(promises.length);
                    var remaining = promises.length;
                    var didError = false;

                    if (remaining == 0) {
                        success(results);
                    }

                    promises.forEach(function promiseJoinForEach(promise, index) {
                        Promise.resolve(promise)
                        .then(
                            function storeJoinResult(value) {
                                results[index] = value;
                                if (!didError && --remaining == 0) {
                                    success(results);
                                }
                            },
                            function promiseJoinError(errorResult) {
                                if (!didError) {
                                    didError = true;
                                    error(errorResult);
                                }
                            }
                        );
                    });
                }
            );
        }

        Promise.race = function(promises) {
            return new Promise(
                function promiseRacer(success, error) {
                    var didComplete = false;
                    promises.forEach(function promiseRaceForEach(promise) {
                        promise.then(
                            function promiseRaceSuccess(value) {
                                if (!didComplete) {
                                    didComplete = true;
                                    success(value);
                                }
                            },
                            function promiseRaceFailure(value) {
                                if (!didComplete) {
                                    didComplete = true;
                                    error(value);
                                }
                            }
                        );
                    })
                }
            )
        }

        function SimplePromise(value) {
            this.value = value;
        }

        SimplePromise.prototype.then = function (f) {
            if (!f) {
                return this;
            } else {
                try {
                    return Promise.resolve(f(this.value));
                } catch (ex) {
                    return Promise.reject(ex);
                }
            }
        }

        SimplePromise.prototype.catch = function() {
            // Simple promises are never in the rejected state.
            return this;
        }

        SimplePromise.prototype.thenAll = function(f, err) {
            return this.then(function (array) {
                return f.apply(this, array);
            }, err)
        }

        function isThenable(value) {
            return value && value.then instanceof Function;
        }

        Promise.resolve = function(value) {
            if (isThenable(value)) {
                return value;
            } else {
                return new SimplePromise(value);
            }
        }

        Promise.prototype._addCallback = function(callback) {
            if (this.isCompleted || this.isError) {
                fireCallbacks([callback]);
            } else {
                this.callbacks.push(callback);
            }
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

                            if (isThenable(fulfillmentResult)) {
                                // The fulfillment method returned another promise.  Tie this promise to that one.
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
                            if (isThenable(errorResult)) {
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

            return result;
        }

        Promise.prototype.catch = function(onError) { return this.then(null, onError); }
    }

    Promise._help = {
        name: "Promise",
        description: "Represents a value or error that is retrieved asynchronously.",
        notes: "<p>JsDbg promises are based on ES6 promises, except that promises in JsDbg may be fulfilled immediately and have some additional helper methods.</p>" +
        "<p>For more information see <a href=\"https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise\">MDN</a>.</p>"
    };

    Help.Register(Promise);

    Promise.prototype._help_thenAll = {
        description: "Like 'then' but spreads an array result into the arguments of the callback.",
        returns: "A Promise to the result of the given function.",
        arguments: [
            {name:"onsuccess", type:"function", description:"The callback, expecting an argument for each element of the array."},
            {name:"onerror", type:"function", description:"(optional) A callback to handle the result of the promise if it fails."}
        ],
        notes: "<p>Using regular '.then' with Promise.all can be unwieldly when the array is a fixed size:\
<pre>Promise.all([firstPromise, secondPromise, thirdPromise])\n\
.then(function(results) {\n\
    // Do something with results[0], results[1], and results[2]\n\
});</pre>\
Using '.thenAll' makes this a bit smoother:\
<pre>Promise.all([firstPromise, secondPromise, thirdPromise])\n\
.thenAll(function(firstResult, secondResult, thirdResult) {\n\
    // Do something with these results.\n\
});</pre>" 
    }
    Promise.prototype.thenAll = function(f, err) {
        return this.then(function (array) {
            return f.apply(this, array);
        }, err)
    }

    Promise.prototype.finally = function(f) {
        return this.then(
            function (result) {
                return Promise.resolve(f())
                .then(function() {
                    return result;
                })
            },
            function (error) {
                return Promise.resolve(f())
                .then(function() {
                    return Promise.reject(error);
                })
            }
        );
    }

    var promisifiedMethodsByLength = [
        function(method, check) {
            return new Promise(function (success, error) {
                return success(method());
            }).then(check);
        },
        function(method, check) {
            return function() {
                return new Promise(function (success, error) {
                    return method(success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1) {
                return new Promise(function (success, error) {
                    return method(a1, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2) {
                return new Promise(function (success, error) {
                    return method(a1, a2, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2, a3) {
                return new Promise(function (success, error) {
                    return method(a1, a2, a3, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2, a3, a4) {
                return new Promise(function (success, error) {
                    return method(a1, a2, a3, a4, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2, a3, a4, a5) {
                return new Promise(function (success, error) {
                    return method(a1, a2, a3, a4, a5, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2, a3, a4, a5, a6) {
                return new Promise(function (success, error) {
                    return method(a1, a2, a3, a4, a5, a6, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2, a3, a4, a5, a6, a7) {
                return new Promise(function (success, error) {
                    return method(a1, a2, a3, a4, a5, a6, a7, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2, a3, a4, a5, a6, a7, a8) {
                return new Promise(function (success, error) {
                    return method(a1, a2, a3, a4, a5, a6, a7, a8, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2, a3, a4, a5, a6, a7, a8, a9) {
                return new Promise(function (success, error) {
                    return method(a1, a2, a3, a4, a5, a6, a7, a8, a9, success);
                }).then(check);
            }
        },
        function(method, check) {
            return function(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {
                return new Promise(function (success, error) {
                    return method(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, success);
                }).then(check);
            }
        },
    ]

    Promise._help_promisify = {
        description: "Given an object with methods expecting a callback in the last parameter, creates an object with methods that return promises.",
        returns: "An object with promisified methods.",
        arguments: [
            {name:"module", type:"an object", description:"The object to promisify."}
        ],
        notes: "<p>Example Usage:<pre>Promise.promisify(JsDbg).GetCallStack(10)\n.then(function(callstack) {\n    // Do something with the callstack.\n})</pre>"
    }
    Promise.promisify = function(module, check) {
        var methodNames = Object.getOwnPropertyNames(module).filter(function (propertyName) {
            return module[propertyName] instanceof Function && module[propertyName].length > 0;
        });

        var promisifiedModule = Object.create(module);
        methodNames.forEach(function (methodName) {
            var method = module[methodName];
            if (method.length >= promisifiedMethodsByLength.length) {
                throw new Error("Cannot promisify a method with length " + method.length);
            }
            promisifiedModule[methodName] = promisifiedMethodsByLength[method.length](method.bind(module), check);
        })

        return promisifiedModule;
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
        return Promise.resolve(array)
        .then(function (resolvedArray) {
            return Promise.all(resolvedArray.map(f));
        })
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
        return Promise.resolve(promisedArray)
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

        return Promise.resolve(promisedArray)
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

    Promise.yield = function() {
        JsDbgLoadingIndicator.Show();
        return new Promise(function (success) {
            window.requestAnimationFrame(function() {
                JsDbgLoadingIndicator.Hide();
                success();
            });
        });
    }

    var MAX_INFLIGHT_OPERATIONS = 64;
    var currentThrottledInflightOperations = 0;
    var currentThrottleYield = null;
    Promise.throttledMap = function(array, operation) {
        function doNextChunk(array, index, progress) {
            if (index >= array.length) {
                return Promise.resolve(progress);
            }

            var chunkSize = Math.min(array.length - index, MAX_INFLIGHT_OPERATIONS - currentThrottledInflightOperations);
            if (chunkSize == 0) {
                if (currentThrottleYield == null) {
                    currentThrottleYield = Promise.yield()
                    .then(function() {
                        currentThrottledInflightOperations = 0;
                        currentThrottleYield = null;
                    });
                }

                var resultAfterYield = currentThrottleYield.then(function() { return doNextChunk(array, index, progress); });
                currentThrottleYield = resultAfterYield.catch(function () {});
                return resultAfterYield;
            }

            currentThrottledInflightOperations += chunkSize;
            return Promise.all(array.slice(index, index + chunkSize).map(function (item, i) { return operation(item, index + i); }))
            .then(function(result) {
                return doNextChunk(array, index + chunkSize, progress.concat(result));
            })
        }

        return Promise.resolve(array)
        .then(function(array) {
            return doNextChunk(array, 0, []);
        });
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
            this.promise = Promise.resolve(promise);
        };
        promisedType.prototype.then = function() {
            return this.promise.then.apply(this.promise, arguments);
        };

        promisedType.prototype.catch = function() {
            return this.promise.catch.apply(this.promise, arguments);
        };

        promisedType.Array = function(promise) { this.promise = promise; }
        promisedType.Array.prototype.then = function() {
            return this.promise.then.apply(this.promise, arguments);
        };
        promisedType.Array.prototype.catch = function() {
            return this.promise.catch.apply(this.promise, arguments);
        };
        promisedType.Array.prototype.filter = function(f) {
            return new promisedType.Array(Promise.filter(this.promise, f));
        }
        promisedType.Array.prototype.map = function(f) {
            return Promise.map(this.promise, f);
        }
        promisedType.Array.prototype.forEach = function(f) {
            return this.map(function (item) {
                return Promise.resolve(f(item))
                .then(function () {
                    return item;
                });
            });
        }
        promisedType.IncludePromisedMethod = function(methodName, resultPromisedType, methodReturnsPromise) {
            var method = constructor.prototype[methodName];
            if (resultPromisedType != null && methodReturnsPromise) {
                // Wrap the original method in a method to return a promised type instead.
                constructor.prototype[methodName] = function wrappedPromisedMethod() {
                    return new resultPromisedType(method.apply(this, arguments));
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

    Promise._help_any = {
        description: "Creates a single promise that resolves when any one of the promises in the given iterable resolves and rejects if all promises reject.",
        returns: "The succeeded promise.",
        arguments: [
            {name:"promiseIterable", type:"iterable", description: "The iterable collection (e.g. array) of promises to evaluate."}
        ]
    }
    Promise.any = function(promiseIterable) {
        return Promise.all(promiseIterable.map(promise => {
            // Invert Promise.all's rejection logic by swapping the pass/fail logic.
            return Promise.resolve(promise).then(
              value => Promise.reject(value),
              error => Promise.resolve(error)
            );
          })).then(
            // If '.all' resolved, there were no resolved promises in the array
            errors => Promise.reject(errors),
            // If '.all' rejected, the error value will be the completed promise
            value => Promise.resolve(value)
          );
    }
})