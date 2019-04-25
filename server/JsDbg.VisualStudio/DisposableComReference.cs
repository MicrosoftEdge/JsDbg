//--------------------------------------------------------------
//
//    MIT License
//
//    Copyright (c) Microsoft Corporation. All rights reserved.
//
//--------------------------------------------------------------

using System;
using System.Runtime.InteropServices;

namespace JsDbg.Utilities {
    public sealed class DisposableComReference : IDisposable {
        public DisposableComReference(object objectToRelease) {
            this.objectToRelease = objectToRelease;
        }

        public void Dispose() {
            ReleaseIfNotNull(ref this.objectToRelease);
        }

        public static void ReleaseIfNotNull<T>(ref T objectToRelease) where T : class {
            if (objectToRelease != null) {
                Marshal.ReleaseComObject(objectToRelease);
                objectToRelease = null;
            }
        }

        public static void SetReference<T>(ref T existingObject, T newObject) where T : class {
            ReleaseIfNotNull(ref existingObject);
            existingObject = newObject;
        }

        private object objectToRelease;
    }
}
