// Install this compatibility library in the supplied engine environment.
export default function installLibrariesFastdom(engineModules, vendorScope) {
  // libraries/fastdom.
  // Vendor adapter; version and local behavior are preserved.
  (function (windowGlobal) {
    'use strict';

    var debugLog = function () {},
      requestFrame =
        windowGlobal.requestAnimationFrame ||
        windowGlobal.webkitRequestAnimationFrame ||
        windowGlobal.mozRequestAnimationFrame ||
        windowGlobal.msRequestAnimationFrame ||
        function (callback) {
          return setTimeout(callback, 16);
        };
    function FastDom() {
      this.reads = [];
      this.writes = [];
      this.raf = requestFrame.bind(windowGlobal);
      debugLog('initialized', this);
    }
    function scheduleFlush(scheduler) {
      if (!scheduler.scheduled) {
        scheduler.scheduled = true;
        scheduler.raf(
          function (scheduler) {
            debugLog('flush');
            var flushError,
              writes = scheduler.writes,
              reads = scheduler.reads;
            try {
              debugLog('flushing reads', reads.length);
              runTasks(reads);
              debugLog('flushing writes', writes.length);
              runTasks(writes);
            } catch (error) {
              flushError = error;
            }
            scheduler.scheduled = false;
            if (reads.length || writes.length) {
              scheduleFlush(scheduler);
            }
            if (flushError) {
              debugLog('task errored', flushError.message);
              if (!scheduler.catch) {
                throw flushError;
              }
              scheduler.catch(flushError);
            }
          }.bind(null, scheduler),
        );
        debugLog('flush scheduled');
      }
    }
    function runTasks(tasks) {
      var task;
      for (debugLog('run tasks'); (task = tasks.shift()); ) {
        task();
      }
    }
    function removeTask(tasks, task) {
      var taskIndex = tasks.indexOf(task);
      return !!~taskIndex && !!tasks.splice(taskIndex, 1);
    }
    FastDom.prototype = {
      constructor: FastDom,
      measure: function (callback, context) {
        debugLog('measure');
        var task = context ? callback.bind(context) : callback;
        this.reads.push(task);
        scheduleFlush(this);
        return task;
      },
      mutate: function (callback, context) {
        debugLog('mutate');
        var task = context ? callback.bind(context) : callback;
        this.writes.push(task);
        scheduleFlush(this);
        return task;
      },
      clear: function (task) {
        debugLog('clear', task);
        return removeTask(this.reads, task) || removeTask(this.writes, task);
      },
      extend: function (extension) {
        debugLog('extend', extension);
        if ('object' != typeof extension) {
          throw new Error('expected object');
        }
        var extendedScheduler = Object.create(this);
        (function (target, source) {
          for (var propertyName in source) {
            if (source.hasOwnProperty(propertyName)) {
              target[propertyName] = source[propertyName];
            }
          }
        })(extendedScheduler, extension);
        extendedScheduler.fastdom = this;
        if (extendedScheduler.initialize) {
          extendedScheduler.initialize();
        }
        return extendedScheduler;
      },
      catch: null,
    };
    var fastdom = (windowGlobal.fastdom = windowGlobal.fastdom || new FastDom());
    if ('f' == 'function'[0]) {
      engineModules.define(
        'libraries/fastdom',
        [],
        false,
        function (requireModule, moduleExports, moduleRecord) {
          return function () {
            return fastdom;
          }.call(this);
        },
      );
    } else {
      if ('o' == (typeof vendorScope.commonJsModule)[0]) {
        vendorScope.commonJsModule.exports = fastdom;
      }
    }
  })(window || this);
}
