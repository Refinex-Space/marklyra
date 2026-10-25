// Webpack module 45: scheduler.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  var r, o, i, l, a;
  if ('undefined' === typeof window || 'function' !== typeof MessageChannel) {
    var u = null,
      c = null,
      s = function e() {
        if (null !== u)
          try {
            var n = t.unstable_now();
            u(!0, n), (u = null);
          } catch (r) {
            throw (setTimeout(e, 0), r);
          }
      },
      f = Date.now();
    (t.unstable_now = function () {
      return Date.now() - f;
    }),
      (r = function (e) {
        null !== u ? setTimeout(r, 0, e) : ((u = e), setTimeout(s, 0));
      }),
      (o = function (e, t) {
        c = setTimeout(e, t);
      }),
      (i = function () {
        clearTimeout(c);
      }),
      (l = function () {
        return !1;
      }),
      (a = t.unstable_forceFrameRate = function () {});
  } else {
    var d = window.performance,
      p = window.Date,
      h = window.setTimeout,
      m = window.clearTimeout;
    if ('undefined' !== typeof console) {
      var y = window.cancelAnimationFrame;
      'function' !== typeof window.requestAnimationFrame &&
        console.error(
          "This browser doesn't support requestAnimationFrame. Make sure that you load a polyfill in older browsers. https://fb.me/react-polyfills",
        ),
        'function' !== typeof y &&
          console.error(
            "This browser doesn't support cancelAnimationFrame. Make sure that you load a polyfill in older browsers. https://fb.me/react-polyfills",
          );
    }
    if ('object' === typeof d && 'function' === typeof d.now)
      t.unstable_now = function () {
        return d.now();
      };
    else {
      var v = p.now();
      t.unstable_now = function () {
        return p.now() - v;
      };
    }
    var g = !1,
      b = null,
      w = -1,
      k = 5,
      E = 0;
    (l = function () {
      return t.unstable_now() >= E;
    }),
      (a = function () {}),
      (t.unstable_forceFrameRate = function (e) {
        0 > e || 125 < e
          ? console.error(
              'forceFrameRate takes a positive int between 0 and 125, forcing framerates higher than 125 fps is not unsupported',
            )
          : (k = 0 < e ? Math.floor(1e3 / e) : 5);
      });
    var x = new MessageChannel(),
      T = x.port2;
    (x.port1.onmessage = function () {
      if (null !== b) {
        var e = t.unstable_now();
        E = e + k;
        try {
          b(!0, e) ? T.postMessage(null) : ((g = !1), (b = null));
        } catch (n) {
          throw (T.postMessage(null), n);
        }
      } else g = !1;
    }),
      (r = function (e) {
        (b = e), g || ((g = !0), T.postMessage(null));
      }),
      (o = function (e, n) {
        w = h(function () {
          e(t.unstable_now());
        }, n);
      }),
      (i = function () {
        m(w), (w = -1);
      });
  }
  function S(e, t) {
    var n = e.length;
    e.push(t);
    e: for (;;) {
      var r = (n - 1) >>> 1,
        o = e[r];
      if (!(void 0 !== o && 0 < P(o, t))) break e;
      (e[r] = t), (e[n] = o), (n = r);
    }
  }
  function C(e) {
    return void 0 === (e = e[0]) ? null : e;
  }
  function _(e) {
    var t = e[0];
    if (void 0 !== t) {
      var n = e.pop();
      if (n !== t) {
        e[0] = n;
        e: for (var r = 0, o = e.length; r < o; ) {
          var i = 2 * (r + 1) - 1,
            l = e[i],
            a = i + 1,
            u = e[a];
          if (void 0 !== l && 0 > P(l, n))
            void 0 !== u && 0 > P(u, l)
              ? ((e[r] = u), (e[a] = n), (r = a))
              : ((e[r] = l), (e[i] = n), (r = i));
          else {
            if (!(void 0 !== u && 0 > P(u, n))) break e;
            (e[r] = u), (e[a] = n), (r = a);
          }
        }
      }
      return t;
    }
    return null;
  }
  function P(e, t) {
    var n = e.sortIndex - t.sortIndex;
    return 0 !== n ? n : e.id - t.id;
  }
  var O = [],
    N = [],
    R = 1,
    z = null,
    I = 3,
    M = !1,
    D = !1,
    j = !1;
  function A(e) {
    for (var t = C(N); null !== t; ) {
      if (null === t.callback) _(N);
      else {
        if (!(t.startTime <= e)) break;
        _(N), (t.sortIndex = t.expirationTime), S(O, t);
      }
      t = C(N);
    }
  }
  function L(e) {
    if (((j = !1), A(e), !D))
      if (null !== C(O)) (D = !0), r(F);
      else {
        var t = C(N);
        null !== t && o(L, t.startTime - e);
      }
  }
  function F(e, n) {
    (D = !1), j && ((j = !1), i()), (M = !0);
    var r = I;
    try {
      for (A(n), z = C(O); null !== z && (!(z.expirationTime > n) || (e && !l())); ) {
        var a = z.callback;
        if (null !== a) {
          (z.callback = null), (I = z.priorityLevel);
          var u = a(z.expirationTime <= n);
          (n = t.unstable_now()),
            'function' === typeof u ? (z.callback = u) : z === C(O) && _(O),
            A(n);
        } else _(O);
        z = C(O);
      }
      if (null !== z) var c = !0;
      else {
        var s = C(N);
        null !== s && o(L, s.startTime - n), (c = !1);
      }
      return c;
    } finally {
      (z = null), (I = r), (M = !1);
    }
  }
  function U(e) {
    switch (e) {
      case 1:
        return -1;
      case 2:
        return 250;
      case 5:
        return 1073741823;
      case 4:
        return 1e4;
      default:
        return 5e3;
    }
  }
  var B = a;
  (t.unstable_IdlePriority = 5),
    (t.unstable_ImmediatePriority = 1),
    (t.unstable_LowPriority = 4),
    (t.unstable_NormalPriority = 3),
    (t.unstable_Profiling = null),
    (t.unstable_UserBlockingPriority = 2),
    (t.unstable_cancelCallback = function (e) {
      e.callback = null;
    }),
    (t.unstable_continueExecution = function () {
      D || M || ((D = !0), r(F));
    }),
    (t.unstable_getCurrentPriorityLevel = function () {
      return I;
    }),
    (t.unstable_getFirstCallbackNode = function () {
      return C(O);
    }),
    (t.unstable_next = function (e) {
      switch (I) {
        case 1:
        case 2:
        case 3:
          var t = 3;
          break;
        default:
          t = I;
      }
      var n = I;
      I = t;
      try {
        return e();
      } finally {
        I = n;
      }
    }),
    (t.unstable_pauseExecution = function () {}),
    (t.unstable_requestPaint = B),
    (t.unstable_runWithPriority = function (e, t) {
      switch (e) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          e = 3;
      }
      var n = I;
      I = e;
      try {
        return t();
      } finally {
        I = n;
      }
    }),
    (t.unstable_scheduleCallback = function (e, n, l) {
      var a = t.unstable_now();
      if ('object' === typeof l && null !== l) {
        var u = l.delay;
        (u = 'number' === typeof u && 0 < u ? a + u : a),
          (l = 'number' === typeof l.timeout ? l.timeout : U(e));
      } else (l = U(e)), (u = a);
      return (
        (e = {
          id: R++,
          callback: n,
          priorityLevel: e,
          startTime: u,
          expirationTime: (l = u + l),
          sortIndex: -1,
        }),
        u > a
          ? ((e.sortIndex = u),
            S(N, e),
            null === C(O) && e === C(N) && (j ? i() : (j = !0), o(L, u - a)))
          : ((e.sortIndex = l), S(O, e), D || M || ((D = !0), r(F))),
        e
      );
    }),
    (t.unstable_shouldYield = function () {
      var e = t.unstable_now();
      A(e);
      var n = C(O);
      return (
        (n !== z &&
          null !== z &&
          null !== n &&
          null !== n.callback &&
          n.startTime <= e &&
          n.expirationTime < z.expirationTime) ||
        l()
      );
    }),
    (t.unstable_wrapCallback = function (e) {
      var t = I;
      return function () {
        var n = I;
        I = t;
        try {
          return e.apply(this, arguments);
        } finally {
          I = n;
        }
      };
    });
});
