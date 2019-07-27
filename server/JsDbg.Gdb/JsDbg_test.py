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

    def test_Parse(self):
        # At this point, this test just tests that Python can parse JsDbg.py
        # We rely on the dejagnu-based tests to ensure functionality for now.
        pass

if __name__ == '__main__':
    unittest.main()
