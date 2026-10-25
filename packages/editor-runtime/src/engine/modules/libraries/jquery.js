// libraries/jquery.
// SystemJS module e. Dependencies: none.
(function (e, t) {
  'use strict';
  'object' == typeof module && 'object' == typeof module.exports
    ? (module.exports = e.document
        ? t(e, !0)
        : function (e) {
            if (!e.document) throw new Error('jQuery requires a window with a document');
            return t(e);
          })
    : t(e);
})('undefined' != typeof window ? window : this, function (e, t) {
  'use strict';
  var n = [],
    i = e.document,
    r = Object.getPrototypeOf,
    o = n.slice,
    a = n.concat,
    s = n.push,
    l = n.indexOf,
    c = {},
    d = c.toString,
    u = c.hasOwnProperty,
    h = u.toString,
    p = h.call(Object),
    f = {},
    m = function (e) {
      return 'function' == typeof e && 'number' != typeof e.nodeType;
    },
    g = function (e) {
      return null != e && e === e.window;
    },
    v = { type: !0, src: !0, noModule: !0 };
  function y(e, t, n) {
    var r,
      o = (t = t || i).createElement('script');
    if (((o.text = e), n)) for (r in v) n[r] && (o[r] = n[r]);
    t.head.appendChild(o).parentNode.removeChild(o);
  }
  function b(e) {
    return null == e
      ? e + ''
      : 'object' == typeof e || 'function' == typeof e
        ? c[d.call(e)] || 'object'
        : typeof e;
  }
  var w = function (e, t) {
      return new w.fn.init(e, t);
    },
    x = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
  function C(e) {
    var t = !!e && 'length' in e && e.length,
      n = b(e);
    return (
      !m(e) && !g(e) && ('array' === n || 0 === t || ('number' == typeof t && t > 0 && t - 1 in e))
    );
  }
  (w.fn = w.prototype =
    {
      jquery: '3.3.1',
      constructor: w,
      length: 0,
      toArray: function () {
        return o.call(this);
      },
      get: function (e) {
        return null == e ? o.call(this) : e < 0 ? this[e + this.length] : this[e];
      },
      pushStack: function (e) {
        var t = w.merge(this.constructor(), e);
        return (t.prevObject = this), t;
      },
      each: function (e) {
        return w.each(this, e);
      },
      map: function (e) {
        return this.pushStack(
          w.map(this, function (t, n) {
            return e.call(t, n, t);
          }),
        );
      },
      slice: function () {
        return this.pushStack(o.apply(this, arguments));
      },
      first: function () {
        return this.eq(0);
      },
      last: function () {
        return this.eq(-1);
      },
      eq: function (e) {
        var t = this.length,
          n = +e + (e < 0 ? t : 0);
        return this.pushStack(n >= 0 && n < t ? [this[n]] : []);
      },
      end: function () {
        return this.prevObject || this.constructor();
      },
      push: s,
      sort: n.sort,
      splice: n.splice,
    }),
    (w.extend = w.fn.extend =
      function () {
        var e,
          t,
          n,
          i,
          r,
          o,
          a = arguments[0] || {},
          s = 1,
          l = arguments.length,
          c = !1;
        for (
          'boolean' == typeof a && ((c = a), (a = arguments[s] || {}), s++),
            'object' == typeof a || m(a) || (a = {}),
            s === l && ((a = this), s--);
          s < l;
          s++
        )
          if (null != (e = arguments[s]))
            for (t in e)
              (n = a[t]),
                a !== (i = e[t]) &&
                  (c && i && (w.isPlainObject(i) || (r = Array.isArray(i)))
                    ? (r
                        ? ((r = !1), (o = n && Array.isArray(n) ? n : []))
                        : (o = n && w.isPlainObject(n) ? n : {}),
                      (a[t] = w.extend(c, o, i)))
                    : void 0 !== i && (a[t] = i));
        return a;
      }),
    w.extend({
      expando: 'jQuery' + ('3.3.1' + Math.random()).replace(/\D/g, ''),
      isReady: !0,
      error: function (e) {
        throw new Error(e);
      },
      noop: function () {},
      isPlainObject: function (e) {
        var t, n;
        return !(
          !e ||
          '[object Object]' !== d.call(e) ||
          ((t = r(e)) &&
            ('function' != typeof (n = u.call(t, 'constructor') && t.constructor) ||
              h.call(n) !== p))
        );
      },
      isEmptyObject: function (e) {
        var t;
        for (t in e) return !1;
        return !0;
      },
      globalEval: function (e) {
        y(e);
      },
      each: function (e, t) {
        var n,
          i = 0;
        if (C(e)) for (n = e.length; i < n && !1 !== t.call(e[i], i, e[i]); i++);
        else for (i in e) if (!1 === t.call(e[i], i, e[i])) break;
        return e;
      },
      trim: function (e) {
        return null == e ? '' : (e + '').replace(x, '');
      },
      makeArray: function (e, t) {
        var n = t || [];
        return (
          null != e && (C(Object(e)) ? w.merge(n, 'string' == typeof e ? [e] : e) : s.call(n, e)), n
        );
      },
      inArray: function (e, t, n) {
        return null == t ? -1 : l.call(t, e, n);
      },
      merge: function (e, t) {
        for (var n = +t.length, i = 0, r = e.length; i < n; i++) e[r++] = t[i];
        return (e.length = r), e;
      },
      grep: function (e, t, n) {
        for (var i = [], r = 0, o = e.length, a = !n; r < o; r++) !t(e[r], r) !== a && i.push(e[r]);
        return i;
      },
      map: function (e, t, n) {
        var i,
          r,
          o = 0,
          s = [];
        if (C(e)) for (i = e.length; o < i; o++) null != (r = t(e[o], o, n)) && s.push(r);
        else for (o in e) null != (r = t(e[o], o, n)) && s.push(r);
        return a.apply([], s);
      },
      guid: 1,
      support: f,
    }),
    'function' == typeof Symbol && (w.fn[Symbol.iterator] = n[Symbol.iterator]),
    w.each(
      'Boolean Number String Function Array Date RegExp Object Error Symbol'.split(' '),
      function (e, t) {
        c['[object ' + t + ']'] = t.toLowerCase();
      },
    );
  var F = (function (e) {
    var t,
      n,
      i,
      r,
      o,
      a,
      s,
      l,
      c,
      d,
      u,
      h,
      p,
      f,
      m,
      g,
      v,
      y,
      b,
      w = 'sizzle' + 1 * new Date(),
      x = e.document,
      C = 0,
      F = 0,
      S = ae(),
      k = ae(),
      E = ae(),
      T = function (e, t) {
        return e === t && (u = !0), 0;
      },
      _ = {}.hasOwnProperty,
      A = [],
      M = A.pop,
      L = A.push,
      N = A.push,
      D = A.slice,
      R = function (e, t) {
        for (var n = 0, i = e.length; n < i; n++) if (e[n] === t) return n;
        return -1;
      },
      B =
        'checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped',
      P = '[\\x20\\t\\r\\n\\f]',
      I = '(?:\\\\.|[\\w-]|[^\0-\\xa0])+',
      O =
        '\\[' +
        P +
        '*(' +
        I +
        ')(?:' +
        P +
        '*([*^$|!~]?=)' +
        P +
        '*(?:\'((?:\\\\.|[^\\\\\'])*)\'|"((?:\\\\.|[^\\\\"])*)"|(' +
        I +
        '))|)' +
        P +
        '*\\]',
      $ =
        ':(' +
        I +
        ')(?:\\(((\'((?:\\\\.|[^\\\\\'])*)\'|"((?:\\\\.|[^\\\\"])*)")|((?:\\\\.|[^\\\\()[\\]]|' +
        O +
        ')*)|.*)\\)|)',
      H = new RegExp(P + '+', 'g'),
      U = new RegExp('^' + P + '+|((?:^|[^\\\\])(?:\\\\.)*)' + P + '+$', 'g'),
      j = new RegExp('^' + P + '*,' + P + '*'),
      q = new RegExp('^' + P + '*([>+~]|' + P + ')' + P + '*'),
      W = new RegExp('=' + P + '*([^\\]\'"]*?)' + P + '*\\]', 'g'),
      z = new RegExp($),
      V = new RegExp('^' + I + '$'),
      J = {
        ID: new RegExp('^#(' + I + ')'),
        CLASS: new RegExp('^\\.(' + I + ')'),
        TAG: new RegExp('^(' + I + '|[*])'),
        ATTR: new RegExp('^' + O),
        PSEUDO: new RegExp('^' + $),
        CHILD: new RegExp(
          '^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(' +
            P +
            '*(even|odd|(([+-]|)(\\d*)n|)' +
            P +
            '*(?:([+-]|)' +
            P +
            '*(\\d+)|))' +
            P +
            '*\\)|)',
          'i',
        ),
        bool: new RegExp('^(?:' + B + ')$', 'i'),
        needsContext: new RegExp(
          '^' +
            P +
            '*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(' +
            P +
            '*((?:-\\d)?\\d*)' +
            P +
            '*\\)|)(?=[^-]|$)',
          'i',
        ),
      },
      K = /^(?:input|select|textarea|button)$/i,
      Y = /^h\d$/i,
      G = /^[^{]+\{\s*\[native \w/,
      Q = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,
      X = /[+~]/,
      Z = new RegExp('\\\\([\\da-f]{1,6}' + P + '?|(' + P + ')|.)', 'ig'),
      ee = function (e, t, n) {
        var i = '0x' + t - 65536;
        return i != i || n
          ? t
          : i < 0
            ? String.fromCharCode(i + 65536)
            : String.fromCharCode((i >> 10) | 55296, (1023 & i) | 56320);
      },
      te = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,
      ne = function (e, t) {
        return t
          ? '\0' === e
            ? '�'
            : e.slice(0, -1) + '\\' + e.charCodeAt(e.length - 1).toString(16) + ' '
          : '\\' + e;
      },
      ie = function () {
        h();
      },
      re = ye(
        function (e) {
          return !0 === e.disabled && ('form' in e || 'label' in e);
        },
        { dir: 'parentNode', next: 'legend' },
      );
    try {
      N.apply((A = D.call(x.childNodes)), x.childNodes), A[x.childNodes.length].nodeType;
    } catch (e) {
      N = {
        apply: A.length
          ? function (e, t) {
              L.apply(e, D.call(t));
            }
          : function (e, t) {
              for (var n = e.length, i = 0; (e[n++] = t[i++]); );
              e.length = n - 1;
            },
      };
    }
    function oe(e, t, i, r) {
      var o,
        s,
        c,
        d,
        u,
        f,
        v,
        y = t && t.ownerDocument,
        C = t ? t.nodeType : 9;
      if (((i = i || []), 'string' != typeof e || !e || (1 !== C && 9 !== C && 11 !== C))) return i;
      if (!r && ((t ? t.ownerDocument || t : x) !== p && h(t), (t = t || p), m)) {
        if (11 !== C && (u = Q.exec(e)))
          if ((o = u[1])) {
            if (9 === C) {
              if (!(c = t.getElementById(o))) return i;
              if (c.id === o) return i.push(c), i;
            } else if (y && (c = y.getElementById(o)) && b(t, c) && c.id === o) return i.push(c), i;
          } else {
            if (u[2]) return N.apply(i, t.getElementsByTagName(e)), i;
            if ((o = u[3]) && n.getElementsByClassName && t.getElementsByClassName)
              return N.apply(i, t.getElementsByClassName(o)), i;
          }
        if (n.qsa && !E[e + ' '] && (!g || !g.test(e))) {
          if (1 !== C) (y = t), (v = e);
          else if ('object' !== t.nodeName.toLowerCase()) {
            for (
              (d = t.getAttribute('id')) ? (d = d.replace(te, ne)) : t.setAttribute('id', (d = w)),
                s = (f = a(e)).length;
              s--;
            )
              f[s] = '#' + d + ' ' + ve(f[s]);
            (v = f.join(',')), (y = (X.test(e) && me(t.parentNode)) || t);
          }
          if (v)
            try {
              return N.apply(i, y.querySelectorAll(v)), i;
            } catch (e) {
            } finally {
              d === w && t.removeAttribute('id');
            }
        }
      }
      return l(e.replace(U, '$1'), t, i, r);
    }
    function ae() {
      var e = [];
      return function t(n, r) {
        return e.push(n + ' ') > i.cacheLength && delete t[e.shift()], (t[n + ' '] = r);
      };
    }
    function se(e) {
      return (e[w] = !0), e;
    }
    function le(e) {
      var t = p.createElement('fieldset');
      try {
        return !!e(t);
      } catch (e) {
        return !1;
      } finally {
        t.parentNode && t.parentNode.removeChild(t), (t = null);
      }
    }
    function ce(e, t) {
      for (var n = e.split('|'), r = n.length; r--; ) i.attrHandle[n[r]] = t;
    }
    function de(e, t) {
      var n = t && e,
        i = n && 1 === e.nodeType && 1 === t.nodeType && e.sourceIndex - t.sourceIndex;
      if (i) return i;
      if (n) for (; (n = n.nextSibling); ) if (n === t) return -1;
      return e ? 1 : -1;
    }
    function ue(e) {
      return function (t) {
        return 'input' === t.nodeName.toLowerCase() && t.type === e;
      };
    }
    function he(e) {
      return function (t) {
        var n = t.nodeName.toLowerCase();
        return ('input' === n || 'button' === n) && t.type === e;
      };
    }
    function pe(e) {
      return function (t) {
        return 'form' in t
          ? t.parentNode && !1 === t.disabled
            ? 'label' in t
              ? 'label' in t.parentNode
                ? t.parentNode.disabled === e
                : t.disabled === e
              : t.isDisabled === e || (t.isDisabled !== !e && re(t) === e)
            : t.disabled === e
          : 'label' in t && t.disabled === e;
      };
    }
    function fe(e) {
      return se(function (t) {
        return (
          (t = +t),
          se(function (n, i) {
            for (var r, o = e([], n.length, t), a = o.length; a--; )
              n[(r = o[a])] && (n[r] = !(i[r] = n[r]));
          })
        );
      });
    }
    function me(e) {
      return e && void 0 !== e.getElementsByTagName && e;
    }
    for (t in ((n = oe.support = {}),
    (o = oe.isXML =
      function (e) {
        var t = e && (e.ownerDocument || e).documentElement;
        return !!t && 'HTML' !== t.nodeName;
      }),
    (h = oe.setDocument =
      function (e) {
        var t,
          r,
          a = e ? e.ownerDocument || e : x;
        return a !== p && 9 === a.nodeType && a.documentElement
          ? ((f = (p = a).documentElement),
            (m = !o(p)),
            x !== p &&
              (r = p.defaultView) &&
              r.top !== r &&
              (r.addEventListener
                ? r.addEventListener('unload', ie, !1)
                : r.attachEvent && r.attachEvent('onunload', ie)),
            (n.attributes = le(function (e) {
              return (e.className = 'i'), !e.getAttribute('className');
            })),
            (n.getElementsByTagName = le(function (e) {
              return e.appendChild(p.createComment('')), !e.getElementsByTagName('*').length;
            })),
            (n.getElementsByClassName = G.test(p.getElementsByClassName)),
            (n.getById = le(function (e) {
              return (
                (f.appendChild(e).id = w), !p.getElementsByName || !p.getElementsByName(w).length
              );
            })),
            n.getById
              ? ((i.filter.ID = function (e) {
                  var t = e.replace(Z, ee);
                  return function (e) {
                    return e.getAttribute('id') === t;
                  };
                }),
                (i.find.ID = function (e, t) {
                  if (void 0 !== t.getElementById && m) {
                    var n = t.getElementById(e);
                    return n ? [n] : [];
                  }
                }))
              : ((i.filter.ID = function (e) {
                  var t = e.replace(Z, ee);
                  return function (e) {
                    var n = void 0 !== e.getAttributeNode && e.getAttributeNode('id');
                    return n && n.value === t;
                  };
                }),
                (i.find.ID = function (e, t) {
                  if (void 0 !== t.getElementById && m) {
                    var n,
                      i,
                      r,
                      o = t.getElementById(e);
                    if (o) {
                      if ((n = o.getAttributeNode('id')) && n.value === e) return [o];
                      for (r = t.getElementsByName(e), i = 0; (o = r[i++]); )
                        if ((n = o.getAttributeNode('id')) && n.value === e) return [o];
                    }
                    return [];
                  }
                })),
            (i.find.TAG = n.getElementsByTagName
              ? function (e, t) {
                  return void 0 !== t.getElementsByTagName
                    ? t.getElementsByTagName(e)
                    : n.qsa
                      ? t.querySelectorAll(e)
                      : void 0;
                }
              : function (e, t) {
                  var n,
                    i = [],
                    r = 0,
                    o = t.getElementsByTagName(e);
                  if ('*' === e) {
                    for (; (n = o[r++]); ) 1 === n.nodeType && i.push(n);
                    return i;
                  }
                  return o;
                }),
            (i.find.CLASS =
              n.getElementsByClassName &&
              function (e, t) {
                if (void 0 !== t.getElementsByClassName && m) return t.getElementsByClassName(e);
              }),
            (v = []),
            (g = []),
            (n.qsa = G.test(p.querySelectorAll)) &&
              (le(function (e) {
                (f.appendChild(e).innerHTML =
                  "<a id='" +
                  w +
                  "'></a><select id='" +
                  w +
                  "-\r\\' msallowcapture=''><option selected=''></option></select>"),
                  e.querySelectorAll("[msallowcapture^='']").length &&
                    g.push('[*^$]=' + P + '*(?:\'\'|"")'),
                  e.querySelectorAll('[selected]').length ||
                    g.push('\\[' + P + '*(?:value|' + B + ')'),
                  e.querySelectorAll('[id~=' + w + '-]').length || g.push('~='),
                  e.querySelectorAll(':checked').length || g.push(':checked'),
                  e.querySelectorAll('a#' + w + '+*').length || g.push('.#.+[+~]');
              }),
              le(function (e) {
                e.innerHTML =
                  "<a href='' disabled='disabled'></a><select disabled='disabled'><option/></select>";
                var t = p.createElement('input');
                t.setAttribute('type', 'hidden'),
                  e.appendChild(t).setAttribute('name', 'D'),
                  e.querySelectorAll('[name=d]').length && g.push('name' + P + '*[*^$|!~]?='),
                  2 !== e.querySelectorAll(':enabled').length && g.push(':enabled', ':disabled'),
                  (f.appendChild(e).disabled = !0),
                  2 !== e.querySelectorAll(':disabled').length && g.push(':enabled', ':disabled'),
                  e.querySelectorAll('*,:x'),
                  g.push(',.*:');
              })),
            (n.matchesSelector = G.test(
              (y =
                f.matches ||
                f.webkitMatchesSelector ||
                f.mozMatchesSelector ||
                f.oMatchesSelector ||
                f.msMatchesSelector),
            )) &&
              le(function (e) {
                (n.disconnectedMatch = y.call(e, '*')), y.call(e, "[s!='']:x"), v.push('!=', $);
              }),
            (g = g.length && new RegExp(g.join('|'))),
            (v = v.length && new RegExp(v.join('|'))),
            (t = G.test(f.compareDocumentPosition)),
            (b =
              t || G.test(f.contains)
                ? function (e, t) {
                    var n = 9 === e.nodeType ? e.documentElement : e,
                      i = t && t.parentNode;
                    return (
                      e === i ||
                      !(
                        !i ||
                        1 !== i.nodeType ||
                        !(n.contains
                          ? n.contains(i)
                          : e.compareDocumentPosition && 16 & e.compareDocumentPosition(i))
                      )
                    );
                  }
                : function (e, t) {
                    if (t) for (; (t = t.parentNode); ) if (t === e) return !0;
                    return !1;
                  }),
            (T = t
              ? function (e, t) {
                  if (e === t) return (u = !0), 0;
                  var i = !e.compareDocumentPosition - !t.compareDocumentPosition;
                  return (
                    i ||
                    (1 &
                      (i =
                        (e.ownerDocument || e) === (t.ownerDocument || t)
                          ? e.compareDocumentPosition(t)
                          : 1) ||
                    (!n.sortDetached && t.compareDocumentPosition(e) === i)
                      ? e === p || (e.ownerDocument === x && b(x, e))
                        ? -1
                        : t === p || (t.ownerDocument === x && b(x, t))
                          ? 1
                          : d
                            ? R(d, e) - R(d, t)
                            : 0
                      : 4 & i
                        ? -1
                        : 1)
                  );
                }
              : function (e, t) {
                  if (e === t) return (u = !0), 0;
                  var n,
                    i = 0,
                    r = e.parentNode,
                    o = t.parentNode,
                    a = [e],
                    s = [t];
                  if (!r || !o)
                    return e === p ? -1 : t === p ? 1 : r ? -1 : o ? 1 : d ? R(d, e) - R(d, t) : 0;
                  if (r === o) return de(e, t);
                  for (n = e; (n = n.parentNode); ) a.unshift(n);
                  for (n = t; (n = n.parentNode); ) s.unshift(n);
                  for (; a[i] === s[i]; ) i++;
                  return i ? de(a[i], s[i]) : a[i] === x ? -1 : s[i] === x ? 1 : 0;
                }),
            p)
          : p;
      }),
    (oe.matches = function (e, t) {
      return oe(e, null, null, t);
    }),
    (oe.matchesSelector = function (e, t) {
      if (
        ((e.ownerDocument || e) !== p && h(e),
        (t = t.replace(W, "='$1']")),
        n.matchesSelector && m && !E[t + ' '] && (!v || !v.test(t)) && (!g || !g.test(t)))
      )
        try {
          var i = y.call(e, t);
          if (i || n.disconnectedMatch || (e.document && 11 !== e.document.nodeType)) return i;
        } catch (e) {}
      return oe(t, p, null, [e]).length > 0;
    }),
    (oe.contains = function (e, t) {
      return (e.ownerDocument || e) !== p && h(e), b(e, t);
    }),
    (oe.attr = function (e, t) {
      (e.ownerDocument || e) !== p && h(e);
      var r = i.attrHandle[t.toLowerCase()],
        o = r && _.call(i.attrHandle, t.toLowerCase()) ? r(e, t, !m) : void 0;
      return void 0 !== o
        ? o
        : n.attributes || !m
          ? e.getAttribute(t)
          : (o = e.getAttributeNode(t)) && o.specified
            ? o.value
            : null;
    }),
    (oe.escape = function (e) {
      return (e + '').replace(te, ne);
    }),
    (oe.error = function (e) {
      throw new Error('Syntax error, unrecognized expression: ' + e);
    }),
    (oe.uniqueSort = function (e) {
      var t,
        i = [],
        r = 0,
        o = 0;
      if (((u = !n.detectDuplicates), (d = !n.sortStable && e.slice(0)), e.sort(T), u)) {
        for (; (t = e[o++]); ) t === e[o] && (r = i.push(o));
        for (; r--; ) e.splice(i[r], 1);
      }
      return (d = null), e;
    }),
    (r = oe.getText =
      function (e) {
        var t,
          n = '',
          i = 0,
          o = e.nodeType;
        if (o) {
          if (1 === o || 9 === o || 11 === o) {
            if ('string' == typeof e.textContent) return e.textContent;
            for (e = e.firstChild; e; e = e.nextSibling) n += r(e);
          } else if (3 === o || 4 === o) return e.nodeValue;
        } else for (; (t = e[i++]); ) n += r(t);
        return n;
      }),
    ((i = oe.selectors =
      {
        cacheLength: 50,
        createPseudo: se,
        match: J,
        attrHandle: {},
        find: {},
        relative: {
          '>': { dir: 'parentNode', first: !0 },
          ' ': { dir: 'parentNode' },
          '+': { dir: 'previousSibling', first: !0 },
          '~': { dir: 'previousSibling' },
        },
        preFilter: {
          ATTR: function (e) {
            return (
              (e[1] = e[1].replace(Z, ee)),
              (e[3] = (e[3] || e[4] || e[5] || '').replace(Z, ee)),
              '~=' === e[2] && (e[3] = ' ' + e[3] + ' '),
              e.slice(0, 4)
            );
          },
          CHILD: function (e) {
            return (
              (e[1] = e[1].toLowerCase()),
              'nth' === e[1].slice(0, 3)
                ? (e[3] || oe.error(e[0]),
                  (e[4] = +(e[4] ? e[5] + (e[6] || 1) : 2 * ('even' === e[3] || 'odd' === e[3]))),
                  (e[5] = +(e[7] + e[8] || 'odd' === e[3])))
                : e[3] && oe.error(e[0]),
              e
            );
          },
          PSEUDO: function (e) {
            var t,
              n = !e[6] && e[2];
            return J.CHILD.test(e[0])
              ? null
              : (e[3]
                  ? (e[2] = e[4] || e[5] || '')
                  : n &&
                    z.test(n) &&
                    (t = a(n, !0)) &&
                    (t = n.indexOf(')', n.length - t) - n.length) &&
                    ((e[0] = e[0].slice(0, t)), (e[2] = n.slice(0, t))),
                e.slice(0, 3));
          },
        },
        filter: {
          TAG: function (e) {
            var t = e.replace(Z, ee).toLowerCase();
            return '*' === e
              ? function () {
                  return !0;
                }
              : function (e) {
                  return e.nodeName && e.nodeName.toLowerCase() === t;
                };
          },
          CLASS: function (e) {
            var t = S[e + ' '];
            return (
              t ||
              ((t = new RegExp('(^|' + P + ')' + e + '(' + P + '|$)')) &&
                S(e, function (e) {
                  return t.test(
                    ('string' == typeof e.className && e.className) ||
                      (void 0 !== e.getAttribute && e.getAttribute('class')) ||
                      '',
                  );
                }))
            );
          },
          ATTR: function (e, t, n) {
            return function (i) {
              var r = oe.attr(i, e);
              return null == r
                ? '!=' === t
                : !t ||
                    ((r += ''),
                    '=' === t
                      ? r === n
                      : '!=' === t
                        ? r !== n
                        : '^=' === t
                          ? n && 0 === r.indexOf(n)
                          : '*=' === t
                            ? n && r.indexOf(n) > -1
                            : '$=' === t
                              ? n && r.slice(-n.length) === n
                              : '~=' === t
                                ? (' ' + r.replace(H, ' ') + ' ').indexOf(n) > -1
                                : '|=' === t && (r === n || r.slice(0, n.length + 1) === n + '-'));
            };
          },
          CHILD: function (e, t, n, i, r) {
            var o = 'nth' !== e.slice(0, 3),
              a = 'last' !== e.slice(-4),
              s = 'of-type' === t;
            return 1 === i && 0 === r
              ? function (e) {
                  return !!e.parentNode;
                }
              : function (t, n, l) {
                  var c,
                    d,
                    u,
                    h,
                    p,
                    f,
                    m = o !== a ? 'nextSibling' : 'previousSibling',
                    g = t.parentNode,
                    v = s && t.nodeName.toLowerCase(),
                    y = !l && !s,
                    b = !1;
                  if (g) {
                    if (o) {
                      for (; m; ) {
                        for (h = t; (h = h[m]); )
                          if (s ? h.nodeName.toLowerCase() === v : 1 === h.nodeType) return !1;
                        f = m = 'only' === e && !f && 'nextSibling';
                      }
                      return !0;
                    }
                    if (((f = [a ? g.firstChild : g.lastChild]), a && y)) {
                      for (
                        b =
                          (p =
                            (c =
                              (d =
                                (u = (h = g)[w] || (h[w] = {}))[h.uniqueID] ||
                                (u[h.uniqueID] = {}))[e] || [])[0] === C && c[1]) && c[2],
                          h = p && g.childNodes[p];
                        (h = (++p && h && h[m]) || (b = p = 0) || f.pop());
                      )
                        if (1 === h.nodeType && ++b && h === t) {
                          d[e] = [C, p, b];
                          break;
                        }
                    } else if (
                      (y &&
                        (b = p =
                          (c =
                            (d =
                              (u = (h = t)[w] || (h[w] = {}))[h.uniqueID] || (u[h.uniqueID] = {}))[
                              e
                            ] || [])[0] === C && c[1]),
                      !1 === b)
                    )
                      for (
                        ;
                        (h = (++p && h && h[m]) || (b = p = 0) || f.pop()) &&
                        ((s ? h.nodeName.toLowerCase() !== v : 1 !== h.nodeType) ||
                          !++b ||
                          (y &&
                            ((d = (u = h[w] || (h[w] = {}))[h.uniqueID] || (u[h.uniqueID] = {}))[
                              e
                            ] = [C, b]),
                          h !== t));
                      );
                    return (b -= r) === i || (b % i == 0 && b / i >= 0);
                  }
                };
          },
          PSEUDO: function (e, t) {
            var n,
              r =
                i.pseudos[e] ||
                i.setFilters[e.toLowerCase()] ||
                oe.error('unsupported pseudo: ' + e);
            return r[w]
              ? r(t)
              : r.length > 1
                ? ((n = [e, e, '', t]),
                  i.setFilters.hasOwnProperty(e.toLowerCase())
                    ? se(function (e, n) {
                        for (var i, o = r(e, t), a = o.length; a--; )
                          e[(i = R(e, o[a]))] = !(n[i] = o[a]);
                      })
                    : function (e) {
                        return r(e, 0, n);
                      })
                : r;
          },
        },
        pseudos: {
          not: se(function (e) {
            var t = [],
              n = [],
              i = s(e.replace(U, '$1'));
            return i[w]
              ? se(function (e, t, n, r) {
                  for (var o, a = i(e, null, r, []), s = e.length; s--; )
                    (o = a[s]) && (e[s] = !(t[s] = o));
                })
              : function (e, r, o) {
                  return (t[0] = e), i(t, null, o, n), (t[0] = null), !n.pop();
                };
          }),
          has: se(function (e) {
            return function (t) {
              return oe(e, t).length > 0;
            };
          }),
          contains: se(function (e) {
            return (
              (e = e.replace(Z, ee)),
              function (t) {
                return (t.textContent || t.innerText || r(t)).indexOf(e) > -1;
              }
            );
          }),
          lang: se(function (e) {
            return (
              V.test(e || '') || oe.error('unsupported lang: ' + e),
              (e = e.replace(Z, ee).toLowerCase()),
              function (t) {
                var n;
                do {
                  if ((n = m ? t.lang : t.getAttribute('xml:lang') || t.getAttribute('lang')))
                    return (n = n.toLowerCase()) === e || 0 === n.indexOf(e + '-');
                } while ((t = t.parentNode) && 1 === t.nodeType);
                return !1;
              }
            );
          }),
          target: function (t) {
            var n = e.location && e.location.hash;
            return n && n.slice(1) === t.id;
          },
          root: function (e) {
            return e === f;
          },
          focus: function (e) {
            return (
              e === p.activeElement &&
              (!p.hasFocus || p.hasFocus()) &&
              !!(e.type || e.href || ~e.tabIndex)
            );
          },
          enabled: pe(!1),
          disabled: pe(!0),
          checked: function (e) {
            var t = e.nodeName.toLowerCase();
            return ('input' === t && !!e.checked) || ('option' === t && !!e.selected);
          },
          selected: function (e) {
            return e.parentNode && e.parentNode.selectedIndex, !0 === e.selected;
          },
          empty: function (e) {
            for (e = e.firstChild; e; e = e.nextSibling) if (e.nodeType < 6) return !1;
            return !0;
          },
          parent: function (e) {
            return !i.pseudos.empty(e);
          },
          header: function (e) {
            return Y.test(e.nodeName);
          },
          input: function (e) {
            return K.test(e.nodeName);
          },
          button: function (e) {
            var t = e.nodeName.toLowerCase();
            return ('input' === t && 'button' === e.type) || 'button' === t;
          },
          text: function (e) {
            var t;
            return (
              'input' === e.nodeName.toLowerCase() &&
              'text' === e.type &&
              (null == (t = e.getAttribute('type')) || 'text' === t.toLowerCase())
            );
          },
          first: fe(function () {
            return [0];
          }),
          last: fe(function (e, t) {
            return [t - 1];
          }),
          eq: fe(function (e, t, n) {
            return [n < 0 ? n + t : n];
          }),
          even: fe(function (e, t) {
            for (var n = 0; n < t; n += 2) e.push(n);
            return e;
          }),
          odd: fe(function (e, t) {
            for (var n = 1; n < t; n += 2) e.push(n);
            return e;
          }),
          lt: fe(function (e, t, n) {
            for (var i = n < 0 ? n + t : n; --i >= 0; ) e.push(i);
            return e;
          }),
          gt: fe(function (e, t, n) {
            for (var i = n < 0 ? n + t : n; ++i < t; ) e.push(i);
            return e;
          }),
        },
      }).pseudos.nth = i.pseudos.eq),
    { radio: !0, checkbox: !0, file: !0, password: !0, image: !0 }))
      i.pseudos[t] = ue(t);
    for (t in { submit: !0, reset: !0 }) i.pseudos[t] = he(t);
    function ge() {}
    function ve(e) {
      for (var t = 0, n = e.length, i = ''; t < n; t++) i += e[t].value;
      return i;
    }
    function ye(e, t, n) {
      var i = t.dir,
        r = t.next,
        o = r || i,
        a = n && 'parentNode' === o,
        s = F++;
      return t.first
        ? function (t, n, r) {
            for (; (t = t[i]); ) if (1 === t.nodeType || a) return e(t, n, r);
            return !1;
          }
        : function (t, n, l) {
            var c,
              d,
              u,
              h = [C, s];
            if (l) {
              for (; (t = t[i]); ) if ((1 === t.nodeType || a) && e(t, n, l)) return !0;
            } else
              for (; (t = t[i]); )
                if (1 === t.nodeType || a)
                  if (
                    ((d = (u = t[w] || (t[w] = {}))[t.uniqueID] || (u[t.uniqueID] = {})),
                    r && r === t.nodeName.toLowerCase())
                  )
                    t = t[i] || t;
                  else {
                    if ((c = d[o]) && c[0] === C && c[1] === s) return (h[2] = c[2]);
                    if (((d[o] = h), (h[2] = e(t, n, l)))) return !0;
                  }
            return !1;
          };
    }
    function be(e) {
      return e.length > 1
        ? function (t, n, i) {
            for (var r = e.length; r--; ) if (!e[r](t, n, i)) return !1;
            return !0;
          }
        : e[0];
    }
    function we(e, t, n, i, r) {
      for (var o, a = [], s = 0, l = e.length, c = null != t; s < l; s++)
        (o = e[s]) && ((n && !n(o, i, r)) || (a.push(o), c && t.push(s)));
      return a;
    }
    function xe(e, t, n, i, r, o) {
      return (
        i && !i[w] && (i = xe(i)),
        r && !r[w] && (r = xe(r, o)),
        se(function (o, a, s, l) {
          var c,
            d,
            u,
            h = [],
            p = [],
            f = a.length,
            m =
              o ||
              (function (e, t, n) {
                for (var i = 0, r = t.length; i < r; i++) oe(e, t[i], n);
                return n;
              })(t || '*', s.nodeType ? [s] : s, []),
            g = !e || (!o && t) ? m : we(m, h, e, s, l),
            v = n ? (r || (o ? e : f || i) ? [] : a) : g;
          if ((n && n(g, v, s, l), i))
            for (c = we(v, p), i(c, [], s, l), d = c.length; d--; )
              (u = c[d]) && (v[p[d]] = !(g[p[d]] = u));
          if (o) {
            if (r || e) {
              if (r) {
                for (c = [], d = v.length; d--; ) (u = v[d]) && c.push((g[d] = u));
                r(null, (v = []), c, l);
              }
              for (d = v.length; d--; )
                (u = v[d]) && (c = r ? R(o, u) : h[d]) > -1 && (o[c] = !(a[c] = u));
            }
          } else
            (v = we(v === a ? v.splice(f, v.length) : v)), r ? r(null, a, v, l) : N.apply(a, v);
        })
      );
    }
    function Ce(e) {
      for (
        var t,
          n,
          r,
          o = e.length,
          a = i.relative[e[0].type],
          s = a || i.relative[' '],
          l = a ? 1 : 0,
          d = ye(
            function (e) {
              return e === t;
            },
            s,
            !0,
          ),
          u = ye(
            function (e) {
              return R(t, e) > -1;
            },
            s,
            !0,
          ),
          h = [
            function (e, n, i) {
              var r = (!a && (i || n !== c)) || ((t = n).nodeType ? d(e, n, i) : u(e, n, i));
              return (t = null), r;
            },
          ];
        l < o;
        l++
      )
        if ((n = i.relative[e[l].type])) h = [ye(be(h), n)];
        else {
          if ((n = i.filter[e[l].type].apply(null, e[l].matches))[w]) {
            for (r = ++l; r < o && !i.relative[e[r].type]; r++);
            return xe(
              l > 1 && be(h),
              l > 1 &&
                ve(e.slice(0, l - 1).concat({ value: ' ' === e[l - 2].type ? '*' : '' })).replace(
                  U,
                  '$1',
                ),
              n,
              l < r && Ce(e.slice(l, r)),
              r < o && Ce((e = e.slice(r))),
              r < o && ve(e),
            );
          }
          h.push(n);
        }
      return be(h);
    }
    function Fe(e, t) {
      var n = t.length > 0,
        r = e.length > 0,
        o = function (o, a, s, l, d) {
          var u,
            f,
            g,
            v = 0,
            y = '0',
            b = o && [],
            w = [],
            x = c,
            F = o || (r && i.find.TAG('*', d)),
            S = (C += null == x ? 1 : Math.random() || 0.1),
            k = F.length;
          for (d && (c = a === p || a || d); y !== k && null != (u = F[y]); y++) {
            if (r && u) {
              for (f = 0, a || u.ownerDocument === p || (h(u), (s = !m)); (g = e[f++]); )
                if (g(u, a || p, s)) {
                  l.push(u);
                  break;
                }
              d && (C = S);
            }
            n && ((u = !g && u) && v--, o && b.push(u));
          }
          if (((v += y), n && y !== v)) {
            for (f = 0; (g = t[f++]); ) g(b, w, a, s);
            if (o) {
              if (v > 0) for (; y--; ) b[y] || w[y] || (w[y] = M.call(l));
              w = we(w);
            }
            N.apply(l, w), d && !o && w.length > 0 && v + t.length > 1 && oe.uniqueSort(l);
          }
          return d && ((C = S), (c = x)), b;
        };
      return n ? se(o) : o;
    }
    return (
      (ge.prototype = i.filters = i.pseudos),
      (i.setFilters = new ge()),
      (a = oe.tokenize =
        function (e, t) {
          var n,
            r,
            o,
            a,
            s,
            l,
            c,
            d = k[e + ' '];
          if (d) return t ? 0 : d.slice(0);
          for (s = e, l = [], c = i.preFilter; s; ) {
            for (a in ((n && !(r = j.exec(s))) ||
              (r && (s = s.slice(r[0].length) || s), l.push((o = []))),
            (n = !1),
            (r = q.exec(s)) &&
              ((n = r.shift()),
              o.push({ value: n, type: r[0].replace(U, ' ') }),
              (s = s.slice(n.length))),
            i.filter))
              !(r = J[a].exec(s)) ||
                (c[a] && !(r = c[a](r))) ||
                ((n = r.shift()),
                o.push({ value: n, type: a, matches: r }),
                (s = s.slice(n.length)));
            if (!n) break;
          }
          return t ? s.length : s ? oe.error(e) : k(e, l).slice(0);
        }),
      (s = oe.compile =
        function (e, t) {
          var n,
            i = [],
            r = [],
            o = E[e + ' '];
          if (!o) {
            for (t || (t = a(e)), n = t.length; n--; ) (o = Ce(t[n]))[w] ? i.push(o) : r.push(o);
            (o = E(e, Fe(r, i))).selector = e;
          }
          return o;
        }),
      (l = oe.select =
        function (e, t, n, r) {
          var o,
            l,
            c,
            d,
            u,
            h = 'function' == typeof e && e,
            p = !r && a((e = h.selector || e));
          if (((n = n || []), 1 === p.length)) {
            if (
              (l = p[0] = p[0].slice(0)).length > 2 &&
              'ID' === (c = l[0]).type &&
              9 === t.nodeType &&
              m &&
              i.relative[l[1].type]
            ) {
              if (!(t = (i.find.ID(c.matches[0].replace(Z, ee), t) || [])[0])) return n;
              h && (t = t.parentNode), (e = e.slice(l.shift().value.length));
            }
            for (
              o = J.needsContext.test(e) ? 0 : l.length;
              o-- && ((c = l[o]), !i.relative[(d = c.type)]);
            )
              if (
                (u = i.find[d]) &&
                (r = u(c.matches[0].replace(Z, ee), (X.test(l[0].type) && me(t.parentNode)) || t))
              ) {
                if ((l.splice(o, 1), !(e = r.length && ve(l)))) return N.apply(n, r), n;
                break;
              }
          }
          return (h || s(e, p))(r, t, !m, n, !t || (X.test(e) && me(t.parentNode)) || t), n;
        }),
      (n.sortStable = w.split('').sort(T).join('') === w),
      (n.detectDuplicates = !!u),
      h(),
      (n.sortDetached = le(function (e) {
        return 1 & e.compareDocumentPosition(p.createElement('fieldset'));
      })),
      le(function (e) {
        return (e.innerHTML = "<a href='#'></a>"), '#' === e.firstChild.getAttribute('href');
      }) ||
        ce('type|href|height|width', function (e, t, n) {
          if (!n) return e.getAttribute(t, 'type' === t.toLowerCase() ? 1 : 2);
        }),
      (n.attributes &&
        le(function (e) {
          return (
            (e.innerHTML = '<input/>'),
            e.firstChild.setAttribute('value', ''),
            '' === e.firstChild.getAttribute('value')
          );
        })) ||
        ce('value', function (e, t, n) {
          if (!n && 'input' === e.nodeName.toLowerCase()) return e.defaultValue;
        }),
      le(function (e) {
        return null == e.getAttribute('disabled');
      }) ||
        ce(B, function (e, t, n) {
          var i;
          if (!n)
            return !0 === e[t]
              ? t.toLowerCase()
              : (i = e.getAttributeNode(t)) && i.specified
                ? i.value
                : null;
        }),
      oe
    );
  })(e);
  (w.find = F),
    (w.expr = F.selectors),
    (w.expr[':'] = w.expr.pseudos),
    (w.uniqueSort = w.unique = F.uniqueSort),
    (w.text = F.getText),
    (w.isXMLDoc = F.isXML),
    (w.contains = F.contains),
    (w.escapeSelector = F.escape);
  var S = function (e, t, n) {
      for (var i = [], r = void 0 !== n; (e = e[t]) && 9 !== e.nodeType; )
        if (1 === e.nodeType) {
          if (r && w(e).is(n)) break;
          i.push(e);
        }
      return i;
    },
    k = function (e, t) {
      for (var n = []; e; e = e.nextSibling) 1 === e.nodeType && e !== t && n.push(e);
      return n;
    },
    E = w.expr.match.needsContext;
  function T(e, t) {
    return e.nodeName && e.nodeName.toLowerCase() === t.toLowerCase();
  }
  var _ = /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;
  function A(e, t, n) {
    return m(t)
      ? w.grep(e, function (e, i) {
          return !!t.call(e, i, e) !== n;
        })
      : t.nodeType
        ? w.grep(e, function (e) {
            return (e === t) !== n;
          })
        : 'string' != typeof t
          ? w.grep(e, function (e) {
              return l.call(t, e) > -1 !== n;
            })
          : w.filter(t, e, n);
  }
  (w.filter = function (e, t, n) {
    var i = t[0];
    return (
      n && (e = ':not(' + e + ')'),
      1 === t.length && 1 === i.nodeType
        ? w.find.matchesSelector(i, e)
          ? [i]
          : []
        : w.find.matches(
            e,
            w.grep(t, function (e) {
              return 1 === e.nodeType;
            }),
          )
    );
  }),
    w.fn.extend({
      find: function (e) {
        var t,
          n,
          i = this.length,
          r = this;
        if ('string' != typeof e)
          return this.pushStack(
            w(e).filter(function () {
              for (t = 0; t < i; t++) if (w.contains(r[t], this)) return !0;
            }),
          );
        for (n = this.pushStack([]), t = 0; t < i; t++) w.find(e, r[t], n);
        return i > 1 ? w.uniqueSort(n) : n;
      },
      filter: function (e) {
        return this.pushStack(A(this, e || [], !1));
      },
      not: function (e) {
        return this.pushStack(A(this, e || [], !0));
      },
      is: function (e) {
        return !!A(this, 'string' == typeof e && E.test(e) ? w(e) : e || [], !1).length;
      },
    });
  var M,
    L = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;
  ((w.fn.init = function (e, t, n) {
    var r, o;
    if (!e) return this;
    if (((n = n || M), 'string' == typeof e)) {
      if (
        !(r =
          '<' === e[0] && '>' === e[e.length - 1] && e.length >= 3 ? [null, e, null] : L.exec(e)) ||
        (!r[1] && t)
      )
        return !t || t.jquery ? (t || n).find(e) : this.constructor(t).find(e);
      if (r[1]) {
        if (
          ((t = t instanceof w ? t[0] : t),
          w.merge(this, w.parseHTML(r[1], t && t.nodeType ? t.ownerDocument || t : i, !0)),
          _.test(r[1]) && w.isPlainObject(t))
        )
          for (r in t) m(this[r]) ? this[r](t[r]) : this.attr(r, t[r]);
        return this;
      }
      return (o = i.getElementById(r[2])) && ((this[0] = o), (this.length = 1)), this;
    }
    return e.nodeType
      ? ((this[0] = e), (this.length = 1), this)
      : m(e)
        ? void 0 !== n.ready
          ? n.ready(e)
          : e(w)
        : w.makeArray(e, this);
  }).prototype = w.fn),
    (M = w(i));
  var N = /^(?:parents|prev(?:Until|All))/,
    D = { children: !0, contents: !0, next: !0, prev: !0 };
  function R(e, t) {
    for (; (e = e[t]) && 1 !== e.nodeType; );
    return e;
  }
  w.fn.extend({
    has: function (e) {
      var t = w(e, this),
        n = t.length;
      return this.filter(function () {
        for (var e = 0; e < n; e++) if (w.contains(this, t[e])) return !0;
      });
    },
    closest: function (e, t) {
      var n,
        i = 0,
        r = this.length,
        o = [],
        a = 'string' != typeof e && w(e);
      if (!E.test(e))
        for (; i < r; i++)
          for (n = this[i]; n && n !== t; n = n.parentNode)
            if (
              n.nodeType < 11 &&
              (a ? a.index(n) > -1 : 1 === n.nodeType && w.find.matchesSelector(n, e))
            ) {
              o.push(n);
              break;
            }
      return this.pushStack(o.length > 1 ? w.uniqueSort(o) : o);
    },
    index: function (e) {
      return e
        ? 'string' == typeof e
          ? l.call(w(e), this[0])
          : l.call(this, e.jquery ? e[0] : e)
        : this[0] && this[0].parentNode
          ? this.first().prevAll().length
          : -1;
    },
    add: function (e, t) {
      return this.pushStack(w.uniqueSort(w.merge(this.get(), w(e, t))));
    },
    addBack: function (e) {
      return this.add(null == e ? this.prevObject : this.prevObject.filter(e));
    },
  }),
    w.each(
      {
        parent: function (e) {
          var t = e.parentNode;
          return t && 11 !== t.nodeType ? t : null;
        },
        parents: function (e) {
          return S(e, 'parentNode');
        },
        parentsUntil: function (e, t, n) {
          return S(e, 'parentNode', n);
        },
        next: function (e) {
          return R(e, 'nextSibling');
        },
        prev: function (e) {
          return R(e, 'previousSibling');
        },
        nextAll: function (e) {
          return S(e, 'nextSibling');
        },
        prevAll: function (e) {
          return S(e, 'previousSibling');
        },
        nextUntil: function (e, t, n) {
          return S(e, 'nextSibling', n);
        },
        prevUntil: function (e, t, n) {
          return S(e, 'previousSibling', n);
        },
        siblings: function (e) {
          return k((e.parentNode || {}).firstChild, e);
        },
        children: function (e) {
          return k(e.firstChild);
        },
        contents: function (e) {
          return T(e, 'iframe')
            ? e.contentDocument
            : (T(e, 'template') && (e = e.content || e), w.merge([], e.childNodes));
        },
      },
      function (e, t) {
        w.fn[e] = function (n, i) {
          var r = w.map(this, t, n);
          return (
            'Until' !== e.slice(-5) && (i = n),
            i && 'string' == typeof i && (r = w.filter(i, r)),
            this.length > 1 && (D[e] || w.uniqueSort(r), N.test(e) && r.reverse()),
            this.pushStack(r)
          );
        };
      },
    );
  var B = /[^\x20\t\r\n\f]+/g;
  function P(e) {
    return e;
  }
  function I(e) {
    throw e;
  }
  function O(e, t, n, i) {
    var r;
    try {
      e && m((r = e.promise))
        ? r.call(e).done(t).fail(n)
        : e && m((r = e.then))
          ? r.call(e, t, n)
          : t.apply(void 0, [e].slice(i));
    } catch (e) {
      n.apply(void 0, [e]);
    }
  }
  (w.Callbacks = function (e) {
    e =
      'string' == typeof e
        ? (function (e) {
            var t = {};
            return (
              w.each(e.match(B) || [], function (e, n) {
                t[n] = !0;
              }),
              t
            );
          })(e)
        : w.extend({}, e);
    var t,
      n,
      i,
      r,
      o = [],
      a = [],
      s = -1,
      l = function () {
        for (r = r || e.once, i = t = !0; a.length; s = -1)
          for (n = a.shift(); ++s < o.length; )
            !1 === o[s].apply(n[0], n[1]) && e.stopOnFalse && ((s = o.length), (n = !1));
        e.memory || (n = !1), (t = !1), r && (o = n ? [] : '');
      },
      c = {
        add: function () {
          return (
            o &&
              (n && !t && ((s = o.length - 1), a.push(n)),
              (function t(n) {
                w.each(n, function (n, i) {
                  m(i)
                    ? (e.unique && c.has(i)) || o.push(i)
                    : i && i.length && 'string' !== b(i) && t(i);
                });
              })(arguments),
              n && !t && l()),
            this
          );
        },
        remove: function () {
          return (
            w.each(arguments, function (e, t) {
              for (var n; (n = w.inArray(t, o, n)) > -1; ) o.splice(n, 1), n <= s && s--;
            }),
            this
          );
        },
        has: function (e) {
          return e ? w.inArray(e, o) > -1 : o.length > 0;
        },
        empty: function () {
          return o && (o = []), this;
        },
        disable: function () {
          return (r = a = []), (o = n = ''), this;
        },
        disabled: function () {
          return !o;
        },
        lock: function () {
          return (r = a = []), n || t || (o = n = ''), this;
        },
        locked: function () {
          return !!r;
        },
        fireWith: function (e, n) {
          return r || ((n = [e, (n = n || []).slice ? n.slice() : n]), a.push(n), t || l()), this;
        },
        fire: function () {
          return c.fireWith(this, arguments), this;
        },
        fired: function () {
          return !!i;
        },
      };
    return c;
  }),
    w.extend({
      Deferred: function (t) {
        var n = [
            ['notify', 'progress', w.Callbacks('memory'), w.Callbacks('memory'), 2],
            [
              'resolve',
              'done',
              w.Callbacks('once memory'),
              w.Callbacks('once memory'),
              0,
              'resolved',
            ],
            [
              'reject',
              'fail',
              w.Callbacks('once memory'),
              w.Callbacks('once memory'),
              1,
              'rejected',
            ],
          ],
          i = 'pending',
          r = {
            state: function () {
              return i;
            },
            always: function () {
              return o.done(arguments).fail(arguments), this;
            },
            catch: function (e) {
              return r.then(null, e);
            },
            pipe: function () {
              var e = arguments;
              return w
                .Deferred(function (t) {
                  w.each(n, function (n, i) {
                    var r = m(e[i[4]]) && e[i[4]];
                    o[i[1]](function () {
                      var e = r && r.apply(this, arguments);
                      e && m(e.promise)
                        ? e.promise().progress(t.notify).done(t.resolve).fail(t.reject)
                        : t[i[0] + 'With'](this, r ? [e] : arguments);
                    });
                  }),
                    (e = null);
                })
                .promise();
            },
            then: function (t, i, r) {
              var o = 0;
              function a(t, n, i, r) {
                return function () {
                  var s = this,
                    l = arguments,
                    c = function () {
                      var e, c;
                      if (!(t < o)) {
                        if ((e = i.apply(s, l)) === n.promise())
                          throw new TypeError('Thenable self-resolution');
                        (c = e && ('object' == typeof e || 'function' == typeof e) && e.then),
                          m(c)
                            ? r
                              ? c.call(e, a(o, n, P, r), a(o, n, I, r))
                              : (o++,
                                c.call(e, a(o, n, P, r), a(o, n, I, r), a(o, n, P, n.notifyWith)))
                            : (i !== P && ((s = void 0), (l = [e])), (r || n.resolveWith)(s, l));
                      }
                    },
                    d = r
                      ? c
                      : function () {
                          try {
                            c();
                          } catch (e) {
                            w.Deferred.exceptionHook && w.Deferred.exceptionHook(e, d.stackTrace),
                              t + 1 >= o &&
                                (i !== I && ((s = void 0), (l = [e])), n.rejectWith(s, l));
                          }
                        };
                  t
                    ? d()
                    : (w.Deferred.getStackHook && (d.stackTrace = w.Deferred.getStackHook()),
                      e.setTimeout(d));
                };
              }
              return w
                .Deferred(function (e) {
                  n[0][3].add(a(0, e, m(r) ? r : P, e.notifyWith)),
                    n[1][3].add(a(0, e, m(t) ? t : P)),
                    n[2][3].add(a(0, e, m(i) ? i : I));
                })
                .promise();
            },
            promise: function (e) {
              return null != e ? w.extend(e, r) : r;
            },
          },
          o = {};
        return (
          w.each(n, function (e, t) {
            var a = t[2],
              s = t[5];
            (r[t[1]] = a.add),
              s &&
                a.add(
                  function () {
                    i = s;
                  },
                  n[3 - e][2].disable,
                  n[3 - e][3].disable,
                  n[0][2].lock,
                  n[0][3].lock,
                ),
              a.add(t[3].fire),
              (o[t[0]] = function () {
                return o[t[0] + 'With'](this === o ? void 0 : this, arguments), this;
              }),
              (o[t[0] + 'With'] = a.fireWith);
          }),
          r.promise(o),
          t && t.call(o, o),
          o
        );
      },
      when: function (e) {
        var t = arguments.length,
          n = t,
          i = Array(n),
          r = o.call(arguments),
          a = w.Deferred(),
          s = function (e) {
            return function (n) {
              (i[e] = this),
                (r[e] = arguments.length > 1 ? o.call(arguments) : n),
                --t || a.resolveWith(i, r);
            };
          };
        if (
          t <= 1 &&
          (O(e, a.done(s(n)).resolve, a.reject, !t),
          'pending' === a.state() || m(r[n] && r[n].then))
        )
          return a.then();
        for (; n--; ) O(r[n], s(n), a.reject);
        return a.promise();
      },
    });
  var $ = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;
  (w.Deferred.exceptionHook = function (t, n) {
    e.console &&
      e.console.warn &&
      t &&
      $.test(t.name) &&
      e.console.warn('jQuery.Deferred exception: ' + t.message, t.stack, n);
  }),
    (w.readyException = function (t) {
      e.setTimeout(function () {
        throw t;
      });
    });
  var H = w.Deferred();
  function U() {
    i.removeEventListener('DOMContentLoaded', U), e.removeEventListener('load', U), w.ready();
  }
  (w.fn.ready = function (e) {
    return (
      H.then(e).catch(function (e) {
        w.readyException(e);
      }),
      this
    );
  }),
    w.extend({
      isReady: !1,
      readyWait: 1,
      ready: function (e) {
        (!0 === e ? --w.readyWait : w.isReady) ||
          ((w.isReady = !0), (!0 !== e && --w.readyWait > 0) || H.resolveWith(i, [w]));
      },
    }),
    (w.ready.then = H.then),
    'complete' === i.readyState || ('loading' !== i.readyState && !i.documentElement.doScroll)
      ? e.setTimeout(w.ready)
      : (i.addEventListener('DOMContentLoaded', U), e.addEventListener('load', U));
  var j = function (e, t, n, i, r, o, a) {
      var s = 0,
        l = e.length,
        c = null == n;
      if ('object' === b(n)) for (s in ((r = !0), n)) j(e, t, s, n[s], !0, o, a);
      else if (
        void 0 !== i &&
        ((r = !0),
        m(i) || (a = !0),
        c &&
          (a
            ? (t.call(e, i), (t = null))
            : ((c = t),
              (t = function (e, t, n) {
                return c.call(w(e), n);
              }))),
        t)
      )
        for (; s < l; s++) t(e[s], n, a ? i : i.call(e[s], s, t(e[s], n)));
      return r ? e : c ? t.call(e) : l ? t(e[0], n) : o;
    },
    q = /^-ms-/,
    W = /-([a-z])/g;
  function z(e, t) {
    return t.toUpperCase();
  }
  function V(e) {
    return e.replace(q, 'ms-').replace(W, z);
  }
  var J = function (e) {
    return 1 === e.nodeType || 9 === e.nodeType || !+e.nodeType;
  };
  function K() {
    this.expando = w.expando + K.uid++;
  }
  (K.uid = 1),
    (K.prototype = {
      cache: function (e) {
        var t = e[this.expando];
        return (
          t ||
            ((t = {}),
            J(e) &&
              (e.nodeType
                ? (e[this.expando] = t)
                : Object.defineProperty(e, this.expando, { value: t, configurable: !0 }))),
          t
        );
      },
      set: function (e, t, n) {
        var i,
          r = this.cache(e);
        if ('string' == typeof t) r[V(t)] = n;
        else for (i in t) r[V(i)] = t[i];
        return r;
      },
      get: function (e, t) {
        return void 0 === t ? this.cache(e) : e[this.expando] && e[this.expando][V(t)];
      },
      access: function (e, t, n) {
        return void 0 === t || (t && 'string' == typeof t && void 0 === n)
          ? this.get(e, t)
          : (this.set(e, t, n), void 0 !== n ? n : t);
      },
      remove: function (e, t) {
        var n,
          i = e[this.expando];
        if (void 0 !== i) {
          if (void 0 !== t) {
            n = (t = Array.isArray(t) ? t.map(V) : (t = V(t)) in i ? [t] : t.match(B) || []).length;
            for (; n--; ) delete i[t[n]];
          }
          (void 0 === t || w.isEmptyObject(i)) &&
            (e.nodeType ? (e[this.expando] = void 0) : delete e[this.expando]);
        }
      },
      hasData: function (e) {
        var t = e[this.expando];
        return void 0 !== t && !w.isEmptyObject(t);
      },
    });
  var Y = new K(),
    G = new K(),
    Q = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
    X = /[A-Z]/g;
  function Z(e, t, n) {
    var i;
    if (void 0 === n && 1 === e.nodeType)
      if (
        ((i = 'data-' + t.replace(X, '-$&').toLowerCase()),
        'string' == typeof (n = e.getAttribute(i)))
      ) {
        try {
          n = (function (e) {
            return (
              'true' === e ||
              ('false' !== e &&
                ('null' === e ? null : e === +e + '' ? +e : Q.test(e) ? JSON.parse(e) : e))
            );
          })(n);
        } catch (e) {}
        G.set(e, t, n);
      } else n = void 0;
    return n;
  }
  w.extend({
    hasData: function (e) {
      return G.hasData(e) || Y.hasData(e);
    },
    data: function (e, t, n) {
      return G.access(e, t, n);
    },
    removeData: function (e, t) {
      G.remove(e, t);
    },
    _data: function (e, t, n) {
      return Y.access(e, t, n);
    },
    _removeData: function (e, t) {
      Y.remove(e, t);
    },
  }),
    w.fn.extend({
      data: function (e, t) {
        var n,
          i,
          r,
          o = this[0],
          a = o && o.attributes;
        if (void 0 === e) {
          if (this.length && ((r = G.get(o)), 1 === o.nodeType && !Y.get(o, 'hasDataAttrs'))) {
            for (n = a.length; n--; )
              a[n] &&
                0 === (i = a[n].name).indexOf('data-') &&
                ((i = V(i.slice(5))), Z(o, i, r[i]));
            Y.set(o, 'hasDataAttrs', !0);
          }
          return r;
        }
        return 'object' == typeof e
          ? this.each(function () {
              G.set(this, e);
            })
          : j(
              this,
              function (t) {
                var n;
                if (o && void 0 === t) {
                  if (void 0 !== (n = G.get(o, e))) return n;
                  if (void 0 !== (n = Z(o, e))) return n;
                } else
                  this.each(function () {
                    G.set(this, e, t);
                  });
              },
              null,
              t,
              arguments.length > 1,
              null,
              !0,
            );
      },
      removeData: function (e) {
        return this.each(function () {
          G.remove(this, e);
        });
      },
    }),
    w.extend({
      queue: function (e, t, n) {
        var i;
        if (e)
          return (
            (t = (t || 'fx') + 'queue'),
            (i = Y.get(e, t)),
            n && (!i || Array.isArray(n) ? (i = Y.access(e, t, w.makeArray(n))) : i.push(n)),
            i || []
          );
      },
      dequeue: function (e, t) {
        t = t || 'fx';
        var n = w.queue(e, t),
          i = n.length,
          r = n.shift(),
          o = w._queueHooks(e, t);
        'inprogress' === r && ((r = n.shift()), i--),
          r &&
            ('fx' === t && n.unshift('inprogress'),
            delete o.stop,
            r.call(
              e,
              function () {
                w.dequeue(e, t);
              },
              o,
            )),
          !i && o && o.empty.fire();
      },
      _queueHooks: function (e, t) {
        var n = t + 'queueHooks';
        return (
          Y.get(e, n) ||
          Y.access(e, n, {
            empty: w.Callbacks('once memory').add(function () {
              Y.remove(e, [t + 'queue', n]);
            }),
          })
        );
      },
    }),
    w.fn.extend({
      queue: function (e, t) {
        var n = 2;
        return (
          'string' != typeof e && ((t = e), (e = 'fx'), n--),
          arguments.length < n
            ? w.queue(this[0], e)
            : void 0 === t
              ? this
              : this.each(function () {
                  var n = w.queue(this, e, t);
                  w._queueHooks(this, e), 'fx' === e && 'inprogress' !== n[0] && w.dequeue(this, e);
                })
        );
      },
      dequeue: function (e) {
        return this.each(function () {
          w.dequeue(this, e);
        });
      },
      clearQueue: function (e) {
        return this.queue(e || 'fx', []);
      },
      promise: function (e, t) {
        var n,
          i = 1,
          r = w.Deferred(),
          o = this,
          a = this.length,
          s = function () {
            --i || r.resolveWith(o, [o]);
          };
        for ('string' != typeof e && ((t = e), (e = void 0)), e = e || 'fx'; a--; )
          (n = Y.get(o[a], e + 'queueHooks')) && n.empty && (i++, n.empty.add(s));
        return s(), r.promise(t);
      },
    });
  var ee = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,
    te = new RegExp('^(?:([+-])=|)(' + ee + ')([a-z%]*)$', 'i'),
    ne = ['Top', 'Right', 'Bottom', 'Left'],
    ie = function (e, t) {
      return (
        'none' === (e = t || e).style.display ||
        ('' === e.style.display && w.contains(e.ownerDocument, e) && 'none' === w.css(e, 'display'))
      );
    },
    re = function (e, t, n, i) {
      var r,
        o,
        a = {};
      for (o in t) (a[o] = e.style[o]), (e.style[o] = t[o]);
      for (o in ((r = n.apply(e, i || [])), t)) e.style[o] = a[o];
      return r;
    };
  function oe(e, t, n, i) {
    var r,
      o,
      a = 20,
      s = i
        ? function () {
            return i.cur();
          }
        : function () {
            return w.css(e, t, '');
          },
      l = s(),
      c = (n && n[3]) || (w.cssNumber[t] ? '' : 'px'),
      d = (w.cssNumber[t] || ('px' !== c && +l)) && te.exec(w.css(e, t));
    if (d && d[3] !== c) {
      for (l /= 2, c = c || d[3], d = +l || 1; a--; )
        w.style(e, t, d + c), (1 - o) * (1 - (o = s() / l || 0.5)) <= 0 && (a = 0), (d /= o);
      (d *= 2), w.style(e, t, d + c), (n = n || []);
    }
    return (
      n &&
        ((d = +d || +l || 0),
        (r = n[1] ? d + (n[1] + 1) * n[2] : +n[2]),
        i && ((i.unit = c), (i.start = d), (i.end = r))),
      r
    );
  }
  var ae = {};
  function se(e) {
    var t,
      n = e.ownerDocument,
      i = e.nodeName,
      r = ae[i];
    return (
      r ||
      ((t = n.body.appendChild(n.createElement(i))),
      (r = w.css(t, 'display')),
      t.parentNode.removeChild(t),
      'none' === r && (r = 'block'),
      (ae[i] = r),
      r)
    );
  }
  function le(e, t) {
    for (var n, i, r = [], o = 0, a = e.length; o < a; o++)
      (i = e[o]).style &&
        ((n = i.style.display),
        t
          ? ('none' === n && ((r[o] = Y.get(i, 'display') || null), r[o] || (i.style.display = '')),
            '' === i.style.display && ie(i) && (r[o] = se(i)))
          : 'none' !== n && ((r[o] = 'none'), Y.set(i, 'display', n)));
    for (o = 0; o < a; o++) null != r[o] && (e[o].style.display = r[o]);
    return e;
  }
  w.fn.extend({
    show: function () {
      return le(this, !0);
    },
    hide: function () {
      return le(this);
    },
    toggle: function (e) {
      return 'boolean' == typeof e
        ? e
          ? this.show()
          : this.hide()
        : this.each(function () {
            ie(this) ? w(this).show() : w(this).hide();
          });
    },
  });
  var ce = /^(?:checkbox|radio)$/i,
    de = /<([a-z][^\/\0>\x20\t\r\n\f]+)/i,
    ue = /^$|^module$|\/(?:java|ecma)script/i,
    he = {
      option: [1, "<select multiple='multiple'>", '</select>'],
      thead: [1, '<table>', '</table>'],
      col: [2, '<table><colgroup>', '</colgroup></table>'],
      tr: [2, '<table><tbody>', '</tbody></table>'],
      td: [3, '<table><tbody><tr>', '</tr></tbody></table>'],
      _default: [0, '', ''],
    };
  function pe(e, t) {
    var n;
    return (
      (n =
        void 0 !== e.getElementsByTagName
          ? e.getElementsByTagName(t || '*')
          : void 0 !== e.querySelectorAll
            ? e.querySelectorAll(t || '*')
            : []),
      void 0 === t || (t && T(e, t)) ? w.merge([e], n) : n
    );
  }
  function fe(e, t) {
    for (var n = 0, i = e.length; n < i; n++)
      Y.set(e[n], 'globalEval', !t || Y.get(t[n], 'globalEval'));
  }
  (he.optgroup = he.option),
    (he.tbody = he.tfoot = he.colgroup = he.caption = he.thead),
    (he.th = he.td);
  var me = /<|&#?\w+;/;
  function ge(e, t, n, i, r) {
    for (
      var o, a, s, l, c, d, u = t.createDocumentFragment(), h = [], p = 0, f = e.length;
      p < f;
      p++
    )
      if ((o = e[p]) || 0 === o)
        if ('object' === b(o)) w.merge(h, o.nodeType ? [o] : o);
        else if (me.test(o)) {
          for (
            a = a || u.appendChild(t.createElement('div')),
              s = (de.exec(o) || ['', ''])[1].toLowerCase(),
              l = he[s] || he._default,
              a.innerHTML = l[1] + w.htmlPrefilter(o) + l[2],
              d = l[0];
            d--;
          )
            a = a.lastChild;
          w.merge(h, a.childNodes), ((a = u.firstChild).textContent = '');
        } else h.push(t.createTextNode(o));
    for (u.textContent = '', p = 0; (o = h[p++]); )
      if (i && w.inArray(o, i) > -1) r && r.push(o);
      else if (
        ((c = w.contains(o.ownerDocument, o)), (a = pe(u.appendChild(o), 'script')), c && fe(a), n)
      )
        for (d = 0; (o = a[d++]); ) ue.test(o.type || '') && n.push(o);
    return u;
  }
  !(function () {
    var e = i.createDocumentFragment().appendChild(i.createElement('div')),
      t = i.createElement('input');
    t.setAttribute('type', 'radio'),
      t.setAttribute('checked', 'checked'),
      t.setAttribute('name', 't'),
      e.appendChild(t),
      (f.checkClone = e.cloneNode(!0).cloneNode(!0).lastChild.checked),
      (e.innerHTML = '<textarea>x</textarea>'),
      (f.noCloneChecked = !!e.cloneNode(!0).lastChild.defaultValue);
  })();
  var ve = i.documentElement,
    ye = /^key/,
    be = /^(?:mouse|pointer|contextmenu|drag|drop)|click/,
    we = /^([^.]*)(?:\.(.+)|)/;
  function xe() {
    return !0;
  }
  function Ce() {
    return !1;
  }
  function Fe() {
    try {
      return i.activeElement;
    } catch (e) {}
  }
  function Se(e, t, n, i, r, o) {
    var a, s;
    if ('object' == typeof t) {
      for (s in ('string' != typeof n && ((i = i || n), (n = void 0)), t)) Se(e, s, n, i, t[s], o);
      return e;
    }
    if (
      (null == i && null == r
        ? ((r = n), (i = n = void 0))
        : null == r &&
          ('string' == typeof n ? ((r = i), (i = void 0)) : ((r = i), (i = n), (n = void 0))),
      !1 === r)
    )
      r = Ce;
    else if (!r) return e;
    return (
      1 === o &&
        ((a = r),
        ((r = function (e) {
          return w().off(e), a.apply(this, arguments);
        }).guid = a.guid || (a.guid = w.guid++))),
      e.each(function () {
        w.event.add(this, t, r, i, n);
      })
    );
  }
  (w.event = {
    global: {},
    add: function (e, t, n, i, r) {
      var o,
        a,
        s,
        l,
        c,
        d,
        u,
        h,
        p,
        f,
        m,
        g = Y.get(e);
      if (g)
        for (
          n.handler && ((n = (o = n).handler), (r = o.selector)),
            r && w.find.matchesSelector(ve, r),
            n.guid || (n.guid = w.guid++),
            (l = g.events) || (l = g.events = {}),
            (a = g.handle) ||
              (a = g.handle =
                function (t) {
                  return void 0 !== w && w.event.triggered !== t.type
                    ? w.event.dispatch.apply(e, arguments)
                    : void 0;
                }),
            c = (t = (t || '').match(B) || ['']).length;
          c--;
        )
          (p = m = (s = we.exec(t[c]) || [])[1]),
            (f = (s[2] || '').split('.').sort()),
            p &&
              ((u = w.event.special[p] || {}),
              (p = (r ? u.delegateType : u.bindType) || p),
              (u = w.event.special[p] || {}),
              (d = w.extend(
                {
                  type: p,
                  origType: m,
                  data: i,
                  handler: n,
                  guid: n.guid,
                  selector: r,
                  needsContext: r && w.expr.match.needsContext.test(r),
                  namespace: f.join('.'),
                },
                o,
              )),
              (h = l[p]) ||
                (((h = l[p] = []).delegateCount = 0),
                (u.setup && !1 !== u.setup.call(e, i, f, a)) ||
                  (e.addEventListener && e.addEventListener(p, a))),
              u.add && (u.add.call(e, d), d.handler.guid || (d.handler.guid = n.guid)),
              r ? h.splice(h.delegateCount++, 0, d) : h.push(d),
              (w.event.global[p] = !0));
    },
    remove: function (e, t, n, i, r) {
      var o,
        a,
        s,
        l,
        c,
        d,
        u,
        h,
        p,
        f,
        m,
        g = Y.hasData(e) && Y.get(e);
      if (g && (l = g.events)) {
        for (c = (t = (t || '').match(B) || ['']).length; c--; )
          if (((p = m = (s = we.exec(t[c]) || [])[1]), (f = (s[2] || '').split('.').sort()), p)) {
            for (
              u = w.event.special[p] || {},
                h = l[(p = (i ? u.delegateType : u.bindType) || p)] || [],
                s = s[2] && new RegExp('(^|\\.)' + f.join('\\.(?:.*\\.|)') + '(\\.|$)'),
                a = o = h.length;
              o--;
            )
              (d = h[o]),
                (!r && m !== d.origType) ||
                  (n && n.guid !== d.guid) ||
                  (s && !s.test(d.namespace)) ||
                  (i && i !== d.selector && ('**' !== i || !d.selector)) ||
                  (h.splice(o, 1),
                  d.selector && h.delegateCount--,
                  u.remove && u.remove.call(e, d));
            a &&
              !h.length &&
              ((u.teardown && !1 !== u.teardown.call(e, f, g.handle)) ||
                w.removeEvent(e, p, g.handle),
              delete l[p]);
          } else for (p in l) w.event.remove(e, p + t[c], n, i, !0);
        w.isEmptyObject(l) && Y.remove(e, 'handle events');
      }
    },
    dispatch: function (e) {
      var t,
        n,
        i,
        r,
        o,
        a,
        s = w.event.fix(e),
        l = new Array(arguments.length),
        c = (Y.get(this, 'events') || {})[s.type] || [],
        d = w.event.special[s.type] || {};
      for (l[0] = s, t = 1; t < arguments.length; t++) l[t] = arguments[t];
      if (((s.delegateTarget = this), !d.preDispatch || !1 !== d.preDispatch.call(this, s))) {
        for (
          a = w.event.handlers.call(this, s, c), t = 0;
          (r = a[t++]) && !s.isPropagationStopped();
        )
          for (
            s.currentTarget = r.elem, n = 0;
            (o = r.handlers[n++]) && !s.isImmediatePropagationStopped();
          )
            (s.rnamespace && !s.rnamespace.test(o.namespace)) ||
              ((s.handleObj = o),
              (s.data = o.data),
              void 0 !==
                (i = ((w.event.special[o.origType] || {}).handle || o.handler).apply(r.elem, l)) &&
                !1 === (s.result = i) &&
                (s.preventDefault(), s.stopPropagation()));
        return d.postDispatch && d.postDispatch.call(this, s), s.result;
      }
    },
    handlers: function (e, t) {
      var n,
        i,
        r,
        o,
        a,
        s = [],
        l = t.delegateCount,
        c = e.target;
      if (l && c.nodeType && !('click' === e.type && e.button >= 1))
        for (; c !== this; c = c.parentNode || this)
          if (1 === c.nodeType && ('click' !== e.type || !0 !== c.disabled)) {
            for (o = [], a = {}, n = 0; n < l; n++)
              void 0 === a[(r = (i = t[n]).selector + ' ')] &&
                (a[r] = i.needsContext
                  ? w(r, this).index(c) > -1
                  : w.find(r, this, null, [c]).length),
                a[r] && o.push(i);
            o.length && s.push({ elem: c, handlers: o });
          }
      return (c = this), l < t.length && s.push({ elem: c, handlers: t.slice(l) }), s;
    },
    addProp: function (e, t) {
      Object.defineProperty(w.Event.prototype, e, {
        enumerable: !0,
        configurable: !0,
        get: m(t)
          ? function () {
              if (this.originalEvent) return t(this.originalEvent);
            }
          : function () {
              if (this.originalEvent) return this.originalEvent[e];
            },
        set: function (t) {
          Object.defineProperty(this, e, {
            enumerable: !0,
            configurable: !0,
            writable: !0,
            value: t,
          });
        },
      });
    },
    fix: function (e) {
      return e[w.expando] ? e : new w.Event(e);
    },
    special: {
      load: { noBubble: !0 },
      focus: {
        trigger: function () {
          if (this !== Fe() && this.focus) return this.focus(), !1;
        },
        delegateType: 'focusin',
      },
      blur: {
        trigger: function () {
          if (this === Fe() && this.blur) return this.blur(), !1;
        },
        delegateType: 'focusout',
      },
      click: {
        trigger: function () {
          if ('checkbox' === this.type && this.click && T(this, 'input')) return this.click(), !1;
        },
        _default: function (e) {
          return T(e.target, 'a');
        },
      },
      beforeunload: {
        postDispatch: function (e) {
          void 0 !== e.result && e.originalEvent && (e.originalEvent.returnValue = e.result);
        },
      },
    },
  }),
    (w.removeEvent = function (e, t, n) {
      e.removeEventListener && e.removeEventListener(t, n);
    }),
    (w.Event = function (e, t) {
      if (!(this instanceof w.Event)) return new w.Event(e, t);
      e && e.type
        ? ((this.originalEvent = e),
          (this.type = e.type),
          (this.isDefaultPrevented =
            e.defaultPrevented || (void 0 === e.defaultPrevented && !1 === e.returnValue)
              ? xe
              : Ce),
          (this.target = e.target && 3 === e.target.nodeType ? e.target.parentNode : e.target),
          (this.currentTarget = e.currentTarget),
          (this.relatedTarget = e.relatedTarget))
        : (this.type = e),
        t && w.extend(this, t),
        (this.timeStamp = (e && e.timeStamp) || Date.now()),
        (this[w.expando] = !0);
    }),
    (w.Event.prototype = {
      constructor: w.Event,
      isDefaultPrevented: Ce,
      isPropagationStopped: Ce,
      isImmediatePropagationStopped: Ce,
      isSimulated: !1,
      preventDefault: function () {
        var e = this.originalEvent;
        (this.isDefaultPrevented = xe), e && !this.isSimulated && e.preventDefault();
      },
      stopPropagation: function () {
        var e = this.originalEvent;
        (this.isPropagationStopped = xe), e && !this.isSimulated && e.stopPropagation();
      },
      stopImmediatePropagation: function () {
        var e = this.originalEvent;
        (this.isImmediatePropagationStopped = xe),
          e && !this.isSimulated && e.stopImmediatePropagation(),
          this.stopPropagation();
      },
    }),
    w.each(
      {
        altKey: !0,
        bubbles: !0,
        cancelable: !0,
        changedTouches: !0,
        ctrlKey: !0,
        detail: !0,
        eventPhase: !0,
        metaKey: !0,
        pageX: !0,
        pageY: !0,
        shiftKey: !0,
        view: !0,
        char: !0,
        charCode: !0,
        key: !0,
        keyCode: !0,
        button: !0,
        buttons: !0,
        clientX: !0,
        clientY: !0,
        offsetX: !0,
        offsetY: !0,
        pointerId: !0,
        pointerType: !0,
        screenX: !0,
        screenY: !0,
        targetTouches: !0,
        toElement: !0,
        touches: !0,
        which: function (e) {
          var t = e.button;
          return null == e.which && ye.test(e.type)
            ? null != e.charCode
              ? e.charCode
              : e.keyCode
            : !e.which && void 0 !== t && be.test(e.type)
              ? 1 & t
                ? 1
                : 2 & t
                  ? 3
                  : 4 & t
                    ? 2
                    : 0
              : e.which;
        },
      },
      w.event.addProp,
    ),
    w.each(
      {
        mouseenter: 'mouseover',
        mouseleave: 'mouseout',
        pointerenter: 'pointerover',
        pointerleave: 'pointerout',
      },
      function (e, t) {
        w.event.special[e] = {
          delegateType: t,
          bindType: t,
          handle: function (e) {
            var n,
              i = e.relatedTarget,
              r = e.handleObj;
            return (
              (i && (i === this || w.contains(this, i))) ||
                ((e.type = r.origType), (n = r.handler.apply(this, arguments)), (e.type = t)),
              n
            );
          },
        };
      },
    ),
    w.fn.extend({
      on: function (e, t, n, i) {
        return Se(this, e, t, n, i);
      },
      one: function (e, t, n, i) {
        return Se(this, e, t, n, i, 1);
      },
      off: function (e, t, n) {
        var i, r;
        if (e && e.preventDefault && e.handleObj)
          return (
            (i = e.handleObj),
            w(e.delegateTarget).off(
              i.namespace ? i.origType + '.' + i.namespace : i.origType,
              i.selector,
              i.handler,
            ),
            this
          );
        if ('object' == typeof e) {
          for (r in e) this.off(r, t, e[r]);
          return this;
        }
        return (
          (!1 !== t && 'function' != typeof t) || ((n = t), (t = void 0)),
          !1 === n && (n = Ce),
          this.each(function () {
            w.event.remove(this, e, n, t);
          })
        );
      },
    });
  var ke =
      /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi,
    Ee = /<script|<style|<link/i,
    Te = /checked\s*(?:[^=]|=\s*.checked.)/i,
    _e = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;
  function Ae(e, t) {
    return (
      (T(e, 'table') &&
        T(11 !== t.nodeType ? t : t.firstChild, 'tr') &&
        w(e).children('tbody')[0]) ||
      e
    );
  }
  function Me(e) {
    return (e.type = (null !== e.getAttribute('type')) + '/' + e.type), e;
  }
  function Le(e) {
    return (
      'true/' === (e.type || '').slice(0, 5)
        ? (e.type = e.type.slice(5))
        : e.removeAttribute('type'),
      e
    );
  }
  function Ne(e, t) {
    var n, i, r, o, a, s, l, c;
    if (1 === t.nodeType) {
      if (Y.hasData(e) && ((o = Y.access(e)), (a = Y.set(t, o)), (c = o.events)))
        for (r in (delete a.handle, (a.events = {}), c))
          for (n = 0, i = c[r].length; n < i; n++) w.event.add(t, r, c[r][n]);
      G.hasData(e) && ((s = G.access(e)), (l = w.extend({}, s)), G.set(t, l));
    }
  }
  function De(e, t) {
    var n = t.nodeName.toLowerCase();
    'input' === n && ce.test(e.type)
      ? (t.checked = e.checked)
      : ('input' !== n && 'textarea' !== n) || (t.defaultValue = e.defaultValue);
  }
  function Re(e, t, n, i) {
    t = a.apply([], t);
    var r,
      o,
      s,
      l,
      c,
      d,
      u = 0,
      h = e.length,
      p = h - 1,
      g = t[0],
      v = m(g);
    if (v || (h > 1 && 'string' == typeof g && !f.checkClone && Te.test(g)))
      return e.each(function (r) {
        var o = e.eq(r);
        v && (t[0] = g.call(this, r, o.html())), Re(o, t, n, i);
      });
    if (
      h &&
      ((o = (r = ge(t, e[0].ownerDocument, !1, e, i)).firstChild),
      1 === r.childNodes.length && (r = o),
      o || i)
    ) {
      for (l = (s = w.map(pe(r, 'script'), Me)).length; u < h; u++)
        (c = r),
          u !== p && ((c = w.clone(c, !0, !0)), l && w.merge(s, pe(c, 'script'))),
          n.call(e[u], c, u);
      if (l)
        for (d = s[s.length - 1].ownerDocument, w.map(s, Le), u = 0; u < l; u++)
          (c = s[u]),
            ue.test(c.type || '') &&
              !Y.access(c, 'globalEval') &&
              w.contains(d, c) &&
              (c.src && 'module' !== (c.type || '').toLowerCase()
                ? w._evalUrl && w._evalUrl(c.src)
                : y(c.textContent.replace(_e, ''), d, c));
    }
    return e;
  }
  function Be(e, t, n) {
    for (var i, r = t ? w.filter(t, e) : e, o = 0; null != (i = r[o]); o++)
      n || 1 !== i.nodeType || w.cleanData(pe(i)),
        i.parentNode &&
          (n && w.contains(i.ownerDocument, i) && fe(pe(i, 'script')), i.parentNode.removeChild(i));
    return e;
  }
  w.extend({
    htmlPrefilter: function (e) {
      return e.replace(ke, '<$1></$2>');
    },
    clone: function (e, t, n) {
      var i,
        r,
        o,
        a,
        s = e.cloneNode(!0),
        l = w.contains(e.ownerDocument, e);
      if (!(f.noCloneChecked || (1 !== e.nodeType && 11 !== e.nodeType) || w.isXMLDoc(e)))
        for (a = pe(s), i = 0, r = (o = pe(e)).length; i < r; i++) De(o[i], a[i]);
      if (t)
        if (n) for (o = o || pe(e), a = a || pe(s), i = 0, r = o.length; i < r; i++) Ne(o[i], a[i]);
        else Ne(e, s);
      return (a = pe(s, 'script')).length > 0 && fe(a, !l && pe(e, 'script')), s;
    },
    cleanData: function (e) {
      for (var t, n, i, r = w.event.special, o = 0; void 0 !== (n = e[o]); o++)
        if (J(n)) {
          if ((t = n[Y.expando])) {
            if (t.events)
              for (i in t.events) r[i] ? w.event.remove(n, i) : w.removeEvent(n, i, t.handle);
            n[Y.expando] = void 0;
          }
          n[G.expando] && (n[G.expando] = void 0);
        }
    },
  }),
    w.fn.extend({
      detach: function (e) {
        return Be(this, e, !0);
      },
      remove: function (e) {
        return Be(this, e);
      },
      text: function (e) {
        return j(
          this,
          function (e) {
            return void 0 === e
              ? w.text(this)
              : this.empty().each(function () {
                  (1 !== this.nodeType && 11 !== this.nodeType && 9 !== this.nodeType) ||
                    (this.textContent = e);
                });
          },
          null,
          e,
          arguments.length,
        );
      },
      append: function () {
        return Re(this, arguments, function (e) {
          (1 !== this.nodeType && 11 !== this.nodeType && 9 !== this.nodeType) ||
            Ae(this, e).appendChild(e);
        });
      },
      prepend: function () {
        return Re(this, arguments, function (e) {
          if (1 === this.nodeType || 11 === this.nodeType || 9 === this.nodeType) {
            var t = Ae(this, e);
            t.insertBefore(e, t.firstChild);
          }
        });
      },
      before: function () {
        return Re(this, arguments, function (e) {
          this.parentNode && this.parentNode.insertBefore(e, this);
        });
      },
      after: function () {
        return Re(this, arguments, function (e) {
          this.parentNode && this.parentNode.insertBefore(e, this.nextSibling);
        });
      },
      empty: function () {
        for (var e, t = 0; null != (e = this[t]); t++)
          1 === e.nodeType && (w.cleanData(pe(e, !1)), (e.textContent = ''));
        return this;
      },
      clone: function (e, t) {
        return (
          (e = null != e && e),
          (t = null == t ? e : t),
          this.map(function () {
            return w.clone(this, e, t);
          })
        );
      },
      html: function (e) {
        return j(
          this,
          function (e) {
            var t = this[0] || {},
              n = 0,
              i = this.length;
            if (void 0 === e && 1 === t.nodeType) return t.innerHTML;
            if (
              'string' == typeof e &&
              !Ee.test(e) &&
              !he[(de.exec(e) || ['', ''])[1].toLowerCase()]
            ) {
              e = w.htmlPrefilter(e);
              try {
                for (; n < i; n++)
                  1 === (t = this[n] || {}).nodeType && (w.cleanData(pe(t, !1)), (t.innerHTML = e));
                t = 0;
              } catch (e) {}
            }
            t && this.empty().append(e);
          },
          null,
          e,
          arguments.length,
        );
      },
      replaceWith: function () {
        var e = [];
        return Re(
          this,
          arguments,
          function (t) {
            var n = this.parentNode;
            w.inArray(this, e) < 0 && (w.cleanData(pe(this)), n && n.replaceChild(t, this));
          },
          e,
        );
      },
    }),
    w.each(
      {
        appendTo: 'append',
        prependTo: 'prepend',
        insertBefore: 'before',
        insertAfter: 'after',
        replaceAll: 'replaceWith',
      },
      function (e, t) {
        w.fn[e] = function (e) {
          for (var n, i = [], r = w(e), o = r.length - 1, a = 0; a <= o; a++)
            (n = a === o ? this : this.clone(!0)), w(r[a])[t](n), s.apply(i, n.get());
          return this.pushStack(i);
        };
      },
    );
  var Pe = new RegExp('^(' + ee + ')(?!px)[a-z%]+$', 'i'),
    Ie = function (t) {
      var n = t.ownerDocument.defaultView;
      return (n && n.opener) || (n = e), n.getComputedStyle(t);
    },
    Oe = new RegExp(ne.join('|'), 'i');
  function $e(e, t, n) {
    var i,
      r,
      o,
      a,
      s = e.style;
    return (
      (n = n || Ie(e)) &&
        ('' !== (a = n.getPropertyValue(t) || n[t]) ||
          w.contains(e.ownerDocument, e) ||
          (a = w.style(e, t)),
        !f.pixelBoxStyles() &&
          Pe.test(a) &&
          Oe.test(t) &&
          ((i = s.width),
          (r = s.minWidth),
          (o = s.maxWidth),
          (s.minWidth = s.maxWidth = s.width = a),
          (a = n.width),
          (s.width = i),
          (s.minWidth = r),
          (s.maxWidth = o))),
      void 0 !== a ? a + '' : a
    );
  }
  function He(e, t) {
    return {
      get: function () {
        if (!e()) return (this.get = t).apply(this, arguments);
        delete this.get;
      },
    };
  }
  !(function () {
    function t() {
      if (d) {
        (c.style.cssText =
          'position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0'),
          (d.style.cssText =
            'position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%'),
          ve.appendChild(c).appendChild(d);
        var t = e.getComputedStyle(d);
        (r = '1%' !== t.top),
          (l = 12 === n(t.marginLeft)),
          (d.style.right = '60%'),
          (s = 36 === n(t.right)),
          (o = 36 === n(t.width)),
          (d.style.position = 'absolute'),
          (a = 36 === d.offsetWidth || 'absolute'),
          ve.removeChild(c),
          (d = null);
      }
    }
    function n(e) {
      return Math.round(parseFloat(e));
    }
    var r,
      o,
      a,
      s,
      l,
      c = i.createElement('div'),
      d = i.createElement('div');
    d.style &&
      ((d.style.backgroundClip = 'content-box'),
      (d.cloneNode(!0).style.backgroundClip = ''),
      (f.clearCloneStyle = 'content-box' === d.style.backgroundClip),
      w.extend(f, {
        boxSizingReliable: function () {
          return t(), o;
        },
        pixelBoxStyles: function () {
          return t(), s;
        },
        pixelPosition: function () {
          return t(), r;
        },
        reliableMarginLeft: function () {
          return t(), l;
        },
        scrollboxSize: function () {
          return t(), a;
        },
      }));
  })();
  var Ue = /^(none|table(?!-c[ea]).+)/,
    je = /^--/,
    qe = { position: 'absolute', visibility: 'hidden', display: 'block' },
    We = { letterSpacing: '0', fontWeight: '400' },
    ze = ['Webkit', 'Moz', 'ms'],
    Ve = i.createElement('div').style;
  function Je(e) {
    var t = w.cssProps[e];
    return (
      t ||
        (t = w.cssProps[e] =
          (function (e) {
            if (e in Ve) return e;
            for (var t = e[0].toUpperCase() + e.slice(1), n = ze.length; n--; )
              if ((e = ze[n] + t) in Ve) return e;
          })(e) || e),
      t
    );
  }
  function Ke(e, t, n) {
    var i = te.exec(t);
    return i ? Math.max(0, i[2] - (n || 0)) + (i[3] || 'px') : t;
  }
  function Ye(e, t, n, i, r, o) {
    var a = 'width' === t ? 1 : 0,
      s = 0,
      l = 0;
    if (n === (i ? 'border' : 'content')) return 0;
    for (; a < 4; a += 2)
      'margin' === n && (l += w.css(e, n + ne[a], !0, r)),
        i
          ? ('content' === n && (l -= w.css(e, 'padding' + ne[a], !0, r)),
            'margin' !== n && (l -= w.css(e, 'border' + ne[a] + 'Width', !0, r)))
          : ((l += w.css(e, 'padding' + ne[a], !0, r)),
            'padding' !== n
              ? (l += w.css(e, 'border' + ne[a] + 'Width', !0, r))
              : (s += w.css(e, 'border' + ne[a] + 'Width', !0, r)));
    return (
      !i &&
        o >= 0 &&
        (l += Math.max(
          0,
          Math.ceil(e['offset' + t[0].toUpperCase() + t.slice(1)] - o - l - s - 0.5),
        )),
      l
    );
  }
  function Ge(e, t, n) {
    var i = Ie(e),
      r = $e(e, t, i),
      o = 'border-box' === w.css(e, 'boxSizing', !1, i),
      a = o;
    if (Pe.test(r)) {
      if (!n) return r;
      r = 'auto';
    }
    return (
      (a = a && (f.boxSizingReliable() || r === e.style[t])),
      ('auto' === r || (!parseFloat(r) && 'inline' === w.css(e, 'display', !1, i))) &&
        ((r = e['offset' + t[0].toUpperCase() + t.slice(1)]), (a = !0)),
      (r = parseFloat(r) || 0) + Ye(e, t, n || (o ? 'border' : 'content'), a, i, r) + 'px'
    );
  }
  function Qe(e, t, n, i, r) {
    return new Qe.prototype.init(e, t, n, i, r);
  }
  w.extend({
    cssHooks: {
      opacity: {
        get: function (e, t) {
          if (t) {
            var n = $e(e, 'opacity');
            return '' === n ? '1' : n;
          }
        },
      },
    },
    cssNumber: {
      animationIterationCount: !0,
      columnCount: !0,
      fillOpacity: !0,
      flexGrow: !0,
      flexShrink: !0,
      fontWeight: !0,
      lineHeight: !0,
      opacity: !0,
      order: !0,
      orphans: !0,
      widows: !0,
      zIndex: !0,
      zoom: !0,
    },
    cssProps: {},
    style: function (e, t, n, i) {
      if (e && 3 !== e.nodeType && 8 !== e.nodeType && e.style) {
        var r,
          o,
          a,
          s = V(t),
          l = je.test(t),
          c = e.style;
        if ((l || (t = Je(s)), (a = w.cssHooks[t] || w.cssHooks[s]), void 0 === n))
          return a && 'get' in a && void 0 !== (r = a.get(e, !1, i)) ? r : c[t];
        'string' == (o = typeof n) &&
          (r = te.exec(n)) &&
          r[1] &&
          ((n = oe(e, t, r)), (o = 'number')),
          null != n &&
            n == n &&
            ('number' === o && (n += (r && r[3]) || (w.cssNumber[s] ? '' : 'px')),
            f.clearCloneStyle || '' !== n || 0 !== t.indexOf('background') || (c[t] = 'inherit'),
            (a && 'set' in a && void 0 === (n = a.set(e, n, i))) ||
              (l ? c.setProperty(t, n) : (c[t] = n)));
      }
    },
    css: function (e, t, n, i) {
      var r,
        o,
        a,
        s = V(t);
      return (
        je.test(t) || (t = Je(s)),
        (a = w.cssHooks[t] || w.cssHooks[s]) && 'get' in a && (r = a.get(e, !0, n)),
        void 0 === r && (r = $e(e, t, i)),
        'normal' === r && t in We && (r = We[t]),
        '' === n || n ? ((o = parseFloat(r)), !0 === n || isFinite(o) ? o || 0 : r) : r
      );
    },
  }),
    w.each(['height', 'width'], function (e, t) {
      w.cssHooks[t] = {
        get: function (e, n, i) {
          if (n)
            return !Ue.test(w.css(e, 'display')) ||
              (e.getClientRects().length && e.getBoundingClientRect().width)
              ? Ge(e, t, i)
              : re(e, qe, function () {
                  return Ge(e, t, i);
                });
        },
        set: function (e, n, i) {
          var r,
            o = Ie(e),
            a = 'border-box' === w.css(e, 'boxSizing', !1, o),
            s = i && Ye(e, t, i, a, o);
          return (
            a &&
              f.scrollboxSize() === o.position &&
              (s -= Math.ceil(
                e['offset' + t[0].toUpperCase() + t.slice(1)] -
                  parseFloat(o[t]) -
                  Ye(e, t, 'border', !1, o) -
                  0.5,
              )),
            s &&
              (r = te.exec(n)) &&
              'px' !== (r[3] || 'px') &&
              ((e.style[t] = n), (n = w.css(e, t))),
            Ke(0, n, s)
          );
        },
      };
    }),
    (w.cssHooks.marginLeft = He(f.reliableMarginLeft, function (e, t) {
      if (t)
        return (
          (parseFloat($e(e, 'marginLeft')) ||
            e.getBoundingClientRect().left -
              re(e, { marginLeft: 0 }, function () {
                return e.getBoundingClientRect().left;
              })) + 'px'
        );
    })),
    w.each({ margin: '', padding: '', border: 'Width' }, function (e, t) {
      (w.cssHooks[e + t] = {
        expand: function (n) {
          for (var i = 0, r = {}, o = 'string' == typeof n ? n.split(' ') : [n]; i < 4; i++)
            r[e + ne[i] + t] = o[i] || o[i - 2] || o[0];
          return r;
        },
      }),
        'margin' !== e && (w.cssHooks[e + t].set = Ke);
    }),
    w.fn.extend({
      css: function (e, t) {
        return j(
          this,
          function (e, t, n) {
            var i,
              r,
              o = {},
              a = 0;
            if (Array.isArray(t)) {
              for (i = Ie(e), r = t.length; a < r; a++) o[t[a]] = w.css(e, t[a], !1, i);
              return o;
            }
            return void 0 !== n ? w.style(e, t, n) : w.css(e, t);
          },
          e,
          t,
          arguments.length > 1,
        );
      },
    }),
    (w.Tween = Qe),
    (Qe.prototype = {
      constructor: Qe,
      init: function (e, t, n, i, r, o) {
        (this.elem = e),
          (this.prop = n),
          (this.easing = r || w.easing._default),
          (this.options = t),
          (this.start = this.now = this.cur()),
          (this.end = i),
          (this.unit = o || (w.cssNumber[n] ? '' : 'px'));
      },
      cur: function () {
        var e = Qe.propHooks[this.prop];
        return e && e.get ? e.get(this) : Qe.propHooks._default.get(this);
      },
      run: function (e) {
        var t,
          n = Qe.propHooks[this.prop];
        return (
          this.options.duration
            ? (this.pos = t =
                w.easing[this.easing](e, this.options.duration * e, 0, 1, this.options.duration))
            : (this.pos = t = e),
          (this.now = (this.end - this.start) * t + this.start),
          this.options.step && this.options.step.call(this.elem, this.now, this),
          n && n.set ? n.set(this) : Qe.propHooks._default.set(this),
          this
        );
      },
    }),
    (Qe.prototype.init.prototype = Qe.prototype),
    (Qe.propHooks = {
      _default: {
        get: function (e) {
          var t;
          return 1 !== e.elem.nodeType || (null != e.elem[e.prop] && null == e.elem.style[e.prop])
            ? e.elem[e.prop]
            : (t = w.css(e.elem, e.prop, '')) && 'auto' !== t
              ? t
              : 0;
        },
        set: function (e) {
          w.fx.step[e.prop]
            ? w.fx.step[e.prop](e)
            : 1 !== e.elem.nodeType ||
                (null == e.elem.style[w.cssProps[e.prop]] && !w.cssHooks[e.prop])
              ? (e.elem[e.prop] = e.now)
              : w.style(e.elem, e.prop, e.now + e.unit);
        },
      },
    }),
    (Qe.propHooks.scrollTop = Qe.propHooks.scrollLeft =
      {
        set: function (e) {
          e.elem.nodeType && e.elem.parentNode && (e.elem[e.prop] = e.now);
        },
      }),
    (w.easing = {
      linear: function (e) {
        return e;
      },
      swing: function (e) {
        return 0.5 - Math.cos(e * Math.PI) / 2;
      },
      _default: 'swing',
    }),
    (w.fx = Qe.prototype.init),
    (w.fx.step = {});
  var Xe,
    Ze,
    et = /^(?:toggle|show|hide)$/,
    tt = /queueHooks$/;
  function nt() {
    Ze &&
      (!1 === i.hidden && e.requestAnimationFrame
        ? e.requestAnimationFrame(nt)
        : e.setTimeout(nt, w.fx.interval),
      w.fx.tick());
  }
  function it() {
    return (
      e.setTimeout(function () {
        Xe = void 0;
      }),
      (Xe = Date.now())
    );
  }
  function rt(e, t) {
    var n,
      i = 0,
      r = { height: e };
    for (t = t ? 1 : 0; i < 4; i += 2 - t) r['margin' + (n = ne[i])] = r['padding' + n] = e;
    return t && (r.opacity = r.width = e), r;
  }
  function ot(e, t, n) {
    for (
      var i, r = (at.tweeners[t] || []).concat(at.tweeners['*']), o = 0, a = r.length;
      o < a;
      o++
    )
      if ((i = r[o].call(n, t, e))) return i;
  }
  function at(e, t, n) {
    var i,
      r,
      o = 0,
      a = at.prefilters.length,
      s = w.Deferred().always(function () {
        delete l.elem;
      }),
      l = function () {
        if (r) return !1;
        for (
          var t = Xe || it(),
            n = Math.max(0, c.startTime + c.duration - t),
            i = 1 - (n / c.duration || 0),
            o = 0,
            a = c.tweens.length;
          o < a;
          o++
        )
          c.tweens[o].run(i);
        return (
          s.notifyWith(e, [c, i, n]),
          i < 1 && a ? n : (a || s.notifyWith(e, [c, 1, 0]), s.resolveWith(e, [c]), !1)
        );
      },
      c = s.promise({
        elem: e,
        props: w.extend({}, t),
        opts: w.extend(!0, { specialEasing: {}, easing: w.easing._default }, n),
        originalProperties: t,
        originalOptions: n,
        startTime: Xe || it(),
        duration: n.duration,
        tweens: [],
        createTween: function (t, n) {
          var i = w.Tween(e, c.opts, t, n, c.opts.specialEasing[t] || c.opts.easing);
          return c.tweens.push(i), i;
        },
        stop: function (t) {
          var n = 0,
            i = t ? c.tweens.length : 0;
          if (r) return this;
          for (r = !0; n < i; n++) c.tweens[n].run(1);
          return (
            t ? (s.notifyWith(e, [c, 1, 0]), s.resolveWith(e, [c, t])) : s.rejectWith(e, [c, t]),
            this
          );
        },
      }),
      d = c.props;
    for (
      (function (e, t) {
        var n, i, r, o, a;
        for (n in e)
          if (
            ((r = t[(i = V(n))]),
            (o = e[n]),
            Array.isArray(o) && ((r = o[1]), (o = e[n] = o[0])),
            n !== i && ((e[i] = o), delete e[n]),
            (a = w.cssHooks[i]) && 'expand' in a)
          )
            for (n in ((o = a.expand(o)), delete e[i], o)) n in e || ((e[n] = o[n]), (t[n] = r));
          else t[i] = r;
      })(d, c.opts.specialEasing);
      o < a;
      o++
    )
      if ((i = at.prefilters[o].call(c, e, d, c.opts)))
        return m(i.stop) && (w._queueHooks(c.elem, c.opts.queue).stop = i.stop.bind(i)), i;
    return (
      w.map(d, ot, c),
      m(c.opts.start) && c.opts.start.call(e, c),
      c
        .progress(c.opts.progress)
        .done(c.opts.done, c.opts.complete)
        .fail(c.opts.fail)
        .always(c.opts.always),
      w.fx.timer(w.extend(l, { elem: e, anim: c, queue: c.opts.queue })),
      c
    );
  }
  (w.Animation = w.extend(at, {
    tweeners: {
      '*': [
        function (e, t) {
          var n = this.createTween(e, t);
          return oe(n.elem, e, te.exec(t), n), n;
        },
      ],
    },
    tweener: function (e, t) {
      m(e) ? ((t = e), (e = ['*'])) : (e = e.match(B));
      for (var n, i = 0, r = e.length; i < r; i++)
        (n = e[i]), (at.tweeners[n] = at.tweeners[n] || []), at.tweeners[n].unshift(t);
    },
    prefilters: [
      function (e, t, n) {
        var i,
          r,
          o,
          a,
          s,
          l,
          c,
          d,
          u = 'width' in t || 'height' in t,
          h = this,
          p = {},
          f = e.style,
          m = e.nodeType && ie(e),
          g = Y.get(e, 'fxshow');
        for (i in (n.queue ||
          (null == (a = w._queueHooks(e, 'fx')).unqueued &&
            ((a.unqueued = 0),
            (s = a.empty.fire),
            (a.empty.fire = function () {
              a.unqueued || s();
            })),
          a.unqueued++,
          h.always(function () {
            h.always(function () {
              a.unqueued--, w.queue(e, 'fx').length || a.empty.fire();
            });
          })),
        t))
          if (((r = t[i]), et.test(r))) {
            if ((delete t[i], (o = o || 'toggle' === r), r === (m ? 'hide' : 'show'))) {
              if ('show' !== r || !g || void 0 === g[i]) continue;
              m = !0;
            }
            p[i] = (g && g[i]) || w.style(e, i);
          }
        if ((l = !w.isEmptyObject(t)) || !w.isEmptyObject(p))
          for (i in (u &&
            1 === e.nodeType &&
            ((n.overflow = [f.overflow, f.overflowX, f.overflowY]),
            null == (c = g && g.display) && (c = Y.get(e, 'display')),
            'none' === (d = w.css(e, 'display')) &&
              (c
                ? (d = c)
                : (le([e], !0), (c = e.style.display || c), (d = w.css(e, 'display')), le([e]))),
            ('inline' === d || ('inline-block' === d && null != c)) &&
              'none' === w.css(e, 'float') &&
              (l ||
                (h.done(function () {
                  f.display = c;
                }),
                null == c && ((d = f.display), (c = 'none' === d ? '' : d))),
              (f.display = 'inline-block'))),
          n.overflow &&
            ((f.overflow = 'hidden'),
            h.always(function () {
              (f.overflow = n.overflow[0]),
                (f.overflowX = n.overflow[1]),
                (f.overflowY = n.overflow[2]);
            })),
          (l = !1),
          p))
            l ||
              (g ? 'hidden' in g && (m = g.hidden) : (g = Y.access(e, 'fxshow', { display: c })),
              o && (g.hidden = !m),
              m && le([e], !0),
              h.done(function () {
                for (i in (m || le([e]), Y.remove(e, 'fxshow'), p)) w.style(e, i, p[i]);
              })),
              (l = ot(m ? g[i] : 0, i, h)),
              i in g || ((g[i] = l.start), m && ((l.end = l.start), (l.start = 0)));
      },
    ],
    prefilter: function (e, t) {
      t ? at.prefilters.unshift(e) : at.prefilters.push(e);
    },
  })),
    (w.speed = function (e, t, n) {
      var i =
        e && 'object' == typeof e
          ? w.extend({}, e)
          : {
              complete: n || (!n && t) || (m(e) && e),
              duration: e,
              easing: (n && t) || (t && !m(t) && t),
            };
      return (
        w.fx.off
          ? (i.duration = 0)
          : 'number' != typeof i.duration &&
            (i.duration in w.fx.speeds
              ? (i.duration = w.fx.speeds[i.duration])
              : (i.duration = w.fx.speeds._default)),
        (null != i.queue && !0 !== i.queue) || (i.queue = 'fx'),
        (i.old = i.complete),
        (i.complete = function () {
          m(i.old) && i.old.call(this), i.queue && w.dequeue(this, i.queue);
        }),
        i
      );
    }),
    w.fn.extend({
      fadeTo: function (e, t, n, i) {
        return this.filter(ie).css('opacity', 0).show().end().animate({ opacity: t }, e, n, i);
      },
      animate: function (e, t, n, i) {
        var r = w.isEmptyObject(e),
          o = w.speed(t, n, i),
          a = function () {
            var t = at(this, w.extend({}, e), o);
            (r || Y.get(this, 'finish')) && t.stop(!0);
          };
        return (a.finish = a), r || !1 === o.queue ? this.each(a) : this.queue(o.queue, a);
      },
      stop: function (e, t, n) {
        var i = function (e) {
          var t = e.stop;
          delete e.stop, t(n);
        };
        return (
          'string' != typeof e && ((n = t), (t = e), (e = void 0)),
          t && !1 !== e && this.queue(e || 'fx', []),
          this.each(function () {
            var t = !0,
              r = null != e && e + 'queueHooks',
              o = w.timers,
              a = Y.get(this);
            if (r) a[r] && a[r].stop && i(a[r]);
            else for (r in a) a[r] && a[r].stop && tt.test(r) && i(a[r]);
            for (r = o.length; r--; )
              o[r].elem !== this ||
                (null != e && o[r].queue !== e) ||
                (o[r].anim.stop(n), (t = !1), o.splice(r, 1));
            (!t && n) || w.dequeue(this, e);
          })
        );
      },
      finish: function (e) {
        return (
          !1 !== e && (e = e || 'fx'),
          this.each(function () {
            var t,
              n = Y.get(this),
              i = n[e + 'queue'],
              r = n[e + 'queueHooks'],
              o = w.timers,
              a = i ? i.length : 0;
            for (
              n.finish = !0,
                w.queue(this, e, []),
                r && r.stop && r.stop.call(this, !0),
                t = o.length;
              t--;
            )
              o[t].elem === this && o[t].queue === e && (o[t].anim.stop(!0), o.splice(t, 1));
            for (t = 0; t < a; t++) i[t] && i[t].finish && i[t].finish.call(this);
            delete n.finish;
          })
        );
      },
    }),
    w.each(['toggle', 'show', 'hide'], function (e, t) {
      var n = w.fn[t];
      w.fn[t] = function (e, i, r) {
        return null == e || 'boolean' == typeof e
          ? n.apply(this, arguments)
          : this.animate(rt(t, !0), e, i, r);
      };
    }),
    w.each(
      {
        slideDown: rt('show'),
        slideUp: rt('hide'),
        slideToggle: rt('toggle'),
        fadeIn: { opacity: 'show' },
        fadeOut: { opacity: 'hide' },
        fadeToggle: { opacity: 'toggle' },
      },
      function (e, t) {
        w.fn[e] = function (e, n, i) {
          return this.animate(t, e, n, i);
        };
      },
    ),
    (w.timers = []),
    (w.fx.tick = function () {
      var e,
        t = 0,
        n = w.timers;
      for (Xe = Date.now(); t < n.length; t++) (e = n[t])() || n[t] !== e || n.splice(t--, 1);
      n.length || w.fx.stop(), (Xe = void 0);
    }),
    (w.fx.timer = function (e) {
      w.timers.push(e), w.fx.start();
    }),
    (w.fx.interval = 13),
    (w.fx.start = function () {
      Ze || ((Ze = !0), nt());
    }),
    (w.fx.stop = function () {
      Ze = null;
    }),
    (w.fx.speeds = { slow: 600, fast: 200, _default: 400 }),
    (w.fn.delay = function (t, n) {
      return (
        (t = (w.fx && w.fx.speeds[t]) || t),
        (n = n || 'fx'),
        this.queue(n, function (n, i) {
          var r = e.setTimeout(n, t);
          i.stop = function () {
            e.clearTimeout(r);
          };
        })
      );
    }),
    (function () {
      var e = i.createElement('input'),
        t = i.createElement('select').appendChild(i.createElement('option'));
      (e.type = 'checkbox'),
        (f.checkOn = '' !== e.value),
        (f.optSelected = t.selected),
        ((e = i.createElement('input')).value = 't'),
        (e.type = 'radio'),
        (f.radioValue = 't' === e.value);
    })();
  var st,
    lt = w.expr.attrHandle;
  w.fn.extend({
    attr: function (e, t) {
      return j(this, w.attr, e, t, arguments.length > 1);
    },
    removeAttr: function (e) {
      return this.each(function () {
        w.removeAttr(this, e);
      });
    },
  }),
    w.extend({
      attr: function (e, t, n) {
        var i,
          r,
          o = e.nodeType;
        if (3 !== o && 8 !== o && 2 !== o)
          return void 0 === e.getAttribute
            ? w.prop(e, t, n)
            : ((1 === o && w.isXMLDoc(e)) ||
                (r = w.attrHooks[t.toLowerCase()] || (w.expr.match.bool.test(t) ? st : void 0)),
              void 0 !== n
                ? null === n
                  ? void w.removeAttr(e, t)
                  : r && 'set' in r && void 0 !== (i = r.set(e, n, t))
                    ? i
                    : (e.setAttribute(t, n + ''), n)
                : r && 'get' in r && null !== (i = r.get(e, t))
                  ? i
                  : null == (i = w.find.attr(e, t))
                    ? void 0
                    : i);
      },
      attrHooks: {
        type: {
          set: function (e, t) {
            if (!f.radioValue && 'radio' === t && T(e, 'input')) {
              var n = e.value;
              return e.setAttribute('type', t), n && (e.value = n), t;
            }
          },
        },
      },
      removeAttr: function (e, t) {
        var n,
          i = 0,
          r = t && t.match(B);
        if (r && 1 === e.nodeType) for (; (n = r[i++]); ) e.removeAttribute(n);
      },
    }),
    (st = {
      set: function (e, t, n) {
        return !1 === t ? w.removeAttr(e, n) : e.setAttribute(n, n), n;
      },
    }),
    w.each(w.expr.match.bool.source.match(/\w+/g), function (e, t) {
      var n = lt[t] || w.find.attr;
      lt[t] = function (e, t, i) {
        var r,
          o,
          a = t.toLowerCase();
        return i || ((o = lt[a]), (lt[a] = r), (r = null != n(e, t, i) ? a : null), (lt[a] = o)), r;
      };
    });
  var ct = /^(?:input|select|textarea|button)$/i,
    dt = /^(?:a|area)$/i;
  function ut(e) {
    return (e.match(B) || []).join(' ');
  }
  function ht(e) {
    return (e.getAttribute && e.getAttribute('class')) || '';
  }
  function pt(e) {
    return Array.isArray(e) ? e : ('string' == typeof e && e.match(B)) || [];
  }
  w.fn.extend({
    prop: function (e, t) {
      return j(this, w.prop, e, t, arguments.length > 1);
    },
    removeProp: function (e) {
      return this.each(function () {
        delete this[w.propFix[e] || e];
      });
    },
  }),
    w.extend({
      prop: function (e, t, n) {
        var i,
          r,
          o = e.nodeType;
        if (3 !== o && 8 !== o && 2 !== o)
          return (
            (1 === o && w.isXMLDoc(e)) || ((t = w.propFix[t] || t), (r = w.propHooks[t])),
            void 0 !== n
              ? r && 'set' in r && void 0 !== (i = r.set(e, n, t))
                ? i
                : (e[t] = n)
              : r && 'get' in r && null !== (i = r.get(e, t))
                ? i
                : e[t]
          );
      },
      propHooks: {
        tabIndex: {
          get: function (e) {
            var t = w.find.attr(e, 'tabindex');
            return t
              ? parseInt(t, 10)
              : ct.test(e.nodeName) || (dt.test(e.nodeName) && e.href)
                ? 0
                : -1;
          },
        },
      },
      propFix: { for: 'htmlFor', class: 'className' },
    }),
    f.optSelected ||
      (w.propHooks.selected = {
        get: function (e) {
          var t = e.parentNode;
          return t && t.parentNode && t.parentNode.selectedIndex, null;
        },
        set: function (e) {
          var t = e.parentNode;
          t && (t.selectedIndex, t.parentNode && t.parentNode.selectedIndex);
        },
      }),
    w.each(
      [
        'tabIndex',
        'readOnly',
        'maxLength',
        'cellSpacing',
        'cellPadding',
        'rowSpan',
        'colSpan',
        'useMap',
        'frameBorder',
        'contentEditable',
      ],
      function () {
        w.propFix[this.toLowerCase()] = this;
      },
    ),
    w.fn.extend({
      addClass: function (e) {
        var t,
          n,
          i,
          r,
          o,
          a,
          s,
          l = 0;
        if (m(e))
          return this.each(function (t) {
            w(this).addClass(e.call(this, t, ht(this)));
          });
        if ((t = pt(e)).length)
          for (; (n = this[l++]); )
            if (((r = ht(n)), (i = 1 === n.nodeType && ' ' + ut(r) + ' '))) {
              for (a = 0; (o = t[a++]); ) i.indexOf(' ' + o + ' ') < 0 && (i += o + ' ');
              r !== (s = ut(i)) && n.setAttribute('class', s);
            }
        return this;
      },
      removeClass: function (e) {
        var t,
          n,
          i,
          r,
          o,
          a,
          s,
          l = 0;
        if (m(e))
          return this.each(function (t) {
            w(this).removeClass(e.call(this, t, ht(this)));
          });
        if (!arguments.length) return this.attr('class', '');
        if ((t = pt(e)).length)
          for (; (n = this[l++]); )
            if (((r = ht(n)), (i = 1 === n.nodeType && ' ' + ut(r) + ' '))) {
              for (a = 0; (o = t[a++]); )
                for (; i.indexOf(' ' + o + ' ') > -1; ) i = i.replace(' ' + o + ' ', ' ');
              r !== (s = ut(i)) && n.setAttribute('class', s);
            }
        return this;
      },
      toggleClass: function (e, t) {
        var n = typeof e,
          i = 'string' === n || Array.isArray(e);
        return 'boolean' == typeof t && i
          ? t
            ? this.addClass(e)
            : this.removeClass(e)
          : m(e)
            ? this.each(function (n) {
                w(this).toggleClass(e.call(this, n, ht(this), t), t);
              })
            : this.each(function () {
                var t, r, o, a;
                if (i)
                  for (r = 0, o = w(this), a = pt(e); (t = a[r++]); )
                    o.hasClass(t) ? o.removeClass(t) : o.addClass(t);
                else
                  (void 0 !== e && 'boolean' !== n) ||
                    ((t = ht(this)) && Y.set(this, '__className__', t),
                    this.setAttribute &&
                      this.setAttribute(
                        'class',
                        t || !1 === e ? '' : Y.get(this, '__className__') || '',
                      ));
              });
      },
      hasClass: function (e) {
        var t,
          n,
          i = 0;
        for (t = ' ' + e + ' '; (n = this[i++]); )
          if (1 === n.nodeType && (' ' + ut(ht(n)) + ' ').indexOf(t) > -1) return !0;
        return !1;
      },
    });
  var ft = /\r/g;
  w.fn.extend({
    val: function (e) {
      var t,
        n,
        i,
        r = this[0];
      return arguments.length
        ? ((i = m(e)),
          this.each(function (n) {
            var r;
            1 === this.nodeType &&
              (null == (r = i ? e.call(this, n, w(this).val()) : e)
                ? (r = '')
                : 'number' == typeof r
                  ? (r += '')
                  : Array.isArray(r) &&
                    (r = w.map(r, function (e) {
                      return null == e ? '' : e + '';
                    })),
              ((t = w.valHooks[this.type] || w.valHooks[this.nodeName.toLowerCase()]) &&
                'set' in t &&
                void 0 !== t.set(this, r, 'value')) ||
                (this.value = r));
          }))
        : r
          ? (t = w.valHooks[r.type] || w.valHooks[r.nodeName.toLowerCase()]) &&
            'get' in t &&
            void 0 !== (n = t.get(r, 'value'))
            ? n
            : 'string' == typeof (n = r.value)
              ? n.replace(ft, '')
              : null == n
                ? ''
                : n
          : void 0;
    },
  }),
    w.extend({
      valHooks: {
        option: {
          get: function (e) {
            var t = w.find.attr(e, 'value');
            return null != t ? t : ut(w.text(e));
          },
        },
        select: {
          get: function (e) {
            var t,
              n,
              i,
              r = e.options,
              o = e.selectedIndex,
              a = 'select-one' === e.type,
              s = a ? null : [],
              l = a ? o + 1 : r.length;
            for (i = o < 0 ? l : a ? o : 0; i < l; i++)
              if (
                ((n = r[i]).selected || i === o) &&
                !n.disabled &&
                (!n.parentNode.disabled || !T(n.parentNode, 'optgroup'))
              ) {
                if (((t = w(n).val()), a)) return t;
                s.push(t);
              }
            return s;
          },
          set: function (e, t) {
            for (var n, i, r = e.options, o = w.makeArray(t), a = r.length; a--; )
              ((i = r[a]).selected = w.inArray(w.valHooks.option.get(i), o) > -1) && (n = !0);
            return n || (e.selectedIndex = -1), o;
          },
        },
      },
    }),
    w.each(['radio', 'checkbox'], function () {
      (w.valHooks[this] = {
        set: function (e, t) {
          if (Array.isArray(t)) return (e.checked = w.inArray(w(e).val(), t) > -1);
        },
      }),
        f.checkOn ||
          (w.valHooks[this].get = function (e) {
            return null === e.getAttribute('value') ? 'on' : e.value;
          });
    }),
    (f.focusin = 'onfocusin' in e);
  var mt = /^(?:focusinfocus|focusoutblur)$/,
    gt = function (e) {
      e.stopPropagation();
    };
  w.extend(w.event, {
    trigger: function (t, n, r, o) {
      var a,
        s,
        l,
        c,
        d,
        h,
        p,
        f,
        v = [r || i],
        y = u.call(t, 'type') ? t.type : t,
        b = u.call(t, 'namespace') ? t.namespace.split('.') : [];
      if (
        ((s = f = l = r = r || i),
        3 !== r.nodeType &&
          8 !== r.nodeType &&
          !mt.test(y + w.event.triggered) &&
          (y.indexOf('.') > -1 && ((y = (b = y.split('.')).shift()), b.sort()),
          (d = y.indexOf(':') < 0 && 'on' + y),
          ((t = t[w.expando] ? t : new w.Event(y, 'object' == typeof t && t)).isTrigger = o
            ? 2
            : 3),
          (t.namespace = b.join('.')),
          (t.rnamespace = t.namespace
            ? new RegExp('(^|\\.)' + b.join('\\.(?:.*\\.|)') + '(\\.|$)')
            : null),
          (t.result = void 0),
          t.target || (t.target = r),
          (n = null == n ? [t] : w.makeArray(n, [t])),
          (p = w.event.special[y] || {}),
          o || !p.trigger || !1 !== p.trigger.apply(r, n)))
      ) {
        if (!o && !p.noBubble && !g(r)) {
          for (c = p.delegateType || y, mt.test(c + y) || (s = s.parentNode); s; s = s.parentNode)
            v.push(s), (l = s);
          l === (r.ownerDocument || i) && v.push(l.defaultView || l.parentWindow || e);
        }
        for (a = 0; (s = v[a++]) && !t.isPropagationStopped(); )
          (f = s),
            (t.type = a > 1 ? c : p.bindType || y),
            (h = (Y.get(s, 'events') || {})[t.type] && Y.get(s, 'handle')) && h.apply(s, n),
            (h = d && s[d]) &&
              h.apply &&
              J(s) &&
              ((t.result = h.apply(s, n)), !1 === t.result && t.preventDefault());
        return (
          (t.type = y),
          o ||
            t.isDefaultPrevented() ||
            (p._default && !1 !== p._default.apply(v.pop(), n)) ||
            !J(r) ||
            (d &&
              m(r[y]) &&
              !g(r) &&
              ((l = r[d]) && (r[d] = null),
              (w.event.triggered = y),
              t.isPropagationStopped() && f.addEventListener(y, gt),
              r[y](),
              t.isPropagationStopped() && f.removeEventListener(y, gt),
              (w.event.triggered = void 0),
              l && (r[d] = l))),
          t.result
        );
      }
    },
    simulate: function (e, t, n) {
      var i = w.extend(new w.Event(), n, { type: e, isSimulated: !0 });
      w.event.trigger(i, null, t);
    },
  }),
    w.fn.extend({
      trigger: function (e, t) {
        return this.each(function () {
          w.event.trigger(e, t, this);
        });
      },
      triggerHandler: function (e, t) {
        var n = this[0];
        if (n) return w.event.trigger(e, t, n, !0);
      },
    }),
    f.focusin ||
      w.each({ focus: 'focusin', blur: 'focusout' }, function (e, t) {
        var n = function (e) {
          w.event.simulate(t, e.target, w.event.fix(e));
        };
        w.event.special[t] = {
          setup: function () {
            var i = this.ownerDocument || this,
              r = Y.access(i, t);
            r || i.addEventListener(e, n, !0), Y.access(i, t, (r || 0) + 1);
          },
          teardown: function () {
            var i = this.ownerDocument || this,
              r = Y.access(i, t) - 1;
            r ? Y.access(i, t, r) : (i.removeEventListener(e, n, !0), Y.remove(i, t));
          },
        };
      });
  var vt = e.location,
    yt = Date.now(),
    bt = /\?/;
  w.parseXML = function (t) {
    var n;
    if (!t || 'string' != typeof t) return null;
    try {
      n = new e.DOMParser().parseFromString(t, 'text/xml');
    } catch (e) {
      n = void 0;
    }
    return (n && !n.getElementsByTagName('parsererror').length) || w.error('Invalid XML: ' + t), n;
  };
  var wt = /\[\]$/,
    xt = /\r?\n/g,
    Ct = /^(?:submit|button|image|reset|file)$/i,
    Ft = /^(?:input|select|textarea|keygen)/i;
  function St(e, t, n, i) {
    var r;
    if (Array.isArray(t))
      w.each(t, function (t, r) {
        n || wt.test(e)
          ? i(e, r)
          : St(e + '[' + ('object' == typeof r && null != r ? t : '') + ']', r, n, i);
      });
    else if (n || 'object' !== b(t)) i(e, t);
    else for (r in t) St(e + '[' + r + ']', t[r], n, i);
  }
  (w.param = function (e, t) {
    var n,
      i = [],
      r = function (e, t) {
        var n = m(t) ? t() : t;
        i[i.length] = encodeURIComponent(e) + '=' + encodeURIComponent(null == n ? '' : n);
      };
    if (Array.isArray(e) || (e.jquery && !w.isPlainObject(e)))
      w.each(e, function () {
        r(this.name, this.value);
      });
    else for (n in e) St(n, e[n], t, r);
    return i.join('&');
  }),
    w.fn.extend({
      serialize: function () {
        return w.param(this.serializeArray());
      },
      serializeArray: function () {
        return this.map(function () {
          var e = w.prop(this, 'elements');
          return e ? w.makeArray(e) : this;
        })
          .filter(function () {
            var e = this.type;
            return (
              this.name &&
              !w(this).is(':disabled') &&
              Ft.test(this.nodeName) &&
              !Ct.test(e) &&
              (this.checked || !ce.test(e))
            );
          })
          .map(function (e, t) {
            var n = w(this).val();
            return null == n
              ? null
              : Array.isArray(n)
                ? w.map(n, function (e) {
                    return { name: t.name, value: e.replace(xt, '\r\n') };
                  })
                : { name: t.name, value: n.replace(xt, '\r\n') };
          })
          .get();
      },
    });
  var kt = /%20/g,
    Et = /#.*$/,
    Tt = /([?&])_=[^&]*/,
    _t = /^(.*?):[ \t]*([^\r\n]*)$/gm,
    At = /^(?:GET|HEAD)$/,
    Mt = /^\/\//,
    Lt = {},
    Nt = {},
    Dt = '*/'.concat('*'),
    Rt = i.createElement('a');
  function Bt(e) {
    return function (t, n) {
      'string' != typeof t && ((n = t), (t = '*'));
      var i,
        r = 0,
        o = t.toLowerCase().match(B) || [];
      if (m(n))
        for (; (i = o[r++]); )
          '+' === i[0]
            ? ((i = i.slice(1) || '*'), (e[i] = e[i] || []).unshift(n))
            : (e[i] = e[i] || []).push(n);
    };
  }
  function Pt(e, t, n, i) {
    var r = {},
      o = e === Nt;
    function a(s) {
      var l;
      return (
        (r[s] = !0),
        w.each(e[s] || [], function (e, s) {
          var c = s(t, n, i);
          return 'string' != typeof c || o || r[c]
            ? o
              ? !(l = c)
              : void 0
            : (t.dataTypes.unshift(c), a(c), !1);
        }),
        l
      );
    }
    return a(t.dataTypes[0]) || (!r['*'] && a('*'));
  }
  function It(e, t) {
    var n,
      i,
      r = w.ajaxSettings.flatOptions || {};
    for (n in t) void 0 !== t[n] && ((r[n] ? e : i || (i = {}))[n] = t[n]);
    return i && w.extend(!0, e, i), e;
  }
  (Rt.href = vt.href),
    w.extend({
      active: 0,
      lastModified: {},
      etag: {},
      ajaxSettings: {
        url: vt.href,
        type: 'GET',
        isLocal: /^(?:about|app|app-storage|.+-extension|file|res|widget):$/.test(vt.protocol),
        global: !0,
        processData: !0,
        async: !0,
        contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
        accepts: {
          '*': Dt,
          text: 'text/plain',
          html: 'text/html',
          xml: 'application/xml, text/xml',
          json: 'application/json, text/javascript',
        },
        contents: { xml: /\bxml\b/, html: /\bhtml/, json: /\bjson\b/ },
        responseFields: { xml: 'responseXML', text: 'responseText', json: 'responseJSON' },
        converters: {
          '* text': String,
          'text html': !0,
          'text json': JSON.parse,
          'text xml': w.parseXML,
        },
        flatOptions: { url: !0, context: !0 },
      },
      ajaxSetup: function (e, t) {
        return t ? It(It(e, w.ajaxSettings), t) : It(w.ajaxSettings, e);
      },
      ajaxPrefilter: Bt(Lt),
      ajaxTransport: Bt(Nt),
      ajax: function (t, n) {
        'object' == typeof t && ((n = t), (t = void 0)), (n = n || {});
        var r,
          o,
          a,
          s,
          l,
          c,
          d,
          u,
          h,
          p,
          f = w.ajaxSetup({}, n),
          m = f.context || f,
          g = f.context && (m.nodeType || m.jquery) ? w(m) : w.event,
          v = w.Deferred(),
          y = w.Callbacks('once memory'),
          b = f.statusCode || {},
          x = {},
          C = {},
          F = 'canceled',
          S = {
            readyState: 0,
            getResponseHeader: function (e) {
              var t;
              if (d) {
                if (!s) for (s = {}; (t = _t.exec(a)); ) s[t[1].toLowerCase()] = t[2];
                t = s[e.toLowerCase()];
              }
              return null == t ? null : t;
            },
            getAllResponseHeaders: function () {
              return d ? a : null;
            },
            setRequestHeader: function (e, t) {
              return (
                null == d && ((e = C[e.toLowerCase()] = C[e.toLowerCase()] || e), (x[e] = t)), this
              );
            },
            overrideMimeType: function (e) {
              return null == d && (f.mimeType = e), this;
            },
            statusCode: function (e) {
              var t;
              if (e)
                if (d) S.always(e[S.status]);
                else for (t in e) b[t] = [b[t], e[t]];
              return this;
            },
            abort: function (e) {
              var t = e || F;
              return r && r.abort(t), k(0, t), this;
            },
          };
        if (
          (v.promise(S),
          (f.url = ((t || f.url || vt.href) + '').replace(Mt, vt.protocol + '//')),
          (f.type = n.method || n.type || f.method || f.type),
          (f.dataTypes = (f.dataType || '*').toLowerCase().match(B) || ['']),
          null == f.crossDomain)
        ) {
          c = i.createElement('a');
          try {
            (c.href = f.url),
              (c.href = c.href),
              (f.crossDomain = Rt.protocol + '//' + Rt.host != c.protocol + '//' + c.host);
          } catch (e) {
            f.crossDomain = !0;
          }
        }
        if (
          (f.data &&
            f.processData &&
            'string' != typeof f.data &&
            (f.data = w.param(f.data, f.traditional)),
          Pt(Lt, f, n, S),
          d)
        )
          return S;
        for (h in ((u = w.event && f.global) && 0 == w.active++ && w.event.trigger('ajaxStart'),
        (f.type = f.type.toUpperCase()),
        (f.hasContent = !At.test(f.type)),
        (o = f.url.replace(Et, '')),
        f.hasContent
          ? f.data &&
            f.processData &&
            0 === (f.contentType || '').indexOf('application/x-www-form-urlencoded') &&
            (f.data = f.data.replace(kt, '+'))
          : ((p = f.url.slice(o.length)),
            f.data &&
              (f.processData || 'string' == typeof f.data) &&
              ((o += (bt.test(o) ? '&' : '?') + f.data), delete f.data),
            !1 === f.cache &&
              ((o = o.replace(Tt, '$1')), (p = (bt.test(o) ? '&' : '?') + '_=' + yt++ + p)),
            (f.url = o + p)),
        f.ifModified &&
          (w.lastModified[o] && S.setRequestHeader('If-Modified-Since', w.lastModified[o]),
          w.etag[o] && S.setRequestHeader('If-None-Match', w.etag[o])),
        ((f.data && f.hasContent && !1 !== f.contentType) || n.contentType) &&
          S.setRequestHeader('Content-Type', f.contentType),
        S.setRequestHeader(
          'Accept',
          f.dataTypes[0] && f.accepts[f.dataTypes[0]]
            ? f.accepts[f.dataTypes[0]] + ('*' !== f.dataTypes[0] ? ', ' + Dt + '; q=0.01' : '')
            : f.accepts['*'],
        ),
        f.headers))
          S.setRequestHeader(h, f.headers[h]);
        if (f.beforeSend && (!1 === f.beforeSend.call(m, S, f) || d)) return S.abort();
        if (
          ((F = 'abort'),
          y.add(f.complete),
          S.done(f.success),
          S.fail(f.error),
          (r = Pt(Nt, f, n, S)))
        ) {
          if (((S.readyState = 1), u && g.trigger('ajaxSend', [S, f]), d)) return S;
          f.async &&
            f.timeout > 0 &&
            (l = e.setTimeout(function () {
              S.abort('timeout');
            }, f.timeout));
          try {
            (d = !1), r.send(x, k);
          } catch (e) {
            if (d) throw e;
            k(-1, e);
          }
        } else k(-1, 'No Transport');
        function k(t, n, i, s) {
          var c,
            h,
            p,
            x,
            C,
            F = n;
          d ||
            ((d = !0),
            l && e.clearTimeout(l),
            (r = void 0),
            (a = s || ''),
            (S.readyState = t > 0 ? 4 : 0),
            (c = (t >= 200 && t < 300) || 304 === t),
            i &&
              (x = (function (e, t, n) {
                for (var i, r, o, a, s = e.contents, l = e.dataTypes; '*' === l[0]; )
                  l.shift(),
                    void 0 === i && (i = e.mimeType || t.getResponseHeader('Content-Type'));
                if (i)
                  for (r in s)
                    if (s[r] && s[r].test(i)) {
                      l.unshift(r);
                      break;
                    }
                if (l[0] in n) o = l[0];
                else {
                  for (r in n) {
                    if (!l[0] || e.converters[r + ' ' + l[0]]) {
                      o = r;
                      break;
                    }
                    a || (a = r);
                  }
                  o = o || a;
                }
                if (o) return o !== l[0] && l.unshift(o), n[o];
              })(f, S, i)),
            (x = (function (e, t, n, i) {
              var r,
                o,
                a,
                s,
                l,
                c = {},
                d = e.dataTypes.slice();
              if (d[1]) for (a in e.converters) c[a.toLowerCase()] = e.converters[a];
              for (o = d.shift(); o; )
                if (
                  (e.responseFields[o] && (n[e.responseFields[o]] = t),
                  !l && i && e.dataFilter && (t = e.dataFilter(t, e.dataType)),
                  (l = o),
                  (o = d.shift()))
                )
                  if ('*' === o) o = l;
                  else if ('*' !== l && l !== o) {
                    if (!(a = c[l + ' ' + o] || c['* ' + o]))
                      for (r in c)
                        if (
                          (s = r.split(' '))[1] === o &&
                          (a = c[l + ' ' + s[0]] || c['* ' + s[0]])
                        ) {
                          !0 === a ? (a = c[r]) : !0 !== c[r] && ((o = s[0]), d.unshift(s[1]));
                          break;
                        }
                    if (!0 !== a)
                      if (a && e.throws) t = a(t);
                      else
                        try {
                          t = a(t);
                        } catch (e) {
                          return {
                            state: 'parsererror',
                            error: a ? e : 'No conversion from ' + l + ' to ' + o,
                          };
                        }
                  }
              return { state: 'success', data: t };
            })(f, x, S, c)),
            c
              ? (f.ifModified &&
                  ((C = S.getResponseHeader('Last-Modified')) && (w.lastModified[o] = C),
                  (C = S.getResponseHeader('etag')) && (w.etag[o] = C)),
                204 === t || 'HEAD' === f.type
                  ? (F = 'nocontent')
                  : 304 === t
                    ? (F = 'notmodified')
                    : ((F = x.state), (h = x.data), (c = !(p = x.error))))
              : ((p = F), (!t && F) || ((F = 'error'), t < 0 && (t = 0))),
            (S.status = t),
            (S.statusText = (n || F) + ''),
            c ? v.resolveWith(m, [h, F, S]) : v.rejectWith(m, [S, F, p]),
            S.statusCode(b),
            (b = void 0),
            u && g.trigger(c ? 'ajaxSuccess' : 'ajaxError', [S, f, c ? h : p]),
            y.fireWith(m, [S, F]),
            u && (g.trigger('ajaxComplete', [S, f]), --w.active || w.event.trigger('ajaxStop')));
        }
        return S;
      },
      getJSON: function (e, t, n) {
        return w.get(e, t, n, 'json');
      },
      getScript: function (e, t) {
        return w.get(e, void 0, t, 'script');
      },
    }),
    w.each(['get', 'post'], function (e, t) {
      w[t] = function (e, n, i, r) {
        return (
          m(n) && ((r = r || i), (i = n), (n = void 0)),
          w.ajax(
            w.extend(
              { url: e, type: t, dataType: r, data: n, success: i },
              w.isPlainObject(e) && e,
            ),
          )
        );
      };
    }),
    (w._evalUrl = function (e) {
      return w.ajax({
        url: e,
        type: 'GET',
        dataType: 'script',
        cache: !0,
        async: !1,
        global: !1,
        throws: !0,
      });
    }),
    w.fn.extend({
      wrapAll: function (e) {
        var t;
        return (
          this[0] &&
            (m(e) && (e = e.call(this[0])),
            (t = w(e, this[0].ownerDocument).eq(0).clone(!0)),
            this[0].parentNode && t.insertBefore(this[0]),
            t
              .map(function () {
                for (var e = this; e.firstElementChild; ) e = e.firstElementChild;
                return e;
              })
              .append(this)),
          this
        );
      },
      wrapInner: function (e) {
        return m(e)
          ? this.each(function (t) {
              w(this).wrapInner(e.call(this, t));
            })
          : this.each(function () {
              var t = w(this),
                n = t.contents();
              n.length ? n.wrapAll(e) : t.append(e);
            });
      },
      wrap: function (e) {
        var t = m(e);
        return this.each(function (n) {
          w(this).wrapAll(t ? e.call(this, n) : e);
        });
      },
      unwrap: function (e) {
        return (
          this.parent(e)
            .not('body')
            .each(function () {
              w(this).replaceWith(this.childNodes);
            }),
          this
        );
      },
    }),
    (w.expr.pseudos.hidden = function (e) {
      return !w.expr.pseudos.visible(e);
    }),
    (w.expr.pseudos.visible = function (e) {
      return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    }),
    (w.ajaxSettings.xhr = function () {
      try {
        return new e.XMLHttpRequest();
      } catch (e) {}
    });
  var Ot = { 0: 200, 1223: 204 },
    $t = w.ajaxSettings.xhr();
  (f.cors = !!$t && 'withCredentials' in $t),
    (f.ajax = $t = !!$t),
    w.ajaxTransport(function (t) {
      var n, i;
      if (f.cors || ($t && !t.crossDomain))
        return {
          send: function (r, o) {
            var a,
              s = t.xhr();
            if ((s.open(t.type, t.url, t.async, t.username, t.password), t.xhrFields))
              for (a in t.xhrFields) s[a] = t.xhrFields[a];
            for (a in (t.mimeType && s.overrideMimeType && s.overrideMimeType(t.mimeType),
            t.crossDomain || r['X-Requested-With'] || (r['X-Requested-With'] = 'XMLHttpRequest'),
            r))
              s.setRequestHeader(a, r[a]);
            (n = function (e) {
              return function () {
                n &&
                  ((n =
                    i =
                    s.onload =
                    s.onerror =
                    s.onabort =
                    s.ontimeout =
                    s.onreadystatechange =
                      null),
                  'abort' === e
                    ? s.abort()
                    : 'error' === e
                      ? 'number' != typeof s.status
                        ? o(0, 'error')
                        : o(s.status, s.statusText)
                      : o(
                          Ot[s.status] || s.status,
                          s.statusText,
                          'text' !== (s.responseType || 'text') || 'string' != typeof s.responseText
                            ? { binary: s.response }
                            : { text: s.responseText },
                          s.getAllResponseHeaders(),
                        ));
              };
            }),
              (s.onload = n()),
              (i = s.onerror = s.ontimeout = n('error')),
              void 0 !== s.onabort
                ? (s.onabort = i)
                : (s.onreadystatechange = function () {
                    4 === s.readyState &&
                      e.setTimeout(function () {
                        n && i();
                      });
                  }),
              (n = n('abort'));
            try {
              s.send((t.hasContent && t.data) || null);
            } catch (e) {
              if (n) throw e;
            }
          },
          abort: function () {
            n && n();
          },
        };
    }),
    w.ajaxPrefilter(function (e) {
      e.crossDomain && (e.contents.script = !1);
    }),
    w.ajaxSetup({
      accepts: {
        script:
          'text/javascript, application/javascript, application/ecmascript, application/x-ecmascript',
      },
      contents: { script: /\b(?:java|ecma)script\b/ },
      converters: {
        'text script': function (e) {
          return w.globalEval(e), e;
        },
      },
    }),
    w.ajaxPrefilter('script', function (e) {
      void 0 === e.cache && (e.cache = !1), e.crossDomain && (e.type = 'GET');
    }),
    w.ajaxTransport('script', function (e) {
      var t, n;
      if (e.crossDomain)
        return {
          send: function (r, o) {
            (t = w('<script>')
              .prop({ charset: e.scriptCharset, src: e.url })
              .on(
                'load error',
                (n = function (e) {
                  t.remove(), (n = null), e && o('error' === e.type ? 404 : 200, e.type);
                }),
              )),
              i.head.appendChild(t[0]);
          },
          abort: function () {
            n && n();
          },
        };
    });
  var Ht = [],
    Ut = /(=)\?(?=&|$)|\?\?/;
  w.ajaxSetup({
    jsonp: 'callback',
    jsonpCallback: function () {
      var e = Ht.pop() || w.expando + '_' + yt++;
      return (this[e] = !0), e;
    },
  }),
    w.ajaxPrefilter('json jsonp', function (t, n, i) {
      var r,
        o,
        a,
        s =
          !1 !== t.jsonp &&
          (Ut.test(t.url)
            ? 'url'
            : 'string' == typeof t.data &&
              0 === (t.contentType || '').indexOf('application/x-www-form-urlencoded') &&
              Ut.test(t.data) &&
              'data');
      if (s || 'jsonp' === t.dataTypes[0])
        return (
          (r = t.jsonpCallback = m(t.jsonpCallback) ? t.jsonpCallback() : t.jsonpCallback),
          s
            ? (t[s] = t[s].replace(Ut, '$1' + r))
            : !1 !== t.jsonp && (t.url += (bt.test(t.url) ? '&' : '?') + t.jsonp + '=' + r),
          (t.converters['script json'] = function () {
            return a || w.error(r + ' was not called'), a[0];
          }),
          (t.dataTypes[0] = 'json'),
          (o = e[r]),
          (e[r] = function () {
            a = arguments;
          }),
          i.always(function () {
            void 0 === o ? w(e).removeProp(r) : (e[r] = o),
              t[r] && ((t.jsonpCallback = n.jsonpCallback), Ht.push(r)),
              a && m(o) && o(a[0]),
              (a = o = void 0);
          }),
          'script'
        );
    }),
    (f.createHTMLDocument = (function () {
      var e = i.implementation.createHTMLDocument('').body;
      return (e.innerHTML = '<form></form><form></form>'), 2 === e.childNodes.length;
    })()),
    (w.parseHTML = function (e, t, n) {
      return 'string' != typeof e
        ? []
        : ('boolean' == typeof t && ((n = t), (t = !1)),
          t ||
            (f.createHTMLDocument
              ? (((r = (t = i.implementation.createHTMLDocument('')).createElement('base')).href =
                  i.location.href),
                t.head.appendChild(r))
              : (t = i)),
          (o = _.exec(e)),
          (a = !n && []),
          o
            ? [t.createElement(o[1])]
            : ((o = ge([e], t, a)), a && a.length && w(a).remove(), w.merge([], o.childNodes)));
      var r, o, a;
    }),
    (w.fn.load = function (e, t, n) {
      var i,
        r,
        o,
        a = this,
        s = e.indexOf(' ');
      return (
        s > -1 && ((i = ut(e.slice(s))), (e = e.slice(0, s))),
        m(t) ? ((n = t), (t = void 0)) : t && 'object' == typeof t && (r = 'POST'),
        a.length > 0 &&
          w
            .ajax({ url: e, type: r || 'GET', dataType: 'html', data: t })
            .done(function (e) {
              (o = arguments), a.html(i ? w('<div>').append(w.parseHTML(e)).find(i) : e);
            })
            .always(
              n &&
                function (e, t) {
                  a.each(function () {
                    n.apply(this, o || [e.responseText, t, e]);
                  });
                },
            ),
        this
      );
    }),
    w.each(
      ['ajaxStart', 'ajaxStop', 'ajaxComplete', 'ajaxError', 'ajaxSuccess', 'ajaxSend'],
      function (e, t) {
        w.fn[t] = function (e) {
          return this.on(t, e);
        };
      },
    ),
    (w.expr.pseudos.animated = function (e) {
      return w.grep(w.timers, function (t) {
        return e === t.elem;
      }).length;
    }),
    (w.offset = {
      setOffset: function (e, t, n) {
        var i,
          r,
          o,
          a,
          s,
          l,
          c = w.css(e, 'position'),
          d = w(e),
          u = {};
        'static' === c && (e.style.position = 'relative'),
          (s = d.offset()),
          (o = w.css(e, 'top')),
          (l = w.css(e, 'left')),
          ('absolute' === c || 'fixed' === c) && (o + l).indexOf('auto') > -1
            ? ((a = (i = d.position()).top), (r = i.left))
            : ((a = parseFloat(o) || 0), (r = parseFloat(l) || 0)),
          m(t) && (t = t.call(e, n, w.extend({}, s))),
          null != t.top && (u.top = t.top - s.top + a),
          null != t.left && (u.left = t.left - s.left + r),
          'using' in t ? t.using.call(e, u) : d.css(u);
      },
    }),
    w.fn.extend({
      offset: function (e) {
        if (arguments.length)
          return void 0 === e
            ? this
            : this.each(function (t) {
                w.offset.setOffset(this, e, t);
              });
        var t,
          n,
          i = this[0];
        return i
          ? i.getClientRects().length
            ? ((t = i.getBoundingClientRect()),
              (n = i.ownerDocument.defaultView),
              { top: t.top + n.pageYOffset, left: t.left + n.pageXOffset })
            : { top: 0, left: 0 }
          : void 0;
      },
      position: function () {
        if (this[0]) {
          var e,
            t,
            n,
            i = this[0],
            r = { top: 0, left: 0 };
          if ('fixed' === w.css(i, 'position')) t = i.getBoundingClientRect();
          else {
            for (
              t = this.offset(), n = i.ownerDocument, e = i.offsetParent || n.documentElement;
              e && (e === n.body || e === n.documentElement) && 'static' === w.css(e, 'position');
            )
              e = e.parentNode;
            e &&
              e !== i &&
              1 === e.nodeType &&
              (((r = w(e).offset()).top += w.css(e, 'borderTopWidth', !0)),
              (r.left += w.css(e, 'borderLeftWidth', !0)));
          }
          return {
            top: t.top - r.top - w.css(i, 'marginTop', !0),
            left: t.left - r.left - w.css(i, 'marginLeft', !0),
          };
        }
      },
      offsetParent: function () {
        return this.map(function () {
          for (var e = this.offsetParent; e && 'static' === w.css(e, 'position'); )
            e = e.offsetParent;
          return e || ve;
        });
      },
    }),
    w.each({ scrollLeft: 'pageXOffset', scrollTop: 'pageYOffset' }, function (e, t) {
      var n = 'pageYOffset' === t;
      w.fn[e] = function (i) {
        return j(
          this,
          function (e, i, r) {
            var o;
            if ((g(e) ? (o = e) : 9 === e.nodeType && (o = e.defaultView), void 0 === r))
              return o ? o[t] : e[i];
            o ? o.scrollTo(n ? o.pageXOffset : r, n ? r : o.pageYOffset) : (e[i] = r);
          },
          e,
          i,
          arguments.length,
        );
      };
    }),
    w.each(['top', 'left'], function (e, t) {
      w.cssHooks[t] = He(f.pixelPosition, function (e, n) {
        if (n) return (n = $e(e, t)), Pe.test(n) ? w(e).position()[t] + 'px' : n;
      });
    }),
    w.each({ Height: 'height', Width: 'width' }, function (e, t) {
      w.each({ padding: 'inner' + e, content: t, '': 'outer' + e }, function (n, i) {
        w.fn[i] = function (r, o) {
          var a = arguments.length && (n || 'boolean' != typeof r),
            s = n || (!0 === r || !0 === o ? 'margin' : 'border');
          return j(
            this,
            function (t, n, r) {
              var o;
              return g(t)
                ? 0 === i.indexOf('outer')
                  ? t['inner' + e]
                  : t.document.documentElement['client' + e]
                : 9 === t.nodeType
                  ? ((o = t.documentElement),
                    Math.max(
                      t.body['scroll' + e],
                      o['scroll' + e],
                      t.body['offset' + e],
                      o['offset' + e],
                      o['client' + e],
                    ))
                  : void 0 === r
                    ? w.css(t, n, s)
                    : w.style(t, n, r, s);
            },
            t,
            a ? r : void 0,
            a,
          );
        };
      });
    }),
    w.each(
      'blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu'.split(
        ' ',
      ),
      function (e, t) {
        w.fn[t] = function (e, n) {
          return arguments.length > 0 ? this.on(t, null, e, n) : this.trigger(t);
        };
      },
    ),
    w.fn.extend({
      hover: function (e, t) {
        return this.mouseenter(e).mouseleave(t || e);
      },
    }),
    w.fn.extend({
      bind: function (e, t, n) {
        return this.on(e, null, t, n);
      },
      unbind: function (e, t) {
        return this.off(e, null, t);
      },
      delegate: function (e, t, n, i) {
        return this.on(t, e, n, i);
      },
      undelegate: function (e, t, n) {
        return 1 === arguments.length ? this.off(e, '**') : this.off(t, e || '**', n);
      },
    }),
    (w.proxy = function (e, t) {
      var n, i, r;
      if (('string' == typeof t && ((n = e[t]), (t = e), (e = n)), m(e)))
        return (
          (i = o.call(arguments, 2)),
          ((r = function () {
            return e.apply(t || this, i.concat(o.call(arguments)));
          }).guid = e.guid =
            e.guid || w.guid++),
          r
        );
    }),
    (w.holdReady = function (e) {
      e ? w.readyWait++ : w.ready(!0);
    }),
    (w.isArray = Array.isArray),
    (w.parseJSON = JSON.parse),
    (w.nodeName = T),
    (w.isFunction = m),
    (w.isWindow = g),
    (w.camelCase = V),
    (w.type = b),
    (w.now = Date.now),
    (w.isNumeric = function (e) {
      var t = w.type(e);
      return ('number' === t || 'string' === t) && !isNaN(e - parseFloat(e));
    }),
    $__System.registerDynamic('e', [], !1, function (e, t, n) {
      return function () {
        return w;
      }.call(this);
    });
  var jt = e.jQuery,
    qt = e.$;
  return (
    (w.noConflict = function (t) {
      return e.$ === w && (e.$ = qt), t && e.jQuery === w && (e.jQuery = jt), w;
    }),
    t || (e.jQuery = e.$ = w),
    w
  );
});
