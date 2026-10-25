// host/environment.
// SystemJS module 2c. Dependencies: e, 5b.
$__System.registerDynamic(
  '2c',
  ['e', '5b'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var jquery = requireModule('e');
    if (
      (requireModule('5b'),
      (window.app || window.isWk) &&
        (window.open = function (targetUrl) {
          bridge.callHandler('window.open', targetUrl);
        }),
      window.reqnode &&
        (window.open = function () {
          console.error('window.open not implemeted');
        }),
      'performance' in window == 0 &&
        (window.performance = window.performance || {
          offset: Date.now(),
          now: function () {
            return Date.now() - this.offset;
          },
        }),
      (Element.prototype.insertChildAtIndex = function (child, childIndex) {
        childIndex || (childIndex = 0),
          childIndex >= this.children.length
            ? this.appendChild(child)
            : this.insertBefore(child, this.children[childIndex]);
      }),
      (DocumentFragment.prototype.insertChildAtIndex = function (child, childIndex) {
        childIndex || (childIndex = 0),
          childIndex >= this.children.length
            ? this.appendChild(child)
            : this.insertBefore(child, this.children[childIndex]);
      }),
      Number.isNaN || (Number.isNaN = window.isNaN),
      Number.parseInt || (Number.parseInt = window.parseInt),
      !window.Set)
    ) {
      var r = function () {
        this.set = [];
      };
      (r.prototype.add = function (value) {
        -1 == !this.has(value) && this.set.push(value);
      }),
        (r.prototype.delete = function (searchValue) {
          this.has(searchValue) && this.set.splice(this.set.indexOf(searchValue));
        }),
        (r.prototype.has = function (searchValue) {
          return this.set.indexOf(searchValue) > -1;
        }),
        (window.Set = r);
    }
    if (!window.Map) {
      var o = function () {
        this.map = {};
      };
      (o.prototype.get = function (key) {
        return this.map[key];
      }),
        (o.prototype.delete = function (key) {
          delete this.map[key];
        }),
        (o.prototype.set = function (key, value) {
          this.map[key] = value;
        }),
        (window.Map = o);
    }
    [].fill ||
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
          )
            arrayLike[itemIndex] = fillValue;
          return arrayLike;
        },
      }),
      [].find ||
        Object.defineProperty(Array.prototype, 'find', {
          value: function (predicate) {
            if (null == this) throw new TypeError('"this" is null or not defined');
            var arrayLike = Object(this),
              arrayLength = arrayLike.length >>> 0;
            if ('function' != typeof predicate) throw new TypeError('predicate must be a function');
            for (var receiver = arguments[1], itemIndex = 0; itemIndex < arrayLength; ) {
              var item = arrayLike[itemIndex];
              if (predicate.call(receiver, item, itemIndex, arrayLike)) return item;
              itemIndex++;
            }
          },
          writable: !0,
        }),
      Object.defineProperty(Array.prototype, 'remove', {
        value: function (searchValue) {
          var itemIndex = this.indexOf(searchValue);
          if (~itemIndex) return this.splice(itemIndex, 1);
        },
        writable: !0,
      }),
      Object.defineProperty(Array.prototype, 'removeFirstIf', {
        value: function (predicate) {
          for (var itemIndex = this.length; itemIndex--; )
            if (predicate(this[itemIndex], itemIndex)) return void this.splice(itemIndex, 1);
        },
      }),
      Object.defineProperty(Array.prototype, 'removeIf', {
        value: function (predicate) {
          for (var itemIndex = this.length; itemIndex--; )
            predicate(this[itemIndex], itemIndex) && this.splice(itemIndex, 1);
        },
      }),
      Object.defineProperty(Array.prototype, 'repeat', {
        value: function (fillValue, fillCount) {
          for (; fillCount; ) this[--fillCount] = fillValue;
          return this;
        },
      }),
      Object.defineProperty(Array.prototype, 'last', {
        value: function () {
          return this.length ? this[this.length - 1] : void 0;
        },
        writable: !0,
      }),
      Object.defineProperty(Array.prototype, 'lastDef', {
        value: function () {
          for (var itemIndex = this.length - 1; itemIndex >= 0; itemIndex--)
            if (void 0 != this[itemIndex]) return this[itemIndex];
        },
      }),
      Object.defineProperty(Array.prototype, 'clone', {
        value: function () {
          return this.slice(0);
        },
        writable: !0,
      }),
      Object.defineProperty(Array.prototype, 'subarray', {
        value: function (startIndex, endIndex) {
          return this.slice(startIndex, endIndex);
        },
      }),
      (Object.clone = function (sourceObject) {
        return sourceObject ? Object.assign({}, sourceObject) : null;
      }),
      'function' != typeof Object.assign &&
        Object.defineProperty(Object, 'assign', {
          value: function (targetObject, unusedParameter2) {
            if (null == targetObject)
              throw new TypeError('Cannot convert undefined or null to object');
            for (
              var target = Object(targetObject), itemIndex = 1;
              itemIndex < arguments.length;
              itemIndex++
            ) {
              var sourceObject = arguments[itemIndex];
              if (null != sourceObject)
                for (var propertyName in sourceObject)
                  Object.prototype.hasOwnProperty.call(sourceObject, propertyName) &&
                    (target[propertyName] = sourceObject[propertyName]);
            }
            return target;
          },
          writable: !0,
          configurable: !0,
        }),
      window.NodeList &&
        !NodeList.prototype.forEach &&
        (NodeList.prototype.forEach = function (callback, receiver) {
          receiver = receiver || window;
          for (var itemIndex = 0; itemIndex < this.length; itemIndex++)
            callback.call(receiver, this[itemIndex], itemIndex, this);
        }),
      window.NodeList &&
        !NodeList.prototype.last &&
        (NodeList.prototype.last = function () {
          return this.length > 0 ? this[this.length - 1] : null;
        }),
      (NodeList.prototype.remove = function () {
        Array.prototype.slice.call(this).forEach(function (item) {
          item.remove();
        });
      }),
      (Node.prototype.rawText = function (markerMode) {
        if (window.File) {
          var restoreSmartPunctuation =
              File.option.convertSmartOnRender && (File.option.smartDash || File.option.smartQuote),
            clonedNode = this.cloneNode(!0);
          return (
            clonedNode.querySelectorAll('.md-emptyline').forEach(function (item) {
              item.textContent = item.textContent.replace(/\n/, '');
            }),
            File.option.ignoreLineBreak &&
              clonedNode.querySelectorAll('.md-softbreak').forEach(function (item) {
                item.textContent = item.textContent.replace(/^\u00a0/, '\n');
              }),
            clonedNode.querySelectorAll('.md-linebreak').forEach(function (item) {
              item.textContent = item.textContent.replace(/\n\n/, '\n');
            }),
            clonedNode.querySelectorAll('.md-ruby ruby').forEach(function (item) {
              item.textContent = '';
            }),
            File.option.enableInlineMath &&
              clonedNode.querySelectorAll('mjx-container').forEach(function (item) {
                item.textContent = '';
              }),
            restoreSmartPunctuation &&
              clonedNode.querySelectorAll('.md-pants').forEach(function (element) {
                element.textContent.indexOf(element.dataset.content) > -1 &&
                  element.firstElementChild &&
                  element.firstElementChild.remove(),
                  element.classList.contains('md-pants-space-after')
                    ? (element.textContent = element.textContent.replace(/^ /, '"'))
                    : element.classList.contains('md-pants-space-before')
                      ? (element.textContent = element.textContent.replace(/»/, '"'))
                      : (element.textContent = element.textContent.replace(
                          element.dataset.content || element.dataset.text,
                          element.dataset.text,
                        ));
              }),
            !0 === markerMode &&
              clonedNode
                .querySelectorAll('.md-math-after-sym, .md-emoji-control-ch')
                .forEach(function (item) {
                  item.textContent = item.textContent.replace(/\u200b/g, '');
                }),
            'emoji' === markerMode &&
              clonedNode.querySelectorAll('.md-math-after-sym').forEach(function (item) {
                item.textContent = item.textContent.replace(/\u200b/g, '');
              }),
            void 0 === clonedNode.textContent ? clonedNode.innerText : clonedNode.textContent
          );
        }
      }),
      (jquery.fn.visibleText = function () {
        if (0 === this.length) return '';
        if (1 === this.length && (3 === this[0].nodeType || 0 === this[0].childElementCount))
          return this.text();
        var visibleText = '';
        return (
          jquery.each(this.contents(), function (unusedParameter1, domNode) {
            3 === domNode.nodeType
              ? (visibleText += domNode.textContent)
              : 1 === domNode.nodeType && domNode.tagName == 'mjx-container'.toUpperCase()
                ? (visibleText += (domNode.nextElementSibling || {}).offsetWidth
                    ? domNode.textContent
                    : 1)
                : 1 === domNode.nodeType &&
                  (domNode.offsetHeight || domNode.offsetWidth) &&
                  (visibleText += jquery(domNode).visibleText());
          }),
          visibleText
        );
      }),
      (jquery.fn.contentText = function () {
        if (0 === this.length) return '';
        if (1 === this.length && (3 === this[0].nodeType || 0 === this[0].childElementCount))
          return this.text();
        var contentText = '';
        return (
          jquery.each(this.contents(), function (unusedParameter1, domNode) {
            3 === domNode.nodeType
              ? (contentText += domNode.textContent)
              : 1 === domNode.nodeType &&
                (domNode.classList.contains('md-meta') ||
                  (contentText += jquery(domNode).contentText()));
          }),
          contentText
        );
      }),
      window.console &&
        (function () {
          var ipcRenderer;
          (console.stack = function (message) {
            if (File.isNodeHtml) {
              var stack = new Error().stack;
              message && console.debug(message), console.debug(stack);
            } else console.trace;
          }),
            console.warn ||
              (console.warn = function (message) {
                console.log(message);
              }),
            File.isNode && (ipcRenderer = reqnode('electron').ipcRenderer);
          var error = console.error;
          console.sendError = function (errorOrMessage, level, optionsOrDetail) {
            var detail = optionsOrDetail,
              reportOptions = optionsOrDetail;
            'string' == typeof optionsOrDetail
              ? (reportOptions = { detail: detail })
              : (detail = void 0);
            var errorText = errorOrMessage;
            errorOrMessage.stack
              ? (errorText = errorOrMessage.stack)
              : errorOrMessage.message && (errorText = errorOrMessage.message);
            var isWarning = !1 === level || 'warn' === level || 'warning' === level,
              logMessage = `${errorText}${detail ? ' {' + detail + '}' : ''}`;
            isWarning ? console.warn(logMessage) : error(logMessage),
              JSBridge.invoke(isWarning ? 'logger.warn' : 'logger.error', logMessage),
              window.Reporter &&
                ((!1 === level && !0 === level && 'skip' === level) ||
                  window.Reporter.error(
                    errorOrMessage,
                    Object.assign({ level: level }, reportOptions),
                  ));
          };
          var log = console.log;
          if (
            ((console.sendLog = function (message, skipRecord) {
              log(message),
                !skipRecord && Reporter.record(message),
                File.isMac
                  ? bridge.callHandler('logger.info', message)
                  : File.isNode &&
                    (ipcRenderer || (ipcRenderer = reqnode('electron').ipcRenderer),
                    ipcRenderer && ipcRenderer.send('sendLog', message));
            }),
            (console.sendLogForDebug = function (message) {
              window.debugMode && console.sendLog(message);
            }),
            window.debugMode && File.isMac)
          ) {
            var debug = console.debug;
            console.debug = function (message) {
              debug(message), File.isMac && bridge.callHandler('logger.debug', message);
            };
          }
        })(),
      void 0 === NodeList.prototype.forEach &&
        (NodeList.prototype.forEach = Array.prototype.forEach),
      void 0 === HTMLCollection.prototype.forEach &&
        (HTMLCollection.prototype.forEach = Array.prototype.forEach),
      window.Promise ||
        (function (unusedParameter1) {
          var currentSetTimeout = setTimeout;
          function n() {}
          function i(e) {
            if ('object' != typeof this)
              throw new TypeError('Promises must be constructed via new');
            if ('function' != typeof e) throw new TypeError('not a function');
            (this._state = 0),
              (this._handled = !1),
              (this._value = void 0),
              (this._deferreds = []),
              l(e, this);
          }
          function r(_value, t) {
            for (; 3 === _value._state; ) _value = _value._value;
            0 !== _value._state
              ? ((_value._handled = !0),
                i._immediateFn(function () {
                  var n = 1 === _value._state ? t.onFulfilled : t.onRejected;
                  if (null !== n) {
                    var i;
                    try {
                      i = n(_value._value);
                    } catch (error) {
                      return void a(t.promise, error);
                    }
                    o(t.promise, i);
                  } else (1 === _value._state ? o : a)(t.promise, _value._value);
                }))
              : _value._deferreds.push(t);
          }
          function o(e, _value) {
            try {
              if (_value === e) throw new TypeError('A promise cannot be resolved with itself.');
              if (_value && ('object' == typeof _value || 'function' == typeof _value)) {
                var n = _value.then;
                if (_value instanceof i) return (e._state = 3), (e._value = _value), void s(e);
                if ('function' == typeof n)
                  return void l(
                    ((r = n),
                    (current_value = _value),
                    function () {
                      r.apply(current_value, arguments);
                    }),
                    e,
                  );
              }
              (e._state = 1), (e._value = _value), s(e);
            } catch (error) {
              a(e, error);
            }
            var r, current_value;
          }
          function a(e, _value) {
            (e._state = 2), (e._value = _value), s(e);
          }
          function s(e) {
            2 === e._state &&
              0 === e._deferreds.length &&
              i._immediateFn(function () {
                e._handled || i._unhandledRejectionFn(e._value);
              });
            for (
              var itemIndex = 0, _deferredsLength = e._deferreds.length;
              itemIndex < _deferredsLength;
              itemIndex++
            )
              r(e, e._deferreds[itemIndex]);
            e._deferreds = null;
          }
          function l(e, t) {
            var n = !1;
            try {
              e(
                function (e) {
                  n || ((n = !0), o(t, e));
                },
                function (e) {
                  n || ((n = !0), a(t, e));
                },
              );
            } catch (error) {
              if (n) return;
              (n = !0), a(t, error);
            }
          }
          (i.prototype.catch = function (e) {
            return this.then(null, e);
          }),
            (i.prototype.then = function (e, t) {
              var i = new this.constructor(n);
              return (
                r(
                  this,
                  new (function (e, t, promise) {
                    (this.onFulfilled = 'function' == typeof e ? e : null),
                      (this.onRejected = 'function' == typeof t ? t : null),
                      (this.promise = promise);
                  })(e, t, i),
                ),
                i
              );
            }),
            (i.all = function (e) {
              var t = Array.prototype.slice.call(e);
              return new i(function (e, n) {
                if (0 === t.length) return e([]);
                var length = t.length;
                function r(o, a) {
                  try {
                    if (a && ('object' == typeof a || 'function' == typeof a)) {
                      var s = a.then;
                      if ('function' == typeof s)
                        return void s.call(
                          a,
                          function (e) {
                            r(o, e);
                          },
                          n,
                        );
                    }
                    (t[o] = a), 0 == --length && e(t);
                  } catch (error) {
                    n(error);
                  }
                }
                for (var itemIndex = 0; itemIndex < t.length; itemIndex++)
                  r(itemIndex, t[itemIndex]);
              });
            }),
            (i.resolve = function (e) {
              return e && 'object' == typeof e && e.constructor === i
                ? e
                : new i(function (t) {
                    t(e);
                  });
            }),
            (i.reject = function (e) {
              return new i(function (inputUnusedParameter1, n) {
                n(e);
              });
            }),
            (i.race = function (e) {
              return new i(function (t, n) {
                for (var itemIndex = 0, length = e.length; itemIndex < length; itemIndex++)
                  e[itemIndex].then(t, n);
              });
            }),
            (i._immediateFn =
              ('function' == typeof setImmediate &&
                function (e) {
                  setImmediate(e);
                }) ||
              function (callback) {
                currentSetTimeout(callback, 0);
              }),
            (i._unhandledRejectionFn = function (e) {
              'undefined' != typeof console &&
                console &&
                console.warn('Possible Unhandled Promise Rejection:', e);
            }),
            (i._setImmediateFn = function (_immediateFn) {
              i._immediateFn = _immediateFn;
            }),
            (i._setUnhandledRejectionFn = function (_unhandledRejectionFn) {
              i._unhandledRejectionFn = _unhandledRejectionFn;
            }),
            (window.Promise = i);
        })(window),
      window.reqnode &&
        (window.alert = function (detail) {
          JSBridge.invoke('dialog.showMessageBox', {
            type: 'error',
            message: jquery.localize.getString('Error'),
            detail: detail,
            buttons: [jquery.localize.getString('OK')],
          });
        }),
      window.debugMode &&
        (Object.observe ||
          (Object.observe = function (observedObject, t) {
            return (
              (t = t || (() => {})),
              new Proxy(observedObject, {
                set(key, value, nextValue, unusedParameter4) {
                  var oldValue = key[value];
                  if (oldValue === nextValue) return;
                  let type = void 0 === oldValue ? 'add' : 'update';
                  var changeRecord = { name: value, type: type, object: key };
                  'update' === type && (changeRecord.oldValue = oldValue),
                    (key[value] = nextValue),
                    t([changeRecord]);
                },
                deleteProperty(object, name, unusedParameter3) {
                  if (name in object) {
                    var changeRecord = {
                      name: name,
                      type: 'delete',
                      object: object,
                      oldValue: object[name],
                    };
                    delete object[name], t([changeRecord]);
                  }
                },
              })
            );
          })),
      window.requestIdleCallback ||
        ((window.requestIdleCallback = function (callback, idleOptions) {
          return window.setTimeout(callback, (idleOptions || {}).timeout || 100);
        }),
        (window.cancelIdleCallback = window.clearTimeout)),
      (window.requestSmartSchedule = function (callback, delay, timeout) {
        var idleHandle = null;
        return [
          setTimeout(() => {
            idleHandle = requestIdleCallback(callback, { timeout: timeout - delay });
          }, delay),
          idleHandle,
        ];
      }),
      (window.cancelSmartSchedule = function (scheduleHandles) {
        scheduleHandles[0] && clearTimeout(scheduleHandles[0]),
          scheduleHandles[1] && cancelIdleCallback(scheduleHandles[1]);
      }),
      (moduleExports.safePromise = async (operation) => {
        try {
          return await operation();
        } catch (error) {
          return console.warn(error), null;
        }
      }),
      String.prototype.replaceAll ||
        (String.prototype.replaceAll = function (searchValue, replacement) {
          return '[object regexp]' === Object.prototype.toString.call(searchValue).toLowerCase()
            ? this.replace(searchValue, replacement)
            : this.replace(new RegExp(searchValue, 'g'), replacement);
        }),
      window.structuredClone ||
        (window.structuredClone = function (cloneValue) {
          return JSON.parse(JSON.stringify(cloneValue));
        }),
      Object.hasOwn ||
        (Object.hasOwn = function (object, propertyKey) {
          return Object.prototype.hasOwnProperty.call(object, propertyKey);
        });
  },
);
