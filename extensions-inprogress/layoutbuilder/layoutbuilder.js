var LayoutBuilder = (function() {
    var BoxBuilderTypes = {};
    var FieldTypeMap = {};

    function createBoxBuilderTree(pointer) {
        if (pointer) {
            var builder = new DbgObject("mshtml", "Layout::LayoutBuilder", pointer);
            return CreateBoxBuilder(builder);
        }

        return null;
    }

    function CreateBoxBuilder(obj) {
        return Promise.as(obj)
        .then(function (obj) {
            return obj.vtable()
            .then(function (type) {
                if (type == "Layout::LayoutBuilder") {
                    var result = new LayoutBuilder(obj.as("Layout::LayoutBuilder"), "Layout::LayoutBuilder");
                } else if (type in BoxBuilderTypes) {
                    var result = new BoxBuilderTypes[type](obj, type);
                } else {
                    var result = new LayoutBoxBuilder(obj, type);
                }

                return result;
            })
        })
    }

    function LayoutBuilder(layoutBuilder) {
        this.layoutBuilder = layoutBuilder;
        this.childPromise = null;
    }

    LayoutBuilder.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        element.innerHTML = "<p>LayoutBuilder</p> <p>" + this.layoutBuilder.ptr() + "</p> ";
        return FieldSupport.RenderFields(this, this.layoutBuilder, element);
    }

    LayoutBuilder.prototype.getChildren = function() {
        if (this.childPromise == null) {
            this.childPromise = this.layoutBuilder.f("currentBuilder.m_pT")
            .then(function(topBuilder) {
                if (topBuilder.isNull()) {
                    return [];
                } else {
                    return CreateBoxBuilder(topBuilder).then(function(resolvedTopBuilder) {
                        return [resolvedTopBuilder];
                    });
                }
            });
        }
        return this.childPromise;
    }
    FieldTypeMap["LayoutBuilder"] = LayoutBuilder;

    function MapBoxBuilderType(typename, type) {
        BoxBuilderTypes[typename] = type;
    }

    function CreateBoxBuilderType(typename, superType) {
        // For the description, strip "Layout::" and strip the last "Box".
        var name = typename.substr("Layout::".length);
        var fieldName = name;

        var newType = function(boxBuilder, vtableType) {
            superType.call(this, boxBuilder, vtableType);
            this.boxBuilder = this.boxBuilder.as(typename);
        }
        newType.prototype = Object.create(superType.prototype);
        newType.prototype.typename = function() { return name; }
        newType.super = superType;
        newType.prototype.rawTypename = typename;

        MapBoxBuilderType(typename, newType);
        FieldTypeMap[fieldName] = newType;
        return newType;
    }

    function LayoutBoxBuilder(boxBuilder, vtableType) {
        this.boxBuilder = boxBuilder;
        this.childrenPromise = null;
        this.vtableType = vtableType;
    }
    FieldTypeMap["LayoutBoxBuilder"] = LayoutBoxBuilder;

    LayoutBoxBuilder.prototype.typename = function() { return this.vtableType.replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    LayoutBoxBuilder.prototype.createRepresentation = function() {
        var element = document.createElement("div");
        element.innerHTML = "<p>" + this.typename() + "</p> <p>" + this.boxBuilder.ptr() + "</p> ";
        return FieldSupport.RenderFields(this, this.boxBuilder, element);
    }
    LayoutBoxBuilder.prototype.getChildren = function() {
        if (this.childrenPromise == null) {
            this.childrenPromise = this.boxBuilder.f("parentBuilder.m_pT").then(function (parentBuilder) {
                if (parentBuilder.isNull()) {
                    return [];
                } else {
                    return CreateBoxBuilder(parentBuilder).then(function (parentBuilderObj) {
                        return [parentBuilderObj];
                    })
                }
            })
        }
        return this.childrenPromise;
    }

    var ContainerBoxBuilder = CreateBoxBuilderType("Layout::ContainerBoxBuilder", LayoutBoxBuilder);
    var FlowBoxBuilder = CreateBoxBuilderType("Layout::FlowBoxBuilder", ContainerBoxBuilder);
    var ReplacedBoxBuilder = CreateBoxBuilderType("Layout::ReplacedBoxBuilder", ContainerBoxBuilder);
    var TableGridBoxBuilder = CreateBoxBuilderType("Layout::TableGridBoxBuilder", ContainerBoxBuilder);
    var TableBoxBuilder = CreateBoxBuilderType("Layout::TableBoxBuilder", ContainerBoxBuilder);
    var ContainerBoxInitialLayoutBuilder = CreateBoxBuilderType("Layout::ContainerBoxInitialLayoutBuilder", ContainerBoxBuilder);
    var FlowBoxInitialLayoutBuilder = CreateBoxBuilderType("Layout::FlowBoxInitialLayoutBuilder", ContainerBoxInitialLayoutBuilder);
    var InitialLayoutBoxBuilderDriver = CreateBoxBuilderType("Layout::InitialLayoutBoxBuilderDriver", LayoutBoxBuilder);

    return {
        Name: "LayoutBuilder",
        BasicType: "LayoutBoxBuilder",
        BuiltInFields: [],
        TypeMap: FieldTypeMap,
        Create: createBoxBuilderTree,
        Roots: function () { return Promise.as([]); }
    };
})();