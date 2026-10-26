// host/environment.
export default function initializeHostEnvironment(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery');
  requireModule('libraries/intersection-observer');
  if (window.app || window.isWk) {
    window.open = function (targetUrl) {
      bridge.callHandler('window.open', targetUrl);
    };
  }
  if (window.reqnode) {
    window.open = function () {
      console.error('window.open not implemeted');
    };
  }
  if ('performance' in window == 0) {
    window.performance = window.performance || {
      offset: Date.now(),
      now: function () {
        return Date.now() - this.offset;
      },
    };
  }
  Element.prototype.insertChildAtIndex = function (child, childIndex) {
    if (!childIndex) {
      childIndex = 0;
    }
    if (childIndex >= this.children.length) {
      this.appendChild(child);
    } else {
      this.insertBefore(child, this.children[childIndex]);
    }
  };
  DocumentFragment.prototype.insertChildAtIndex = function (child, childIndex) {
    if (!childIndex) {
      childIndex = 0;
    }
    if (childIndex >= this.children.length) {
      this.appendChild(child);
    } else {
      this.insertBefore(child, this.children[childIndex]);
    }
  };
  if (!Number.isNaN) {
    Number.isNaN = window.isNaN;
  }
  if (!Number.parseInt) {
    Number.parseInt = window.parseInt;
  }
  if (!window.Set) {
    var SetFallback = Object.defineProperty(
      function () {
        this.set = [];
      },
      'name',
      { value: 'r', configurable: true },
    );
    SetFallback.prototype.add = function (value) {
      if (-1 == !this.has(value)) {
        this.set.push(value);
      }
    };
    SetFallback.prototype.delete = function (searchValue) {
      if (this.has(searchValue)) {
        this.set.splice(this.set.indexOf(searchValue));
      }
    };
    SetFallback.prototype.has = function (searchValue) {
      return this.set.indexOf(searchValue) > -1;
    };
    window.Set = SetFallback;
  }
  if (!window.Map) {
    var MapFallback = Object.defineProperty(
      function () {
        this.map = {};
      },
      'name',
      { value: 'o', configurable: true },
    );
    MapFallback.prototype.get = function (key) {
      return this.map[key];
    };
    MapFallback.prototype.delete = function (key) {
      delete this.map[key];
    };
    MapFallback.prototype.set = function (key, value) {
      this.map[key] = value;
    };
    window.Map = MapFallback;
  }
  if (![].fill) {
    Object.defineProperty(Array.prototype, 'fill', {
      value: function (fillValue) {
        for (
          var arrayLike = Object(this),
            parsedNumber = parseInt(arrayLike.length),
            startArgument = arguments[1],
            startIndex = parseInt(startArgument) || 0,
            itemIndex =
              startIndex < 0
                ? Math.max(parsedNumber + startIndex, 0)
                : Math.min(startIndex, parsedNumber),
            endArgument = arguments[2],
            endIndex = void 0 === endArgument ? parsedNumber : parseInt(endArgument) || 0,
            finalIndex =
              endIndex < 0
                ? Math.max(parsedNumber + endIndex, 0)
                : Math.min(endIndex, parsedNumber);
          itemIndex < finalIndex;
          itemIndex++
        ) {
          arrayLike[itemIndex] = fillValue;
        }
        return arrayLike;
      },
    });
  }
  if (![].find) {
    Object.defineProperty(Array.prototype, 'find', {
      value: function (predicate) {
        if (null == this) {
          throw new TypeError('"this" is null or not defined');
        }
        var arrayLike = Object(this),
          arrayLength = arrayLike.length >>> 0;
        if ('function' != typeof predicate) {
          throw new TypeError('predicate must be a function');
        }
        for (var receiver = arguments[1], itemIndex = 0; itemIndex < arrayLength; ) {
          var item = arrayLike[itemIndex];
          if (predicate.call(receiver, item, itemIndex, arrayLike)) {
            return item;
          }
          itemIndex++;
        }
      },
      writable: true,
    });
  }
  Object.defineProperty(Array.prototype, 'remove', {
    value: function (searchValue) {
      var itemIndex = this.indexOf(searchValue);
      if (~itemIndex) {
        return this.splice(itemIndex, 1);
      }
    },
    writable: true,
  });
  Object.defineProperty(Array.prototype, 'removeFirstIf', {
    value: function (predicate) {
      for (var itemIndex = this.length; itemIndex--; ) {
        if (predicate(this[itemIndex], itemIndex)) {
          return void this.splice(itemIndex, 1);
        }
      }
    },
  });
  Object.defineProperty(Array.prototype, 'removeIf', {
    value: function (predicate) {
      for (var itemIndex = this.length; itemIndex--; ) {
        if (predicate(this[itemIndex], itemIndex)) {
          this.splice(itemIndex, 1);
        }
      }
    },
  });
  Object.defineProperty(Array.prototype, 'repeat', {
    value: function (fillValue, fillCount) {
      for (; fillCount; ) {
        this[--fillCount] = fillValue;
      }
      return this;
    },
  });
  Object.defineProperty(Array.prototype, 'last', {
    value: function () {
      if (this.length) {
        return this[this.length - 1];
      } else {
        return void 0;
      }
    },
    writable: true,
  });
  Object.defineProperty(Array.prototype, 'lastDef', {
    value: function () {
      for (var itemIndex = this.length - 1; itemIndex >= 0; itemIndex--) {
        if (void 0 != this[itemIndex]) {
          return this[itemIndex];
        }
      }
    },
  });
  Object.defineProperty(Array.prototype, 'clone', {
    value: function () {
      return this.slice(0);
    },
    writable: true,
  });
  Object.defineProperty(Array.prototype, 'subarray', {
    value: function (startIndex, endIndex) {
      return this.slice(startIndex, endIndex);
    },
  });
  Object.clone = function (sourceObject) {
    if (sourceObject) {
      return Object.assign({}, sourceObject);
    } else {
      return null;
    }
  };
  if ('function' != typeof Object.assign) {
    Object.defineProperty(Object, 'assign', {
      value: function (targetObject, unusedParameter2) {
        if (null == targetObject) {
          throw new TypeError('Cannot convert undefined or null to object');
        }
        for (
          var target = Object(targetObject), itemIndex = 1;
          itemIndex < arguments.length;
          itemIndex++
        ) {
          var sourceObject = arguments[itemIndex];
          if (null != sourceObject) {
            for (var propertyName in sourceObject) {
              if (Object.prototype.hasOwnProperty.call(sourceObject, propertyName)) {
                target[propertyName] = sourceObject[propertyName];
              }
            }
          }
        }
        return target;
      },
      writable: true,
      configurable: true,
    });
  }
  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = function (callback, receiver) {
      receiver = receiver || window;
      for (var itemIndex = 0; itemIndex < this.length; itemIndex++) {
        callback.call(receiver, this[itemIndex], itemIndex, this);
      }
    };
  }
  if (window.NodeList && !NodeList.prototype.last) {
    NodeList.prototype.last = function () {
      if (this.length > 0) {
        return this[this.length - 1];
      } else {
        return null;
      }
    };
  }
  NodeList.prototype.remove = function () {
    Array.prototype.slice.call(this).forEach(function (item) {
      item.remove();
    });
  };
  Node.prototype.rawText = function (markerMode) {
    if (window.File) {
      var restoreSmartPunctuation =
          File.option.convertSmartOnRender && (File.option.smartDash || File.option.smartQuote),
        clonedNode = this.cloneNode(true);
      clonedNode.querySelectorAll('.md-emptyline').forEach(function (item) {
        item.textContent = item.textContent.replace(/\n/, '');
      });
      if (File.option.ignoreLineBreak) {
        clonedNode.querySelectorAll('.md-softbreak').forEach(function (item) {
          item.textContent = item.textContent.replace(/^\u00a0/, '\n');
        });
      }
      clonedNode.querySelectorAll('.md-linebreak').forEach(function (item) {
        item.textContent = item.textContent.replace(/\n\n/, '\n');
      });
      clonedNode.querySelectorAll('.md-ruby ruby').forEach(function (item) {
        item.textContent = '';
      });
      if (File.option.enableInlineMath) {
        clonedNode.querySelectorAll('mjx-container').forEach(function (item) {
          item.textContent = '';
        });
      }
      if (restoreSmartPunctuation) {
        clonedNode.querySelectorAll('.md-pants').forEach(function (element) {
          if (
            element.textContent.indexOf(element.dataset.content) > -1 &&
            element.firstElementChild
          ) {
            element.firstElementChild.remove();
          }
          if (element.classList.contains('md-pants-space-after')) {
            element.textContent = element.textContent.replace(/^ /, '"');
          } else {
            if (element.classList.contains('md-pants-space-before')) {
              element.textContent = element.textContent.replace(/»/, '"');
            } else {
              element.textContent = element.textContent.replace(
                element.dataset.content || element.dataset.text,
                element.dataset.text,
              );
            }
          }
        });
      }
      if (true === markerMode) {
        clonedNode
          .querySelectorAll('.md-math-after-sym, .md-emoji-control-ch')
          .forEach(function (item) {
            item.textContent = item.textContent.replace(/\u200b/g, '');
          });
      }
      if ('emoji' === markerMode) {
        clonedNode.querySelectorAll('.md-math-after-sym').forEach(function (item) {
          item.textContent = item.textContent.replace(/\u200b/g, '');
        });
      }
      if (void 0 === clonedNode.textContent) {
        return clonedNode.innerText;
      } else {
        return clonedNode.textContent;
      }
    }
  };
  jquery.fn.visibleText = function () {
    if (0 === this.length) {
      return '';
    }
    if (1 === this.length && (3 === this[0].nodeType || 0 === this[0].childElementCount)) {
      return this.text();
    }
    var visibleText = '';
    jquery.each(this.contents(), function (unusedParameter1, domNode) {
      if (3 === domNode.nodeType) {
        visibleText += domNode.textContent;
      } else {
        if (1 === domNode.nodeType && domNode.tagName == 'mjx-container'.toUpperCase()) {
          visibleText += (domNode.nextElementSibling || {}).offsetWidth ? domNode.textContent : 1;
        } else {
          if (1 === domNode.nodeType && (domNode.offsetHeight || domNode.offsetWidth)) {
            visibleText += jquery(domNode).visibleText();
          }
        }
      }
    });
    return visibleText;
  };
  jquery.fn.contentText = function () {
    if (0 === this.length) {
      return '';
    }
    if (1 === this.length && (3 === this[0].nodeType || 0 === this[0].childElementCount)) {
      return this.text();
    }
    var contentText = '';
    jquery.each(this.contents(), function (unusedParameter1, domNode) {
      if (3 === domNode.nodeType) {
        contentText += domNode.textContent;
      } else {
        if (1 === domNode.nodeType) {
          if (!domNode.classList.contains('md-meta')) {
            contentText += jquery(domNode).contentText();
          }
        }
      }
    });
    return contentText;
  };
  if (window.console) {
    (function () {
      var ipcRenderer;
      console.stack = function (message) {
        if (File.isNodeHtml) {
          var stack = new Error().stack;
          if (message) {
            console.debug(message);
          }
          console.debug(stack);
        } else {
          console.trace;
        }
      };
      if (!console.warn) {
        console.warn = function (message) {
          console.log(message);
        };
      }
      if (File.isNode) {
        ipcRenderer = reqnode('electron').ipcRenderer;
      }
      var error = console.error;
      console.sendError = function (errorOrMessage, level, optionsOrDetail) {
        var detail = optionsOrDetail,
          reportOptions = optionsOrDetail;
        if ('string' == typeof optionsOrDetail) {
          reportOptions = { detail: detail };
        } else {
          detail = void 0;
        }
        var errorText = errorOrMessage;
        if (errorOrMessage.stack) {
          errorText = errorOrMessage.stack;
        } else {
          if (errorOrMessage.message) {
            errorText = errorOrMessage.message;
          }
        }
        var isWarning = false === level || 'warn' === level || 'warning' === level,
          logMessage = `${errorText}${detail ? ' {' + detail + '}' : ''}`;
        if (isWarning) {
          console.warn(logMessage);
        } else {
          error(logMessage);
        }
        JSBridge.invoke(isWarning ? 'logger.warn' : 'logger.error', logMessage);
        if (window.Reporter) {
          if (!(false === level && true === level && 'skip' === level)) {
            window.Reporter.error(errorOrMessage, Object.assign({ level: level }, reportOptions));
          }
        }
      };
      var log = console.log;
      console.sendLog = function (message, skipRecord) {
        log(message);
        if (!skipRecord) {
          Reporter.record(message);
        }
        if (File.isMac) {
          bridge.callHandler('logger.info', message);
        } else {
          if (File.isNode) {
            if (!ipcRenderer) {
              ipcRenderer = reqnode('electron').ipcRenderer;
            }
            if (ipcRenderer) {
              ipcRenderer.send('sendLog', message);
            }
          }
        }
      };
      console.sendLogForDebug = function (message) {
        if (window.debugMode) {
          console.sendLog(message);
        }
      };
      if (window.debugMode && File.isMac) {
        var debug = console.debug;
        console.debug = function (message) {
          debug(message);
          if (File.isMac) {
            bridge.callHandler('logger.debug', message);
          }
        };
      }
    })();
  }
  if (void 0 === NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }
  if (void 0 === HTMLCollection.prototype.forEach) {
    HTMLCollection.prototype.forEach = Array.prototype.forEach;
  }
  if (!window.Promise) {
    (function (unusedParameter1) {
      Object.defineProperty(emptyExecutor, 'name', { value: 'n', configurable: true });
      Object.defineProperty(PromiseFallback, 'name', { value: 'i', configurable: true });
      Object.defineProperty(handleDeferred, 'name', { value: 'r', configurable: true });
      Object.defineProperty(resolvePromise, 'name', { value: 'o', configurable: true });
      Object.defineProperty(rejectPromise, 'name', { value: 'a', configurable: true });
      Object.defineProperty(finalizePromise, 'name', { value: 's', configurable: true });
      Object.defineProperty(executeResolver, 'name', { value: 'l', configurable: true });

      var currentSetTimeout = setTimeout;
      function emptyExecutor() {}
      function PromiseFallback(executor) {
        if ('object' != typeof this) {
          throw new TypeError('Promises must be constructed via new');
        }
        if ('function' != typeof executor) {
          throw new TypeError('not a function');
        }
        this._state = 0;
        this._handled = false;
        this._value = void 0;
        this._deferreds = [];
        executeResolver(executor, this);
      }
      function handleDeferred(_value, deferred) {
        for (; 3 === _value._state; ) {
          _value = _value._value;
        }
        if (0 !== _value._state) {
          _value._handled = true;
          PromiseFallback._immediateFn(function () {
            var callback = 1 === _value._state ? deferred.onFulfilled : deferred.onRejected;
            if (null !== callback) {
              var callbackResult;
              try {
                callbackResult = callback(_value._value);
              } catch (error) {
                return void rejectPromise(deferred.promise, error);
              }
              resolvePromise(deferred.promise, callbackResult);
            } else {
              (1 === _value._state ? resolvePromise : rejectPromise)(
                deferred.promise,
                _value._value,
              );
            }
          });
        } else {
          _value._deferreds.push(deferred);
        }
      }
      function resolvePromise(promise, _value) {
        try {
          if (_value === promise) {
            throw new TypeError('A promise cannot be resolved with itself.');
          }
          if (_value && ('object' == typeof _value || 'function' == typeof _value)) {
            var thenMethod = _value.then;
            if (_value instanceof PromiseFallback) {
              promise._state = 3;
              promise._value = _value;
              return void finalizePromise(promise);
            }
            if ('function' == typeof thenMethod) {
              return void executeResolver(
                ((boundThen = thenMethod),
                (current_value = _value),
                function () {
                  boundThen.apply(current_value, arguments);
                }),
                promise,
              );
            }
          }
          promise._state = 1;
          promise._value = _value;
          finalizePromise(promise);
        } catch (error) {
          rejectPromise(promise, error);
        }
        var boundThen, current_value;
      }
      function rejectPromise(promise, _value) {
        promise._state = 2;
        promise._value = _value;
        finalizePromise(promise);
      }
      function finalizePromise(promise) {
        if (2 === promise._state && 0 === promise._deferreds.length) {
          PromiseFallback._immediateFn(function () {
            if (!promise._handled) {
              PromiseFallback._unhandledRejectionFn(promise._value);
            }
          });
        }
        for (
          var itemIndex = 0, _deferredsLength = promise._deferreds.length;
          itemIndex < _deferredsLength;
          itemIndex++
        ) {
          handleDeferred(promise, promise._deferreds[itemIndex]);
        }
        promise._deferreds = null;
      }
      function executeResolver(executor, promise) {
        var settled = false;
        try {
          executor(
            function (resolvedValue) {
              if (!settled) {
                settled = true;
                resolvePromise(promise, resolvedValue);
              }
            },
            function (rejectionReason) {
              if (!settled) {
                settled = true;
                rejectPromise(promise, rejectionReason);
              }
            },
          );
        } catch (error) {
          if (settled) {
            return;
          }
          settled = true;
          rejectPromise(promise, error);
        }
      }
      PromiseFallback.prototype.catch = function (onRejected) {
        return this.then(null, onRejected);
      };
      PromiseFallback.prototype.then = function (onFulfilled, onRejected) {
        var nextPromise = new this.constructor(emptyExecutor);
        handleDeferred(
          this,
          new (function (onFulfilled, onRejected, promise) {
            this.onFulfilled = 'function' == typeof onFulfilled ? onFulfilled : null;
            this.onRejected = 'function' == typeof onRejected ? onRejected : null;
            this.promise = promise;
          })(onFulfilled, onRejected, nextPromise),
        );
        return nextPromise;
      };
      PromiseFallback.all = function (values) {
        var results = Array.prototype.slice.call(values);
        return new PromiseFallback(function (resolveAll, rejectAll) {
          Object.defineProperty(resolveAllEntry, 'name', { value: 'r', configurable: true });

          if (0 === results.length) {
            return resolveAll([]);
          }
          var length = results.length;
          function resolveAllEntry(resultIndex, value) {
            try {
              if (value && ('object' == typeof value || 'function' == typeof value)) {
                var thenMethod = value.then;
                if ('function' == typeof thenMethod) {
                  return void thenMethod.call(
                    value,
                    function (resolvedValue) {
                      resolveAllEntry(resultIndex, resolvedValue);
                    },
                    rejectAll,
                  );
                }
              }
              results[resultIndex] = value;
              if (0 == --length) {
                resolveAll(results);
              }
            } catch (error) {
              rejectAll(error);
            }
          }
          for (var itemIndex = 0; itemIndex < results.length; itemIndex++) {
            resolveAllEntry(itemIndex, results[itemIndex]);
          }
        });
      };
      PromiseFallback.resolve = function (value) {
        if (value && 'object' == typeof value && value.constructor === PromiseFallback) {
          return value;
        } else {
          return new PromiseFallback(function (resolveValue) {
            resolveValue(value);
          });
        }
      };
      PromiseFallback.reject = function (reason) {
        return new PromiseFallback(function (inputUnusedParameter1, rejectReason) {
          rejectReason(reason);
        });
      };
      PromiseFallback.race = function (promises) {
        return new PromiseFallback(function (resolveFirst, rejectFirst) {
          for (var itemIndex = 0, length = promises.length; itemIndex < length; itemIndex++) {
            promises[itemIndex].then(resolveFirst, rejectFirst);
          }
        });
      };
      PromiseFallback._immediateFn =
        ('function' == typeof setImmediate &&
          function (callback) {
            setImmediate(callback);
          }) ||
        function (callback) {
          currentSetTimeout(callback, 0);
        };
      PromiseFallback._unhandledRejectionFn = function (reason) {
        if ('undefined' != typeof console && console) {
          console.warn('Possible Unhandled Promise Rejection:', reason);
        }
      };
      PromiseFallback._setImmediateFn = function (_immediateFn) {
        PromiseFallback._immediateFn = _immediateFn;
      };
      PromiseFallback._setUnhandledRejectionFn = function (_unhandledRejectionFn) {
        PromiseFallback._unhandledRejectionFn = _unhandledRejectionFn;
      };
      window.Promise = PromiseFallback;
    })(window);
  }
  if (window.reqnode) {
    window.alert = function (detail) {
      JSBridge.invoke('dialog.showMessageBox', {
        type: 'error',
        message: jquery.localize.getString('Error'),
        detail: detail,
        buttons: [jquery.localize.getString('OK')],
      });
    };
  }
  if (window.debugMode) {
    if (!Object.observe) {
      Object.observe = function (observedObject, onObservedChange) {
        onObservedChange = onObservedChange || (() => {});
        return new Proxy(observedObject, {
          set(key, value, nextValue, unusedParameter4) {
            var oldValue = key[value];
            if (oldValue === nextValue) {
              return;
            }
            let type = void 0 === oldValue ? 'add' : 'update';
            var changeRecord = { name: value, type: type, object: key };
            if ('update' === type) {
              changeRecord.oldValue = oldValue;
            }
            key[value] = nextValue;
            onObservedChange([changeRecord]);
          },
          deleteProperty(object, name, unusedParameter3) {
            if (name in object) {
              var changeRecord = {
                name: name,
                type: 'delete',
                object: object,
                oldValue: object[name],
              };
              delete object[name];
              onObservedChange([changeRecord]);
            }
          },
        });
      };
    }
  }
  if (!window.requestIdleCallback) {
    window.requestIdleCallback = function (callback, idleOptions) {
      return window.setTimeout(callback, (idleOptions || {}).timeout || 100);
    };
    window.cancelIdleCallback = window.clearTimeout;
  }
  window.requestSmartSchedule = function (callback, delay, timeout) {
    var idleHandle = null;
    return [
      setTimeout(() => {
        idleHandle = requestIdleCallback(callback, { timeout: timeout - delay });
      }, delay),
      idleHandle,
    ];
  };
  window.cancelSmartSchedule = function (scheduleHandles) {
    if (scheduleHandles[0]) {
      clearTimeout(scheduleHandles[0]);
    }
    if (scheduleHandles[1]) {
      cancelIdleCallback(scheduleHandles[1]);
    }
  };
  moduleExports.safePromise = async (operation) => {
    try {
      return await operation();
    } catch (error) {
      console.warn(error);
      return null;
    }
  };
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (searchValue, replacement) {
      if ('[object regexp]' === Object.prototype.toString.call(searchValue).toLowerCase()) {
        return this.replace(searchValue, replacement);
      } else {
        return this.replace(new RegExp(searchValue, 'g'), replacement);
      }
    };
  }
  if (!window.structuredClone) {
    window.structuredClone = function (cloneValue) {
      return JSON.parse(JSON.stringify(cloneValue));
    };
  }
  if (!Object.hasOwn) {
    Object.hasOwn = function (object, propertyKey) {
      return Object.prototype.hasOwnProperty.call(object, propertyKey);
    };
  }
}
