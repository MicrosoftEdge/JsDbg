
// eval.js
//
// A modern command line for memory navigation.
//

var Eval = (function() {
    function Stack(obj, next) {
        this.object = obj;
        this.next = next ? next : null;
        this.cachedDescription = null;
    }
    Stack.prototype.push = function(obj) { return new Stack(obj, this); }
    Stack.prototype.pop = function() { return this.next; }
    Stack.prototype.description = function() {
        if (this.cachedDescription == null) {
            this.cachedDescription = "";
            if (this.object != undefined) {
                if (this.object.typename && this.object.ptr) {
                    this.cachedDescription = this.object.desc();
                } else {
                    this.cachedDescription = this.object + "<br />";
                }
            }
        }

        return this.cachedDescription;
    }


    function ArrayIndexStack(innerStack, original) {
        this.innerStack = innerStack;
        this.object = innerStack.object;
        this.original = original;
    }
    ArrayIndexStack.prototype.push = function(obj) { return new ArrayIndexStack(this.innerStack.push(obj), this.original); }
    ArrayIndexStack.prototype.pop = function() { return new ArrayIndexStack(this.innerStack.pop(), this.original); }
    ArrayIndexStack.prototype.description = function() {
        return "[<br />" + this.innerStack.description() + "]<br />" + this.original.description();
    }

    function log(op, arg, dbgO) {
        var objectDescription = dbgO;
        if (dbgO.ptr && dbgO.typename) {
            objectDescription = dbgO.ptr() + " " + dbgO.typename;
        }
        console.log("Performing " + op + " with arg " + arg + " on " + objectDescription);
    }

    var ops = [
        {
            description: "symbol lookup",
            fn: function (str, stack) {
                var asInt = parseInt(str);
                if (!isNaN(asInt)) {
                    return stack.push(new DbgObject(MSHTML.Module, "void", asInt));
                } else if (str.length == 0) {
                    return stack;
                } else {
                    return stack.push(DbgObject.sym(str));
                }
            },
            requiresSubsequentOp: function(str) { return true; }
        },
        {
            description: "numeric",
            character: "$",
            fn: function(str, stack) {
                var asInt = parseInt(str);
                if (!isNaN(asInt)) {
                    return stack.push(asInt);
                } else {
                    return stack.push(0)
                }
            },
            requiresSubsequentOp: function(str) { return false; }
        },
        {
            description: "field access",
            character: ".",
            fn: function(str, stack) {
                if (str.length == 0) {
                    return stack.pop();
                } else {
                    log("field", str, stack.object);
                    return stack.push(stack.object.f(str));
                }                
            },
            requiresSubsequentOp: function(str) { return true; }
        },
        {
            desciption: "cast",
            character: "@",
            fn: function(str, stack) {
                log("cast", str, stack.object);
                return stack.push(stack.object.as(str));
            },
            requiresSubsequentOp: function(str) { return true; }
        },
        {
            description: "dereference",
            character: "^",
            impliedOperation: ".",
            fn: function(str, stack) {
                log("deref", null, stack.object);
                return stack.push(stack.object.deref());
            },
            requiresSubsequentOp: function(str) { return false; }
        },
        {
            description: "begin array index",
            character: "[",
            impliedOperation: "$",
            fn: function(str, stack) {
                return new ArrayIndexStack(stack, stack);
            },
            requiresSubsequentOp: function(str) { return false; }
        },
        {
            description: "end array index",
            character: "]",
            fn: function(str, stack) {
                log("val", null, stack.object);
                var index = stack.object.val ? stack.object.val() : stack.object;
                log("index", index, stack.original.object);
                return stack.original.push(stack.original.object.idx(index));
            },
            requiresSubsequentOp: function(str) { return false; }
        },
        {
            description: "vcast",
            character: "#",
            impliedOperation: ".",
            fn: function(str, stack) {
                log("vcast", null, stack.object);
                return stack.push(stack.object.vcast());
            },
            requiresSubsequentOp: function(str) { return false; }
        }
    ];

    var characters = { };
    ops.forEach(function(op) {
        if (op.character) {
            characters[op.character] = op;
        }
    });

    // finds the next operator
    function scan(str) {
        for (var i = 0; i < str.length; ++i) {
            if (str[i] in characters) {
                return {
                    next: str.substr(0, i),
                    rest: str.substr(i + 1),
                    op: characters[str[i]]
                }
            }
        }

        return {
            next: str,
            rest: "",
            op: null
        }
    }

    function execute(str, stack, op) {
        var scanned = scan(str);
        try {
            if (scanned.op != null || !op.requiresSubsequentOp(scanned.next)) {
                // Only execute the operation if the opcode wasn't the last character.
                if (op.impliedOperation) {
                    var nextStack = op.fn("", stack);
                    return {
                        rest: str,
                        op: characters[op.impliedOperation],
                        stack: nextStack
                    }
                } else {
                    var nextStack = op.fn(scanned.next, stack);
                }
            } else {
                var nextStack = stack;
            }
            return {
                rest: scanned.rest,
                op: scanned.op,
                stack: nextStack
            };
        } catch(ex) {
            return {
                rest: str,
                op: null,
                stack: stack.push(ex)
            }
        }
    }

    var savedContext = [];

    function executeAll(str) {
        var originalString = str;
        var op = ops[0];
        var stack = new Stack();

        // find the longest prefix that matches.
        var foundContext = false;
        for (var i = savedContext.length - 1; i >= 0; --i) {
            var context = savedContext[i];
            if (str.indexOf(context.prefix) == 0) {
                op = context.nextOp;
                str = str.substr(context.prefix.length);
                stack = context.stack;
                savedContext = savedContext.slice(i);
                foundContext = true;
                break;
            }
        }

        if (!foundContext) {
            savedContext = [];
        }

        while (op != null) {
            var next = execute(str, stack, op);
            str = next.rest;
            op = next.op;
            stack = next.stack;

            // Save the context.
            if (op != null) {
                savedContext.push({
                    prefix: originalString.substr(0, originalString.length - str.length),
                    nextOp: op,
                    stack: stack
                });
            }
        }

        return {
            stack: stack,
            rest: str
        };
    }

    return {
        evaluate: function(input, stage) {
            var result = executeAll(input.value);
            var stackToDescribe;
            if (result.rest.length > 0) {
                // topmost object is the exception.
                stackToDescribe = result.stack.pop();
            } else {
                stackToDescribe = result.stack;
            }

            stage.innerHTML = stackToDescribe.description();
        }
    }
})();