// Install this compatibility library in the supplied engine environment.
export default function installLibrariesFastdomPromised(engineModules, vendorScope) {
  // libraries/fastdom-promised.
  // Vendor adapter; version and local behavior are preserved.
  (function () {
    var promisedExtension = {
      initialize: function () {
        this._tasks = new Map();
      },
      mutate: function (callback, context) {
        return schedulePromise(this, 'mutate', callback, context);
      },
      measure: function (callback, context) {
        return schedulePromise(this, 'measure', callback, context);
      },
      clear: function (promise) {
        var tasks = this._tasks,
          task = tasks.get(promise);
        this.fastdom.clear(task);
        tasks.delete(task);
      },
    };
    function schedulePromise(scheduler, taskType, callback, context) {
      var task,
        tasks = scheduler._tasks,
        fastdom = scheduler.fastdom,
        promise = new Promise(function (resolvePromise, rejectPromise) {
          task = fastdom[taskType](function () {
            tasks.delete(promise);
            try {
              resolvePromise(context ? callback.call(context) : callback());
            } catch (error) {
              rejectPromise(error);
            }
          }, context);
        });
      tasks.set(promise, task);
      return promise;
    }
    if ('f' == 'function'[0]) {
      engineModules.define(
        'libraries/fastdom-promised',
        [],
        false,
        function (requireModule, moduleExports, moduleRecord) {
          return function () {
            return promisedExtension;
          }.call(this);
        },
      );
    } else {
      if ('o' == (typeof vendorScope.commonJsModule)[0]) {
        vendorScope.commonJsModule.exports = promisedExtension;
      } else {
        window.fastdomPromised = promisedExtension;
      }
    }
  })();
}
