const Cu = Components.utils;
const Ci = Components.interfaces;
const Cm = Components.manager;

Cu.import("resource://gre/modules/Services.jsm");

function startup() {
  // Register browserui:// on every process and the new one to come
  Services.ppmm.loadProcessScript("data:,new " + function () {
    const { BrowserUIHandlerFactory } = Components.utils.import("resource://html-runner/BrowserUIProtocolHandler.jsm", {});
    BrowserUIHandlerFactory.register();
  }, true);
}

function install() {
}

function shutdown() {
  // Unregister browserui:// on all active processes.
  Services.ppmm.loadProcessScript("data:,new " + function () {
    const { BrowserUIHandlerFactory } = Components.utils.import("resource://html-runner/BrowserUIProtocolHandler.jsm", {});
    BrowserUIHandlerFactory.unregister();
  }, false);
}

function uninstall() {
}
