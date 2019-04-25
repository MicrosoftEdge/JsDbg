//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.ComponentModel.Design;
using Microsoft.Win32;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.OLE.Interop;
using Microsoft.VisualStudio.Shell;

namespace JsDbg.VisualStudio
{
    /// <summary>
    /// This is the class that implements the package exposed by this assembly.
    ///
    /// The minimum requirement for a class to be considered a valid package for Visual Studio
    /// is to implement the IVsPackage interface and register itself with the shell.
    /// This package uses the helper classes defined inside the Managed Package Framework (MPF)
    /// to do it: it derives from the Package class that provides the implementation of the 
    /// IVsPackage interface and uses the registration attributes defined in the framework to 
    /// register itself and its components with the shell.
    /// </summary>
    // This attribute tells the PkgDef creation utility (CreatePkgDef.exe) that this class is
    // a package.
    [PackageRegistration(UseManagedResourcesOnly = true)]
    // This attribute is used to register the information needed to show this package
    // in the Help/About dialog of Visual Studio.
    [InstalledProductRegistration("#110", "#111", "1.0", IconResourceID = 400)]
    // This attribute is needed to let the shell know that this package exposes some menus.
    [ProvideMenuResource("Menus.ctmenu", 1)]
    [Guid(GuidList.guidJsDbgPkgString)]
    [ProvideAutoLoad(Microsoft.VisualStudio.VSConstants.UICONTEXT.Debugging_string)]
    public sealed class JsDbgPackage : Package, IDisposable
    {
        /////////////////////////////////////////////////////////////////////////////
        // Overridden Package Implementation
        #region Package Members

        /// <summary>
        /// Initialization of the package; this method is called right after the package is sited, so this is the place
        /// where you can put all the initialization code that rely on services provided by VisualStudio.
        /// </summary>
        protected override void Initialize()
        {
            Debug.WriteLine (string.Format(CultureInfo.CurrentCulture, "Entering Initialize() of: {0}", this.ToString()));
            base.Initialize();

            // Install the command for launching JsDbg.
            OleMenuCommandService mcs = GetService(typeof(IMenuCommandService)) as OleMenuCommandService;
            if (mcs != null) {
                MenuCommand launchJsDbgCommand = new MenuCommand(LaunchJsDbg, new CommandID(GuidList.guidJsDbgCmdSet, (int)PkgCmdIDList.cmdidLaunchJsDbg));
                mcs.AddCommand(launchJsDbgCommand);
            }

            Configuration configuration = Configuration.Load();
            Core.PersistentStore persistentStore = new Core.PersistentStore();

            if (AutoUpdater.CheckForUpdates("5b3af206-b4d4-4d12-9661-5d2d8dd8d194", configuration.UpdateUrl) != Microsoft.VisualStudio.ExtensionManager.RestartReason.None) {
                Debug.WriteLine("Update pending.");
            }

            DebuggerRunner runner = new DebuggerRunner();
            this.webServer = new Core.WebServer(runner.Debugger, persistentStore, configuration.ExtensionRoot);
            this.webServer.LoadExtension("default");
        }
        #endregion

        private void LaunchJsDbg(object sender, EventArgs e) {
            if (!this.webServer.IsListening) {
                var webserverTask = this.webServer.Listen();
            }
            JsDbg.Windows.BrowserLauncher.Launch(this.webServer.Url);
        }

        public void Dispose() {
            this.webServer.Dispose();
        }

        public Core.WebServer WebServer
        {
            get { return this.webServer; }
        }

        private Core.WebServer webServer;
    }
}
