namespace JsDbg.Core {
    public static class BrowserLauncher {
        public static void Launch(string url) {
            try {
                // If it's present, try openwith.exe to show a browser selection prompt to the user.
                System.Diagnostics.Process.Start("openwith", url);
            } catch {
                System.Diagnostics.Process.Start(url);
            }
        }
    }
}
