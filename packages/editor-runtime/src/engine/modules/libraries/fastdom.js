// libraries/fastdom.
// SystemJS module b. Dependencies: none.
(function (e) {
  'use strict';
  var t = function () {},
    n =
      e.requestAnimationFrame ||
      e.webkitRequestAnimationFrame ||
      e.mozRequestAnimationFrame ||
      e.msRequestAnimationFrame ||
      function (e) {
        return setTimeout(e, 16);
      };
  function i() {
    (this.reads = []), (this.writes = []), (this.raf = n.bind(e)), t('initialized', this);
  }
  function r(e) {
    e.scheduled ||
      ((e.scheduled = !0),
      e.raf(
        function (e) {
          t('flush');
          var n,
            i = e.writes,
            a = e.reads;
          try {
            t('flushing reads', a.length), o(a), t('flushing writes', i.length), o(i);
          } catch (e) {
            n = e;
          }
          (e.scheduled = !1), (a.length || i.length) && r(e);
          if (n) {
            if ((t('task errored', n.message), !e.catch)) throw n;
            e.catch(n);
          }
        }.bind(null, e),
      ),
      t('flush scheduled'));
  }
  function o(e) {
    var n;
    for (t('run tasks'); (n = e.shift()); ) n();
  }
  function a(e, t) {
    var n = e.indexOf(t);
    return !!~n && !!e.splice(n, 1);
  }
  i.prototype = {
    constructor: i,
    measure: function (e, n) {
      t('measure');
      var i = n ? e.bind(n) : e;
      return this.reads.push(i), r(this), i;
    },
    mutate: function (e, n) {
      t('mutate');
      var i = n ? e.bind(n) : e;
      return this.writes.push(i), r(this), i;
    },
    clear: function (e) {
      return t('clear', e), a(this.reads, e) || a(this.writes, e);
    },
    extend: function (e) {
      if ((t('extend', e), 'object' != typeof e)) throw new Error('expected object');
      var n = Object.create(this);
      return (
        (function (e, t) {
          for (var n in t) t.hasOwnProperty(n) && (e[n] = t[n]);
        })(n, e),
        (n.fastdom = this),
        n.initialize && n.initialize(),
        n
      );
    },
    catch: null,
  };
  var s = (e.fastdom = e.fastdom || new i());
  'f' == 'function'[0]
    ? $__System.registerDynamic('b', [], !1, function (e, t, n) {
        return function () {
          return s;
        }.call(this);
      })
    : 'o' == (typeof module)[0] && (module.exports = s);
})(window || this);
