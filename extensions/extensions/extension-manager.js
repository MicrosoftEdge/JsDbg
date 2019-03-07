//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

function createElement(tag, innerHTML, attributes, events) {
    var e = document.createElement(tag);
    if (innerHTML) {
        e.innerHTML = innerHTML;
    }

    if (attributes) {
        for (var key in attributes) {
            e.setAttribute(key, attributes[key]);
        }
    }

    if (events) {
        for (var key in events) {
            e.addEventListener(key, events[key]);
        }
    }
    return e;
}

var loadedExtensions = [];
var recentExtensions = [];
var publishedExtensions = [];


function sectionClicked(e) {
    var target = e.target.getAttribute("data-section");
    var displayed = document.querySelectorAll(".displayed");
    for (var i = 0; i < displayed.length; ++i) {
        displayed[i].className = "";
    }

    e.target.className = "displayed";
    document.getElementById(target).className = "displayed";
}

function init() {
    var headers = document.querySelectorAll("#headers > *");
    for (var i = 0; i < headers.length; ++i) {
        headers[i].addEventListener("click", sectionClicked);
    }

    document.getElementById("loadExtension").addEventListener("click", function() {
        loadExtension(document.getElementById("extensionToLoad").value, /*isMine*/true);
    })

    document.getElementById("extensionToLoad").addEventListener("keyup", function(e) {
        if (e.keyCode == 13) {
            document.getElementById("loadExtension").click();
        }
    })

    document.getElementById("loadPublishedExtension").addEventListener("click", function() {
        CatalogViewer.Instantiate();
    })

    reloadLoadedExtensions(function() {
        var store = Catalog.Load("extension-manager");
        store.all(function(object) {
            if (object.recentlyLoaded) {
                recentExtensions = object.recentlyLoaded;
            }
            if (object.published) {
                publishedExtensions = object.published;
            }

            reloadRecentlyLoaded();
            reloadPublished();
        });
    });

    JsDbg.GetExtensionPath(function(result) {
        document.getElementById("currentPath").value = result.path;
    })

    document.getElementById("changePath").addEventListener("click", function() {
        var newPath = document.getElementById("currentPath").value;
        JsDbg.SetExtensionPath(newPath, function(result) {
            if (result.error) {
                alert(result.error);
            } else {
                reloadLoadedExtensions(reloadRecentlyLoaded);
            }
        });
    });
}

function pushToCatalog() {
    var store = Catalog.Load("extension-manager");
    store.set("recentlyLoaded", recentExtensions);
    store.set("published", publishedExtensions);

    // Any recent extensions that are loaded will be loaded at startup.
    var startupExtensions = recentExtensions.filter(function(e) {
            // Is it in the loadedExtensions list?
            return loadedExtensions.reduce(function(isLoaded, le) { return isLoaded || e.path == le.path; }, false);
        })
        .map(function (e) { return e.path; });

    store.set("startup", startupExtensions);
}

function reloadLoadedExtensions(callback) {
    // Get the loaded extensions.
    JsDbg.GetExtensions(function (result) {
        var loadedDiv = document.getElementById("loadedContent");
        loadedDiv.innerHTML = "";
        result.extensions.sort(function (a, b) { return a.name.localeCompare(b.name); });
        result.extensions
            .map(function (e) {
                var extensionDiv = createExtensionDescription(e);
                extensionDiv.insertBefore(
                    createElement("button", "Unload", null, {
                        "click": function() {
                            unloadExtension(e.name);
                        }
                    }),
                    extensionDiv.childNodes[0]
                );
                return extensionDiv;
            })
            .forEach(function(e) { loadedDiv.appendChild(e); });

        loadedExtensions = result.extensions;

        if (callback && typeof(callback) == typeof(function() {})) {
            callback(result.extensions);
        }
    });
}

