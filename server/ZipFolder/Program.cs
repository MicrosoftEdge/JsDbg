//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ZipFolder {
    class Program {
        static void Main(string[] args) {
            if (args.Length < 2) {
                Console.WriteLine("usage: {0} [directory] [target]", System.AppDomain.CurrentDomain.FriendlyName);
                return;
            }

            string directory = args[0];
            string target = args[1];
            try {
                System.IO.File.Delete(target);
            } finally {
                System.IO.Compression.ZipFile.CreateFromDirectory(
                    directory,
                    target,
                    System.IO.Compression.CompressionLevel.Optimal,
                    includeBaseDirectory: false
                );
            }
        }
    }
}
