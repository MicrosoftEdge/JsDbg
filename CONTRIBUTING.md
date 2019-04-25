# Contributing to JsDbg

Thank you for your interest in contributing to JsDbg! Code contributations, as well as feedback on how the tool can be improved, are more than welcome. Please connect with the maintainers of JsDbg by filing an issue.

## Building and running JsDbg

### Prerequisites

* [Git](https://git-scm.com/)
* [GitHub account](https://github.com/join)
* [Visual Studio (VS) 2017](https://visualstudio.microsoft.com/downloads/)

### Getting the source
The JsDbg source can be obtained from the [JsDbg repository on GitHub](https://aka.ms/jsdbg). The URL for cloning the repository is: `https://github.com/MicrosoftEdge/JsDbg.git`.

### Building JsDbg

Once you have cloned the JsDbg repository, please follow the steps below to build the JsDbg source code.

1. Open `jsdbg.sln` in Visual Studio 2017. The solution file is located in the `server` directory.

2. Build the solution by pressing `F6` or `Build -> Build Solution`.
      * Common build errors and fixes:
         * Missing Windows 10 SDK error - install the correct SDK version (should be specified in the error message) and rebuild the solution.

### Running JsDbg

After you are able to successfully build JsDbg, please follow the steps below to run a local copy of the tool with your debugger.

#### WinDbg

1. Open the Solution Explorer for the JsDbg solution by pressing `Ctrl+W, S` or `View -> Solution Explorer`.

2. Right-click on the `JsDbg.WinDbg` project in Solution Explorer and set it as the start up project by clicking `Set as StartUp Project`.

3. Change the solution configuration to `Debug` using the `Solution Configurations` dropdown on the Standard toolbar or using the `Active solution configuration` dropdown in `Build -> Configuration Manager`.

4. Launch JsDbg by pressing `F5` or `Debug -> Start Debugging` or the `Start` button on the Standard toolbar. You should see a JsDbg command prompt appear asking for a remote debugging connection string.

5. From WinDbg, attach to the desired Microsoft Edge or Chromium process and start a new debugging server using the [.server](https://docs.microsoft.com/en-us/windows-hardware/drivers/debugger/-server--create-debugging-server-) command. (You can also use an existing debugging server if one is present. To view the list of all debugging servers, use the [.servers](https://docs.microsoft.com/en-us/windows-hardware/drivers/debugger/-servers--list-debugging-servers-) command.)

6. Copy the remote debugging string from WinDbg and paste it into the JsDbg command prompt, and hit `Enter`.

7. The JsDbg server will remotely connect to your debugger and start running. You will be prompted to select a browser. If the debugger is attached to one browser, it is recommended that you choose a different browser for JsDbg.

#### Visual Studio debugger

1. Open the Solution Explorer for the JsDbg solution by pressing `Ctrl+W, S` or `View -> Solution Explorer`.

2. Right-click on the `JsDbg.VisualStudio` project in Solution Explorer and set it as the start up project by clicking `Set as StartUp Project`.

3. Configure the JsDbg VS extension to work with the [Visual Studio Experimental Instance](https://docs.microsoft.com/en-us/visualstudio/extensibility/the-experimental-instance), if you have not already done so. To do this, please follow the steps below.
      1. Open the `JsDbg.VisualStudio` project properties by pressing `Alt+Enter` or right-click on the `JsDbg.VisualStudio` project in Solution Explorer and then click `Properties`.
      2. Navigate to the `Debug` pane and look for the `Command line arguments` text box under `Start options`.
      3. Add the string `/RootSuffix Exp` as a command line argument.

4. Launch `JsDbg.VisualStudio` by pressing `F5` or `Debug -> Start Debugging` or the `Start` button on the Standard toolbar. You should see the Visual Studio Experimental Instance launch.

5. Attach to the desired Microsoft Edge or Chromium process by using `Ctrl+Alt+P` or `Debug -> Attach to Process` or the `Attach` button on the Standard toolbar and selecting from the process list.

6. Break into the running process using the `Pause` icon on the Debug toolbar or `Debug -> Break All`. (Make sure you do this from the VS Experimental Instance and not the main copy of VS.)

7. Launch JsDbg by clicking the `JS` icon on the Debug toolbar or `Tools -> Launch JsDbg`. (Make sure you do this from the VS Experimental Instance and not the main copy of VS.)

8. The JsDbg server will launch and prompt you to select a browser. If the debugger is attached to one browser, it is recommended that you choose a different browser for JsDbg.

## Components within JsDbg

JsDbg is made up of two main components:

1. A C#-based web server that queries the debugger and symbol files, and serves debugging information to the web client.
2. A web client compromised of extensions written in HTML/CSS/JavaScript.

Interactions between the web server and client occur using the WebSocket protocol.

### JsDbg server

The JsDbg server contains several sub-components, including one component per supported debugger. Because there are different APIs for querying/driving each debugger, the implementations for each of these pieces can vary greatly and code shareability is limited. Every debugger-specific component implements a common `IDebugger` interface, which is provided by the `JsDbg.Core` component. `JsDbg.Core` interfaces with the debugger as well as the symbol files, and serves the client with debugging information.

### JsDbg client

The JsDbg client is compromised almost entirely of [extensions](#anatomy-of-an-extension). Some extensions are user-facing, while many are internal and run "behind-the-scenes". At the lowest level, the `jsdbg` extension is responsible for relaying debugging information to the rest of the web client. The `jsdbg-transport` extension (a sub-extension of `jsdbg`) sends/receives WebSocket messages to/from the server, and the `jsdbg-core` extension (also a sub-extension of `jsdbg`) provides an API layer on top of `jsdbg-transport` for all other extensions. Some examples of `jsdbg-core` APIs are:

* JsDbg.LookupTypeSize(module, type, callback);

* JsDbg.LookupFieldOffset(module, type, field, callback);

* JsDbg.LookupGlobalSymbol(module, symbol, callback);

* JsDbg.ReadNumber(pointer, size, isUnsigned, isFloat, callback);

* JsDbg.GetCallStack(frameCount, callback);


#### [Anatomy of an Extension](#anatomy-of-an-extension)

An extension in JsDbg is a directory containing an extension manifest (called `extension.json`), which declares the name and other metadata for the extension, and some web content files (HTML/CSS/JS). For example, below are the contents of `extension.json` for the `DbgObject` extension.

```
{
    "name": "DbgObject",
    "author": "Peter Salas",
    "description": "Convenience library for navigating objects in memory.",
    "headless": true,
    "dependencies": ["dbgobject/core", "dbgobject/descriptions", "dbgobject/extended-fields", "dbgobject/arrays", "dbgobject/actions"],
    "includes": ["promised-dbgobject.js"],
    "augments": ["documentation", "tests"]
}
```

Below are more details about each of the fields in the extension manifest.

* Field: `name` **(required)** | Type: string

  The name of the extension. This is the only required field in `extension.json`. When an extension is loaded, its name specifies where the content in the directory will be served. So, for example, if JsDbg is being served on port 50000, the `DbgObject` extension will be available at `http://localhost:50000/dbgobject`. The extension name must be unique. Extension names are case-insensitive.

* Field: `author` | Type: string

  The name of the extension author.

* Field: `description` | Type: string

  A description of the extension.

* Field: `headless` | Type: bool

  Indicates whether the extension should be listed on the launch page and toolbar when loaded. If true, the extension will not be listed.

* Field: `includes` | Type: array of strings

  An array of JS or CSS filenames in this extension's directory that should be included whenever this extension is used. The files specified here will also be included for other extensions that take a dependency on this extension.

* Field: `dependencies` | Type: array of strings

  An array of paths for other extensions that this extension depends on. When this extension is loaded, the extensions listed here will be loaded first (if they are not already loaded), and the JS and CSS files for the dependent extensions will be included. Paths are relative to the default extension directory.

* Field: `augments` | Type: array of strings

  An array of extension names that this extension augments/extends. Whenever an extension specified here is loaded, this extension will be loaded and its JS and CSS files will be included.

* Field: `targetModules` | Type: array of strings

  An array of module names that this extension targets. This extension will only be served if one or more of its target modules are loaded in the debugger. This extension will target all modules if this field is excluded or if an empty array is provided.


#### DbgObject

Most debugging extensions in JsDbg are written on top of the `DbgObject` extension. `DbgObject` provides a representation of objects in memory, and builds on top of `jsdbg-core` to provide a more useful set of APIs for navigating these objects. Some examples of `DbgObject` APIs are:

* DbgObject.create(type, pointer, bitcount, bitoffset, objectSize, wasDereferenced);

* DbgObject.locals(moduleName, method, symbolName);

* DbgObject.prototype.deref();

* DbgObject.prototype.f(field);

* DbgObject.prototype.isType(type);

`DbgObjectType` goes hand-in-hand with `DbgObject` and holds information about the type of the object. Every `DbgObject` will have exactly one `DbgObjectType`. (Casting works by creating a new `DbgObject` of the base/child type.)

#### Writing a new extension

All extensions have a similar make-up [see [anatomy of an extension](#anatomy-of-an-extension) above], but the implementation can vary depending on what the extension is doing and how it should be rendered/used. For extensions that require a tree-based view, the `tree-extension-template` is the best place to start. (The "new-extension" video in the `examples` extension goes over this in more detail.)

If you wish to write a new JsDbg extension, please start by filing an issue and connecting with the JsDbg maintainers.

#### Debugging JsDbg extensions

Because JsDbg extensions are web-based, they can be debugged using common web debugging tools like F12.

## Tasks/Promises and Asynchronicity

Communication between the web client, web server and debugger is mostly asynchronous. As such, a large amount of code in JsDbg is written using asynchronous programming patterns, ex. tasks in C# and promises in JavaScript.
