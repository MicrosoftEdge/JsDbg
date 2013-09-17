
// eval.js
//
// A modern command line for memory navigation.
//

var Eval = (function() {
    function Stack(obj, next) {
        this.object = obj;
        this.next = next ? next : null;
    }
    Stack.prototype.push = function(obj) { return new Stack(obj, this); }
    Stack.prototype.pop = function() { return this.next; }

    function ArrayIndexStack(innerStack, original) {
        this.innerStack = innerStack;
        this.object = innerStack.object;
        this.original = original;
    }
    ArrayIndexStack.prototype.push = function(obj) { return new ArrayIndexStack(this.innerStack.push(obj), this.original); }
    ArrayIndexStack.prototype.pop = function() { return new ArrayIndexStack(this.innerStack.pop(), this.original); }

    function log(op, arg, dbgO) {
        console.log("Performing " + op + " with arg " + arg + " on " + dbgO.ptr() + " " + dbgO.typename);
    }

    var ops = [
        {
            description: "symbol lookup",
            fn: function (str, stack) {
                var asInt = parseInt(str);
                if (!isNaN(asInt)) {
                    return stack.push(new DbgObject("mshtml", "void", asInt));
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
                    return stack.push(new DbgObject("mshtml", "void", asInt));
                } else {
                    throw "$ must be followed by an integer.";
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
            requiresSubsequentOp: function(str) { return str.length == 0; }
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
            character: "*",
            fn: function(str, stack) {
                if (str.length > 0) {
                    throw "* must be used on its own.";
                }
                log("deref", null, stack.object);
                return stack.push(stack.object.deref());
            },
            requiresSubsequentOp: function(str) { return false; }
        },
        {
            description: "begin array index",
            character: "[",
            fn: function(str, stack) {
                return new ArrayIndexStack(stack, stack);
            },
            requiresSubsequentOp: function(str) { return true; }
        },
        {
            description: "end array index",
            character: "]",
            fn: function(str, stack) {
                log("val", null, stack.object);
                var index = stack.object.val();
                log("index", index, stack.original.object);
                return stack.original.push(stack.original.object.idx(index));
            },
            requiresSubsequentOp: function(str) { return false; }
        },
        {
            description: "vcast",
            character: "#",
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
                var nextStack = op.fn(scanned.next, stack);
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

    function executeAll(str, stack) {
        var op = ops[0];
        
        while (op != null) {
            var next = execute(str, stack, op);
            str = next.rest;
            op = next.op;
            stack = next.stack;
        }

        return {
            stack: stack,
            rest: str
        };
    }

    return {
        evaluate: function(input, stage) {
            var result = executeAll(input.value, new Stack());
            var topObject;
            if (result.rest.length > 0) {
                // topmost object is the exception.
                topObject = result.stack.pop().object;
                console.log(result.stack.object);
            } else {
                topObject = result.stack.object;
            }

            if (topObject) {
                if (topObject.typename && topObject.ptr) {
                    var description = topObject.typename == "void" ? "" : topObject.typename + " " + topObject.ptr();

                    function val(obj) { return obj.val(); }
                    function constant(obj) { return obj.constant(); }

                    var typenames = {
                        "bool": val,
                        "char": val,
                        "short": val,
                        "int": val,
                        "unsigned bool": val,
                        "unsigned char": val,
                        "unsigned short": val,
                        "unsigned int": val,
                        "void": val
                    }
                    if (topObject.typename in typenames) {
                        description += " = " + typenames[topObject.typename](topObject);
                    } else {
                        try {
                            description += " = " + topObject.constant();
                        } catch (ex) {
                            try {
                                description += " = " + topObject.val();
                            } catch (ex) { }
                        }
                    }

                    stage.innerText = description;
                } else {
                    stage.innerText = topObject;
                }
            }
        }
    }
})();