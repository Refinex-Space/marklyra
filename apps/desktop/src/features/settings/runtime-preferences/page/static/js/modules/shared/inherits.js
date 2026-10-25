// Webpack module 18: inherits.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  function r(e, t) {
    return (r =
      Object.setPrototypeOf ||
      function (e, t) {
        return (e.__proto__ = t), e;
      })(e, t);
  }
  function o(e, t) {
    if ('function' !== typeof t && null !== t)
      throw new TypeError('Super expression must either be null or a function');
    (e.prototype = Object.create(t && t.prototype, {
      constructor: { value: e, writable: !0, configurable: !0 },
    })),
      t && r(e, t);
  }
  n.d(t, 'a', function () {
    return o;
  });
});
