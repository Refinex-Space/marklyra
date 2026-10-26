// Install this compatibility library in the supplied engine environment.
export default function installLibrariesErrorReporterRuntime(engineModules, vendorScope) {
  // libraries/error-reporter-runtime.
  // Shared vendor state is installed in the explicit main.js initialization order.
  vendorScope.errorReporterFactory = function createErrorReporter() {
    return (function createModuleLoader(moduleFactories, moduleCache, entryModules) {
      function loadModule(moduleId, skipFallback) {
        if (!moduleCache[moduleId]) {
          if (!moduleFactories[moduleId]) {
            var fallbackRequire =
              'function' == typeof vendorScope.nativeRequire && vendorScope.nativeRequire;
            if (!skipFallback && fallbackRequire) {
              return fallbackRequire(moduleId, true);
            }
            if (outerRequire) {
              return outerRequire(moduleId, true);
            }
            var missingModuleError = new Error("Cannot find module '" + moduleId + "'");
            missingModuleError.code = 'MODULE_NOT_FOUND';
            throw missingModuleError;
          }
          var moduleRecord = (moduleCache[moduleId] = { exports: {} });
          moduleFactories[moduleId][0].call(
            moduleRecord.exports,
            function (dependencyName) {
              var dependencyId = moduleFactories[moduleId][1][dependencyName];
              return loadModule(dependencyId || dependencyName);
            },
            moduleRecord,
            moduleRecord.exports,
            createModuleLoader,
            moduleFactories,
            moduleCache,
            entryModules,
          );
        }
        return moduleCache[moduleId].exports;
      }
      for (
        var outerRequire =
            'function' == typeof vendorScope.nativeRequire && vendorScope.nativeRequire,
          entryIndex = 0;
        entryIndex < entryModules.length;
        entryIndex++
      ) {
        loadModule(entryModules[entryIndex]);
      }
      return loadModule;
    })(
      {
        1: [
          function (_dereq_, moduleRecord, moduleExports) {
            function RavenConfigError(message) {
              this.name = 'RavenConfigError';
              this.message = message;
            }
            RavenConfigError.prototype = new Error();
            RavenConfigError.prototype.constructor = RavenConfigError;
            moduleRecord.exports = RavenConfigError;
          },
          {},
        ],
        2: [
          function (_dereq_, moduleRecord, moduleExports) {
            var utils = _dereq_(5);
            moduleRecord.exports = {
              wrapMethod: function (console, level, callback) {
                var originalConsoleLevel = console[level],
                  originalConsole = console;
                if (level in console) {
                  var sentryLevel = 'warn' === level ? 'warning' : level;
                  console[level] = function () {
                    var args = [].slice.call(arguments),
                      msg = utils.safeJoin(args, ' '),
                      data = {
                        level: sentryLevel,
                        logger: 'console',
                        extra: { arguments: args },
                      };
                    if ('assert' === level) {
                      if (false === args[0]) {
                        msg =
                          'Assertion failed: ' +
                          (utils.safeJoin(args.slice(1), ' ') || 'console.assert');
                        data.extra.arguments = args.slice(1);
                        if (callback) {
                          callback(msg, data);
                        }
                      }
                    } else {
                      if (callback) {
                        callback(msg, data);
                      }
                    }
                    if (originalConsoleLevel) {
                      Function.prototype.apply.call(originalConsoleLevel, originalConsole, args);
                    }
                  };
                }
              },
            };
          },
          { 5: 5 },
        ],
        3: [
          function (_dereq_, moduleRecord, moduleExports) {
            (function (global) {
              var TraceKit = _dereq_(6),
                stringify = _dereq_(7),
                md5 = _dereq_(8),
                RavenConfigError = _dereq_(1),
                utils = _dereq_(5),
                isErrorEvent = utils.isErrorEvent,
                isDOMError = utils.isDOMError,
                isDOMException = utils.isDOMException,
                isError = utils.isError,
                isObject = utils.isObject,
                isPlainObject = utils.isPlainObject,
                isUndefined = utils.isUndefined,
                isFunction = utils.isFunction,
                isString = utils.isString,
                isArray = utils.isArray,
                isEmptyObject = utils.isEmptyObject,
                each = utils.each,
                objectMerge = utils.objectMerge,
                truncate = utils.truncate,
                objectFrozen = utils.objectFrozen,
                hasKey = utils.hasKey,
                joinRegExp = utils.joinRegExp,
                urlencode = utils.urlencode,
                uuid4 = utils.uuid4,
                htmlTreeAsString = utils.htmlTreeAsString,
                isSameException = utils.isSameException,
                isSameStacktrace = utils.isSameStacktrace,
                parseUrl = utils.parseUrl,
                fill = utils.fill,
                supportsFetch = utils.supportsFetch,
                supportsReferrerPolicy = utils.supportsReferrerPolicy,
                serializeException = (utils.serializeKeysForMessage, utils.serializeException),
                sanitize = utils.sanitize,
                wrapConsoleMethod = _dereq_(2).wrapMethod,
                dsnKeys = 'source protocol user pass host port path'.split(' '),
                dsnPattern = /^(?:(\w+):)?\/\/(?:(\w+)(:\w+)?@)?([\w\.-]+)(?::(\d+))?(\/.*)/;
              function now() {
                return +new Date();
              }
              var _window =
                  'undefined' != typeof window
                    ? window
                    : void 0 !== global
                      ? global
                      : 'undefined' != typeof self
                        ? self
                        : {},
                _document = _window.document,
                _navigator = _window.navigator;
              function keepOriginalCallback(original, callback) {
                if (isFunction(callback)) {
                  return function (data) {
                    return callback(data, original);
                  };
                } else {
                  return callback;
                }
              }
              function Raven() {
                for (var method in ((this._hasJSON = !('object' != typeof JSON || !JSON.stringify)),
                (this._hasDocument = !isUndefined(_document)),
                (this._hasNavigator = !isUndefined(_navigator)),
                (this._lastCapturedException = null),
                (this._lastData = null),
                (this._lastEventId = null),
                (this._globalServer = null),
                (this._globalKey = null),
                (this._globalProject = null),
                (this._globalContext = {}),
                (this._globalOptions = {
                  release: _window.SENTRY_RELEASE && _window.SENTRY_RELEASE.id,
                  logger: 'javascript',
                  ignoreErrors: [],
                  ignoreUrls: [],
                  whitelistUrls: [],
                  includePaths: [],
                  headers: null,
                  collectWindowErrors: true,
                  captureUnhandledRejections: true,
                  maxMessageLength: 0,
                  maxUrlLength: 250,
                  stackTraceLimit: 50,
                  autoBreadcrumbs: true,
                  instrument: true,
                  sampleRate: 1,
                  sanitizeKeys: [],
                }),
                (this._fetchDefaults = {
                  method: 'POST',
                  keepalive: true,
                  referrerPolicy: supportsReferrerPolicy() ? 'origin' : '',
                }),
                (this._ignoreOnError = 0),
                (this._isRavenInstalled = false),
                (this._originalErrorStackTraceLimit = Error.stackTraceLimit),
                (this._originalConsole = _window.console || {}),
                (this._originalConsoleMethods = {}),
                (this._plugins = []),
                (this._startTime = now()),
                (this._wrappedBuiltIns = []),
                (this._breadcrumbs = []),
                (this._lastCapturedEvent = null),
                this._keypressTimeout,
                (this._location = _window.location),
                (this._lastHref = this._location && this._location.href),
                this._resetBackoff(),
                this._originalConsole)) {
                  this._originalConsoleMethods[method] = this._originalConsole[method];
                }
              }
              Raven.prototype = {
                VERSION: '3.26.4',
                debug: false,
                TraceKit: TraceKit,
                config: function (dsn, options) {
                  var self = this;
                  if (self._globalServer) {
                    this._logDebug('error', 'Error: Raven has already been configured');
                    return self;
                  }
                  if (!dsn) {
                    return self;
                  }
                  var globalOptions = self._globalOptions;
                  if (options) {
                    each(options, function (key, value) {
                      if ('tags' === key || 'extra' === key || 'user' === key) {
                        self._globalContext[key] = value;
                      } else {
                        globalOptions[key] = value;
                      }
                    });
                  }
                  self.setDSN(dsn);
                  globalOptions.ignoreErrors.push(/^Script error\.?$/);
                  globalOptions.ignoreErrors.push(/^Javascript error: Script error\.? on line 0$/);
                  globalOptions.ignoreErrors = joinRegExp(globalOptions.ignoreErrors);
                  globalOptions.ignoreUrls =
                    !!globalOptions.ignoreUrls.length && joinRegExp(globalOptions.ignoreUrls);
                  globalOptions.whitelistUrls =
                    !!globalOptions.whitelistUrls.length && joinRegExp(globalOptions.whitelistUrls);
                  globalOptions.includePaths = joinRegExp(globalOptions.includePaths);
                  globalOptions.maxBreadcrumbs = Math.max(
                    0,
                    Math.min(globalOptions.maxBreadcrumbs || 100, 100),
                  );
                  var autoBreadcrumbDefaults = {
                      xhr: true,
                      console: true,
                      dom: true,
                      location: true,
                      sentry: true,
                    },
                    autoBreadcrumbs = globalOptions.autoBreadcrumbs;
                  if ('[object Object]' === {}.toString.call(autoBreadcrumbs)) {
                    autoBreadcrumbs = objectMerge(autoBreadcrumbDefaults, autoBreadcrumbs);
                  } else {
                    if (false !== autoBreadcrumbs) {
                      autoBreadcrumbs = autoBreadcrumbDefaults;
                    }
                  }
                  globalOptions.autoBreadcrumbs = autoBreadcrumbs;
                  var instrumentDefaults = { tryCatch: true },
                    instrument = globalOptions.instrument;
                  if ('[object Object]' === {}.toString.call(instrument)) {
                    instrument = objectMerge(instrumentDefaults, instrument);
                  } else {
                    if (false !== instrument) {
                      instrument = instrumentDefaults;
                    }
                  }
                  globalOptions.instrument = instrument;
                  TraceKit.collectWindowErrors = !!globalOptions.collectWindowErrors;
                  return self;
                },
                install: function () {
                  var self = this;
                  if (self.isSetup() && !self._isRavenInstalled) {
                    TraceKit.report.subscribe(function () {
                      self._handleOnErrorStackInfo.apply(self, arguments);
                    });
                    if (self._globalOptions.captureUnhandledRejections) {
                      self._attachPromiseRejectionHandler();
                    }
                    self._patchFunctionToString();
                    if (self._globalOptions.instrument && self._globalOptions.instrument.tryCatch) {
                      self._instrumentTryCatch();
                    }
                    if (self._globalOptions.autoBreadcrumbs) {
                      self._instrumentBreadcrumbs();
                    }
                    self._drainPlugins();
                    self._isRavenInstalled = true;
                  }
                  Error.stackTraceLimit = self._globalOptions.stackTraceLimit;
                  return this;
                },
                setDSN: function (dsn) {
                  var uri = this._parseDSN(dsn),
                    lastSlash = uri.path.lastIndexOf('/'),
                    path = uri.path.substr(1, lastSlash);
                  this._dsn = dsn;
                  this._globalKey = uri.user;
                  this._globalSecret = uri.pass && uri.pass.substr(1);
                  this._globalProject = uri.path.substr(lastSlash + 1);
                  this._globalServer = this._getGlobalServer(uri);
                  this._globalEndpoint =
                    this._globalServer + '/' + path + 'api/' + this._globalProject + '/store/';
                  this._resetBackoff();
                },
                context: function (options, func, args) {
                  if (isFunction(options)) {
                    args = func || [];
                    func = options;
                    options = {};
                  }
                  return this.wrap(options, func).apply(this, args);
                },
                wrap: function (options, func, _before) {
                  var self = this;
                  if (isUndefined(func) && !isFunction(options)) {
                    return options;
                  }
                  if (isFunction(options)) {
                    func = options;
                    options = void 0;
                  }
                  if (!isFunction(func)) {
                    return func;
                  }
                  try {
                    if (func.__raven__) {
                      return func;
                    }
                    if (func.__raven_wrapper__) {
                      return func.__raven_wrapper__;
                    }
                  } catch (accessError) {
                    return func;
                  }
                  function wrapped() {
                    var args = [],
                      argumentCount = arguments.length,
                      deep = !options || (options && false !== options.deep);
                    for (
                      _before && isFunction(_before) && _before.apply(this, arguments);
                      argumentCount--;
                    ) {
                      args[argumentCount] = deep
                        ? self.wrap(options, arguments[argumentCount])
                        : arguments[argumentCount];
                    }
                    try {
                      return func.apply(this, args);
                    } catch (callbackError) {
                      try {
                        self._ignoreNextOnError();
                        self.captureException(callbackError, options);
                      } catch (captureError) {}
                      throw callbackError;
                    }
                  }
                  for (var property in func) {
                    if (hasKey(func, property)) {
                      wrapped[property] = func[property];
                    }
                  }
                  wrapped.prototype = func.prototype;
                  func.__raven_wrapper__ = wrapped;
                  wrapped.__raven__ = true;
                  wrapped.__orig__ = func;
                  return wrapped;
                },
                uninstall: function () {
                  TraceKit.report.uninstall();
                  this._detachPromiseRejectionHandler();
                  this._unpatchFunctionToString();
                  this._restoreBuiltIns();
                  this._restoreConsole();
                  Error.stackTraceLimit = this._originalErrorStackTraceLimit;
                  this._isRavenInstalled = false;
                  return this;
                },
                _promiseRejectionHandler: function (event) {
                  this._logDebug('debug', 'Raven caught unhandled promise rejection:', event);
                  this.captureException(event.reason, {
                    mechanism: { type: 'onunhandledrejection', handled: false },
                  });
                },
                _attachPromiseRejectionHandler: function () {
                  this._promiseRejectionHandler = this._promiseRejectionHandler.bind(this);
                  if (_window.addEventListener) {
                    _window.addEventListener('unhandledrejection', this._promiseRejectionHandler);
                  }
                  return this;
                },
                _detachPromiseRejectionHandler: function () {
                  if (_window.removeEventListener) {
                    _window.removeEventListener(
                      'unhandledrejection',
                      this._promiseRejectionHandler,
                    );
                  }
                  return this;
                },
                captureException: function (exception, options) {
                  options = objectMerge({ trimHeadFrames: 0 }, options || {});
                  if (isErrorEvent(exception) && exception.error) {
                    exception = exception.error;
                  } else {
                    if (isDOMError(exception) || isDOMException(exception)) {
                      var name =
                          exception.name || (isDOMError(exception) ? 'DOMError' : 'DOMException'),
                        message = exception.message ? name + ': ' + exception.message : name;
                      return this.captureMessage(
                        message,
                        objectMerge(options, {
                          stacktrace: true,
                          trimHeadFrames: options.trimHeadFrames + 1,
                        }),
                      );
                    }
                    if (isError(exception)) {
                      exception = exception;
                    } else {
                      if (!isPlainObject(exception)) {
                        return this.captureMessage(
                          exception,
                          objectMerge(options, {
                            stacktrace: true,
                            trimHeadFrames: options.trimHeadFrames + 1,
                          }),
                        );
                      }
                      options = this._getCaptureExceptionOptionsFromPlainObject(options, exception);
                      exception = new Error(options.message);
                    }
                  }
                  this._lastCapturedException = exception;
                  try {
                    var stack = TraceKit.computeStackTrace(exception);
                    this._handleStackInfo(stack, options);
                  } catch (ex1) {
                    if (exception !== ex1) {
                      throw ex1;
                    }
                  }
                  return this;
                },
                _getCaptureExceptionOptionsFromPlainObject: function (
                  currentOptions,
                  exceptionObject,
                ) {
                  var exKeys = Object.keys(exceptionObject).sort(),
                    options = objectMerge(currentOptions, {
                      message: JSON.stringify(exceptionObject),
                      fingerprint: [md5(exKeys)],
                      extra: currentOptions.extra || {},
                    });
                  options.extra.__serialized__ = serializeException(exceptionObject);
                  return options;
                },
                captureMessage: function (msg, options) {
                  if (
                    !this._globalOptions.ignoreErrors.test ||
                    !this._globalOptions.ignoreErrors.test(msg)
                  ) {
                    var capturedError,
                      data = objectMerge({ message: (msg += '') }, (options = options || {}));
                    try {
                      throw new Error(msg);
                    } catch (ex1) {
                      capturedError = ex1;
                    }
                    capturedError.name = null;
                    var stack = TraceKit.computeStackTrace(capturedError),
                      initialCall = isArray(stack.stack) && stack.stack[1];
                    if (initialCall && 'Raven.captureException' === initialCall.func) {
                      initialCall = stack.stack[2];
                    }
                    var fileurl = (initialCall && initialCall.url) || '';
                    if (
                      (!this._globalOptions.ignoreUrls.test ||
                        !this._globalOptions.ignoreUrls.test(fileurl)) &&
                      (!this._globalOptions.whitelistUrls.test ||
                        this._globalOptions.whitelistUrls.test(fileurl))
                    ) {
                      if (
                        this._globalOptions.stacktrace ||
                        options.stacktrace ||
                        '' === data.message
                      ) {
                        data.fingerprint = null == data.fingerprint ? msg : data.fingerprint;
                        (options = objectMerge({ trimHeadFrames: 0 }, options)).trimHeadFrames += 1;
                        var frames = this._prepareFrames(stack, options);
                        data.stacktrace = { frames: frames.reverse() };
                      }
                      if (data.fingerprint) {
                        data.fingerprint = isArray(data.fingerprint)
                          ? data.fingerprint
                          : [data.fingerprint];
                      }
                      this._send(data);
                      return this;
                    }
                  }
                },
                captureBreadcrumb: function (object) {
                  var crumb = objectMerge({ timestamp: now() / 1e3 }, object);
                  if (isFunction(this._globalOptions.breadcrumbCallback)) {
                    var result = this._globalOptions.breadcrumbCallback(crumb);
                    if (isObject(result) && !isEmptyObject(result)) {
                      crumb = result;
                    } else {
                      if (false === result) {
                        return this;
                      }
                    }
                  }
                  this._breadcrumbs.push(crumb);
                  if (this._breadcrumbs.length > this._globalOptions.maxBreadcrumbs) {
                    this._breadcrumbs.shift();
                  }
                  return this;
                },
                addPlugin: function (plugin) {
                  var pluginArgs = [].slice.call(arguments, 1);
                  this._plugins.push([plugin, pluginArgs]);
                  if (this._isRavenInstalled) {
                    this._drainPlugins();
                  }
                  return this;
                },
                setUserContext: function (user) {
                  this._globalContext.user = user;
                  return this;
                },
                setExtraContext: function (extra) {
                  this._mergeContext('extra', extra);
                  return this;
                },
                setTagsContext: function (tags) {
                  this._mergeContext('tags', tags);
                  return this;
                },
                clearContext: function () {
                  this._globalContext = {};
                  return this;
                },
                getContext: function () {
                  return JSON.parse(stringify(this._globalContext));
                },
                setEnvironment: function (environment) {
                  this._globalOptions.environment = environment;
                  return this;
                },
                setRelease: function (release) {
                  this._globalOptions.release = release;
                  return this;
                },
                setDataCallback: function (callback) {
                  var original = this._globalOptions.dataCallback;
                  this._globalOptions.dataCallback = keepOriginalCallback(original, callback);
                  return this;
                },
                setBreadcrumbCallback: function (callback) {
                  var original = this._globalOptions.breadcrumbCallback;
                  this._globalOptions.breadcrumbCallback = keepOriginalCallback(original, callback);
                  return this;
                },
                setShouldSendCallback: function (callback) {
                  var original = this._globalOptions.shouldSendCallback;
                  this._globalOptions.shouldSendCallback = keepOriginalCallback(original, callback);
                  return this;
                },
                setTransport: function (transport) {
                  this._globalOptions.transport = transport;
                  return this;
                },
                lastException: function () {
                  return this._lastCapturedException;
                },
                lastEventId: function () {
                  return this._lastEventId;
                },
                isSetup: function () {
                  return (
                    !!this._hasJSON &&
                    (!!this._globalServer ||
                      (this.ravenNotConfiguredError ||
                        ((this.ravenNotConfiguredError = true),
                        this._logDebug('error', 'Error: Raven has not been configured.')),
                      false))
                  );
                },
                afterLoad: function () {
                  var RavenConfig = _window.RavenConfig;
                  if (RavenConfig) {
                    this.config(RavenConfig.dsn, RavenConfig.config).install();
                  }
                },
                showReportDialog: function (options) {
                  if (_document) {
                    if (
                      !(options = Object.assign(
                        {
                          eventId: this.lastEventId(),
                          dsn: this._dsn,
                          user: this._globalContext.user || {},
                        },
                        options,
                      )).eventId
                    ) {
                      throw new RavenConfigError('Missing eventId');
                    }
                    if (!options.dsn) {
                      throw new RavenConfigError('Missing DSN');
                    }
                    var encode = encodeURIComponent,
                      encodedOptions = [];
                    for (var key in options) {
                      if ('user' === key) {
                        var user = options.user;
                        if (user.name) {
                          encodedOptions.push('name=' + encode(user.name));
                        }
                        if (user.email) {
                          encodedOptions.push('email=' + encode(user.email));
                        }
                      } else {
                        encodedOptions.push(encode(key) + '=' + encode(options[key]));
                      }
                    }
                    var globalServer = this._getGlobalServer(this._parseDSN(options.dsn)),
                      script = _document.createElement('script');
                    script.async = true;
                    script.src =
                      globalServer + '/api/embed/error-page/?' + encodedOptions.join('&');
                    (_document.head || _document.body).appendChild(script);
                  }
                },
                _ignoreNextOnError: function () {
                  var self = this;
                  this._ignoreOnError += 1;
                  setTimeout(function () {
                    self._ignoreOnError -= 1;
                  });
                },
                _triggerEvent: function (eventType, options) {
                  var evt, key;
                  if (this._hasDocument) {
                    for (key in ((options = options || {}),
                    (eventType =
                      'raven' + eventType.substr(0, 1).toUpperCase() + eventType.substr(1)),
                    _document.createEvent
                      ? (evt = _document.createEvent('HTMLEvents')).initEvent(eventType, true, true)
                      : ((evt = _document.createEventObject()).eventType = eventType),
                    options)) {
                      if (hasKey(options, key)) {
                        evt[key] = options[key];
                      }
                    }
                    if (_document.createEvent) {
                      _document.dispatchEvent(evt);
                    } else {
                      try {
                        _document.fireEvent('on' + evt.eventType.toLowerCase(), evt);
                      } catch (dispatchError) {}
                    }
                  }
                },
                _breadcrumbEventHandler: function (evtName) {
                  var self = this;
                  return function (evt) {
                    self._keypressTimeout = null;
                    if (self._lastCapturedEvent !== evt) {
                      var target;
                      self._lastCapturedEvent = evt;
                      try {
                        target = htmlTreeAsString(evt.target);
                      } catch (targetAccessError) {
                        target = '<unknown>';
                      }
                      self.captureBreadcrumb({ category: 'ui.' + evtName, message: target });
                    }
                  };
                },
                _keypressEventHandler: function () {
                  var self = this;
                  return function (evt) {
                    var target;
                    try {
                      target = evt.target;
                    } catch (targetAccessError) {
                      return;
                    }
                    var tagName = target && target.tagName;
                    if (
                      tagName &&
                      ('INPUT' === tagName || 'TEXTAREA' === tagName || target.isContentEditable)
                    ) {
                      var timeout = self._keypressTimeout;
                      if (!timeout) {
                        self._breadcrumbEventHandler('input')(evt);
                      }
                      clearTimeout(timeout);
                      self._keypressTimeout = setTimeout(function () {
                        self._keypressTimeout = null;
                      }, 1e3);
                    }
                  };
                },
                _captureUrlChange: function (from, destinationUrl) {
                  var parsedLoc = parseUrl(this._location.href),
                    parsedTo = parseUrl(destinationUrl),
                    parsedFrom = parseUrl(from);
                  this._lastHref = destinationUrl;
                  if (
                    parsedLoc.protocol === parsedTo.protocol &&
                    parsedLoc.host === parsedTo.host
                  ) {
                    destinationUrl = parsedTo.relative;
                  }
                  if (
                    parsedLoc.protocol === parsedFrom.protocol &&
                    parsedLoc.host === parsedFrom.host
                  ) {
                    from = parsedFrom.relative;
                  }
                  this.captureBreadcrumb({
                    category: 'navigation',
                    data: { to: destinationUrl, from: from },
                  });
                },
                _patchFunctionToString: function () {
                  var self = this;
                  self._originalFunctionToString = Function.prototype.toString;
                  Function.prototype.toString = function () {
                    if ('function' == typeof this && this.__raven__) {
                      return self._originalFunctionToString.apply(this.__orig__, arguments);
                    } else {
                      return self._originalFunctionToString.apply(this, arguments);
                    }
                  };
                },
                _unpatchFunctionToString: function () {
                  if (this._originalFunctionToString) {
                    Function.prototype.toString = this._originalFunctionToString;
                  }
                },
                _instrumentTryCatch: function () {
                  var self = this,
                    wrappedBuiltIns = self._wrappedBuiltIns;
                  function wrapTimeFn(orig) {
                    return function (callback, delay) {
                      for (
                        var args = new Array(arguments.length), argumentIndex = 0;
                        argumentIndex < args.length;
                        ++argumentIndex
                      ) {
                        args[argumentIndex] = arguments[argumentIndex];
                      }
                      var originalCallback = args[0];
                      if (isFunction(originalCallback)) {
                        args[0] = self.wrap(
                          {
                            mechanism: {
                              type: 'instrument',
                              data: { function: orig.name || '<anonymous>' },
                            },
                          },
                          originalCallback,
                        );
                      }
                      if (orig.apply) {
                        return orig.apply(this, args);
                      } else {
                        return orig(args[0], args[1]);
                      }
                    };
                  }
                  var autoBreadcrumbs = this._globalOptions.autoBreadcrumbs;
                  function wrapEventTarget(global) {
                    var proto = _window[global] && _window[global].prototype;
                    if (proto && proto.hasOwnProperty && proto.hasOwnProperty('addEventListener')) {
                      fill(
                        proto,
                        'addEventListener',
                        function (orig) {
                          return function (evtName, callback, capture, secure) {
                            try {
                              if (callback && callback.handleEvent) {
                                callback.handleEvent = self.wrap(
                                  {
                                    mechanism: {
                                      type: 'instrument',
                                      data: {
                                        target: global,
                                        function: 'handleEvent',
                                        handler: (callback && callback.name) || '<anonymous>',
                                      },
                                    },
                                  },
                                  callback.handleEvent,
                                );
                              }
                            } catch (error) {}
                            var before, clickHandler, keypressHandler;
                            if (
                              autoBreadcrumbs &&
                              autoBreadcrumbs.dom &&
                              ('EventTarget' === global || 'Node' === global)
                            ) {
                              clickHandler = self._breadcrumbEventHandler('click');
                              keypressHandler = self._keypressEventHandler();
                              before = function (evt) {
                                if (evt) {
                                  var eventType;
                                  try {
                                    eventType = evt.type;
                                  } catch (event) {
                                    return;
                                  }
                                  if ('click' === eventType) {
                                    return clickHandler(evt);
                                  } else {
                                    if ('keypress' === eventType) {
                                      return keypressHandler(evt);
                                    } else {
                                      return void 0;
                                    }
                                  }
                                }
                              };
                            }
                            return orig.call(
                              this,
                              evtName,
                              self.wrap(
                                {
                                  mechanism: {
                                    type: 'instrument',
                                    data: {
                                      target: global,
                                      function: 'addEventListener',
                                      handler: (callback && callback.name) || '<anonymous>',
                                    },
                                  },
                                },
                                callback,
                                before,
                              ),
                              capture,
                              secure,
                            );
                          };
                        },
                        wrappedBuiltIns,
                      );
                      fill(
                        proto,
                        'removeEventListener',
                        function (orig) {
                          return function (evt, callback, capture, secure) {
                            try {
                              callback =
                                callback &&
                                (callback.__raven_wrapper__
                                  ? callback.__raven_wrapper__
                                  : callback);
                            } catch (listenerAccessError) {}
                            return orig.call(this, evt, callback, capture, secure);
                          };
                        },
                        wrappedBuiltIns,
                      );
                    }
                  }
                  fill(_window, 'setTimeout', wrapTimeFn, wrappedBuiltIns);
                  fill(_window, 'setInterval', wrapTimeFn, wrappedBuiltIns);
                  if (_window.requestAnimationFrame) {
                    fill(
                      _window,
                      'requestAnimationFrame',
                      function (orig) {
                        return function (animationCallback) {
                          return orig(
                            self.wrap(
                              {
                                mechanism: {
                                  type: 'instrument',
                                  data: {
                                    function: 'requestAnimationFrame',
                                    handler: (orig && orig.name) || '<anonymous>',
                                  },
                                },
                              },
                              animationCallback,
                            ),
                          );
                        };
                      },
                      wrappedBuiltIns,
                    );
                  }
                  for (
                    var eventTargets = [
                        'EventTarget',
                        'Window',
                        'Node',
                        'ApplicationCache',
                        'AudioTrackList',
                        'ChannelMergerNode',
                        'CryptoOperation',
                        'EventSource',
                        'FileReader',
                        'HTMLUnknownElement',
                        'IDBDatabase',
                        'IDBRequest',
                        'IDBTransaction',
                        'KeyOperation',
                        'MediaController',
                        'MessagePort',
                        'ModalWindow',
                        'Notification',
                        'SVGElementInstance',
                        'Screen',
                        'TextTrack',
                        'TextTrackCue',
                        'TextTrackList',
                        'WebSocket',
                        'WebSocketWorker',
                        'Worker',
                        'XMLHttpRequest',
                        'XMLHttpRequestEventTarget',
                        'XMLHttpRequestUpload',
                      ],
                      targetIndex = 0;
                    targetIndex < eventTargets.length;
                    targetIndex++
                  ) {
                    wrapEventTarget(eventTargets[targetIndex]);
                  }
                },
                _instrumentBreadcrumbs: function () {
                  var self = this,
                    autoBreadcrumbs = this._globalOptions.autoBreadcrumbs,
                    wrappedBuiltIns = self._wrappedBuiltIns;
                  function wrapProp(prop, xhr) {
                    if (prop in xhr && isFunction(xhr[prop])) {
                      fill(xhr, prop, function (orig) {
                        return self.wrap(
                          {
                            mechanism: {
                              type: 'instrument',
                              data: {
                                function: prop,
                                handler: (orig && orig.name) || '<anonymous>',
                              },
                            },
                          },
                          orig,
                        );
                      });
                    }
                  }
                  if (autoBreadcrumbs.xhr && 'XMLHttpRequest' in _window) {
                    var xhrproto = _window.XMLHttpRequest && _window.XMLHttpRequest.prototype;
                    fill(
                      xhrproto,
                      'open',
                      function (origOpen) {
                        return function (method, url) {
                          if (isString(url) && -1 === url.indexOf(self._globalKey)) {
                            this.__raven_xhr = { method: method, url: url, status_code: null };
                          }
                          return origOpen.apply(this, arguments);
                        };
                      },
                      wrappedBuiltIns,
                    );
                    fill(
                      xhrproto,
                      'send',
                      function (origSend) {
                        return function () {
                          var xhr = this;
                          function onreadystatechangeHandler() {
                            if (xhr.__raven_xhr && 4 === xhr.readyState) {
                              try {
                                xhr.__raven_xhr.status_code = xhr.status;
                              } catch (statusAccessError) {}
                              self.captureBreadcrumb({
                                type: 'http',
                                category: 'xhr',
                                data: xhr.__raven_xhr,
                              });
                            }
                          }
                          for (
                            var props = ['onload', 'onerror', 'onprogress'], eventNameIndex = 0;
                            eventNameIndex < props.length;
                            eventNameIndex++
                          ) {
                            wrapProp(props[eventNameIndex], xhr);
                          }
                          if ('onreadystatechange' in xhr && isFunction(xhr.onreadystatechange)) {
                            fill(xhr, 'onreadystatechange', function (orig) {
                              return self.wrap(
                                {
                                  mechanism: {
                                    type: 'instrument',
                                    data: {
                                      function: 'onreadystatechange',
                                      handler: (orig && orig.name) || '<anonymous>',
                                    },
                                  },
                                },
                                orig,
                                onreadystatechangeHandler,
                              );
                            });
                          } else {
                            xhr.onreadystatechange = onreadystatechangeHandler;
                          }
                          return origSend.apply(this, arguments);
                        };
                      },
                      wrappedBuiltIns,
                    );
                  }
                  if (autoBreadcrumbs.xhr && supportsFetch()) {
                    fill(
                      _window,
                      'fetch',
                      function (origFetch) {
                        return function () {
                          for (
                            var args = new Array(arguments.length), argumentIndex = 0;
                            argumentIndex < args.length;
                            ++argumentIndex
                          ) {
                            args[argumentIndex] = arguments[argumentIndex];
                          }
                          var url,
                            fetchInput = args[0],
                            method = 'GET';
                          if ('string' == typeof fetchInput) {
                            url = fetchInput;
                          } else {
                            if ('Request' in _window && fetchInput instanceof _window.Request) {
                              url = fetchInput.url;
                              if (fetchInput.method) {
                                method = fetchInput.method;
                              }
                            } else {
                              url = '' + fetchInput;
                            }
                          }
                          if (-1 !== url.indexOf(self._globalKey)) {
                            return origFetch.apply(this, args);
                          }
                          if (args[1] && args[1].method) {
                            method = args[1].method;
                          }
                          var fetchData = { method: method, url: url, status_code: null };
                          return origFetch
                            .apply(this, args)
                            .then(function (response) {
                              fetchData.status_code = response.status;
                              self.captureBreadcrumb({
                                type: 'http',
                                category: 'fetch',
                                data: fetchData,
                              });
                              return response;
                            })
                            .catch(function (error) {
                              self.captureBreadcrumb({
                                type: 'http',
                                category: 'fetch',
                                data: fetchData,
                                level: 'error',
                              });
                              throw error;
                            });
                        };
                      },
                      wrappedBuiltIns,
                    );
                  }
                  if (autoBreadcrumbs.dom && this._hasDocument) {
                    if (_document.addEventListener) {
                      _document.addEventListener(
                        'click',
                        self._breadcrumbEventHandler('click'),
                        false,
                      );
                      _document.addEventListener('keypress', self._keypressEventHandler(), false);
                    } else {
                      if (_document.attachEvent) {
                        _document.attachEvent('onclick', self._breadcrumbEventHandler('click'));
                        _document.attachEvent('onkeypress', self._keypressEventHandler());
                      }
                    }
                  }
                  var chrome = _window.chrome,
                    historySupported =
                      !(chrome && chrome.app && chrome.app.runtime) &&
                      _window.history &&
                      _window.history.pushState &&
                      _window.history.replaceState;
                  if (autoBreadcrumbs.location && historySupported) {
                    var oldOnPopState = _window.onpopstate;
                    _window.onpopstate = function () {
                      var currentHref = self._location.href;
                      self._captureUrlChange(self._lastHref, currentHref);
                      if (oldOnPopState) {
                        return oldOnPopState.apply(this, arguments);
                      }
                    };
                    var historyReplacementFunction = function (origHistFunction) {
                      return function () {
                        var url = arguments.length > 2 ? arguments[2] : void 0;
                        if (url) {
                          self._captureUrlChange(self._lastHref, url + '');
                        }
                        return origHistFunction.apply(this, arguments);
                      };
                    };
                    fill(_window.history, 'pushState', historyReplacementFunction, wrappedBuiltIns);
                    fill(
                      _window.history,
                      'replaceState',
                      historyReplacementFunction,
                      wrappedBuiltIns,
                    );
                  }
                  if (autoBreadcrumbs.console && 'console' in _window && console.log) {
                    var consoleMethodCallback = function (msg, data) {
                      self.captureBreadcrumb({
                        message: msg,
                        level: data.level,
                        category: 'console',
                      });
                    };
                    each(['debug', 'info', 'warn', 'error', 'log'], function (methodIndex, level) {
                      wrapConsoleMethod(console, level, consoleMethodCallback);
                    });
                  }
                },
                _restoreBuiltIns: function () {
                  for (var builtin; this._wrappedBuiltIns.length; ) {
                    var originalTarget = (builtin = this._wrappedBuiltIns.shift())[0],
                      name = builtin[1],
                      orig = builtin[2];
                    originalTarget[name] = orig;
                  }
                },
                _restoreConsole: function () {
                  for (var method in this._originalConsoleMethods) {
                    this._originalConsole[method] = this._originalConsoleMethods[method];
                  }
                },
                _drainPlugins: function () {
                  var self = this;
                  each(this._plugins, function (pluginIndex, plugin) {
                    var pluginCallback = plugin[0],
                      args = plugin[1];
                    pluginCallback.apply(self, [self].concat(args));
                  });
                },
                _parseDSN: function (str) {
                  var dsnMatch = dsnPattern.exec(str),
                    dsn = {},
                    componentIndex = 7;
                  try {
                    for (; componentIndex--; ) {
                      dsn[dsnKeys[componentIndex]] = dsnMatch[componentIndex] || '';
                    }
                  } catch (dsnError) {
                    throw new RavenConfigError('Invalid DSN: ' + str);
                  }
                  if (dsn.pass && !this._globalOptions.allowSecretKey) {
                    throw new RavenConfigError(
                      'Do not specify your secret key in the DSN. See: http://bit.ly/raven-secret-key',
                    );
                  }
                  return dsn;
                },
                _getGlobalServer: function (uri) {
                  var globalServer = '//' + uri.host + (uri.port ? ':' + uri.port : '');
                  if (uri.protocol) {
                    globalServer = uri.protocol + ':' + globalServer;
                  }
                  return globalServer;
                },
                _handleOnErrorStackInfo: function (stackInfo, options) {
                  (options = options || {}).mechanism = options.mechanism || {
                    type: 'onerror',
                    handled: false,
                  };
                  if (!this._ignoreOnError) {
                    this._handleStackInfo(stackInfo, options);
                  }
                },
                _handleStackInfo: function (stackInfo, options) {
                  var frames = this._prepareFrames(stackInfo, options);
                  this._triggerEvent('handle', { stackInfo: stackInfo, options: options });
                  this._processException(
                    stackInfo.name,
                    stackInfo.message,
                    stackInfo.url,
                    stackInfo.lineno,
                    frames,
                    options,
                  );
                },
                _prepareFrames: function (stackInfo, options) {
                  var self = this,
                    frames = [];
                  if (
                    stackInfo.stack &&
                    stackInfo.stack.length &&
                    (each(stackInfo.stack, function (frameIndex, stack) {
                      var frame = self._normalizeFrame(stack, stackInfo.url);
                      if (frame) {
                        frames.push(frame);
                      }
                    }),
                    options && options.trimHeadFrames)
                  ) {
                    for (
                      var frameIndex = 0;
                      frameIndex < options.trimHeadFrames && frameIndex < frames.length;
                      frameIndex++
                    ) {
                      frames[frameIndex].in_app = false;
                    }
                  }
                  return (frames = frames.slice(0, this._globalOptions.stackTraceLimit));
                },
                _normalizeFrame: function (frame, stackInfoUrl) {
                  var normalized = {
                    filename: frame.url,
                    lineno: frame.line,
                    colno: frame.column,
                    function: frame.func || '?',
                  };
                  if (!frame.url) {
                    normalized.filename = stackInfoUrl;
                  }
                  normalized.in_app = !(
                    (this._globalOptions.includePaths.test &&
                      !this._globalOptions.includePaths.test(normalized.filename)) ||
                    /(Raven|TraceKit)\./.test(normalized.function) ||
                    /raven\.(min\.)?js$/.test(normalized.filename)
                  );
                  return normalized;
                },
                _processException: function (type, message, fileurl, lineno, frames, options) {
                  var stacktrace,
                    prefixedMessage = (type ? type + ': ' : '') + (message || '');
                  if (
                    (!this._globalOptions.ignoreErrors.test ||
                      (!this._globalOptions.ignoreErrors.test(message) &&
                        !this._globalOptions.ignoreErrors.test(prefixedMessage))) &&
                    (frames && frames.length
                      ? ((fileurl = frames[0].filename || fileurl),
                        frames.reverse(),
                        (stacktrace = { frames: frames }))
                      : fileurl &&
                        (stacktrace = {
                          frames: [{ filename: fileurl, lineno: lineno, in_app: true }],
                        }),
                    (!this._globalOptions.ignoreUrls.test ||
                      !this._globalOptions.ignoreUrls.test(fileurl)) &&
                      (!this._globalOptions.whitelistUrls.test ||
                        this._globalOptions.whitelistUrls.test(fileurl)))
                  ) {
                    var data = objectMerge(
                        {
                          exception: {
                            values: [{ type: type, value: message, stacktrace: stacktrace }],
                          },
                          transaction: fileurl,
                        },
                        options,
                      ),
                      exceptionValue = data.exception.values[0];
                    if (null == exceptionValue.type && '' === exceptionValue.value) {
                      exceptionValue.value = 'Unrecoverable error caught';
                    }
                    if (!data.exception.mechanism && data.mechanism) {
                      data.exception.mechanism = data.mechanism;
                      delete data.mechanism;
                    }
                    data.exception.mechanism = objectMerge(
                      { type: 'generic', handled: true },
                      data.exception.mechanism || {},
                    );
                    this._send(data);
                  }
                },
                _trimPacket: function (data) {
                  var max = this._globalOptions.maxMessageLength;
                  if (data.message) {
                    data.message = truncate(data.message, max);
                  }
                  if (data.exception) {
                    var exception = data.exception.values[0];
                    exception.value = truncate(exception.value, max);
                  }
                  var request = data.request;
                  if (request) {
                    if (request.url) {
                      request.url = truncate(request.url, this._globalOptions.maxUrlLength);
                    }
                    if (request.Referer) {
                      request.Referer = truncate(request.Referer, this._globalOptions.maxUrlLength);
                    }
                  }
                  if (data.breadcrumbs && data.breadcrumbs.values) {
                    this._trimBreadcrumbs(data.breadcrumbs);
                  }
                  return data;
                },
                _trimBreadcrumbs: function (breadcrumbs) {
                  for (
                    var urlProp, crumb, data, urlProps = ['to', 'from', 'url'], breadcrumbIndex = 0;
                    breadcrumbIndex < breadcrumbs.values.length;
                    ++breadcrumbIndex
                  ) {
                    if (
                      (crumb = breadcrumbs.values[breadcrumbIndex]).hasOwnProperty('data') &&
                      isObject(crumb.data) &&
                      !objectFrozen(crumb.data)
                    ) {
                      data = objectMerge({}, crumb.data);
                      for (
                        var nextBreadcrumbIndex = 0;
                        nextBreadcrumbIndex < urlProps.length;
                        ++nextBreadcrumbIndex
                      ) {
                        urlProp = urlProps[nextBreadcrumbIndex];
                        if (data.hasOwnProperty(urlProp) && data[urlProp]) {
                          data[urlProp] = truncate(data[urlProp], this._globalOptions.maxUrlLength);
                        }
                      }
                      breadcrumbs.values[breadcrumbIndex].data = data;
                    }
                  }
                },
                _getHttpData: function () {
                  if (this._hasNavigator || this._hasDocument) {
                    var httpData = {};
                    if (this._hasNavigator && _navigator.userAgent) {
                      httpData.headers = { 'User-Agent': _navigator.userAgent };
                    }
                    if (_window.location && _window.location.href) {
                      httpData.url = _window.location.href;
                    }
                    if (this._hasDocument && _document.referrer) {
                      if (!httpData.headers) {
                        httpData.headers = {};
                      }
                      httpData.headers.Referer = _document.referrer;
                    }
                    return httpData;
                  }
                },
                _resetBackoff: function () {
                  this._backoffDuration = 0;
                  this._backoffStart = null;
                },
                _shouldBackoff: function () {
                  return (
                    this._backoffDuration && now() - this._backoffStart < this._backoffDuration
                  );
                },
                _isRepeatData: function (current) {
                  var last = this._lastData;
                  return (
                    !(
                      !last ||
                      current.message !== last.message ||
                      current.transaction !== last.transaction
                    ) &&
                    (current.stacktrace || last.stacktrace
                      ? isSameStacktrace(current.stacktrace, last.stacktrace)
                      : (!current.exception && !last.exception) ||
                        isSameException(current.exception, last.exception))
                  );
                },
                _setBackoffState: function (request) {
                  if (!this._shouldBackoff()) {
                    var status = request.status;
                    if (400 === status || 401 === status || 429 === status) {
                      var retry;
                      try {
                        retry = supportsFetch()
                          ? request.headers.get('Retry-After')
                          : request.getResponseHeader('Retry-After');
                        retry = 1e3 * parseInt(retry, 10);
                      } catch (response) {}
                      this._backoffDuration = retry || 2 * this._backoffDuration || 1e3;
                      this._backoffStart = now();
                    }
                  }
                },
                _send: function (data) {
                  var globalOptions = this._globalOptions,
                    baseData = {
                      project: this._globalProject,
                      logger: globalOptions.logger,
                      platform: 'javascript',
                    },
                    httpData = this._getHttpData();
                  if (httpData) {
                    baseData.request = httpData;
                  }
                  if (data.trimHeadFrames) {
                    delete data.trimHeadFrames;
                  }
                  (data = objectMerge(baseData, data)).tags = objectMerge(
                    objectMerge({}, this._globalContext.tags),
                    data.tags,
                  );
                  data.extra = objectMerge(objectMerge({}, this._globalContext.extra), data.extra);
                  data.extra['session:duration'] = now() - this._startTime;
                  if (this._breadcrumbs && this._breadcrumbs.length > 0) {
                    data.breadcrumbs = { values: [].slice.call(this._breadcrumbs, 0) };
                  }
                  if (this._globalContext.user) {
                    data.user = this._globalContext.user;
                  }
                  if (globalOptions.environment) {
                    data.environment = globalOptions.environment;
                  }
                  if (globalOptions.release) {
                    data.release = globalOptions.release;
                  }
                  if (globalOptions.serverName) {
                    data.server_name = globalOptions.serverName;
                  }
                  data = this._sanitizeData(data);
                  Object.keys(data).forEach(function (key) {
                    if (null == data[key] || '' === data[key] || isEmptyObject(data[key])) {
                      delete data[key];
                    }
                  });
                  if (isFunction(globalOptions.dataCallback)) {
                    data = globalOptions.dataCallback(data) || data;
                  }
                  if (data && !isEmptyObject(data)) {
                    if (
                      !(
                        isFunction(globalOptions.shouldSendCallback) &&
                        !globalOptions.shouldSendCallback(data)
                      )
                    ) {
                      if (this._shouldBackoff()) {
                        this._logDebug('warn', 'Raven dropped error due to backoff: ', data);
                      } else {
                        if ('number' == typeof globalOptions.sampleRate) {
                          if (Math.random() < globalOptions.sampleRate) {
                            this._sendProcessedPayload(data);
                          }
                        } else {
                          this._sendProcessedPayload(data);
                        }
                      }
                    }
                  }
                },
                _sanitizeData: function (data) {
                  return sanitize(data, this._globalOptions.sanitizeKeys);
                },
                _getUuid: function () {
                  return uuid4();
                },
                _sendProcessedPayload: function (data, callback) {
                  var self = this,
                    globalOptions = this._globalOptions;
                  if (this.isSetup()) {
                    data = this._trimPacket(data);
                    if (this._globalOptions.allowDuplicates || !this._isRepeatData(data)) {
                      this._lastEventId = data.event_id || (data.event_id = this._getUuid());
                      this._lastData = data;
                      this._logDebug('debug', 'Raven about to send:', data);
                      var auth = {
                        sentry_version: '7',
                        sentry_client: 'raven-js/' + this.VERSION,
                        sentry_key: this._globalKey,
                      };
                      if (this._globalSecret) {
                        auth.sentry_secret = this._globalSecret;
                      }
                      var exception = data.exception && data.exception.values[0];
                      if (
                        this._globalOptions.autoBreadcrumbs &&
                        this._globalOptions.autoBreadcrumbs.sentry
                      ) {
                        this.captureBreadcrumb({
                          category: 'sentry',
                          message: exception
                            ? (exception.type ? exception.type + ': ' : '') + exception.value
                            : data.message,
                          event_id: data.event_id,
                          level: data.level || 'error',
                        });
                      }
                      var url = this._globalEndpoint;
                      (globalOptions.transport || this._makeRequest).call(this, {
                        url: url,
                        auth: auth,
                        data: data,
                        options: globalOptions,
                        onSuccess: function () {
                          self._resetBackoff();
                          self._triggerEvent('success', { data: data, src: url });
                          if (callback) {
                            callback();
                          }
                        },
                        onError: function (error) {
                          self._logDebug('error', 'Raven transport failed to send: ', error);
                          if (error.request) {
                            self._setBackoffState(error.request);
                          }
                          self._triggerEvent('failure', { data: data, src: url });
                          error =
                            error ||
                            new Error('Raven send failed (no additional details provided)');
                          if (callback) {
                            callback(error);
                          }
                        },
                      });
                    } else {
                      this._logDebug('warn', 'Raven dropped repeat event: ', data);
                    }
                  }
                },
                _makeRequest: function (opts) {
                  var url = opts.url + '?' + urlencode(opts.auth),
                    evaluatedHeaders = null,
                    evaluatedFetchParameters = {};
                  if (opts.options.headers) {
                    evaluatedHeaders = this._evaluateHash(opts.options.headers);
                  }
                  if (opts.options.fetchParameters) {
                    evaluatedFetchParameters = this._evaluateHash(opts.options.fetchParameters);
                  }
                  if (supportsFetch()) {
                    evaluatedFetchParameters.body = stringify(opts.data);
                    var defaultFetchOptions = objectMerge({}, this._fetchDefaults),
                      fetchOptions = objectMerge(defaultFetchOptions, evaluatedFetchParameters);
                    if (evaluatedHeaders) {
                      fetchOptions.headers = evaluatedHeaders;
                    }
                    return _window
                      .fetch(url, fetchOptions)
                      .then(function (response) {
                        if (response.ok) {
                          if (opts.onSuccess) {
                            opts.onSuccess();
                          }
                        } else {
                          var error = new Error('Sentry error code: ' + response.status);
                          error.request = response;
                          if (opts.onError) {
                            opts.onError(error);
                          }
                        }
                      })
                      .catch(function () {
                        if (opts.onError) {
                          opts.onError(new Error('Sentry error code: network unavailable'));
                        }
                      });
                  }
                  var request = _window.XMLHttpRequest && new _window.XMLHttpRequest();
                  if (
                    request &&
                    ('withCredentials' in request || 'undefined' != typeof XDomainRequest)
                  ) {
                    if ('withCredentials' in request) {
                      request.onreadystatechange = function () {
                        if (4 === request.readyState) {
                          if (200 === request.status) {
                            if (opts.onSuccess) {
                              opts.onSuccess();
                            }
                          } else {
                            if (opts.onError) {
                              var error = new Error('Sentry error code: ' + request.status);
                              error.request = request;
                              opts.onError(error);
                            }
                          }
                        }
                      };
                    } else {
                      request = new XDomainRequest();
                      url = url.replace(/^https?:/, '');
                      if (opts.onSuccess) {
                        request.onload = opts.onSuccess;
                      }
                      if (opts.onError) {
                        request.onerror = function () {
                          var error = new Error('Sentry error code: XDomainRequest');
                          error.request = request;
                          opts.onError(error);
                        };
                      }
                    }
                    request.open('POST', url);
                    if (evaluatedHeaders) {
                      each(evaluatedHeaders, function (key, value) {
                        request.setRequestHeader(key, value);
                      });
                    }
                    request.send(stringify(opts.data));
                  }
                },
                _evaluateHash: function (hash) {
                  var sortedPayload = {};
                  for (var key in hash) {
                    if (hash.hasOwnProperty(key)) {
                      var value = hash[key];
                      sortedPayload[key] = 'function' == typeof value ? value() : value;
                    }
                  }
                  return sortedPayload;
                },
                _logDebug: function (level) {
                  if (
                    this._originalConsoleMethods[level] &&
                    (this.debug || this._globalOptions.debug)
                  ) {
                    Function.prototype.apply.call(
                      this._originalConsoleMethods[level],
                      this._originalConsole,
                      [].slice.call(arguments, 1),
                    );
                  }
                },
                _mergeContext: function (key, context) {
                  if (isUndefined(context)) {
                    delete this._globalContext[key];
                  } else {
                    this._globalContext[key] = objectMerge(this._globalContext[key] || {}, context);
                  }
                },
              };
              Raven.prototype.setUser = Raven.prototype.setUserContext;
              Raven.prototype.setReleaseContext = Raven.prototype.setRelease;
              moduleRecord.exports = Raven;
            }).call(
              this,
              'undefined' != typeof global
                ? global
                : 'undefined' != typeof self
                  ? self
                  : 'undefined' != typeof window
                    ? window
                    : {},
            );
          },
          { 1: 1, 2: 2, 5: 5, 6: 6, 7: 7, 8: 8 },
        ],
        4: [
          function (_dereq_, moduleRecord, moduleExports) {
            (function (global) {
              var RavenConstructor = _dereq_(3),
                _window =
                  'undefined' != typeof window
                    ? window
                    : void 0 !== global
                      ? global
                      : 'undefined' != typeof self
                        ? self
                        : {},
                _Raven = _window.Raven,
                Raven = new RavenConstructor();
              Raven.noConflict = function () {
                _window.Raven = _Raven;
                return Raven;
              };
              Raven.afterLoad();
              moduleRecord.exports = Raven;
              moduleRecord.exports.Client = RavenConstructor;
            }).call(
              this,
              'undefined' != typeof global
                ? global
                : 'undefined' != typeof self
                  ? self
                  : 'undefined' != typeof window
                    ? window
                    : {},
            );
          },
          { 3: 3 },
        ],
        5: [
          function (_dereq_, moduleRecord, moduleExports) {
            (function (global) {
              var stringify = _dereq_(7),
                _window =
                  'undefined' != typeof window
                    ? window
                    : void 0 !== global
                      ? global
                      : 'undefined' != typeof self
                        ? self
                        : {};
              function isUndefined(what) {
                return void 0 === what;
              }
              function isPlainObject(what) {
                return '[object Object]' === Object.prototype.toString.call(what);
              }
              function isString(what) {
                return '[object String]' === Object.prototype.toString.call(what);
              }
              function isArray(what) {
                return '[object Array]' === Object.prototype.toString.call(what);
              }
              function supportsFetch() {
                if (!('fetch' in _window)) {
                  return false;
                }
                try {
                  new Headers();
                  new Request('');
                  new Response();
                  return true;
                } catch (fetchProbeError) {
                  return false;
                }
              }
              function each(object, callback) {
                var keyOrIndex, itemCount;
                if (isUndefined(object.length)) {
                  for (keyOrIndex in object) {
                    if (hasKey(object, keyOrIndex)) {
                      callback.call(null, keyOrIndex, object[keyOrIndex]);
                    }
                  }
                } else {
                  if ((itemCount = object.length)) {
                    for (keyOrIndex = 0; keyOrIndex < itemCount; keyOrIndex++) {
                      callback.call(null, keyOrIndex, object[keyOrIndex]);
                    }
                  }
                }
              }
              function truncate(str, max) {
                if ('number' != typeof max) {
                  throw new Error('2nd argument to `truncate` function should be a number');
                }
                if ('string' != typeof str || 0 === max) {
                  return str;
                } else {
                  if (str.length <= max) {
                    return str;
                  } else {
                    return str.substr(0, max) + '…';
                  }
                }
              }
              function hasKey(object, key) {
                return Object.prototype.hasOwnProperty.call(object, key);
              }
              function joinRegExp(patterns) {
                for (
                  var pattern, sources = [], patternIndex = 0, len = patterns.length;
                  patternIndex < len;
                  patternIndex++
                ) {
                  if (isString((pattern = patterns[patternIndex]))) {
                    sources.push(pattern.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'));
                  } else {
                    if (pattern && pattern.source) {
                      sources.push(pattern.source);
                    }
                  }
                }
                return new RegExp(sources.join('|'), 'i');
              }
              function htmlElementAsString(elem) {
                var className,
                  classes,
                  key,
                  attr,
                  attributeIndex,
                  out = [];
                if (!elem || !elem.tagName) {
                  return '';
                }
                out.push(elem.tagName.toLowerCase());
                if (elem.id) {
                  out.push('#' + elem.id);
                }
                if ((className = elem.className) && isString(className)) {
                  for (
                    classes = className.split(/\s+/), attributeIndex = 0;
                    attributeIndex < classes.length;
                    attributeIndex++
                  ) {
                    out.push('.' + classes[attributeIndex]);
                  }
                }
                var attrWhitelist = ['type', 'name', 'title', 'alt'];
                for (attributeIndex = 0; attributeIndex < attrWhitelist.length; attributeIndex++) {
                  key = attrWhitelist[attributeIndex];
                  if ((attr = elem.getAttribute(key))) {
                    out.push('[' + key + '="' + attr + '"]');
                  }
                }
                return out.join('');
              }
              function isOnlyOneTruthy(leftValue, rightValue) {
                return !!(!!leftValue ^ !!rightValue);
              }
              function isSameStacktrace(stack1, stack2) {
                if (isOnlyOneTruthy(stack1, stack2)) {
                  return false;
                }
                var firstFrame,
                  secondFrame,
                  frames1 = stack1.frames,
                  frames2 = stack2.frames;
                if (void 0 === frames1 || void 0 === frames2) {
                  return false;
                }
                if (frames1.length !== frames2.length) {
                  return false;
                }
                for (var frameIndex = 0; frameIndex < frames1.length; frameIndex++) {
                  firstFrame = frames1[frameIndex];
                  secondFrame = frames2[frameIndex];
                  if (
                    firstFrame.filename !== secondFrame.filename ||
                    firstFrame.lineno !== secondFrame.lineno ||
                    firstFrame.colno !== secondFrame.colno ||
                    firstFrame.function !== secondFrame.function
                  ) {
                    return false;
                  }
                }
                return true;
              }
              var defaultSerializationDepth = 3,
                MAX_SERIALIZE_EXCEPTION_SIZE = 51200,
                MAX_SERIALIZE_KEYS_LENGTH = 40;
              function serializedByteLength(value) {
                return (function (value) {
                  return ~-encodeURI(value).split(/%..|./).length;
                })(JSON.stringify(value));
              }
              function serializeValue(value) {
                if ('string' == typeof value) {
                  return truncate(value, 40);
                }
                if ('number' == typeof value || 'boolean' == typeof value || void 0 === value) {
                  return value;
                }
                var type = Object.prototype.toString.call(value);
                if ('[object Object]' === type) {
                  return '[Object]';
                } else {
                  if ('[object Array]' === type) {
                    return '[Array]';
                  } else {
                    if ('[object Function]' === type) {
                      if (value.name) {
                        return '[Function: ' + value.name + ']';
                      } else {
                        return '[Function]';
                      }
                    } else {
                      return value;
                    }
                  }
                }
              }
              moduleRecord.exports = {
                isObject: function (what) {
                  return 'object' == typeof what && null !== what;
                },
                isError: function (value) {
                  switch (Object.prototype.toString.call(value)) {
                    case '[object Error]':
                    case '[object Exception]':
                    case '[object DOMException]':
                      return true;
                    default:
                      return value instanceof Error;
                  }
                },
                isErrorEvent: function (value) {
                  return '[object ErrorEvent]' === Object.prototype.toString.call(value);
                },
                isDOMError: function (value) {
                  return '[object DOMError]' === Object.prototype.toString.call(value);
                },
                isDOMException: function (value) {
                  return '[object DOMException]' === Object.prototype.toString.call(value);
                },
                isUndefined: isUndefined,
                isFunction: function (what) {
                  return 'function' == typeof what;
                },
                isPlainObject: isPlainObject,
                isString: isString,
                isArray: isArray,
                isEmptyObject: function (what) {
                  if (!isPlainObject(what)) {
                    return false;
                  }
                  for (var propertyName in what) {
                    if (what.hasOwnProperty(propertyName)) {
                      return false;
                    }
                  }
                  return true;
                },
                supportsErrorEvent: function () {
                  try {
                    new ErrorEvent('');
                    return true;
                  } catch (probeError) {
                    return false;
                  }
                },
                supportsDOMError: function () {
                  try {
                    new DOMError('');
                    return true;
                  } catch (probeError) {
                    return false;
                  }
                },
                supportsDOMException: function () {
                  try {
                    new DOMException('');
                    return true;
                  } catch (probeError) {
                    return false;
                  }
                },
                supportsFetch: supportsFetch,
                supportsReferrerPolicy: function () {
                  if (!supportsFetch()) {
                    return false;
                  }
                  try {
                    new Request('pickleRick', { referrerPolicy: 'origin' });
                    return true;
                  } catch (probeError) {
                    return false;
                  }
                },
                supportsPromiseRejectionEvent: function () {
                  return 'function' == typeof PromiseRejectionEvent;
                },
                wrappedCallback: function (callback) {
                  return function (data, original) {
                    var normalizedData = callback(data) || data;
                    return (original && original(normalizedData)) || normalizedData;
                  };
                },
                each: each,
                objectMerge: function (obj1, obj2) {
                  if (obj2) {
                    each(obj2, function (key, value) {
                      obj1[key] = value;
                    });
                    return obj1;
                  } else {
                    return obj1;
                  }
                },
                truncate: truncate,
                objectFrozen: function (object) {
                  return !!Object.isFrozen && Object.isFrozen(object);
                },
                hasKey: hasKey,
                joinRegExp: joinRegExp,
                urlencode: function (key) {
                  var pairs = [];
                  each(key, function (key, value) {
                    pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
                  });
                  return pairs.join('&');
                },
                uuid4: function () {
                  var crypto = _window.crypto || _window.msCrypto;
                  if (!isUndefined(crypto) && crypto.getRandomValues) {
                    var items = new Uint16Array(8);
                    crypto.getRandomValues(items);
                    items[3] = (4095 & items[3]) | 16384;
                    items[4] = (16383 & items[4]) | 32768;
                    var pad = function (num) {
                      for (var hexWord = num.toString(16); hexWord.length < 4; ) {
                        hexWord = '0' + hexWord;
                      }
                      return hexWord;
                    };
                    return (
                      pad(items[0]) +
                      pad(items[1]) +
                      pad(items[2]) +
                      pad(items[3]) +
                      pad(items[4]) +
                      pad(items[5]) +
                      pad(items[6]) +
                      pad(items[7])
                    );
                  }
                  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(
                    /[xy]/g,
                    function (placeholder) {
                      var randomNibble = (16 * Math.random()) | 0;
                      return ('x' === placeholder ? randomNibble : (3 & randomNibble) | 8).toString(
                        16,
                      );
                    },
                  );
                },
                htmlTreeAsString: function (elem) {
                  for (
                    var nextStr, out = [], height = 0, len = 0, separatorLength = ' > '.length;
                    elem &&
                    height++ < 5 &&
                    !(
                      'html' === (nextStr = htmlElementAsString(elem)) ||
                      (height > 1 && len + out.length * separatorLength + nextStr.length >= 80)
                    );
                  ) {
                    out.push(nextStr);
                    len += nextStr.length;
                    elem = elem.parentNode;
                  }
                  return out.reverse().join(' > ');
                },
                htmlElementAsString: htmlElementAsString,
                isSameException: function (ex1, ex2) {
                  return (
                    !isOnlyOneTruthy(ex1, ex2) &&
                    ((ex1 = ex1.values[0]),
                    (ex2 = ex2.values[0]),
                    ex1.type === ex2.type &&
                      ex1.value === ex2.value &&
                      ((firstStacktrace = ex1.stacktrace),
                      (secondStacktrace = ex2.stacktrace),
                      (!isUndefined(firstStacktrace) || !isUndefined(secondStacktrace)) &&
                        isSameStacktrace(ex1.stacktrace, ex2.stacktrace)))
                  );
                  var firstStacktrace, secondStacktrace;
                },
                isSameStacktrace: isSameStacktrace,
                parseUrl: function (url) {
                  if ('string' != typeof url) {
                    return {};
                  }
                  var match = url.match(
                      /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/,
                    ),
                    query = match[6] || '',
                    fragment = match[8] || '';
                  return {
                    protocol: match[2],
                    host: match[4],
                    path: match[5],
                    relative: match[5] + query + fragment,
                  };
                },
                fill: function (object, name, replacement, track) {
                  if (null != object) {
                    var orig = object[name];
                    object[name] = replacement(orig);
                    object[name].__raven__ = true;
                    object[name].__orig__ = orig;
                    if (track) {
                      track.push([object, name, orig]);
                    }
                  }
                },
                safeJoin: function (input, delimiter) {
                  if (!isArray(input)) {
                    return '';
                  }
                  for (var output = [], itemIndex = 0; itemIndex < input.length; itemIndex++) {
                    try {
                      output.push(String(input[itemIndex]));
                    } catch (serializationError) {
                      output.push('[value cannot be serialized]');
                    }
                  }
                  return output.join(delimiter);
                },
                serializeException: function serializeException(exceptionObject, depth, maxSize) {
                  if (!isPlainObject(exceptionObject)) {
                    return exceptionObject;
                  }
                  maxSize =
                    'number' !=
                    typeof (depth = 'number' != typeof depth ? defaultSerializationDepth : depth)
                      ? MAX_SERIALIZE_EXCEPTION_SIZE
                      : maxSize;
                  var serialized = (function serializeObject(value, depth) {
                    if (0 === depth) {
                      return serializeValue(value);
                    } else {
                      if (isPlainObject(value)) {
                        return Object.keys(value).reduce(function (acc, key) {
                          acc[key] = serializeObject(value[key], depth - 1);
                          return acc;
                        }, {});
                      } else {
                        if (Array.isArray(value)) {
                          return value.map(function (val) {
                            return serializeObject(val, depth - 1);
                          });
                        } else {
                          return serializeValue(value);
                        }
                      }
                    }
                  })(exceptionObject, depth);
                  if (serializedByteLength(stringify(serialized)) > maxSize) {
                    return serializeException(exceptionObject, depth - 1);
                  } else {
                    return serialized;
                  }
                },
                serializeKeysForMessage: function (keys, maxLength) {
                  if ('number' == typeof keys || 'string' == typeof keys) {
                    return keys.toString();
                  }
                  if (!Array.isArray(keys)) {
                    return '';
                  }
                  if (
                    0 ===
                    (keys = keys.filter(function (key) {
                      return 'string' == typeof key;
                    })).length
                  ) {
                    return '[object has no keys]';
                  }
                  maxLength = 'number' != typeof maxLength ? MAX_SERIALIZE_KEYS_LENGTH : maxLength;
                  if (keys[0].length >= maxLength) {
                    return keys[0];
                  }
                  for (var usedKeys = keys.length; usedKeys > 0; usedKeys--) {
                    var serialized = keys.slice(0, usedKeys).join(', ');
                    if (!(serialized.length > maxLength)) {
                      if (usedKeys === keys.length) {
                        return serialized;
                      } else {
                        return serialized + '…';
                      }
                    }
                  }
                  return '';
                },
                sanitize: function (input, sanitizeKeys) {
                  if (
                    !isArray(sanitizeKeys) ||
                    (isArray(sanitizeKeys) && 0 === sanitizeKeys.length)
                  ) {
                    return input;
                  }
                  var safeInput,
                    sensitiveKeyPattern = joinRegExp(sanitizeKeys),
                    sanitizeMask = '********';
                  try {
                    safeInput = JSON.parse(stringify(input));
                  } catch (o_O) {
                    return input;
                  }
                  return (function sanitizeWorker(workerInput) {
                    if (isArray(workerInput)) {
                      return workerInput.map(function (val) {
                        return sanitizeWorker(val);
                      });
                    } else {
                      if (isPlainObject(workerInput)) {
                        return Object.keys(workerInput).reduce(function (acc, propertyName) {
                          if (sensitiveKeyPattern.test(propertyName)) {
                            acc[propertyName] = sanitizeMask;
                          } else {
                            acc[propertyName] = sanitizeWorker(workerInput[propertyName]);
                          }
                          return acc;
                        }, {});
                      } else {
                        return workerInput;
                      }
                    }
                  })(safeInput);
                },
              };
            }).call(
              this,
              'undefined' != typeof global
                ? global
                : 'undefined' != typeof self
                  ? self
                  : 'undefined' != typeof window
                    ? window
                    : {},
            );
          },
          { 7: 7 },
        ],
        6: [
          function (_dereq_, moduleRecord, moduleExports) {
            (function (global) {
              var utils = _dereq_(5),
                TraceKit = { collectWindowErrors: true, debug: false },
                _window =
                  'undefined' != typeof window
                    ? window
                    : void 0 !== global
                      ? global
                      : 'undefined' != typeof self
                        ? self
                        : {},
                _slice = [].slice,
                UNKNOWN_FUNCTION = '?',
                ERROR_TYPES_RE =
                  /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/;
              function getLocationHref() {
                if ('undefined' == typeof document || null == document.location) {
                  return '';
                } else {
                  return document.location.href;
                }
              }
              TraceKit.report = (function () {
                var _oldOnerrorHandler,
                  _onErrorHandlerInstalled,
                  handlers = [],
                  lastArgs = null,
                  lastException = null,
                  lastExceptionStack = null;
                function notifyHandlers(stack, isWindowError) {
                  var exception = null;
                  if (!isWindowError || TraceKit.collectWindowErrors) {
                    for (var handlerIndex in handlers) {
                      if (handlers.hasOwnProperty(handlerIndex)) {
                        try {
                          handlers[handlerIndex].apply(
                            null,
                            [stack].concat(_slice.call(arguments, 2)),
                          );
                        } catch (inner) {
                          exception = inner;
                        }
                      }
                    }
                    if (exception) {
                      throw exception;
                    }
                  }
                }
                function traceKitWindowOnError(msg, url, lineNo, colNo, errorEvent) {
                  var exception = utils.isErrorEvent(errorEvent) ? errorEvent.error : errorEvent,
                    message = utils.isErrorEvent(msg) ? msg.message : msg;
                  if (lastExceptionStack) {
                    TraceKit.computeStackTrace.augmentStackTraceWithInitialElement(
                      lastExceptionStack,
                      url,
                      lineNo,
                      message,
                    );
                    processLastException();
                  } else {
                    if (exception && utils.isError(exception)) {
                      notifyHandlers(TraceKit.computeStackTrace(exception), true);
                    } else {
                      var groups,
                        location = { url: url, line: lineNo, column: colNo },
                        name = void 0;
                      if ('[object String]' === {}.toString.call(message)) {
                        if ((groups = message.match(ERROR_TYPES_RE))) {
                          name = groups[1];
                          message = groups[2];
                        }
                      }
                      location.func = UNKNOWN_FUNCTION;
                      notifyHandlers(
                        {
                          name: name,
                          message: message,
                          url: getLocationHref(),
                          stack: [location],
                        },
                        true,
                      );
                    }
                  }
                  return !!_oldOnerrorHandler && _oldOnerrorHandler.apply(this, arguments);
                }
                function processLastException() {
                  var _lastExceptionStack = lastExceptionStack,
                    _lastArgs = lastArgs;
                  lastArgs = null;
                  lastExceptionStack = null;
                  lastException = null;
                  notifyHandlers.apply(null, [_lastExceptionStack, false].concat(_lastArgs));
                }
                function report(exception, rethrow) {
                  var args = _slice.call(arguments, 1);
                  if (lastExceptionStack) {
                    if (lastException === exception) {
                      return;
                    }
                    processLastException();
                  }
                  var stack = TraceKit.computeStackTrace(exception);
                  lastExceptionStack = stack;
                  lastException = exception;
                  lastArgs = args;
                  setTimeout(
                    function () {
                      if (lastException === exception) {
                        processLastException();
                      }
                    },
                    stack.incomplete ? 2e3 : 0,
                  );
                  if (false !== rethrow) {
                    throw exception;
                  }
                }
                report.subscribe = function (handler) {
                  if (!_onErrorHandlerInstalled) {
                    _oldOnerrorHandler = _window.onerror;
                    _window.onerror = traceKitWindowOnError;
                    _onErrorHandlerInstalled = true;
                  }
                  handlers.push(handler);
                };
                report.unsubscribe = function (handler) {
                  for (var handlerIndex = handlers.length - 1; handlerIndex >= 0; --handlerIndex) {
                    if (handlers[handlerIndex] === handler) {
                      handlers.splice(handlerIndex, 1);
                    }
                  }
                };
                report.uninstall = function () {
                  if (_onErrorHandlerInstalled) {
                    _window.onerror = _oldOnerrorHandler;
                    _onErrorHandlerInstalled = false;
                    _oldOnerrorHandler = void 0;
                  }
                  handlers = [];
                };
                return report;
              })();
              TraceKit.computeStackTrace = (function () {
                function computeStackTraceFromStackProp(exception) {
                  if (void 0 !== exception.stack && exception.stack) {
                    for (
                      var submatch,
                        parts,
                        element,
                        chrome =
                          /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|[a-z]:|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i,
                        winjs =
                          /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx(?:-web)|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i,
                        gecko =
                          /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|moz-extension).*?:\/.*?|\[native code\]|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i,
                        geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i,
                        chromeEval = /\((\S*)(?::(\d+))(?::(\d+))\)/,
                        lines = exception.stack.split('\n'),
                        stack = [],
                        frameIndex = (/^(.*) is undefined$/.exec(exception.message), 0),
                        stackLineCount = lines.length;
                      frameIndex < stackLineCount;
                      ++frameIndex
                    ) {
                      if ((parts = chrome.exec(lines[frameIndex]))) {
                        var isNative = parts[2] && 0 === parts[2].indexOf('native');
                        if (
                          parts[2] &&
                          0 === parts[2].indexOf('eval') &&
                          (submatch = chromeEval.exec(parts[2]))
                        ) {
                          parts[2] = submatch[1];
                          parts[3] = submatch[2];
                          parts[4] = submatch[3];
                        }
                        element = {
                          url: isNative ? null : parts[2],
                          func: parts[1] || UNKNOWN_FUNCTION,
                          args: isNative ? [parts[2]] : [],
                          line: parts[3] ? +parts[3] : null,
                          column: parts[4] ? +parts[4] : null,
                        };
                      } else {
                        if ((parts = winjs.exec(lines[frameIndex]))) {
                          element = {
                            url: parts[2],
                            func: parts[1] || UNKNOWN_FUNCTION,
                            args: [],
                            line: +parts[3],
                            column: parts[4] ? +parts[4] : null,
                          };
                        } else {
                          if (!(parts = gecko.exec(lines[frameIndex]))) {
                            continue;
                          }
                          if (
                            parts[3] &&
                            parts[3].indexOf(' > eval') > -1 &&
                            (submatch = geckoEval.exec(parts[3]))
                          ) {
                            parts[3] = submatch[1];
                            parts[4] = submatch[2];
                            parts[5] = null;
                          } else {
                            if (
                              !(0 !== frameIndex || parts[5] || void 0 === exception.columnNumber)
                            ) {
                              stack[0].column = exception.columnNumber + 1;
                            }
                          }
                          element = {
                            url: parts[3],
                            func: parts[1] || UNKNOWN_FUNCTION,
                            args: parts[2] ? parts[2].split(',') : [],
                            line: parts[4] ? +parts[4] : null,
                            column: parts[5] ? +parts[5] : null,
                          };
                        }
                      }
                      if (!element.func && element.line) {
                        element.func = UNKNOWN_FUNCTION;
                      }
                      if (element.url && 'blob:' === element.url.substr(0, 5)) {
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', element.url, false);
                        xhr.send(null);
                        if (200 === xhr.status) {
                          var source = xhr.responseText || '',
                            sourceMaps = (source = source.slice(-300)).match(
                              /\/\/# sourceMappingURL=(.*)$/,
                            );
                          if (sourceMaps) {
                            var sourceMapAddress = sourceMaps[1];
                            if ('~' === sourceMapAddress.charAt(0)) {
                              sourceMapAddress =
                                ('undefined' == typeof document || null == document.location
                                  ? ''
                                  : document.location.origin
                                    ? document.location.origin
                                    : document.location.protocol +
                                      '//' +
                                      document.location.hostname +
                                      (document.location.port
                                        ? ':' + document.location.port
                                        : '')) + sourceMapAddress.slice(1);
                            }
                            element.url = sourceMapAddress.slice(0, -4);
                          }
                        }
                      }
                      stack.push(element);
                    }
                    if (stack.length) {
                      return {
                        name: exception.name,
                        message: exception.message,
                        url: getLocationHref(),
                        stack: stack,
                      };
                    } else {
                      return null;
                    }
                  }
                }
                function augmentStackTraceWithInitialElement(stackInfo, url, lineNo, message) {
                  var initial = { url: url, line: lineNo };
                  if (initial.url && initial.line) {
                    stackInfo.incomplete = false;
                    if (!initial.func) {
                      initial.func = UNKNOWN_FUNCTION;
                    }
                    if (stackInfo.stack.length > 0 && stackInfo.stack[0].url === initial.url) {
                      if (stackInfo.stack[0].line === initial.line) {
                        return false;
                      }
                      if (!stackInfo.stack[0].line && stackInfo.stack[0].func === initial.func) {
                        stackInfo.stack[0].line = initial.line;
                        return false;
                      }
                    }
                    stackInfo.stack.unshift(initial);
                    stackInfo.partial = true;
                    return true;
                  }
                  stackInfo.incomplete = true;
                  return false;
                }
                function computeStackTraceByWalkingCallerChain(exception, depth) {
                  for (
                    var parts,
                      item,
                      functionName =
                        /function\s+([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)?\s*\(/i,
                      stack = [],
                      funcs = {},
                      recursion = false,
                      curr = computeStackTraceByWalkingCallerChain.caller;
                    curr && !recursion;
                    curr = curr.caller
                  ) {
                    if (curr !== computeStackTrace && curr !== TraceKit.report) {
                      item = { url: null, func: UNKNOWN_FUNCTION, line: null, column: null };
                      if (curr.name) {
                        item.func = curr.name;
                      } else {
                        if ((parts = functionName.exec(curr.toString()))) {
                          item.func = parts[1];
                        }
                      }
                      if (void 0 === item.func) {
                        try {
                          item.func = parts.input.substring(0, parts.input.indexOf('{'));
                        } catch (functionNameError) {}
                      }
                      if (funcs['' + curr]) {
                        recursion = true;
                      } else {
                        funcs['' + curr] = true;
                      }
                      stack.push(item);
                    }
                  }
                  if (depth) {
                    stack.splice(0, depth);
                  }
                  var result = {
                    name: exception.name,
                    message: exception.message,
                    url: getLocationHref(),
                    stack: stack,
                  };
                  augmentStackTraceWithInitialElement(
                    result,
                    exception.sourceURL || exception.fileName,
                    exception.line || exception.lineNumber,
                    exception.message || exception.description,
                  );
                  return result;
                }
                function computeStackTrace(exception, depth) {
                  var stack = null;
                  depth = null == depth ? 0 : +depth;
                  try {
                    if ((stack = computeStackTraceFromStackProp(exception))) {
                      return stack;
                    }
                  } catch (stackPropertyError) {
                    if (TraceKit.debug) {
                      throw stackPropertyError;
                    }
                  }
                  try {
                    if ((stack = computeStackTraceByWalkingCallerChain(exception, depth + 1))) {
                      return stack;
                    }
                  } catch (callerStackError) {
                    if (TraceKit.debug) {
                      throw callerStackError;
                    }
                  }
                  return {
                    name: exception.name,
                    message: exception.message,
                    url: getLocationHref(),
                  };
                }
                computeStackTrace.augmentStackTraceWithInitialElement =
                  augmentStackTraceWithInitialElement;
                computeStackTrace.computeStackTraceFromStackProp = computeStackTraceFromStackProp;
                return computeStackTrace;
              })();
              moduleRecord.exports = TraceKit;
            }).call(
              this,
              'undefined' != typeof global
                ? global
                : 'undefined' != typeof self
                  ? self
                  : 'undefined' != typeof window
                    ? window
                    : {},
            );
          },
          { 5: 5 },
        ],
        7: [
          function (_dereq_, moduleRecord, moduleExports) {
            function indexOf(haystack, needle) {
              for (var itemIndex = 0; itemIndex < haystack.length; ++itemIndex) {
                if (haystack[itemIndex] === needle) {
                  return itemIndex;
                }
              }
              return -1;
            }
            function serializer(replacer, cycleReplacer) {
              var stack = [],
                keys = [];
              if (null == cycleReplacer) {
                cycleReplacer = function (key, value) {
                  if (stack[0] === value) {
                    return '[Circular ~]';
                  } else {
                    return '[Circular ~.' + keys.slice(0, indexOf(stack, value)).join('.') + ']';
                  }
                };
              }
              return function (key, value) {
                if (stack.length > 0) {
                  var thisPos = indexOf(stack, this);
                  if (~thisPos) {
                    stack.splice(thisPos + 1);
                  } else {
                    stack.push(this);
                  }
                  if (~thisPos) {
                    keys.splice(thisPos, 1 / 0, key);
                  } else {
                    keys.push(key);
                  }
                  if (~indexOf(stack, value)) {
                    value = cycleReplacer.call(this, key, value);
                  }
                } else {
                  stack.push(value);
                }
                if (null == replacer) {
                  if (value instanceof Error) {
                    return (function (value) {
                      var error = {
                        stack: value.stack,
                        message: value.message,
                        name: value.name,
                      };
                      for (var propertyName in value) {
                        if (Object.prototype.hasOwnProperty.call(value, propertyName)) {
                          error[propertyName] = value[propertyName];
                        }
                      }
                      return error;
                    })(value);
                  } else {
                    return value;
                  }
                } else {
                  return replacer.call(this, key, value);
                }
              };
            }
            (moduleRecord.exports = function (object, replacer, spaces, cycleReplacer) {
              return JSON.stringify(object, serializer(replacer, cycleReplacer), spaces);
            }).getSerialize = serializer;
          },
          {},
        ],
        8: [
          function (_dereq_, moduleRecord, moduleExports) {
            function safeAdd(leftWord, rightWord) {
              var lsw = (65535 & leftWord) + (65535 & rightWord);
              return (((leftWord >> 16) + (rightWord >> 16) + (lsw >> 16)) << 16) | (65535 & lsw);
            }
            function md5CommonRound(mixedBits, stateA, stateB, word, shift, constant) {
              return safeAdd(
                ((sum = safeAdd(safeAdd(stateA, mixedBits), safeAdd(word, constant))) <<
                  (rotation = shift)) |
                  (sum >>> (32 - rotation)),
                stateB,
              );
              var sum, rotation;
            }
            function md5ff(stateA, stateB, stateC, stateD, word, shift, constant) {
              return md5CommonRound(
                (stateB & stateC) | (~stateB & stateD),
                stateA,
                stateB,
                word,
                shift,
                constant,
              );
            }
            function md5gg(stateA, stateB, stateC, stateD, word, shift, constant) {
              return md5CommonRound(
                (stateB & stateD) | (stateC & ~stateD),
                stateA,
                stateB,
                word,
                shift,
                constant,
              );
            }
            function md5hh(stateA, stateB, stateC, stateD, word, shift, constant) {
              return md5CommonRound(
                stateB ^ stateC ^ stateD,
                stateA,
                stateB,
                word,
                shift,
                constant,
              );
            }
            function md5ii(stateA, stateB, stateC, stateD, word, shift, constant) {
              return md5CommonRound(
                stateC ^ (stateB | ~stateD),
                stateA,
                stateB,
                word,
                shift,
                constant,
              );
            }
            function binlMD5(words, len) {
              var blockOffset, olda, oldb, oldc, oldd;
              words[len >> 5] |= 128 << (len % 32);
              words[14 + (((len + 64) >>> 9) << 4)] = len;
              var stateA = 1732584193,
                stateB = -271733879,
                stateC = -1732584194,
                stateD = 271733878;
              for (blockOffset = 0; blockOffset < words.length; blockOffset += 16) {
                olda = stateA;
                oldb = stateB;
                oldc = stateC;
                oldd = stateD;
                stateB = md5ii(
                  (stateB = md5ii(
                    (stateB = md5ii(
                      (stateB = md5ii(
                        (stateB = md5hh(
                          (stateB = md5hh(
                            (stateB = md5hh(
                              (stateB = md5hh(
                                (stateB = md5gg(
                                  (stateB = md5gg(
                                    (stateB = md5gg(
                                      (stateB = md5gg(
                                        (stateB = md5ff(
                                          (stateB = md5ff(
                                            (stateB = md5ff(
                                              (stateB = md5ff(
                                                stateB,
                                                (stateC = md5ff(
                                                  stateC,
                                                  (stateD = md5ff(
                                                    stateD,
                                                    (stateA = md5ff(
                                                      stateA,
                                                      stateB,
                                                      stateC,
                                                      stateD,
                                                      words[blockOffset],
                                                      7,
                                                      -680876936,
                                                    )),
                                                    stateB,
                                                    stateC,
                                                    words[blockOffset + 1],
                                                    12,
                                                    -389564586,
                                                  )),
                                                  stateA,
                                                  stateB,
                                                  words[blockOffset + 2],
                                                  17,
                                                  606105819,
                                                )),
                                                stateD,
                                                stateA,
                                                words[blockOffset + 3],
                                                22,
                                                -1044525330,
                                              )),
                                              (stateC = md5ff(
                                                stateC,
                                                (stateD = md5ff(
                                                  stateD,
                                                  (stateA = md5ff(
                                                    stateA,
                                                    stateB,
                                                    stateC,
                                                    stateD,
                                                    words[blockOffset + 4],
                                                    7,
                                                    -176418897,
                                                  )),
                                                  stateB,
                                                  stateC,
                                                  words[blockOffset + 5],
                                                  12,
                                                  1200080426,
                                                )),
                                                stateA,
                                                stateB,
                                                words[blockOffset + 6],
                                                17,
                                                -1473231341,
                                              )),
                                              stateD,
                                              stateA,
                                              words[blockOffset + 7],
                                              22,
                                              -45705983,
                                            )),
                                            (stateC = md5ff(
                                              stateC,
                                              (stateD = md5ff(
                                                stateD,
                                                (stateA = md5ff(
                                                  stateA,
                                                  stateB,
                                                  stateC,
                                                  stateD,
                                                  words[blockOffset + 8],
                                                  7,
                                                  1770035416,
                                                )),
                                                stateB,
                                                stateC,
                                                words[blockOffset + 9],
                                                12,
                                                -1958414417,
                                              )),
                                              stateA,
                                              stateB,
                                              words[blockOffset + 10],
                                              17,
                                              -42063,
                                            )),
                                            stateD,
                                            stateA,
                                            words[blockOffset + 11],
                                            22,
                                            -1990404162,
                                          )),
                                          (stateC = md5ff(
                                            stateC,
                                            (stateD = md5ff(
                                              stateD,
                                              (stateA = md5ff(
                                                stateA,
                                                stateB,
                                                stateC,
                                                stateD,
                                                words[blockOffset + 12],
                                                7,
                                                1804603682,
                                              )),
                                              stateB,
                                              stateC,
                                              words[blockOffset + 13],
                                              12,
                                              -40341101,
                                            )),
                                            stateA,
                                            stateB,
                                            words[blockOffset + 14],
                                            17,
                                            -1502002290,
                                          )),
                                          stateD,
                                          stateA,
                                          words[blockOffset + 15],
                                          22,
                                          1236535329,
                                        )),
                                        (stateC = md5gg(
                                          stateC,
                                          (stateD = md5gg(
                                            stateD,
                                            (stateA = md5gg(
                                              stateA,
                                              stateB,
                                              stateC,
                                              stateD,
                                              words[blockOffset + 1],
                                              5,
                                              -165796510,
                                            )),
                                            stateB,
                                            stateC,
                                            words[blockOffset + 6],
                                            9,
                                            -1069501632,
                                          )),
                                          stateA,
                                          stateB,
                                          words[blockOffset + 11],
                                          14,
                                          643717713,
                                        )),
                                        stateD,
                                        stateA,
                                        words[blockOffset],
                                        20,
                                        -373897302,
                                      )),
                                      (stateC = md5gg(
                                        stateC,
                                        (stateD = md5gg(
                                          stateD,
                                          (stateA = md5gg(
                                            stateA,
                                            stateB,
                                            stateC,
                                            stateD,
                                            words[blockOffset + 5],
                                            5,
                                            -701558691,
                                          )),
                                          stateB,
                                          stateC,
                                          words[blockOffset + 10],
                                          9,
                                          38016083,
                                        )),
                                        stateA,
                                        stateB,
                                        words[blockOffset + 15],
                                        14,
                                        -660478335,
                                      )),
                                      stateD,
                                      stateA,
                                      words[blockOffset + 4],
                                      20,
                                      -405537848,
                                    )),
                                    (stateC = md5gg(
                                      stateC,
                                      (stateD = md5gg(
                                        stateD,
                                        (stateA = md5gg(
                                          stateA,
                                          stateB,
                                          stateC,
                                          stateD,
                                          words[blockOffset + 9],
                                          5,
                                          568446438,
                                        )),
                                        stateB,
                                        stateC,
                                        words[blockOffset + 14],
                                        9,
                                        -1019803690,
                                      )),
                                      stateA,
                                      stateB,
                                      words[blockOffset + 3],
                                      14,
                                      -187363961,
                                    )),
                                    stateD,
                                    stateA,
                                    words[blockOffset + 8],
                                    20,
                                    1163531501,
                                  )),
                                  (stateC = md5gg(
                                    stateC,
                                    (stateD = md5gg(
                                      stateD,
                                      (stateA = md5gg(
                                        stateA,
                                        stateB,
                                        stateC,
                                        stateD,
                                        words[blockOffset + 13],
                                        5,
                                        -1444681467,
                                      )),
                                      stateB,
                                      stateC,
                                      words[blockOffset + 2],
                                      9,
                                      -51403784,
                                    )),
                                    stateA,
                                    stateB,
                                    words[blockOffset + 7],
                                    14,
                                    1735328473,
                                  )),
                                  stateD,
                                  stateA,
                                  words[blockOffset + 12],
                                  20,
                                  -1926607734,
                                )),
                                (stateC = md5hh(
                                  stateC,
                                  (stateD = md5hh(
                                    stateD,
                                    (stateA = md5hh(
                                      stateA,
                                      stateB,
                                      stateC,
                                      stateD,
                                      words[blockOffset + 5],
                                      4,
                                      -378558,
                                    )),
                                    stateB,
                                    stateC,
                                    words[blockOffset + 8],
                                    11,
                                    -2022574463,
                                  )),
                                  stateA,
                                  stateB,
                                  words[blockOffset + 11],
                                  16,
                                  1839030562,
                                )),
                                stateD,
                                stateA,
                                words[blockOffset + 14],
                                23,
                                -35309556,
                              )),
                              (stateC = md5hh(
                                stateC,
                                (stateD = md5hh(
                                  stateD,
                                  (stateA = md5hh(
                                    stateA,
                                    stateB,
                                    stateC,
                                    stateD,
                                    words[blockOffset + 1],
                                    4,
                                    -1530992060,
                                  )),
                                  stateB,
                                  stateC,
                                  words[blockOffset + 4],
                                  11,
                                  1272893353,
                                )),
                                stateA,
                                stateB,
                                words[blockOffset + 7],
                                16,
                                -155497632,
                              )),
                              stateD,
                              stateA,
                              words[blockOffset + 10],
                              23,
                              -1094730640,
                            )),
                            (stateC = md5hh(
                              stateC,
                              (stateD = md5hh(
                                stateD,
                                (stateA = md5hh(
                                  stateA,
                                  stateB,
                                  stateC,
                                  stateD,
                                  words[blockOffset + 13],
                                  4,
                                  681279174,
                                )),
                                stateB,
                                stateC,
                                words[blockOffset],
                                11,
                                -358537222,
                              )),
                              stateA,
                              stateB,
                              words[blockOffset + 3],
                              16,
                              -722521979,
                            )),
                            stateD,
                            stateA,
                            words[blockOffset + 6],
                            23,
                            76029189,
                          )),
                          (stateC = md5hh(
                            stateC,
                            (stateD = md5hh(
                              stateD,
                              (stateA = md5hh(
                                stateA,
                                stateB,
                                stateC,
                                stateD,
                                words[blockOffset + 9],
                                4,
                                -640364487,
                              )),
                              stateB,
                              stateC,
                              words[blockOffset + 12],
                              11,
                              -421815835,
                            )),
                            stateA,
                            stateB,
                            words[blockOffset + 15],
                            16,
                            530742520,
                          )),
                          stateD,
                          stateA,
                          words[blockOffset + 2],
                          23,
                          -995338651,
                        )),
                        (stateC = md5ii(
                          stateC,
                          (stateD = md5ii(
                            stateD,
                            (stateA = md5ii(
                              stateA,
                              stateB,
                              stateC,
                              stateD,
                              words[blockOffset],
                              6,
                              -198630844,
                            )),
                            stateB,
                            stateC,
                            words[blockOffset + 7],
                            10,
                            1126891415,
                          )),
                          stateA,
                          stateB,
                          words[blockOffset + 14],
                          15,
                          -1416354905,
                        )),
                        stateD,
                        stateA,
                        words[blockOffset + 5],
                        21,
                        -57434055,
                      )),
                      (stateC = md5ii(
                        stateC,
                        (stateD = md5ii(
                          stateD,
                          (stateA = md5ii(
                            stateA,
                            stateB,
                            stateC,
                            stateD,
                            words[blockOffset + 12],
                            6,
                            1700485571,
                          )),
                          stateB,
                          stateC,
                          words[blockOffset + 3],
                          10,
                          -1894986606,
                        )),
                        stateA,
                        stateB,
                        words[blockOffset + 10],
                        15,
                        -1051523,
                      )),
                      stateD,
                      stateA,
                      words[blockOffset + 1],
                      21,
                      -2054922799,
                    )),
                    (stateC = md5ii(
                      stateC,
                      (stateD = md5ii(
                        stateD,
                        (stateA = md5ii(
                          stateA,
                          stateB,
                          stateC,
                          stateD,
                          words[blockOffset + 8],
                          6,
                          1873313359,
                        )),
                        stateB,
                        stateC,
                        words[blockOffset + 15],
                        10,
                        -30611744,
                      )),
                      stateA,
                      stateB,
                      words[blockOffset + 6],
                      15,
                      -1560198380,
                    )),
                    stateD,
                    stateA,
                    words[blockOffset + 13],
                    21,
                    1309151649,
                  )),
                  (stateC = md5ii(
                    stateC,
                    (stateD = md5ii(
                      stateD,
                      (stateA = md5ii(
                        stateA,
                        stateB,
                        stateC,
                        stateD,
                        words[blockOffset + 4],
                        6,
                        -145523070,
                      )),
                      stateB,
                      stateC,
                      words[blockOffset + 11],
                      10,
                      -1120210379,
                    )),
                    stateA,
                    stateB,
                    words[blockOffset + 2],
                    15,
                    718787259,
                  )),
                  stateD,
                  stateA,
                  words[blockOffset + 9],
                  21,
                  -343485551,
                );
                stateA = safeAdd(stateA, olda);
                stateB = safeAdd(stateB, oldb);
                stateC = safeAdd(stateC, oldc);
                stateD = safeAdd(stateD, oldd);
              }
              return [stateA, stateB, stateC, stateD];
            }
            function binl2rstr(input) {
              var bitOffset,
                output = '',
                length32 = 32 * input.length;
              for (bitOffset = 0; bitOffset < length32; bitOffset += 8) {
                output += String.fromCharCode((input[bitOffset >> 5] >>> (bitOffset % 32)) & 255);
              }
              return output;
            }
            function rstr2binl(input) {
              var bitOffset,
                output = [];
              for (
                output[(input.length >> 2) - 1] = void 0, bitOffset = 0;
                bitOffset < output.length;
                bitOffset += 1
              ) {
                output[bitOffset] = 0;
              }
              var length8 = 8 * input.length;
              for (bitOffset = 0; bitOffset < length8; bitOffset += 8) {
                output[bitOffset >> 5] |=
                  (255 & input.charCodeAt(bitOffset / 8)) << (bitOffset % 32);
              }
              return output;
            }
            function rawStringToHex(input) {
              var codeUnit,
                characterIndex,
                output = '';
              for (characterIndex = 0; characterIndex < input.length; characterIndex += 1) {
                codeUnit = input.charCodeAt(characterIndex);
                output +=
                  '0123456789abcdef'.charAt((codeUnit >>> 4) & 15) +
                  '0123456789abcdef'.charAt(15 & codeUnit);
              }
              return output;
            }
            function str2rstrUTF8(input) {
              return unescape(encodeURIComponent(input));
            }
            function hexMD5(text) {
              return (function (utf8Text) {
                return binl2rstr(binlMD5(rstr2binl(utf8Text), 8 * utf8Text.length));
              })(str2rstrUTF8(text));
            }
            function hexHMACMD5(key, text) {
              return (function (key, data) {
                var wordIndex,
                  hash,
                  bkey = rstr2binl(key),
                  ipad = [],
                  opad = [];
                for (
                  ipad[15] = opad[15] = void 0,
                    bkey.length > 16 && (bkey = binlMD5(bkey, 8 * key.length)),
                    wordIndex = 0;
                  wordIndex < 16;
                  wordIndex += 1
                ) {
                  ipad[wordIndex] = 909522486 ^ bkey[wordIndex];
                  opad[wordIndex] = 1549556828 ^ bkey[wordIndex];
                }
                hash = binlMD5(ipad.concat(rstr2binl(data)), 512 + 8 * data.length);
                return binl2rstr(binlMD5(opad.concat(hash), 640));
              })(str2rstrUTF8(key), str2rstrUTF8(text));
            }
            moduleRecord.exports = function (string, key, raw) {
              if (key) {
                if (raw) {
                  return hexHMACMD5(key, string);
                } else {
                  return rawStringToHex(hexHMACMD5(key, string));
                }
              } else {
                if (raw) {
                  return hexMD5(string);
                } else {
                  return rawStringToHex(hexMD5(string));
                }
              }
            };
          },
          {},
        ],
      },
      {},
      [4],
    )(4);
  };
}
