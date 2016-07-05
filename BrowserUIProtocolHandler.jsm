/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * BrowserUIProtocolHandler.js
 *
 */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;
const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.importGlobalProperties(["URL"]);

var EXPORTED_SYMBOLS = ["BrowserUIHandlerFactory"];

// URL string to redirect to. Passed to BrowserUIHandlerFactory.register()
let installPageURL;
let addonId;

// Watch for new browser UI toplevel document load
function observe(subject, topic, data) {
  let chromeURL = Services.prefs.getCharPref('browser.chromeURL');
  let window = subject.defaultView;
  if (window instanceof Ci.nsIDOMChromeWindow &&
      subject.location.href.startsWith(chromeURL)) {
    if (topic === "document-element-inserted") {
      if (!chromeURL.includes("chrome://browser/content/")) {

        // Add a fake gBrowser object, very minimal and non-working,
        // just to have basic WebExtension feature working:
        // loading install-page.html in an HTML iframe...
        // Otherwise we get random exceptions which prevent exposing chrome.*
        // APIs to it
        window.gBrowser = {
          addTabsProgressListener() {},
          getTabForBrowser() {}
        };

        // Automatically resize the window, otherwise it defaults to 1x1 on Linux and Widthx0 on Windows
        if (window.innerWidth < 10 || window.innerHeight < 10) {
          subject.documentElement.setAttribute("width", window.screen.availWidth * 0.9);
          subject.documentElement.setAttribute("height", window.screen.availHeight * 0.9);
        }
      }
    } else {
      Services.obs.notifyObservers(null, 'new-chrome-loaded', null);
    }
  }
}

function setURIAsDefaultUI(browseruiURI) {
  let httpURI = browseruiURI.replace(/^browserui/, "http");
  let uri = Services.io.newURI(httpURI, null, null);

  // Reset permissions and prefs if we are switching from a custom UI
  if (Services.prefs.prefHasUserValue("browser.chromeURL")) {
    let chromeURL = Services.prefs.getCharPref("browser.chromeURL");
    let currentUri = Services.io.newURI(chromeURL, null, null);
    Permissions.unset(currentUri);
    Preferences.unset();
  }
  // When passing browserui://, hort is null, reset back to browser.xul
  // and do not set any particular pref or permission.
  if (uri.host) {
    // Detect redirect and uses the final URL
    let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    xhr.open("HEAD", uri.spec, false);
    xhr.onreadystatechange = function () {
      if (xhr.readyState != 4) return;
      if (xhr.responseURL != uri.spec) {
        uri = Services.io.newURI(xhr.responseURL, null, null);
      }

      Preferences.set(uri);
      Permissions.set(uri);

      restart(uri);
    };
    xhr.send(null);
  } else {
    // Preferences.unset should reset back chromeURL pref
    let chromeURL = Services.prefs.getCharPref("browser.chromeURL");
    uri = Services.io.newURI(chromeURL, null, null);
    restart(uri);
  }

}


const Permissions = (function() {
  const kPermissions = [
    "browser",
    "popup",
    "embed-apps",
    "systemXHR",
    "root-window",
    "browser:universal-xss"
  ];

  function add(uri, name) {
    Services.perms.add(uri, name, Ci.nsIPermissionManager.ALLOW_ACTION);

    let principal = Services.scriptSecurityManager.createCodebasePrincipal(uri, {});
    Services.perms.addFromPrincipal(principal, name, Ci.nsIPermissionManager.ALLOW_ACTION);
  }

  function remove(uri, name) {
    Services.perms.remove(uri, name);

    let principal = Services.scriptSecurityManager.createCodebasePrincipal(uri, {});
    Services.perms.removeFromPrincipal(principal, name);
  }

  return {
    set: function(uri) {
      kPermissions.forEach(function(name) { add(uri, name); });
    },

    unset: function(uri) {
      kPermissions.forEach(function(name) { remove(uri, name); });
    }
  }
})();

