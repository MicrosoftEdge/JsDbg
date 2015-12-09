# Contributing to JsDbg

Thanks for taking the time to contribute to JsDbg!  There are a few different ways to contribute to JsDbg.

## Bugs or Feature Suggestions

If you notice something wrong with JsDbg or have an idea for how JsDbg can be better, we'd love to hear from you. Feel free to:
* Send mail to jsdbgusers@microsoft.com
* Send feedback within JsDbg
* Open a bug or work item in VSTS

## JsDbg Architecture

JsDbg has three main components:

1. A web server and debugger client built in C#, located in the `js-dbgeng` directory.
2. A JavaScript interface to the server, located in the `wwwroot` directory.
3. A set of JavaScript extensions, located in the `extensions` directory.