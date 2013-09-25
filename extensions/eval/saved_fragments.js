// 

// grammar:
// <eval> := <expression> <multimodifier>*
// <multimodifier> := <plusmodifier>+ COLON | 
//                    LBRACE (<expression> <singlemodifier>*) | <singlemodifier>+) RBRACE |
//                    <singlemodifier>
// <plusmodifier> := PLUS <symbol>? <singlemodifier>+
// <singlemodifier> := DOT <symbol>? |
//                     AT <typename> | 
//                     LSQUARE <value> RSQUARE
// <expression> := <symbol> | <sum>
// <sum> := <product> ((PLUS | MINUS) <product>)*
// <product> := <value> ((TIMES | DIVIDE) <value>)*
// <value> := <number> | LPAREN <expression> RPAREN
// <number> := [0-9]+ | 0x[0-9A-Fa-f]+
// <symbol> := [_A-z][_A-z0-9]*
// <typename> :=  <module>? <symbol> (LESSTHAN <typename> GREATERTHAN)* (COLON COLON <typename> | TIMES*)
// <module> := <symbol> BANG

function res(rest, obj) {
    return {
        rest: rest,
        result: obj
    };
}

function stringRes(rest, string) {
    return res(rest, string.substr(0, string.length - rest.length));
}

function parseEval(string) {
    var last;
    var operations = [];

    if (!(last = parseExpression(string))) {
        return false;
    }
    operations.push(last.result);

    var multimodifier;
    while ((multimodifier = parseMultiModifier(last.rest))) {
        last = multimodifier;
        operations.push(last.result);
    }

    return res(last.rest, function(context) { return operations.reduce(function(ctx, op) { return op(ctx); }, context); });
}

function parseMultiModifier(string) {
    var last;
    var operations = [];

    if (last = parsePlusModifier(string)) {
        operations.push(last.result);
        var plusmodifier;
        while (plusmodifier = parsePlusModifier(last.rest)) {
            last = plusmodifier;
            operations.push(last.result);
        }

        if (last = parseToken(":", last.rest)) {
            operations.push(function(context) {
                // TODO: coalesce the adjacent context stacks.
            });
            return res(last.rest, function(context) { return operations.reduce(function(ctx, op) { return op(ctx); }, context); });
        } else {
            return false;
        }
    } else if (last = parseToken("{", string)) {
        // TODO
        return false;
    } else {
        return parseSingleModifier(string);
    }
}

function parsePlusModifier(string) {
    // TODO
    return false;
}

function parseSingleModifier(string) {
    var last;
    if (last = parseToken(".", string)) {
        var sym;
        if (sym = parseSymbol(last.rest)) {
            // .<symbol> => push context.object.f(symbol)
            last = sym;
            return res(last.rest, function(context) { return context.push(context.object.f(last.result)); });
        } else if (last.rest.length > 0) {
            // empty dot => pop
            return res(last.rest, function(context) { return context.pop(); });
        }
    } else if (last = parseToken("@", string)) {
        if (last = parseTypename(last.rest)) {
            // @<typename> => cast topmost object (don't push)
            if (last.rest.length > 0) {
                return res(last.rest, function(context) { return context.pop().push(context.object.as(last.result)); });
            } else {
                return false;
            }
        } else {
            return false;
        }
    } else if (last = parseToken("[", string)) {
        // TODO
        return false;
    }
}

function parseExpression(string) {
    var symbol = parseSymbol(string);
    if (!symbol) {
        return false;
    } else {
        return res(symbol.rest, function(context) {
            // Do a symbol lookup.
            return new Stack(DbgObject.sym(symbol.result), context, context ? context.side : null);
        });
    }
}

// <typename> :=  <module>? <symbol> (LESSTHAN <typename> GREATERTHAN)* (COLON COLON <typename> | TIMES*)
function parseTypename(string) {
    var last = res(string, "");
    var module;
    if (module = parseModule(last.rest)) {
        last = module;
    }

    if (!(last = parseSymbol(last.rest))) {
        return false;
    }

    var template;
    while ((template = parseTemplate(last.rest))) {
        last = template;
    }

    var namespace;
    if (namespace = parseNamespace(last.rest)) {
        last = namespace;
    } else {
        var star;
        while (star = parseToken("*", last.rest)) {
            last = star;
        }
    }

    return stringRes(last.rest, string);
}

function parseNamespace(string) {
    var last;
    if ((last = parseToken(":", string)) &&
        (last = parseToken(":", last.rest)) &&
        (last = parseTypename(last.rest))
    ) {
        return stringRes(last.rest, string);
    } else {
        return false;
    }
}

function parseTemplate(string) {
    // TODO
    return false;
}

function parseModule(string) {
    var last;
    if ((last = parseSymbol(string)) &&
        (last = parseToken("!", last.rest))
    ) {
        return stringRes(last.rest, string);
    }
}

function parseSymbol(string) {
    var matches = string.match(/^[_A-z][_A-z0-9]*/);
    if (!matches) {
        return false;
    } else {
        return res(string.substr(matches[0].length), matches[0]);
    }
}

function parseToken(token, string) {
    if (string.indexOf(token) == 0) {
        return res(string.substr(token.length), token);
    } else {
        return false;
    }
}