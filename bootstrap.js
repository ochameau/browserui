const Cu = Components.utils;
const Ci = Components.interfaces;
const Cm = Components.manager;

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
