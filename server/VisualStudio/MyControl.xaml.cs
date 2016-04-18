using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;

namespace JsDbg.VisualStudio {
    /// <summary>
    /// Interaction logic for MyControl.xaml
    /// </summary>
    public partial class MyControl : UserControl {
        public MyControl() {
            InitializeComponent();
        }

        [System.Diagnostics.CodeAnalysis.SuppressMessage("Microsoft.Globalization", "CA1300:SpecifyMessageBoxOptions")]
        private void serverControlButtonClick(object sender, RoutedEventArgs e) {
            if (webServer != null) {
                if (webServer.IsListening) {
                    webServer.Abort();
                } else {
                    var webServerTask = webServer.Listen();
                }
                this.UpdateUI();
            }
        }

        private void MyToolWindow_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e) {
            this.UpdateUI();
        }

        private void ServerURL_Click(object sender, RoutedEventArgs e) {
            // Launch the browser.
            Core.BrowserLauncher.Launch(webServer.Url);
        }

        private void UpdateUI() {
            if (webServer != null) {
                if (webServer.IsListening) {
                    serverControlButton.Content = "Stop Server";
                    ServerStatus.Text = "Server is running";
                    ServerURL.Text = webServer.Url;
                } else {
                    serverControlButton.Content = "Start Server";
                    ServerStatus.Text = "Server is not running";
                    ServerURL.Text = "";
                }

                Microsoft.Win32.RegistryKey key;
                key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey("JumpVisualStudioExtension");
                object keyValue = key.GetValue("AutoStartServer");
                if (keyValue != null && keyValue.ToString() == "true") {
                    startServerCheckBox.IsChecked = true;
                } else {
                    startServerCheckBox.IsChecked = false;
                }
                key.Close();
            }
        }

        public Core.WebServer Webserver {
            set {
                this.webServer = value;
                Microsoft.Win32.RegistryKey key;
                key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey("JumpVisualStudioExtension");
                object keyValue = key.GetValue("AutoStartServer");
                if (keyValue != null && keyValue.ToString() == "true") {
                    var webServerTask = webServer.Listen();
                }
                key.Close();
                this.UpdateUI();
            }
        }

        private void startServerCheckBox_Checked(object sender, RoutedEventArgs e) {
            Microsoft.Win32.RegistryKey key;
            key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey("JumpVisualStudioExtension");
            if (startServerCheckBox.IsChecked == true) {
                key.SetValue("AutoStartServer", "true");
            } else {
                key.SetValue("AutoStartServer", "false");
            }
            key.Close();
        }

        private Core.WebServer webServer;
    }
}