const Preferences = (function() {
  const kPreferences = [
    //
    // Additional dom apis
    //
    { name: "dom.webcomponents.enabled", value: true },
    { name: "dom.mozBrowserFramesEnabled", value: true },
  ];

  function add(preference) {
    let name = preference.name;
    let value = preference.value;
    switch (typeof value) {
      case "boolean":
        Services.prefs.setBoolPref(name, value);
        break;

      case "number":
        Services.prefs.setIntPref(name, value);
        break;
 
      case "string":
        Services.prefs.setCharPref(name, value);
        break;
    }
  }

  function remove(preference) {
    Services.prefs.clearUserPref(preference.name);
  }

  return {
    set: function(uri) {
      kPreferences.forEach(function(preference) { add(preference); });
      Services.prefs.setCharPref("browser.chromeURL", uri.spec);
    },

    unset: function() {
      kPreferences.forEach(function(preference) { remove(preference); });
      Services.prefs.clearUserPref("browser.chromeURL");
    }
  }
})();

function restart(uri) {
  //Cc["@mozilla.org/toolkit/app-startup;1"]
  //  .getService(Ci.nsIAppStartup)
  //  .quit(Ci.nsIAppStartup.eForceQuit | Ci.nsIAppStartup.eRestart);
  let window = Services.wm.getMostRecentWindow(null);
  if (window) {
    // Close and reopen instead of just updating the location
    // As window properties like "tabsintitle" or transparent windows
    // are not updated when just changing the location. It is only computed once
    // on window opening.
    // browser.xul requires args with the default tab to open...
    let args = Cc["@mozilla.org/supports-array;1"].createInstance(Ci.nsISupportsArray);
    let url = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    url.data = "about:blank";
    args.AppendElement(url);
    Services.ww.openWindow(null, uri.spec, "_blank", "chrome,dialog=no,all", args);
    window.close();
  }
  Services.prefs.savePrefFile(null); 
}


/*
 * BrowserUIHandler
 */
function BrowserUIHandler() {
}

BrowserUIHandler.prototype = {
  scheme: "browserui",
  defaultPort: -1,
  protocolFlags: Ci.nsIProtocolHandler.URI_STD |
                 Ci.nsIProtocolHandler.URI_FETCHABLE_BY_ANYONE |
                 Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE,
  allowPort: () => false,

  mapping: new Map(),

  newURI: function Proto_newURI(aSpec, aOriginCharset, aBaseURI) {
    // Relative urls:
    if (!aSpec.startsWith("browserui:")) {
      let redirect = Services.io.newURI(aBaseURI.spec + aSpec, null, null);
      this.mapping.set(redirect.spec, aSpec);
      return redirect;
    }
    // Absolute urls:
    var uri = Cc["@mozilla.org/network/standard-url;1"].createInstance(Ci.nsIURI);
    uri.spec = aSpec;
    return uri;
  },

  newChannel2: function Proto_newChannel(aURI, aLoadInfo) {
    let url;
    if (this.mapping.has(aURI.spec)) {
      // For relative urls, resolve against the install page URL
      url = Services.io.newURI(this.mapping.get(aURI.spec), null, Services.io.newURI(installPageURL, null, null)).spec;
    } else {
      // Otherwise, map any absolute URL to the install page directly.
      url = installPageURL;
    }

    let redirect = Services.io.newURI(url, null, null);
    // Required to get access to WebExtension chrome.* APIs
    let originAttributes = aLoadInfo.originAttributes;
    originAttributes.addonId = addonId;
    let ch = Services.io.newChannelFromURIWithLoadInfo(redirect, aLoadInfo);
    ch.owner = Services.scriptSecurityManager.createCodebasePrincipal(redirect, originAttributes);

    return ch;
  },

  newChannel: function Proto_newChannel(aURI) {
    return this.newChannel2(aURI, null);
  },

  createInstance: function(aOuter, aIID) {
    if (aOuter)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(aIID);
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIProtocolHandler])
};

