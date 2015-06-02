"use strict";

var PointerMath = (function() {

    function Pointer(value) {
        if (typeof(value) == typeof("")) {
            var base = 10;
            if (value.indexOf("0x") == 0) {
                base = 16;
                value = value.substr(2);
            } else if (value.indexOf("0o") == 0) {
                base = 8;
                value = value.substr(2);
            } else if (value.indexOf("0b") == 0) {
                base = 2;
                value = value.substr(2);
            }

            this.value = BigInteger.fromString(value, base);
        } else if (typeof(value) == typeof(0)) {
            this.value = (new BigInteger()).add(value);
        } else {
            this.value = new BigInteger();
        }
    }

    Pointer.prototype = {
        toString: function() { return "0x" + this.value.toString(16); },
        add: function(amount) {
            var result = new Pointer();
            result.value = this.value.add(amount);
            return result;
        },
        equals: function(other) {
            return this.toString() == other.toString();
        }
    }

    if (Tests) {
        var testSuite = Tests.CreateTestSuite("PointerMath.Pointer", "Tests for the PointerMath.Pointer type.");
        
        Tests.AddTest(testSuite, "PointerMath.Pointer constructor", function (assert) {
            assert.equals("0xabc", (new Pointer("0xabc")).toString(), "0xabc");
            assert.equals("0x7", (new Pointer("0b111")).toString(), "0b111");
            assert.equals("0x9", (new Pointer("0o11")).toString(), "0o11");
            assert.equals("0xb", (new Pointer("11")).toString(), "11");
            assert.equals("0xb", (new Pointer(11)).toString(), "11 as number");
        });

        Tests.AddTest(testSuite, "PointerMath.Pointer.prototype.add", function (assert) {
            assert.equals("0xabc", new Pointer("0xab0").add(0xc).toString(), "0xab0 + 0xc");
            assert.equals("0xffffffffffff1234", new Pointer("0xffffffffffff0000").add(0x1234).toString(), "0xffffffffffff0000 + 0x1234");
            assert.equals("0xffffffffffff0000", new Pointer("0xffffffffffff1234").add(-0x1234).toString(), "0xffffffffffff1234 - 0x1234");
        });
    }

    return {
        Pointer: Pointer
    };
})();