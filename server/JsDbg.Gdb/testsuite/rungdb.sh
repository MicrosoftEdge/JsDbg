#!/bin/sh
set -x
exec gdb -nx \
  -ex 'python import sys' \
  -ex 'python import os' \
  -ex 'python sys.path.insert(0, os.getcwd() + "/..")' \
  -ex 'python import JsDbg' \
  ../bin/test_program
