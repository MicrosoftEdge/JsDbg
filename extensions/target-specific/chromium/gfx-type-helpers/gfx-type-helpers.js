//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

Loader.OnLoad(function() {
    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("gfx::Size"),
        "Size",
        true,
        UserEditableFunctions.Create((size) => Promise.all([size.f("width_").val(), size.f("height_").val()])
            .thenAll((first, second) => `{${first}, ${second}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("gfx::Point"),
        "Point",
        true,
        UserEditableFunctions.Create((point) => Promise.all([point.f("x_").val(), point.f("y_").val()])
            .thenAll((first, second) => `{${first}, ${second}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("gfx::PointF"),
        "Point",
        true,
        UserEditableFunctions.Create((point) => Promise.all([point.f("x_").val(), point.f("y_").val()])
            .thenAll((first, second) => `{${first}, ${second}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("gfx::Point3F"),
        "Point",
        true,
        UserEditableFunctions.Create((point) => Promise.all([point.f("x_").val(), point.f("y_").val(), point.f("z_").val()])
            .thenAll((first, second, third) => `{${first}, ${second}, ${third}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("gfx::Vector2dF"),
        "Delta",
        true,
        UserEditableFunctions.Create((vector) => Promise.all([vector.f("x_").val(), vector.f("y_").val()])
            .thenAll((first, second) => `{${first}, ${second}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.RendererProcessType("gfx::ScrollOffset"),
        "Offset",
        true,
        UserEditableFunctions.Create((scrollOffset) => Promise.all([scrollOffset.f("x_").val(), scrollOffset.f("y_").val()])
            .thenAll((first, second) => `{${first}, ${second}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.GpuProcessType("gfx::Rect"),
        "Rect",
        true,
        UserEditableFunctions.Create((rect) => Promise.all([rect.f("origin_").f("x_").val(),
          rect.f("origin_").f("y_").val(),
          rect.f("size_").f("width_").val(),
          rect.f("size_").f("height_").val()])
        .thenAll((first, second, third, fourth) => `{${first}, ${second}, ${first + third}, ${second + fourth}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.GpuProcessType("gfx::RectF"),
        "Rect",
        true,
        UserEditableFunctions.Create((rect) => Promise.all([rect.f("origin_").f("x_").val(),
          rect.f("origin_").f("y_").val(),
          rect.f("size_").f("width_").val(),
          rect.f("size_").f("height_").val()])
        .thenAll((first, second, third, fourth) => `{${first}, ${second}, ${first + third}, ${second + fourth}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.GpuProcessType("gfx::Size"),
        "Size",
        true,
        UserEditableFunctions.Create((size) => Promise.all([size.f("width_").val(), size.f("height_").val()])
            .thenAll((first, second) => `{${first}, ${second}}`))
    );

    DbgObject.AddTypeDescription(
        Chromium.GpuProcessType("gfx::Transform"),
        "Size",
        true,
        UserEditableFunctions.Create((transform) => transform.f("matrix_").f("fmat").vals(16)
            .then((mat) => {
                if (mat[0] == 1 && mat[5] == 1 && mat[10] == 1 && mat[15] == 1 && 
                    mat[9] == 0 && mat[1] == 0 && mat[2] == 0  && mat[3] ==  0 && 
                    mat[4] == 0 && mat[6] == 0 && mat[7] == 0  && mat[8] == 0  &&
                    mat[11] == 0 && mat[14] == 0)
                {
                    return "translate("+mat[12]+","+ mat[13]+")";
                }
                return mat;
            }))
    );    
})
