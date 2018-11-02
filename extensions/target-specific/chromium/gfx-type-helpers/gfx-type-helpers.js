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
        UserEditableFunctions.Create((size) => Promise.all([size.f("x_").val(), size.f("y_").val()])
            .thenAll((first, second) => `{${first}, ${second}}`))
    );
})
