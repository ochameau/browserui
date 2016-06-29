/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * BrowserUIProtocolHandler.js
 *
 */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const ProgressListener = {
  onStateChange: function(webProgress, request, stateFlags, status) {
    if (stateFlags & Ci.nsIWebProgressListener.STATE_START) {
      let window = webProgress.DOMWindow;

      let windowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor)
                                .getInterface(Ci.nsIDOMWindowUtils);
      windowUtils.serviceWorkersTestingEnabled = true;
    }
  },

  onLocationChange: function(webProgress, request, location, flags) {},
  onSecurityChange: function(webProgress, request, state) {},
  onStatusChange: function(webProgress, request, status, message) {},
  onProgressChange: function(webProgress, request, curSelfProgress,
                               maxSelfProgress, curTotalProgress, maxTotalProgress) {},

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                         Ci.nsISupportsWeakReference]),
};

function allowServiceWorkerForHttp(aXULWindow) {
  // Same pref than devtools
  Services.prefs.setBoolPref('devtools.serviceWorkers.testing.enabled', true);
  Services.prefs.setBoolPref('browser.cache.disk.enable', true);

  let window = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDOMWindow);
  window.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIWebNavigation)
        .QueryInterface(Ci.nsIDocShell)
        .QueryInterface(Ci.nsIWebProgress)
        .addProgressListener(
          ProgressListener,
          Ci.nsIWebProgress.NOTIFY_STATE_WINDOW
        );
}

Services.wm.addListener({
  onOpenWindow: allowServiceWorkerForHttp,
  onCloseWindow: function(aXULWindow) {},
  onWindowTitleChange: function(aXULWindow, aNewTitle) {}
});

let currentWindow = Services.wm.getMostRecentWindow("navigator:browser");
if (currentWindow) {
  allowServiceWorkerForHttp(currentWindow);
}