var BrowserUIHandlerFactory = {
  classID: Components.ID("ae18af0e-296f-11e6-9275-ebb75fefb05b"),
  contractID: "@mozilla.org/network/protocol;1?name=browserui",
  classDescription: "browserui: protocol handler",

  createInstance: function(aOuter, aIID) {
    if (aOuter)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    let handler = new BrowserUIHandler();
    return handler.QueryInterface(aIID);
  },
  lockFactory: function(aLock) {
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFactory]),

  register: function(pageURL, id) {
    installPageURL = pageURL;
    addonId = id;
    if (!registrar.isCIDRegistered(BrowserUIHandlerFactory.classID)) {
      registrar.registerFactory(BrowserUIHandlerFactory.classID,
                                BrowserUIHandlerFactory.classDescription,
                                BrowserUIHandlerFactory.contractID,
                                BrowserUIHandlerFactory);
      // Only register the protocol from the parent process!
      // There is no need to listen for install page event from the child process
      // as broadcastchannel works across processes.
      if (Services.appinfo.processType != Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT) {
        return;
      }

      // Start listening for broadcast channel messages sent from the addon
      let onMessage = function({ data }) {
        setURIAsDefaultUI(data.uri);
      }
      // Listen for message from page loading in browser.xul without mozbrowser iframes
      let channel = BroadcastChannelFor(installPageURL, "confirm", {addonId});
      channel.addEventListener("message", onMessage);
      // and also from mozbrowser iframes used in html browsers
      channel = BroadcastChannelFor(installPageURL, "confirm", {addonId, inIsolatedMozBrowser: true});
      channel.addEventListener("message", onMessage);

      [
        'chrome-document-loaded',
        'content-document-loaded',
        'document-element-inserted'
      ].forEach(function(name) {
        Services.obs.addObserver(observe, name, false);
      });
    }
  },

  unregister: function () {
    if (registrar.isCIDRegistered(BrowserUIHandlerFactory.classID)) {
      registrar.unregisterFactory(BrowserUIHandlerFactory.classID, BrowserUIHandlerFactory);
    }
    // Releasing the windows should collect them and the broadcastchannels with them.
    windows = [];

    if (Services.appinfo.processType != Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT) {
      return;
    }

    [
      'chrome-document-loaded',
      'content-document-loaded',
      'document-element-inserted'
    ].forEach(function(name) {
      Services.obs.removeObserver(observe, name, false);
    });
  },

  resetUI: function () {
    setURIAsDefaultUI("browserui://");
  },

  reloadUI: function () {
    // When reloading the UI, we first try to prune Service worker cache.
    // We do not use reload(true) as it completely bypass service workers
    // and prevent them from intercepting requests. So that it would just
    // return outdated cache on the next regular load (next browser startup).
    // Also, we could have only delete each cache instance instead of deleting
    // entries of all caches, but that would mess up with service worker
    // scripts which caches their Cache instances.
    let window = Services.wm.getMostRecentWindow(null);
    if (window) {
      clearCaches(window).catch(error => {
        Cu.reportError("Error while clearing caches: " + error + " - " +
                       error.stack);
      }).then(() => {
        window.location.reload();
      });
    }
  }
};

// Clear all caches to force loading new resources
function clearCaches(window) {
  let cache = Cc["@mozilla.org/netwerk/cache-storage-service;1"]
                .getService(Ci.nsICacheStorageService);
  cache.clear();

  let imageCache = Cc["@mozilla.org/image/tools;1"]
                     .getService(Ci.imgITools)
                     .getImgCacheForDocument(null);
  // chrome
  imageCache.clearCache(true);
  // content
  imageCache.clearCache(false);

  return clearServiceWorkerCaches(window);
}

// Clear DOM `caches` API to reload service workers
function clearServiceWorkerCaches(window) {
  let { Promise } = window;
  // Iter over all caches
  let sb = Cu.Sandbox(window);
  sb.window = window;
  sb.Promise = window.Promise;
  return Cu.evalInSandbox("new " + function () {
    return window.caches.keys().then(keys => {
      // Open each cache
      return Promise.all(keys.map(key => window.caches.open(key)));
    }).then(caches => {
      return Promise.all(caches.map(cache => {
        // Now iter over each entry for each cache
        return cache.keys().then(keys => {
          // Delete every single entry
          return Promise.all(keys.map(key => cache.delete(key)));
        });
      }));
    });
  }, sb);
}

let windows = [];
function BroadcastChannelFor(uri, name, originAttributes) {
  let baseURI = Services.io.newURI(uri, null, null);
  let principal = Services.scriptSecurityManager.createCodebasePrincipal(baseURI, originAttributes);

  let chromeWebNav = Services.appShell.createWindowlessBrowser(true);
  // XXX: Keep a ref to the window otherwise it is garbaged and BroadcastChannel stops working.
  windows.push(chromeWebNav);
  let interfaceRequestor = chromeWebNav.QueryInterface(Ci.nsIInterfaceRequestor);
  let docShell = interfaceRequestor.getInterface(Ci.nsIDocShell);
  docShell.createAboutBlankContentViewer(principal);
  let window = docShell.contentViewer.DOMDocument.defaultView;
  return new window.BroadcastChannel(name);
}