function reloadRecentlyLoaded() {
    var recentDiv = document.getElementById("recent");
    recentDiv.innerHTML = "";

    // Clean up the data for any loaded recentExtensions.
    recentExtensions.forEach(function (e) {
        loadedExtensions.forEach(function (le) {
            if (le.path == e.path) {
                e.name = le.name;
                e.description = le.description;
                e.author = le.author;
                e.augments = le.augments;
                e.dependencies = le.dependencies;
                e.headless = le.headless;
            }
        })
    });

    recentExtensions.map(function (e, i) {
        var extensionDiv = createExtensionDescription(e);

        var buttons = createElement("div");
        extensionDiv.insertBefore(buttons, extensionDiv.childNodes[0]);

        buttons.appendChild(
            createElement("button", "Remove", null, {
                "click": function() {
                    recentExtensions.splice(i, 1);
                    reloadRecentlyLoaded();
                    pushToCatalog();
                }
            })
        );

        // Is this extension already loaded ?
        var isLoaded = false;
        loadedExtensions.forEach(function (le) {
            isLoaded = isLoaded || le.name == e.name || le.path == e.path;
        });
        if (!isLoaded) {
            buttons.appendChild(createElement("button", "Load", null, {
                "click": function() {
                    loadExtension(e.path);
                }
            }));
        } else {
            buttons.appendChild(createElement("button", "Unload", null, {
                "click": function() {
                    unloadExtension(e.name);
                }
            }));
        }

        if (e.mine) {
            // Is this extension already listed in the published extensions?
            var isPublished = false;
            publishedExtensions.forEach(function (pe) {
                isPublished = isPublished || pe.path == e.path;
            })
            if (!isPublished) {
                buttons.appendChild(createElement("button", "Publish", null, {
                    "click": function() {
                        if (e.path.indexOf(":\\") == 1) {
                            if (!confirm("The extension appears to be loaded from a local path which others might not be able to access.  Publish it anyway?")) {
                                return;
                            }
                        }
                        publishedExtensions = [e].concat(publishedExtensions);
                        pushToCatalog();
                        reloadRecentlyLoaded();
                        reloadPublished();
                    }
                }));
            } else {
                buttons.appendChild(createElement("button", "Unpublish", null, {
                    "click": function() {
                        unpublishExtension(e.path);
                    }
                }));
            }
        }
        return extensionDiv;
    }).forEach(function(e) { recentDiv.appendChild(e); });

    if (recentExtensions.length == 0) {
        recentDiv.innerHTML = "<div class=\"instructions\">You haven't loaded any extensions.  Load a new extension above.</div>";
    }
}

function reloadPublished() {
    var publishedDiv = document.getElementById("published");
    publishedDiv.innerHTML = "";
    publishedExtensions.map(function (e, i) {
        var extensionDiv = createExtensionDescription(e);
        extensionDiv.insertBefore(createElement("button", "Unpublish", null, {
            "click": function() {
                unpublishExtension(e.path);
            }
        }), extensionDiv.childNodes[0])
        return extensionDiv;
    }).forEach(function(e) { publishedDiv.appendChild(e); });

    if (publishedExtensions.length == 0) {
        publishedDiv.innerHTML = "<div class=\"instructions\">You have not published any extensions.  To publish an extension:<ol><li>Put it on a share that other users can access.</li><li>Load the extension from the share (above).</li><li>From \"My Extensions\" select \"Publish\".</li></ol></div>";
    }
}

function unpublishExtension(extensionPath) {
    for (var i = 0; i < publishedExtensions.length; ++i) {
        if (publishedExtensions[i].path == extensionPath) {
            publishedExtensions.splice(i, 1);
            pushToCatalog();
            reloadPublished();
            reloadRecentlyLoaded();
        }
    }
}

function loadExtension(path, isMine) {
    if (path.match(/\.json$/) || path.match(/\.html$/) || path.match(/\.js$/) || path.match(/\.css$/)) {
        path = path.substr(0, path.lastIndexOf("\\"));
    }

    JsDbg.LoadExtension(path, function(result) {
        if (result.success) {
            document.getElementById("extensionToLoad").value = "";
            reloadLoadedExtensions(function (extensions) {
                for (var i = 0; i < extensions.length; ++i) {
                    if (extensions[i].path == path) {
                        extensions[i].mine = isMine;
                        recentExtensions = [extensions[i]].concat(recentExtensions.filter(function(e) { return e.path != path; }));
                        reloadRecentlyLoaded();
                        pushToCatalog();
                        return;
                    }
                }
            });
        } else {
            alert(result.error);
        }
    });
}

function unloadExtension(extensionName) {
    JsDbg.UnloadExtension(extensionName, function() {
        reloadLoadedExtensions(reloadRecentlyLoaded);
    });
}

function createExtensionDescription(extension) {
    var extensionDiv = createElement("div", null, {"class": "extension"});

    var nameDiv = createElement("div", extension.name, {"class": "name"});
    extensionDiv.appendChild(nameDiv);

    if (extension.description) {
        var descriptionDiv = createElement("div", extension.description, {"class": "description"});
        extensionDiv.appendChild(descriptionDiv);
    }

    if (extension.author) {
        var authorDiv = createElement("div", "Author:&nbsp;" + extension.author, {"class": "author"});
        extensionDiv.appendChild(authorDiv);
    }

    if (extension.dependencies) {
        var dependenciesDiv = createElement("div", "Dependencies:&nbsp;" + extension.dependencies.join(", "), {"class": "dependencies"});
        extensionDiv.appendChild(dependenciesDiv);
    }

    if (extension.augments) {
        var augmentsDiv = createElement("div", "Augments:&nbsp;" + extension.augments.join(", "), {"class": "augments"});
        extensionDiv.appendChild(augmentsDiv);
    }

    if (extension.headless) {
        extensionDiv.appendChild(createElement("div", "(headless)", {"class": "headless"}));
    }

    extensionDiv.appendChild(createElement("div", extension.path, {"class": "path"}));

    return extensionDiv;
}

Loader.OnPageReady(init);