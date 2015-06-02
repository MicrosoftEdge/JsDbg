"use strict";

var BigInteger = (function() {
    var testSuite = (Tests ? Tests.CreateTestSuite("BigInteger", "Tests for the BigInteger implementation in PointerMath.") : undefined);
    var addTest = function(description, test) {
        if (testSuite !== undefined) {
            Tests.AddTest(testSuite, description, test);
        }
    }

    var defaultBase = Math.pow(2, 32);

    function BigInteger(base) {
        this.digits = [];
        this.base = base ? base : defaultBase;
    }

    function truncate(number) {
        if (number > 0) {
            return Math.floor(number);
        } else {
            return Math.ceil(number);
        }
    }

    BigInteger.prototype.multiplyAndAdd = function(multiply, add) {
        var base = this.base;
        var result = new BigInteger(base);

        var carry = this.digits.reduce(function (carry, value) {
            value = value * multiply + carry;
            result.digits.push(value % base);
            return truncate(value / base);
        }, add);

        while (carry != 0) {
            result.digits.push(carry % base);
            carry = truncate(carry / base);
        }

        return result;
    }

    BigInteger.prototype.add = function(amount) { return this.multiplyAndAdd(1, amount); }
    BigInteger.prototype.multiply = function(amount) { return this.multiplyAndAdd(amount, 0); }

    addTest("BigInteger.prototype.add", function(assert) {
        function testBigInteger(description, bigInt, digits) {
            assert.arrayEquals(digits, bigInt.digits, description);
        }

        var zero = new BigInteger(8);

        testBigInteger("0 + 1", zero.add(1), [1]);
        testBigInteger("0 + 8", zero.add(8), [0, 1]);
        testBigInteger("0 + 9", zero.add(9), [1, 1]);
        testBigInteger("0 + 64", zero.add(64), [0, 0, 1]);
        testBigInteger("0 + 65", zero.add(65), [1, 0, 1]);
        testBigInteger("0 + 111", zero.add(111), [7, 5, 1]);
        testBigInteger("0 + -8", zero.add(-8), [0, -1]);

        var ten = zero.add(10);

        testBigInteger("10 + -1", ten.add(-1), [1, 1]);
        testBigInteger("10 + -2", ten.add(-2), [0, 1]);
        testBigInteger("10 + -10", ten.add(-10), [0, 0]);
        testBigInteger("10 + -11", ten.add(-11), [-1, 0]);
        testBigInteger("10 + -11 + 11", ten.add(-11).add(11), ten.digits);
        testBigInteger("10 + -11 + 66", ten.add(-11).add(66), [1, 0, 1]);
    });

    addTest("BigInteger.prototype.multiply", function(assert) {
        function testBigInteger(description, bigInt, digits, negative) {
            assert.arrayEquals(digits, bigInt.digits, description);
        }

        var zero = new BigInteger(8);
        var one = zero.add(1);

        testBigInteger("1 * 0", one.multiply(0), [0]);
        testBigInteger("1 * 1", one.multiply(1), [1]);
        testBigInteger("1 * 8", one.multiply(8), [0, 1]);
        testBigInteger("1 * 9", one.multiply(9), [1, 1]);
        testBigInteger("1 * 64", one.multiply(64), [0, 0, 1]);
        testBigInteger("1 * 65", one.multiply(65), [1, 0, 1]);
        testBigInteger("1 * 111", one.multiply(111), [7, 5, 1]);
        testBigInteger("1 * -1", one.multiply(-1), [-1]);
        testBigInteger("1 * -8", one.multiply(-8), [0, -1]);

        var two = one.add(1);

        testBigInteger("2 * 0", two.multiply(0), [0]);
        testBigInteger("2 * 1", two.multiply(1), [2]);
        testBigInteger("2 * 8", two.multiply(8), [0, 2]);
        testBigInteger("2 * 9", two.multiply(9), [2, 2]);
        testBigInteger("2 * 64", two.multiply(64), [0, 0, 2]);
        testBigInteger("2 * 65", two.multiply(65), [2, 0, 2]);
        testBigInteger("2 * 111", two.multiply(111), [6, 3, 3]);
        testBigInteger("2 * -1", two.multiply(-1), [-2]);
        testBigInteger("2 * -8", two.multiply(-8), [0, -2]);

        testBigInteger("-1 * 5", zero.add(-1).multiply(5), [-5]);
    });

    BigInteger.prototype.convertToBase = function(newBase) {
        if (this.base == newBase) {
            return this;
        }
        var currentValue = new BigInteger(newBase);

        for (var i = this.digits.length - 1; i >= 0; --i) {
            currentValue = currentValue.multiplyAndAdd(this.base, this.digits[i]);
        }

        return currentValue;
    }

    addTest("BigInteger.prototype.convertToBase", function (assert) {
        function testBigInteger(description, bigInt, digits, negative) {
            assert.arrayEquals(digits, bigInt.digits, description);
        }

        var zero = new BigInteger(8);
        var one = zero.add(1)
        testBigInteger("0 base 8 -> 10", zero.convertToBase(10), []);
        testBigInteger("1 base 8 -> 10", one.convertToBase(10), [1]);
        testBigInteger("8 base 8 -> 10", zero.add(8).convertToBase(10), [8]);
        testBigInteger("-1 base 8 -> 10", zero.add(-1).convertToBase(10), [-1]);
        testBigInteger("-9 base 8 -> 10", zero.add(-9).convertToBase(10), [-9]);
        testBigInteger("66 base 8 -> 10", zero.add(66).convertToBase(10), [6, 6]);
    });

    BigInteger.prototype.toString = function (base) {
        if (base === undefined) {
            base = 10;
        }

        var numberInBase = this.convertToBase(base);

        // Prune any zeros from the end of the array.
        var lastNonZeroIndex = numberInBase.digits.reduce(function (workingIndex, d, i) {
            if (d == 0) {
                return workingIndex;
            } else {
                return i;
            }
        }, -1);

        if (lastNonZeroIndex < numberInBase.digits.length - 1) {
            numberInBase.digits = numberInBase.digits.slice(0, lastNonZeroIndex + 1);
        }

        if (numberInBase.digits.length > 0) {
            var isNegative = numberInBase.digits.reduce(function (previous, current) { return previous || current < 0}, false);
            return (isNegative ? "-" : "") + numberInBase.digits.reverse().map(function (n) { return Math.abs(n).toString(base); }).join("");
        } else {
            return "0";
        }
    }

    addTest("BigInteger.prototype.toString", function (assert) {
        var zero = new BigInteger(2);
        assert.equals("255", zero.add(255).toString(), "255 in decimal");
        assert.equals("ff", zero.add(255).toString(16), "255 in hex");
        assert.equals("-255", zero.add(-255).toString(), "-255 in decimal");
        assert.equals("-ff", zero.add(-255).toString(16), "255 in hex");

        zero = new BigInteger(7);
        assert.equals("255", zero.add(255).toString(), "255 in decimal");
        assert.equals("ff", zero.add(255).toString(16), "255 in hex");
        assert.equals("-255", zero.add(-255).toString(), "-255 in decimal");
        assert.equals("-ff", zero.add(-255).toString(16), "255 in hex");

        zero = new BigInteger(16);
        assert.equals("0", zero.add(256).add(-256).toString(), "0 + 256 - 256 in hex");
        assert.equals("0", zero.add(256).add(-256).toString(16), "0 + 256 - 256 in hex");
    });

    BigInteger.fromString = function (str, base, targetBase) {
        if (base == undefined) {
            base = 10;
        }

        var multiplier = 1;
        if (str.length > 0 && str[0] == "-") {
            multiplier = -1;
            str = str.substr(1);
        }
        var temp = new BigInteger(base);
        temp.digits = str.split("").reverse().map(function (d) { return parseInt(d, base) * multiplier; });

        return temp.convertToBase(targetBase);
    }

    addTest("BigInteger.fromString", function (assert) {
        assert.arrayEquals([3, 2, 1], BigInteger.fromString("123", 10, 10).digits, "123 decimal");
        assert.arrayEquals([3, 2, 1], BigInteger.fromString("123", 16, 16).digits, "123 hex");
        assert.arrayEquals([0xc, 0xb, 0xa], BigInteger.fromString("abc", 16, 16).digits, "abc hex");
        assert.arrayEquals([0xb, 0x7], BigInteger.fromString("123", 10, 16).digits, "123 decimal -> hex");
        assert.arrayEquals([-3, -2, -1], BigInteger.fromString("-123", 10, 10).digits, "-123 decimal");
        assert.arrayEquals([-3, -2, -1], BigInteger.fromString("-123", 16, 16).digits, "-123 hex");
        assert.arrayEquals([-0xb, -0x7], BigInteger.fromString("-123", 10, 16).digits, "-123 decimal -> hex");
    });

    addTest("BigInteger add 100,000 times.", function (assert) {
        var number = new BigInteger();
        for (var i = 0; i < 100000; ++i) {
            number = number.add(i);
        }
        assert.equals(number.toString(), "4999950000", "Sum all numbers from 1 to 100,000.");
    })

    addTest("Number add 100,000 times.", function (assert) {
        var number = 0;
        for (var i = 0; i < 100000; ++i) {
            number += i;
        }
        assert.equals(number.toString(), "4999950000", "Sum all numbers from 1 to 100,000.");
    })

    return BigInteger;
})();