//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.ExtensionManager;
using System.Threading;

namespace JsDbg.VisualStudio {
    static class AutoUpdater {
        private static bool FileExists(string fileUrl) {
            bool fileExists = false;
            Thread workerThread = new Thread(() => {
                fileExists = System.IO.File.Exists(fileUrl);
            });
            workerThread.Start();
            if (!workerThread.Join(1000)) {
                workerThread.Abort();
                return false;
            } else {
                return fileExists;
            }
        }

        public static RestartReason CheckForUpdates(string identifier, string updateUrl) {
            IVsExtensionManager extensionManager = Package.GetGlobalService(typeof(SVsExtensionManager)) as IVsExtensionManager;
            IInstalledExtension installedExtension = extensionManager.GetInstalledExtension(identifier);
            if (installedExtension == null) {
                throw new Exception(String.Format("Unable to find extension: {0}", identifier));
            }

            RepositoryEntry entry = new RepositoryEntry();
            entry.DownloadUrl = updateUrl;

            IVsExtensionRepository repository = Package.GetGlobalService(typeof(SVsExtensionRepository)) as IVsExtensionRepository;
            IInstallableExtension latestExtension = repository.Download(entry);

            if (latestExtension.Header.Version > installedExtension.Header.Version) {
                RestartReason reason = RestartReason.None;
                reason |= extensionManager.Disable(installedExtension);
                extensionManager.Uninstall(installedExtension);

                try {
                    reason |= extensionManager.Install(latestExtension, /*perMachine*/false);

                    // Enable the new one.
                    IInstalledExtension latestInstalledExtension = extensionManager.GetInstalledExtension(latestExtension.Header.Identifier);
                    reason |= extensionManager.Enable(latestInstalledExtension);
                    return reason;
                } catch {
                    // Revert the uninstallation.
                    extensionManager.RevertUninstall(installedExtension);
                    extensionManager.Enable(installedExtension);
                    throw;
                }
            }

            return RestartReason.None;
        }

        private class RepositoryEntry : IRepositoryEntry {
            public string DownloadUpdateUrl {
                get; set;
            }

            public string DownloadUrl {
                get; set;
            }

            public string VsixReferences {
                get; set;
            }
        }
    }
}
