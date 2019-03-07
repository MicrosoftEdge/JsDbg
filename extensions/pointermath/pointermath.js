//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var PointerMath = undefined;
Loader.OnLoad(function() {

    function Pointer(value, optionalBase) {
        if (typeof(value) == typeof("")) {
            var base = optionalBase;
            if (value.indexOf("0x") == 0) {
                base = 16;
                value = value.substr(2);
            } else if (value.indexOf("0b") == 0) {
                base = 2;
                value = value.substr(2);
            }

            value = value.replace(/\`/g, "");

            this._value = bigInt(value, base);
        } else if (value instanceof Pointer) {
            this._value = bigInt(value._value);
        } else if (typeof(value) !== typeof(undefined)) {
            this._value = bigInt(value);
        } else {
            this._value = bigInt.zero;
        }
    }

    Pointer.prototype.toString = function() { return "0x" + this._value.toString(16); }
    Pointer.prototype.toFormattedString = function() {
            var hexString = this._value.toString(16);
            if (hexString == "0") {
                return "nullptr";
            } else {
                var length = hexString.length;
                if (length > 8) {
                    // Insert a ` between high and low words.
                    hexString = hexString.substr(0, length - 8) + "`" + hexString.substr(length - 8);
                }
                var padding = "";
                var stopLength = Math.ceil(length / 8) * 8;
                while (length < stopLength) {
                    padding += "0";
                    ++length;
                }
                return "0x" + padding + hexString;
            }
    }
    Pointer.prototype.add = function(amount) {
            return new Pointer(this._value.add(amount));
    }
    Pointer.prototype.value = function() {
            return this._value;
    }
    Pointer.prototype.equals = function(other) {
            return this._value.equals(other._value);
    }
    Pointer.prototype.isNull = function() {
            return this._value.equals(0);
    }

    if (typeof Tests !== "undefined") {
        var testSuite = Tests.CreateTestSuite("PointerMath.Pointer", "Tests for the PointerMath.Pointer type.");

        Tests.AddTest(testSuite, "PointerMath.Pointer constructor", function (assert) {
            assert.equals("0xabc", (new Pointer("0xabc")).toString(), "0xabc");
            assert.equals("0x7", (new Pointer("0b111")).toString(), "0b111");
            assert.equals("0xb", (new Pointer("11")).toString(), "11");
            assert.equals("0xb", (new Pointer(11)).toString(), "11 as number");
            assert.equals("0xb", (new Pointer(new Pointer(11))).toString(), "11 as Pointer");
            assert.equals("0xb", (new Pointer(bigInt(11))).toString(), "11 as BigInteger");
        });

        Tests.AddTest(testSuite, "PointerMath.Pointer.prototype.add", function (assert) {
            assert.equals("0xabc", new Pointer("0xab0").add(0xc).toString(), "0xab0 + 0xc");
            assert.equals("0xffffffffffff1234", new Pointer("0xffffffffffff0000").add(0x1234).toString(), "0xffffffffffff0000 + 0x1234");
            assert.equals("0xffffffffffff0000", new Pointer("0xffffffffffff1234").add(-0x1234).toString(), "0xffffffffffff1234 - 0x1234");
        });

        Tests.AddTest(testSuite, "PointerMath.Pointer.prototype.add", function (assert) {
            assert.equals("0xabc", new Pointer("0xab0").add(0xc).toString(), "0xab0 + 0xc");
            assert.equals("0xffffffffffff1234", new Pointer("0xffffffffffff0000").add(0x1234).toString(), "0xffffffffffff0000 + 0x1234");
            assert.equals("0xffffffffffff0000", new Pointer("0xffffffffffff1234").add(-0x1234).toString(), "0xffffffffffff1234 - 0x1234");
        });

        Tests.AddTest(testSuite, "PointerMath.Pointer.prototype.toString", function (assert) {
            assert.equals("0x0", new Pointer("0xffffffffff").add(-0xffffffffff).toString(), "0xffffffffff - 0xffffffffff");
            assert.equals("0x0", new Pointer(0).toString(), "0");
        });

        Tests.AddTest(testSuite, "PointerMath.Pointer.prototype.toFormattedString", function (assert) {
            assert.equals("nullptr", new Pointer(0).toFormattedString(), "0 => nullptr");
            assert.equals("0x00001234", new Pointer(0x1234).toFormattedString(), "0x1234 => 0x00001234");
            assert.equals("0x00000001`00001234", new Pointer(0x100001234).toFormattedString(), "0x100001234 => 0x00000001`00001234");
        })

        Tests.AddTest(testSuite, "PointerMath addition performance.", function (assert) {
            var pointer = new Pointer(0);
            for (var i = 0; i < 1000000; ++i) {
                pointer = pointer.add(i);
            }
            assert.equals("499999500000", pointer.value().toString(), "Sum of 0 to 999999.");
        });

        Tests.AddTest(testSuite, "JavaScript addition performance.", function (assert) {
            var pointer = 0;
            for (var i = 0; i < 1000000; ++i) {
                pointer += i;
            }
            assert.equals("499999500000", pointer.toString(), "Sum of 0 to 999999.");
        }); 
    }

    PointerMath = {
        Pointer: Pointer
    };
});