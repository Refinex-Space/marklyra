// Install this compatibility library in the supplied engine environment.
export default function installLibrariesDomPurifyExport(engineModules, vendorScope) {
  // libraries/dom-purify-export.
  // Vendor adapter; version and local behavior are preserved.
  if ('object' == typeof vendorScope.commonJsExports && void 0 !== vendorScope.commonJsModule) {
    vendorScope.commonJsModule.exports = (0, vendorScope.sanitizerFactory)();
  } else {
    engineModules.define(
      'libraries/dom-purify-export',
      [],
      false,
      function (requireModule, moduleExports, moduleRecord) {
        return vendorScope.sanitizerFactory.call(this);
      },
    );
  }
}
