// Webpack module 16: create-class.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  function r(e, t) {
    for (var n = 0; n < t.length; n++) {
      var r = t[n];
      (r.enumerable = r.enumerable || !1),
        (r.configurable = !0),
        'value' in r && (r.writable = !0),
        Object.defineProperty(e, r.key, r);
    }
  }
  function o(e, t, n) {
    return t && r(e.prototype, t), n && r(e, n), e;
  }
  n.d(t, 'a', function () {
    return o;
  });
});
