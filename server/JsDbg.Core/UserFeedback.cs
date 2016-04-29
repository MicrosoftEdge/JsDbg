using System;
using System.IO;

namespace JsDbg.Core {
    public class UserFeedback {
        public UserFeedback(string location) {
            this.location = location;
            this.counter = 0;

            if (!Directory.Exists(location)) {
                try {
                    Directory.CreateDirectory(location);
                } catch { }
            }
        }

        private string GetPath() {
            string date = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string body = date + "." + System.Environment.UserDomainName + "_" + System.Environment.UserName + "." + this.counter++;
            return Path.Combine(this.location, body + ".txt");
        }

        public void RecordUserFeedback(string feedback) {
            string path = this.GetPath();
            File.WriteAllText(path, feedback);
        }

        private string location;
        private int counter;
    }
}
