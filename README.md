# JsDbg: debugger extensions in the browser
JsDbg is a platform for debugger extensions written for the browser in HTML/JS/CSS.  The extensions currently written for it aid debugging Edge and IE.  The primary goals are to lower the barrier to writing extensions as much as possible, while also enabling interactive extensions with rich UI.

### How do I use it?
1. **(Optional)** If you're debugging locally, install the JsDbg launcher using
    ```
    \\iefs\users\psalas\jsdbg\install.cmd
    ```

    which will copy a small extension to your local WinDbg installation.
2. Attach WinDbg to Microsoft Edge, IE 11, or any process hosting `mshtml.dll` or `edgehtml.dll` (any process will work, but the current set of extensions target `mshtml.dll` and `edgehtml.dll`).
3. If you installed the launcher in step 1, in WinDbg, run

    ```
    !jsdbg.launch
    ```

    If you're connected to a remote or don't want to use the launcher, run

    ```
    $$><\\iefs\users\psalas\jsdbg\jsdbg.script
    ```

4. The JsDbg server will launch and prompt you to select a browser. If the debugger is attached to one browser, using a different browser for JsDbg generally works best; e.g. if the debugger is attached to Edge, use Chrome or IE.  You may also be prompted for elevation to register [DIA](https://msdn.microsoft.com/en-us/library/x93ctkx8.aspx) the first time symbols are required.

### What extensions are included?

The most powerful extensions are the ones that show you the "three trees" of Trident: the markup (MarkupTree), layout (BoxTree), and display trees (DisplayTree).

MarkupTree, for example, will display the internal representation of the DOM.  Here's a look at the DOM of bing.com:

![Bing MarkupTree](./readme/markuptree_1.png "Bing MarkupTree") 

Seeing structure is useful, but since this extension is interactive we can inspect properties of the tree.  If we want to see the text in each text node, we can click on the CDOMTextNode type and enable the "Text" field to see the contents of the text nodes:

![Adding a field](./readme/markuptree_2.png "Adding a field")

Just below "Text" you can see all the fields on the CDOMTextNode type; we could show any of them as well.  Or, similar to a watch window, we can expand those fields by clicking the type name.  For example, the parent element's tag:

![Adding a field on a secondary object](./readme/markuptree_3.png "Adding a field on a secondary object")

One of the most powerful parts of the tree viewer is being able to add your own custom properties or visualizations.  One of the fields on `CTreeNode` is `_fIFFValid` which indicates whether the computed styles are up-to-date for that element.  Of course, seeing the value is trivial:

![Adding the _fIFFValid field](./readme/markuptree_4.png "Adding the _fIFFValid field")

But with a little bit of JavaScript, we can visualize this value more easily across the tree.  Just below each type is the "Extend" button, which lets you write visualizations or even synthetic fields, defined solely in script!  We'll write some code that reads the value of the `_fIFFValid` field and sets the background to red or green accordingly:

![Visualizing the _fIFFValid field with color](./readme/markuptree_5.png "Visualizing the _fIFFValid field with color")

And the final result:

![Viewing the visualization](./readme/markuptree_6.png "Viewing the visualization")

With the visualization applied, it's easy to see that most of the nodes underneath the `<head>` element don't have styles computed, which makes sense because they're not rendered.  The code you write is automatically saved so that it will be available the next time you use the extension.

## Writing New Extensions or Contributing to JsDbg

If you're interested in writing a new extension or contributing to JsDbg see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Questions?

Contact PSalas with any questions or suggestions!