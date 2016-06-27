const Cu = Components.utils;
const Ci = Components.interfaces;
const Cm = Components.manager;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Extension.jsm");

let extension;
let listener;

function startup(data) {
  // Start the web-extension
  extension = new Extension(data);
  extension.startup()

  let installPageURL = extension.baseURI.resolve("install-page.html");
  let addonId = extension.id;

  // Register browserui:// on every process and the new one to come
  Services.ppmm.loadProcessScript("data:,(" + function (pageURL, addonId) {
    const { BrowserUIHandlerFactory } = Components.utils.import("resource://html-runner/BrowserUIProtocolHandler.jsm", {});
    BrowserUIHandlerFactory.register(pageURL, addonId);
  } + ")(\"" + installPageURL + "\", \"" + addonId + "\")", true);

  // Register two key shortcuts to reload the browser ui and reset back to browser.xul
  // These shortcuts work from all windows
  const { MultiWindowKeyListener } = Components.utils.import("resource://html-runner/MultiWindowKeyListener.jsm", {});
  const { BrowserUIHandlerFactory } = Components.utils.import("resource://html-runner/BrowserUIProtocolHandler.jsm", {});
  listenerReload = new MultiWindowKeyListener({
    keyCode: Ci.nsIDOMKeyEvent.DOM_VK_R, altKey: true,
    callback: () => BrowserUIHandlerFactory.reloadUI()
  });
  listenerReload.start();

  listenerReset = new MultiWindowKeyListener({
    keyCode: Ci.nsIDOMKeyEvent.DOM_VK_R, ctrlKey: true, altKey: true,
    callback: () => BrowserUIHandlerFactory.resetUI()
  });
  listenerReset.start();
}

function install() {
}

function shutdown() {
  // Unregister browserui:// on all active processes.
  Services.ppmm.loadProcessScript("data:,new " + function () {
    const { BrowserUIHandlerFactory } = Components.utils.import("resource://html-runner/BrowserUIProtocolHandler.jsm", {});
    BrowserUIHandlerFactory.unregister();
  }, false);

  // Cleanup the web-extension
  extension.shutdown();

  // Unregister the key shortcuts
  listenerReload.stop();
  listenerReset.stop();
}

function uninstall() {
}

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
