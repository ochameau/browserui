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

var EXPORTED_SYMBOLS = ["BrowserUIHandler"];

// Listen for message coming from the browserui:// protocol handler
// which may come from the content or the parent. But only listen from the parent.
if (Services.appinfo.processType == Services.appinfo.PROCESS_TYPE_DEFAULT) {
  Services.ppmm.addMessageListener("BrowserUI::Set", setURIAsDefaultUI);
}

// Watch for new browser UI toplevel document load
[
  'chrome-document-loaded',
  'content-document-loaded',
].forEach(function(name) {
  Services.obs.addObserver(function(subject, topic, data) {
    if (subject.defaultView instanceof Ci.nsIDOMChromeWindow &&
        subject.location == Services.prefs.getCharPref('browser.chromeURL')) {
      Services.obs.notifyObservers(null, 'new-chrome-loaded', null);
    }
  }, name, false);
});


function setURIAsDefaultUI({ data }) {
  let uri = Services.io.newURI(data.uri, null, null);

  // Reset permissions and prefs if we are switching from a custom UI
  if (Services.prefs.prefHasUserValue("browser.chromeURL")) {
    let chromeURL = Services.prefs.getCharPref("browser.chromeURL");
    let currentUri = Services.io.newURI(chromeURL, null, null);
    Permissions.unset(currentUri);
    Preferences.unset();
  }
  // When passing browserui://, path is '/', reset back to browser.xul
  // and do not set any particular pref or permission.
  if (uri.path !== "/") {
    Preferences.set(uri);
    Permissions.set(uri);
  } else {
    // Preferences.unset should reset back chromeURL pref
    let chromeURL = Services.prefs.getCharPref("browser.chromeURL");
    uri = Services.io.newURI(chromeURL, null, null);
  }
  restart(uri);
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
    { name: "extensions.webextensions.addon_implementation", value: true },

    //
    // Extensions
    //
    { name: "extensions.autoDisableScopes", value: 0 },
    { name: "xpinstall.signatures.required", value: false }
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
    window.document.location = uri.spec;
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
  protocolFlags: Ci.nsIProtocolHandler.URI_NORELATIVE |
                 Ci.nsIProtocolHandler.URI_NOAUTH |
                 Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
                 Ci.nsIProtocolHandler.URI_DOES_NOT_RETURN_DATA,
  allowPort: () => false,

  newURI: function Proto_newURI(aSpec, aOriginCharset, aBaseURI) {
    if (!aSpec.startsWith("browserui://")) {
      return aBaseURI.resolve(aSpec);
    }
    let uri = Cc["@mozilla.org/network/simple-uri;1"].createInstance(Ci.nsIURI);
    uri.spec = aSpec;
    return uri;
  },

  newChannel2: function Proto_newChannel(aURI, aLoadInfo) {
    aURI.scheme = "http";
    Services.cpmm.sendAsyncMessage("BrowserUI::Set", { uri: aURI.spec })

    let redirect = Services.io.newURI("data:text/html,loading new browser ui", null, null);
    let ch = Services.io.newChannelFromURIWithLoadInfo(redirect, aLoadInfo);
    ch.originalURI = aURI;
    return ch;

    //throw Components.results.NS_ERROR_ILLEGAL_VALUE;
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

  register: function() {
    if (!registrar.isCIDRegistered(BrowserUIHandlerFactory.classID)) {
      registrar.registerFactory(BrowserUIHandlerFactory.classID,
                                BrowserUIHandlerFactory.classDescription,
                                BrowserUIHandlerFactory.contractID,
                                BrowserUIHandlerFactory);
    }
  },

  unregister: function () {
    if (registrar.isCIDRegistered(BrowserUIHandlerFactory.classID)) {
      registrar.unregisterFactory(BrowserUIHandlerFactory.classID, BrowserUIHandlerFactory);
    }
  }
};
