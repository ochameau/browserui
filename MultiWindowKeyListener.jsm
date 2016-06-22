/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const Cu = Components.utils;
const Ci = Components.interfaces;
const {Services} = Cu.import("resource://gre/modules/Services.jsm", {});

var EXPORTED_SYMBOLS = ["MultiWindowKeyListener"];

// Helper to listen to a key on all windows
function MultiWindowKeyListener({ keyCode, ctrlKey, altKey, callback }) {
  let keyListener = function (event) {
    if (event.keyCode === keyCode &&
        event.ctrlKey == !!ctrlKey &&
        event.altKey == !!altKey) {
      callback(event);

      // Call preventDefault to avoid duplicated events when
      // doing the key stroke within a tab.
      event.preventDefault();
    }
  };

  let observer = function (window, topic, data) {
    window.addEventListener("keydown", keyListener);
  };

  return {
    start: function () {
      // Automatically process already opened windows
      let e = Services.wm.getEnumerator(null);
      while (e.hasMoreElements()) {
        let window = e.getNext();
        observer(window, "domwindowopened", null);
      }
      // And listen for new ones to come
      Services.obs.addObserver(observer, "document-element-inserted", false);
    },

    stop: function () {
      let e = Services.wm.getEnumerator(null);
      while (e.hasMoreElements()) {
        let window = e.getNext();
        window.removeEventListener("keydown", keyListener);
      }
      Services.obs.removeObserver(observer, "document-element-inserted");
    }
  };
}
