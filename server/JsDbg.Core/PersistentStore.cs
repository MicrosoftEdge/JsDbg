using System;
using System.Text;
using System.Threading.Tasks;
using System.IO;

namespace JsDbg.Core {
    public class PersistentStore {
        private static Encoding Encoding {
            get { return Encoding.UTF8; }
        }

        public PersistentStore(string location) {
            this.location = location;
        }

        private string GetPath(string user) {
            if (user == null) {
                user = System.Environment.UserDomainName + "." + System.Environment.UserName;
            }
            return Path.Combine(this.location, user);
        }

        public Task<string> Get(string user) {
            return this.AttemptFileOperation<string>(async () => {
                string path = this.GetPath(user);
                if (File.Exists(path)) {
                    using (var file = File.OpenRead(path)) {
                        using (var reader = new StreamReader(file, PersistentStore.Encoding)) {
                            return await reader.ReadToEndAsync();
                        }
                    }
                } else {
                    return "{}";
                }
            });
        }

        public Task<bool> Set(string value) {
            return this.AttemptFileOperation<bool>(async () => {
                string path = this.GetPath(/*user*/null);
                using (var file = File.Create(path)) {
                    using (var writer = new StreamWriter(file, PersistentStore.Encoding)) {
                        await writer.WriteAsync(value);
                    }
                }

                return true;
            });
        }

        public Task<string[]> GetUsers() {
            return this.AttemptFileOperation<string[]>(() => {
                string[] paths = Directory.GetFiles(this.location);

                // Instead of paths, we just want the filenames.
                for (int i = 0; i < paths.Length; ++i) {
                    paths[i] = Path.GetFileName(paths[i]);
                }

                return Task.FromResult<string[]>(paths);
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


        private string location;
        private int isActive;
    }
}
