#!/usr/bin/python
# Unit tests for JsDb.py
# Use "python JsDbg_test.py" to run.
import sys
import unittest

class GdbModule(object):
    COMMAND_USER = 1
    COMMAND_MAINTENANCE = 2

    PARAM_BOOLEAN = 1

    class Command(object):
        def __init__(self, name, type):
            pass

    class Parameter(object):
        def __init__(self, name, cmd_class, type):
            pass

sys.modules['gdb'] = GdbModule
import JsDbg

class TestJsDbg(unittest.TestCase):

    def test_FormatModule(self):
        self.assertEqual(JsDbg.FormatModule('/foo/libFoo.so'), 'Foo')
        self.assertEqual(JsDbg.FormatModule('/foo/libFoo.so.1'), 'Foo')
        self.assertEqual(JsDbg.FormatModule('/foo/libFoo.so.1.2.3'), 'Foo')
        self.assertEqual(JsDbg.FormatModule('/foo/mmap_pack_12_libFoo.so.1.2.3'), 'Foo')
        self.assertEqual(JsDbg.FormatModule('/foo/chrome'), 'chrome')
        self.assertEqual(JsDbg.FormatModule('mmap_hardlink_0_chrome'), 'chrome')

if __name__ == '__main__':
    unittest.main()
