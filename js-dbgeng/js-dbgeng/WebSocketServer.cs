using System;
using System.Collections.Generic;
using System.Text;
using System.Net;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.IO;

namespace JsDbg {
    class WebSocketServer {
        internal WebSocketServer() {
            this.port = 51000;
        }

        internal async Task Listen() {
            this.listener = new TcpListener(IPAddress.Parse("127.0.0.1"), 51000);
            this.listener.Start();
            while (true) {
                TcpClient client = await this.listener.AcceptTcpClientAsync();
                this.SendHandshake(client);
                Task echoTask = this.EchoClient(client);
            }
        }

        internal void SendHandshake(TcpClient client) {
            using (StreamWriter writer = new StreamWriter(client.GetStream())) {
                // TODO: investigate
                writer.WriteLine("HTTP/1.1 101 Web Socket Protocol Handshake");
                writer.WriteLine("Upgrade: WebSocket");
                writer.WriteLine("Connection: Upgrade");
                writer.WriteLine("WebSocket-Origin: http://localhost:50000");
                writer.WriteLine("WebSocket-Location: ws://localhost:51000/websession");
                writer.WriteLine("");
            }
        }

        internal async Task EchoClient(TcpClient client) {
            using (client)
            using (StreamReader reader = new StreamReader(client.GetStream()))
            using (StreamWriter writer = new StreamWriter(client.GetStream())) {
                try {
                    while (true) {
                        string message = await reader.ReadLineAsync();
                        writer.WriteLine(message);
                    }
                } finally {
                    client.Close();
                }
            }
        }

        internal void Close() {

        }

        private TcpListener listener;
        private int port;
    }
}
