// Install this compatibility library in the supplied engine environment.
export default function installSharedGlobalHelpers(engineModules, vendorScope) {
  // Capture global-only vendor exports while restoring temporary UMD globals.
  // Registration order is intentional: vendor adapters share this snapshot helper.
  !(function (hostGlobal) {
    function readGlobalPath(path, target) {
      var segments = path.split('.');
      while (segments.length) {
        target = target[segments.shift()];
      }
      return target;
    }
    function readGlobalExports(paths) {
      if (typeof paths === 'string') {
        return readGlobalPath(paths, hostGlobal);
      }
      if (!(paths instanceof Array)) {
        throw new Error('Global exports must be a string or array.');
      }
      var exports = {};
      for (var index = 0; index < paths.length; index++) {
        exports[paths[index].split('.').pop()] = readGlobalPath(paths[index], hostGlobal);
      }
      return exports;
    }
    function visitReadableGlobal(name) {
      if (ignoredGlobals.indexOf(name) === -1) {
        try {
          var value = hostGlobal[name];
        } catch (error) {
          ignoredGlobals.push(name);
        }
        this(name, value);
      }
    }
    var previousGlobals;
    var ignoredGlobals = [
      '_g',
      'sessionStorage',
      'localStorage',
      'clipboardData',
      'frames',
      'frameElement',
      'external',
      'mozAnimationStartTime',
      'webkitStorageInfo',
      'webkitIndexedDB',
      'mozInnerScreenY',
      'mozInnerScreenX',
    ];
    engineModules.registry.set(
      'runtime/global-helpers',
      engineModules.namespace({
        prepareGlobal: function (moduleName, exportPaths, injectedGlobals) {
          var savedGlobals;
          var savedDefine = hostGlobal.define;
          hostGlobal.define = undefined;
          if (injectedGlobals) {
            savedGlobals = {};
            for (var name in injectedGlobals) {
              savedGlobals[name] = hostGlobal[name];
              hostGlobal[name] = injectedGlobals[name];
            }
          }
          if (!exportPaths) {
            previousGlobals = {};
            Object.keys(hostGlobal).forEach(visitReadableGlobal, function (name, value) {
              previousGlobals[name] = value;
            });
          }
          return function () {
            var singleExport;
            var exports = exportPaths ? readGlobalExports(exportPaths) : {};
            var multipleExports = !!exportPaths;
            if (!exportPaths) {
              Object.keys(hostGlobal).forEach(visitReadableGlobal, function (name, value) {
                if (previousGlobals[name] !== value && value !== undefined && !exportPaths) {
                  exports[name] = value;
                  if (singleExport !== undefined) {
                    if (!multipleExports && singleExport !== value) {
                      multipleExports = true;
                    }
                  } else {
                    singleExport = value;
                  }
                }
              });
            }
            exports = multipleExports ? exports : singleExport;
            if (savedGlobals) {
              for (var name in savedGlobals) {
                hostGlobal[name] = savedGlobals[name];
              }
            }
            hostGlobal.define = savedDefine;
            return exports;
          };
        },
      }),
    );
  })(typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : this);
}
