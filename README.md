# JsDbg: debugger extensions in the browser
JsDbg is a platform for debugger extensions written for the browser in HTML/JS/CSS.  The extensions currently written for it aid debugging Edge and IE.

Goals:
- Low barrier to entry for new extensions
- Enable interactive extensions with rich UI
- Make sharing easy

### How do I use it?
1. Since the current set of extensions target the web platform, attach WinDbg to Microsoft Edge, IE 11, or any process hosting mshtml or edgehtml.
2. In WinDbg, run the following command: `$$><\\iefs\users\psalas\jsdbg\jsdbg.script`
3. The JsDbg server will launch and will open your default browser to [http://localhost:50000/](http://localhost:50000/).  The first time you run JsDbg, you may be prompted for elevation to register [DIA](https://msdn.microsoft.com/en-us/library/x93ctkx8.aspx).

**Note:** Since it's difficult to use and debug the same process, if you are trying to debug your default browser, you should open [http://localhost:50000/](http://localhost:50000/) in a separate browser.

### What extensions are included?
The most powerful extensions are the ones that show you the "three trees" of Trident: the markup (MarkupTree), layout (BoxTree), and display trees (DisplayTree).

MarkupTree, for example, will display the internal representation of the DOM.  For example, here's a look at the DOM of bing.com:

![Bing MarkupTree](./readme/markuptree_1.png "Bing MarkupTree") 

Seeing structure is useful, but since this extension is interactive we can inspect properties of the tree.  If we want to look at the `_pFF` field of `CTreeNode` we can do so with a bit of JavaScript:

![Adding a field](./readme/markuptree_2.png "Adding a field")

Documentation for the available APIs is available just above the code area as well as in the Documentation extension.  In addition to writing our own code, we can browse the properties that other users have written.

![Browsing other users' fields](./readme/markuptree_3.png "Browsing other users' fields")

While the example above just displayed a value, we can write whatever code we want.  For example, we can change the item's color if it has been marked invalid:

![Using color to visualize a value](./readme/markuptree_4.png "Using color to visualize a value")

The code you write is automatically saved so that it will be available the next time you use the extension.

## Writing Extensions

An extension is a directory that contains an `extension.json` file and some web content.  An `extension.json` is made up of a few fields, of which only `name` is required:

<table>
    <tr><th>Name</th><th>Type</th><th>Description</th></tr>
    <tr>
        <td><code>name</code> <strong>(required)</strong></td>
        <td>string</td>
        <td>The name of the extension.  Content will be served from /[extension-name]/ when the extension is loaded.  The extension name should be unique, since JsDbg will not load multiple extensions with the same name.</td>
    </tr>
    <tr>
        <td><code>description</code></td>
        <td>string</td>
        <td>A description of the extension.</td>
    </tr>
    <tr>
        <td><code>author</code></td>
        <td>string</td>
        <td>The name of the author(s) or maintainer(s).</td>
    </tr>
    <tr>
        <td><code>dependencies</code></td>
        <td>array of strings</td>
        <td>An array of paths to other extensions that this extension depends on.  Paths are relative to the default extension directory, so built-in extensions can typically be referred to by name (e.g. <code>dbgobject</code>).  These extensions will be automatically loaded when the extension is loaded.</td>
    </tr>
    <tr>
        <td><code>includes</code></td>
        <td>array of strings</td>
        <td>An array of JS or CSS filenames in this extension's directory that should be included whenever this extension is used.  If other extensions take a dependency on this extension, these files will be included automatically.</td>
    </tr>
    <tr>
        <td><code>augments</code></td>
        <td>array of strings</td>
        <td>An array extension names that this extension augments.  Specifying an extension name here means that whenever that extension is used, this extension will be loaded as well.</td>
    </tr>
    <tr>
        <td><code>headless</code></td>
        <td>bool</td>
        <td>Indicates if the extension should not be listed on the launch page when loaded.  Used for extensions do not present UI of their own but are consumed by other extensions.</td>
    </tr>
</table>

Extensions can be loaded, unloaded, and shared with the built-in "Extensions" extension.

## Contributing

If you're interested in contributing to JsDbg, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Questions?

Contact PSalas with any questions or suggestions!