// Webpack module 47: server-rendering-detection.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  var r,
    o =
      (this && this.__assign) ||
      function () {
        return (o =
          Object.assign ||
          function (e) {
            for (var t, n = 1, r = arguments.length; n < r; n++)
              for (var o in (t = arguments[n]))
                Object.prototype.hasOwnProperty.call(t, o) && (e[o] = t[o]);
            return e;
          }).apply(this, arguments);
      };
  Object.defineProperty(t, '__esModule', { value: !0 }),
    (function (e) {
      (e.Browser = 'browser'), (e.Server = 'server'), (e.Native = 'native');
    })((r = t.Device || (t.Device = {})));
  var i = r.Browser,
    l = r.Server,
    a = r.Native,
    u = !('undefined' === typeof window || !window.document || !window.document.createElement),
    c = 'undefined' != typeof navigator && 'ReactNative' == navigator.product ? a : u ? i : l,
    s = {
      isBrowser: c === i,
      isServer: c === l,
      isNative: c === a,
      device: c,
      canUseWorkers: 'undefined' !== typeof Worker,
      canUseEventListeners: c === i && !!window.addEventListener,
      canUseViewport: c === i && !!window.screen,
    },
    f = function () {
      return (function () {
        for (var e = [], t = 0; t < arguments.length; t++) e[t] = arguments[t];
        return e.reduce(function (e, t) {
          return o(o({}, e), t);
        }, {});
      })(
        ((e = s),
        Object.keys(e).map(function (t) {
          return e[t];
        }),
        s),
      );
      var e;
    },
    d = f();
  (t.weAreServer = function () {
    (s.isServer = !0), (d = f());
  }),
    (t.useSSR = function () {
      return d;
    }),
    (t.default = t.useSSR);
});
