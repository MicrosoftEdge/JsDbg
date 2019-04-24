//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

"use strict";

var AngleTextures = undefined;
Loader.OnLoad(function () {
  AngleTextures = {
    InterpretAddress: function (address) {
      var voidObj = DbgObject.create("ntdll!void", address);
      if (!voidObj.isNull()) {
        return voidObj.as("libGLESv2!gl::Context");
      }
      return DbgObject.NULL;
    },
    GetRoots: function () {
      return DbgObject.global("libGLESv2", "gSingleThreadedContext");
    },
    ShowTextures: function (glContext) {
      glContext.deref()
        .f("mState")
        .f("mTextureManager")
        .f("mObjectMap")
        .then((objectMap) =>
        {
          objectMap.f("mFlatResourcesSize").val().then((size)=>{
            objectMap.f("mFlatResources").array(size).then((flatResources) => {
              Promise.all(flatResources.map(t => t.deref())).then((glTextures) => {
                var id = 0;
                var textureTable = document.getElementById("textureTable");
                glTextures.forEach(function(glTexture) {            
                  if (glTexture.ptr() != "0xffffffff`ffffffff")
                  {
                    var row = document.createElement("tr");
                    var cell1 = document.createElement("td");
                    cell1.appendChild(document.createTextNode(id));
                    row.appendChild(cell1);

                    var cell2 = document.createElement("td");
                    cell2.appendChild(DbgObjectInspector.Inspect(glTexture, glTexture.ptr()));     
                    row.appendChild(cell2);

                    glTexture.f("mTexture").vcast().f("mTexStorage").then((texStorage)=>{
                    if (!texStorage.isNull())
                    {
                      texStorage = texStorage.vcast();
                      var cell3 = document.createElement("td");                    
                      row.appendChild(cell3);
                      texStorage.f("mTextureWidth").val().then((w)=>{cell3.appendChild(document.createTextNode(w))});

                      var cell4 = document.createElement("td");                    
                      row.appendChild(cell4);
                      texStorage.f("mTextureHeight").val().then((h)=>{cell4.appendChild(document.createTextNode(h))});

                      var cell5 = document.createElement("td");                    
                      row.appendChild(cell5);
                      texStorage.f("mTexture").f("mData").f("_Ptr").f("object").then((r)=>{cell5.appendChild(DbgObjectInspector.Inspect(r, r.ptr()))});

                    }});
                    textureTable.appendChild(row);              
                  }
                  id++;
                });      
              });              
            });
          });
        });    
    },
    DefaultTypes: []
  };  
});