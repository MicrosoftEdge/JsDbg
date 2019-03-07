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
})
