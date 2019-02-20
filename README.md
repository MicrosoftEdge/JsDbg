# JsDbg: Browser-based debugging extensions
JsDbg is a tool that provides developers with a web-based platform for debugger extensions. Unlike traditional debugging extensions that are debugger specific, JsDbg extensions are written with web technologies to run in the browser, which allows them to work across platforms and debuggers. By leveraging the benefits of HTML/CSS/JS, the extensions can also have richer user interfaces and functionality than what is typically present in a debugging extension.

## [Setup JsDbg](#setup-jsdbg)

To set up your debugger for JsDbg usage, please follow the steps below.

### WinDbg

1. Download the [JsDbg WinDbg extension](https://aka.ms/jsdbg-windbg). (This extension changes infrequently because JsDbg extensions can be updated without updating the WinDbg extension. [Last update: Jan 30th, 2019])

2. Copy jsdbg.dll into the `winext` folder located next your `windbg.exe` installation. Make sure to use the x64 version of the dll for 64-bit WinDbg, and the x86 version for 32-bit WinDbg.

### Visual Studio debugger

1. Install the [JsDbg Visual Studio (VS) extension](https://aka.ms/jsdbg-visualstudio). (This extension should be able to update without a re-install. To install the update, restart VS, use the extension once [see [using JsDbg](#using-jsdbg) below], and then restart VS again.)

## [Using JsDbg](#using-jsdbg)

To use JsDbg extensions in your debugging workflow, please follow the steps below. Make sure you have set up your debugger for JsDbg usage first [see [setup JsDbg](#setup-jsdbg) above].

### WinDbg

1. Attach WinDbg to the desired Microsoft Edge or Chromium process.

2. In the WinDbg command window, run `!jsdbg.jsdbg`.

3. The JsDbg server will launch and prompt you to select a browser. If the debugger is attached to one browser, it is recommended that you choose a different browser for JsDbg.

### Visual Studio debugger

1. Attach the VS debugger to the desired Microsoft Edge or Chromium process.

2. Break into the running process using the `Pause` icon on the Debug toolbar or `Debug -> Break All`.

3. Launch JsDbg by clicking the `JS` icon on the Debug toolbar or `Tools -> Launch JsDbg`.

4. The JsDbg server will launch and prompt you to select a browser. If the debugger is attached to one browser, it is recommended that you choose a different browser for JsDbg.

# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

See [Contributing to JsDbg](./CONTRIBUTING.md) for more details about contributing to this project.

# Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.