//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var CompositorFrame = undefined;
Loader.OnLoad(function () {
  CompositorFrame = {
    Tree: new DbgObjectTree.DbgObjectTreeReader(),
    Renderer: new DbgObjectTree.DbgObjectRenderer(),
    InterpretAddress: function (address) {
      var voidObj = DbgObject.create("ntdll!void", address);
      if (!voidObj.isNull()) {
        return voidObj.as(Chromium.GpuProcessType("viz::CompositorFrame"));
      }
      return DbgObject.NULL;
    },
    GetRoots: function () {
      return Promise.all([]);
    },
    DefaultTypes: []
  };

  CompositorFrame.Tree.addChildren(Chromium.GpuProcessType("viz::CompositorFrame"), (parentLayer) => {
    return parentLayer.f("render_pass_list").array("Elements").map(unique_ptr => unique_ptr.F("Object"));
  });

  CompositorFrame.Tree.addChildren(Chromium.GpuProcessType("viz::RenderPass"), (parentLayer) => {
    return parentLayer.f("quad_list").f("helper_").f("data_").F("Object").as("ntdll!void**").then(
      (charAllocator) => {

        if (!charAllocator.isNull()) {
          // voidObj is a std::vector<std::unique_ptr<InnerList>>
          return charAllocator.size().then((platformPointerSize) => {
            return charAllocator.vals(2).then((val) => {
              // Memory address from val[0] to val[1] contain pointers
              var count = (val[1] - val[0]) / platformPointerSize;
              var address = val[0];
              var innerListContentsArrayPromises = [];
              for (var i = 0; i < count; i++) {
                var innerList = DbgObject.create("ntdll!void**", address);
                // Inner list has 4 values of interest data,capacity,size,step.
                innerListContentsArrayPromises.push(innerList.val().then((addrInsertList) => {
                  return DbgObject.create("ntdll!void**", addrInsertList).vals(4);
                }));
                address += platformPointerSize;
              }
              return Promise.all(innerListContentsArrayPromises).then((innerListContentsArray) => {
                var quads = [];
                for (var i = 0; i < innerListContentsArray.length; i++) {
                  var data = innerListContentsArray[i][0];
                  var capacity = innerListContentsArray[i][1];
                  var size = innerListContentsArray[i][2];
                  var step = innerListContentsArray[i][3];
                  while (size > 0) {
                    quads.push(DbgObject.create("service!viz::DrawQuad", data).vcast());
                    data += step;
                    size--;
                  }
                }
                return Promise.all(quads);
              });
            });
          });
        }
      }
    );
  });

  CompositorFrame.Renderer.addNameRenderer(DbgObjectType("viz_common", "viz::SolidColorDrawQuad"), (solidColorDrawQuad) => {
    return solidColorDrawQuad.f("color").val().then((c) => {
      var a = ((c & 0xFF000000) >> 24) & 0X00000000000000ff;
      var r = (c & 0x00FF0000) >> 16;
      var g = (c & 0x0000FF00) >> 8;
      var b = (c & 0x000000FF);
      var color = "rgba(" + r + "," + g + "," + b + "," + a / 255 + ")";
      return "SolidColorDrawQuad <span style=\"display:inline-block; vertical-align: middle; width:16px; height:8px; background-color:" + color + "; border:1px solid black;\"></span>";
    });
  }
  );

  DbgObject.AddTypeDescription(
    Chromium.GpuProcessType("viz::DrawQuad::Resources"),
    "Resources",
    true,
    UserEditableFunctions.Create((r) =>  r.f("ids").vals(r.f("count").val()))
  );
});