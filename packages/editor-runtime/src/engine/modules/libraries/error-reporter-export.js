// Install this compatibility library in the supplied engine environment.
export default function installLibrariesErrorReporterExport(engineModules, vendorScope) {
  // libraries/error-reporter-export.
  // Vendor adapter; version and local behavior are preserved.
  if ('object' == typeof vendorScope.commonJsExports && void 0 !== vendorScope.commonJsModule) {
    vendorScope.commonJsModule.exports = (0, vendorScope.errorReporterFactory)();
  } else {
    engineModules.define(
      'libraries/error-reporter-export',
      [],
      false,
      function (requireModule, moduleExports, moduleRecord) {
        return vendorScope.errorReporterFactory.call(this);
      },
    );
  }
}
