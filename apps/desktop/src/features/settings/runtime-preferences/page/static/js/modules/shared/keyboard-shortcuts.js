// Webpack module 13: keyboard-shortcuts.
// Registration order and sparse array indices are defined in bundles.json.
(function (e, t, n) {
  'use strict';
  var r =
    'undefined' !== typeof navigator && navigator.userAgent.toLowerCase().indexOf('firefox') > 0;
  function o(e, t, n) {
    e.addEventListener
      ? e.addEventListener(t, n, !1)
      : e.attachEvent &&
        e.attachEvent('on'.concat(t), function () {
          n(window.event);
        });
  }
  function i(e, t) {
    for (var n = t.slice(0, t.length - 1), r = 0; r < n.length; r++) n[r] = e[n[r].toLowerCase()];
    return n;
  }
  function l(e) {
    'string' !== typeof e && (e = '');
    for (var t = (e = e.replace(/\s/g, '')).split(','), n = t.lastIndexOf(''); n >= 0; )
      (t[n - 1] += ','), t.splice(n, 1), (n = t.lastIndexOf(''));
    return t;
  }
  for (
    var a = {
        backspace: 8,
        tab: 9,
        clear: 12,
        enter: 13,
        return: 13,
        esc: 27,
        escape: 27,
        space: 32,
        left: 37,
        up: 38,
        right: 39,
        down: 40,
        del: 46,
        delete: 46,
        ins: 45,
        insert: 45,
        home: 36,
        end: 35,
        pageup: 33,
        pagedown: 34,
        capslock: 20,
        '\u21ea': 20,
        ',': 188,
        '.': 190,
        '/': 191,
        '`': 192,
        '-': r ? 173 : 189,
        '=': r ? 61 : 187,
        ';': r ? 59 : 186,
        "'": 222,
        '[': 219,
        ']': 221,
        '\\': 220,
      },
      u = {
        '\u21e7': 16,
        shift: 16,
        '\u2325': 18,
        alt: 18,
        option: 18,
        '\u2303': 17,
        ctrl: 17,
        control: 17,
        '\u2318': 91,
        cmd: 91,
        command: 91,
      },
      c = {
        16: 'shiftKey',
        18: 'altKey',
        17: 'ctrlKey',
        91: 'metaKey',
        shiftKey: 16,
        ctrlKey: 17,
        altKey: 18,
        metaKey: 91,
      },
      s = { 16: !1, 18: !1, 17: !1, 91: !1 },
      f = {},
      d = 1;
    d < 20;
    d++
  )
    a['f'.concat(d)] = 111 + d;
  var p = [],
    h = 'all',
    m = [],
    y = function (e) {
      return a[e.toLowerCase()] || u[e.toLowerCase()] || e.toUpperCase().charCodeAt(0);
    };
  function v(e) {
    h = e || 'all';
  }
  function g() {
    return h || 'all';
  }
  var b = function (e) {
    var t = e.key,
      n = e.scope,
      r = e.method,
      o = e.splitKey,
      a = void 0 === o ? '+' : o;
    l(t).forEach(function (e) {
      var t = e.split(a),
        o = t.length,
        l = t[o - 1],
        c = '*' === l ? '*' : y(l);
      if (f[c]) {
        n || (n = g());
        var s = o > 1 ? i(u, t) : [];
        f[c] = f[c].map(function (e) {
          return (!r || e.method === r) &&
            e.scope === n &&
            (function (e, t) {
              for (
                var n = e.length >= t.length ? e : t,
                  r = e.length >= t.length ? t : e,
                  o = !0,
                  i = 0;
                i < n.length;
                i++
              )
                -1 === r.indexOf(n[i]) && (o = !1);
              return o;
            })(e.mods, s)
            ? {}
            : e;
        });
      }
    });
  };
  function w(e, t, n) {
    var r;
    if (t.scope === n || 'all' === t.scope) {
      for (var o in ((r = t.mods.length > 0), s))
        Object.prototype.hasOwnProperty.call(s, o) &&
          ((!s[o] && t.mods.indexOf(+o) > -1) || (s[o] && -1 === t.mods.indexOf(+o))) &&
          (r = !1);
      ((0 !== t.mods.length || s[16] || s[18] || s[17] || s[91]) && !r && '*' !== t.shortcut) ||
        (!1 === t.method(e, t) &&
          (e.preventDefault ? e.preventDefault() : (e.returnValue = !1),
          e.stopPropagation && e.stopPropagation(),
          e.cancelBubble && (e.cancelBubble = !0)));
    }
  }
  function k(e) {
    var t = f['*'],
      n = e.keyCode || e.which || e.charCode;
    if (E.filter.call(this, e)) {
      if (
        ((93 !== n && 224 !== n) || (n = 91),
        -1 === p.indexOf(n) && 229 !== n && p.push(n),
        ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'].forEach(function (t) {
          var n = c[t];
          e[t] && -1 === p.indexOf(n)
            ? p.push(n)
            : !e[t] && p.indexOf(n) > -1
              ? p.splice(p.indexOf(n), 1)
              : 'metaKey' === t &&
                e[t] &&
                3 === p.length &&
                (e.ctrlKey || e.shiftKey || e.altKey || (p = p.slice(p.indexOf(n))));
        }),
        n in s)
      ) {
        for (var r in ((s[n] = !0), u)) u[r] === n && (E[r] = !0);
        if (!t) return;
      }
      for (var o in s) Object.prototype.hasOwnProperty.call(s, o) && (s[o] = e[c[o]]);
      e.getModifierState &&
        (!e.altKey || e.ctrlKey) &&
        e.getModifierState('AltGraph') &&
        (-1 === p.indexOf(17) && p.push(17),
        -1 === p.indexOf(18) && p.push(18),
        (s[17] = !0),
        (s[18] = !0));
      var i = g();
      if (t)
        for (var l = 0; l < t.length; l++)
          t[l].scope === i &&
            (('keydown' === e.type && t[l].keydown) || ('keyup' === e.type && t[l].keyup)) &&
            w(e, t[l], i);
      if (n in f)
        for (var a = 0; a < f[n].length; a++)
          if (
            (('keydown' === e.type && f[n][a].keydown) || ('keyup' === e.type && f[n][a].keyup)) &&
            f[n][a].key
          ) {
            for (
              var d = f[n][a], h = d.splitKey, m = d.key.split(h), v = [], b = 0;
              b < m.length;
              b++
            )
              v.push(y(m[b]));
            v.sort().join('') === p.sort().join('') && w(e, d, i);
          }
    }
  }
  function E(e, t, n) {
    p = [];
    var r = l(e),
      a = [],
      c = 'all',
      d = document,
      h = 0,
      v = !1,
      g = !0,
      b = '+';
    for (
      void 0 === n && 'function' === typeof t && (n = t),
        '[object Object]' === Object.prototype.toString.call(t) &&
          (t.scope && (c = t.scope),
          t.element && (d = t.element),
          t.keyup && (v = t.keyup),
          void 0 !== t.keydown && (g = t.keydown),
          'string' === typeof t.splitKey && (b = t.splitKey)),
        'string' === typeof t && (c = t);
      h < r.length;
      h++
    )
      (a = []),
        (e = r[h].split(b)).length > 1 && (a = i(u, e)),
        (e = '*' === (e = e[e.length - 1]) ? '*' : y(e)) in f || (f[e] = []),
        f[e].push({
          keyup: v,
          keydown: g,
          scope: c,
          mods: a,
          shortcut: r[h],
          method: n,
          key: r[h],
          splitKey: b,
        });
    'undefined' !== typeof d &&
      !(function (e) {
        return m.indexOf(e) > -1;
      })(d) &&
      window &&
      (m.push(d),
      o(d, 'keydown', function (e) {
        k(e);
      }),
      o(window, 'focus', function () {
        p = [];
      }),
      o(d, 'keyup', function (e) {
        k(e),
          (function (e) {
            var t = e.keyCode || e.which || e.charCode,
              n = p.indexOf(t);
            if (
              (n >= 0 && p.splice(n, 1),
              e.key && 'meta' === e.key.toLowerCase() && p.splice(0, p.length),
              (93 !== t && 224 !== t) || (t = 91),
              t in s)
            )
              for (var r in ((s[t] = !1), u)) u[r] === t && (E[r] = !1);
          })(e);
      }));
  }
  var x = {
    setScope: v,
    getScope: g,
    deleteScope: function (e, t) {
      var n, r;
      for (var o in (e || (e = g()), f))
        if (Object.prototype.hasOwnProperty.call(f, o))
          for (n = f[o], r = 0; r < n.length; ) n[r].scope === e ? n.splice(r, 1) : r++;
      g() === e && v(t || 'all');
    },
    getPressedKeyCodes: function () {
      return p.slice(0);
    },
    isPressed: function (e) {
      return 'string' === typeof e && (e = y(e)), -1 !== p.indexOf(e);
    },
    filter: function (e) {
      var t = e.target || e.srcElement,
        n = t.tagName,
        r = !0;
      return (
        (!t.isContentEditable &&
          (('INPUT' !== n && 'TEXTAREA' !== n && 'SELECT' !== n) || t.readOnly)) ||
          (r = !1),
        r
      );
    },
    unbind: function (e) {
      if (e) {
        if (Array.isArray(e))
          e.forEach(function (e) {
            e.key && b(e);
          });
        else if ('object' === typeof e) e.key && b(e);
        else if ('string' === typeof e) {
          for (var t = arguments.length, n = new Array(t > 1 ? t - 1 : 0), r = 1; r < t; r++)
            n[r - 1] = arguments[r];
          var o = n[0],
            i = n[1];
          'function' === typeof o && ((i = o), (o = '')),
            b({ key: e, scope: o, method: i, splitKey: '+' });
        }
      } else
        Object.keys(f).forEach(function (e) {
          return delete f[e];
        });
    },
  };
  for (var T in x) Object.prototype.hasOwnProperty.call(x, T) && (E[T] = x[T]);
  if ('undefined' !== typeof window) {
    var S = window.hotkeys;
    (E.noConflict = function (e) {
      return e && window.hotkeys === E && (window.hotkeys = S), E;
    }),
      (window.hotkeys = E);
  }
  t.a = E;
});
