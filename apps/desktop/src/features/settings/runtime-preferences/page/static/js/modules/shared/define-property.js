// Webpack module 12: define-property.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  function r(e, t, n) {
    return (
      t in e
        ? Object.defineProperty(e, t, { value: n, enumerable: !0, configurable: !0, writable: !0 })
        : (e[t] = n),
      e
    );
  }
  n.d(t, 'a', function () {
    return r;
  });
});
