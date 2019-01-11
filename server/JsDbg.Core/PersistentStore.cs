using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace JsDbg.Core {
    public class PersistentStore {
        private static Encoding Encoding {
            get { return Encoding.UTF8; }
        }

        public PersistentStore(string azureUserDataReadWriteFunctionURL, string azureGetUsersFunctionURL) {
            this.azureUserDataReadWriteFunctionURL = azureUserDataReadWriteFunctionURL;
            this.azureGetUsersFunctionURL = azureGetUsersFunctionURL;
        }

        private string GetPath(string user) {
            if (user == null) {
                user = System.Environment.UserDomainName + "." + System.Environment.UserName;
            }
            return user;
        }

        public Task<string> Get(string user) {
            return this.AttemptFileOperation<string>(async () => {
                string path = this.GetPath(user);
                string pathQueryParameter = "path=" + path;
                using (HttpClient client = new HttpClient()) {
                    HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, new Uri(this.azureUserDataReadWriteFunctionURL + "&" + pathQueryParameter));
                    HttpResponseMessage response = await client.SendAsync(request);
                    return await response.Content.ReadAsStringAsync();
                }
            });
        }

        public Task<bool> Set(string value) {
            return this.AttemptFileOperation<bool>(async () => {
                string path = this.GetPath(user: null);
                string pathQueryParameter = "path=" + path;
                using (HttpClient client = new HttpClient()) {
                    HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, new Uri(this.azureUserDataReadWriteFunctionURL + "&" + pathQueryParameter));
                    request.Content = new StringContent(value, PersistentStore.Encoding, "application/json");
                    await client.SendAsync(request);
                    return true;
                }
            });
        }

        public Task<string[]> GetUsers() {
            return this.AttemptFileOperation<string[]>(async () => {
                using (HttpClient client = new HttpClient()) {
                    HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, new Uri(this.azureGetUsersFunctionURL));
                    HttpResponseMessage response = await client.SendAsync(request);
                    string contentString = await response.Content.ReadAsStringAsync();
                    // contentString is a string of format: '["user1","user2",...]' - we need to strip the square brackets and double quotes, and convert it to an array
                    string[] users = contentString.Substring(1, contentString.Length - 2).Split(',').Select((userNameWithQuotes) => userNameWithQuotes.Substring(1, userNameWithQuotes.Length - 2)).ToArray();
                    return users;
                }
            });
        }

        private async Task<T> AttemptFileOperation<T>(Func<Task<T>> func) {
            int remainingAttempts = 10;
            while (true) {
                try {
                    await this.AcquireLock();
                    return await func();
                } catch (IOException) when (remainingAttempts > 0) {
                    --remainingAttempts;
                    await Task.Delay(50);
                } catch {
                    return default(T);
                } finally {
                    this.ReleaseLock();
                }
            }
        }

        private async Task AcquireLock() {
            while (System.Threading.Interlocked.CompareExchange(ref this.isActive, 1, 0) != 0) {
                await Task.Delay(50);
            }
        }

        private void ReleaseLock() {
            this.isActive = 0;
        }

        private string azureUserDataReadWriteFunctionURL;
        private string azureGetUsersFunctionURL;
        private int isActive;
    }
}
