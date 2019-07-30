#!/usr/bin/python
# Unit tests for JsDbBase.py
# Use "python JsDbgBase_test.py" to run.
import unittest

import JsDbgBase

class TestJsDbg(unittest.TestCase):

    def test_FormatModule(self):
        self.assertEqual(JsDbgBase.FormatModule('/foo/libFoo.so'), 'Foo')
        self.assertEqual(JsDbgBase.FormatModule('/foo/libFoo.so.1'), 'Foo')
        self.assertEqual(JsDbgBase.FormatModule('/foo/libFoo.so.1.2.3'), 'Foo')
        self.assertEqual(JsDbgBase.FormatModule('/foo/mmap_pack_12_libFoo.so.1.2.3'), 'Foo')
        self.assertEqual(JsDbgBase.FormatModule('/foo/chrome'), 'chrome')
        self.assertEqual(JsDbgBase.FormatModule('mmap_hardlink_0_chrome'), 'chrome')

if __name__ == '__main__':
    unittest.main()
