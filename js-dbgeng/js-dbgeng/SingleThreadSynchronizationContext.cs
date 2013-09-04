using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Concurrent;

// Source: http://blogs.msdn.com/b/pfxteam/archive/2012/01/20/10259049.aspx

namespace JsDbg {
    internal sealed class SingleThreadSynchronizationContext : SynchronizationContext {

        private readonly BlockingCollection<KeyValuePair<SendOrPostCallback, object>> m_queue = new BlockingCollection<KeyValuePair<SendOrPostCallback, object>>();

        public override void Post(SendOrPostCallback d, object state) {
            m_queue.Add(new KeyValuePair<SendOrPostCallback, object>(d, state));
        }

        public void RunOnCurrentThread() {
            KeyValuePair<SendOrPostCallback, object> workItem;
            while (m_queue.TryTake(out workItem, Timeout.Infinite)) {
                workItem.Key(workItem.Value);
            }
        }

        public void Complete() { 
            m_queue.CompleteAdding(); 
        }
    }

}
