// Webpack module 17: possible-constructor-return.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  function r(e) {
    return (r = Object.setPrototypeOf
      ? Object.getPrototypeOf
      : function (e) {
          return e.__proto__ || Object.getPrototypeOf(e);
        })(e);
  }
  function o() {
    if ('undefined' === typeof Reflect || !Reflect.construct) return !1;
    if (Reflect.construct.sham) return !1;
    if ('function' === typeof Proxy) return !0;
    try {
      return Date.prototype.toString.call(Reflect.construct(Date, [], function () {})), !0;
    } catch (e) {
      return !1;
    }
  }
  function i(e) {
    return (i =
      'function' === typeof Symbol && 'symbol' === typeof Symbol.iterator
        ? function (e) {
            return typeof e;
          }
        : function (e) {
            return e &&
              'function' === typeof Symbol &&
              e.constructor === Symbol &&
              e !== Symbol.prototype
              ? 'symbol'
              : typeof e;
          })(e);
  }
  n.d(t, 'a', function () {
    return u;
  });
  var l = n(11);
  function a(e, t) {
    return !t || ('object' !== i(t) && 'function' !== typeof t) ? Object(l.a)(e) : t;
  }
  function u(e) {
    return function () {
      var t,
        n = r(e);
      if (o()) {
        var i = r(this).constructor;
        t = Reflect.construct(n, arguments, i);
      } else t = n.apply(this, arguments);
      return a(this, t);
    };
  }
});
