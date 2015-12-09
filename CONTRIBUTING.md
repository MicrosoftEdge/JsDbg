# Contributing to JsDbg

Thanks for taking the time to contribute to JsDbg!  There are a few different ways to contribute to JsDbg.

## Bugs or Feature Suggestions

If you notice something wrong with JsDbg or have an idea for how JsDbg can be better, we'd love to hear from you. Feel free to:
* Join or send mail to the [JsDbg Users](mailto:jsdbgusers@microsoft.com) alias 
* Send feedback using the form in JsDbg
* Open a bug or work item in [VSTS](http://aka.ms/jsdbgwork)

## Contributing Code

Contributions to JsDbg are welcome!  JsDbg has three main components:

1. A web server and debugger client built in C#, located in the `js-dbgeng` directory.
2. A JavaScript interface to the server, located in the `wwwroot` directory.
3. A set of JavaScript extensions.  Extensions included with JsDbg are located in the `extensions` directory.

The first two components (`jsdbg.exe` and `jsdbg.js`) are designed to provide a minimal interface between extensions and the debugger;
all user-facing functionality is provided by extensions.  The core JsDbg APIs relate to type information, reading from memory, loading extensions,
and persistent storage.  For example:

```
JsDbg.LookupTypeSize(module, type, callback);
JsDbg.LookupFieldOffset(module, type, field, callback);
JsDbg.ReadNumber(pointer, size, isUnsigned, isFloat, callback);
JsDbg.SetPersistentData(data, callback);
```

You may notice that each of these APIs takes a callback function; the communication the browser and the debugger is asynchronous.  More on this in a bit.

Most code written for JsDbg actually does not use the core APIs.  Several extensions provide useful abstractions over the core APIs.  First, we'll define what an extension is.

### Anatomy of an Extension

An extension in JsDbg is a directory containing an `extension.json` file and some web content (HTML/CSS/JS).  The `extension.json` file acts as a manifest, declaring the name of the extension, its dependencies, and the files it includes.  For example, here's the manifest of the DbgObject extension:

```json
{
    "name": "DbgObject",
    "author": "Peter Salas",
    "description": "Convenience library for navigating objects in memory.",
    "headless": true,
    "includes": ["dbgobject.js"],
    "dependencies": ["promise", "pointermath", "memorycache", "help"],
    "augments": ["documentation"]
}
```

The `name` field is the only required field.  When an extension is loaded into JsDbg, the `name` specifies where the content in the directory will be served; assuming JsDbg is serving on port 50000, `dbgobject.js` will be available at `http://localhost:50000/dbgobject/dbgobject.js`.

The last two fields are interesting as well.

Specifying an extension in `dependencies` has two effects.  First, when this extension is first loaded by JsDbg, the extensions listed will be loaded first if they are not already loaded.  Second, whenever this extension is used in the browser, the JS and CSS files of the dependencies will be loaded in the page first.  For DbgObject, this ensures that whenever we're using dbgobject.js, the script files associated with the `promise`, `pointermath`, `memorycache`, and `help` extensions will be loaded as well.

The last field, `augments`, allows extensions to extend or augment another extension in the browser.  For DbgObject, whenever the `documentation` extension is used in the browser, `dbgobject.js` will also be injected into the page.  Specifically, this allows DbgObject's documentation to be listed along with the other extensions, without the `documentation` extension needing to know which extensions are loaded.

Going through each of the fields in detail:

Name | Type | Description
-----|------|------------
`name`&nbsp;**(required)** | string | The name of the extension.  Content will be served from /[extension-name]/ when the extension is loaded.  The extension name should be unique, since JsDbg will not load multiple extensions with the same name.
`author` | string | The name of the author(s) or maintainer(s).
`description` | string | A description of the extension.
`headless` | bool | Indicates if the extension should not be listed on the launch page when loaded.  Used for extensions do not present UI of their own but are consumed by other extensions.
`includes` | array of strings | An array of JS or CSS filenames in this extension's directory that should be included whenever this extension is used.  If other extensions take a dependency on this extension, these files will be included in the page automatically.
`dependencies` | array of strings | An array of paths to other extensions that this extension depends on.  Paths are relative to the default extension directory, so built-in extensions can typically be referred to by name (e.g. `promise`).  These extensions will be automatically loaded when the extension is loaded.
`augments` | array of strings | An array extension names that this extension augments.  Specifying an extension name here means that whenever that extension is used, this extension will be loaded as well.

### DbgObject

TODO

### Promises and Asynchronicity

TODO
