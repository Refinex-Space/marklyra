// Webpack module 25: unsupported-iterable-to-array.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  n.d(t, 'a', function () {
    return o;
  });
  var r = n(28);
  function o(e, t) {
    if (e) {
      if ('string' === typeof e) return Object(r.a)(e, t);
      var n = Object.prototype.toString.call(e).slice(8, -1);
      return (
        'Object' === n && e.constructor && (n = e.constructor.name),
        'Map' === n || 'Set' === n
          ? Array.from(n)
          : 'Arguments' === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)
            ? Object(r.a)(e, t)
            : void 0
      );
    }
  }
});
