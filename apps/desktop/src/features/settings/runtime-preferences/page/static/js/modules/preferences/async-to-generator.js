// Webpack module 9: async-to-generator.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  function a(e, t, n, a, o, i, r) {
    try {
      var l = e[i](r),
        c = l.value;
    } catch (s) {
      return void n(s);
    }
    l.done ? t(c) : Promise.resolve(c).then(a, o);
  }
  function o(e) {
    return function () {
      var t = this,
        n = arguments;
      return new Promise(function (o, i) {
        var r = e.apply(t, n);
        function l(e) {
          a(r, o, i, l, c, 'next', e);
        }
        function c(e) {
          a(r, o, i, l, c, 'throw', e);
        }
        l(void 0);
      });
    };
  }
  n.d(t, 'a', function () {
    return o;
  });
});
