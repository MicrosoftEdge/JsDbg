var Promise = (function() {
    function Promise(doAsynchronousWork) {
        var that = this;
        this.isCompleted = false;
        this.isError = false;
        this.result = null;
        this.callbacks = [];

        doAsynchronousWork(
            function(completedResult) {
                if (that.isError) {
                    throw "You cannot complete a promise that has already failed.";
                }
                that.isCompleted = true;
                that.result = completedResult;

                // Fire all the callbacks.
                that.callbacks.forEach(function(f) { f(); });
            }, function(errorResult) {
                if (that.isCompleted) {
                    throw "You cannot trigger an error on a promise that has already been completed.";
                }
                that.isError = true;
                that.result = errorResult;

                // Fire all the callbacks.
                that.callbacks.forEach(function(f) { f(); });
            }
        );
    }

    Promise.prototype._isPromise = true;

    Promise.as = function(value) {
        if (value._isPromise) {
            return value;
        } else {
            return new Promise(function(success) {
                success(value);
            });
        }
    }

    Promise.defer = function(work) {
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

    Promise.prototype._addCallback = function(callback) {
        if (this.isCompleted || this.isError) {
            callback();
        } else {
            this.callbacks.push(callback);
        }
    }

    Promise.prototype.then = function(fulfilled, error) {
        var that = this;
        return new Promise(function(newPromiseWorkFinished, newPromiseWorkErred) {
            that._addCallback(function() {
                if (that.isCompleted) {
                    var fulfillmentResult = fulfilled(that.result);
                    if (fulfillmentResult != undefined && fulfillmentResult != null && fulfillmentResult._isPromise) {
                        // The fulfillment method returned another promise.  Tie this promise to that one.
                        fulfillmentResult.then(newPromiseWorkFinished, newPromiseWorkErred);
                    } else {
                        // The fulfillment method returned a value.  The new promise is complete.
                        newPromiseWorkFinished(fulfillmentResult);
                    }
                } else if (that.isError) {
                    if (error) {
                        // Handle the error.
                        error(that.result);
                    } else {
                        // Forward it to the new promise instead.
                        newPromiseWorkErred(that.result);
                    }
                }
            });
        });
    }

    return Promise;
})();