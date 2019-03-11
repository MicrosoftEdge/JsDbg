//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

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

        private static string PersistentStoreFileName {
            get { return "jsdbg-persistent-store.json"; }
        }

        public PersistentStore() {
        }

        public Task<string> Get() {
            return this.AttemptFileOperation<string>(() => {
                string filePath = Path.GetTempPath() + PersistentStore.PersistentStoreFileName;
                if (File.Exists(filePath)) {
                    return Task.FromResult<string>(File.ReadAllText(filePath, PersistentStore.Encoding));
                } else {
                    return Task.FromResult<string>("{}");
                }
            });
        }

        public Task<bool> Set(string value) {
            return this.AttemptFileOperation<bool>(() => {
                using (FileStream fs = File.Create(Path.GetTempPath() + PersistentStore.PersistentStoreFileName)) {
                    byte[] valueToWrite = PersistentStore.Encoding.GetBytes(value);
                    fs.Write(valueToWrite, 0, valueToWrite.Length);
                }
                return Task.FromResult<bool>(true);
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
        private int isActive;
    }
}
