// Webpack module 33: object-assign.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  var r = Object.getOwnPropertySymbols,
    o = Object.prototype.hasOwnProperty,
    i = Object.prototype.propertyIsEnumerable;
  function l(e) {
    if (null === e || void 0 === e)
      throw new TypeError('Object.assign cannot be called with null or undefined');
    return Object(e);
  }
  e.exports = (function () {
    try {
      if (!Object.assign) return !1;
      var e = new String('abc');
      if (((e[5] = 'de'), '5' === Object.getOwnPropertyNames(e)[0])) return !1;
      for (var t = {}, n = 0; n < 10; n++) t['_' + String.fromCharCode(n)] = n;
      if (
        '0123456789' !==
        Object.getOwnPropertyNames(t)
          .map(function (e) {
            return t[e];
          })
          .join('')
      )
        return !1;
      var r = {};
      return (
        'abcdefghijklmnopqrst'.split('').forEach(function (e) {
          r[e] = e;
        }),
        'abcdefghijklmnopqrst' === Object.keys(Object.assign({}, r)).join('')
      );
    } catch (o) {
      return !1;
    }
  })()
    ? Object.assign
    : function (e, t) {
        for (var n, a, u = l(e), c = 1; c < arguments.length; c++) {
          for (var s in (n = Object(arguments[c]))) o.call(n, s) && (u[s] = n[s]);
          if (r) {
            a = r(n);
            for (var f = 0; f < a.length; f++) i.call(n, a[f]) && (u[a[f]] = n[a[f]]);
          }
        }
        return u;
      };
});
