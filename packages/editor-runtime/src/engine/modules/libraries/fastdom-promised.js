// libraries/fastdom-promised.
// SystemJS module c. Dependencies: none.
(function () {
  var e = {
    initialize: function () {
      this._tasks = new Map();
    },
    mutate: function (e, n) {
      return t(this, 'mutate', e, n);
    },
    measure: function (e, n) {
      return t(this, 'measure', e, n);
    },
    clear: function (e) {
      var t = this._tasks,
        n = t.get(e);
      this.fastdom.clear(n), t.delete(n);
    },
  };
  function t(e, t, n, i) {
    var r,
      o = e._tasks,
      a = e.fastdom,
      s = new Promise(function (e, l) {
        r = a[t](function () {
          o.delete(s);
          try {
            e(i ? n.call(i) : n());
          } catch (e) {
            l(e);
          }
        }, i);
      });
    return o.set(s, r), s;
  }
  'f' == 'function'[0]
    ? $__System.registerDynamic('c', [], !1, function (t, n, i) {
        return function () {
          return e;
        }.call(this);
      })
    : 'o' == (typeof module)[0]
      ? (module.exports = e)
      : (window.fastdomPromised = e);
})();
