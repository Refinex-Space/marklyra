// shared/global-helpers.
// Shared initialization expression; its position in bundles.json is significant.
!(function (e) {
  function t(e, t) {
    for (var n = e.split('.'); n.length; ) t = t[n.shift()];
    return t;
  }
  function n(n) {
    if ('string' == typeof n) return t(n, e);
    if (!(n instanceof Array)) throw new Error('Global exports must be a string or array.');
    for (var i = {}, r = 0; r < n.length; r++) i[n[r].split('.').pop()] = t(n[r], e);
    return i;
  }
  function i(t) {
    if (-1 === a.indexOf(t)) {
      try {
        var n = e[t];
      } catch (e) {
        a.push(t);
      }
      this(t, n);
    }
  }
  var r,
    o = $__System,
    a = [
      '_g',
      'sessionStorage',
      'localStorage',
      'clipboardData',
      'frames',
      'frameElement',
      'external',
      'mozAnimationStartTime',
      'webkitStorageInfo',
      'webkitIndexedDB',
      'mozInnerScreenY',
      'mozInnerScreenX',
    ];
  o.registry.set(
    '@@global-helpers',
    o.newModule({
      prepareGlobal: function (t, o, a) {
        var s,
          l = e.define;
        if (((e.define = void 0), a)) for (var c in ((s = {}), a)) (s[c] = e[c]), (e[c] = a[c]);
        return (
          o ||
            ((r = {}),
            Object.keys(e).forEach(i, function (e, t) {
              r[e] = t;
            })),
          function () {
            var t,
              a = o ? n(o) : {},
              c = !!o;
            if (
              (o ||
                Object.keys(e).forEach(i, function (e, n) {
                  r[e] !== n &&
                    void 0 !== n &&
                    (o || ((a[e] = n), void 0 !== t ? c || t === n || (c = !0) : (t = n)));
                }),
              (a = c ? a : t),
              s)
            )
              for (var d in s) e[d] = s[d];
            return (e.define = l), a;
          }
        );
      },
    }),
  );
})('undefined' != typeof self ? self : 'undefined' != typeof global ? global : this);
