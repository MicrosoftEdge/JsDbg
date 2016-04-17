using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace JsDbg.Core {
    public interface IConfiguration {
        string ExtensionRoot { get; }
        string PersistentStoreDirectory { get; }
        string LocalSupportDirectory { get; }
    }
}
