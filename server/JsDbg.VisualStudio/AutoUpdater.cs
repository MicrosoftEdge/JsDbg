using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.ExtensionManager;

namespace JsDbg.VisualStudio {
    static class AutoUpdater {
        public static RestartReason CheckForUpdates(string identifier, string updateUrl) {
            RestartReason reason = RestartReason.None;
            IVsExtensionManager extensionManager = Package.GetGlobalService(typeof(SVsExtensionManager)) as IVsExtensionManager;
            IInstalledExtension installedExtension = extensionManager.GetInstalledExtension(identifier);
            if (installedExtension == null) {
                // TODO: Log this?
                return reason;
            }

            RepositoryEntry entry = new RepositoryEntry();
            entry.DownloadUrl = updateUrl;

            IVsExtensionRepository repository = Package.GetGlobalService(typeof(SVsExtensionRepository)) as IVsExtensionRepository;
            IInstallableExtension latestExtension = null;
            try {
                latestExtension = repository.Download(entry);
            } catch (Exception ex) {
                // TODO: Log this?
                return reason;
            }

            if (true || latestExtension.Header.Version > installedExtension.Header.Version) {
                reason |= extensionManager.Disable(installedExtension);
                extensionManager.Uninstall(installedExtension);

                try {
                    reason |= extensionManager.Install(latestExtension, /*perMachine*/false);

                    // Enable the new one.
                    IInstalledExtension latestInstalledExtension = extensionManager.GetInstalledExtension(latestExtension.Header.Identifier);
                    reason |= extensionManager.Enable(latestInstalledExtension);
                } catch (Exception ex) {
                    // TODO: log this?
                    extensionManager.RevertUninstall(installedExtension);

                    // Since we've reverted the uninstall, we overwrite any restart reason in the past.
                    reason = extensionManager.Enable(installedExtension);
                }
            }

            return reason;
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
