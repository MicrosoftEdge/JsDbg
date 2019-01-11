using System;
using System.Net.Http;

namespace JsDbg.Core {
    public class UserFeedback {
        public UserFeedback(string azureFeedbackReadWriteFunctionURL) {
            this.azureFeedbackReadWriteFunctionURL = azureFeedbackReadWriteFunctionURL;
            this.counter = 0;
        }

        private string GetPath() {
            string date = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string body = date + "." + System.Environment.UserDomainName + "_" + System.Environment.UserName + "." + this.counter++;
            return body + ".txt";
        }

        public async void RecordUserFeedback(string feedback) {
            string path = this.GetPath();
            string pathQueryParameter = "path=" + path;
            using (HttpClient client = new HttpClient()) {
                HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, new Uri(this.azureFeedbackReadWriteFunctionURL + "&" + pathQueryParameter));
                request.Content = new StringContent(feedback);
                await client.SendAsync(request);
            }
        }

        private string azureFeedbackReadWriteFunctionURL;
        private int counter;
    }
}
