// Webpack module 3: object-without-properties.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  function r(e, t) {
    if (null == e) return {};
    var n,
      r,
      o = (function (e, t) {
        if (null == e) return {};
        var n,
          r,
          o = {},
          i = Object.keys(e);
        for (r = 0; r < i.length; r++) (n = i[r]), t.indexOf(n) >= 0 || (o[n] = e[n]);
        return o;
      })(e, t);
    if (Object.getOwnPropertySymbols) {
      var i = Object.getOwnPropertySymbols(e);
      for (r = 0; r < i.length; r++)
        (n = i[r]),
          t.indexOf(n) >= 0 || (Object.prototype.propertyIsEnumerable.call(e, n) && (o[n] = e[n]));
    }
    return o;
  }
  n.d(t, 'a', function () {
    return r;
  });
});
