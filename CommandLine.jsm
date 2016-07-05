const Cc = Components.classes;
const Ci = Components.interfaces;
const Cm = Components.manager;
const Cu = Components.utils;
const Cr = Components.results;

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import('resource://gre/modules/XPCOMUtils.jsm');
Cu.import('resource://gre/modules/Services.jsm');

var EXPORTED_SYMBOLS = ["startup", "shutdown"];

function Remote() {}

Remote.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),
  classDescription: 'remote',
  classID: Components.ID('{1280e159-cac2-4188-af5a-e6089527b7b8}'),
  contractID: '@mozilla.org/commandlinehandler/general-startup;1?type=browserui',

  handle: function(cmdLine)
  {
    let chromeURL = Services.prefs.getCharPref('browser.chromeURL');
    // Do not do anything if we are using original firefox UI
    if (chromeURL.includes("chrome://browser/content/")) {
      return;
    }
    /*
    let args = Cc["@mozilla.org/supports-array;1"].createInstance(Ci.nsISupportsArray);
    let url = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    url.data = "about:blank";
    args.AppendElement(url);
    */
    Services.ww.openWindow(null, chromeURL, "_blank", "chrome,dialog=no,all", null);

    // Prevent default command line handler to prevent browser/ resources from loading,
    // like nsBrowserGlue, nsBrowserContentHandler, ...
    // Mostly to prevent tons of jsm and frame script from loading.
    cmdLine.preventDefault = true;
  },
};

const RemoteFactory = XPCOMUtils.generateNSGetFactory([Remote])(Remote.prototype.classID);

function startup(aData, aReason) {
  Cm.registerFactory(Remote.prototype.classID,
                     Remote.prototype.classDescription,
                     Remote.prototype.contractID,
                     RemoteFactory);
  var catman = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
  catman.addCategoryEntry('command-line-handler', 'l-remote', Remote.prototype.contractID, false, true);
}

function shutdown(aData, aReason) {
  var catman = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
  catman.deleteCategoryEntry('command-line-handler', 'l-remote', false);
  Cm.unregisterFactory(Remote.prototype.classID, RemoteFactory);
}
