// libraries/dom-morph.
// SystemJS module 4f. Dependencies: none.
$__System.registerDynamic('4f', [], !0, function (e, t, n) {
  this || self;
  var i,
    r = 'http://www.w3.org/1999/xhtml',
    o = 'undefined' == typeof document ? void 0 : document,
    a = o ? o.body || o.createElement('div') : {},
    s = a.hasAttributeNS
      ? function (e, t, n) {
          return e.hasAttributeNS(t, n);
        }
      : a.hasAttribute
        ? function (e, t, n) {
            return e.hasAttribute(n);
          }
        : function (e, t, n) {
            return null != e.getAttributeNode(t, n);
          };
  function l(e, t) {
    var n = e.nodeName,
      i = t.nodeName;
    return (
      n === i ||
      (!!(t.actualize && n.charCodeAt(0) < 91 && i.charCodeAt(0) > 90) && n === i.toUpperCase())
    );
  }
  function c(e, t, n) {
    e[n] !== t[n] && ((e[n] = t[n]), e[n] ? e.setAttribute(n, '') : e.removeAttribute(n, ''));
  }
  var d = {
      OPTION: function (e, t) {
        c(e, t, 'selected');
      },
      INPUT: function (e, t) {
        c(e, t, 'checked'),
          c(e, t, 'disabled'),
          e.value !== t.value && (e.value = t.value),
          s(t, null, 'value') || e.removeAttribute('value');
      },
      TEXTAREA: function (e, t) {
        var n = t.value;
        e.value !== n && (e.value = n);
        var i = e.firstChild;
        if (i) {
          var r = i.nodeValue;
          if (r == n || (!n && r == e.placeholder)) return;
          i.nodeValue = n;
        }
      },
      SELECT: function (e, t) {
        if (!s(t, null, 'multiple')) {
          for (var n = 0, i = t.firstChild; i; ) {
            var r = i.nodeName;
            if (r && 'OPTION' === r.toUpperCase()) {
              if (s(i, null, 'selected')) {
                n;
                break;
              }
              n++;
            }
            i = i.nextSibling;
          }
          e.selectedIndex = n;
        }
      },
    },
    u = 1,
    h = 3,
    p = 8;
  function f() {}
  function m(e) {
    return e.id;
  }
  var g = (function (e) {
    return function (t, n, a) {
      if ((a || (a = {}), 'string' == typeof n))
        if ('#document' === t.nodeName || 'HTML' === t.nodeName) {
          var s = n;
          (n = o.createElement('html')).innerHTML = s;
        } else
          (c = n),
            !i && o.createRange && (i = o.createRange()).selectNode(o.body),
            i && i.createContextualFragment
              ? (g = i.createContextualFragment(c))
              : ((g = o.createElement('body')).innerHTML = c),
            (n = g.childNodes[0]);
      var c,
        g,
        v,
        y = a.getNodeKey || m,
        b = a.onBeforeNodeAdded || f,
        w = a.onNodeAdded || f,
        x = a.onBeforeElUpdated || f,
        C = a.onElUpdated || f,
        F = a.onBeforeNodeDiscarded || f,
        S = a.onNodeDiscarded || f,
        k = a.onBeforeElChildrenUpdated || f,
        E = !0 === a.childrenOnly,
        T = {};
      function _(e) {
        v ? v.push(e) : (v = [e]);
      }
      function A(e, t, n) {
        !1 !== F(e) &&
          (t && t.removeChild(e),
          S(e),
          (function e(t, n) {
            if (t.nodeType === u)
              for (var i = t.firstChild; i; ) {
                var r = void 0;
                n && (r = y(i)) ? _(r) : (S(i), i.firstChild && e(i, n)), (i = i.nextSibling);
              }
          })(e, n));
      }
      function M(e) {
        w(e);
        for (var t = e.firstChild; t; ) {
          var n = t.nextSibling,
            i = y(t);
          if (i) {
            var r = T[i];
            r && l(t, r) && (t.parentNode.replaceChild(r, t), L(r, t));
          }
          M(t), (t = n);
        }
      }
      function L(i, r, a) {
        var s,
          c = y(r);
        if ((c && delete T[c], !n.isSameNode || !n.isSameNode(t))) {
          if (!a) {
            if (!1 === x(i, r)) return;
            if ((e(i, r), C(i), !1 === k(i, r))) return;
          }
          if ('TEXTAREA' !== i.nodeName) {
            var f,
              m,
              g,
              v,
              w = r.firstChild,
              F = i.firstChild;
            e: for (; w; ) {
              for (g = w.nextSibling, f = y(w); F; ) {
                if (((m = F.nextSibling), w.isSameNode && w.isSameNode(F))) {
                  (w = g), (F = m);
                  continue e;
                }
                s = y(F);
                var S = F.nodeType,
                  E = void 0;
                if (
                  (S === w.nodeType &&
                    (S === u
                      ? (f
                          ? f !== s &&
                            ((v = T[f])
                              ? F.nextSibling === v
                                ? (E = !1)
                                : (i.insertBefore(v, F),
                                  (m = F.nextSibling),
                                  s ? _(s) : A(F, i, !0),
                                  (F = v))
                              : (E = !1))
                          : s && (E = !1),
                        (E = !1 !== E && l(F, w)) &&
                          ('svg' == F.tagName && 'svg' == w.tagName
                            ? (E = F.innerHTML == w.innerHTML)
                            : L(F, w)))
                      : (S !== h && S != p) ||
                        ((E = !0), F.nodeValue !== w.nodeValue && (F.nodeValue = w.nodeValue))),
                  E)
                ) {
                  (w = g), (F = m);
                  continue e;
                }
                s ? _(s) : A(F, i, !0), (F = m);
              }
              if (f && (v = T[f]) && l(v, w)) i.appendChild(v), L(v, w);
              else {
                var N = b(w);
                !1 !== N &&
                  (N && (w = N),
                  w.actualize && (w = w.actualize(i.ownerDocument || o)),
                  i.appendChild(w),
                  M(w));
              }
              (w = g), (F = m);
            }
            for (; F; ) (m = F.nextSibling), (s = y(F)) ? _(s) : A(F, i, !0), (F = m);
          }
          var D = d[i.nodeName];
          D && D(i, r);
        }
      }
      !(function e(t) {
        if (t.nodeType === u)
          for (var n = t.firstChild; n; ) {
            var i = y(n);
            i && (T[i] = n), e(n), (n = n.nextSibling);
          }
      })(t);
      var N,
        D,
        R = t,
        B = R.nodeType,
        P = n.nodeType;
      if (!E)
        if (B === u)
          P === u
            ? l(t, n) ||
              (S(t),
              (R = (function (e, t) {
                for (var n = e.firstChild; n; ) {
                  var i = n.nextSibling;
                  t.appendChild(n), (n = i);
                }
                return t;
              })(
                t,
                ((N = n.nodeName),
                (D = n.namespaceURI) && D !== r ? o.createElementNS(D, N) : o.createElement(N)),
              )))
            : (R = n);
        else if (B === h || B === p) {
          if (P === B) return R.nodeValue !== n.nodeValue && (R.nodeValue = n.nodeValue), R;
          R = n;
        }
      if (R === n) S(t);
      else if ((L(R, n, E), v))
        for (var I = 0, O = v.length; I < O; I++) {
          var $ = T[v[I]];
          $ && A($, $.parentNode, !1);
        }
      return (
        !E &&
          R !== t &&
          t.parentNode &&
          (R.actualize && (R = R.actualize(t.ownerDocument || o)), t.parentNode.replaceChild(R, t)),
        R
      );
    };
  })(function (e, t) {
    var n,
      i,
      r,
      o,
      a,
      l = t.attributes;
    for (n = l.length - 1; n >= 0; --n)
      (r = (i = l[n]).name),
        (o = i.namespaceURI),
        (a = i.value),
        o
          ? ((r = i.localName || r), e.getAttributeNS(o, r) !== a && e.setAttributeNS(o, r, a))
          : e.getAttribute(r) !== a && e.setAttribute(r, a);
    for (n = (l = e.attributes).length - 1; n >= 0; --n)
      !1 !== (i = l[n]).specified &&
        ((r = i.name),
        (o = i.namespaceURI)
          ? ((r = i.localName || r), s(t, o, r) || e.removeAttributeNS(o, r))
          : s(t, null, r) || e.removeAttribute(r));
  });
  n.exports = g;
});
