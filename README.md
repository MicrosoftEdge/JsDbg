# JsDbg: debugger extensions in the browser
JsDbg is a platform for debugger extensions written for the browser in HTML/JS/CSS.  The extensions currently written for it aid debugging Edge and IE.

Goals:
- Low barrier to entry for new extensions
- Enable interactive extensions with rich UI
- Make sharing easy

### How do I use it?
1. **(Optional)** Install the JsDbg launcher using
    ```
    \\iefs\users\psalas\jsdbg\install.cmd
    ```

    which will copy an extension to your local WinDbg installation.
2. Attach WinDbg to Microsoft Edge, IE 11, or any process hosting `mshtml.dll` or `edgehtml.dll` (any process will work, but the current set of extensions target `mshtml.dll` and `edgehtml.dll`).
3. If you installed the launcher in step 1, in WinDbg, run

    ```
    !jsdbg.launch
    ```

    If the launcher is not installed, instead run

    ```
    $$><\\iefs\users\psalas\jsdbg\jsdbg.script
    ```

4. The JsDbg server will launch and will navigate a web browser to [http://localhost:50000/](http://localhost:50000/).  The first time you run JsDbg, you may be prompted for elevation to register [DIA](https://msdn.microsoft.com/en-us/library/x93ctkx8.aspx).

**Note:** Since it's difficult to use and debug the same process, if you are trying to debug your default browser, you should open [http://localhost:50000/](http://localhost:50000/) in a secondary browser (JsDbg works in Edge, IE 11, and Chrome).

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

## Writing New Extensions or Contributing to JsDbg

If you're interested in writing a new extension or contributing to JsDbg see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Questions?

Contact PSalas with any questions or suggestions!