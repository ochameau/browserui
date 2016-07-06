/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * LightweightThemes.js
 *
 */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = ["startup", "shutdown"];

function mozBrowserObs(subject, topic, data) {
  let frameLoader = subject;
  frameLoader.QueryInterface(Ci.nsIFrameLoader);
  let frame = frameLoader.ownerElement;
  // Only take care of HTML iframes
  if (frame.tagName != "IFRAME" || !frame.getAttribute("mozbrowser")) {
    return;
  }
  let { messageManager } = frame.QueryInterface(Ci.nsIFrameLoaderOwner).frameLoader;
  if (!messageManager) {
    return;
  }

  // Watch for special DOM Events sent by the page
  // This could easily be done via content scripts instead of JSMs and frame scripts...
  const { LightweightThemeManager } = Cu.import("resource://gre/modules/LightweightThemeManager.jsm", {});
  messageManager.addMessageListener("LightWeightThemeWebInstaller:Preview", function ({data}) {
    let { themeData, baseURI } = data;
    let theme = LightweightThemeManager.parseTheme(themeData, baseURI);
    LightweightThemeManager.previewTheme(theme);
  });
  messageManager.addMessageListener("LightWeightThemeWebInstaller:Install", function ({data}) {
    let { themeData, baseURI } = data;
    let theme = LightweightThemeManager.parseTheme(themeData, baseURI);
    LightweightThemeManager.currentTheme = theme;
  });
  messageManager.addMessageListener("LightWeightThemeWebInstaller:ResetPreview", function ({data}) {
    let { baseURI } = data;
    LightweightThemeManager.resetPreview();
  });

  messageManager.loadFrameScript("data:,new " + function () {
    /* copied from browser/base/content/content.js */
    var LightWeightThemeWebInstallListener = {
      _previewWindow: null,

      init: function() {
        addEventListener("InstallBrowserTheme", this, false, true);
        addEventListener("PreviewBrowserTheme", this, false, true);
        addEventListener("ResetBrowserThemePreview", this, false, true);
      },

      handleEvent: function (event) {
        switch (event.type) {
          case "InstallBrowserTheme": {
            sendAsyncMessage("LightWeightThemeWebInstaller:Install", {
              baseURI: event.target.baseURI,
              themeData: event.target.getAttribute("data-browsertheme"),
            });
            break;
          }
          case "PreviewBrowserTheme": {
            sendAsyncMessage("LightWeightThemeWebInstaller:Preview", {
              baseURI: event.target.baseURI,
              themeData: event.target.getAttribute("data-browsertheme"),
            });
            this._previewWindow = event.target.ownerDocument.defaultView;
            this._previewWindow.addEventListener("pagehide", this, true);
            break;
          }
          case "pagehide": {
            sendAsyncMessage("LightWeightThemeWebInstaller:ResetPreview");
            this._resetPreviewWindow();
            break;
          }
          case "ResetBrowserThemePreview": {
            if (this._previewWindow) {
              sendAsyncMessage("LightWeightThemeWebInstaller:ResetPreview",
                               {baseURI: event.target.baseURI});
              this._resetPreviewWindow();
            }
            break;
          }
        }
      },

      _resetPreviewWindow: function () {
        this._previewWindow.removeEventListener("pagehide", this, true);
        this._previewWindow = null;
      }
    };
    LightWeightThemeWebInstallListener.init();
  }, false);
}

// Watch new theme to be applied
function themeUpdateObs(subject, topic, data) {
  let window = Services.wm.getMostRecentWindow(null);
  if (!window) {
    return;
  }
  let theme = JSON.parse(data);
  update(window, theme);
}

// Apply the given theme to the given window
let properties = [];
function update(window, theme) {
  let root = window.document.documentElement;
  let { style } = root;

  // First reset previously set properties
  for (let name of properties) {
    style.removeProperty("--" + name);
  }
  properties = [];
  root.removeAttribute("lwtheme");

  if (!theme.headerURL) {
    return;
  }
  root.setAttribute("lwtheme", "true");

  let vars = theme.vars || {};
  vars["header-background-image"] = "url(\"" + theme.headerURL.replace(/"/g, "\\\"") + "\")";
  if (theme.footerURL) {
    vars["footer-background-image"] = "url(\"" + theme.footerURL.replace(/"/g, "\\\"") + "\")";
  }

  // Then set the new one
  for (let name in vars) {
    style.setProperty("--" + name, vars[name]);
    properties.push(name);
  }

  if (window.location.href.includes("browser.xul")) {
    hackBrowserXUL(window);
  }
}

// Hack browser.xul to make use of the CSS variables
function hackBrowserXUL(window) {
  let { document } = window;
  let node = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
  node.textContent = `
    .tabbrowser-tab {
      color: var(--tab-color) !important;
    }
    .tabbrowser-tab[selected="true"] {
      color: var(--tab-selected-color) !important;
    }
    #urlbar {
      color: var(--urlbar-color) !important;
      background-color: var(--urlbar-background-color) !important;
    }
  `;
  document.documentElement.appendChild(node);
}

// Watch for new top level window opening to apply the current theme
function onNewChrome(subject, topic, data) {
  let chromeURL = Services.prefs.getCharPref('browser.chromeURL');
  let window = subject.defaultView;
  if (window instanceof Ci.nsIDOMChromeWindow &&
      subject.location &&
      subject.location.href.startsWith(chromeURL)) {
    let { LightweightThemeManager } = Cu.import("resource://gre/modules/LightweightThemeManager.jsm", {});
    update(window, LightweightThemeManager.currentThemeForDisplay);
  }
}

// This is just for the XUL version. XUL document do not dispatch document-element-inserted events...
function onNewWindow(subject, topic, data) {
  if (topic != "domwindowopened") {
    return;
  }
  // We have to wait for load otherwise we are going to interact with about:blank document...
  subject.addEventListener("DOMContentLoaded", function onLoad() {
    subject.removeEventListener("DOMContentLoaded", onLoad);
    let chromeURL = Services.prefs.getCharPref('browser.chromeURL');
    if (subject.location.href.startsWith(chromeURL)) {
      let { LightweightThemeManager } = Cu.import("resource://gre/modules/LightweightThemeManager.jsm", {});
      update(subject, LightweightThemeManager.currentThemeForDisplay);
    }
  });
};

function startup() {
  Services.obs.addObserver(mozBrowserObs, "remote-browser-shown", false);
  Services.obs.addObserver(mozBrowserObs, "inprocess-browser-shown", false);

  Services.obs.addObserver(onNewChrome, "document-element-inserted", false);
  // Just for the xul version
  Services.ww.registerNotification(onNewWindow);

  Services.obs.addObserver(themeUpdateObs, "lightweight-theme-styling-update", false);

  // !!! Disable lightweight theme sanitize to accept new "vars" field
  // which is an object to describe various CSS variables.
  // Ideally we could just tweak LightwaightThemeManager.jsm to accept this field.
  let manager = Cu.import("resource://gre/modules/LightweightThemeManager.jsm", {});
  manager._sanitizeTheme = function (theme) {
    return JSON.parse(JSON.stringify(theme));
  };
}

function shutdown() {
  Services.obs.removeObserver(mozBrowserObs, "remote-browser-shown", false);
  Services.obs.removeObserver(mozBrowserObs, "inprocess-browser-shown", false);

  Services.obs.removeObserver(onNewChrome, "document-element-inserted", false);
  Services.ww.unregisterNotification(onNewWindow);

  Services.obs.removeObserver(themeUpdateObs, "lightweight-theme-styling-update", false);
}
