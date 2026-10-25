// libraries/codemirror.
// SystemJS module 20. Dependencies: none.
$__System.registerDynamic('20', [], !0, function (e, t, n) {
  this || self;
  n.exports = (function () {
    'use strict';
    var e = navigator.userAgent,
      t = navigator.platform,
      n = /gecko\/\d/i.test(e),
      i = /MSIE \d/.test(e),
      r = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(e),
      o = /Edge\/(\d+)/.exec(e),
      a = i || r || o,
      s = a && (i ? document.documentMode || 6 : +(o || r)[1]),
      l = !o && /WebKit\//.test(e),
      c = l && /Qt\/\d+\.\d+/.test(e),
      d = !o && /Chrome\//.test(e),
      u = /Opera\//.test(e),
      h = /Apple Computer/.test(navigator.vendor),
      p = /Mac OS X 1\d\D([8-9]|\d\d)\D/.test(e),
      f = /PhantomJS/.test(e),
      m = !o && /AppleWebKit/.test(e) && /Mobile\/\w+/.test(e),
      g = /Android/.test(e),
      v = m || g || /webOS|BlackBerry|Opera Mini|Opera Mobi|IEMobile/i.test(e),
      y = m || /Mac/.test(t),
      b = /\bCrOS\b/.test(e),
      w = /win/i.test(t),
      x = u && e.match(/Version\/(\d*\.\d*)/);
    x && (x = Number(x[1])), x && x >= 15 && ((u = !1), (l = !0));
    var C = y && (c || (u && (null == x || x < 12.11))),
      F = n || (a && s >= 9);
    function S(e) {
      return new RegExp('(^|\\s)' + e + '(?:$|\\s)\\s*');
    }
    var k,
      E = function (e, t) {
        var n = e.className,
          i = S(t).exec(n);
        if (i) {
          var r = n.slice(i.index + i[0].length);
          e.className = n.slice(0, i.index) + (r ? i[1] + r : '');
        }
      };
    function T(e) {
      for (var t = e.childNodes.length; t > 0; --t) e.removeChild(e.firstChild);
      return e;
    }
    function _(e, t) {
      return T(e).appendChild(t);
    }
    function A(e, t, n, i) {
      var r = document.createElement(e);
      if ((n && (r.className = n), i && (r.style.cssText = i), 'string' == typeof t))
        r.appendChild(document.createTextNode(t));
      else if (t) for (var o = 0; o < t.length; ++o) r.appendChild(t[o]);
      return r;
    }
    function M(e, t, n, i) {
      var r = A(e, t, n, i);
      return r.setAttribute('role', 'presentation'), r;
    }
    function L(e, t) {
      if ((3 == t.nodeType && (t = t.parentNode), e.contains)) return e.contains(t);
      do {
        if ((11 == t.nodeType && (t = t.host), t == e)) return !0;
      } while ((t = t.parentNode));
    }
    function N() {
      var e;
      try {
        e = document.activeElement;
      } catch (t) {
        e = document.body || null;
      }
      for (; e && e.shadowRoot && e.shadowRoot.activeElement; ) e = e.shadowRoot.activeElement;
      return e;
    }
    function D(e, t) {
      var n = e.className;
      S(t).test(n) || (e.className += (n ? ' ' : '') + t);
    }
    function R(e, t) {
      for (var n = e.split(' '), i = 0; i < n.length; i++)
        n[i] && !S(n[i]).test(t) && (t += ' ' + n[i]);
      return t;
    }
    k = document.createRange
      ? function (e, t, n, i) {
          var r = document.createRange();
          return r.setEnd(i || e, n), r.setStart(e, t), r;
        }
      : function (e, t, n) {
          var i = document.body.createTextRange();
          try {
            i.moveToElementText(e.parentNode);
          } catch (e) {
            return i;
          }
          return i.collapse(!0), i.moveEnd('character', n), i.moveStart('character', t), i;
        };
    var B = function (e) {
      e.select();
    };
    function P(e) {
      var t = Array.prototype.slice.call(arguments, 1);
      return function () {
        return e.apply(null, t);
      };
    }
    function I(e, t, n) {
      for (var i in (t || (t = {}), e))
        !e.hasOwnProperty(i) || (!1 === n && t.hasOwnProperty(i)) || (t[i] = e[i]);
      return t;
    }
    function O(e, t, n, i, r) {
      null == t && -1 == (t = e.search(/[^\s\u00a0]/)) && (t = e.length);
      for (var o = i || 0, a = r || 0; ; ) {
        var s = e.indexOf('\t', o);
        if (s < 0 || s >= t) return a + (t - o);
        (a += s - o), (a += n - (a % n)), (o = s + 1);
      }
    }
    m
      ? (B = function (e) {
          (e.selectionStart = 0), (e.selectionEnd = e.value.length);
        })
      : a &&
        (B = function (e) {
          try {
            e.select();
          } catch (e) {}
        });
    var $ = function () {
      this.id = null;
    };
    function H(e, t) {
      for (var n = 0; n < e.length; ++n) if (e[n] == t) return n;
      return -1;
    }
    $.prototype.set = function (e, t) {
      clearTimeout(this.id), (this.id = setTimeout(t, e));
    };
    var U = 0,
      j = {
        toString: function () {
          return 'CodeMirror.Pass';
        },
      },
      q = { scroll: !1 },
      W = { origin: '*mouse' },
      z = { origin: '+move' };
    function V(e, t, n) {
      for (var i = 0, r = 0; ; ) {
        var o = e.indexOf('\t', i);
        -1 == o && (o = e.length);
        var a = o - i;
        if (o == e.length || r + a >= t) return i + Math.min(a, t - r);
        if (((r += o - i), (i = o + 1), (r += n - (r % n)) >= t)) return i;
      }
    }
    var J = [''];
    function K(e) {
      for (; J.length <= e; ) J.push(Y(J) + ' ');
      return J[e];
    }
    function Y(e) {
      return e[e.length - 1];
    }
    function G(e, t) {
      for (var n = [], i = 0; i < e.length; i++) n[i] = t(e[i], i);
      return n;
    }
    function Q() {}
    function X(e, t) {
      var n;
      return (
        Object.create ? (n = Object.create(e)) : ((Q.prototype = e), (n = new Q())), t && I(t, n), n
      );
    }
    var Z =
      /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
    function ee(e) {
      return /\w/.test(e) || (e > '' && (e.toUpperCase() != e.toLowerCase() || Z.test(e)));
    }
    function te(e, t) {
      return t ? !!(t.source.indexOf('\\w') > -1 && ee(e)) || t.test(e) : ee(e);
    }
    function ne(e) {
      for (var t in e) if (e.hasOwnProperty(t) && e[t]) return !1;
      return !0;
    }
    var ie =
      /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u065e\u0670\u06d6-\u06dc\u06de-\u06e4\u06e7\u06e8\u06ea-\u06ed\u0711\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0900-\u0902\u093c\u0941-\u0948\u094d\u0951-\u0955\u0962\u0963\u0981\u09bc\u09be\u09c1-\u09c4\u09cd\u09d7\u09e2\u09e3\u0a01\u0a02\u0a3c\u0a41\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a70\u0a71\u0a75\u0a81\u0a82\u0abc\u0ac1-\u0ac5\u0ac7\u0ac8\u0acd\u0ae2\u0ae3\u0b01\u0b3c\u0b3e\u0b3f\u0b41-\u0b44\u0b4d\u0b56\u0b57\u0b62\u0b63\u0b82\u0bbe\u0bc0\u0bcd\u0bd7\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0cbc\u0cbf\u0cc2\u0cc6\u0ccc\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0d3e\u0d41-\u0d44\u0d4d\u0d57\u0d62\u0d63\u0dca\u0dcf\u0dd2-\u0dd4\u0dd6\u0ddf\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0eb9\u0ebb\u0ebc\u0ec8-\u0ecd\u0f18\u0f19\u0f35\u0f37\u0f39\u0f71-\u0f7e\u0f80-\u0f84\u0f86\u0f87\u0f90-\u0f97\u0f99-\u0fbc\u0fc6\u102d-\u1030\u1032-\u1037\u1039\u103a\u103d\u103e\u1058\u1059\u105e-\u1060\u1071-\u1074\u1082\u1085\u1086\u108d\u109d\u135f\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b7-\u17bd\u17c6\u17c9-\u17d3\u17dd\u180b-\u180d\u18a9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193b\u1a17\u1a18\u1a56\u1a58-\u1a5e\u1a60\u1a62\u1a65-\u1a6c\u1a73-\u1a7c\u1a7f\u1b00-\u1b03\u1b34\u1b36-\u1b3a\u1b3c\u1b42\u1b6b-\u1b73\u1b80\u1b81\u1ba2-\u1ba5\u1ba8\u1ba9\u1c2c-\u1c33\u1c36\u1c37\u1cd0-\u1cd2\u1cd4-\u1ce0\u1ce2-\u1ce8\u1ced\u1dc0-\u1de6\u1dfd-\u1dff\u200c\u200d\u20d0-\u20f0\u2cef-\u2cf1\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua66f-\ua672\ua67c\ua67d\ua6f0\ua6f1\ua802\ua806\ua80b\ua825\ua826\ua8c4\ua8e0-\ua8f1\ua926-\ua92d\ua947-\ua951\ua980-\ua982\ua9b3\ua9b6-\ua9b9\ua9bc\uaa29-\uaa2e\uaa31\uaa32\uaa35\uaa36\uaa43\uaa4c\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uabe5\uabe8\uabed\udc00-\udfff\ufb1e\ufe00-\ufe0f\ufe20-\ufe26\uff9e\uff9f]/;
    function re(e) {
      return e.charCodeAt(0) >= 768 && ie.test(e);
    }
    function oe(e, t, n) {
      for (; (n < 0 ? t > 0 : t < e.length) && re(e.charAt(t)); ) t += n;
      return t;
    }
    function ae(e, t, n) {
      for (;;) {
        if (Math.abs(t - n) <= 1) return e(t) ? t : n;
        var i = Math.floor((t + n) / 2);
        e(i) ? (n = i) : (t = i);
      }
    }
    function se(e, t) {
      if ((t -= e.first) < 0 || t >= e.size)
        throw new Error('There is no line ' + (t + e.first) + ' in the document.');
      for (var n = e; !n.lines; )
        for (var i = 0; ; ++i) {
          var r = n.children[i],
            o = r.chunkSize();
          if (t < o) {
            n = r;
            break;
          }
          t -= o;
        }
      return n.lines[t];
    }
    function le(e, t, n) {
      var i = [],
        r = t.line;
      return (
        e.iter(t.line, n.line + 1, function (e) {
          var o = e.text;
          r == n.line && (o = o.slice(0, n.ch)), r == t.line && (o = o.slice(t.ch)), i.push(o), ++r;
        }),
        i
      );
    }
    function ce(e, t, n) {
      var i = [];
      return (
        e.iter(t, n, function (e) {
          i.push(e.text);
        }),
        i
      );
    }
    function de(e, t) {
      var n = t - e.height;
      if (n) for (var i = e; i; i = i.parent) i.height += n;
    }
    function ue(e) {
      if (null == e.parent) return null;
      for (var t = e.parent, n = H(t.lines, e), i = t.parent; i; t = i, i = i.parent)
        for (var r = 0; i.children[r] != t; ++r) n += i.children[r].chunkSize();
      return n + t.first;
    }
    function he(e, t) {
      var n = e.first;
      e: do {
        for (var i = 0; i < e.children.length; ++i) {
          var r = e.children[i],
            o = r.height;
          if (t < o) {
            e = r;
            continue e;
          }
          (t -= o), (n += r.chunkSize());
        }
        return n;
      } while (!e.lines);
      for (var a = 0; a < e.lines.length; ++a) {
        var s = e.lines[a].height;
        if (t < s) break;
        t -= s;
      }
      return n + a;
    }
    function pe(e, t) {
      return t >= e.first && t < e.first + e.size;
    }
    function fe(e, t) {
      return String(e.lineNumberFormatter(t + e.firstLineNumber));
    }
    function me(e, t, n) {
      if ((void 0 === n && (n = null), !(this instanceof me))) return new me(e, t, n);
      (this.line = e), (this.ch = t), (this.sticky = n);
    }
    function ge(e, t) {
      return e.line - t.line || e.ch - t.ch;
    }
    function ve(e, t) {
      return e.sticky == t.sticky && 0 == ge(e, t);
    }
    function ye(e) {
      return me(e.line, e.ch);
    }
    function be(e, t) {
      return ge(e, t) < 0 ? t : e;
    }
    function we(e, t) {
      return ge(e, t) < 0 ? e : t;
    }
    function xe(e, t) {
      return Math.max(e.first, Math.min(t, e.first + e.size - 1));
    }
    function Ce(e, t) {
      if (t.line < e.first) return me(e.first, 0);
      var n = e.first + e.size - 1;
      return t.line > n
        ? me(n, se(e, n).text.length)
        : (function (e, t) {
            var n = e.ch;
            return null == n || n > t ? me(e.line, t) : n < 0 ? me(e.line, 0) : e;
          })(t, se(e, t.line).text.length);
    }
    function Fe(e, t) {
      for (var n = [], i = 0; i < t.length; i++) n[i] = Ce(e, t[i]);
      return n;
    }
    var Se = !1,
      ke = !1;
    function Ee(e, t, n) {
      (this.marker = e), (this.from = t), (this.to = n);
    }
    function Te(e, t) {
      if (e)
        for (var n = 0; n < e.length; ++n) {
          var i = e[n];
          if (i.marker == t) return i;
        }
    }
    function _e(e, t) {
      for (var n, i = 0; i < e.length; ++i) e[i] != t && (n || (n = [])).push(e[i]);
      return n;
    }
    function Ae(e, t) {
      if (t.full) return null;
      var n = pe(e, t.from.line) && se(e, t.from.line).markedSpans,
        i = pe(e, t.to.line) && se(e, t.to.line).markedSpans;
      if (!n && !i) return null;
      var r = t.from.ch,
        o = t.to.ch,
        a = 0 == ge(t.from, t.to),
        s = (function (e, t, n) {
          var i;
          if (e)
            for (var r = 0; r < e.length; ++r) {
              var o = e[r],
                a = o.marker;
              if (
                null == o.from ||
                (a.inclusiveLeft ? o.from <= t : o.from < t) ||
                (o.from == t && 'bookmark' == a.type && (!n || !o.marker.insertLeft))
              ) {
                var s = null == o.to || (a.inclusiveRight ? o.to >= t : o.to > t);
                (i || (i = [])).push(new Ee(a, o.from, s ? null : o.to));
              }
            }
          return i;
        })(n, r, a),
        l = (function (e, t, n) {
          var i;
          if (e)
            for (var r = 0; r < e.length; ++r) {
              var o = e[r],
                a = o.marker;
              if (
                null == o.to ||
                (a.inclusiveRight ? o.to >= t : o.to > t) ||
                (o.from == t && 'bookmark' == a.type && (!n || o.marker.insertLeft))
              ) {
                var s = null == o.from || (a.inclusiveLeft ? o.from <= t : o.from < t);
                (i || (i = [])).push(
                  new Ee(a, s ? null : o.from - t, null == o.to ? null : o.to - t),
                );
              }
            }
          return i;
        })(i, o, a),
        c = 1 == t.text.length,
        d = Y(t.text).length + (c ? r : 0);
      if (s)
        for (var u = 0; u < s.length; ++u) {
          var h = s[u];
          if (null == h.to) {
            var p = Te(l, h.marker);
            p ? c && (h.to = null == p.to ? null : p.to + d) : (h.to = r);
          }
        }
      if (l)
        for (var f = 0; f < l.length; ++f) {
          var m = l[f];
          if ((null != m.to && (m.to += d), null == m.from))
            Te(s, m.marker) || ((m.from = d), c && (s || (s = [])).push(m));
          else (m.from += d), c && (s || (s = [])).push(m);
        }
      s && (s = Me(s)), l && l != s && (l = Me(l));
      var g = [s];
      if (!c) {
        var v,
          y = t.text.length - 2;
        if (y > 0 && s)
          for (var b = 0; b < s.length; ++b)
            null == s[b].to && (v || (v = [])).push(new Ee(s[b].marker, null, null));
        for (var w = 0; w < y; ++w) g.push(v);
        g.push(l);
      }
      return g;
    }
    function Me(e) {
      for (var t = 0; t < e.length; ++t) {
        var n = e[t];
        null != n.from && n.from == n.to && !1 !== n.marker.clearWhenEmpty && e.splice(t--, 1);
      }
      return e.length ? e : null;
    }
    function Le(e) {
      var t = e.markedSpans;
      if (t) {
        for (var n = 0; n < t.length; ++n) t[n].marker.detachLine(e);
        e.markedSpans = null;
      }
    }
    function Ne(e, t) {
      if (t) {
        for (var n = 0; n < t.length; ++n) t[n].marker.attachLine(e);
        e.markedSpans = t;
      }
    }
    function De(e) {
      return e.inclusiveLeft ? -1 : 0;
    }
    function Re(e) {
      return e.inclusiveRight ? 1 : 0;
    }
    function Be(e, t) {
      var n = e.lines.length - t.lines.length;
      if (0 != n) return n;
      var i = e.find(),
        r = t.find(),
        o = ge(i.from, r.from) || De(e) - De(t);
      if (o) return -o;
      var a = ge(i.to, r.to) || Re(e) - Re(t);
      return a || t.id - e.id;
    }
    function Pe(e, t) {
      var n,
        i = ke && e.markedSpans;
      if (i)
        for (var r = void 0, o = 0; o < i.length; ++o)
          (r = i[o]).marker.collapsed &&
            null == (t ? r.from : r.to) &&
            (!n || Be(n, r.marker) < 0) &&
            (n = r.marker);
      return n;
    }
    function Ie(e) {
      return Pe(e, !0);
    }
    function Oe(e) {
      return Pe(e, !1);
    }
    function $e(e, t, n, i, r) {
      var o = se(e, t),
        a = ke && o.markedSpans;
      if (a)
        for (var s = 0; s < a.length; ++s) {
          var l = a[s];
          if (l.marker.collapsed) {
            var c = l.marker.find(0),
              d = ge(c.from, n) || De(l.marker) - De(r),
              u = ge(c.to, i) || Re(l.marker) - Re(r);
            if (
              !((d >= 0 && u <= 0) || (d <= 0 && u >= 0)) &&
              ((d <= 0 &&
                (l.marker.inclusiveRight && r.inclusiveLeft
                  ? ge(c.to, n) >= 0
                  : ge(c.to, n) > 0)) ||
                (d >= 0 &&
                  (l.marker.inclusiveRight && r.inclusiveLeft
                    ? ge(c.from, i) <= 0
                    : ge(c.from, i) < 0)))
            )
              return !0;
          }
        }
    }
    function He(e) {
      for (var t; (t = Ie(e)); ) e = t.find(-1, !0).line;
      return e;
    }
    function Ue(e, t) {
      var n = se(e, t),
        i = He(n);
      return n == i ? t : ue(i);
    }
    function je(e, t) {
      if (t > e.lastLine()) return t;
      var n,
        i = se(e, t);
      if (!qe(e, i)) return t;
      for (; (n = Oe(i)); ) i = n.find(1, !0).line;
      return ue(i) + 1;
    }
    function qe(e, t) {
      var n = ke && t.markedSpans;
      if (n)
        for (var i = void 0, r = 0; r < n.length; ++r)
          if ((i = n[r]).marker.collapsed) {
            if (null == i.from) return !0;
            if (!i.marker.widgetNode && 0 == i.from && i.marker.inclusiveLeft && We(e, t, i))
              return !0;
          }
    }
    function We(e, t, n) {
      if (null == n.to) {
        var i = n.marker.find(1, !0);
        return We(e, i.line, Te(i.line.markedSpans, n.marker));
      }
      if (n.marker.inclusiveRight && n.to == t.text.length) return !0;
      for (var r = void 0, o = 0; o < t.markedSpans.length; ++o)
        if (
          (r = t.markedSpans[o]).marker.collapsed &&
          !r.marker.widgetNode &&
          r.from == n.to &&
          (null == r.to || r.to != n.from) &&
          (r.marker.inclusiveLeft || n.marker.inclusiveRight) &&
          We(e, t, r)
        )
          return !0;
    }
    function ze(e) {
      for (var t = 0, n = (e = He(e)).parent, i = 0; i < n.lines.length; ++i) {
        var r = n.lines[i];
        if (r == e) break;
        t += r.height;
      }
      for (var o = n.parent; o; o = (n = o).parent)
        for (var a = 0; a < o.children.length; ++a) {
          var s = o.children[a];
          if (s == n) break;
          t += s.height;
        }
      return t;
    }
    function Ve(e) {
      if (0 == e.height) return 0;
      for (var t, n = e.text.length, i = e; (t = Ie(i)); ) {
        var r = t.find(0, !0);
        (i = r.from.line), (n += r.from.ch - r.to.ch);
      }
      for (i = e; (t = Oe(i)); ) {
        var o = t.find(0, !0);
        (n -= i.text.length - o.from.ch), (n += (i = o.to.line).text.length - o.to.ch);
      }
      return n;
    }
    function Je(e) {
      var t = e.display,
        n = e.doc;
      (t.maxLine = se(n, n.first)),
        (t.maxLineLength = Ve(t.maxLine)),
        (t.maxLineChanged = !0),
        n.iter(function (e) {
          var n = Ve(e);
          n > t.maxLineLength && ((t.maxLineLength = n), (t.maxLine = e));
        });
    }
    var Ke = null;
    function Ye(e, t, n) {
      var i;
      Ke = null;
      for (var r = 0; r < e.length; ++r) {
        var o = e[r];
        if (o.from < t && o.to > t) return r;
        o.to == t && (o.from != o.to && 'before' == n ? (i = r) : (Ke = r)),
          o.from == t && (o.from != o.to && 'before' != n ? (i = r) : (Ke = r));
      }
      return null != i ? i : Ke;
    }
    var Ge = (function () {
      var e =
          'bbbbbbbbbtstwsbbbbbbbbbbbbbbssstwNN%%%NNNNNN,N,N1111111111NNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNbbbbbbsbbbbbbbbbbbbbbbbbbbbbbbbbb,N%%%%NNNNLNNNNN%%11NLNNN1LNNNNNLLLLLLLLLLLLLLLLLLLLLLLNLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLN',
        t =
          'nnnnnnNNr%%r,rNNmmmmmmmmmmmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnn%nnrrrmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmnNmmmmmmrrmmNmmmmrr1111111111';
      var n = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/,
        i = /[stwN]/,
        r = /[LRr]/,
        o = /[Lb1n]/,
        a = /[1n]/;
      function s(e, t, n) {
        (this.level = e), (this.from = t), (this.to = n);
      }
      return function (l, c) {
        var d = 'ltr' == c ? 'L' : 'R';
        if (0 == l.length || ('ltr' == c && !n.test(l))) return !1;
        for (var u, h = l.length, p = [], f = 0; f < h; ++f)
          p.push(
            (u = l.charCodeAt(f)) <= 247
              ? e.charAt(u)
              : 1424 <= u && u <= 1524
                ? 'R'
                : 1536 <= u && u <= 1785
                  ? t.charAt(u - 1536)
                  : 1774 <= u && u <= 2220
                    ? 'r'
                    : 8192 <= u && u <= 8203
                      ? 'w'
                      : 8204 == u
                        ? 'b'
                        : 'L',
          );
        for (var m = 0, g = d; m < h; ++m) {
          var v = p[m];
          'm' == v ? (p[m] = g) : (g = v);
        }
        for (var y = 0, b = d; y < h; ++y) {
          var w = p[y];
          '1' == w && 'r' == b ? (p[y] = 'n') : r.test(w) && ((b = w), 'r' == w && (p[y] = 'R'));
        }
        for (var x = 1, C = p[0]; x < h - 1; ++x) {
          var F = p[x];
          '+' == F && '1' == C && '1' == p[x + 1]
            ? (p[x] = '1')
            : ',' != F || C != p[x + 1] || ('1' != C && 'n' != C) || (p[x] = C),
            (C = F);
        }
        for (var S = 0; S < h; ++S) {
          var k = p[S];
          if (',' == k) p[S] = 'N';
          else if ('%' == k) {
            var E = void 0;
            for (E = S + 1; E < h && '%' == p[E]; ++E);
            for (
              var T = (S && '!' == p[S - 1]) || (E < h && '1' == p[E]) ? '1' : 'N', _ = S;
              _ < E;
              ++_
            )
              p[_] = T;
            S = E - 1;
          }
        }
        for (var A = 0, M = d; A < h; ++A) {
          var L = p[A];
          'L' == M && '1' == L ? (p[A] = 'L') : r.test(L) && (M = L);
        }
        for (var N = 0; N < h; ++N)
          if (i.test(p[N])) {
            var D = void 0;
            for (D = N + 1; D < h && i.test(p[D]); ++D);
            for (
              var R = 'L' == (N ? p[N - 1] : d),
                B = R == ('L' == (D < h ? p[D] : d)) ? (R ? 'L' : 'R') : d,
                P = N;
              P < D;
              ++P
            )
              p[P] = B;
            N = D - 1;
          }
        for (var I, O = [], $ = 0; $ < h; )
          if (o.test(p[$])) {
            var H = $;
            for (++$; $ < h && o.test(p[$]); ++$);
            O.push(new s(0, H, $));
          } else {
            var U = $,
              j = O.length;
            for (++$; $ < h && 'L' != p[$]; ++$);
            for (var q = U; q < $; )
              if (a.test(p[q])) {
                U < q && O.splice(j, 0, new s(1, U, q));
                var W = q;
                for (++q; q < $ && a.test(p[q]); ++q);
                O.splice(j, 0, new s(2, W, q)), (U = q);
              } else ++q;
            U < $ && O.splice(j, 0, new s(1, U, $));
          }
        return (
          1 == O[0].level &&
            (I = l.match(/^\s+/)) &&
            ((O[0].from = I[0].length), O.unshift(new s(0, 0, I[0].length))),
          1 == Y(O).level &&
            (I = l.match(/\s+$/)) &&
            ((Y(O).to -= I[0].length), O.push(new s(0, h - I[0].length, h))),
          'rtl' == c ? O.reverse() : O
        );
      };
    })();
    function Qe(e, t) {
      var n = e.order;
      return null == n && (n = e.order = Ge(e.text, t)), n;
    }
    function Xe(e, t, n) {
      var i = oe(e.text, t + n, n);
      return i < 0 || i > e.text.length ? null : i;
    }
    function Ze(e, t, n) {
      var i = Xe(e, t.ch, n);
      return null == i ? null : new me(t.line, i, n < 0 ? 'after' : 'before');
    }
    function et(e, t, n, i, r) {
      if (e) {
        var o = Qe(n, t.doc.direction);
        if (o) {
          var a,
            s = r < 0 ? Y(o) : o[0],
            l = r < 0 == (1 == s.level) ? 'after' : 'before';
          if (s.level > 0) {
            var c = Nn(t, n);
            a = r < 0 ? n.text.length - 1 : 0;
            var d = Dn(t, c, a).top;
            (a = ae(
              function (e) {
                return Dn(t, c, e).top == d;
              },
              r < 0 == (1 == s.level) ? s.from : s.to - 1,
              a,
            )),
              'before' == l && (a = Xe(n, a, 1));
          } else a = r < 0 ? s.to : s.from;
          return new me(i, a, l);
        }
      }
      return new me(i, r < 0 ? n.text.length : 0, r < 0 ? 'before' : 'after');
    }
    function tt(e, t, n, i) {
      var r = Qe(t, e.doc.direction);
      if (!r) return Ze(t, n, i);
      n.ch >= t.text.length
        ? ((n.ch = t.text.length), (n.sticky = 'before'))
        : n.ch <= 0 && ((n.ch = 0), (n.sticky = 'after'));
      var o = Ye(r, n.ch, n.sticky),
        a = r[o];
      if ('ltr' == e.doc.direction && a.level % 2 == 0 && (i > 0 ? a.to > n.ch : a.from < n.ch))
        return Ze(t, n, i);
      var s,
        l = function (e, n) {
          return Xe(t, e instanceof me ? e.ch : e, n);
        },
        c = function (n) {
          return e.options.lineWrapping
            ? ((s = s || Nn(e, t)), Qn(e, t, s, n))
            : { begin: 0, end: t.text.length };
        },
        d = c('before' == n.sticky ? l(n, -1) : n.ch);
      if ('rtl' == e.doc.direction || 1 == a.level) {
        var u = (1 == a.level) == i < 0,
          h = l(n, u ? 1 : -1);
        if (null != h && (u ? h <= a.to && h <= d.end : h >= a.from && h >= d.begin)) {
          var p = u ? 'before' : 'after';
          return new me(n.line, h, p);
        }
      }
      var f = function (e, t, i) {
          for (
            var o = function (e, t) {
              return t ? new me(n.line, l(e, 1), 'before') : new me(n.line, e, 'after');
            };
            e >= 0 && e < r.length;
            e += t
          ) {
            var a = r[e],
              s = t > 0 == (1 != a.level),
              c = s ? i.begin : l(i.end, -1);
            if (a.from <= c && c < a.to) return o(c, s);
            if (((c = s ? a.from : l(a.to, -1)), i.begin <= c && c < i.end)) return o(c, s);
          }
        },
        m = f(o + i, i, d);
      if (m) return m;
      var g = i > 0 ? d.end : l(d.begin, -1);
      return null == g ||
        (i > 0 && g == t.text.length) ||
        !(m = f(i > 0 ? 0 : r.length - 1, i, c(g)))
        ? null
        : m;
    }
    var nt = [],
      it = function (e, t, n) {
        if (e.addEventListener) {
          var i =
            File.option.passiveEvents &&
            ('scroll' == t || 'mousewheel' == t || 'DOMMouseScroll' == t);
          e.addEventListener(t, n, !!i && { passive: !0, capture: !1 });
        } else if (e.attachEvent) e.attachEvent('on' + t, n);
        else {
          var r = e._handlers || (e._handlers = {});
          r[t] = (r[t] || nt).concat(n);
        }
      };
    function rt(e, t) {
      return (e._handlers && e._handlers[t]) || nt;
    }
    function ot(e, t, n) {
      if (e.removeEventListener) e.removeEventListener(t, n, !1);
      else if (e.detachEvent) e.detachEvent('on' + t, n);
      else {
        var i = e._handlers,
          r = i && i[t];
        if (r) {
          var o = H(r, n);
          o > -1 && (i[t] = r.slice(0, o).concat(r.slice(o + 1)));
        }
      }
    }
    function at(e, t) {
      var n = rt(e, t);
      if (n.length)
        for (var i = Array.prototype.slice.call(arguments, 2), r = 0; r < n.length; ++r)
          n[r].apply(null, i);
    }
    function st(e, t, n) {
      return (
        'string' == typeof t &&
          (t = {
            type: t,
            preventDefault: function () {
              this.defaultPrevented = !0;
            },
          }),
        at(e, n || t.type, e, t),
        pt(t) || t.codemirrorIgnore
      );
    }
    function lt(e) {
      var t = e._handlers && e._handlers.cursorActivity;
      if (t)
        for (
          var n = e.curOp.cursorActivityHandlers || (e.curOp.cursorActivityHandlers = []), i = 0;
          i < t.length;
          ++i
        )
          -1 == H(n, t[i]) && n.push(t[i]);
    }
    function ct(e, t) {
      return rt(e, t).length > 0;
    }
    function dt(e) {
      (e.prototype.on = function (e, t) {
        it(this, e, t);
      }),
        (e.prototype.off = function (e, t) {
          ot(this, e, t);
        });
    }
    function ut(e) {
      e.preventDefault ? e.preventDefault() : (e.returnValue = !1);
    }
    function ht(e) {
      e.stopPropagation ? e.stopPropagation() : (e.cancelBubble = !0);
    }
    function pt(e) {
      return null != e.defaultPrevented ? e.defaultPrevented : 0 == e.returnValue;
    }
    function ft(e) {
      ut(e), ht(e);
    }
    function mt(e) {
      return e.target || e.srcElement;
    }
    function gt(e) {
      var t = e.which;
      return (
        null == t && (1 & e.button ? (t = 1) : 2 & e.button ? (t = 3) : 4 & e.button && (t = 2)),
        y && e.ctrlKey && 1 == t && (t = 3),
        t
      );
    }
    var vt,
      yt,
      bt = (function () {
        if (a && s < 9) return !1;
        var e = A('div');
        return 'draggable' in e || 'dragDrop' in e;
      })();
    function wt(e) {
      if (null == vt) {
        var t = A('span', '​');
        _(e, A('span', [t, document.createTextNode('x')])),
          0 != e.firstChild.offsetHeight &&
            (vt = t.offsetWidth <= 1 && t.offsetHeight > 2 && !(a && s < 8));
      }
      var n = vt
        ? A('span', '​')
        : A('span', ' ', null, 'display: inline-block; width: 1px; margin-right: -1px');
      return n.setAttribute('cm-text', ''), n.setAttribute('cm-zwsp', ''), n;
    }
    function xt(e) {
      if (null != yt) return yt;
      var t = _(e, document.createTextNode('AخA')),
        n = k(t, 0, 1).getBoundingClientRect(),
        i = k(t, 1, 2).getBoundingClientRect();
      return T(e), !(!n || n.left == n.right) && (yt = i.right - n.right < 3);
    }
    var Ct,
      Ft =
        3 != '\n\nb'.split(/\n/).length
          ? function (e) {
              for (var t = 0, n = [], i = e.length; t <= i; ) {
                var r = e.indexOf('\n', t);
                -1 == r && (r = e.length);
                var o = e.slice(t, '\r' == e.charAt(r - 1) ? r - 1 : r),
                  a = o.indexOf('\r');
                -1 != a ? (n.push(o.slice(0, a)), (t += a + 1)) : (n.push(o), (t = r + 1));
              }
              return n;
            }
          : function (e) {
              return (e || '').split(/\r\n?|\n/);
            },
      St = window.getSelection
        ? function (e) {
            try {
              return e.selectionStart != e.selectionEnd;
            } catch (e) {
              return !1;
            }
          }
        : function (e) {
            var t;
            try {
              t = e.ownerDocument.selection.createRange();
            } catch (e) {}
            return !(!t || t.parentElement() != e) && 0 != t.compareEndPoints('StartToEnd', t);
          },
      kt =
        'oncopy' in (Ct = A('div')) ||
        (Ct.setAttribute('oncopy', 'return;'), 'function' == typeof Ct.oncopy),
      Et = null;
    var Tt = {},
      _t = {};
    function At(e) {
      if ('string' == typeof e && _t.hasOwnProperty(e)) e = _t[e];
      else if (e && 'string' == typeof e.name && _t.hasOwnProperty(e.name)) {
        var t = _t[e.name];
        'string' == typeof t && (t = { name: t }), ((e = X(t, e)).name = t.name);
      } else {
        if ('string' == typeof e && /^[\w\-]+\/[\w\-]+\+xml$/.test(e)) return At('application/xml');
        if ('string' == typeof e && /^[\w\-]+\/[\w\-]+\+json$/.test(e))
          return At('application/json');
      }
      return 'string' == typeof e ? { name: e } : e || { name: 'null' };
    }
    function Mt(e, t) {
      t = At(t);
      var n = Tt[t.name];
      if (!n) return Mt(e, 'text/plain');
      var i = n(e, t);
      if (Lt.hasOwnProperty(t.name)) {
        var r = Lt[t.name];
        for (var o in r)
          r.hasOwnProperty(o) && (i.hasOwnProperty(o) && (i['_' + o] = i[o]), (i[o] = r[o]));
      }
      if (((i.name = t.name), t.helperType && (i.helperType = t.helperType), t.modeProps))
        for (var a in t.modeProps) i[a] = t.modeProps[a];
      return i;
    }
    var Lt = {};
    function Nt(e, t) {
      I(t, Lt.hasOwnProperty(e) ? Lt[e] : (Lt[e] = {}));
    }
    function Dt(e, t) {
      if (!0 === t) return t;
      if (e.copyState) return e.copyState(t);
      var n = {};
      for (var i in t) {
        var r = t[i];
        r instanceof Array && (r = r.concat([])), (n[i] = r);
      }
      return n;
    }
    function Rt(e, t) {
      for (var n; e.innerMode && (n = e.innerMode(t)) && n.mode && n.mode != e; )
        (t = n.state), (e = n.mode);
      return n && !n.mode && (n = void 0), n || { mode: e, state: t };
    }
    function Bt(e, t, n) {
      return !e.startState || e.startState(t, n);
    }
    var Pt = function (e, t) {
      (this.pos = this.start = 0),
        (this.string = e),
        (this.tabSize = t || 8),
        (this.lastColumnPos = this.lastColumnValue = 0),
        (this.lineStart = 0);
    };
    function It(e, t, n, i) {
      var r = [e.state.modeGen],
        o = {},
        a = ue(t);
      'object' == typeof n && ((n.lineBefore = e.getLine(a - 1)), (n.lineAfter = e.getLine(a + 1))),
        zt(
          e,
          t.text,
          e.doc.mode,
          n,
          function (e, t) {
            return r.push(e, t);
          },
          o,
          i,
        );
      for (
        var s = function (i) {
            var a = e.state.overlays[i],
              s = 1,
              l = 0;
            zt(
              e,
              t.text,
              a.mode,
              'visiblespace' !== a.mode.name || n,
              function (e, t) {
                for (var n = s; l < e; ) {
                  var i = r[s];
                  i > e && r.splice(s, 1, e, r[s + 1], i), (s += 2), (l = Math.min(e, i));
                }
                if (t)
                  if (a.opaque) r.splice(n, s - n, e, 'overlay ' + t), (s = n + 2);
                  else
                    for (; n < s; n += 2) {
                      var o = r[n + 1];
                      r[n + 1] = (o ? o + ' ' : '') + 'overlay ' + t;
                    }
              },
              o,
            );
          },
          l = 0;
        l < e.state.overlays.length;
        ++l
      )
        s(l);
      return { styles: r, classes: o.bgClass || o.textClass ? o : null };
    }
    function Ot(e, t, n) {
      if (!t.styles || t.styles[0] != e.state.modeGen) {
        var i = $t(e, ue(t)),
          r = It(e, t, t.text.length > e.options.maxHighlightLength ? Dt(e.doc.mode, i) : i);
        (t.stateAfter = i),
          (t.styles = r.styles),
          r.classes ? (t.styleClasses = r.classes) : t.styleClasses && (t.styleClasses = null),
          n === e.doc.frontier && e.doc.frontier++;
      }
      return t.styles;
    }
    function $t(e, t, n) {
      var i = e.doc,
        r = e.display;
      if (!i.mode.startState) return !0;
      var o = (function (e, t, n) {
          for (
            var i, r, o = e.doc, a = n ? -1 : t - (e.doc.mode.innerMode ? 1e3 : 100), s = t;
            s > a;
            --s
          ) {
            if (s <= o.first) return o.first;
            var l = se(o, s - 1);
            if (l.stateAfter && (!n || s <= o.frontier)) return s;
            var c = O(l.text, null, e.options.tabSize);
            (null == r || i > c) && ((r = s - 1), (i = c));
          }
          return r;
        })(e, t, n),
        a = o > i.first && se(i, o - 1).stateAfter;
      return (
        (a = a ? Dt(i.mode, a) : Bt(i.mode)),
        i.iter(o, t, function (n) {
          'object' == typeof a &&
            ((a.lineBefore = e.getLine(t - 1)), (a.lineAfter = e.getLine(t + 1))),
            Ht(e, n.text, a);
          var s = o == t - 1 || o % 5 == 0 || (o >= r.viewFrom && o < r.viewTo);
          (n.stateAfter = s ? Dt(i.mode, a) : null), ++o;
        }),
        n && (i.frontier = o),
        a
      );
    }
    function Ht(e, t, n, i) {
      var r = e.doc.mode,
        o = new Pt(t, e.options.tabSize);
      for (
        o.start = o.pos = i || 0,
          n.lineBefore = n.lineBefore || '',
          n.lineAfter = n.lineAfter || '',
          '' == t && Ut(r, n);
        !o.eol();
      )
        jt(r, o, n), (o.start = o.pos);
    }
    function Ut(e, t) {
      if (e.blankLine) return e.blankLine(t);
      if (e.innerMode) {
        var n = Rt(e, t);
        return n.mode.blankLine ? n.mode.blankLine(n.state) : void 0;
      }
    }
    function jt(e, t, n, i) {
      for (var r = 0; r < 10; r++) {
        i && (i[0] = Rt(e, n).mode);
        var o = e.token(t, n);
        if (t.pos > t.start) return o;
      }
      if ('gfm' == e.name) return (t.pos = t.start + 1), null;
      throw new Error('Mode ' + e.name + ' failed to advance stream.');
    }
    function qt(e, t, n, i) {
      var r,
        o = function (e) {
          return {
            start: u.start,
            end: u.pos,
            string: u.current(),
            type: r || null,
            state: e ? Dt(a.mode, d) : d,
          };
        },
        a = e.doc,
        s = a.mode;
      t = Ce(a, t);
      var l,
        c = se(a, t.line),
        d = $t(e, t.line, n),
        u = new Pt(c.text, e.options.tabSize);
      for (i && (l = []); (i || u.pos < t.ch) && !u.eol(); )
        (u.start = u.pos), (r = jt(s, u, d)), i && l.push(o(!0));
      return i ? l : o();
    }
    function Wt(e, t) {
      if (e)
        for (;;) {
          var n = e.match(/(?:^|\s+)line-(background-)?(\S+)/);
          if (!n) break;
          e = e.slice(0, n.index) + e.slice(n.index + n[0].length);
          var i = n[1] ? 'bgClass' : 'textClass';
          null == t[i]
            ? (t[i] = n[2])
            : new RegExp('(?:^|s)' + n[2] + '(?:$|s)').test(t[i]) || (t[i] += ' ' + n[2]);
        }
      return e;
    }
    function zt(e, t, n, i, r, o, a) {
      var s = n.flattenSpans;
      null == s && (s = e.options.flattenSpans);
      var l,
        c = 0,
        d = null,
        u = new Pt(t, e.options.tabSize),
        h = e.options.addModeClass && [null];
      for ('' == t && Wt(Ut(n, i), o); !u.eol(); ) {
        if (
          (u.pos > e.options.maxHighlightLength
            ? ((s = !1), a && Ht(e, t, i, u.pos), (u.pos = t.length), (l = null))
            : (l = Wt(jt(n, u, i, h), o)),
          h)
        ) {
          var p = h[0].name;
          p && (l = 'm-' + (l ? p + ' ' + l : p));
        }
        if (!s || d != l) {
          for (; c < u.start; ) r((c = Math.min(u.start, c + 5e3)), d);
          d = l;
        }
        u.start = u.pos;
      }
      for (; c < u.pos; ) {
        var f = Math.min(u.pos, c + 5e3);
        r(f, d), (c = f);
      }
    }
    (Pt.prototype.eol = function () {
      return this.pos >= this.string.length;
    }),
      (Pt.prototype.sol = function () {
        return this.pos == this.lineStart;
      }),
      (Pt.prototype.peek = function () {
        return this.string.charAt(this.pos) || void 0;
      }),
      (Pt.prototype.next = function () {
        if (this.pos < this.string.length) return this.string.charAt(this.pos++);
      }),
      (Pt.prototype.eat = function (e) {
        var t = this.string.charAt(this.pos);
        if ('string' == typeof e ? t == e : t && (e.test ? e.test(t) : e(t))) return ++this.pos, t;
      }),
      (Pt.prototype.eatWhile = function (e) {
        for (var t = this.pos; this.eat(e); );
        return this.pos > t;
      }),
      (Pt.prototype.eatSpace = function () {
        for (var e = this.pos; /[\s\u00a0]/.test(this.string.charAt(this.pos)); ) ++this.pos;
        return this.pos > e;
      }),
      (Pt.prototype.skipToEnd = function () {
        this.pos = this.string.length;
      }),
      (Pt.prototype.skipTo = function (e) {
        var t = this.string.indexOf(e, this.pos);
        if (t > -1) return (this.pos = t), !0;
      }),
      (Pt.prototype.backUp = function (e) {
        this.pos -= e;
      }),
      (Pt.prototype.column = function () {
        return (
          this.lastColumnPos < this.start &&
            ((this.lastColumnValue = O(
              this.string,
              this.start,
              this.tabSize,
              this.lastColumnPos,
              this.lastColumnValue,
            )),
            (this.lastColumnPos = this.start)),
          this.lastColumnValue - (this.lineStart ? O(this.string, this.lineStart, this.tabSize) : 0)
        );
      }),
      (Pt.prototype.indentation = function () {
        return (
          O(this.string, null, this.tabSize) -
          (this.lineStart ? O(this.string, this.lineStart, this.tabSize) : 0)
        );
      }),
      (Pt.prototype.match = function (e, t, n) {
        if ('string' != typeof e) {
          var i = this.string.slice(this.pos).match(e);
          return i && i.index > 0 ? null : (i && !1 !== t && (this.pos += i[0].length), i);
        }
        var r = function (e) {
          return n ? e.toLowerCase() : e;
        };
        if (r(this.string.substr(this.pos, e.length)) == r(e))
          return !1 !== t && (this.pos += e.length), !0;
      }),
      (Pt.prototype.current = function () {
        return this.string.slice(this.start, this.pos);
      }),
      (Pt.prototype.hideFirstChars = function (e, t) {
        this.lineStart += e;
        try {
          return t();
        } finally {
          this.lineStart -= e;
        }
      });
    var Vt = function (e, t, n) {
      (this.text = e), Ne(this, t), (this.height = n ? n(this) : 1);
    };
    function Jt(e) {
      (e.parent = null), Le(e);
    }
    (Vt.prototype.lineNo = function () {
      return ue(this);
    }),
      dt(Vt);
    var Kt = {},
      Yt = {};
    function Gt(e, t) {
      if (!e || /^\s*$/.test(e)) return null;
      var n = t.addModeClass ? Yt : Kt;
      return n[e] || (n[e] = e.replace(/\S+/g, 'cm-$&'));
    }
    function Qt(e, t) {
      var n = M('span', null, null, l ? 'padding-right: .1px' : null),
        i = {
          pre: M('pre', [n], 'CodeMirror-line'),
          content: n,
          col: 0,
          pos: 0,
          cm: e,
          trailingSpace: !1,
          splitSpaces: (a || l) && e.getOption('lineWrapping'),
        };
      t.measure = {};
      for (var r = 0; r <= (t.rest ? t.rest.length : 0); r++) {
        var o = r ? t.rest[r - 1] : t.line,
          s = void 0;
        (i.pos = 0),
          (i.addToken = Zt),
          xt(e.display.measure) && (s = Qe(o, e.doc.direction)) && (i.addToken = en(i.addToken, s)),
          (i.map = []),
          nn(o, i, Ot(e, o, t != e.display.externalMeasured && ue(o))),
          o.styleClasses &&
            (o.styleClasses.bgClass && (i.bgClass = R(o.styleClasses.bgClass, i.bgClass || '')),
            o.styleClasses.textClass &&
              (i.textClass = R(o.styleClasses.textClass, i.textClass || ''))),
          0 == i.map.length && i.map.push(0, 0, i.content.appendChild(wt(e.display.measure))),
          0 == r
            ? ((t.measure.map = i.map), (t.measure.cache = {}))
            : ((t.measure.maps || (t.measure.maps = [])).push(i.map),
              (t.measure.caches || (t.measure.caches = [])).push({}));
      }
      if (l) {
        var c = i.content.lastChild;
        (/\bcm-tab\b/.test(c.className) || (c.querySelector && c.querySelector('.cm-tab'))) &&
          (i.content.className = 'cm-tab-wrap-hack');
      }
      return (
        at(e, 'renderLine', e, t.line, i.pre),
        i.pre.className && (i.textClass = R(i.pre.className, i.textClass || '')),
        i
      );
    }
    function Xt(e) {
      var t = A('span', '•', 'cm-invalidchar');
      return (
        (t.title = '\\u' + e.charCodeAt(0).toString(16)), t.setAttribute('aria-label', t.title), t
      );
    }
    function Zt(e, t, n, i, r, o, l) {
      if (t) {
        var c,
          d = e.splitSpaces
            ? (function (e, t) {
                if (e.length > 1 && !/  /.test(e)) return e;
                for (var n = t, i = '', r = 0; r < e.length; r++) {
                  var o = e.charAt(r);
                  ' ' != o || !n || (r != e.length - 1 && 32 != e.charCodeAt(r + 1)) || (o = ' '),
                    (i += o),
                    (n = ' ' == o);
                }
                return i;
              })(t, e.trailingSpace)
            : t,
          u = e.cm.state.specialChars,
          h = !1;
        if (u.test(t)) {
          c = document.createDocumentFragment();
          for (var p = 0; ; ) {
            u.lastIndex = p;
            var f = u.exec(t),
              m = f ? f.index - p : t.length - p;
            if (m) {
              var g = document.createTextNode(d.slice(p, p + m));
              a && s < 9 ? c.appendChild(A('span', [g])) : c.appendChild(g),
                e.map.push(e.pos, e.pos + m, g),
                (e.col += m),
                (e.pos += m);
            }
            if (!f) break;
            p += m + 1;
            var v = void 0;
            if ('\t' == f[0]) {
              var y = e.cm.options.tabSize,
                b = y - (e.col % y);
              (v = c.appendChild(A('span', K(b), 'cm-tab'))).setAttribute('role', 'presentation'),
                v.setAttribute('cm-text', '\t'),
                (e.col += b);
            } else
              '\r' == f[0] || '\n' == f[0]
                ? ((v = c.appendChild(
                    A('span', '\r' == f[0] ? '␍' : '␤', 'cm-invalidchar'),
                  )).setAttribute('cm-text', f[0]),
                  (e.col += 1))
                : ((v = e.cm.options.specialCharPlaceholder(f[0])).setAttribute('cm-text', f[0]),
                  a && s < 9 ? c.appendChild(A('span', [v])) : c.appendChild(v),
                  (e.col += 1));
            e.map.push(e.pos, e.pos + 1, v), e.pos++;
          }
        } else
          (e.col += t.length),
            (c = document.createTextNode(d)),
            e.map.push(e.pos, e.pos + t.length, c),
            a && s < 9 && (h = !0),
            (e.pos += t.length);
        if (((e.trailingSpace = 32 == d.charCodeAt(t.length - 1)), n || i || r || h || l)) {
          var w = n || '';
          i && (w += i), r && (w += r);
          var x = A('span', [c], w, l);
          return o && (x.title = o), e.content.appendChild(x);
        }
        e.content.appendChild(c);
      }
    }
    function en(e, t) {
      return function (n, i, r, o, a, s, l) {
        r = r ? r + ' cm-force-border' : 'cm-force-border';
        for (var c = n.pos, d = c + i.length; ; ) {
          for (var u = void 0, h = 0; h < t.length && !((u = t[h]).to > c && u.from <= c); h++);
          if (u.to >= d) return e(n, i, r, o, a, s, l);
          e(n, i.slice(0, u.to - c), r, o, null, s, l),
            (o = null),
            (i = i.slice(u.to - c)),
            (c = u.to);
        }
      };
    }
    function tn(e, t, n, i) {
      var r = !i && n.widgetNode;
      r && e.map.push(e.pos, e.pos + t, r),
        !i &&
          e.cm.display.input.needsContentAttribute &&
          (r || (r = e.content.appendChild(document.createElement('span'))),
          r.setAttribute('cm-marker', n.id)),
        r && (e.cm.display.input.setUneditable(r), e.content.appendChild(r)),
        (e.pos += t),
        (e.trailingSpace = !1);
    }
    function nn(e, t, n) {
      var i = e.markedSpans,
        r = e.text,
        o = 0;
      if (i)
        for (var a, s, l, c, d, u, h, p = r.length, f = 0, m = 1, g = '', v = 0; ; ) {
          if (v == f) {
            (l = c = d = u = s = ''), (h = null), (v = 1 / 0);
            for (var y = [], b = void 0, w = 0; w < i.length; ++w) {
              var x = i[w],
                C = x.marker;
              'bookmark' == C.type && x.from == f && C.widgetNode
                ? y.push(C)
                : x.from <= f &&
                    (null == x.to || x.to > f || (C.collapsed && x.to == f && x.from == f))
                  ? (null != x.to && x.to != f && v > x.to && ((v = x.to), (c = '')),
                    C.className && (l += ' ' + C.className),
                    C.css && (s = (s ? s + ';' : '') + C.css),
                    C.startStyle && x.from == f && (d += ' ' + C.startStyle),
                    C.endStyle && x.to == v && (b || (b = [])).push(C.endStyle, x.to),
                    C.title && !u && (u = C.title),
                    C.collapsed && (!h || Be(h.marker, C) < 0) && (h = x))
                  : x.from > f && v > x.from && (v = x.from);
            }
            if (b) for (var F = 0; F < b.length; F += 2) b[F + 1] == v && (c += ' ' + b[F]);
            if (!h || h.from == f) for (var S = 0; S < y.length; ++S) tn(t, 0, y[S]);
            if (h && (h.from || 0) == f) {
              if (
                (tn(t, (null == h.to ? p + 1 : h.to) - f, h.marker, null == h.from), null == h.to)
              )
                return;
              h.to == f && (h = !1);
            }
          }
          if (f >= p) break;
          for (var k = Math.min(p, v); ; ) {
            if (g) {
              var E = f + g.length;
              if (!h) {
                var T = E > k ? g.slice(0, k - f) : g;
                t.addToken(t, T, a ? a + l : l, d, f + T.length == v ? c : '', u, s);
              }
              if (E >= k) {
                (g = g.slice(k - f)), (f = k);
                break;
              }
              (f = E), (d = '');
            }
            (g = r.slice(o, (o = n[m++]))), (a = Gt(n[m++], t.cm.options));
          }
        }
      else
        for (var _ = 1; _ < n.length; _ += 2)
          t.addToken(t, r.slice(o, (o = n[_])), Gt(n[_ + 1], t.cm.options));
    }
    function rn(e, t, n) {
      (this.line = t),
        (this.rest = (function (e) {
          for (var t, n; (t = Oe(e)); ) (e = t.find(1, !0).line), (n || (n = [])).push(e);
          return n;
        })(t)),
        (this.size = this.rest ? ue(Y(this.rest)) - n + 1 : 1),
        (this.node = this.text = null),
        (this.hidden = qe(e, t));
    }
    function on(e, t, n) {
      for (var i, r = [], o = t; o < n; o = i) {
        var a = new rn(e.doc, se(e.doc, o), o);
        (i = o + a.size), r.push(a);
      }
      return r;
    }
    var an = null;
    var sn = null;
    function ln(e, t) {
      var n = rt(e, t);
      if (n.length) {
        var i,
          r = Array.prototype.slice.call(arguments, 2);
        an ? (i = an.delayedCallbacks) : sn ? (i = sn) : ((i = sn = []), setTimeout(cn, 0));
        for (
          var o = function (e) {
              i.push(function () {
                return n[e].apply(null, r);
              });
            },
            a = 0;
          a < n.length;
          ++a
        )
          o(a);
      }
    }
    function cn() {
      var e = sn;
      sn = null;
      for (var t = 0; t < e.length; ++t) e[t]();
    }
    function dn(e, t, n, i) {
      for (var r = 0; r < t.changes.length; r++) {
        var o = t.changes[r];
        'text' == o
          ? pn(e, t)
          : 'gutter' == o
            ? mn(e, t, n, i)
            : 'class' == o
              ? fn(e, t)
              : 'widget' == o && gn(e, t, i);
      }
      t.changes = null;
    }
    function un(e) {
      return (
        e.node == e.text &&
          ((e.node = A('div', null, null, 'position: relative')),
          e.text.parentNode && e.text.parentNode.replaceChild(e.node, e.text),
          e.node.appendChild(e.text),
          a && s < 8 && (e.node.style.zIndex = 2)),
        e.node
      );
    }
    function hn(e, t) {
      var n = e.display.externalMeasured;
      return n && n.line == t.line
        ? ((e.display.externalMeasured = null), (t.measure = n.measure), n.built)
        : Qt(e, t);
    }
    function pn(e, t) {
      var n = t.text.className,
        i = hn(e, t);
      t.text == t.node && (t.node = i.pre),
        t.text.parentNode.replaceChild(i.pre, t.text),
        (t.text = i.pre),
        i.bgClass != t.bgClass || i.textClass != t.textClass
          ? ((t.bgClass = i.bgClass), (t.textClass = i.textClass), fn(e, t))
          : n && (t.text.className = n);
    }
    function fn(e, t) {
      !(function (e, t) {
        var n = t.bgClass ? t.bgClass + ' ' + (t.line.bgClass || '') : t.line.bgClass;
        if ((n && (n += ' CodeMirror-linebackground'), t.background))
          n
            ? (t.background.className = n)
            : (t.background.parentNode.removeChild(t.background), (t.background = null));
        else if (n) {
          var i = un(t);
          (t.background = i.insertBefore(A('div', null, n), i.firstChild)),
            e.display.input.setUneditable(t.background);
        }
      })(e, t),
        t.line.wrapClass
          ? (un(t).className = t.line.wrapClass)
          : t.node != t.text && (t.node.className = '');
      var n = t.textClass ? t.textClass + ' ' + (t.line.textClass || '') : t.line.textClass;
      t.text.className = n || '';
    }
    function mn(e, t, n, i) {
      if (
        (t.gutter && (t.node.removeChild(t.gutter), (t.gutter = null)),
        t.gutterBackground && (t.node.removeChild(t.gutterBackground), (t.gutterBackground = null)),
        t.line.gutterClass)
      ) {
        var r = un(t);
        (t.gutterBackground = A(
          'div',
          null,
          'CodeMirror-gutter-background ' + t.line.gutterClass,
          'left: ' +
            (e.options.fixedGutter ? i.fixedPos : -i.gutterTotalWidth) +
            'px; width: ' +
            i.gutterTotalWidth +
            'px',
        )),
          e.display.input.setUneditable(t.gutterBackground),
          r.insertBefore(t.gutterBackground, t.text);
      }
      var o = t.line.gutterMarkers;
      if (e.options.lineNumbers || o) {
        var a =
            0 === n || n === e.lineCount() - 1 || (n + 1) % 10 == 0
              ? ' CodeMirror-linenumber-show'
              : '',
          s = un(t),
          l = (t.gutter = A(
            'div',
            null,
            'CodeMirror-gutter-wrapper',
            'left: ' + (e.options.fixedGutter ? i.fixedPos : -i.gutterTotalWidth) + 'px',
          ));
        if (
          (e.display.input.setUneditable(l),
          s.insertBefore(l, t.text),
          t.line.gutterClass && (l.className += ' ' + t.line.gutterClass),
          !e.options.lineNumbers ||
            (o && o['CodeMirror-linenumbers']) ||
            (t.lineNumber = l.appendChild(
              A(
                'div',
                fe(e.options, n),
                'CodeMirror-linenumber CodeMirror-gutter-elt' + a,
                'left: ' +
                  i.gutterLeft['CodeMirror-linenumbers'] +
                  'px; width: ' +
                  e.display.lineNumInnerWidth +
                  'px',
              ),
            )),
          o)
        )
          for (var c = 0; c < e.options.gutters.length; ++c) {
            var d = e.options.gutters[c],
              u = o.hasOwnProperty(d) && o[d];
            u &&
              l.appendChild(
                A(
                  'div',
                  [u],
                  'CodeMirror-gutter-elt',
                  'left: ' + i.gutterLeft[d] + 'px; width: ' + i.gutterWidth[d] + 'px',
                ),
              );
          }
      }
    }
    function gn(e, t, n) {
      t.alignable && (t.alignable = null);
      for (var i = t.node.firstChild, r = void 0; i; i = r)
        (r = i.nextSibling), 'CodeMirror-linewidget' == i.className && t.node.removeChild(i);
      yn(e, t, n);
    }
    function vn(e, t, n, i) {
      var r = hn(e, t);
      return (
        (t.text = t.node = r.pre),
        r.bgClass && (t.bgClass = r.bgClass),
        r.textClass && (t.textClass = r.textClass),
        fn(e, t),
        mn(e, t, n, i),
        yn(e, t, i),
        t.node
      );
    }
    function yn(e, t, n) {
      if ((bn(e, t.line, t, n, !0), t.rest))
        for (var i = 0; i < t.rest.length; i++) bn(e, t.rest[i], t, n, !1);
    }
    function bn(e, t, n, i, r) {
      if (t.widgets)
        for (var o = un(n), a = 0, s = t.widgets; a < s.length; ++a) {
          var l = s[a],
            c = A('div', [l.node], 'CodeMirror-linewidget');
          l.handleMouseEvents || c.setAttribute('cm-ignore-events', 'true'),
            wn(l, c, n, i),
            e.display.input.setUneditable(c),
            r && l.above ? o.insertBefore(c, n.gutter || n.text) : o.appendChild(c),
            ln(l, 'redraw');
        }
    }
    function wn(e, t, n, i) {
      if (e.noHScroll) {
        (n.alignable || (n.alignable = [])).push(t);
        var r = i.wrapperWidth;
        (t.style.left = i.fixedPos + 'px'),
          e.coverGutter ||
            ((r -= i.gutterTotalWidth), (t.style.paddingLeft = i.gutterTotalWidth + 'px')),
          (t.style.width = r + 'px');
      }
      e.coverGutter &&
        ((t.style.zIndex = 5),
        (t.style.position = 'relative'),
        e.noHScroll || (t.style.marginLeft = -i.gutterTotalWidth + 'px'));
    }
    function xn(e) {
      if (null != e.height) return e.height;
      var t = e.doc.cm;
      if (!t) return 0;
      if (!L(document.body, e.node)) {
        var n = 'position: relative;';
        e.coverGutter && (n += 'margin-left: -' + t.display.gutters.offsetWidth + 'px;'),
          e.noHScroll && (n += 'width: ' + t.display.wrapper.clientWidth + 'px;'),
          _(t.display.measure, A('div', [e.node], null, n));
      }
      return (e.height = e.node.parentNode.offsetHeight);
    }
    function Cn(e, t, n) {
      for (var i = mt(t); i != e.wrapper; i = i.parentNode) {
        if (
          n &&
          i == t.target &&
          i == e.scroller &&
          e.scroller.scrollWidth > e.scroller.clientWidth &&
          e.scroller.getBoundingClientRect().bottom < t.clientY + 20
        )
          return !0;
        if (
          !i ||
          (1 == i.nodeType && 'true' == i.getAttribute('cm-ignore-events')) ||
          (i.parentNode == e.sizer && i != e.mover)
        )
          return !0;
      }
    }
    function Fn(e) {
      return e.lineSpace.offsetTop;
    }
    function Sn(e) {
      return e.mover.offsetHeight - e.lineSpace.offsetHeight;
    }
    function kn(e) {
      if (e.cachedPaddingH) return e.cachedPaddingH;
      var t = _(e.measure, A('pre', 'x')),
        n = window.getComputedStyle ? window.getComputedStyle(t) : t.currentStyle,
        i = { left: parseInt(n.paddingLeft), right: parseInt(n.paddingRight) };
      return isNaN(i.left) || isNaN(i.right) || (e.cachedPaddingH = i), i;
    }
    function En(e) {
      return U - e.display.nativeBarWidth;
    }
    function Tn(e) {
      return e.display.scroller.clientWidth - En(e) - e.display.barWidth;
    }
    function _n(e) {
      return e.display.scroller.clientHeight - En(e) - e.display.barHeight;
    }
    function An(e, t, n) {
      if (e.line == t) return { map: e.measure.map, cache: e.measure.cache };
      for (var i = 0; i < e.rest.length; i++)
        if (e.rest[i] == t) return { map: e.measure.maps[i], cache: e.measure.caches[i] };
      for (var r = 0; r < e.rest.length; r++)
        if (ue(e.rest[r]) > n)
          return { map: e.measure.maps[r], cache: e.measure.caches[r], before: !0 };
    }
    function Mn(e, t, n, i) {
      return Dn(e, Nn(e, t), n, i);
    }
    function Ln(e, t) {
      if (t >= e.display.viewFrom && t < e.display.viewTo) return e.display.view[ai(e, t)];
      var n = e.display.externalMeasured;
      return n && t >= n.lineN && t < n.lineN + n.size ? n : void 0;
    }
    function Nn(e, t) {
      var n = ue(t),
        i = Ln(e, n);
      i && !i.text
        ? (i = null)
        : i && i.changes && (dn(e, i, n, ti(e)), (e.curOp.forceUpdate = !0)),
        i ||
          (i = (function (e, t) {
            var n = ue((t = He(t))),
              i = (e.display.externalMeasured = new rn(e.doc, t, n));
            i.lineN = n;
            var r = (i.built = Qt(e, i));
            return (i.text = r.pre), _(e.display.lineMeasure, r.pre), i;
          })(e, t));
      var r = An(i, t, n);
      return {
        line: t,
        view: i,
        rect: null,
        map: r.map,
        cache: r.cache,
        before: r.before,
        hasHeights: !1,
      };
    }
    function Dn(e, t, n, i, r) {
      t.before && (n = -1);
      var o,
        l = n + (i || '');
      return (
        t.cache.hasOwnProperty(l)
          ? (o = t.cache[l])
          : (t.rect || (t.rect = t.view.text.getBoundingClientRect()),
            t.hasHeights ||
              (!(function (e, t, n) {
                var i = e.options.lineWrapping,
                  r = i && Tn(e);
                if (!t.measure.heights || (i && t.measure.width != r)) {
                  var o = (t.measure.heights = []);
                  if (i) {
                    t.measure.width = r;
                    for (var a = t.text.firstChild.getClientRects(), s = 0; s < a.length - 1; s++) {
                      var l = a[s],
                        c = a[s + 1];
                      Math.abs(l.bottom - c.bottom) > 2 && o.push((l.bottom + c.top) / 2 - n.top);
                    }
                  }
                  o.push(n.bottom - n.top);
                }
              })(e, t.view, t.rect),
              (t.hasHeights = !0)),
            (o = (function (e, t, n, i) {
              var r,
                o = Pn(t.map, n, i),
                l = o.node,
                c = o.start,
                d = o.end,
                u = o.collapse;
              if (3 == l.nodeType) {
                for (var h = 0; h < 4; h++) {
                  for (; c && re(t.line.text.charAt(o.coverStart + c)); ) --c;
                  for (
                    ;
                    o.coverStart + d < o.coverEnd && re(t.line.text.charAt(o.coverStart + d));
                  )
                    ++d;
                  if (
                    (r =
                      a && s < 9 && 0 == c && d == o.coverEnd - o.coverStart
                        ? l.parentNode.getBoundingClientRect()
                        : In(k(l, c, d).getClientRects(), i)).left ||
                    r.right ||
                    0 == c
                  )
                    break;
                  (d = c), (c -= 1), (u = 'right');
                }
                a &&
                  s < 11 &&
                  (r = (function (e, t) {
                    if (
                      !window.screen ||
                      null == screen.logicalXDPI ||
                      screen.logicalXDPI == screen.deviceXDPI ||
                      !(function (e) {
                        if (null != Et) return Et;
                        var t = _(e, A('span', 'x')),
                          n = t.getBoundingClientRect(),
                          i = k(t, 0, 1).getBoundingClientRect();
                        return (Et = Math.abs(n.left - i.left) > 1);
                      })(e)
                    )
                      return t;
                    var n = screen.logicalXDPI / screen.deviceXDPI,
                      i = screen.logicalYDPI / screen.deviceYDPI;
                    return {
                      left: t.left * n,
                      right: t.right * n,
                      top: t.top * i,
                      bottom: t.bottom * i,
                    };
                  })(e.display.measure, r));
              } else {
                var p;
                c > 0 && (u = i = 'right'),
                  (r =
                    e.options.lineWrapping && (p = l.getClientRects()).length > 1
                      ? p['right' == i ? p.length - 1 : 0]
                      : l.getBoundingClientRect());
              }
              if (a && s < 9 && !c && (!r || (!r.left && !r.right))) {
                var f = l.parentNode.getClientRects()[0];
                r = f
                  ? { left: f.left, right: f.left + ei(e.display), top: f.top, bottom: f.bottom }
                  : Bn;
              }
              for (
                var m = r.top - t.rect.top,
                  g = r.bottom - t.rect.top,
                  v = (m + g) / 2,
                  y = t.view.measure.heights,
                  b = 0;
                b < y.length - 1 && !(v < y[b]);
                b++
              );
              var w = b ? y[b - 1] : 0,
                x = y[b],
                C = {
                  left: ('right' == u ? r.right : r.left) - t.rect.left,
                  right: ('left' == u ? r.left : r.right) - t.rect.left,
                  top: w,
                  bottom: x,
                };
              r.left || r.right || (C.bogus = !0);
              e.options.singleCursorHeightPerLine || ((C.rtop = m), (C.rbottom = g));
              return C;
            })(e, t, n, i)).bogus || (t.cache[l] = o)),
        { left: o.left, right: o.right, top: r ? o.rtop : o.top, bottom: r ? o.rbottom : o.bottom }
      );
    }
    var Rn,
      Bn = { left: 0, right: 0, top: 0, bottom: 0 };
    function Pn(e, t, n) {
      for (var i, r, o, a, s, l, c = 0; c < e.length; c += 3)
        if (
          ((s = e[c]),
          (l = e[c + 1]),
          t < s
            ? ((r = 0), (o = 1), (a = 'left'))
            : t < l
              ? (o = (r = t - s) + 1)
              : (c == e.length - 3 || (t == l && e[c + 3] > t)) &&
                ((r = (o = l - s) - 1), t >= l && (a = 'right')),
          null != r)
        ) {
          if (
            ((i = e[c + 2]),
            s == l && n == (i.insertLeft ? 'left' : 'right') && (a = n),
            'left' == n && 0 == r)
          )
            for (; c && e[c - 2] == e[c - 3] && e[c - 1].insertLeft; )
              (i = e[2 + (c -= 3)]), (a = 'left');
          if ('right' == n && r == l - s)
            for (; c < e.length - 3 && e[c + 3] == e[c + 4] && !e[c + 5].insertLeft; )
              (i = e[(c += 3) + 2]), (a = 'right');
          break;
        }
      return { node: i, start: r, end: o, collapse: a, coverStart: s, coverEnd: l };
    }
    function In(e, t) {
      var n = Bn;
      if ('left' == t) for (var i = 0; i < e.length && (n = e[i]).left == n.right; i++);
      else for (var r = e.length - 1; r >= 0 && (n = e[r]).left == n.right; r--);
      return n;
    }
    function On(e) {
      if (e.measure && ((e.measure.cache = {}), (e.measure.heights = null), e.rest))
        for (var t = 0; t < e.rest.length; t++) e.measure.caches[t] = {};
    }
    function $n(e) {
      (e.display.externalMeasure = null), T(e.display.lineMeasure);
      for (var t = 0; t < e.display.view.length; t++) On(e.display.view[t]);
    }
    function Hn(e) {
      $n(e),
        (e.display.cachedCharWidth = e.display.cachedTextHeight = e.display.cachedPaddingH = null),
        e.options.lineWrapping || (e.display.maxLineChanged = !0),
        (e.display.lineNumChars = null);
    }
    function Un() {
      return d && g
        ? -(
            document.body.getBoundingClientRect().left -
            parseInt(getComputedStyle(document.body).marginLeft)
          )
        : window.pageXOffset || (document.documentElement || document.body).scrollLeft;
    }
    function jn() {
      return d && g
        ? -(
            document.body.getBoundingClientRect().top -
            parseInt(getComputedStyle(document.body).marginTop)
          )
        : window.pageYOffset || (document.documentElement || document.body).scrollTop;
    }
    function qn(e, t, n, i, r) {
      if (!r && t.widgets)
        for (var o = 0; o < t.widgets.length; ++o)
          if (t.widgets[o].above) {
            var a = xn(t.widgets[o]);
            (n.top += a), (n.bottom += a);
          }
      if ('line' == i) return n;
      i || (i = 'local');
      var s = ze(t);
      if (
        ('local' == i ? (s += Fn(e.display)) : (s -= e.display.viewOffset),
        'page' == i || 'window' == i)
      ) {
        var l = e.display.lineSpace.getBoundingClientRect();
        s += l.top + ('window' == i ? 0 : jn());
        var c = l.left + ('window' == i ? 0 : Un());
        (n.left += c), (n.right += c);
      }
      return (n.top += s), (n.bottom += s), n;
    }
    function Wn(e, t, n) {
      if ('div' == n) return t;
      var i = t.left,
        r = t.top;
      if ('page' == n) (i -= Un()), (r -= jn());
      else if ('local' == n || !n) {
        var o = e.display.sizer.getBoundingClientRect();
        (i += o.left), (r += o.top);
      }
      var a = e.display.lineSpace.getBoundingClientRect();
      return { left: i - a.left, top: r - a.top };
    }
    function zn(e, t, n, i, r) {
      return i || (i = se(e.doc, t.line)), qn(e, i, Mn(e, i, t.ch, r), n);
    }
    function Vn(e, t, n, i, r, o) {
      function a(t, a) {
        var s = Dn(e, r, t, a ? 'right' : 'left', o);
        return a ? (s.left = s.right) : (s.right = s.left), qn(e, i, s, n);
      }
      (i = i || se(e.doc, t.line)), r || (r = Nn(e, i));
      var s = Qe(i, e.doc.direction),
        l = t.ch,
        c = t.sticky;
      if (
        (l >= i.text.length
          ? ((l = i.text.length), (c = 'before'))
          : l <= 0 && ((l = 0), (c = 'after')),
        !s)
      )
        return a('before' == c ? l - 1 : l, 'before' == c);
      function d(e, t, n) {
        var i = s[t].level % 2 != 0;
        return a(n ? e - 1 : e, i != n);
      }
      var u = Ye(s, l, c),
        h = Ke,
        p = d(l, u, 'before' == c);
      return null != h && (p.other = d(l, h, 'before' != c)), p;
    }
    function Jn(e, t) {
      var n = 0;
      (t = Ce(e.doc, t)), e.options.lineWrapping || (n = ei(e.display) * t.ch);
      var i = se(e.doc, t.line),
        r = ze(i) + Fn(e.display);
      return { left: n, right: n, top: r, bottom: r + i.height };
    }
    function Kn(e, t, n, i, r) {
      var o = me(e, t, n);
      return (o.xRel = r), i && (o.outside = !0), o;
    }
    function Yn(e, t, n) {
      var i = e.doc;
      if ((n += e.display.viewOffset) < 0) return Kn(i.first, 0, null, !0, -1);
      var r = he(i, n),
        o = i.first + i.size - 1;
      if (r > o) return Kn(i.first + i.size - 1, se(i, o).text.length, null, !0, 1);
      t < 0 && (t = 0);
      for (var a = se(i, r); ; ) {
        var s = Xn(e, a, r, t, n),
          l = Oe(a),
          c = l && l.find(0, !0);
        if (!l || !(s.ch > c.from.ch || (s.ch == c.from.ch && s.xRel > 0))) return s;
        r = ue((a = c.to.line));
      }
    }
    function Gn(e, t, n, i) {
      var r = function (i) {
          return qn(e, t, Dn(e, n, i), 'line');
        },
        o = t.text.length,
        a = ae(
          function (e) {
            return r(e - 1).bottom <= i;
          },
          o,
          0,
        );
      return {
        begin: a,
        end: (o = ae(
          function (e) {
            return r(e).top > i;
          },
          a,
          o,
        )),
      };
    }
    function Qn(e, t, n, i) {
      return Gn(e, t, n, qn(e, t, Dn(e, n, i), 'line').top);
    }
    function Xn(e, t, n, i, r) {
      r -= ze(t);
      var o,
        a = 0,
        s = t.text.length,
        l = Nn(e, t);
      if (Qe(t, e.doc.direction)) {
        var c;
        if (e.options.lineWrapping) (a = (c = Gn(e, t, l, r)).begin), (s = c.end);
        o = new me(n, a);
        var d,
          u,
          h = Vn(e, o, 'line', t, l).left,
          p = h < i ? 1 : -1,
          f = h - i;
        do {
          if (
            ((d = f),
            (u = o),
            null == (o = tt(e, t, o, p)) ||
              o.ch < a ||
              s <= ('before' == o.sticky ? o.ch - 1 : o.ch))
          ) {
            o = u;
            break;
          }
          f = Vn(e, o, 'line', t, l).left - i;
        } while (p < 0 != f < 0 && Math.abs(f) <= Math.abs(d));
        if (Math.abs(f) > Math.abs(d)) {
          if (f < 0 == d < 0) throw new Error('Broke out of infinite loop in coordsCharInner');
          o = u;
        }
      } else {
        var m = ae(
          function (n) {
            var o = qn(e, t, Dn(e, l, n), 'line');
            return o.top > r
              ? ((s = Math.min(n, s)), !0)
              : !(o.bottom <= r) && (o.left > i || (!(o.right < i) && i - o.left < o.right - i));
          },
          a,
          s,
        );
        o = new me(n, (m = oe(t.text, m, 1)), m == s ? 'before' : 'after');
      }
      var g = Vn(e, o, 'line', t, l);
      return (
        (r < g.top || g.bottom < r) && (o.outside = !0),
        (o.xRel = i < g.left ? -1 : i > g.right ? 1 : 0),
        o
      );
    }
    function Zn(e) {
      if (null != e.cachedTextHeight) return e.cachedTextHeight;
      if (null == Rn) {
        Rn = A('pre');
        for (var t = 0; t < 49; ++t)
          Rn.appendChild(document.createTextNode('x')), Rn.appendChild(A('br'));
        Rn.appendChild(document.createTextNode('x'));
      }
      _(e.measure, Rn);
      var n = Rn.offsetHeight / 50;
      return n > 3 && (e.cachedTextHeight = n), T(e.measure), n || 1;
    }
    function ei(e) {
      if (null != e.cachedCharWidth) return e.cachedCharWidth;
      var t = A('span', 'xxxxxxxxxx'),
        n = A('pre', [t]);
      _(e.measure, n);
      var i = t.getBoundingClientRect(),
        r = (i.right - i.left) / 10;
      return r > 2 && (e.cachedCharWidth = r), r || 10;
    }
    function ti(e) {
      for (
        var t = e.display,
          n = {},
          i = {},
          r = t.gutters.clientLeft,
          o = t.gutters.firstChild,
          a = 0;
        o;
        o = o.nextSibling, ++a
      )
        (n[e.options.gutters[a]] = o.offsetLeft + o.clientLeft + r),
          (i[e.options.gutters[a]] = o.clientWidth);
      return {
        fixedPos: ni(t),
        gutterTotalWidth: t.gutters.offsetWidth,
        gutterLeft: n,
        gutterWidth: i,
        wrapperWidth: t.wrapper.clientWidth,
      };
    }
    function ni(e) {
      return e.scroller.getBoundingClientRect().left - e.sizer.getBoundingClientRect().left;
    }
    function ii(e) {
      var t = Zn(e.display),
        n = e.options.lineWrapping,
        i = n && Math.max(5, e.display.scroller.clientWidth / ei(e.display) - 3);
      return function (r) {
        if (qe(e.doc, r)) return 0;
        var o = 0;
        if (r.widgets)
          for (var a = 0; a < r.widgets.length; a++)
            r.widgets[a].height && (o += r.widgets[a].height);
        return n ? o + (Math.ceil(r.text.length / i) || 1) * t : o + t;
      };
    }
    function ri(e) {
      var t = e.doc,
        n = ii(e);
      t.iter(function (e) {
        var t = n(e);
        t != e.height && de(e, t);
      });
    }
    function oi(e, t, n, i) {
      var r = e.display;
      if (!n && 'true' == mt(t).getAttribute('cm-not-content')) return null;
      var o,
        a,
        s = r.lineSpace.getBoundingClientRect();
      try {
        (o = t.clientX - s.left), (a = t.clientY - s.top);
      } catch (t) {
        return null;
      }
      var l,
        c = Yn(e, o, a);
      if (i && 1 == c.xRel && (l = se(e.doc, c.line).text).length == c.ch) {
        var d = O(l, l.length, e.options.tabSize) - l.length;
        c = me(c.line, Math.max(0, Math.round((o - kn(e.display).left) / ei(e.display)) - d));
      }
      return c;
    }
    function ai(e, t) {
      if (t >= e.display.viewTo) return null;
      if ((t -= e.display.viewFrom) < 0) return null;
      for (var n = e.display.view, i = 0; i < n.length; i++) if ((t -= n[i].size) < 0) return i;
    }
    function si(e) {
      e.display.input.showSelection(e.display.input.prepareSelection());
    }
    function li(e, t) {
      for (
        var n = e.doc,
          i = {},
          r = (i.cursors = document.createDocumentFragment()),
          o = (i.selection = document.createDocumentFragment()),
          a = 0;
        a < n.sel.ranges.length;
        a++
      )
        if (!1 !== t || a != n.sel.primIndex) {
          var s = n.sel.ranges[a];
          if (!(s.from().line >= e.display.viewTo || s.to().line < e.display.viewFrom)) {
            var l = s.empty();
            (l || e.options.showCursorWhenSelecting) && ci(e, s.head, r), l || di(e, s, o);
          }
        }
      return i;
    }
    function ci(e, t, n) {
      var i = Vn(e, t, 'div', null, null, !e.options.singleCursorHeightPerLine),
        r = n.appendChild(A('div', ' ', 'CodeMirror-cursor'));
      if (
        ((r.style.left = i.left + 'px'),
        (r.style.top = i.top + 'px'),
        (r.style.height = Math.max(0, i.bottom - i.top) * e.options.cursorHeight + 'px'),
        i.other)
      ) {
        var o = n.appendChild(A('div', ' ', 'CodeMirror-cursor CodeMirror-secondarycursor'));
        (o.style.display = ''),
          (o.style.left = i.other.left + 'px'),
          (o.style.top = i.other.top + 'px'),
          (o.style.height = 0.85 * (i.other.bottom - i.other.top) + 'px');
      }
    }
    function di(e, t, n) {
      var i = e.display,
        r = e.doc,
        o = document.createDocumentFragment(),
        a = kn(e.display),
        s = a.left,
        l = Math.max(i.sizerWidth, e.display.lineDiv.clientWidth - i.sizer.offsetLeft) - a.right;
      function c(e, t, n, i) {
        t < 0 && (t = 0),
          (t = Math.round(t)),
          (i = Math.round(i)),
          o.appendChild(
            A(
              'div',
              null,
              'CodeMirror-selected',
              'position: absolute; left: ' +
                e +
                'px;\n                             top: ' +
                t +
                'px; width: ' +
                (null == n ? l - e : n) +
                'px;\n                             height: ' +
                (i - t) +
                'px',
            ),
          );
      }
      function d(t, n, i) {
        var o,
          a,
          d = se(r, t),
          u = d.text.length;
        function h(n, i) {
          return zn(e, me(t, n), 'div', d, i);
        }
        return (
          (function (e, t, n, i) {
            if (!e) return i(t, n, 'ltr');
            for (var r = !1, o = 0; o < e.length; ++o) {
              var a = e[o];
              ((a.from < n && a.to > t) || (t == n && a.to == t)) &&
                (i(Math.max(a.from, t), Math.min(a.to, n), 1 == a.level ? 'rtl' : 'ltr'), (r = !0));
            }
            r || i(t, n, 'ltr');
          })(Qe(d, r.direction), n || 0, null == i ? u : i, function (e, t, r) {
            var d,
              p,
              f,
              m = h(e, 'left');
            if (e == t) (d = m), (p = f = m.left);
            else {
              if (((d = h(t - 1, 'right')), 'rtl' == r)) {
                var g = m;
                (m = d), (d = g);
              }
              (p = m.left), (f = d.right);
            }
            null == n && 0 == e && (p = s),
              d.top - m.top > 3 &&
                (c(p, m.top, null, m.bottom),
                (p = s),
                m.bottom < d.top && c(p, m.bottom, null, d.top)),
              null == i && t == u && (f = l),
              (!o || m.top < o.top || (m.top == o.top && m.left < o.left)) && (o = m),
              (!a || d.bottom > a.bottom || (d.bottom == a.bottom && d.right > a.right)) && (a = d),
              p < s + 1 && (p = s),
              c(p, d.top, f - p, d.bottom);
          }),
          { start: o, end: a }
        );
      }
      var u = t.from(),
        h = t.to();
      if (u.line == h.line) d(u.line, u.ch, h.ch);
      else {
        var p = se(r, u.line),
          f = se(r, h.line),
          m = He(p) == He(f),
          g = d(u.line, u.ch, m ? p.text.length + 1 : null).end,
          v = d(h.line, m ? 0 : null, h.ch).start;
        m &&
          (g.top < v.top - 2
            ? (c(g.right, g.top, null, g.bottom), c(s, v.top, v.left, v.bottom))
            : c(g.right, g.top, v.left - g.right, g.bottom)),
          g.bottom < v.top && c(s, g.bottom, null, v.top);
      }
      n.appendChild(o);
    }
    function ui(e) {
      if (e.state.focused) {
        var t = e.display;
        clearInterval(t.blinker);
        var n = !0;
        (t.cursorDiv.style.visibility = ''),
          e.options.cursorBlinkRate > 0
            ? (t.blinker = setInterval(function () {
                return (t.cursorDiv.style.visibility = (n = !n) ? '' : 'hidden');
              }, e.options.cursorBlinkRate))
            : e.options.cursorBlinkRate < 0 && (t.cursorDiv.style.visibility = 'hidden');
      }
    }
    function hi(e) {
      e.state.focused || (e.display.input.focus(), fi(e));
    }
    function pi(e) {
      (e.state.delayingBlurEvent = !0),
        setTimeout(function () {
          e.state.delayingBlurEvent && ((e.state.delayingBlurEvent = !1), mi(e));
        }, 100);
    }
    function fi(e, t) {
      e.state.delayingBlurEvent && (e.state.delayingBlurEvent = !1),
        'nocursor' != e.options.readOnly &&
          (e.state.focused ||
            (at(e, 'focus', e, t),
            (e.state.focused = !0),
            D(e.display.wrapper, 'CodeMirror-focused'),
            e.curOp ||
              e.display.selForContextMenu == e.doc.sel ||
              (e.display.input.reset(),
              l &&
                setTimeout(function () {
                  return e.display.input.reset(!0);
                }, 20)),
            e.display.input.receivedFocus()),
          ui(e));
    }
    function mi(e, t) {
      e.state.delayingBlurEvent ||
        (e.state.focused &&
          (at(e, 'blur', e, t), (e.state.focused = !1), E(e.display.wrapper, 'CodeMirror-focused')),
        clearInterval(e.display.blinker),
        setTimeout(function () {
          e.state.focused || (e.display.shift = !1);
        }, 150));
    }
    function gi(e) {
      for (var t = e.display, n = t.lineDiv.offsetTop, i = 0; i < t.view.length; i++) {
        var r = t.view[i],
          o = void 0;
        if (!r.hidden) {
          if (a && s < 8) {
            var l = r.node.offsetTop + r.node.offsetHeight;
            (o = l - n), (n = l);
          } else {
            var c = r.node.getBoundingClientRect();
            o = c.bottom - c.top;
          }
          var d = r.line.height - o;
          if (
            (o < 2 && (o = Zn(t)), (d > 0.001 || d < -0.001) && (de(r.line, o), vi(r.line), r.rest))
          )
            for (var u = 0; u < r.rest.length; u++) vi(r.rest[u]);
        }
      }
    }
    function vi(e) {
      if (e.widgets)
        for (var t = 0; t < e.widgets.length; ++t)
          e.widgets[t].height = e.widgets[t].node.parentNode.offsetHeight;
    }
    function yi(e, t, n) {
      var i = n && null != n.top ? Math.max(0, n.top) : e.scroller.scrollTop;
      i = Math.floor(i - Fn(e));
      var r = n && null != n.bottom ? n.bottom : i + e.wrapper.clientHeight,
        o = he(t, i),
        a = he(t, r);
      if (n && n.ensure) {
        var s = n.ensure.from.line,
          l = n.ensure.to.line;
        s < o
          ? ((o = s), (a = he(t, ze(se(t, s)) + e.wrapper.clientHeight)))
          : Math.min(l, t.lastLine()) >= a &&
            ((o = he(t, ze(se(t, l)) - e.wrapper.clientHeight)), (a = l));
      }
      return { from: o, to: Math.max(a, o + 1) };
    }
    function bi(e) {
      var t = e.display,
        n = t.view;
      if (t.alignWidgets || (t.gutters.firstChild && e.options.fixedGutter)) {
        for (
          var i = ni(t) - t.scroller.scrollLeft + e.doc.scrollLeft,
            r = t.gutters.offsetWidth,
            o = i + 'px',
            a = 0;
          a < n.length;
          a++
        )
          if (!n[a].hidden) {
            e.options.fixedGutter &&
              (n[a].gutter && (n[a].gutter.style.left = o),
              n[a].gutterBackground && (n[a].gutterBackground.style.left = o));
            var s = n[a].alignable;
            if (s) for (var l = 0; l < s.length; l++) s[l].style.left = o;
          }
        e.options.fixedGutter && (t.gutters.style.left = Math.max(0, i + r) + 'px');
      }
    }
    function wi(e) {
      if (!e.options.lineNumbers) return !1;
      var t = e.doc,
        n = fe(e.options, t.first + t.size - 1),
        i = e.display;
      if (n.length != i.lineNumChars) {
        var r = i.measure.appendChild(
            A('div', [A('div', n)], 'CodeMirror-linenumber CodeMirror-gutter-elt'),
          ),
          o = r.firstChild.offsetWidth,
          a = r.offsetWidth - o;
        return (
          (i.lineGutter.style.width = ''),
          (i.lineNumInnerWidth = Math.max(o, i.lineGutter.offsetWidth - a) + a + 2),
          (i.lineNumWidth = i.lineNumInnerWidth + a),
          (i.lineNumChars = i.lineNumInnerWidth ? n.length : -1),
          (i.lineGutter.style.width = i.lineNumWidth + 'px'),
          or(e),
          !0
        );
      }
      return !1;
    }
    function xi(e, t) {
      var n = e.display,
        i = Zn(e.display);
      t.top < 0 && (t.top = 0);
      var r = e.curOp && null != e.curOp.scrollTop ? e.curOp.scrollTop : n.scroller.scrollTop,
        o = _n(e),
        a = {};
      t.bottom - t.top > o && (t.bottom = t.top + o);
      var s = e.doc.height + Sn(n),
        l = t.top < i,
        c = t.bottom > s - i;
      if (t.top < r) a.scrollTop = l ? 0 : t.top;
      else if (t.bottom > r + o) {
        var d = Math.min(t.top, (c ? s : t.bottom) - o);
        d != r && (a.scrollTop = d);
      }
      var u = e.curOp && null != e.curOp.scrollLeft ? e.curOp.scrollLeft : n.scroller.scrollLeft,
        h = Tn(e) - (e.options.fixedGutter ? n.gutters.offsetWidth : 0),
        p = t.right - t.left > h;
      return (
        p && (t.right = t.left + h),
        t.left < 10
          ? (a.scrollLeft = 0)
          : t.left < u
            ? (a.scrollLeft = Math.max(0, t.left - (p ? 0 : 10)))
            : t.right > h + u - 3 && (a.scrollLeft = t.right + (p ? 0 : 10) - h),
        a
      );
    }
    function Ci(e, t) {
      null != t &&
        (ki(e),
        (e.curOp.scrollTop =
          (null == e.curOp.scrollTop ? e.doc.scrollTop : e.curOp.scrollTop) + t));
    }
    function Fi(e) {
      ki(e);
      var t = e.getCursor(),
        n = t,
        i = t;
      e.options.lineWrapping || ((n = t.ch ? me(t.line, t.ch - 1) : t), (i = me(t.line, t.ch + 1))),
        (e.curOp.scrollToPos = { from: n, to: i, margin: e.options.cursorScrollMargin });
    }
    function Si(e, t, n) {
      (null == t && null == n) || ki(e),
        null != t && (e.curOp.scrollLeft = t),
        null != n && (e.curOp.scrollTop = n);
    }
    function ki(e) {
      var t = e.curOp.scrollToPos;
      t && ((e.curOp.scrollToPos = null), Ei(e, Jn(e, t.from), Jn(e, t.to), t.margin));
    }
    function Ei(e, t, n, i) {
      var r = xi(e, {
        left: Math.min(t.left, n.left),
        top: Math.min(t.top, n.top) - i,
        right: Math.max(t.right, n.right),
        bottom: Math.max(t.bottom, n.bottom) + i,
      });
      Si(e, r.scrollLeft, r.scrollTop);
    }
    function Ti(e, t) {
      Math.abs(e.doc.scrollTop - t) < 2 ||
        (n || rr(e, { top: t }), _i(e, t, !0), n && rr(e), Zi(e, 100));
    }
    function _i(e, t, n) {
      (t = Math.min(e.display.scroller.scrollHeight - e.display.scroller.clientHeight, t)),
        (e.display.scroller.scrollTop != t || n) &&
          ((e.doc.scrollTop = t),
          e.display.scrollbars.setScrollTop(t),
          e.display.scroller.scrollTop != t && (e.display.scroller.scrollTop = t));
    }
    function Ai(e, t, n, i) {
      (t = Math.min(t, e.display.scroller.scrollWidth - e.display.scroller.clientWidth)),
        ((n ? t == e.doc.scrollLeft : Math.abs(e.doc.scrollLeft - t) < 2) && !i) ||
          ((e.doc.scrollLeft = t),
          bi(e),
          e.display.scroller.scrollLeft != t && (e.display.scroller.scrollLeft = t),
          e.display.scrollbars.setScrollLeft(t));
    }
    function Mi(e) {
      var t = e.display,
        n = t.gutters.offsetWidth,
        i = Math.round(e.doc.height + Sn(e.display));
      return {
        clientHeight: t.scroller.clientHeight,
        viewHeight: t.wrapper.clientHeight,
        scrollWidth: t.scroller.scrollWidth,
        clientWidth: t.scroller.clientWidth,
        viewWidth: t.wrapper.clientWidth,
        barLeft: e.options.fixedGutter ? n : 0,
        docHeight: i,
        scrollHeight: i + En(e) + t.barHeight,
        nativeBarWidth: t.nativeBarWidth,
        gutterWidth: n,
      };
    }
    ma.posFromMouse = oi;
    var Li = function (e, t, n) {
      this.cm = n;
      var i = (this.vert = A(
          'div',
          [A('div', null, null, 'min-width: 1px')],
          'CodeMirror-vscrollbar',
        )),
        r = (this.horiz = A(
          'div',
          [A('div', null, null, 'height: 100%; min-height: 1px')],
          'CodeMirror-hscrollbar',
        ));
      e(i),
        e(r),
        it(i, 'scroll', function () {
          i.clientHeight && t(i.scrollTop, 'vertical');
        }),
        it(r, 'scroll', function () {
          r.clientWidth && t(r.scrollLeft, 'horizontal');
        }),
        (this.checkedZeroWidth = !1),
        a && s < 8 && (this.horiz.style.minHeight = this.vert.style.minWidth = '18px');
    };
    (Li.prototype.update = function (e) {
      var t = e.scrollWidth > e.clientWidth + 1,
        n = e.scrollHeight > e.clientHeight + 1,
        i = e.nativeBarWidth;
      if (((this.vert.style.display = ''), (this.vert.firstChild.style.height = '0'), t)) {
        (this.horiz.style.display = 'block'),
          (this.horiz.style.right = n ? i + 'px' : '0'),
          (this.horiz.style.left = e.barLeft + 'px');
        var r = e.viewWidth - e.barLeft - (n ? i : 0);
        this.horiz.firstChild.style.width = Math.max(0, e.scrollWidth - e.clientWidth + r) + 'px';
      } else (this.horiz.style.display = ''), (this.horiz.firstChild.style.width = '0');
      return (
        !this.checkedZeroWidth &&
          e.clientHeight > 0 &&
          (0 == i && this.zeroWidthHack(), (this.checkedZeroWidth = !0)),
        { right: n ? i : 0, bottom: t ? i : 0 }
      );
    }),
      (Li.prototype.setScrollLeft = function (e) {
        this.horiz.scrollLeft != e && (this.horiz.scrollLeft = e),
          this.disableHoriz && this.enableZeroWidthBar(this.horiz, this.disableHoriz, 'horiz');
      }),
      (Li.prototype.setScrollTop = function (e) {
        this.vert.scrollTop != e && (this.vert.scrollTop = e),
          this.disableVert && this.enableZeroWidthBar(this.vert, this.disableVert, 'vert');
      }),
      (Li.prototype.zeroWidthHack = function () {
        var e = y && !p ? '12px' : '18px';
        (this.horiz.style.height = this.vert.style.width = e),
          (this.horiz.style.pointerEvents = this.vert.style.pointerEvents = 'none'),
          (this.disableHoriz = new $()),
          (this.disableVert = new $());
      }),
      (Li.prototype.enableZeroWidthBar = function (e, t, n) {
        (e.style.pointerEvents = 'auto'),
          t.set(1e3, function i() {
            var r = e.getBoundingClientRect();
            ('vert' == n
              ? document.elementFromPoint(r.right - 1, (r.top + r.bottom) / 2)
              : document.elementFromPoint((r.right + r.left) / 2, r.bottom - 1)) != e
              ? (e.style.pointerEvents = 'none')
              : t.set(1e3, i);
          });
      }),
      (Li.prototype.clear = function () {
        var e = this.horiz.parentNode;
        e.removeChild(this.horiz), e.removeChild(this.vert);
      });
    var Ni = function () {};
    function Di(e, t) {
      t || (t = Mi(e));
      var n = e.display.barWidth,
        i = e.display.barHeight;
      Ri(e, t);
      for (var r = 0; (r < 4 && n != e.display.barWidth) || i != e.display.barHeight; r++)
        n != e.display.barWidth && e.options.lineWrapping && gi(e),
          Ri(e, Mi(e)),
          (n = e.display.barWidth),
          (i = e.display.barHeight);
    }
    function Ri(e, t) {
      var n = e.display,
        i = n.scrollbars.update(t);
      (n.sizer.style.paddingRight = (n.barWidth = i.right) + 'px'),
        (n.sizer.style.paddingBottom = (n.barHeight = i.bottom) + 'px'),
        (n.heightForcer.style.borderBottom = i.bottom + 'px solid transparent'),
        i.right && i.bottom
          ? ((n.scrollbarFiller.style.display = 'block'),
            (n.scrollbarFiller.style.height = i.bottom + 'px'),
            (n.scrollbarFiller.style.width = i.right + 'px'))
          : (n.scrollbarFiller.style.display = ''),
        i.bottom && e.options.coverGutterNextToScrollbar && e.options.fixedGutter
          ? ((n.gutterFiller.style.display = 'block'),
            (n.gutterFiller.style.height = i.bottom + 'px'),
            (n.gutterFiller.style.width = t.gutterWidth + 'px'))
          : (n.gutterFiller.style.display = '');
    }
    (Ni.prototype.update = function () {
      return { bottom: 0, right: 0 };
    }),
      (Ni.prototype.setScrollLeft = function () {}),
      (Ni.prototype.setScrollTop = function () {}),
      (Ni.prototype.clear = function () {});
    var Bi = { native: Li, null: Ni };
    function Pi(e) {
      e.display.scrollbars &&
        (e.display.scrollbars.clear(),
        e.display.scrollbars.addClass && E(e.display.wrapper, e.display.scrollbars.addClass)),
        (e.display.scrollbars = new Bi[e.options.scrollbarStyle](
          function (t) {
            e.display.wrapper.insertBefore(t, e.display.scrollbarFiller),
              it(t, 'mousedown', function () {
                e.state.focused &&
                  setTimeout(function () {
                    return e.display.input.focus();
                  }, 0);
              }),
              t.setAttribute('cm-not-content', 'true');
          },
          function (t, n) {
            'horizontal' == n ? Ai(e, t) : Ti(e, t);
          },
          e,
        )),
        e.display.scrollbars.addClass && D(e.display.wrapper, e.display.scrollbars.addClass);
    }
    var Ii = 0;
    function Oi(e) {
      var t;
      (e.curOp = {
        cm: e,
        viewChanged: !1,
        startHeight: e.doc.height,
        forceUpdate: !1,
        updateInput: null,
        typing: !1,
        changeObjs: null,
        cursorActivityHandlers: null,
        cursorActivityCalled: 0,
        selectionChanged: !1,
        updateMaxLine: !1,
        scrollLeft: null,
        scrollTop: null,
        scrollToPos: null,
        focus: !1,
        id: ++Ii,
      }),
        (t = e.curOp),
        an ? an.ops.push(t) : (t.ownsGroup = an = { ops: [t], delayedCallbacks: [] });
    }
    function $i(e) {
      !(function (e, t) {
        var n = e.ownsGroup;
        if (n)
          try {
            !(function (e) {
              var t = e.delayedCallbacks,
                n = 0;
              do {
                for (; n < t.length; n++) t[n].call(null);
                for (var i = 0; i < e.ops.length; i++) {
                  var r = e.ops[i];
                  if (r.cursorActivityHandlers)
                    for (; r.cursorActivityCalled < r.cursorActivityHandlers.length; )
                      r.cursorActivityHandlers[r.cursorActivityCalled++].call(null, r.cm);
                }
              } while (n < t.length);
            })(n);
          } finally {
            (an = null), t(n);
          }
      })(e.curOp, function (e) {
        for (var t = 0; t < e.ops.length; t++) e.ops[t].cm.curOp = null;
        !(function (e) {
          for (var t = e.ops, n = 0; n < t.length; n++) Hi(t[n]);
          for (var i = 0; i < t.length; i++)
            (r = t[i]).updatedDisplay = r.mustUpdate && nr(r.cm, r.update);
          var r;
          for (var o = 0; o < t.length; o++) Ui(t[o]);
          for (var a = 0; a < t.length; a++) ji(t[a]);
          for (var s = 0; s < t.length; s++) qi(t[s]);
        })(e);
      });
    }
    function Hi(e) {
      var t = e.cm,
        n = t.display;
      !(function (e) {
        var t = e.display;
        !t.scrollbarsClipped &&
          t.scroller.offsetWidth &&
          ((t.nativeBarWidth = t.scroller.offsetWidth - t.scroller.clientWidth),
          (t.heightForcer.style.height = En(e) + 'px'),
          (t.sizer.style.marginBottom = -t.nativeBarWidth + 'px'),
          (t.sizer.style.borderRightWidth = En(e) + 'px'),
          (t.scrollbarsClipped = !0));
      })(t),
        e.updateMaxLine && Je(t),
        (e.mustUpdate =
          e.viewChanged ||
          e.forceUpdate ||
          null != e.scrollTop ||
          (e.scrollToPos &&
            (e.scrollToPos.from.line < n.viewFrom || e.scrollToPos.to.line >= n.viewTo)) ||
          (n.maxLineChanged && t.options.lineWrapping)),
        (e.update =
          e.mustUpdate &&
          new tr(t, e.mustUpdate && { top: e.scrollTop, ensure: e.scrollToPos }, e.forceUpdate));
    }
    function Ui(e) {
      var t = e.cm,
        n = t.display;
      e.updatedDisplay && gi(t),
        (e.barMeasure = Mi(t)),
        n.maxLineChanged &&
          !t.options.lineWrapping &&
          ((e.adjustWidthTo = Mn(t, n.maxLine, n.maxLine.text.length).left + 3),
          (t.display.sizerWidth = e.adjustWidthTo),
          (e.barMeasure.scrollWidth = Math.max(
            n.scroller.clientWidth,
            n.sizer.offsetLeft + e.adjustWidthTo + En(t) + t.display.barWidth,
          )),
          (e.maxScrollLeft = Math.max(0, n.sizer.offsetLeft + e.adjustWidthTo - Tn(t)))),
        (e.updatedDisplay || e.selectionChanged) &&
          (e.preparedSelection = n.input.prepareSelection(e.focus));
    }
    function ji(e) {
      var t = e.cm;
      null != e.adjustWidthTo &&
        ((t.display.sizer.style.minWidth = e.adjustWidthTo + 'px'),
        e.maxScrollLeft < t.doc.scrollLeft &&
          Ai(t, Math.min(t.display.scroller.scrollLeft, e.maxScrollLeft), !0),
        (t.display.maxLineChanged = !1));
      var n = e.focus && e.focus == N() && (!document.hasFocus || document.hasFocus());
      e.preparedSelection && t.display.input.showSelection(e.preparedSelection, n),
        (e.updatedDisplay || e.startHeight != t.doc.height) && Di(t, e.barMeasure),
        e.updatedDisplay && ar(t, e.barMeasure),
        e.selectionChanged && ui(t),
        t.state.focused && e.updateInput && t.display.input.reset(e.typing),
        n && hi(e.cm);
    }
    function qi(e) {
      var t = e.cm,
        n = t.display,
        i = t.doc;
      (e.updatedDisplay && ir(t, e.update),
      null == n.wheelStartX ||
        (null == e.scrollTop && null == e.scrollLeft && !e.scrollToPos) ||
        (n.wheelStartX = n.wheelStartY = null),
      null != e.scrollTop && _i(t, e.scrollTop, e.forceScroll),
      null != e.scrollLeft && Ai(t, e.scrollLeft, !0, !0),
      e.scrollToPos) &&
        (function (e, t) {
          if (!st(e, 'scrollCursorIntoView')) {
            var n = e.display,
              i = n.sizer.getBoundingClientRect(),
              r = null,
              o = File.editor.sourceView && File.editor.sourceView.inSourceMode ? 0 : 16;
            if (t.top + i.top < 0) r = !0;
            else if (
              t.bottom + i.top >
              (window.innerHeight || document.documentElement.clientHeight) - o
            )
              r = !1;
            else {
              var a = n.sizer.closest('.md-diagram, .md-math-block');
              a &&
                a.getBoundingClientRect().bottom >
                  (window.innerHeight || document.documentElement.clientHeight) - o &&
                (r = !1);
            }
            if (null != r && !f) {
              var s = A(
                'div',
                '​',
                null,
                'position: absolute;\n                         top: ' +
                  (t.top - n.viewOffset - Fn(e.display)) +
                  'px;\n                         height: ' +
                  (t.bottom - t.top + En(e) + n.barHeight) +
                  'px;\n                         left: ' +
                  t.left +
                  'px; width: ' +
                  Math.max(2, t.right - t.left) +
                  'px;',
              );
              e.display.lineSpace.appendChild(s),
                File.editor.sourceView && File.editor.sourceView.inSourceMode
                  ? s.scrollIntoView(r)
                  : (File.editor.fences && !File.editor.fences.isMousePressed) ||
                    (s.scrollIntoViewIfNeeded ? s.scrollIntoViewIfNeeded(!1) : s.scrollIntoView(r)),
                e.display.lineSpace.removeChild(s);
            }
          }
        })(
          t,
          (function (e, t, n, i) {
            var r;
            null == i && (i = 0);
            for (var o = 0; o < 5; o++) {
              var a = !1,
                s = Vn(e, t),
                l = n && n != t ? Vn(e, n) : s,
                c = xi(
                  e,
                  (r = {
                    left: Math.min(s.left, l.left),
                    top: Math.min(s.top, l.top) - i,
                    right: Math.max(s.left, l.left),
                    bottom: Math.max(s.bottom, l.bottom) + i,
                  }),
                ),
                d = e.doc.scrollTop,
                u = e.doc.scrollLeft;
              if (
                (null != c.scrollTop &&
                  (Ti(e, c.scrollTop), Math.abs(e.doc.scrollTop - d) > 1 && (a = !0)),
                null != c.scrollLeft &&
                  (Ai(e, c.scrollLeft), Math.abs(e.doc.scrollLeft - u) > 1 && (a = !0)),
                !a)
              )
                break;
            }
            return r;
          })(t, Ce(i, e.scrollToPos.from), Ce(i, e.scrollToPos.to), e.scrollToPos.margin),
        );
      var r = e.maybeHiddenMarkers,
        o = e.maybeUnhiddenMarkers;
      if (r) for (var a = 0; a < r.length; ++a) r[a].lines.length || at(r[a], 'hide');
      if (o) for (var s = 0; s < o.length; ++s) o[s].lines.length && at(o[s], 'unhide');
      n.wrapper.offsetHeight && (i.scrollTop = t.display.scroller.scrollTop),
        e.changeObjs && at(t, 'changes', t, e.changeObjs),
        e.update && e.update.finish();
    }
    function Wi(e, t) {
      if (e.curOp) return t();
      Oi(e);
      try {
        return t();
      } finally {
        $i(e);
      }
    }
    function zi(e, t) {
      return function () {
        if (e.curOp) return t.apply(e, arguments);
        Oi(e);
        try {
          return t.apply(e, arguments);
        } finally {
          $i(e);
        }
      };
    }
    function Vi(e) {
      return function () {
        if (this.curOp) return e.apply(this, arguments);
        Oi(this);
        try {
          return e.apply(this, arguments);
        } finally {
          $i(this);
        }
      };
    }
    function Ji(e) {
      return function () {
        var t = this.cm;
        if (!t || t.curOp) return e.apply(this, arguments);
        Oi(t);
        try {
          return e.apply(this, arguments);
        } finally {
          $i(t);
        }
      };
    }
    function Ki(e, t, n, i) {
      null == t && (t = e.doc.first), null == n && (n = e.doc.first + e.doc.size), i || (i = 0);
      var r = e.display;
      if (
        (i &&
          n < r.viewTo &&
          (null == r.updateLineNumbers || r.updateLineNumbers > t) &&
          (r.updateLineNumbers = t),
        (e.curOp.viewChanged = !0),
        t >= r.viewTo)
      )
        ke && Ue(e.doc, t) < r.viewTo && Gi(e);
      else if (n <= r.viewFrom)
        ke && je(e.doc, n + i) > r.viewFrom ? Gi(e) : ((r.viewFrom += i), (r.viewTo += i));
      else if (t <= r.viewFrom && n >= r.viewTo) Gi(e);
      else if (t <= r.viewFrom) {
        var o = Qi(e, n, n + i, 1);
        o ? ((r.view = r.view.slice(o.index)), (r.viewFrom = o.lineN), (r.viewTo += i)) : Gi(e);
      } else if (n >= r.viewTo) {
        var a = Qi(e, t, t, -1);
        a ? ((r.view = r.view.slice(0, a.index)), (r.viewTo = a.lineN)) : Gi(e);
      } else {
        var s = Qi(e, t, t, -1),
          l = Qi(e, n, n + i, 1);
        s && l
          ? ((r.view = r.view
              .slice(0, s.index)
              .concat(on(e, s.lineN, l.lineN))
              .concat(r.view.slice(l.index))),
            (r.viewTo += i))
          : Gi(e);
      }
      var c = r.externalMeasured;
      c && (n < c.lineN ? (c.lineN += i) : t < c.lineN + c.size && (r.externalMeasured = null));
    }
    function Yi(e, t, n) {
      e.curOp.viewChanged = !0;
      var i = e.display,
        r = e.display.externalMeasured;
      if (
        (r && t >= r.lineN && t < r.lineN + r.size && (i.externalMeasured = null),
        !(t < i.viewFrom || t >= i.viewTo))
      ) {
        var o = i.view[ai(e, t)];
        if (null != o.node) {
          var a = o.changes || (o.changes = []);
          -1 == H(a, n) && a.push(n);
        }
      }
    }
    function Gi(e) {
      (e.display.viewFrom = e.display.viewTo = e.doc.first),
        (e.display.view = []),
        (e.display.viewOffset = 0);
    }
    function Qi(e, t, n, i) {
      var r,
        o = ai(e, t),
        a = e.display.view;
      if (!ke || n == e.doc.first + e.doc.size) return { index: o, lineN: n };
      for (var s = e.display.viewFrom, l = 0; l < o; l++) s += a[l].size;
      if (s != t) {
        if (i > 0) {
          if (o == a.length - 1) return null;
          (r = s + a[o].size - t), o++;
        } else r = s - t;
        (t += r), (n += r);
      }
      for (; Ue(e.doc, n) != n; ) {
        if (o == (i < 0 ? 0 : a.length - 1)) return null;
        (n += i * a[o - (i < 0 ? 1 : 0)].size), (o += i);
      }
      return { index: o, lineN: n };
    }
    function Xi(e) {
      for (var t = e.display.view, n = 0, i = 0; i < t.length; i++) {
        var r = t[i];
        r.hidden || (r.node && !r.changes) || ++n;
      }
      return n;
    }
    function Zi(e, t) {
      e.doc.mode.startState &&
        e.doc.frontier < e.display.viewTo &&
        e.state.highlight.set(t, P(er, e));
    }
    function er(e) {
      var t = e.doc;
      if ((t.frontier < t.first && (t.frontier = t.first), !(t.frontier >= e.display.viewTo))) {
        var n = +new Date() + e.options.workTime,
          i = Dt(t.mode, $t(e, t.frontier)),
          r = [];
        t.iter(t.frontier, Math.min(t.first + t.size, e.display.viewTo + 500), function (o) {
          if (t.frontier >= e.display.viewFrom) {
            var a = o.styles,
              s = o.text.length > e.options.maxHighlightLength,
              l = It(e, o, s ? Dt(t.mode, i) : i, !0);
            o.styles = l.styles;
            var c = o.styleClasses,
              d = l.classes;
            d ? (o.styleClasses = d) : c && (o.styleClasses = null);
            for (
              var u =
                  !a ||
                  a.length != o.styles.length ||
                  (c != d && (!c || !d || c.bgClass != d.bgClass || c.textClass != d.textClass)),
                h = 0;
              !u && h < a.length;
              ++h
            )
              u = a[h] != o.styles[h];
            u && r.push(t.frontier), (o.stateAfter = s ? i : Dt(t.mode, i));
          } else
            o.text.length <= e.options.maxHighlightLength && Ht(e, o.text, i),
              (o.stateAfter = t.frontier % 5 == 0 ? Dt(t.mode, i) : null);
          if ((++t.frontier, +new Date() > n)) return Zi(e, e.options.workDelay), !0;
        }),
          r.length &&
            Wi(e, function () {
              for (var t = 0; t < r.length; t++) Yi(e, r[t], 'text');
            });
      }
    }
    var tr = function (e, t, n) {
      var i = e.display;
      (this.viewport = t),
        (this.visible = yi(i, e.doc, t)),
        (this.editorIsHidden = !i.wrapper.offsetWidth),
        (this.wrapperHeight = i.wrapper.clientHeight),
        (this.wrapperWidth = i.wrapper.clientWidth),
        (this.oldDisplayWidth = Tn(e)),
        (this.force = n),
        (this.dims = ti(e)),
        (this.events = []);
    };
    function nr(e, t) {
      var n = e.display,
        i = e.doc;
      if (t.editorIsHidden) return Gi(e), !1;
      if (
        !t.force &&
        t.visible.from >= n.viewFrom &&
        t.visible.to <= n.viewTo &&
        (null == n.updateLineNumbers || n.updateLineNumbers >= n.viewTo) &&
        n.renderedView == n.view &&
        0 == Xi(e)
      )
        return !1;
      wi(e) && (Gi(e), (t.dims = ti(e)));
      var r = i.first + i.size,
        o = Math.max(t.visible.from - e.options.viewportMargin, i.first),
        a = Math.min(r, t.visible.to + e.options.viewportMargin);
      n.viewFrom < o && o - n.viewFrom < 20 && (o = Math.max(i.first, n.viewFrom)),
        n.viewTo > a && n.viewTo - a < 20 && (a = Math.min(r, n.viewTo)),
        ke && ((o = Ue(e.doc, o)), (a = je(e.doc, a)));
      var s =
        o != n.viewFrom ||
        a != n.viewTo ||
        n.lastWrapHeight != t.wrapperHeight ||
        n.lastWrapWidth != t.wrapperWidth;
      !(function (e, t, n) {
        var i = e.display;
        0 == i.view.length || t >= i.viewTo || n <= i.viewFrom
          ? ((i.view = on(e, t, n)), (i.viewFrom = t))
          : (i.viewFrom > t
              ? (i.view = on(e, t, i.viewFrom).concat(i.view))
              : i.viewFrom < t && (i.view = i.view.slice(ai(e, t))),
            (i.viewFrom = t),
            i.viewTo < n
              ? (i.view = i.view.concat(on(e, i.viewTo, n)))
              : i.viewTo > n && (i.view = i.view.slice(0, ai(e, n)))),
          (i.viewTo = n);
      })(e, o, a),
        (n.viewOffset = ze(se(e.doc, n.viewFrom))),
        (e.display.mover.style.top = n.viewOffset + 'px');
      var c = Xi(e);
      if (
        !s &&
        0 == c &&
        !t.force &&
        n.renderedView == n.view &&
        (null == n.updateLineNumbers || n.updateLineNumbers >= n.viewTo)
      )
        return !1;
      var d = (function (e) {
        if (e.hasFocus()) return null;
        var t = N();
        if (!t || !L(e.display.lineDiv, t)) return null;
        var n = { activeElt: t };
        if (window.getSelection) {
          var i = window.getSelection();
          i.anchorNode &&
            i.extend &&
            L(e.display.lineDiv, i.anchorNode) &&
            ((n.anchorNode = i.anchorNode),
            (n.anchorOffset = i.anchorOffset),
            (n.focusNode = i.focusNode),
            (n.focusOffset = i.focusOffset));
        }
        return n;
      })(e);
      return (
        c > 4 && (n.lineDiv.style.display = 'none'),
        (function (e, t, n) {
          var i = e.display,
            r = e.options.lineNumbers,
            o = i.lineDiv,
            a = o.firstChild;
          function s(t) {
            var n = t.nextSibling;
            return (
              l && y && e.display.currentWheelTarget == t
                ? (t.style.display = 'none')
                : t.parentNode.removeChild(t),
              n
            );
          }
          for (var c = i.view, d = i.viewFrom, u = 0; u < c.length; u++) {
            var h = c[u];
            if (h.hidden);
            else if (h.node && h.node.parentNode == o) {
              for (; a != h.node; ) a = s(a);
              var p = r && null != t && t <= d && h.lineNumber;
              h.changes && (H(h.changes, 'gutter') > -1 && (p = !1), dn(e, h, d, n)),
                p &&
                  (T(h.lineNumber),
                  h.lineNumber.appendChild(document.createTextNode(fe(e.options, d)))),
                (a = h.node.nextSibling);
            } else {
              var f = vn(e, h, d, n);
              o.insertBefore(f, a);
            }
            d += h.size;
          }
          for (; a; ) a = s(a);
        })(e, n.updateLineNumbers, t.dims),
        c > 4 && (n.lineDiv.style.display = ''),
        (n.renderedView = n.view),
        (function (e) {
          if (
            e &&
            e.activeElt &&
            e.activeElt != N() &&
            (e.activeElt.focus(),
            e.anchorNode && L(document.body, e.anchorNode) && L(document.body, e.focusNode))
          ) {
            var t = window.getSelection(),
              n = document.createRange();
            n.setEnd(e.anchorNode, e.anchorOffset),
              n.collapse(!1),
              t.removeAllRanges(),
              t.addRange(n),
              t.extend(e.focusNode, e.focusOffset);
          }
        })(d),
        T(n.cursorDiv),
        T(n.selectionDiv),
        (n.gutters.style.height = n.sizer.style.minHeight = 0),
        s && ((n.lastWrapHeight = t.wrapperHeight), (n.lastWrapWidth = t.wrapperWidth), Zi(e, 400)),
        (n.updateLineNumbers = null),
        !0
      );
    }
    function ir(e, t) {
      for (
        var n = t.viewport, i = !0;
        ((i && e.options.lineWrapping && t.oldDisplayWidth != Tn(e)) ||
          (n &&
            null != n.top &&
            (n = { top: Math.min(e.doc.height + Sn(e.display) - _n(e), n.top) }),
          (t.visible = yi(e.display, e.doc, n)),
          !(t.visible.from >= e.display.viewFrom && t.visible.to <= e.display.viewTo))) &&
        nr(e, t);
        i = !1
      ) {
        gi(e);
        var r = Mi(e);
        si(e), Di(e, r), ar(e, r);
      }
      t.signal(e, 'update', e),
        (e.display.viewFrom == e.display.reportedViewFrom &&
          e.display.viewTo == e.display.reportedViewTo) ||
          (t.signal(e, 'viewportChange', e, e.display.viewFrom, e.display.viewTo),
          (e.display.reportedViewFrom = e.display.viewFrom),
          (e.display.reportedViewTo = e.display.viewTo));
    }
    function rr(e, t) {
      var n = new tr(e, t);
      if (nr(e, n)) {
        gi(e), ir(e, n);
        var i = Mi(e);
        si(e), Di(e, i), ar(e, i), n.finish();
      }
    }
    function or(e) {
      var t = e.display.gutters.offsetWidth;
      e.display.sizer.style.marginLeft = t + 'px';
    }
    function ar(e, t) {
      (e.display.sizer.style.minHeight = t.docHeight + 'px'),
        (e.display.heightForcer.style.top = t.docHeight + 'px'),
        (e.display.gutters.style.height = t.docHeight + e.display.barHeight + En(e) + 'px');
    }
    function sr(e) {
      var t = e.display.gutters,
        n = e.options.gutters;
      T(t);
      for (var i = 0; i < n.length; ++i) {
        var r = n[i],
          o = t.appendChild(A('div', null, 'CodeMirror-gutter ' + r));
        'CodeMirror-linenumbers' == r &&
          ((e.display.lineGutter = o), (o.style.width = (e.display.lineNumWidth || 1) + 'px'));
      }
      (t.style.display = i ? '' : 'none'), or(e);
    }
    function lr(e) {
      var t = H(e.gutters, 'CodeMirror-linenumbers');
      -1 == t && e.lineNumbers
        ? (e.gutters = e.gutters.concat(['CodeMirror-linenumbers']))
        : t > -1 && !e.lineNumbers && ((e.gutters = e.gutters.slice(0)), e.gutters.splice(t, 1));
    }
    (tr.prototype.signal = function (e, t) {
      ct(e, t) && this.events.push(arguments);
    }),
      (tr.prototype.finish = function () {
        for (var e = 0; e < this.events.length; e++) at.apply(null, this.events[e]);
      });
    var cr = 0,
      dr = null;
    function ur(e) {
      var t = e.wheelDeltaX,
        n = e.wheelDeltaY;
      return (
        null == t && e.detail && e.axis == e.HORIZONTAL_AXIS && (t = e.detail),
        null == n && e.detail && e.axis == e.VERTICAL_AXIS
          ? (n = e.detail)
          : null == n && (n = e.wheelDelta),
        { x: t, y: n }
      );
    }
    function hr(e) {
      var t = ur(e);
      return (t.x *= dr), (t.y *= dr), t;
    }
    function pr(e, t) {
      var i = ur(t),
        r = i.x,
        o = i.y,
        a = e.display,
        s = a.scroller,
        c = s.scrollWidth > s.clientWidth;
      if (r && c) {
        if (o && y && l)
          e: for (var d = t.target, h = a.view; d != s; d = d.parentNode)
            for (var p = 0; p < h.length; p++)
              if (h[p].node == d) {
                e.display.currentWheelTarget = d;
                break e;
              }
        if (r && !n && !u && null != dr)
          return r && Ai(e, Math.max(0, s.scrollLeft + r * dr)), void (a.wheelStartX = null);
        if (o && null != dr) {
          var f = o * dr,
            m = e.doc.scrollTop,
            g = m + a.wrapper.clientHeight;
          f < 0 ? (m = Math.max(0, m + f - 50)) : (g = Math.min(e.doc.height, g + f + 50)),
            rr(e, { top: m, bottom: g });
        }
        cr < 20 &&
          (null == a.wheelStartX
            ? ((a.wheelStartX = s.scrollLeft),
              (a.wheelStartY = s.scrollTop),
              (a.wheelDX = r),
              (a.wheelDY = o),
              setTimeout(function () {
                if (null != a.wheelStartX) {
                  var e = s.scrollLeft - a.wheelStartX,
                    t = s.scrollTop - a.wheelStartY,
                    n = (t && a.wheelDY && t / a.wheelDY) || (e && a.wheelDX && e / a.wheelDX);
                  (a.wheelStartX = a.wheelStartY = null),
                    n && ((dr = (dr * cr + n) / (cr + 1)), ++cr);
                }
              }, 200))
            : ((a.wheelDX += r), (a.wheelDY += o)));
      }
    }
    a ? (dr = -0.53) : n ? (dr = 15) : d ? (dr = -0.7) : h && (dr = -1 / 3);
    var fr = function (e, t) {
      (this.ranges = e), (this.primIndex = t);
    };
    (fr.prototype.primary = function () {
      return this.ranges[this.primIndex];
    }),
      (fr.prototype.equals = function (e) {
        if (e == this) return !0;
        if (e.primIndex != this.primIndex || e.ranges.length != this.ranges.length) return !1;
        for (var t = 0; t < this.ranges.length; t++) {
          var n = this.ranges[t],
            i = e.ranges[t];
          if (!ve(n.anchor, i.anchor) || !ve(n.head, i.head)) return !1;
        }
        return !0;
      }),
      (fr.prototype.deepCopy = function () {
        for (var e = [], t = 0; t < this.ranges.length; t++)
          e[t] = new mr(ye(this.ranges[t].anchor), ye(this.ranges[t].head));
        return new fr(e, this.primIndex);
      }),
      (fr.prototype.somethingSelected = function () {
        for (var e = 0; e < this.ranges.length; e++) if (!this.ranges[e].empty()) return !0;
        return !1;
      }),
      (fr.prototype.contains = function (e, t) {
        t || (t = e);
        for (var n = 0; n < this.ranges.length; n++) {
          var i = this.ranges[n];
          if (ge(t, i.from()) >= 0 && ge(e, i.to()) <= 0) return n;
        }
        return -1;
      });
    var mr = function (e, t) {
      (this.anchor = e), (this.head = t);
    };
    function gr(e, t) {
      var n = e[t];
      e.sort(function (e, t) {
        return ge(e.from(), t.from());
      }),
        (t = H(e, n));
      for (var i = 1; i < e.length; i++) {
        var r = e[i],
          o = e[i - 1];
        if (ge(o.to(), r.from()) >= 0) {
          var a = we(o.from(), r.from()),
            s = be(o.to(), r.to()),
            l = o.empty() ? r.from() == r.head : o.from() == o.head;
          i <= t && --t, e.splice(--i, 2, new mr(l ? s : a, l ? a : s));
        }
      }
      return new fr(e, t);
    }
    function vr(e, t) {
      return new fr([new mr(e, t || e)], 0);
    }
    function yr(e) {
      return e.text
        ? me(
            e.from.line + e.text.length - 1,
            Y(e.text).length + (1 == e.text.length ? e.from.ch : 0),
          )
        : e.to;
    }
    function br(e, t) {
      if (ge(e, t.from) < 0) return e;
      if (ge(e, t.to) <= 0) return yr(t);
      var n = e.line + t.text.length - (t.to.line - t.from.line) - 1,
        i = e.ch;
      return e.line == t.to.line && (i += yr(t).ch - t.to.ch), me(n, i);
    }
    function wr(e, t) {
      for (var n = [], i = 0; i < e.sel.ranges.length; i++) {
        var r = e.sel.ranges[i],
          o = new mr(br(r.anchor, t), br(r.head, t));
        t.redoSel &&
          ((o.anchor = t.from),
          'select' == t.redoSel &&
            ((o.head.line = t.from.line), (o.head.ch = t.from.ch + (t.text[0] || '').length))),
          n.push(o);
      }
      return gr(n, e.sel.primIndex);
    }
    function xr(e, t, n) {
      return e.line == t.line
        ? me(n.line, e.ch - t.ch + n.ch)
        : me(n.line + (e.line - t.line), e.ch);
    }
    function Cr(e) {
      (e.doc.mode = Mt(e.options, e.doc.modeOption)), Fr(e);
    }
    function Fr(e) {
      e.doc.iter(function (e) {
        e.stateAfter && (e.stateAfter = null), e.styles && (e.styles = null);
      }),
        (e.doc.frontier = e.doc.first),
        Zi(e, 100),
        e.state.modeGen++,
        e.curOp && Ki(e);
    }
    function Sr(e, t) {
      return (
        0 == t.from.ch &&
        0 == t.to.ch &&
        '' == Y(t.text) &&
        (!e.cm || e.cm.options.wholeLineUpdateBefore)
      );
    }
    function kr(e, t, n, i) {
      function r(e) {
        return n ? n[e] : null;
      }
      function o(e, n, r) {
        !(function (e, t, n, i) {
          (e.text = t),
            e.stateAfter && (e.stateAfter = null),
            e.styles && (e.styles = null),
            null != e.order && (e.order = null),
            Le(e),
            Ne(e, n);
          var r = i ? i(e) : 1;
          r != e.height && de(e, r);
        })(e, n, r, i),
          ln(e, 'change', e, t);
      }
      function a(e, t) {
        for (var n = [], o = e; o < t; ++o) n.push(new Vt(c[o], r(o), i));
        return n;
      }
      var s = t.from,
        l = t.to,
        c = t.text,
        d = se(e, s.line),
        u = se(e, l.line),
        h = Y(c),
        p = r(c.length - 1),
        f = l.line - s.line;
      if (t.full) e.insert(0, a(0, c.length)), e.remove(c.length, e.size - c.length);
      else if (Sr(e, t)) {
        var m = a(0, c.length - 1);
        o(u, u.text, p), f && e.remove(s.line, f), m.length && e.insert(s.line, m);
      } else if (d == u)
        if (1 == c.length) o(d, d.text.slice(0, s.ch) + h + d.text.slice(l.ch), p);
        else {
          var g = a(1, c.length - 1);
          g.push(new Vt(h + d.text.slice(l.ch), p, i)),
            o(d, d.text.slice(0, s.ch) + c[0], r(0)),
            e.insert(s.line + 1, g);
        }
      else if (1 == c.length)
        o(d, d.text.slice(0, s.ch) + c[0] + u.text.slice(l.ch), r(0)), e.remove(s.line + 1, f);
      else {
        o(d, d.text.slice(0, s.ch) + c[0], r(0)), o(u, h + u.text.slice(l.ch), p);
        var v = a(1, c.length - 1);
        f > 1 && e.remove(s.line + 1, f - 1), e.insert(s.line + 1, v);
      }
      ln(e, 'change', e, t);
    }
    function Er(e, t, n) {
      !(function e(i, r, o) {
        if (i.linked)
          for (var a = 0; a < i.linked.length; ++a) {
            var s = i.linked[a];
            if (s.doc != r) {
              var l = o && s.sharedHist;
              (n && !l) || (t(s.doc, l), e(s.doc, i, l));
            }
          }
      })(e, null, !0);
    }
    function Tr(e, t) {
      if (t.cm) throw new Error('This document is already in use.');
      (e.doc = t),
        (t.cm = e),
        ri(e),
        Cr(e),
        _r(e),
        e.options.lineWrapping || Je(e),
        (e.options.mode = t.modeOption),
        Ki(e);
    }
    function _r(e) {
      ('rtl' == e.doc.direction ? D : E)(e.display.lineDiv, 'CodeMirror-rtl');
    }
    function Ar(e) {
      (this.done = []),
        (this.undone = []),
        (this.undoDepth = 1 / 0),
        (this.lastModTime = this.lastSelTime = 0),
        (this.lastOp = this.lastSelOp = null),
        (this.lastOrigin = this.lastSelOrigin = null),
        (this.generation = this.maxGeneration = e || 1);
    }
    function Mr(e, t) {
      var n = { from: ye(t.from), to: yr(t), text: le(e, t.from, t.to) };
      return (
        Ir(e, n, t.from.line, t.to.line + 1),
        Er(
          e,
          function (e) {
            return Ir(e, n, t.from.line, t.to.line + 1);
          },
          !0,
        ),
        n
      );
    }
    function Lr(e) {
      for (; e.length; ) {
        if (!Y(e).ranges) break;
        e.pop();
      }
    }
    function Nr(e, t) {
      return t
        ? { from: t.from, to: t.to, text: t.text, redoSel: !!t['spans_' + e.id], origin: t.origin }
        : null;
    }
    function Dr(e, t) {
      var n = Nr(e, t),
        i = Nr(e, Mr(e, t));
      return (
        (n.origin = 'undo'),
        (i.origin = 'undo'),
        '+findReplace' == t.origin && ((n.redoSel = 'select'), (i.redoSel = 'select')),
        {
          undo: [{ type: 'fences', change: i, id: e.cm.cid }],
          redo: [{ type: 'fences', change: n, id: e.cm.cid }],
        }
      );
    }
    function Rr(e, t, n, i) {
      if (t && 'undo' == t.origin) e.clearHistory();
      else {
        var r = e.history;
        r.undone.length = 0;
        var o,
          a,
          s = +new Date(),
          l = (t.text || []).length > 1;
        t.origin = t.origin || '';
        var c =
          !l &&
          (r.lastOp == i ||
            (r.lastOrigin == t.origin &&
              t.origin &&
              (('+' == t.origin.charAt(0) &&
                e.cm &&
                r.lastModTime > s - e.cm.options.historyEventDelay) ||
                '*' == t.origin.charAt(0))));
        if (e.cm.editor.sourceView.inSourceMode || !e.cm.cid)
          if (
            (c =
              c &&
              (o = (function (e, t) {
                return t
                  ? (Lr(e.done), Y(e.done))
                  : e.done.length && !Y(e.done).ranges
                    ? Y(e.done)
                    : e.done.length > 1 && !e.done[e.done.length - 2].ranges
                      ? (e.done.pop(), Y(e.done))
                      : void 0;
              })(r, r.lastOp == i)))
          )
            (a = Y(o.changes)),
              0 == ge(t.from, t.to) && 0 == ge(t.from, a.to)
                ? (a.to = yr(t))
                : o.changes.push(Mr(e, t));
          else {
            var d = Y(r.done);
            for (
              (d && d.ranges) || Pr(e.sel, r.done),
                o = { changes: [Mr(e, t)], generation: r.generation },
                r.done.push(o);
              r.done.length > r.undoDepth;
            )
              r.done.shift(), r.done[0].ranges || r.done.shift();
          }
        else {
          if (c) {
            var u = e.cm.editor.undo.lastRegisteredOperationCommand();
            (a = u && (u.undo.last() || {}).change),
              File.isNode && File.changeCounter.withdrawAutoSaved() && (c = !1);
            var h = u && (u.redo.last() || {}).change;
            if (a && h)
              if (0 == ge(t.from, t.to) && 0 == ge(t.from, a.to) && 1 == a.text.length) {
                a.to = yr(t);
                var p = t.text[0];
                (h.text[h.text.length - 1] = h.text[h.text.length - 1] + (p || '')),
                  (h.text = h.text.concat(t.text.slice(1)));
              } else if (r.lastOp == i || (1 == a.text.length && u.undo.length < 8)) {
                var f = Dr(e, t);
                u.undo.push(f.undo[0]), u.redo.push(f.redo[0]);
              } else c = !1;
            else c = !1;
          }
          if (!c && 'setValue' != t.origin && e.cm.cid) {
            var m = Dr(e, t);
            if ('cut-line' == t.origin) {
              let t = e.cm.editor.undo.lastRegisteredOperationCommand();
              if (t && 'fences-pos' == (t.undo[0] || {}).type)
                return (t.undo = t.undo.concat(m.undo)), void (t.redo = m.redo);
            }
            e.cm.editor.undo.register(m);
          }
        }
        r.done.push(n),
          (r.generation = ++r.maxGeneration),
          (r.lastModTime = r.lastSelTime = s),
          (r.lastOp = r.lastSelOp = i),
          (r.lastOrigin = r.lastSelOrigin = t.origin),
          a || at(e, 'historyAdded');
      }
    }
    function Br(e, t, n, i) {
      var r = e.history,
        o = i && i.origin;
      n == r.lastSelOp ||
      (o &&
        r.lastSelOrigin == o &&
        ((r.lastModTime == r.lastSelTime && r.lastOrigin == o) ||
          (function (e, t, n, i) {
            var r = t.charAt(0);
            return (
              '*' == r ||
              ('+' == r &&
                n.ranges.length == i.ranges.length &&
                n.somethingSelected() == i.somethingSelected() &&
                new Date() - e.history.lastSelTime <= (e.cm ? e.cm.options.historyEventDelay : 500))
            );
          })(e, o, Y(r.done), t)))
        ? (r.done[r.done.length - 1] = t)
        : Pr(t, r.done),
        (r.lastSelTime = +new Date()),
        (r.lastSelOrigin = o),
        (r.lastSelOp = n),
        i && !1 !== i.clearRedo && Lr(r.undone);
    }
    function Pr(e, t) {
      var n = Y(t);
      (n && n.ranges && n.equals(e)) || t.push(e);
    }
    function Ir(e, t, n, i) {
      var r = t['spans_' + e.id],
        o = 0;
      e.iter(Math.max(e.first, n), Math.min(e.first + e.size, i), function (n) {
        n.markedSpans && ((r || (r = t['spans_' + e.id] = {}))[o] = n.markedSpans), ++o;
      });
    }
    function Or(e) {
      if (!e) return null;
      for (var t, n = 0; n < e.length; ++n)
        e[n].marker.explicitlyCleared ? t || (t = e.slice(0, n)) : t && t.push(e[n]);
      return t ? (t.length ? t : null) : e;
    }
    function $r(e, t) {
      var n = (function (e, t) {
          var n = t['spans_' + e.id];
          if (!n) return null;
          for (var i = [], r = 0; r < t.text.length; ++r) i.push(Or(n[r]));
          return i;
        })(e, t),
        i = Ae(e, t);
      if (!n) return i;
      if (!i) return n;
      for (var r = 0; r < n.length; ++r) {
        var o = n[r],
          a = i[r];
        if (o && a)
          e: for (var s = 0; s < a.length; ++s) {
            for (var l = a[s], c = 0; c < o.length; ++c) if (o[c].marker == l.marker) continue e;
            o.push(l);
          }
        else a && (n[r] = a);
      }
      return n;
    }
    function Hr(e, t, n) {
      for (var i = [], r = 0; r < e.length; ++r) {
        var o = e[r];
        if (o.ranges) i.push(n ? fr.prototype.deepCopy.call(o) : o);
        else {
          var a = o.changes,
            s = [];
          i.push({ changes: s });
          for (var l = 0; l < a.length; ++l) {
            var c = a[l],
              d = void 0;
            if ((s.push({ from: c.from, to: c.to, text: c.text }), t))
              for (var u in c)
                (d = u.match(/^spans_(\d+)$/)) &&
                  H(t, Number(d[1])) > -1 &&
                  ((Y(s)[u] = c[u]), delete c[u]);
          }
        }
      }
      return i;
    }
    function Ur(e, t, n, i) {
      if ((e.cm && e.cm.display.shift) || e.extend) {
        var r = t.anchor;
        if (i) {
          var o = ge(n, r) < 0;
          o != ge(i, r) < 0 ? ((r = n), (n = i)) : o != ge(n, i) < 0 && (n = i);
        }
        return new mr(r, n);
      }
      return new mr(i || n, n);
    }
    function jr(e, t, n, i) {
      Jr(e, new fr([Ur(e, e.sel.primary(), t, n)], 0), i);
    }
    function qr(e, t, n) {
      for (var i = [], r = 0; r < e.sel.ranges.length; r++)
        i[r] = Ur(e, e.sel.ranges[r], t[r], null);
      Jr(e, gr(i, e.sel.primIndex), n);
    }
    function Wr(e, t, n, i) {
      var r = e.sel.ranges.slice(0);
      (r[t] = n), Jr(e, gr(r, e.sel.primIndex), i);
    }
    function zr(e, t, n, i) {
      Jr(e, vr(t, n), i);
    }
    function Vr(e, t, n) {
      var i = e.history.done,
        r = Y(i);
      r && r.ranges ? ((i[i.length - 1] = t), Kr(e, t, n)) : Jr(e, t, n);
    }
    function Jr(e, t, n) {
      Kr(e, t, n), Br(e, e.sel, e.cm ? e.cm.curOp.id : NaN, n);
    }
    function Kr(e, t, n) {
      (ct(e, 'beforeSelectionChange') || (e.cm && ct(e.cm, 'beforeSelectionChange'))) &&
        (t = (function (e, t, n) {
          var i = {
            ranges: t.ranges,
            update: function (t) {
              this.ranges = [];
              for (var n = 0; n < t.length; n++)
                this.ranges[n] = new mr(Ce(e, t[n].anchor), Ce(e, t[n].head));
            },
            origin: n && n.origin,
          };
          return (
            at(e, 'beforeSelectionChange', e, i),
            e.cm && at(e.cm, 'beforeSelectionChange', e.cm, i),
            i.ranges != t.ranges ? gr(i.ranges, i.ranges.length - 1) : t
          );
        })(e, t, n)),
        Yr(
          e,
          Qr(e, t, (n && n.bias) || (ge(t.primary().head, e.sel.primary().head) < 0 ? -1 : 1), !0),
        ),
        (n && !1 === n.scroll) || !e.cm || Fi(e.cm);
    }
    function Yr(e, t) {
      t.equals(e.sel) ||
        ((e.sel = t),
        e.cm && ((e.cm.curOp.updateInput = e.cm.curOp.selectionChanged = !0), lt(e.cm)),
        ln(e, 'cursorActivity', e));
    }
    function Gr(e) {
      Yr(e, Qr(e, e.sel, null, !1));
    }
    function Qr(e, t, n, i) {
      for (var r, o = 0; o < t.ranges.length; o++) {
        var a = t.ranges[o],
          s = t.ranges.length == e.sel.ranges.length && e.sel.ranges[o],
          l = Zr(e, a.anchor, s && s.anchor, n, i),
          c = Zr(e, a.head, s && s.head, n, i);
        (r || l != a.anchor || c != a.head) &&
          (r || (r = t.ranges.slice(0, o)), (r[o] = new mr(l, c)));
      }
      return r ? gr(r, t.primIndex) : t;
    }
    function Xr(e, t, n, i, r) {
      var o = se(e, t.line);
      if (o.markedSpans)
        for (var a = 0; a < o.markedSpans.length; ++a) {
          var s = o.markedSpans[a],
            l = s.marker;
          if (
            (null == s.from || (l.inclusiveLeft ? s.from <= t.ch : s.from < t.ch)) &&
            (null == s.to || (l.inclusiveRight ? s.to >= t.ch : s.to > t.ch))
          ) {
            if (r && (at(l, 'beforeCursorEnter'), l.explicitlyCleared)) {
              if (o.markedSpans) {
                --a;
                continue;
              }
              break;
            }
            if (!l.atomic) continue;
            if (n) {
              var c = l.find(i < 0 ? 1 : -1),
                d = void 0;
              if (
                ((i < 0 ? l.inclusiveRight : l.inclusiveLeft) &&
                  (c = eo(e, c, -i, c && c.line == t.line ? o : null)),
                c && c.line == t.line && (d = ge(c, n)) && (i < 0 ? d < 0 : d > 0))
              )
                return Xr(e, c, t, i, r);
            }
            var u = l.find(i < 0 ? -1 : 1);
            return (
              (i < 0 ? l.inclusiveLeft : l.inclusiveRight) &&
                (u = eo(e, u, i, u.line == t.line ? o : null)),
              u ? Xr(e, u, t, i, r) : null
            );
          }
        }
      return t;
    }
    function Zr(e, t, n, i, r) {
      var o = i || 1,
        a =
          Xr(e, t, n, o, r) ||
          (!r && Xr(e, t, n, o, !0)) ||
          Xr(e, t, n, -o, r) ||
          (!r && Xr(e, t, n, -o, !0));
      return a || ((e.cantEdit = !0), me(e.first, 0));
    }
    function eo(e, t, n, i) {
      return n < 0 && 0 == t.ch
        ? t.line > e.first
          ? Ce(e, me(t.line - 1))
          : null
        : n > 0 && t.ch == (i || se(e, t.line)).text.length
          ? t.line < e.first + e.size - 1
            ? me(t.line + 1, 0)
            : null
          : new me(t.line, t.ch + n);
    }
    function to(e) {
      e.setSelection(me(e.firstLine(), 0), me(e.lastLine()), q);
    }
    function no(e, t, n) {
      var i = {
        canceled: !1,
        from: t.from,
        to: t.to,
        text: t.text,
        origin: t.origin,
        cancel: function () {
          return (i.canceled = !0);
        },
      };
      return (
        n &&
          (i.update = function (t, n, r, o) {
            t && (i.from = Ce(e, t)),
              n && (i.to = Ce(e, n)),
              r && (i.text = r),
              void 0 !== o && (i.origin = o);
          }),
        at(e, 'beforeChange', e, i),
        e.cm && at(e.cm, 'beforeChange', e.cm, i),
        i.canceled ? null : { from: i.from, to: i.to, text: i.text, origin: i.origin }
      );
    }
    function io(e, t, n) {
      if (e.cm) {
        if (!e.cm.curOp) return zi(e.cm, io)(e, t, n);
        if (e.cm.state.suppressEdits) return;
      }
      if (!(ct(e, 'beforeChange') || (e.cm && ct(e.cm, 'beforeChange'))) || (t = no(e, t, !0))) {
        var i =
          Se &&
          !n &&
          (function (e, t, n) {
            var i = null;
            if (
              (e.iter(t.line, n.line + 1, function (e) {
                if (e.markedSpans)
                  for (var t = 0; t < e.markedSpans.length; ++t) {
                    var n = e.markedSpans[t].marker;
                    !n.readOnly || (i && -1 != H(i, n)) || (i || (i = [])).push(n);
                  }
              }),
              !i)
            )
              return null;
            for (var r = [{ from: t, to: n }], o = 0; o < i.length; ++o)
              for (var a = i[o], s = a.find(0), l = 0; l < r.length; ++l) {
                var c = r[l];
                if (!(ge(c.to, s.from) < 0 || ge(c.from, s.to) > 0)) {
                  var d = [l, 1],
                    u = ge(c.from, s.from),
                    h = ge(c.to, s.to);
                  (u < 0 || (!a.inclusiveLeft && !u)) && d.push({ from: c.from, to: s.from }),
                    (h > 0 || (!a.inclusiveRight && !h)) && d.push({ from: s.to, to: c.to }),
                    r.splice.apply(r, d),
                    (l += d.length - 3);
                }
              }
            return r;
          })(e, t.from, t.to);
        if (i)
          for (var r = i.length - 1; r >= 0; --r)
            ro(e, { from: i[r].from, to: i[r].to, text: r ? [''] : t.text });
        else ro(e, t);
      }
    }
    function ro(e, t) {
      if (1 != t.text.length || '' != t.text[0] || 0 != ge(t.from, t.to)) {
        var n = wr(e, t);
        Rr(e, t, n, e.cm ? e.cm.curOp.id : NaN), so(e, t, n, Ae(e, t));
        var i = [];
        Er(e, function (e, n) {
          n || -1 != H(i, e.history) || (ho(e.history, t), i.push(e.history)),
            so(e, t, null, Ae(e, t));
        });
      }
    }
    function oo(e, t, n) {
      if (!e.cm || !e.cm.state.suppressEdits || n) {
        for (
          var i,
            r = e.history,
            o = e.sel,
            a = 'undo' == t ? r.done : r.undone,
            s = 'undo' == t ? r.undone : r.done,
            l = 0;
          l < a.length && ((i = a[l]), n ? !i.ranges || i.equals(e.sel) : i.ranges);
          l++
        );
        if (l != a.length) {
          for (r.lastOrigin = r.lastSelOrigin = null; (i = a.pop()).ranges; ) {
            if ((Pr(i, s), n && !i.equals(e.sel))) return void Jr(e, i, { clearRedo: !1 });
            o = i;
          }
          var c = [];
          Pr(o, s),
            s.push({ changes: c, generation: r.generation }),
            (r.generation = i.generation || ++r.maxGeneration);
          for (
            var d = ct(e, 'beforeChange') || (e.cm && ct(e.cm, 'beforeChange')),
              u = function (n) {
                var r = i.changes[n];
                if (((r.origin = t), d && !no(e, r, !1))) return (a.length = 0), {};
                c.push(Mr(e, r));
                var o = n ? wr(e, r) : Y(a);
                so(e, r, o, $r(e, r)),
                  !n && e.cm && e.cm.scrollIntoView({ from: r.from, to: yr(r) });
                var s = [];
                Er(e, function (e, t) {
                  t || -1 != H(s, e.history) || (ho(e.history, r), s.push(e.history)),
                    so(e, r, null, $r(e, r));
                });
              },
              h = i.changes.length - 1;
            h >= 0;
            --h
          ) {
            var p = u(h);
            if (p) return p.v;
          }
        }
      }
    }
    function ao(e, t) {
      if (
        0 != t &&
        ((e.first += t),
        (e.sel = new fr(
          G(e.sel.ranges, function (e) {
            return new mr(me(e.anchor.line + t, e.anchor.ch), me(e.head.line + t, e.head.ch));
          }),
          e.sel.primIndex,
        )),
        e.cm)
      ) {
        Ki(e.cm, e.first, e.first - t, t);
        for (var n = e.cm.display, i = n.viewFrom; i < n.viewTo; i++) Yi(e.cm, i, 'gutter');
      }
    }
    function so(e, t, n, i) {
      if (e.cm && !e.cm.curOp) return zi(e.cm, so)(e, t, n, i);
      if (t.to.line < e.first) ao(e, t.text.length - 1 - (t.to.line - t.from.line));
      else if (!(t.from.line > e.lastLine())) {
        if (t.from.line < e.first) {
          var r = t.text.length - 1 - (e.first - t.from.line);
          ao(e, r),
            (t = {
              from: me(e.first, 0),
              to: me(t.to.line + r, t.to.ch),
              text: [Y(t.text)],
              origin: t.origin,
            });
        }
        var o = e.lastLine();
        t.to.line > o &&
          (t = {
            from: t.from,
            to: me(o, se(e, o).text.length),
            text: [t.text[0]],
            origin: t.origin,
          }),
          (t.removed = le(e, t.from, t.to)),
          n || (n = wr(e, t)),
          e.cm
            ? (function (e, t, n) {
                var i = e.doc,
                  r = e.display,
                  o = t.from,
                  a = t.to,
                  s = !1,
                  l = o.line;
                e.options.lineWrapping ||
                  ((l = ue(He(se(i, o.line)))),
                  i.iter(l, a.line + 1, function (e) {
                    if (e == r.maxLine) return (s = !0), !0;
                  }));
                i.sel.contains(t.from, t.to) > -1 && lt(e);
                kr(i, t, n, ii(e)),
                  e.options.lineWrapping ||
                    (i.iter(l, o.line + t.text.length, function (e) {
                      var t = Ve(e);
                      t > r.maxLineLength &&
                        ((r.maxLine = e), (r.maxLineLength = t), (r.maxLineChanged = !0), (s = !1));
                    }),
                    s && (e.curOp.updateMaxLine = !0));
                (i.frontier = Math.min(i.frontier, o.line - 1)), Zi(e, 400);
                var c = t.text.length - (a.line - o.line) - 1;
                t.full
                  ? Ki(e)
                  : o.line != a.line || 1 != t.text.length || Sr(e.doc, t)
                    ? Ki(e, o.line, a.line + 1, c)
                    : Yi(e, o.line, 'text');
                var d = ct(e, 'changes'),
                  u = ct(e, 'change');
                if (u || d) {
                  var h = { from: o, to: a, text: t.text, removed: t.removed, origin: t.origin };
                  u && ln(e, 'change', e, h),
                    d && (e.curOp.changeObjs || (e.curOp.changeObjs = [])).push(h);
                }
                e.display.selForContextMenu = null;
              })(e.cm, t, i)
            : kr(e, t, i),
          Kr(e, n, q);
      }
    }
    function lo(e, t, n, i, r) {
      if ((i || (i = n), ge(i, n) < 0)) {
        var o = i;
        (i = n), (n = o);
      }
      'string' == typeof t && (t = e.splitLines(t)), io(e, { from: n, to: i, text: t, origin: r });
    }
    function co(e, t, n, i) {
      n < e.line ? (e.line += i) : t < e.line && ((e.line = t), (e.ch = 0));
    }
    function uo(e, t, n, i) {
      for (var r = 0; r < e.length; ++r) {
        var o = e[r],
          a = !0;
        if (o.ranges) {
          o.copied || ((o = e[r] = o.deepCopy()).copied = !0);
          for (var s = 0; s < o.ranges.length; s++)
            co(o.ranges[s].anchor, t, n, i), co(o.ranges[s].head, t, n, i);
        } else {
          for (var l = 0; l < o.changes.length; ++l) {
            var c = o.changes[l];
            if (n < c.from.line)
              (c.from = me(c.from.line + i, c.from.ch)), (c.to = me(c.to.line + i, c.to.ch));
            else if (t <= c.to.line) {
              a = !1;
              break;
            }
          }
          a || (e.splice(0, r + 1), (r = 0));
        }
      }
    }
    function ho(e, t) {
      var n = t.from.line,
        i = t.to.line,
        r = t.text.length - (i - n) - 1;
      uo(e.done, n, i, r), uo(e.undone, n, i, r);
    }
    function po(e, t, n, i) {
      var r = t,
        o = t;
      return (
        'number' == typeof t ? (o = se(e, xe(e, t))) : (r = ue(t)),
        null == r ? null : (i(o, r) && e.cm && Yi(e.cm, r, n), o)
      );
    }
    (mr.prototype.from = function () {
      return we(this.anchor, this.head);
    }),
      (mr.prototype.to = function () {
        return be(this.anchor, this.head);
      }),
      (mr.prototype.empty = function () {
        return this.head.line == this.anchor.line && this.head.ch == this.anchor.ch;
      });
    var fo = function (e) {
      (this.lines = e), (this.parent = null);
      for (var t = 0, n = 0; n < e.length; ++n) (e[n].parent = this), (t += e[n].height);
      this.height = t;
    };
    (fo.prototype.chunkSize = function () {
      return this.lines.length;
    }),
      (fo.prototype.removeInner = function (e, t) {
        for (var n = e, i = e + t; n < i; ++n) {
          var r = this.lines[n];
          (this.height -= r.height), Jt(r), ln(r, 'delete');
        }
        this.lines.splice(e, t);
      }),
      (fo.prototype.collapse = function (e) {
        e.push.apply(e, this.lines);
      }),
      (fo.prototype.insertInner = function (e, t, n) {
        (this.height += n),
          (this.lines = this.lines.slice(0, e).concat(t).concat(this.lines.slice(e)));
        for (var i = 0; i < t.length; ++i) t[i].parent = this;
      }),
      (fo.prototype.iterN = function (e, t, n) {
        for (var i = e + t; e < i; ++e) if (n(this.lines[e])) return !0;
      });
    var mo = function (e) {
      this.children = e;
      for (var t = 0, n = 0, i = 0; i < e.length; ++i) {
        var r = e[i];
        (t += r.chunkSize()), (n += r.height), (r.parent = this);
      }
      (this.size = t), (this.height = n), (this.parent = null);
    };
    (mo.prototype.chunkSize = function () {
      return this.size;
    }),
      (mo.prototype.removeInner = function (e, t) {
        this.size -= t;
        for (var n = 0; n < this.children.length; ++n) {
          var i = this.children[n],
            r = i.chunkSize();
          if (e < r) {
            var o = Math.min(t, r - e),
              a = i.height;
            if (
              (i.removeInner(e, o),
              (this.height -= a - i.height),
              r == o && (this.children.splice(n--, 1), (i.parent = null)),
              0 == (t -= o))
            )
              break;
            e = 0;
          } else e -= r;
        }
        if (this.size - t < 25 && (this.children.length > 1 || !(this.children[0] instanceof fo))) {
          var s = [];
          this.collapse(s), (this.children = [new fo(s)]), (this.children[0].parent = this);
        }
      }),
      (mo.prototype.collapse = function (e) {
        for (var t = 0; t < this.children.length; ++t) this.children[t].collapse(e);
      }),
      (mo.prototype.insertInner = function (e, t, n) {
        (this.size += t.length), (this.height += n);
        for (var i = 0; i < this.children.length; ++i) {
          var r = this.children[i],
            o = r.chunkSize();
          if (e <= o) {
            if ((r.insertInner(e, t, n), r.lines && r.lines.length > 50)) {
              for (var a = (r.lines.length % 25) + 25, s = a; s < r.lines.length; ) {
                var l = new fo(r.lines.slice(s, (s += 25)));
                (r.height -= l.height), this.children.splice(++i, 0, l), (l.parent = this);
              }
              (r.lines = r.lines.slice(0, a)), this.maybeSpill();
            }
            break;
          }
          e -= o;
        }
      }),
      (mo.prototype.maybeSpill = function () {
        if (!(this.children.length <= 10)) {
          var e = this;
          do {
            var t = e.children.splice(e.children.length - 5, 5),
              n = new mo(t);
            if (e.parent) {
              (e.size -= n.size), (e.height -= n.height);
              var i = H(e.parent.children, e);
              e.parent.children.splice(i + 1, 0, n);
            } else {
              var r = new mo(e.children);
              (r.parent = e), (e.children = [r, n]), (e = r);
            }
            n.parent = e.parent;
          } while (e.children.length > 10);
          e.parent.maybeSpill();
        }
      }),
      (mo.prototype.iterN = function (e, t, n) {
        for (var i = 0; i < this.children.length; ++i) {
          var r = this.children[i],
            o = r.chunkSize();
          if (e < o) {
            var a = Math.min(t, o - e);
            if (r.iterN(e, a, n)) return !0;
            if (0 == (t -= a)) break;
            e = 0;
          } else e -= o;
        }
      });
    var go = function (e, t, n) {
      if (n) for (var i in n) n.hasOwnProperty(i) && (this[i] = n[i]);
      (this.doc = e), (this.node = t);
    };
    function vo(e, t, n) {
      ze(t) < ((e.curOp && e.curOp.scrollTop) || e.doc.scrollTop) && Ci(e, n);
    }
    (go.prototype.clear = function () {
      var e = this.doc.cm,
        t = this.line.widgets,
        n = this.line,
        i = ue(n);
      if (null != i && t) {
        for (var r = 0; r < t.length; ++r) t[r] == this && t.splice(r--, 1);
        t.length || (n.widgets = null);
        var o = xn(this);
        de(n, Math.max(0, n.height - o)),
          e &&
            (Wi(e, function () {
              vo(e, n, -o), Yi(e, i, 'widget');
            }),
            ln(e, 'lineWidgetCleared', e, this, i));
      }
    }),
      (go.prototype.changed = function () {
        var e = this,
          t = this.height,
          n = this.doc.cm,
          i = this.line;
        this.height = null;
        var r = xn(this) - t;
        r &&
          (de(i, i.height + r),
          n &&
            Wi(n, function () {
              (n.curOp.forceUpdate = !0), vo(n, i, r), ln(n, 'lineWidgetChanged', n, e, ue(i));
            }));
      }),
      dt(go);
    var yo = 0,
      bo = function (e, t) {
        (this.lines = []), (this.type = t), (this.doc = e), (this.id = ++yo);
      };
    function wo(e, t, n, i, r) {
      if (i && i.shared)
        return (function (e, t, n, i, r) {
          (i = I(i)).shared = !1;
          var o = [wo(e, t, n, i, r)],
            a = o[0],
            s = i.widgetNode;
          return (
            Er(e, function (e) {
              s && (i.widgetNode = s.cloneNode(!0)), o.push(wo(e, Ce(e, t), Ce(e, n), i, r));
              for (var l = 0; l < e.linked.length; ++l) if (e.linked[l].isParent) return;
              a = Y(o);
            }),
            new xo(o, a)
          );
        })(e, t, n, i, r);
      if (e.cm && !e.cm.curOp) return zi(e.cm, wo)(e, t, n, i, r);
      var o = new bo(e, r),
        a = ge(t, n);
      if ((i && I(i, o, !1), a > 0 || (0 == a && !1 !== o.clearWhenEmpty))) return o;
      if (
        (o.replacedWith &&
          ((o.collapsed = !0),
          (o.widgetNode = M('span', [o.replacedWith], 'CodeMirror-widget')),
          i.handleMouseEvents || o.widgetNode.setAttribute('cm-ignore-events', 'true'),
          i.insertLeft && (o.widgetNode.insertLeft = !0)),
        o.collapsed)
      ) {
        if ($e(e, t.line, t, n, o) || (t.line != n.line && $e(e, n.line, t, n, o)))
          throw new Error('Inserting collapsed marker partially overlapping an existing one');
        ke = !0;
      }
      o.addToHistory && Rr(e, { from: t, to: n, origin: 'markText' }, e.sel, NaN);
      var s,
        l = t.line,
        c = e.cm;
      if (
        (e.iter(l, n.line + 1, function (e) {
          c && o.collapsed && !c.options.lineWrapping && He(e) == c.display.maxLine && (s = !0),
            o.collapsed && l != t.line && de(e, 0),
            (function (e, t) {
              (e.markedSpans = e.markedSpans ? e.markedSpans.concat([t]) : [t]),
                t.marker.attachLine(e);
            })(e, new Ee(o, l == t.line ? t.ch : null, l == n.line ? n.ch : null)),
            ++l;
        }),
        o.collapsed &&
          e.iter(t.line, n.line + 1, function (t) {
            qe(e, t) && de(t, 0);
          }),
        o.clearOnEnter &&
          it(o, 'beforeCursorEnter', function () {
            return o.clear();
          }),
        o.readOnly &&
          ((Se = !0), (e.history.done.length || e.history.undone.length) && e.clearHistory()),
        o.collapsed && ((o.id = ++yo), (o.atomic = !0)),
        c)
      ) {
        if ((s && (c.curOp.updateMaxLine = !0), o.collapsed)) Ki(c, t.line, n.line + 1);
        else if (o.className || o.title || o.startStyle || o.endStyle || o.css)
          for (var d = t.line; d <= n.line; d++) Yi(c, d, 'text');
        o.atomic && Gr(c.doc), ln(c, 'markerAdded', c, o);
      }
      return o;
    }
    (bo.prototype.clear = function () {
      if (!this.explicitlyCleared) {
        var e = this.doc.cm,
          t = e && !e.curOp;
        if ((t && Oi(e), ct(this, 'clear'))) {
          var n = this.find();
          n && ln(this, 'clear', n.from, n.to);
        }
        for (var i = null, r = null, o = 0; o < this.lines.length; ++o) {
          var a = this.lines[o],
            s = Te(a.markedSpans, this);
          e && !this.collapsed
            ? Yi(e, ue(a), 'text')
            : e && (null != s.to && (r = ue(a)), null != s.from && (i = ue(a))),
            (a.markedSpans = _e(a.markedSpans, s)),
            null == s.from && this.collapsed && !qe(this.doc, a) && e && de(a, Zn(e.display));
        }
        if (e && this.collapsed && !e.options.lineWrapping)
          for (var l = 0; l < this.lines.length; ++l) {
            var c = He(this.lines[l]),
              d = Ve(c);
            d > e.display.maxLineLength &&
              ((e.display.maxLine = c),
              (e.display.maxLineLength = d),
              (e.display.maxLineChanged = !0));
          }
        null != i && e && this.collapsed && Ki(e, i, r + 1),
          (this.lines.length = 0),
          (this.explicitlyCleared = !0),
          this.atomic && this.doc.cantEdit && ((this.doc.cantEdit = !1), e && Gr(e.doc)),
          e && ln(e, 'markerCleared', e, this, i, r),
          t && $i(e),
          this.parent && this.parent.clear();
      }
    }),
      (bo.prototype.find = function (e, t) {
        var n, i;
        null == e && 'bookmark' == this.type && (e = 1);
        for (var r = 0; r < this.lines.length; ++r) {
          var o = this.lines[r],
            a = Te(o.markedSpans, this);
          if (null != a.from && ((n = me(t ? o : ue(o), a.from)), -1 == e)) return n;
          if (null != a.to && ((i = me(t ? o : ue(o), a.to)), 1 == e)) return i;
        }
        return n && { from: n, to: i };
      }),
      (bo.prototype.changed = function () {
        var e = this,
          t = this.find(-1, !0),
          n = this,
          i = this.doc.cm;
        t &&
          i &&
          Wi(i, function () {
            var r = t.line,
              o = ue(t.line),
              a = Ln(i, o);
            if (
              (a && (On(a), (i.curOp.selectionChanged = i.curOp.forceUpdate = !0)),
              (i.curOp.updateMaxLine = !0),
              !qe(n.doc, r) && null != n.height)
            ) {
              var s = n.height;
              n.height = null;
              var l = xn(n) - s;
              l && de(r, r.height + l);
            }
            ln(i, 'markerChanged', i, e);
          });
      }),
      (bo.prototype.attachLine = function (e) {
        if (!this.lines.length && this.doc.cm) {
          var t = this.doc.cm.curOp;
          (t.maybeHiddenMarkers && -1 != H(t.maybeHiddenMarkers, this)) ||
            (t.maybeUnhiddenMarkers || (t.maybeUnhiddenMarkers = [])).push(this);
        }
        this.lines.push(e);
      }),
      (bo.prototype.detachLine = function (e) {
        if ((this.lines.splice(H(this.lines, e), 1), !this.lines.length && this.doc.cm)) {
          var t = this.doc.cm.curOp;
          (t.maybeHiddenMarkers || (t.maybeHiddenMarkers = [])).push(this);
        }
      }),
      dt(bo);
    var xo = function (e, t) {
      (this.markers = e), (this.primary = t);
      for (var n = 0; n < e.length; ++n) e[n].parent = this;
    };
    function Co(e) {
      return e.findMarks(me(e.first, 0), e.clipPos(me(e.lastLine())), function (e) {
        return e.parent;
      });
    }
    function Fo(e) {
      for (
        var t = function (t) {
            var n = e[t],
              i = [n.primary.doc];
            Er(n.primary.doc, function (e) {
              return i.push(e);
            });
            for (var r = 0; r < n.markers.length; r++) {
              var o = n.markers[r];
              -1 == H(i, o.doc) && ((o.parent = null), n.markers.splice(r--, 1));
            }
          },
          n = 0;
        n < e.length;
        n++
      )
        t(n);
    }
    (xo.prototype.clear = function () {
      if (!this.explicitlyCleared) {
        this.explicitlyCleared = !0;
        for (var e = 0; e < this.markers.length; ++e) this.markers[e].clear();
        ln(this, 'clear');
      }
    }),
      (xo.prototype.find = function (e, t) {
        return this.primary.find(e, t);
      }),
      dt(xo);
    var So = 0,
      ko = function (e, t, n, i, r) {
        if (!(this instanceof ko)) return new ko(e, t, n, i, r);
        null == n && (n = 0),
          mo.call(this, [new fo([new Vt('', null)])]),
          (this.first = n),
          (this.scrollTop = this.scrollLeft = 0),
          (this.cantEdit = !1),
          (this.cleanGeneration = 1),
          (this.frontier = n);
        var o = me(n, 0);
        (this.sel = vr(o)),
          (this.history = new Ar(null)),
          (this.id = ++So),
          (this.modeOption = t),
          (this.lineSep = i),
          (this.direction = 'rtl' == r ? 'rtl' : 'ltr'),
          (this.extend = !1),
          'string' == typeof e && (e = this.splitLines(e)),
          kr(this, { from: o, to: o, text: e }),
          Jr(this, vr(o), q);
      };
    (ko.prototype = X(mo.prototype, {
      constructor: ko,
      iter: function (e, t, n) {
        n
          ? this.iterN(e - this.first, t - e, n)
          : this.iterN(this.first, this.first + this.size, e);
      },
      insert: function (e, t) {
        for (var n = 0, i = 0; i < t.length; ++i) n += t[i].height;
        this.insertInner(e - this.first, t, n);
      },
      remove: function (e, t) {
        this.removeInner(e - this.first, t);
      },
      getValue: function (e) {
        var t = ce(this, this.first, this.first + this.size);
        return !1 === e ? t : t.join(e || this.lineSeparator());
      },
      setValue: Ji(function (e, t) {
        var n = me(this.first, 0),
          i = this.first + this.size - 1;
        io(
          this,
          {
            from: n,
            to: me(i, se(this, i).text.length),
            text: this.splitLines(e),
            origin: t || 'setValue',
            full: !0,
          },
          !0,
        ),
          this.cm && Si(this.cm, 0, 0),
          Jr(this, vr(n), q);
      }),
      replaceRange: function (e, t, n, i) {
        lo(this, e, (t = Ce(this, t)), (n = n ? Ce(this, n) : t), i);
      },
      getRange: function (e, t, n) {
        var i = le(this, Ce(this, e), Ce(this, t));
        return !1 === n ? i : i.join(n || this.lineSeparator());
      },
      getLine: function (e) {
        var t = this.getLineHandle(e);
        return t && t.text;
      },
      getLineHandle: function (e) {
        if (pe(this, e)) return se(this, e);
      },
      getLineNumber: function (e) {
        return ue(e);
      },
      getLineHandleVisualStart: function (e) {
        return 'number' == typeof e && (e = se(this, e)), He(e);
      },
      lineCount: function () {
        return this.size;
      },
      firstLine: function () {
        return this.first;
      },
      lastLine: function () {
        return this.first + this.size - 1;
      },
      clipPos: function (e) {
        return Ce(this, e);
      },
      getCursor: function (e) {
        var t = this.sel.primary();
        return null == e || 'head' == e
          ? t.head
          : 'anchor' == e
            ? t.anchor
            : 'end' == e || 'to' == e || !1 === e
              ? t.to()
              : t.from();
      },
      listSelections: function () {
        return this.sel.ranges;
      },
      somethingSelected: function () {
        return this.sel.somethingSelected();
      },
      setCursor: Ji(function (e, t, n) {
        zr(this, Ce(this, 'number' == typeof e ? me(e, t || 0) : e), null, n);
      }),
      setSelection: Ji(function (e, t, n) {
        zr(this, Ce(this, e), Ce(this, t || e), n);
      }),
      extendSelection: Ji(function (e, t, n) {
        jr(this, Ce(this, e), t && Ce(this, t), n);
      }),
      extendSelections: Ji(function (e, t) {
        qr(this, Fe(this, e), t);
      }),
      extendSelectionsBy: Ji(function (e, t) {
        qr(this, Fe(this, G(this.sel.ranges, e)), t);
      }),
      setSelections: Ji(function (e, t, n) {
        if (e.length) {
          for (var i = [], r = 0; r < e.length; r++)
            i[r] = new mr(Ce(this, e[r].anchor), Ce(this, e[r].head));
          null == t && (t = Math.min(e.length - 1, this.sel.primIndex)), Jr(this, gr(i, t), n);
        }
      }),
      addSelection: Ji(function (e, t, n) {
        var i = this.sel.ranges.slice(0);
        i.push(new mr(Ce(this, e), Ce(this, t || e))), Jr(this, gr(i, i.length - 1), n);
      }),
      getSelection: function (e) {
        for (var t, n = this.sel.ranges, i = 0; i < n.length; i++) {
          var r = le(this, n[i].from(), n[i].to());
          t = t ? t.concat(r) : r;
        }
        return !1 === e ? t : t.join(e || this.lineSeparator());
      },
      getSelections: function (e) {
        for (var t = [], n = this.sel.ranges, i = 0; i < n.length; i++) {
          var r = le(this, n[i].from(), n[i].to());
          !1 !== e && (r = r.join(e || this.lineSeparator())), (t[i] = r);
        }
        return t;
      },
      replaceSelection: function (e, t, n) {
        for (var i = [], r = 0; r < this.sel.ranges.length; r++) i[r] = e;
        this.replaceSelections(i, t, n || '+input');
      },
      replaceSelections: Ji(function (e, t, n) {
        for (var i = [], r = this.sel, o = 0; o < r.ranges.length; o++) {
          var a = r.ranges[o];
          i[o] = { from: a.from(), to: a.to(), text: this.splitLines(e[o]), origin: n };
        }
        for (
          var s =
              t &&
              'end' != t &&
              (function (e, t, n) {
                for (var i = [], r = me(e.first, 0), o = r, a = 0; a < t.length; a++) {
                  var s = t[a],
                    l = xr(s.from, r, o),
                    c = xr(yr(s), r, o);
                  if (((r = s.to), (o = c), 'around' == n)) {
                    var d = e.sel.ranges[a],
                      u = ge(d.head, d.anchor) < 0;
                    i[a] = new mr(u ? c : l, u ? l : c);
                  } else i[a] = new mr(l, l);
                }
                return new fr(i, e.sel.primIndex);
              })(this, i, t),
            l = i.length - 1;
          l >= 0;
          l--
        )
          io(this, i[l]);
        s ? Vr(this, s) : this.cm && Fi(this.cm);
      }),
      makeChange: Ji(function (e) {
        io(this, e);
      }),
      undo: Ji(function () {
        oo(this, 'undo');
      }),
      redo: Ji(function () {
        oo(this, 'redo');
      }),
      undoSelection: Ji(function () {
        oo(this, 'undo', !0);
      }),
      redoSelection: Ji(function () {
        oo(this, 'redo', !0);
      }),
      setExtending: function (e) {
        this.extend = e;
      },
      getExtending: function () {
        return this.extend;
      },
      historySize: function () {
        for (var e = this.history, t = 0, n = 0, i = 0; i < e.done.length; i++)
          e.done[i].ranges || ++t;
        for (var r = 0; r < e.undone.length; r++) e.undone[r].ranges || ++n;
        return { undo: t, redo: n };
      },
      clearHistory: function () {
        this.history = new Ar(this.history.maxGeneration);
      },
      markClean: function () {
        this.cleanGeneration = this.changeGeneration(!0);
      },
      changeGeneration: function (e) {
        return (
          e && (this.history.lastOp = this.history.lastSelOp = this.history.lastOrigin = null),
          this.history.generation
        );
      },
      isClean: function (e) {
        return this.history.generation == (e || this.cleanGeneration);
      },
      getHistory: function () {
        return { done: Hr(this.history.done), undone: Hr(this.history.undone) };
      },
      setHistory: function (e) {
        var t = (this.history = new Ar(this.history.maxGeneration));
        (t.done = Hr(e.done.slice(0), null, !0)), (t.undone = Hr(e.undone.slice(0), null, !0));
      },
      setGutterMarker: Ji(function (e, t, n) {
        return po(this, e, 'gutter', function (e) {
          var i = e.gutterMarkers || (e.gutterMarkers = {});
          return (i[t] = n), !n && ne(i) && (e.gutterMarkers = null), !0;
        });
      }),
      clearGutter: Ji(function (e) {
        var t = this;
        this.iter(function (n) {
          n.gutterMarkers &&
            n.gutterMarkers[e] &&
            po(t, n, 'gutter', function () {
              return (
                (n.gutterMarkers[e] = null), ne(n.gutterMarkers) && (n.gutterMarkers = null), !0
              );
            });
        });
      }),
      lineInfo: function (e) {
        var t;
        if ('number' == typeof e) {
          if (!pe(this, e)) return null;
          if (((t = e), !(e = se(this, e)))) return null;
        } else if (null == (t = ue(e))) return null;
        return {
          line: t,
          handle: e,
          text: e.text,
          gutterMarkers: e.gutterMarkers,
          textClass: e.textClass,
          bgClass: e.bgClass,
          wrapClass: e.wrapClass,
          widgets: e.widgets,
        };
      },
      addLineClass: Ji(function (e, t, n) {
        return po(this, e, 'gutter' == t ? 'gutter' : 'class', function (e) {
          var i =
            'text' == t
              ? 'textClass'
              : 'background' == t
                ? 'bgClass'
                : 'gutter' == t
                  ? 'gutterClass'
                  : 'wrapClass';
          if (e[i]) {
            if (S(n).test(e[i])) return !1;
            e[i] += ' ' + n;
          } else e[i] = n;
          return !0;
        });
      }),
      removeLineClass: Ji(function (e, t, n) {
        return po(this, e, 'gutter' == t ? 'gutter' : 'class', function (e) {
          var i =
              'text' == t
                ? 'textClass'
                : 'background' == t
                  ? 'bgClass'
                  : 'gutter' == t
                    ? 'gutterClass'
                    : 'wrapClass',
            r = e[i];
          if (!r) return !1;
          if (null == n) e[i] = null;
          else {
            var o = r.match(S(n));
            if (!o) return !1;
            var a = o.index + o[0].length;
            e[i] = r.slice(0, o.index) + (o.index && a != r.length ? ' ' : '') + r.slice(a) || null;
          }
          return !0;
        });
      }),
      addLineWidget: Ji(function (e, t, n) {
        return (function (e, t, n, i) {
          var r = new go(e, n, i),
            o = e.cm;
          return (
            o && r.noHScroll && (o.display.alignWidgets = !0),
            po(e, t, 'widget', function (t) {
              var n = t.widgets || (t.widgets = []);
              if (
                (null == r.insertAt
                  ? n.push(r)
                  : n.splice(Math.min(n.length - 1, Math.max(0, r.insertAt)), 0, r),
                (r.line = t),
                o && !qe(e, t))
              ) {
                var i = ze(t) < e.scrollTop;
                de(t, t.height + xn(r)), i && Ci(o, r.height), (o.curOp.forceUpdate = !0);
              }
              return !0;
            }),
            ln(o, 'lineWidgetAdded', o, r, 'number' == typeof t ? t : ue(t)),
            r
          );
        })(this, e, t, n);
      }),
      removeLineWidget: function (e) {
        e.clear();
      },
      markText: function (e, t, n) {
        return wo(this, Ce(this, e), Ce(this, t), n, (n && n.type) || 'range');
      },
      setBookmark: function (e, t) {
        var n = {
          replacedWith: t && (null == t.nodeType ? t.widget : t),
          insertLeft: t && t.insertLeft,
          clearWhenEmpty: !1,
          shared: t && t.shared,
          handleMouseEvents: t && t.handleMouseEvents,
        };
        return wo(this, (e = Ce(this, e)), e, n, 'bookmark');
      },
      findMarksAt: function (e) {
        var t = [],
          n = se(this, (e = Ce(this, e)).line).markedSpans;
        if (n)
          for (var i = 0; i < n.length; ++i) {
            var r = n[i];
            (null == r.from || r.from <= e.ch) &&
              (null == r.to || r.to >= e.ch) &&
              t.push(r.marker.parent || r.marker);
          }
        return t;
      },
      findMarks: function (e, t, n) {
        (e = Ce(this, e)), (t = Ce(this, t));
        var i = [],
          r = e.line;
        return (
          this.iter(e.line, t.line + 1, function (o) {
            var a = o.markedSpans;
            if (a)
              for (var s = 0; s < a.length; s++) {
                var l = a[s];
                (null != l.to && r == e.line && e.ch >= l.to) ||
                  (null == l.from && r != e.line) ||
                  (null != l.from && r == t.line && l.from >= t.ch) ||
                  (n && !n(l.marker)) ||
                  i.push(l.marker.parent || l.marker);
              }
            ++r;
          }),
          i
        );
      },
      getAllMarks: function () {
        var e = [];
        return (
          this.iter(function (t) {
            var n = t.markedSpans;
            if (n) for (var i = 0; i < n.length; ++i) null != n[i].from && e.push(n[i].marker);
          }),
          e
        );
      },
      posFromIndex: function (e) {
        var t,
          n = this.first,
          i = this.lineSeparator().length;
        return (
          this.iter(function (r) {
            var o = r.text.length + i;
            if (o > e) return (t = e), !0;
            (e -= o), ++n;
          }),
          Ce(this, me(n, t))
        );
      },
      indexFromPos: function (e) {
        var t = (e = Ce(this, e)).ch;
        if (e.line < this.first || e.ch < 0) return 0;
        var n = this.lineSeparator().length;
        return (
          this.iter(this.first, e.line, function (e) {
            t += e.text.length + n;
          }),
          t
        );
      },
      copy: function (e) {
        var t = new ko(
          ce(this, this.first, this.first + this.size),
          this.modeOption,
          this.first,
          this.lineSep,
          this.direction,
        );
        return (
          (t.scrollTop = this.scrollTop),
          (t.scrollLeft = this.scrollLeft),
          (t.sel = this.sel),
          (t.extend = !1),
          e && ((t.history.undoDepth = this.history.undoDepth), t.setHistory(this.getHistory())),
          t
        );
      },
      linkedDoc: function (e) {
        e || (e = {});
        var t = this.first,
          n = this.first + this.size;
        null != e.from && e.from > t && (t = e.from), null != e.to && e.to < n && (n = e.to);
        var i = new ko(ce(this, t, n), e.mode || this.modeOption, t, this.lineSep, this.direction);
        return (
          e.sharedHist && (i.history = this.history),
          (this.linked || (this.linked = [])).push({ doc: i, sharedHist: e.sharedHist }),
          (i.linked = [{ doc: this, isParent: !0, sharedHist: e.sharedHist }]),
          (function (e, t) {
            for (var n = 0; n < t.length; n++) {
              var i = t[n],
                r = i.find(),
                o = e.clipPos(r.from),
                a = e.clipPos(r.to);
              if (ge(o, a)) {
                var s = wo(e, o, a, i.primary, i.primary.type);
                i.markers.push(s), (s.parent = i);
              }
            }
          })(i, Co(this)),
          i
        );
      },
      unlinkDoc: function (e) {
        if ((e instanceof ma && (e = e.doc), this.linked))
          for (var t = 0; t < this.linked.length; ++t) {
            if (this.linked[t].doc == e) {
              this.linked.splice(t, 1), e.unlinkDoc(this), Fo(Co(this));
              break;
            }
          }
        if (e.history == this.history) {
          var n = [e.id];
          Er(
            e,
            function (e) {
              return n.push(e.id);
            },
            !0,
          ),
            (e.history = new Ar(null)),
            (e.history.done = Hr(this.history.done, n)),
            (e.history.undone = Hr(this.history.undone, n));
        }
      },
      iterLinkedDocs: function (e) {
        Er(this, e);
      },
      getMode: function () {
        return this.mode;
      },
      getEditor: function () {
        return this.cm;
      },
      splitLines: function (e) {
        return this.lineSep ? e.split(this.lineSep) : Ft(e);
      },
      lineSeparator: function () {
        return File.useCRLF ? '\r\n' : '\n';
      },
      setDirection: Ji(function (e) {
        var t;
        ('rtl' != e && (e = 'ltr'), e != this.direction) &&
          ((this.direction = e),
          this.iter(function (e) {
            return (e.order = null);
          }),
          this.cm &&
            Wi((t = this.cm), function () {
              _r(t), Ki(t);
            }));
      }),
    })),
      (ko.prototype.eachLine = ko.prototype.iter);
    var Eo = 0;
    function To(e) {
      var t = this;
      if ((_o(t), !st(t, e) && !Cn(t.display, e))) {
        ut(e), a && (Eo = +new Date());
        var n = oi(t, e, !0),
          i = e.dataTransfer.files;
        if (n && !t.isReadOnly())
          if (i && i.length && window.FileReader && window.File)
            for (
              var r = i.length,
                o = Array(r),
                s = 0,
                l = function (e, i) {
                  if (
                    !t.options.allowDropFileTypes ||
                    -1 != H(t.options.allowDropFileTypes, e.type)
                  ) {
                    var a = new FileReader();
                    (a.onload = zi(t, function () {
                      var e = a.result;
                      if ((/[\x00-\x08\x0e-\x1f]{2}/.test(e) && (e = ''), (o[i] = e), ++s == r)) {
                        var l = {
                          from: (n = Ce(t.doc, n)),
                          to: n,
                          text: t.doc.splitLines(o.join(t.doc.lineSeparator())),
                          origin: 'paste',
                        };
                        io(t.doc, l), Vr(t.doc, vr(n, yr(l)));
                      }
                    })),
                      a.readAsText(e);
                  }
                },
                c = 0;
              c < r;
              ++c
            )
              l(i[c], c);
          else {
            if (t.state.draggingText && t.doc.sel.contains(n) > -1)
              return (
                t.state.draggingText(e),
                void setTimeout(function () {
                  return t.display.input.focus();
                }, 20)
              );
            try {
              var d = e.dataTransfer.getData('Text');
              if (d) {
                var u;
                if (
                  (t.state.draggingText && !t.state.draggingText.copy && (u = t.listSelections()),
                  Kr(t.doc, vr(n, n)),
                  u)
                )
                  for (var h = 0; h < u.length; ++h) lo(t.doc, '', u[h].anchor, u[h].head, 'drag');
                t.replaceSelection(d, 'around', 'paste'), t.display.input.focus();
              }
            } catch (e) {}
          }
      }
    }
    function _o(e) {
      e.display.dragCursor &&
        (e.display.lineSpace.removeChild(e.display.dragCursor), (e.display.dragCursor = null));
    }
    function Ao(e) {
      if (document.body.getElementsByClassName)
        for (var t = document.body.getElementsByClassName('CodeMirror'), n = 0; n < t.length; n++) {
          var i = t[n].CodeMirror;
          i && e(i);
        }
    }
    var Mo = !1;
    function Lo() {
      var e;
      Mo ||
        (it(window, 'resize', function () {
          null == e &&
            (e = setTimeout(function () {
              (e = null), Ao(No);
            }, 500));
        }),
        it(window, 'blur', function () {
          return Ao(mi);
        }),
        (Mo = !0));
    }
    function No(e) {
      var t = e.display;
      (t.lastWrapHeight == t.wrapper.clientHeight && t.lastWrapWidth == t.wrapper.clientWidth) ||
        ((t.cachedCharWidth = t.cachedTextHeight = t.cachedPaddingH = null),
        (t.scrollbarsClipped = !1),
        e.setSize());
    }
    for (
      var Do = {
          3: 'Enter',
          8: 'Backspace',
          9: 'Tab',
          13: 'Enter',
          16: 'Shift',
          17: 'Ctrl',
          18: 'Alt',
          19: 'Pause',
          20: 'CapsLock',
          27: 'Esc',
          32: 'Space',
          33: 'PageUp',
          34: 'PageDown',
          35: 'End',
          36: 'Home',
          37: 'Left',
          38: 'Up',
          39: 'Right',
          40: 'Down',
          44: 'PrintScrn',
          45: 'Insert',
          46: 'Delete',
          59: ';',
          61: '=',
          91: 'Mod',
          92: 'Mod',
          93: 'Mod',
          106: '*',
          107: '=',
          109: '-',
          110: '.',
          111: '/',
          127: 'Delete',
          173: '-',
          186: ';',
          187: '=',
          188: ',',
          189: '-',
          190: '.',
          191: '/',
          192: '`',
          219: '[',
          220: '\\',
          221: ']',
          222: "'",
          63232: 'Up',
          63233: 'Down',
          63234: 'Left',
          63235: 'Right',
          63272: 'Delete',
          63273: 'Home',
          63275: 'End',
          63276: 'PageUp',
          63277: 'PageDown',
          63302: 'Insert',
        },
        Ro = 0;
      Ro < 10;
      Ro++
    )
      Do[Ro + 48] = Do[Ro + 96] = String(Ro);
    for (var Bo = 65; Bo <= 90; Bo++) Do[Bo] = String.fromCharCode(Bo);
    for (var Po = 1; Po <= 12; Po++) Do[Po + 111] = Do[Po + 63235] = 'F' + Po;
    var Io = {};
    function Oo(e) {
      var t,
        n,
        i,
        r,
        o = e.split(/-(?!$)/);
      e = o[o.length - 1];
      for (var a = 0; a < o.length - 1; a++) {
        var s = o[a];
        if (/^(cmd|meta|m)$/i.test(s)) r = !0;
        else if (/^a(lt)?$/i.test(s)) t = !0;
        else if (/^(c|ctrl|control)$/i.test(s)) n = !0;
        else {
          if (!/^s(hift)?$/i.test(s)) throw new Error('Unrecognized modifier name: ' + s);
          i = !0;
        }
      }
      return (
        t && (e = 'Alt-' + e),
        n && (e = 'Ctrl-' + e),
        r && (e = 'Cmd-' + e),
        i && (e = 'Shift-' + e),
        e
      );
    }
    function $o(e) {
      var t = {};
      for (var n in e)
        if (e.hasOwnProperty(n)) {
          var i = e[n];
          if (/^(name|fallthrough|(de|at)tach)$/.test(n)) continue;
          if ('...' == i) {
            delete e[n];
            continue;
          }
          for (var r = G(n.split(' '), Oo), o = 0; o < r.length; o++) {
            var a = void 0,
              s = void 0;
            o == r.length - 1
              ? ((s = r.join(' ')), (a = i))
              : ((s = r.slice(0, o + 1).join(' ')), (a = '...'));
            var l = t[s];
            if (l) {
              if (l != a) throw new Error('Inconsistent bindings for ' + s);
            } else t[s] = a;
          }
          delete e[n];
        }
      for (var c in t) e[c] = t[c];
      return e;
    }
    function Ho(e, t, n, i) {
      var r = (t = qo(t)).call ? t.call(e, i) : t[e];
      if (!1 === r) return 'nothing';
      if ('...' === r) return 'multi';
      if (null != r && n(r)) return 'handled';
      if (t.fallthrough) {
        if ('[object Array]' != Object.prototype.toString.call(t.fallthrough))
          return Ho(e, t.fallthrough, n, i);
        for (var o = 0; o < t.fallthrough.length; o++) {
          var a = Ho(e, t.fallthrough[o], n, i);
          if (a) return a;
        }
      }
    }
    function Uo(e) {
      var t = 'string' == typeof e ? e : Do[e.keyCode];
      return 'Ctrl' == t || 'Alt' == t || 'Shift' == t || 'Mod' == t;
    }
    function jo(e, t) {
      if (u && 34 == e.keyCode && e.char) return !1;
      var n = Do[e.keyCode],
        i = n;
      return (
        null != i &&
        !e.altGraphKey &&
        (e.altKey && 'Alt' != n && (i = 'Alt-' + i),
        (C ? e.metaKey : e.ctrlKey) && 'Ctrl' != n && (i = 'Ctrl-' + i),
        (C ? e.ctrlKey : e.metaKey) && 'Cmd' != n && (i = 'Cmd-' + i),
        !t && e.shiftKey && 'Shift' != n && (i = 'Shift-' + i),
        i)
      );
    }
    function qo(e) {
      return 'string' == typeof e ? Io[e] : e;
    }
    function Wo(e, t) {
      for (var n = e.doc.sel.ranges, i = [], r = 0; r < n.length; r++) {
        for (var o = t(n[r]); i.length && ge(o.from, Y(i).to) <= 0; ) {
          var a = i.pop();
          if (ge(a.from, o.from) < 0) {
            o.from = a.from;
            break;
          }
        }
        i.push(o);
      }
      Wi(e, function () {
        for (var t = i.length - 1; t >= 0; t--) lo(e.doc, '', i[t].from, i[t].to, '+delete');
        Fi(e);
      });
    }
    (Io.basic = {
      Left: 'goCharLeft',
      Right: 'goCharRight',
      Up: 'goLineUp',
      Down: 'goLineDown',
      End: 'goLineEnd',
      Home: 'goLineStartSmart',
      PageUp: 'goPageUp',
      PageDown: 'goPageDown',
      Delete: 'delCharAfter',
      Backspace: 'delCharBefore',
      'Shift-Backspace': 'delCharBefore',
      Tab: 'defaultTab',
      'Shift-Tab': 'indentAuto',
      Enter: 'newlineAndIndent',
      Insert: 'toggleOverwrite',
      Esc: 'singleSelection',
    }),
      (Io.pcDefault = {
        'Ctrl-A': 'selectAll',
        'Ctrl-Up': 'goDocStart',
        'Ctrl-Down': 'goDocEnd',
        'Ctrl-Left': 'goGroupLeft',
        'Ctrl-Right': 'goGroupRight',
        'Alt-Left': 'goLineStart',
        'Alt-Right': 'goLineEnd',
        'Ctrl-Backspace': 'delGroupBefore',
        'Ctrl-Delete': 'delGroupAfter',
        'Ctrl-[': 'indentLess',
        'Ctrl-]': 'indentMore',
        'Ctrl-U': 'undoSelection',
        'Shift-Ctrl-U': 'redoSelection',
        'Alt-U': 'redoSelection',
        fallthrough: 'basic',
      }),
      (Io.emacsy = {
        'Ctrl-F': 'goCharRight',
        'Ctrl-B': 'goCharLeft',
        'Ctrl-P': 'goLineUp',
        'Ctrl-N': 'goLineDown',
        'Alt-F': 'goWordRight',
        'Alt-B': 'goWordLeft',
        'Ctrl-A': 'goLineStart',
        'Ctrl-E': 'goLineEnd',
        'Ctrl-V': 'goPageDown',
        'Shift-Ctrl-V': 'goPageUp',
        'Ctrl-D': 'delCharAfter',
        'Ctrl-H': 'delCharBefore',
        'Alt-D': 'delWordAfter',
        'Alt-Backspace': 'delWordBefore',
        'Ctrl-K': 'killLine',
        'Ctrl-T': 'transposeChars',
        'Ctrl-O': 'openLine',
      }),
      (Io.macDefault = {
        'Cmd-A': 'selectAll',
        'Cmd-Up': 'goDocStart',
        'Cmd-Down': 'goDocEnd',
        'Alt-Left': 'goGroupLeft',
        'Alt-Right': 'goGroupRight',
        'Cmd-Left': 'goLineLeft',
        'Cmd-Right': 'goLineRight',
        'Alt-Backspace': 'delGroupBefore',
        'Ctrl-Alt-Backspace': 'delGroupAfter',
        'Alt-Delete': 'delGroupAfter',
        'Cmd-[': 'indentLess',
        'Cmd-]': 'indentMore',
        'Cmd-Backspace': 'delWrappedLineLeft',
        'Cmd-Delete': 'delWrappedLineRight',
        'Cmd-U': 'undoSelection',
        'Shift-Cmd-U': 'redoSelection',
        'Ctrl-Up': 'goDocStart',
        'Ctrl-Down': 'goDocEnd',
        fallthrough: ['basic', 'emacsy'],
      }),
      (Io.default = y ? Io.macDefault : Io.pcDefault);
    var zo = {
      selectAll: to,
      singleSelection: function (e) {
        return e.setSelection(e.getCursor('anchor'), e.getCursor('head'), q);
      },
      killLine: function (e) {
        return Wo(e, function (t) {
          if (t.empty()) {
            var n = se(e.doc, t.head.line).text.length;
            return t.head.ch == n && t.head.line < e.lastLine()
              ? { from: t.head, to: me(t.head.line + 1, 0) }
              : { from: t.head, to: me(t.head.line, n) };
          }
          return { from: t.from(), to: t.to() };
        });
      },
      deleteLine: function (e) {
        return Wo(e, function (t) {
          return { from: me(t.from().line, 0), to: Ce(e.doc, me(t.to().line + 1, 0)) };
        });
      },
      delLineLeft: function (e) {
        return Wo(e, function (e) {
          return { from: me(e.from().line, 0), to: e.from() };
        });
      },
      delWrappedLineLeft: function (e) {
        return Wo(e, function (t) {
          var n = e.charCoords(t.from(), 'div').top + 5;
          return { from: e.coordsChar({ left: 0, top: n }, 'div'), to: t.to() };
        });
      },
      delWrappedLineRight: function (e) {
        return Wo(e, function (t) {
          var n = e.charCoords(t.to(), 'div').top + 5,
            i = e.coordsChar({ left: e.display.lineDiv.offsetWidth + 100, top: n }, 'div');
          return { from: t.from(), to: i };
        });
      },
      undo: function (e) {
        return e.undo();
      },
      redo: function (e) {
        return e.redo();
      },
      undoSelection: function (e) {
        return e.undoSelection();
      },
      redoSelection: function (e) {
        return e.redoSelection();
      },
      goDocStart: function (e) {
        return e.extendSelection(me(e.firstLine(), 0));
      },
      goDocEnd: function (e) {
        return e.extendSelection(me(e.lastLine()));
      },
      goLineStart: function (e) {
        return e.extendSelectionsBy(
          function (t) {
            return Vo(e, t.head.line);
          },
          { origin: '+move', bias: 1 },
        );
      },
      goLineStartSmart: function (e) {
        return e.extendSelectionsBy(
          function (t) {
            return Jo(e, t.head);
          },
          { origin: '+move', bias: 1 },
        );
      },
      goLineEnd: function (e) {
        return e.extendSelectionsBy(
          function (t) {
            return (function (e, t) {
              var n = se(e.doc, t),
                i = (function (e) {
                  for (var t; (t = Oe(e)); ) e = t.find(1, !0).line;
                  return e;
                })(n);
              i != n && (t = ue(i));
              return et(!0, e, n, t, -1);
            })(e, t.head.line);
          },
          { origin: '+move', bias: -1 },
        );
      },
      goLineRight: function (e) {
        return e.extendSelectionsBy(function (t) {
          var n = e.charCoords(t.head, 'div').top + 5;
          return e.coordsChar({ left: e.display.lineDiv.offsetWidth + 100, top: n }, 'div');
        }, z);
      },
      goLineLeft: function (e) {
        return e.extendSelectionsBy(function (t) {
          var n = e.charCoords(t.head, 'div').top + 5;
          return e.coordsChar({ left: 0, top: n }, 'div');
        }, z);
      },
      goLineLeftSmart: function (e) {
        return e.extendSelectionsBy(function (t) {
          var n = e.charCoords(t.head, 'div').top + 5,
            i = e.coordsChar({ left: 0, top: n }, 'div');
          return i.ch < e.getLine(i.line).search(/\S/) ? Jo(e, t.head) : i;
        }, z);
      },
      goLineUp: function (e) {
        return e.moveV(-1, 'line');
      },
      goLineDown: function (e) {
        return e.moveV(1, 'line');
      },
      goPageUp: function (e) {
        return e.moveV(-1, 'page');
      },
      goPageDown: function (e) {
        return e.moveV(1, 'page');
      },
      goCharLeft: function (e) {
        return e.moveH(-1, 'char');
      },
      goCharRight: function (e) {
        return e.moveH(1, 'char');
      },
      goColumnLeft: function (e) {
        return e.moveH(-1, 'column');
      },
      goColumnRight: function (e) {
        return e.moveH(1, 'column');
      },
      goWordLeft: function (e) {
        return e.moveH(-1, 'word');
      },
      goGroupRight: function (e) {
        return e.moveH(1, 'group');
      },
      goGroupLeft: function (e) {
        return e.moveH(-1, 'group');
      },
      goWordRight: function (e) {
        return e.moveH(1, 'word');
      },
      delCharBefore: function (e) {
        return e.deleteH(-1, 'char');
      },
      delCharAfter: function (e) {
        return e.deleteH(1, 'char');
      },
      delWordBefore: function (e) {
        return e.deleteH(-1, 'word');
      },
      delWordAfter: function (e) {
        return e.deleteH(1, 'word');
      },
      delGroupBefore: function (e) {
        return e.deleteH(-1, 'group');
      },
      delGroupAfter: function (e) {
        return e.deleteH(1, 'group');
      },
      indentAuto: function (e) {
        return e.indentSelection('smart');
      },
      indentMore: function (e) {
        return e.indentSelection('add');
      },
      indentLess: function (e) {
        return e.indentSelection('subtract');
      },
      insertTab: function (e) {
        return e.replaceSelection('\t');
      },
      insertSoftTab: function (e) {
        for (var t = [], n = e.listSelections(), i = e.options.tabSize, r = 0; r < n.length; r++) {
          var o = n[r].from(),
            a = O(e.getLine(o.line), o.ch, i);
          t.push(K(i - (a % i)));
        }
        e.replaceSelections(t);
      },
      defaultTab: function (e) {
        e.somethingSelected() ? e.indentSelection('add') : e.execCommand('insertTab');
      },
      transposeChars: function (e) {
        return Wi(e, function () {
          for (var t = e.listSelections(), n = [], i = 0; i < t.length; i++)
            if (t[i].empty()) {
              var r = t[i].head,
                o = se(e.doc, r.line).text;
              if (o)
                if ((r.ch == o.length && (r = new me(r.line, r.ch - 1)), r.ch > 0))
                  (r = new me(r.line, r.ch + 1)),
                    e.replaceRange(
                      o.charAt(r.ch - 1) + o.charAt(r.ch - 2),
                      me(r.line, r.ch - 2),
                      r,
                      '+transpose',
                    );
                else if (r.line > e.doc.first) {
                  var a = se(e.doc, r.line - 1).text;
                  a &&
                    ((r = new me(r.line, 1)),
                    e.replaceRange(
                      o.charAt(0) + e.doc.lineSeparator() + a.charAt(a.length - 1),
                      me(r.line - 1, a.length - 1),
                      r,
                      '+transpose',
                    ));
                }
              n.push(new mr(r, r));
            }
          e.setSelections(n);
        });
      },
      newlineAndIndent: function (e) {
        return Wi(e, function () {
          for (var t = e.listSelections(), n = t.length - 1; n >= 0; n--)
            e.replaceRange(e.doc.lineSeparator(), t[n].anchor, t[n].head, '+input');
          t = e.listSelections();
          for (var i = 0; i < t.length; i++) e.indentLine(t[i].from().line, null, !0);
          Fi(e);
        });
      },
      openLine: function (e) {
        return e.replaceSelection('\n', 'start');
      },
      toggleOverwrite: function (e) {
        return e.toggleOverwrite();
      },
    };
    function Vo(e, t) {
      var n = se(e.doc, t),
        i = He(n);
      return i != n && (t = ue(i)), et(!0, e, i, t, 1);
    }
    function Jo(e, t) {
      var n = Vo(e, t.line),
        i = se(e.doc, n.line),
        r = Qe(i, e.doc.direction);
      if (!r || 0 == r[0].level) {
        var o = Math.max(0, i.text.search(/\S/)),
          a = t.line == n.line && t.ch <= o && t.ch;
        return me(n.line, a ? 0 : o, n.sticky);
      }
      return n;
    }
    function Ko(e, t, n) {
      if ('string' == typeof t && !(t = zo[t])) return !1;
      e.display.input.ensurePolled();
      var i = e.display.shift,
        r = !1;
      try {
        e.isReadOnly() && (e.state.suppressEdits = !0),
          n && (e.display.shift = !1),
          (r = t(e) != j);
      } finally {
        (e.display.shift = i), (e.state.suppressEdits = !1);
      }
      return r;
    }
    var Yo = new $();
    function Go(e, t, n, i) {
      var r = e.state.keySeq;
      if (r) {
        if (Uo(t)) return 'handled';
        Yo.set(50, function () {
          e.state.keySeq == r && ((e.state.keySeq = null), e.display.input.reset());
        }),
          (t = r + ' ' + t);
      }
      var o = (function (e, t, n) {
        for (var i = 0; i < e.state.keyMaps.length; i++) {
          var r = Ho(t, e.state.keyMaps[i], n, e);
          if (r) return r;
        }
        return (
          (e.options.extraKeys && Ho(t, e.options.extraKeys, n, e)) || Ho(t, e.options.keyMap, n, e)
        );
      })(e, t, i);
      return (
        'multi' == o && (e.state.keySeq = t),
        'handled' == o && ln(e, 'keyHandled', e, t, n),
        ('handled' != o && 'multi' != o) || (ut(n), ui(e)),
        r && !o && /\'$/.test(t) ? (ut(n), !0) : !!o
      );
    }
    function Qo(e, t) {
      var n = jo(t, !0);
      return (
        !!n &&
        (t.shiftKey && !e.state.keySeq
          ? Go(e, 'Shift-' + n, t, function (t) {
              return Ko(e, t, !0);
            }) ||
            Go(e, n, t, function (t) {
              if ('string' == typeof t ? /^go[A-Z]/.test(t) : t.motion) return Ko(e, t);
            })
          : Go(e, n, t, function (t) {
              return Ko(e, t);
            }))
      );
    }
    var Xo,
      Zo,
      ea = null;
    function ta(e) {
      var t = this;
      if (((t.curOp.focus = N()), 37 == e.keyCode && e.shiftKey, !st(t, e))) {
        a && s < 11 && 27 == e.keyCode && (e.returnValue = !1);
        var n = e.keyCode;
        t.display.shift = 16 == n || e.shiftKey;
        var i = Qo(t, e);
        u &&
          ((ea = i ? n : null),
          !i &&
            88 == n &&
            !kt &&
            (y ? e.metaKey : e.ctrlKey) &&
            t.replaceSelection('', null, 'cut')),
          18 != n ||
            /\bCodeMirror-crosshair\b/.test(t.display.lineDiv.className) ||
            (function (e) {
              var t = e.display.lineDiv;
              function n(e) {
                (18 != e.keyCode && e.altKey) ||
                  (E(t, 'CodeMirror-crosshair'),
                  ot(document, 'keyup', n),
                  ot(document, 'mouseover', n));
              }
              D(t, 'CodeMirror-crosshair'), it(document, 'keyup', n), it(document, 'mouseover', n);
            })(t);
      }
    }
    function na(e) {
      16 == e.keyCode && (this.doc.sel.shift = !1), st(this, e);
    }
    function ia(e) {
      var t = this;
      if (!(Cn(t.display, e) || st(t, e) || (e.ctrlKey && !e.altKey) || (y && e.metaKey))) {
        var n = e.keyCode,
          i = e.charCode;
        if (u && n == ea) return (ea = null), void ut(e);
        if (!u || (e.which && !(e.which < 10)) || !Qo(t, e)) {
          var r = String.fromCharCode(null == i ? n : i);
          '\b' != r &&
            ((function (e, t, n) {
              return Go(e, "'" + n + "'", t, function (t) {
                return Ko(e, t, !0);
              });
            })(t, e, r) ||
              t.display.input.onKeyPress(e));
        }
      }
    }
    function ra(e) {
      var t = this,
        n = t.display;
      if (!(st(t, e) || (n.activeTouch && n.input.supportsTouch())))
        if ((n.input.ensurePolled(), (n.shift = e.shiftKey), Cn(n, e, 0 == t.options.lineWrapping)))
          l ||
            ((n.scroller.draggable = !1),
            setTimeout(function () {
              return (n.scroller.draggable = !0);
            }, 100));
        else if (!aa(t, e)) {
          var i = oi(t, e);
          switch ((window.focus(), gt(e))) {
            case 1:
              t.state.selectingText
                ? t.state.selectingText(e)
                : i
                  ? (function (e, t, n) {
                      a ? setTimeout(P(hi, e), 0) : (e.curOp.focus = N());
                      var i,
                        r = +new Date();
                      Zo && Zo.time > r - 400 && 0 == ge(Zo.pos, n)
                        ? (i = 'triple')
                        : Xo && Xo.time > r - 400 && 0 == ge(Xo.pos, n)
                          ? ((i = 'double'), (Zo = { time: r, pos: n }))
                          : ((i = 'single'), (Xo = { time: r, pos: n }));
                      var o,
                        c = e.doc.sel,
                        d = y ? t.metaKey : t.ctrlKey;
                      e.options.dragDrop &&
                      bt &&
                      !e.isReadOnly() &&
                      'single' == i &&
                      (o = c.contains(n)) > -1 &&
                      (ge((o = c.ranges[o]).from(), n) < 0 || n.xRel > 0) &&
                      (ge(o.to(), n) > 0 || n.xRel < 0)
                        ? (function (e, t, n, i) {
                            var r = e.display,
                              o = !1,
                              c = zi(e, function (t) {
                                l && (r.scroller.draggable = !1),
                                  (e.state.draggingText = !1),
                                  ot(document, 'mouseup', c),
                                  ot(document, 'mousemove', d),
                                  ot(r.scroller, 'dragstart', u),
                                  ot(r.scroller, 'drop', c),
                                  o ||
                                    (ut(t),
                                    i || jr(e.doc, n),
                                    l || (a && 9 == s)
                                      ? setTimeout(function () {
                                          document.body.focus(), r.input.focus();
                                        }, 20)
                                      : r.input.focus());
                              }),
                              d = function (e) {
                                o =
                                  o ||
                                  Math.abs(t.clientX - e.clientX) +
                                    Math.abs(t.clientY - e.clientY) >=
                                    10;
                              },
                              u = function () {
                                return (o = !0);
                              };
                            l && (r.scroller.draggable = !0);
                            (e.state.draggingText = c),
                              (c.copy = y ? t.altKey : t.ctrlKey),
                              r.scroller.dragDrop && r.scroller.dragDrop();
                            it(document, 'mouseup', c),
                              it(document, 'mousemove', d),
                              it(r.scroller, 'dragstart', u),
                              it(r.scroller, 'drop', c),
                              pi(e),
                              setTimeout(function () {
                                return r.input.focus();
                              }, 20);
                          })(e, t, n, d)
                        : (function (e, t, n, i, r) {
                            var o = e.display,
                              a = e.doc;
                            ut(t);
                            var s,
                              l,
                              c = a.sel,
                              d = c.ranges;
                            r && !t.shiftKey
                              ? ((l = a.sel.contains(n)), (s = l > -1 ? d[l] : new mr(n, n)))
                              : ((s = a.sel.primary()), (l = a.sel.primIndex));
                            if (b ? t.shiftKey && t.metaKey : t.altKey)
                              (i = 'rect'),
                                r || (s = new mr(n, n)),
                                (n = oi(e, t, !0, !0)),
                                (l = -1);
                            else if ('double' == i) {
                              var u = e.findWordAt(n);
                              s = e.display.shift || a.extend ? Ur(a, s, u.anchor, u.head) : u;
                            } else if ('triple' == i) {
                              var h = new mr(me(n.line, 0), Ce(a, me(n.line + 1, 0)));
                              s = e.display.shift || a.extend ? Ur(a, s, h.anchor, h.head) : h;
                            } else s = Ur(a, s, n);
                            r
                              ? -1 == l
                                ? ((l = d.length),
                                  Jr(a, gr(d.concat([s]), l), { scroll: !1, origin: '*mouse' }))
                                : d.length > 1 && d[l].empty() && 'single' == i && !t.shiftKey
                                  ? (Jr(a, gr(d.slice(0, l).concat(d.slice(l + 1)), 0), {
                                      scroll: !1,
                                      origin: '*mouse',
                                    }),
                                    (c = a.sel))
                                  : Wr(a, l, s, W)
                              : ((l = 0), Jr(a, new fr([s], 0), W), (c = a.sel));
                            var p = n;
                            var f = o.wrapper.getBoundingClientRect(),
                              m = 0;
                            function g(t) {
                              var r = ++m,
                                d = oi(e, t, !0, 'rect' == i);
                              if (d)
                                if (0 != ge(d, p)) {
                                  (e.curOp.focus = N()),
                                    (function (t) {
                                      if (0 == ge(p, t)) return;
                                      if (((p = t), 'rect' == i)) {
                                        for (
                                          var r = [],
                                            o = e.options.tabSize,
                                            d = O(se(a, n.line).text, n.ch, o),
                                            u = O(se(a, t.line).text, t.ch, o),
                                            h = Math.min(d, u),
                                            f = Math.max(d, u),
                                            m = Math.min(n.line, t.line),
                                            g = Math.min(e.lastLine(), Math.max(n.line, t.line));
                                          m <= g;
                                          m++
                                        ) {
                                          var v = se(a, m).text,
                                            y = V(v, h, o);
                                          h == f
                                            ? r.push(new mr(me(m, y), me(m, y)))
                                            : v.length > y &&
                                              r.push(new mr(me(m, y), me(m, V(v, f, o))));
                                        }
                                        r.length || r.push(new mr(n, n)),
                                          Jr(a, gr(c.ranges.slice(0, l).concat(r), l), {
                                            origin: '*mouse',
                                            scroll: !1,
                                          }),
                                          e.scrollIntoView(t);
                                      } else {
                                        var b,
                                          w = s,
                                          x = w.anchor,
                                          C = t;
                                        if ('single' != i)
                                          ge(
                                            (b =
                                              'double' == i
                                                ? e.findWordAt(t)
                                                : new mr(me(t.line, 0), Ce(a, me(t.line + 1, 0))))
                                              .anchor,
                                            x,
                                          ) > 0
                                            ? ((C = b.head), (x = we(w.from(), b.anchor)))
                                            : ((C = b.anchor), (x = be(w.to(), b.head)));
                                        var F = c.ranges.slice(0);
                                        (F[l] = new mr(Ce(a, x), C)), Jr(a, gr(F, l), W);
                                      }
                                    })(d);
                                  var u = yi(o, a);
                                  (d.line >= u.to || d.line < u.from) &&
                                    setTimeout(
                                      zi(e, function () {
                                        m == r && g(t);
                                      }),
                                      150,
                                    );
                                } else {
                                  var h = t.clientY < f.top ? -20 : t.clientY > f.bottom ? 20 : 0;
                                  h &&
                                    setTimeout(
                                      zi(e, function () {
                                        m == r && ((o.scroller.scrollTop += h), g(t));
                                      }),
                                      50,
                                    );
                                }
                            }
                            function v(t) {
                              (e.state.selectingText = !1),
                                (m = 1 / 0),
                                ut(t),
                                o.input.focus(),
                                ot(document, 'mousemove', y),
                                ot(document, 'mouseup', w),
                                a.history
                                  ? (a.history.lastSelOrigin = null)
                                  : ((a.history = new Ar(null)), (a.history.lastSelOrigin = null));
                            }
                            var y = zi(e, function (e) {
                                gt(e) ? g(e) : v(e);
                              }),
                              w = zi(e, v);
                            (e.state.selectingText = w),
                              it(document, 'mousemove', y),
                              it(document, 'mouseup', w);
                          })(e, t, n, i, d);
                    })(t, e, i)
                  : mt(e) == n.scroller && ut(e);
              break;
            case 2:
              l && (t.state.lastMiddleDown = +new Date()),
                i && jr(t.doc, i),
                setTimeout(function () {
                  return n.input.focus();
                }, 20),
                ut(e);
              break;
            case 3:
              F ? sa(t, e) : pi(t);
          }
        }
    }
    function oa(e, t, n, i) {
      var r, o;
      try {
        (r = t.clientX), (o = t.clientY);
      } catch (t) {
        return !1;
      }
      if (r >= Math.floor(e.display.gutters.getBoundingClientRect().right)) return !1;
      i && ut(t);
      var a = e.display,
        s = a.lineDiv.getBoundingClientRect();
      if (o > s.bottom || !ct(e, n)) return pt(t);
      o -= s.top - a.viewOffset;
      for (var l = 0; l < e.options.gutters.length; ++l) {
        var c = a.gutters.childNodes[l];
        if (c && c.getBoundingClientRect().right >= r)
          return at(e, n, e, he(e.doc, o), e.options.gutters[l], t), pt(t);
      }
    }
    function aa(e, t) {
      return oa(e, t, 'gutterClick', !0);
    }
    function sa(e, t) {
      Cn(e.display, t) ||
        (function (e, t) {
          if (!ct(e, 'gutterContextMenu')) return !1;
          return oa(e, t, 'gutterContextMenu', !1);
        })(e, t) ||
        st(e, t, 'contextmenu') ||
        e.display.input.onContextMenu(t);
    }
    function la(e) {
      (e.display.wrapper.className =
        e.display.wrapper.className.replace(/\s*cm-s-\S+/g, '') +
        e.options.theme.replace(/(^|\s)\s*/g, ' cm-s-')),
        Hn(e);
    }
    var ca = {
        toString: function () {
          return 'CodeMirror.Init';
        },
      },
      da = {},
      ua = {};
    function ha(e) {
      sr(e), Ki(e), bi(e);
    }
    function pa(e, t, n) {
      if (!t != !(n && n != ca)) {
        var i = e.display.dragFunctions,
          r = t ? it : ot;
        r(e.display.scroller, 'dragstart', i.start),
          r(e.display.scroller, 'dragenter', i.enter),
          r(e.display.scroller, 'dragover', i.over),
          r(e.display.scroller, 'dragleave', i.leave),
          r(e.display.scroller, 'drop', i.drop);
      }
    }
    function fa(e) {
      e.options.lineWrapping
        ? (D(e.display.wrapper, 'CodeMirror-wrap'),
          (e.display.sizer.style.minWidth = ''),
          (e.display.sizerWidth = null))
        : (E(e.display.wrapper, 'CodeMirror-wrap'), Je(e)),
        ri(e),
        Ki(e),
        Hn(e),
        setTimeout(function () {
          return Di(e);
        }, 100);
    }
    function ma(e, t, i, r) {
      var o = this;
      if (!(this instanceof ma)) return new ma(e, t, i, r);
      (this.options = t = t ? I(t) : {}), I(da, t, !1), lr(t);
      var c = t.value;
      'string' == typeof c && (c = new ko(c, t.mode, null, t.lineSeparator, t.direction)),
        (this.doc = c);
      var d = new ma.inputStyles[t.inputStyle](this),
        p = (this.display = new (function (e, t, i) {
          var r = this;
          (this.input = i),
            (r.scrollbarFiller = A('div', null, 'CodeMirror-scrollbar-filler')),
            r.scrollbarFiller.setAttribute('cm-not-content', 'true'),
            (r.gutterFiller = A('div', null, 'CodeMirror-gutter-filler')),
            r.gutterFiller.setAttribute('cm-not-content', 'true'),
            (r.lineDiv = M('div', null, 'CodeMirror-code')),
            (r.selectionDiv = A('div', null, null, 'position: relative; z-index: 1')),
            (r.cursorDiv = A('div', null, 'CodeMirror-cursors')),
            (r.measure = A('div', null, 'CodeMirror-measure')),
            (r.lineMeasure = A('div', null, 'CodeMirror-measure')),
            (r.lineSpace = M(
              'div',
              [r.measure, r.lineMeasure, r.selectionDiv, r.cursorDiv, r.lineDiv],
              null,
              'position: relative; outline: none',
            ));
          var o = M('div', [r.lineSpace], 'CodeMirror-lines');
          (r.mover = A('div', [o], null, 'position: relative')),
            (r.sizer = A('div', [r.mover], 'CodeMirror-sizer')),
            (r.sizerWidth = null),
            (r.heightForcer = A(
              'div',
              null,
              null,
              'position: absolute; height: ' + U + 'px; width: 1px;',
            )),
            (r.gutters = A('div', null, 'CodeMirror-gutters')),
            (r.lineGutter = null),
            (r.scroller = A('div', [r.sizer, r.heightForcer, r.gutters], 'CodeMirror-scroll')),
            r.scroller.setAttribute('tabIndex', '-1'),
            (r.wrapper = A('div', [r.scrollbarFiller, r.gutterFiller, r.scroller], 'CodeMirror')),
            a && s < 8 && ((r.gutters.style.zIndex = -1), (r.scroller.style.paddingRight = 0)),
            l || (n && v) || (r.scroller.draggable = !0),
            e && (e.appendChild ? e.appendChild(r.wrapper) : e(r.wrapper)),
            (r.viewFrom = r.viewTo = t.first),
            (r.reportedViewFrom = r.reportedViewTo = t.first),
            (r.view = []),
            (r.renderedView = null),
            (r.externalMeasured = null),
            (r.viewOffset = 0),
            (r.lastWrapHeight = r.lastWrapWidth = 0),
            (r.updateLineNumbers = null),
            (r.nativeBarWidth = r.barHeight = r.barWidth = 0),
            (r.scrollbarsClipped = !1),
            (r.lineNumWidth = r.lineNumInnerWidth = r.lineNumChars = null),
            (r.alignWidgets = !1),
            (r.cachedCharWidth = r.cachedTextHeight = r.cachedPaddingH = null),
            (r.maxLine = null),
            (r.maxLineLength = 0),
            (r.maxLineChanged = !1),
            (r.wheelDX = r.wheelDY = r.wheelStartX = r.wheelStartY = null),
            (r.shift = !1),
            (r.selForContextMenu = null),
            (r.activeTouch = null),
            i.init(r);
        })(e, c, d));
      for (var f in ((p.wrapper.CodeMirror = this),
      sr(this),
      la(this),
      t.lineWrapping && (this.display.wrapper.className += ' CodeMirror-wrap'),
      Pi(this),
      (this.state = {
        keyMaps: [],
        overlays: [],
        modeGen: 0,
        overwrite: !1,
        delayingBlurEvent: !1,
        focused: !1,
        suppressEdits: !1,
        pasteIncoming: !1,
        cutIncoming: !1,
        selectingText: !1,
        draggingText: !1,
        highlight: new $(),
        keySeq: null,
        specialChars: null,
      }),
      t.autofocus && !v && p.input.focus(),
      a &&
        s < 11 &&
        setTimeout(function () {
          return o.display.input.reset(!0);
        }, 20),
      (function (e) {
        var t = e.display;
        it(t.scroller, 'mousedown', zi(e, ra)),
          it(
            t.scroller,
            'dblclick',
            a && s < 11
              ? zi(e, function (t) {
                  if (!st(e, t)) {
                    var n = oi(e, t);
                    if (n && !aa(e, t) && !Cn(e.display, t)) {
                      ut(t);
                      var i = e.findWordAt(n);
                      jr(e.doc, i.anchor, i.head);
                    }
                  }
                })
              : function (t) {
                  return st(e, t) || ut(t);
                },
          );
        F ||
          it(t.scroller, 'contextmenu', function (t) {
            return sa(e, t);
          });
        var n,
          i = { end: 0 };
        function r() {
          t.activeTouch &&
            ((n = setTimeout(function () {
              return (t.activeTouch = null);
            }, 1e3)),
            ((i = t.activeTouch).end = +new Date()));
        }
        function o(e, t) {
          if (null == t.left) return !0;
          var n = t.left - e.left,
            i = t.top - e.top;
          return n * n + i * i > 400;
        }
        it(t.scroller, 'touchstart', function (r) {
          if (
            !st(e, r) &&
            !(function (e) {
              if (1 != e.touches.length) return !1;
              var t = e.touches[0];
              return t.radiusX <= 1 && t.radiusY <= 1;
            })(r)
          ) {
            t.input.ensurePolled(), clearTimeout(n);
            var o = +new Date();
            (t.activeTouch = { start: o, moved: !1, prev: o - i.end <= 300 ? i : null }),
              1 == r.touches.length &&
                ((t.activeTouch.left = r.touches[0].pageX),
                (t.activeTouch.top = r.touches[0].pageY));
          }
        }),
          it(t.scroller, 'touchmove', function () {
            t.activeTouch && (t.activeTouch.moved = !0);
          }),
          it(t.scroller, 'touchend', function (n) {
            var i = t.activeTouch;
            if (i && !Cn(t, n) && null != i.left && !i.moved && new Date() - i.start < 300) {
              var a,
                s = e.coordsChar(t.activeTouch, 'page');
              (a =
                !i.prev || o(i, i.prev)
                  ? new mr(s, s)
                  : !i.prev.prev || o(i, i.prev.prev)
                    ? e.findWordAt(s)
                    : new mr(me(s.line, 0), Ce(e.doc, me(s.line + 1, 0)))),
                e.setSelection(a.anchor, a.head),
                e.focus(),
                ut(n);
            }
            r();
          }),
          it(t.scroller, 'touchcancel', r),
          it(t.scroller, 'scroll', function () {
            t.scroller.clientHeight &&
              (Ti(e, t.scroller.scrollTop), Ai(e, t.scroller.scrollLeft, !0), at(e, 'scroll', e));
          }),
          it(t.scroller, 'mousewheel', function (t) {
            return pr(e, t);
          }),
          it(t.scroller, 'DOMMouseScroll', function (t) {
            return pr(e, t);
          }),
          it(t.wrapper, 'scroll', function () {
            return (t.wrapper.scrollTop = t.wrapper.scrollLeft = 0);
          }),
          (t.dragFunctions = {
            enter: function (t) {
              st(e, t) || ft(t);
            },
            over: function (t) {
              st(e, t) ||
                (!(function (e, t) {
                  var n = oi(e, t);
                  if (n) {
                    var i = document.createDocumentFragment();
                    ci(e, n, i),
                      e.display.dragCursor ||
                        ((e.display.dragCursor = A(
                          'div',
                          null,
                          'CodeMirror-cursors CodeMirror-dragcursors',
                        )),
                        e.display.lineSpace.insertBefore(
                          e.display.dragCursor,
                          e.display.cursorDiv,
                        )),
                      _(e.display.dragCursor, i);
                  }
                })(e, t),
                ft(t));
            },
            start: function (t) {
              return (function (e, t) {
                if (a && (!e.state.draggingText || +new Date() - Eo < 100)) ft(t);
                else if (
                  !st(e, t) &&
                  !Cn(e.display, t) &&
                  (t.dataTransfer.setData('Text', e.getSelection()),
                  (t.dataTransfer.effectAllowed = 'copyMove'),
                  t.dataTransfer.setDragImage && !h)
                ) {
                  var n = A('img', null, null, 'position: fixed; left: 0; top: 0;');
                  (n.src =
                    'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='),
                    u &&
                      ((n.width = n.height = 1),
                      e.display.wrapper.appendChild(n),
                      (n._top = n.offsetTop)),
                    t.dataTransfer.setDragImage(n, 0, 0),
                    u && n.parentNode.removeChild(n);
                }
              })(e, t);
            },
            drop: zi(e, To),
            leave: function (t) {
              st(e, t) || _o(e);
            },
          });
        var l = t.input.getField();
        it(l, 'keyup', function (t) {
          return na.call(e, t);
        }),
          it(l, 'keydown', zi(e, ta)),
          it(l, 'keypress', zi(e, ia)),
          it(l, 'focus', function (t) {
            return fi(e, t);
          }),
          it(l, 'blur', function (t) {
            return mi(e, t);
          });
      })(this),
      Lo(),
      Oi(this),
      (this.curOp.forceUpdate = !0),
      Tr(this, c),
      (t.autofocus && !v) || this.hasFocus() ? setTimeout(P(fi, this), 20) : mi(this),
      ua))
        ua.hasOwnProperty(f) && ua[f](o, t[f], ca);
      wi(this), t.finishInit && t.finishInit(this);
      for (var m = 0; m < ga.length; ++m) ga[m](o);
      $i(this),
        l &&
          t.lineWrapping &&
          'optimizelegibility' == getComputedStyle(p.lineDiv).textRendering &&
          (p.lineDiv.style.textRendering = 'auto'),
        (this.editor = i),
        (this.cid = r);
    }
    (ma.defaults = da), (ma.optionHandlers = ua);
    var ga = [];
    function va(e, t, n, i) {
      var r,
        o = e.doc;
      null == n && (n = 'add'), 'smart' == n && (o.mode.indent ? (r = $t(e, t)) : (n = 'prev'));
      var a = e.options.tabSize,
        s = se(o, t),
        l = O(s.text, null, a);
      s.stateAfter && (s.stateAfter = null);
      var c,
        d = s.text.match(/^\s*/)[0];
      if (i || /\S/.test(s.text)) {
        if (
          'smart' == n &&
          ((c = o.mode.indent(r, s.text.slice(d.length), s.text)) == j || c > 150)
        ) {
          if (!i) return;
          n = 'prev';
        }
      } else (c = 0), (n = 'not');
      var u = '',
        h = 0;
      if (
        ('prev' == n
          ? t > o.first
            ? ((c = O((u = se(o, t - 1).text), null, a)), (u = d ? '' : u.match(/^\s*/)[0]))
            : (c = 0)
          : 'add' == n
            ? (c = l + e.options.indentUnit)
            : 'subtract' == n
              ? (c = l - e.options.indentUnit)
              : 'number' == typeof n && (c = l + n),
        (c = Math.max(0, c)),
        u && !d)
      );
      else {
        if (((u = ''), e.options.indentWithTabs))
          for (var p = Math.floor(c / a); p; --p) (h += a), (u += '\t');
        h < c && (u += K(c - h));
      }
      if (u != d) return lo(o, u, me(t, 0), me(t, d.length), '+input'), (s.stateAfter = null), !0;
      for (var f = 0; f < o.sel.ranges.length; f++) {
        var m = o.sel.ranges[f];
        if (m.head.line == t && m.head.ch < d.length) {
          var g = me(t, d.length);
          Wr(o, f, new mr(g, g));
          break;
        }
      }
    }
    ma.defineInitHook = function (e) {
      return ga.push(e);
    };
    var ya = null;
    function ba(e) {
      ya = e;
    }
    function wa(e, t, n, i, r) {
      var o = e.doc;
      (e.display.shift = !1), i || (i = o.sel);
      var a,
        s = e.state.pasteIncoming || 'paste' == r,
        l = Ft(t),
        c = null;
      if (s && i.ranges.length > 1)
        if (ya && ya.text.join('\n') == t) {
          if (i.ranges.length % ya.text.length == 0) {
            c = [];
            for (var d = 0; d < ya.text.length; d++) c.push(o.splitLines(ya.text[d]));
          }
        } else
          l.length == i.ranges.length &&
            (c = G(l, function (e) {
              return [e];
            }));
      for (var u = i.ranges.length - 1; u >= 0; u--) {
        var h = i.ranges[u],
          p = h.from(),
          f = h.to();
        h.empty() &&
          (n && n > 0
            ? (p = me(p.line, p.ch - n))
            : e.state.overwrite && !s
              ? (f = me(f.line, Math.min(se(o, f.line).text.length, f.ch + Y(l).length)))
              : ya && ya.lineWise && ya.text.join('\n') == t && (p = f = me(p.line, 0))),
          (a = e.curOp.updateInput);
        var m = {
          from: p,
          to: f,
          text: c ? c[u % c.length] : l,
          origin: r || (s ? 'paste' : e.state.cutIncoming ? 'cut' : '+input'),
        };
        io(e.doc, m), ln(e, 'inputRead', e, m);
      }
      t && !s && Ca(e, t),
        Fi(e),
        (e.curOp.updateInput = a),
        (e.curOp.typing = !0),
        (e.state.pasteIncoming = e.state.cutIncoming = !1);
    }
    function xa(e, t) {
      var n = e.clipboardData && e.clipboardData.getData('Text');
      if (n)
        return (
          e.preventDefault(),
          t.isReadOnly() ||
            t.options.disableInput ||
            Wi(t, function () {
              return wa(t, n, 0, null, 'paste');
            }),
          !0
        );
    }
    function Ca(e, t) {
      if (e.options.electricChars && e.options.smartIndent)
        for (var n = e.doc.sel, i = n.ranges.length - 1; i >= 0; i--) {
          var r = n.ranges[i];
          if (!(r.head.ch > 100 || (i && n.ranges[i - 1].head.line == r.head.line))) {
            var o = e.getModeAt(r.head),
              a = !1;
            if (o.electricChars) {
              for (var s = 0; s < o.electricChars.length; s++)
                if (t.indexOf(o.electricChars.charAt(s)) > -1) {
                  a = va(e, r.head.line, 'smart');
                  break;
                }
            } else
              o.electricInput &&
                o.electricInput.test(se(e.doc, r.head.line).text.slice(0, r.head.ch)) &&
                (a = va(e, r.head.line, 'smart'));
            a && ln(e, 'electricInput', e, r.head.line);
          }
        }
    }
    function Fa(e) {
      for (var t = [], n = [], i = 0; i < e.doc.sel.ranges.length; i++) {
        var r = e.doc.sel.ranges[i].head.line,
          o = { anchor: me(r, 0), head: me(r + 1, 0) };
        n.push(o), t.push(e.getRange(o.anchor, o.head));
      }
      return { text: t, ranges: n };
    }
    function Sa(e, t) {
      e.setAttribute('autocorrect', 'off'),
        e.setAttribute('autocapitalize', 'off'),
        e.setAttribute('spellcheck', !!t);
    }
    function ka() {
      var e = A(
          'textarea',
          null,
          null,
          'position: absolute; bottom: -1em; padding: 0; width: 1px; height: 1em; outline: none',
        ),
        t = A('div', [e], null, 'overflow: hidden; position: relative; width: 3px; height: 0px;');
      return (
        l ? (e.style.width = '1000px') : e.setAttribute('wrap', 'off'),
        m && (e.style.border = '1px solid black'),
        Sa(e),
        t
      );
    }
    function Ea(e, t, n, i, r) {
      var o = t,
        a = n,
        s = se(e, t.line);
      function l(i) {
        var o, a;
        if (null == (o = r ? tt(e.cm, s, t, n) : Ze(s, t, n))) {
          if (
            i ||
            (a = t.line + n) < e.first ||
            a >= e.first + e.size ||
            ((t = new me(a, t.ch, t.sticky)), !(s = se(e, a)))
          )
            return !1;
          t = et(r, e.cm, s, t.line, n);
        } else t = o;
        return !0;
      }
      if ('char' == i) l();
      else if ('column' == i) l(!0);
      else if ('word' == i || 'group' == i)
        for (
          var c = null, d = 'group' == i, u = e.cm && e.cm.getHelper(t, 'wordChars'), h = !0;
          !(n < 0) || l(!h);
          h = !1
        ) {
          var p = s.text.charAt(t.ch) || '\n',
            f = te(p, u) ? 'w' : d && '\n' == p ? 'n' : !d || /\s/.test(p) ? null : 'p';
          if ((!d || h || f || (f = 's'), c && c != f)) {
            n < 0 && ((n = 1), l(), (t.sticky = 'after'));
            break;
          }
          if ((f && (c = f), n > 0 && !l(!h))) break;
        }
      var m = Zr(e, t, o, a, !0);
      return ve(o, m) && (m.hitSide = !0), m;
    }
    function Ta(e, t, n, i) {
      var r,
        o,
        a = e.doc,
        s = t.left;
      if ('page' == i) {
        var l = Math.min(
            e.display.wrapper.clientHeight,
            window.innerHeight || document.documentElement.clientHeight,
          ),
          c = Math.max(l - 0.5 * Zn(e.display), 3);
        r = (n > 0 ? t.bottom : t.top) + n * c;
      } else 'line' == i && (r = n > 0 ? t.bottom + 3 : t.top - 3);
      for (; (o = Yn(e, s, r)).outside; ) {
        if (n < 0 ? r <= 0 : r >= a.height) {
          o.hitSide = !0;
          break;
        }
        r += 5 * n;
      }
      return o;
    }
    var _a = function (e) {
      (this.cm = e),
        (this.lastAnchorNode =
          this.lastAnchorOffset =
          this.lastFocusNode =
          this.lastFocusOffset =
            null),
        (this.polling = new $()),
        (this.composing = null),
        (this.gracePeriod = !1),
        (this.readDOMTimeout = null);
    };
    function Aa(e, t) {
      var n = Ln(e, t.line);
      if (!n || n.hidden) return null;
      var i = se(e.doc, t.line),
        r = An(n, i, t.line),
        o = Qe(i, e.doc.direction),
        a = 'left';
      o && (a = Ye(o, t.ch) % 2 ? 'right' : 'left');
      var s = Pn(r.map, t.ch, a);
      return (s.offset = 'right' == s.collapse ? s.end : s.start), s;
    }
    function Ma(e, t) {
      return t && (e.bad = !0), e;
    }
    function La(e, t, n) {
      var i;
      if (t == e.display.lineDiv) {
        if (!(i = e.display.lineDiv.childNodes[n]))
          return Ma(e.clipPos(me(e.display.viewTo - 1)), !0);
        (t = null), (n = 0);
      } else
        for (i = t; ; i = i.parentNode) {
          if (!i || i == e.display.lineDiv) return null;
          if (i.parentNode && i.parentNode == e.display.lineDiv) break;
        }
      for (var r = 0; r < e.display.view.length; r++) {
        var o = e.display.view[r];
        if (o.node == i) return Na(o, t, n);
      }
    }
    function Na(e, t, n) {
      var i = e.text.firstChild,
        r = !1;
      if (!t || !L(i, t)) return Ma(me(ue(e.line), 0), !0);
      if (t == i && ((r = !0), (t = i.childNodes[n]), (n = 0), !t)) {
        var o = e.rest ? Y(e.rest) : e.line;
        return Ma(me(ue(o), o.text.length), r);
      }
      var a = 3 == t.nodeType ? t : null,
        s = t;
      for (
        a ||
        1 != t.childNodes.length ||
        3 != t.firstChild.nodeType ||
        ((a = t.firstChild), n && (n = a.nodeValue.length));
        s.parentNode != i;
      )
        s = s.parentNode;
      var l = e.measure,
        c = l.maps;
      function d(t, n, i) {
        for (var r = -1; r < (c ? c.length : 0); r++)
          for (var o = r < 0 ? l.map : c[r], a = 0; a < o.length; a += 3) {
            var s = o[a + 2];
            if (s == t || s == n) {
              var d = ue(r < 0 ? e.line : e.rest[r]),
                u = o[a] + i;
              return (i < 0 || s != t) && (u = o[a + (i ? 1 : 0)]), me(d, u);
            }
          }
      }
      var u = d(a, s, n);
      if (u) return Ma(u, r);
      for (var h = s.nextSibling, p = a ? a.nodeValue.length - n : 0; h; h = h.nextSibling) {
        if ((u = d(h, h.firstChild, 0))) return Ma(me(u.line, u.ch - p), r);
        p += h.textContent.length;
      }
      for (var f = s.previousSibling, m = n; f; f = f.previousSibling) {
        if ((u = d(f, f.firstChild, -1))) return Ma(me(u.line, u.ch + m), r);
        m += f.textContent.length;
      }
    }
    (_a.prototype.init = function (e) {
      var t = this,
        n = this,
        i = n.cm,
        r = (n.div = e.lineDiv);
      function o(e) {
        if (!st(i, e)) {
          if (i.somethingSelected())
            ba({ lineWise: !1, text: i.getSelections() }),
              'cut' == e.type && i.replaceSelection('', null, 'cut');
          else {
            if (!i.options.lineWiseCopyCut) return;
            var t = Fa(i);
            ba({ lineWise: !0, text: t.text }),
              'cut' == e.type &&
                i.operation(function () {
                  i.setSelections(t.ranges, 0, q), i.replaceSelection('', null, 'cut');
                });
          }
          if (e.clipboardData) {
            e.clipboardData.clearData();
            var o = ya.text.join('\n');
            if ((e.clipboardData.setData('Text', o), e.clipboardData.getData('Text') == o))
              return void e.preventDefault();
          }
          var a = ka(),
            s = a.firstChild;
          i.display.lineSpace.insertBefore(a, i.display.lineSpace.firstChild),
            (s.value = ya.text.join('\n'));
          var l = document.activeElement;
          B(s),
            setTimeout(function () {
              i.display.lineSpace.removeChild(a), l.focus(), l == r && n.showPrimarySelection();
            }, 50);
        }
      }
      Sa(r, i.options.spellcheck),
        it(r, 'paste', function (e) {
          st(i, e) ||
            xa(e, i) ||
            (s <= 11 &&
              setTimeout(
                zi(i, function () {
                  return t.updateFromDOM();
                }),
                20,
              ));
        }),
        it(r, 'compositionstart', function (e) {
          t.composing = { data: e.data, done: !1 };
        }),
        it(r, 'compositionupdate', function (e) {
          t.composing || (t.composing = { data: e.data, done: !1 });
        }),
        it(r, 'compositionend', function (e) {
          t.composing &&
            (e.data != t.composing.data && t.readFromDOMSoon(), (t.composing.done = !0));
        }),
        it(r, 'touchstart', function () {
          return n.forceCompositionEnd();
        }),
        it(r, 'input', function () {
          t.composing || t.readFromDOMSoon();
        }),
        it(r, 'copy', o),
        it(r, 'cut', o);
    }),
      (_a.prototype.prepareSelection = function () {
        var e = li(this.cm, !1);
        return (e.focus = this.cm.state.focused), e;
      }),
      (_a.prototype.showSelection = function (e, t) {
        e &&
          this.cm.display.view.length &&
          ((e.focus || t) && this.showPrimarySelection(), this.showMultipleSelections(e));
      }),
      (_a.prototype.showPrimarySelection = function () {
        var e = window.getSelection(),
          t = this.cm,
          i = t.doc.sel.primary(),
          r = i.from(),
          o = i.to();
        if (
          t.display.viewTo == t.display.viewFrom ||
          r.line >= t.display.viewTo ||
          o.line < t.display.viewFrom
        )
          e.removeAllRanges();
        else {
          var a = La(t, e.anchorNode, e.anchorOffset),
            s = La(t, e.focusNode, e.focusOffset);
          if (!a || a.bad || !s || s.bad || 0 != ge(we(a, s), r) || 0 != ge(be(a, s), o)) {
            var l = t.display.view,
              c = (r.line >= t.display.viewFrom && Aa(t, r)) || {
                node: l[0].measure.map[2],
                offset: 0,
              },
              d = o.line < t.display.viewTo && Aa(t, o);
            if (!d) {
              var u = l[l.length - 1].measure,
                h = u.maps ? u.maps[u.maps.length - 1] : u.map;
              d = { node: h[h.length - 1], offset: h[h.length - 2] - h[h.length - 3] };
            }
            if (c && d) {
              var p,
                f = e.rangeCount && e.getRangeAt(0);
              try {
                p = k(c.node, c.offset, d.offset, d.node);
              } catch (e) {}
              p &&
                (!n && t.state.focused
                  ? (e.collapse(c.node, c.offset),
                    p.collapsed || (e.removeAllRanges(), e.addRange(p)))
                  : (e.removeAllRanges(), e.addRange(p)),
                f && null == e.anchorNode ? e.addRange(f) : n && this.startGracePeriod()),
                this.rememberSelection();
            } else e.removeAllRanges();
          }
        }
      }),
      (_a.prototype.startGracePeriod = function () {
        var e = this;
        clearTimeout(this.gracePeriod),
          (this.gracePeriod = setTimeout(function () {
            (e.gracePeriod = !1),
              e.selectionChanged() &&
                e.cm.operation(function () {
                  return (e.cm.curOp.selectionChanged = !0);
                });
          }, 20));
      }),
      (_a.prototype.showMultipleSelections = function (e) {
        _(this.cm.display.cursorDiv, e.cursors), _(this.cm.display.selectionDiv, e.selection);
      }),
      (_a.prototype.rememberSelection = function () {
        var e = window.getSelection();
        (this.lastAnchorNode = e.anchorNode),
          (this.lastAnchorOffset = e.anchorOffset),
          (this.lastFocusNode = e.focusNode),
          (this.lastFocusOffset = e.focusOffset);
      }),
      (_a.prototype.selectionInEditor = function () {
        var e = window.getSelection();
        if (!e.rangeCount) return !1;
        var t = e.getRangeAt(0).commonAncestorContainer;
        return L(this.div, t);
      }),
      (_a.prototype.focus = function () {
        'nocursor' != this.cm.options.readOnly &&
          (this.selectionInEditor() || this.showSelection(this.prepareSelection(), !0),
          this.div.focus());
      }),
      (_a.prototype.blur = function () {
        this.div.blur();
      }),
      (_a.prototype.getField = function () {
        return this.div;
      }),
      (_a.prototype.supportsTouch = function () {
        return !0;
      }),
      (_a.prototype.receivedFocus = function () {
        var e = this;
        this.selectionInEditor()
          ? this.pollSelection()
          : Wi(this.cm, function () {
              return (e.cm.curOp.selectionChanged = !0);
            }),
          this.polling.set(this.cm.options.pollInterval, function t() {
            e.cm.state.focused && (e.pollSelection(), e.polling.set(e.cm.options.pollInterval, t));
          });
      }),
      (_a.prototype.selectionChanged = function () {
        var e = window.getSelection();
        return (
          e.anchorNode != this.lastAnchorNode ||
          e.anchorOffset != this.lastAnchorOffset ||
          e.focusNode != this.lastFocusNode ||
          e.focusOffset != this.lastFocusOffset
        );
      }),
      (_a.prototype.pollSelection = function () {
        if (null == this.readDOMTimeout && !this.gracePeriod && this.selectionChanged()) {
          var e = window.getSelection(),
            t = this.cm;
          if (
            g &&
            d &&
            this.cm.options.gutters.length &&
            (function (e) {
              for (var t = e; t; t = t.parentNode)
                if (/CodeMirror-gutter-wrapper/.test(t.className)) return !0;
              return !1;
            })(e.anchorNode)
          )
            return (
              this.cm.triggerOnKeyDown({ type: 'keydown', keyCode: 8, preventDefault: Math.abs }),
              this.blur(),
              void this.focus()
            );
          if (!this.composing) {
            this.rememberSelection();
            var n = La(t, e.anchorNode, e.anchorOffset),
              i = La(t, e.focusNode, e.focusOffset);
            n &&
              i &&
              Wi(t, function () {
                Jr(t.doc, vr(n, i), q), (n.bad || i.bad) && (t.curOp.selectionChanged = !0);
              });
          }
        }
      }),
      (_a.prototype.pollContent = function () {
        null != this.readDOMTimeout &&
          (clearTimeout(this.readDOMTimeout), (this.readDOMTimeout = null));
        var e,
          t,
          n,
          i = this.cm,
          r = i.display,
          o = i.doc.sel.primary(),
          a = o.from(),
          s = o.to();
        if (
          (0 == a.ch &&
            a.line > i.firstLine() &&
            (a = me(a.line - 1, se(i.doc, a.line - 1).length)),
          s.ch == se(i.doc, s.line).text.length && s.line < i.lastLine() && (s = me(s.line + 1, 0)),
          a.line < r.viewFrom || s.line > r.viewTo - 1)
        )
          return !1;
        a.line == r.viewFrom || 0 == (e = ai(i, a.line))
          ? ((t = ue(r.view[0].line)), (n = r.view[0].node))
          : ((t = ue(r.view[e].line)), (n = r.view[e - 1].node.nextSibling));
        var l,
          c,
          d = ai(i, s.line);
        if (
          (d == r.view.length - 1
            ? ((l = r.viewTo - 1), (c = r.lineDiv.lastChild))
            : ((l = ue(r.view[d + 1].line) - 1), (c = r.view[d + 1].node.previousSibling)),
          !n)
        )
          return !1;
        for (
          var u = i.doc.splitLines(
              (function (e, t, n, i, r) {
                var o = '',
                  a = !1,
                  s = e.doc.lineSeparator();
                function l() {
                  a && ((o += s), (a = !1));
                }
                function c(e) {
                  e && (l(), (o += e));
                }
                function d(t) {
                  if (1 == t.nodeType) {
                    var n = t.getAttribute('cm-text');
                    if (null != n) return void c(n || t.textContent.replace(/\u200b/g, ''));
                    var o,
                      u = t.getAttribute('cm-marker');
                    if (u) {
                      var h = e.findMarks(
                        me(i, 0),
                        me(r + 1, 0),
                        ((m = +u),
                        function (e) {
                          return e.id == m;
                        }),
                      );
                      return void (
                        h.length &&
                        (o = h[0].find()) &&
                        c(le(e.doc, o.from, o.to).join(s))
                      );
                    }
                    if ('false' == t.getAttribute('contenteditable')) return;
                    var p = /^(pre|div|p)$/i.test(t.nodeName);
                    p && l();
                    for (var f = 0; f < t.childNodes.length; f++) d(t.childNodes[f]);
                    p && (a = !0);
                  } else 3 == t.nodeType && c(t.nodeValue);
                  var m;
                }
                for (; d(t), t != n; ) t = t.nextSibling;
                return o;
              })(i, n, c, t, l),
            ),
            h = le(i.doc, me(t, 0), me(l, se(i.doc, l).text.length));
          u.length > 1 && h.length > 1;
        )
          if (Y(u) == Y(h)) u.pop(), h.pop(), l--;
          else {
            if (u[0] != h[0]) break;
            u.shift(), h.shift(), t++;
          }
        for (
          var p = 0, f = 0, m = u[0], g = h[0], v = Math.min(m.length, g.length);
          p < v && m.charCodeAt(p) == g.charCodeAt(p);
        )
          ++p;
        for (
          var y = Y(u),
            b = Y(h),
            w = Math.min(y.length - (1 == u.length ? p : 0), b.length - (1 == h.length ? p : 0));
          f < w && y.charCodeAt(y.length - f - 1) == b.charCodeAt(b.length - f - 1);
        )
          ++f;
        if (1 == u.length && 1 == h.length && t == a.line)
          for (
            ;
            p && p > a.ch && y.charCodeAt(y.length - f - 1) == b.charCodeAt(b.length - f - 1);
          )
            p--, f++;
        (u[u.length - 1] = y.slice(0, y.length - f).replace(/^\u200b+/, '')),
          (u[0] = u[0].slice(p).replace(/\u200b+$/, ''));
        var x = me(t, p),
          C = me(l, h.length ? Y(h).length - f : 0);
        return u.length > 1 || u[0] || ge(x, C) ? (lo(i.doc, u, x, C, '+input'), !0) : void 0;
      }),
      (_a.prototype.ensurePolled = function () {
        this.forceCompositionEnd();
      }),
      (_a.prototype.reset = function () {
        this.forceCompositionEnd();
      }),
      (_a.prototype.forceCompositionEnd = function () {
        this.composing &&
          (clearTimeout(this.readDOMTimeout),
          (this.composing = null),
          this.updateFromDOM(),
          this.div.blur(),
          this.div.focus());
      }),
      (_a.prototype.readFromDOMSoon = function () {
        var e = this;
        null == this.readDOMTimeout &&
          (this.readDOMTimeout = setTimeout(function () {
            if (((e.readDOMTimeout = null), e.composing)) {
              if (!e.composing.done) return;
              e.composing = null;
            }
            e.updateFromDOM();
          }, 80));
      }),
      (_a.prototype.updateFromDOM = function () {
        var e = this;
        (!this.cm.isReadOnly() && this.pollContent()) ||
          Wi(this.cm, function () {
            return Ki(e.cm);
          });
      }),
      (_a.prototype.setUneditable = function (e) {
        e.contentEditable = 'false';
      }),
      (_a.prototype.onKeyPress = function (e) {
        0 != e.charCode &&
          (e.preventDefault(),
          this.cm.isReadOnly() ||
            zi(this.cm, wa)(
              this.cm,
              String.fromCharCode(null == e.charCode ? e.keyCode : e.charCode),
              0,
            ));
      }),
      (_a.prototype.readOnlyChanged = function (e) {
        this.div.contentEditable = String('nocursor' != e);
      }),
      (_a.prototype.onContextMenu = function () {}),
      (_a.prototype.resetPosition = function () {}),
      (_a.prototype.needsContentAttribute = !0);
    var Da = function (e) {
      (this.cm = e),
        (this.prevInput = ''),
        (this.pollingFast = !1),
        (this.polling = new $()),
        (this.inaccurateSelection = !1),
        (this.hasSelection = !1),
        (this.composing = null);
    };
    (Da.prototype.init = function (e) {
      var t = this,
        n = this,
        i = this.cm,
        r = (this.wrapper = ka()),
        o = (this.textarea = r.firstChild);
      function l(e) {
        if (!st(i, e)) {
          if (i.somethingSelected())
            ba({ lineWise: !1, text: i.getSelections() }),
              n.inaccurateSelection &&
                ((n.prevInput = ''),
                (n.inaccurateSelection = !1),
                (o.value = ya.text.join('\n')),
                B(o));
          else {
            if (!i.options.lineWiseCopyCut) return;
            var t = i.getCursor(),
              r = Fa(i);
            if ((ba({ lineWise: !0, text: r.text }), 'cut' == e.type)) {
              if (e.clipboardData) {
                e.clipboardData.clearData();
                var a = ya.text.join('\n');
                if ((e.clipboardData.setData('Text', a), e.clipboardData.getData('Text') == a))
                  return (
                    e.preventDefault(),
                    i.cid &&
                      i.editor.undo.register({
                        undo: [{ type: 'fences-pos', id: i.cid, pos: t }],
                        redo: [],
                      }),
                    void i.replaceRange('', r.ranges[0].anchor, r.ranges[0].head, 'cut-line')
                  );
              }
              i.setSelections(r.ranges, null, q);
            } else (n.prevInput = ''), (o.value = r.text.join('\n')), B(o);
          }
          'cut' == e.type && (i.state.cutIncoming = !0);
        }
      }
      e.wrapper.insertBefore(r, e.wrapper.firstChild),
        m && (o.style.width = '0px'),
        it(o, 'input', function () {
          a && s >= 9 && t.hasSelection && (t.hasSelection = null), n.poll();
        }),
        it(o, 'paste', function (e) {
          st(i, e) || xa(e, i) || ((i.state.pasteIncoming = !0), n.fastPoll());
        }),
        it(o, 'cut', l),
        it(o, 'copy', l),
        it(e.scroller, 'paste', function (t) {
          Cn(e, t) || st(i, t) || ((i.state.pasteIncoming = !0), n.focus());
        }),
        it(e.lineSpace, 'selectstart', function (t) {
          Cn(e, t) || ut(t);
        }),
        it(o, 'compositionstart', function () {
          if (!(i.getSelections().length > 1)) {
            var e = i.getCursor('from');
            n.composing && n.composing.range.clear(),
              (n.composing = {
                start: e,
                range: i.markText(e, i.getCursor('to'), { className: 'CodeMirror-composing' }),
              });
          }
        }),
        it(o, 'compositionend', function () {
          n.composing && (n.poll(), n.composing.range.clear(), (n.composing = null));
        });
    }),
      (Da.prototype.prepareSelection = function () {
        var e = this.cm,
          t = e.display,
          n = e.doc,
          i = li(e);
        if (e.options.moveInputWithCursor) {
          var r = Vn(e, n.sel.primary().head, 'div'),
            o = t.wrapper.getBoundingClientRect(),
            a = t.lineDiv.getBoundingClientRect();
          (i.teTop = Math.max(
            0,
            Math.min(t.wrapper.clientHeight - 10, (r.bottom + r.top) / 2 - 2 + a.top - o.top),
          )),
            (i.teLeft = Math.max(
              0,
              Math.min(t.wrapper.clientWidth - 10, r.left + a.left - o.left),
            ));
        }
        return i;
      }),
      (Da.prototype.showSelection = function (e) {
        var t = this.cm.display;
        _(t.cursorDiv, e.cursors),
          _(t.selectionDiv, e.selection),
          null != e.teTop &&
            ((this.wrapper.style.top = e.teTop + 'px'),
            (this.wrapper.style.left = e.teLeft + 'px'));
      }),
      (Da.prototype.reset = function (e) {
        if (!this.contextMenuPending && !this.composing) {
          var t,
            n,
            i = this.cm,
            r = i.doc;
          if (i.somethingSelected()) {
            this.prevInput = '';
            var o = r.sel.primary(),
              l = (t =
                kt && (o.to().line - o.from().line > 100 || (n = i.getSelection()).length > 1e3))
                ? '-'
                : n || i.getSelection();
            (this.textarea.value = l),
              i.state.focused && B(this.textarea),
              a && s >= 9 && (this.hasSelection = l);
          } else
            e ||
              ((this.prevInput = this.textarea.value = ''),
              a && s >= 9 && (this.hasSelection = null));
          this.inaccurateSelection = t;
        }
      }),
      (Da.prototype.getField = function () {
        return this.textarea;
      }),
      (Da.prototype.supportsTouch = function () {
        return !1;
      }),
      (Da.prototype.focus = function () {
        if ('nocursor' != this.cm.options.readOnly && (!v || N() != this.textarea))
          try {
            this.textarea.focus();
          } catch (e) {}
      }),
      (Da.prototype.blur = function () {
        this.textarea.blur();
      }),
      (Da.prototype.resetPosition = function () {
        this.wrapper.style.top = this.wrapper.style.left = 0;
      }),
      (Da.prototype.receivedFocus = function () {
        this.slowPoll();
      }),
      (Da.prototype.slowPoll = function () {
        var e = this;
        this.pollingFast ||
          this.polling.set(this.cm.options.pollInterval, function () {
            e.poll(), e.cm.state.focused && e.slowPoll();
          });
      }),
      (Da.prototype.fastPoll = function () {
        var e = !1,
          t = this;
        (t.pollingFast = !0),
          t.polling.set(20, function n() {
            t.poll() || e ? ((t.pollingFast = !1), t.slowPoll()) : ((e = !0), t.polling.set(60, n));
          });
      }),
      (Da.prototype.poll = function () {
        var e = this,
          t = this.cm,
          n = this.textarea,
          i = this.prevInput;
        if (
          this.contextMenuPending ||
          !t.state.focused ||
          (St(n) && !i && !this.composing) ||
          t.isReadOnly() ||
          t.options.disableInput ||
          t.state.keySeq
        )
          return !1;
        var r = n.value;
        if (r == i && !t.somethingSelected()) return !1;
        if ((a && s >= 9 && this.hasSelection === r) || (y && /[\uf700-\uf7ff]/.test(r)))
          return t.display.input.reset(), !1;
        if (t.doc.sel == t.display.selForContextMenu) {
          var o = r.charCodeAt(0);
          if ((8203 != o || i || (i = '​'), 8666 == o))
            return this.reset(), this.cm.execCommand('undo');
        }
        for (
          var l = 0, c = Math.min(i.length, r.length);
          l < c && i.charCodeAt(l) == r.charCodeAt(l);
        )
          ++l;
        return (
          Wi(t, function () {
            wa(t, r.slice(l), i.length - l, null, e.composing ? '*compose' : null),
              r.length > 1e3 || r.indexOf('\n') > -1
                ? (n.value = e.prevInput = '')
                : (e.prevInput = r),
              e.composing &&
                (e.composing.range.clear(),
                (e.composing.range = t.markText(e.composing.start, t.getCursor('to'), {
                  className: 'CodeMirror-composing',
                })));
          }),
          !0
        );
      }),
      (Da.prototype.ensurePolled = function () {
        this.pollingFast && this.poll() && (this.pollingFast = !1);
      }),
      (Da.prototype.onKeyPress = function () {
        a && s >= 9 && (this.hasSelection = null), this.fastPoll();
      }),
      (Da.prototype.onContextMenu = function (e) {
        var t = this,
          n = t.cm,
          i = n.display,
          r = t.textarea,
          o = oi(n, e),
          c = i.scroller.scrollTop;
        if (o && !u) {
          var d,
            h = document.querySelector('content');
          if (
            (l && (d = h ? h.scrollTop : window.scrollY),
            n.options.resetSelectionOnContextMenu && -1 == n.doc.sel.contains(o))
          )
            if (File.isMac) {
              var p = n.findWordAt(o);
              zi(n, Jr)(n.doc, vr(p.anchor, p.head), q);
            } else zi(n, Jr)(n.doc, vr(o), q);
          var f = r.style.cssText,
            m = t.wrapper.style.cssText;
          t.wrapper.style.cssText = 'position: absolute';
          var g = t.wrapper.getBoundingClientRect();
          if (
            ((r.style.cssText =
              'position: absolute; width: 30px; height: 30px;\n      top: ' +
              (e.clientY - g.top - 5) +
              'px; left: ' +
              (e.clientX - g.left - 5) +
              'px;\n      z-index: 1000; background: ' +
              (a ? 'rgba(255, 255, 255, .05)' : 'transparent') +
              ';\n      outline: none; border-width: 0; outline: none; overflow: hidden; opacity: .05; filter: alpha(opacity=5);'),
            i.input.focus(),
            l &&
              setTimeout(() => {
                (h || window).scrollTop = d;
              }, 0),
            i.input.reset(),
            n.somethingSelected() || (r.value = t.prevInput = ' '),
            (t.contextMenuPending = !0),
            (i.selForContextMenu = n.doc.sel),
            clearTimeout(i.detectingSelectAll),
            a && s >= 9 && y(),
            F)
          ) {
            ft(e);
            var v = function () {
              ot(window, 'mouseup', v), setTimeout(b, 20);
            };
            it(window, 'mouseup', v);
          } else setTimeout(b, 50);
        }
        function y() {
          if (null != r.selectionStart) {
            var e = n.somethingSelected(),
              o = '​' + (e ? r.value : '');
            (r.value = '⇚'),
              (r.value = o),
              (t.prevInput = e ? '' : '​'),
              (r.selectionStart = 1),
              (r.selectionEnd = o.length),
              (i.selForContextMenu = n.doc.sel);
          }
        }
        function b() {
          if (
            ((t.contextMenuPending = !1),
            (t.wrapper.style.cssText = m),
            (r.style.cssText = f),
            a && s < 9 && i.scrollbars.setScrollTop((i.scroller.scrollTop = c)),
            null != r.selectionStart)
          ) {
            (!a || (a && s < 9)) && y();
            var e = 0,
              o = function () {
                i.selForContextMenu == n.doc.sel &&
                0 == r.selectionStart &&
                r.selectionEnd > 0 &&
                '​' == t.prevInput
                  ? zi(n, to)(n)
                  : e++ < 10
                    ? (i.detectingSelectAll = setTimeout(o, 500))
                    : ((i.selForContextMenu = null), i.input.reset());
              };
            i.detectingSelectAll = setTimeout(o, 200);
          }
        }
      }),
      (Da.prototype.readOnlyChanged = function (e) {
        e || this.reset();
      }),
      (Da.prototype.setUneditable = function () {}),
      (Da.prototype.needsContentAttribute = !1),
      (function (e) {
        var t = e.optionHandlers;
        function n(n, i, r, o) {
          (e.defaults[n] = i),
            r &&
              (t[n] = o
                ? function (e, t, n) {
                    n != ca && r(e, t, n);
                  }
                : r);
        }
        (e.defineOption = n),
          (e.Init = ca),
          n(
            'value',
            '',
            function (e, t) {
              return e.setValue(t);
            },
            !0,
          ),
          n(
            'mode',
            null,
            function (e, t) {
              (e.doc.modeOption = t), Cr(e);
            },
            !0,
          ),
          n('indentUnit', 2, Cr, !0),
          n('indentWithTabs', !1),
          n('smartIndent', !0),
          n(
            'tabSize',
            4,
            function (e) {
              Fr(e), Hn(e), Ki(e);
            },
            !0,
          ),
          n('lineSeparator', null, function (e, t) {
            if (((e.doc.lineSep = t), t)) {
              var n = [],
                i = e.doc.first;
              e.doc.iter(function (e) {
                for (var r = 0; ; ) {
                  var o = e.text.indexOf(t, r);
                  if (-1 == o) break;
                  (r = o + t.length), n.push(me(i, o));
                }
                i++;
              });
              for (var r = n.length - 1; r >= 0; r--)
                lo(e.doc, t, n[r], me(n[r].line, n[r].ch + t.length));
            }
          }),
          n(
            'specialChars',
            /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff]/g,
            function (e, t, n) {
              (e.state.specialChars = new RegExp(t.source + (t.test('\t') ? '' : '|\t'), 'g')),
                n != ca && e.refresh();
            },
          ),
          n(
            'specialCharPlaceholder',
            Xt,
            function (e) {
              return e.refresh();
            },
            !0,
          ),
          n('electricChars', !0),
          n(
            'inputStyle',
            v ? 'contenteditable' : 'textarea',
            function () {
              throw new Error('inputStyle can not (yet) be changed in a running editor');
            },
            !0,
          ),
          n(
            'spellcheck',
            !1,
            function (e, t) {
              return (e.getInputField().spellcheck = t);
            },
            !0,
          ),
          n('rtlMoveVisually', !w),
          n('wholeLineUpdateBefore', !0),
          n(
            'theme',
            'default',
            function (e) {
              la(e), ha(e);
            },
            !0,
          ),
          n('keyMap', 'default', function (e, t, n) {
            var i = qo(t),
              r = n != ca && qo(n);
            r && r.detach && r.detach(e, i), i.attach && i.attach(e, r || null);
          }),
          n('extraKeys', null),
          n('lineWrapping', !1, fa, !0),
          n(
            'gutters',
            [],
            function (e) {
              lr(e.options), ha(e);
            },
            !0,
          ),
          n(
            'fixedGutter',
            !0,
            function (e, t) {
              (e.display.gutters.style.left = t ? ni(e.display) + 'px' : '0'), e.refresh();
            },
            !0,
          ),
          n(
            'coverGutterNextToScrollbar',
            !1,
            function (e) {
              return Di(e);
            },
            !0,
          ),
          n(
            'scrollbarStyle',
            'native',
            function (e) {
              Pi(e),
                Di(e),
                e.display.scrollbars.setScrollTop(e.doc.scrollTop),
                e.display.scrollbars.setScrollLeft(e.doc.scrollLeft);
            },
            !0,
          ),
          n(
            'lineNumbers',
            !1,
            function (e) {
              lr(e.options), ha(e);
            },
            !0,
          ),
          n('firstLineNumber', 1, ha, !0),
          n(
            'lineNumberFormatter',
            function (e) {
              return e;
            },
            ha,
            !0,
          ),
          n('showCursorWhenSelecting', !1, si, !0),
          n('resetSelectionOnContextMenu', !0),
          n('lineWiseCopyCut', !0),
          n('readOnly', !1, function (e, t) {
            'nocursor' == t
              ? (mi(e), e.display.input.blur(), (e.display.disabled = !0))
              : (e.display.disabled = !1),
              e.display.input.readOnlyChanged(t);
          }),
          n(
            'disableInput',
            !1,
            function (e, t) {
              t || e.display.input.reset();
            },
            !0,
          ),
          n('dragDrop', !0, pa),
          n('allowDropFileTypes', null),
          n('cursorBlinkRate', 530),
          n('cursorScrollMargin', 0),
          n('cursorHeight', 1, si, !0),
          n('singleCursorHeightPerLine', !0, si, !0),
          n('workTime', 100),
          n('workDelay', 100),
          n('flattenSpans', !0, Fr, !0),
          n('addModeClass', !1, Fr, !0),
          n('pollInterval', 100),
          n('undoDepth', 200, function (e, t) {
            return (e.doc.history.undoDepth = t);
          }),
          n('historyEventDelay', 1250),
          n(
            'viewportMargin',
            10,
            function (e) {
              return e.refresh();
            },
            !0,
          ),
          n('maxHighlightLength', 1e4, Fr, !0),
          n('moveInputWithCursor', !0, function (e, t) {
            t || e.display.input.resetPosition();
          }),
          n('tabindex', null, function (e, t) {
            return (e.display.input.getField().tabIndex = t || '');
          }),
          n('autofocus', null),
          n(
            'direction',
            'ltr',
            function (e, t) {
              return e.doc.setDirection(t);
            },
            !0,
          );
      })(ma),
      (function (e) {
        var t = e.optionHandlers,
          n = (e.helpers = {});
        (e.prototype = {
          constructor: e,
          focus: function () {
            window.focus(), this.display.input.focus();
          },
          setOption: function (e, n) {
            var i = this.options,
              r = i[e];
            (i[e] == n && 'mode' != e) ||
              ((i[e] = n),
              t.hasOwnProperty(e) && zi(this, t[e])(this, n, r),
              at(this, 'optionChange', this, e));
          },
          getOption: function (e) {
            return this.options[e];
          },
          getDoc: function () {
            return this.doc;
          },
          addKeyMap: function (e, t) {
            this.state.keyMaps[t ? 'push' : 'unshift'](qo(e));
          },
          removeKeyMap: function (e) {
            for (var t = this.state.keyMaps, n = 0; n < t.length; ++n)
              if (t[n] == e || t[n].name == e) return t.splice(n, 1), !0;
          },
          addOverlay: Vi(function (t, n) {
            var i = t.token ? t : e.getMode(this.options, t);
            if (i.startState) throw new Error('Overlays may not be stateful.');
            !(function (e, t, n) {
              for (var i = 0, r = n(t); i < e.length && n(e[i]) <= r; ) i++;
              e.splice(i, 0, t);
            })(
              this.state.overlays,
              { mode: i, modeSpec: t, opaque: n && n.opaque, priority: (n && n.priority) || 0 },
              function (e) {
                return e.priority;
              },
            ),
              this.state.modeGen++,
              Ki(this);
          }),
          removeOverlay: Vi(function (e) {
            for (var t = this.state.overlays, n = 0; n < t.length; ++n) {
              var i = t[n].modeSpec;
              if (i == e || ('string' == typeof e && i.name == e))
                return t.splice(n, 1), this.state.modeGen++, void Ki(this);
            }
          }),
          indentLine: Vi(function (e, t, n) {
            'string' != typeof t &&
              'number' != typeof t &&
              (t =
                null == t ? (this.options.smartIndent ? 'smart' : 'prev') : t ? 'add' : 'subtract'),
              pe(this.doc, e) && va(this, e, t, n);
          }),
          indentSelection: Vi(function (e) {
            for (var t = this.doc.sel.ranges, n = -1, i = 0; i < t.length; i++) {
              var r = t[i];
              if (r.empty())
                r.head.line > n &&
                  (va(this, r.head.line, e, !0),
                  (n = r.head.line),
                  i == this.doc.sel.primIndex && Fi(this));
              else {
                var o = r.from(),
                  a = r.to(),
                  s = Math.max(n, o.line);
                n = Math.min(this.lastLine(), a.line - (a.ch ? 0 : 1)) + 1;
                for (var l = s; l < n; ++l) va(this, l, e);
                var c = this.doc.sel.ranges;
                0 == o.ch &&
                  t.length == c.length &&
                  c[i].from().ch > 0 &&
                  Wr(this.doc, i, new mr(o, c[i].to()), q);
              }
            }
          }),
          getTokenAt: function (e, t) {
            return qt(this, e, t);
          },
          getLineTokens: function (e, t) {
            return qt(this, me(e), t, !0);
          },
          getTokenTypeAt: function (e) {
            e = Ce(this.doc, e);
            var t,
              n = Ot(this, se(this.doc, e.line)),
              i = 0,
              r = (n.length - 1) / 2,
              o = e.ch;
            if (0 == o) t = n[2];
            else
              for (;;) {
                var a = (i + r) >> 1;
                if ((a ? n[2 * a - 1] : 0) >= o) r = a;
                else {
                  if (!(n[2 * a + 1] < o)) {
                    t = n[2 * a + 2];
                    break;
                  }
                  i = a + 1;
                }
              }
            var s = t ? t.indexOf('overlay ') : -1;
            return s < 0 ? t : 0 == s ? null : t.slice(0, s - 1);
          },
          getModeAt: function (t) {
            var n = this.doc.mode;
            return n.innerMode ? e.innerMode(n, this.getTokenAt(t).state).mode : n;
          },
          getHelper: function (e, t) {
            return this.getHelpers(e, t)[0];
          },
          getHelpers: function (e, t) {
            var i = [];
            if (!n.hasOwnProperty(t)) return i;
            var r = n[t],
              o = this.getModeAt(e);
            if ('string' == typeof o[t]) r[o[t]] && i.push(r[o[t]]);
            else if (o[t])
              for (var a = 0; a < o[t].length; a++) {
                var s = r[o[t][a]];
                s && i.push(s);
              }
            else
              o.helperType && r[o.helperType]
                ? i.push(r[o.helperType])
                : r[o.name] && i.push(r[o.name]);
            for (var l = 0; l < r._global.length; l++) {
              var c = r._global[l];
              c.pred(o, this) && -1 == H(i, c.val) && i.push(c.val);
            }
            return i;
          },
          getStateAfter: function (e, t) {
            var n = this.doc;
            return $t(this, (e = xe(n, null == e ? n.first + n.size - 1 : e)) + 1, t);
          },
          cursorCoords: function (e, t) {
            var n = this.doc.sel.primary();
            return Vn(
              this,
              null == e ? n.head : 'object' == typeof e ? Ce(this.doc, e) : e ? n.from() : n.to(),
              t || 'page',
            );
          },
          charCoords: function (e, t) {
            return zn(this, Ce(this.doc, e), t || 'page');
          },
          coordsChar: function (e, t) {
            return Yn(this, (e = Wn(this, e, t || 'page')).left, e.top);
          },
          lineAtHeight: function (e, t) {
            return (
              (e = Wn(this, { top: e, left: 0 }, t || 'page').top),
              he(this.doc, e + this.display.viewOffset)
            );
          },
          heightAtLine: function (e, t, n) {
            var i,
              r = !1;
            if ('number' == typeof e) {
              var o = this.doc.first + this.doc.size - 1;
              e < this.doc.first ? (e = this.doc.first) : e > o && ((e = o), (r = !0)),
                (i = se(this.doc, e));
            } else i = e;
            return (
              qn(this, i, { top: 0, left: 0 }, t || 'page', n || r).top +
              (r ? this.doc.height - ze(i) : 0)
            );
          },
          defaultTextHeight: function () {
            return Zn(this.display);
          },
          defaultCharWidth: function () {
            return ei(this.display);
          },
          getViewport: function () {
            return { from: this.display.viewFrom, to: this.display.viewTo };
          },
          addWidget: function (e, t, n, i, r) {
            var o,
              a,
              s,
              l = this.display,
              c = (e = Vn(this, Ce(this.doc, e))).bottom,
              d = e.left;
            if (
              ((t.style.position = 'absolute'),
              t.setAttribute('cm-ignore-events', 'true'),
              this.display.input.setUneditable(t),
              l.sizer.appendChild(t),
              'over' == i)
            )
              c = e.top;
            else if ('above' == i || 'near' == i) {
              var u = Math.max(l.wrapper.clientHeight, this.doc.height),
                h = Math.max(l.sizer.clientWidth, l.lineSpace.clientWidth);
              ('above' == i || e.bottom + t.offsetHeight > u) && e.top > t.offsetHeight
                ? (c = e.top - t.offsetHeight)
                : e.bottom + t.offsetHeight <= u && (c = e.bottom),
                d + t.offsetWidth > h && (d = h - t.offsetWidth);
            }
            (t.style.top = c + 'px'),
              (t.style.left = t.style.right = ''),
              'right' == r
                ? ((d = l.sizer.clientWidth - t.offsetWidth), (t.style.right = '0px'))
                : ('left' == r
                    ? (d = 0)
                    : 'middle' == r && (d = (l.sizer.clientWidth - t.offsetWidth) / 2),
                  (t.style.left = d + 'px')),
              n &&
                ((o = this),
                (a = { left: d, top: c, right: d + t.offsetWidth, bottom: c + t.offsetHeight }),
                null != (s = xi(o, a)).scrollTop && Ti(o, s.scrollTop),
                null != s.scrollLeft && Ai(o, s.scrollLeft));
          },
          triggerOnKeyDown: Vi(ta),
          triggerOnKeyPress: Vi(ia),
          triggerOnKeyUp: na,
          execCommand: function (e) {
            if (zo.hasOwnProperty(e)) return zo[e].call(null, this);
          },
          triggerElectric: Vi(function (e) {
            Ca(this, e);
          }),
          findPosH: function (e, t, n, i) {
            var r = 1;
            t < 0 && ((r = -1), (t = -t));
            for (
              var o = Ce(this.doc, e), a = 0;
              a < t && !(o = Ea(this.doc, o, r, n, i)).hitSide;
              ++a
            );
            return o;
          },
          moveH: Vi(function (e, t) {
            var n = this;
            this.extendSelectionsBy(function (i) {
              return n.display.shift || n.doc.extend || i.empty()
                ? Ea(n.doc, i.head, e, t, n.options.rtlMoveVisually)
                : e < 0
                  ? i.from()
                  : i.to();
            }, z);
          }),
          deleteH: Vi(function (e, t) {
            var n = this.doc.sel,
              i = this.doc;
            n.somethingSelected()
              ? i.replaceSelection('', null, '+delete')
              : Wo(this, function (n) {
                  var r = Ea(i, n.head, e, t, !1);
                  return e < 0 ? { from: r, to: n.head } : { from: n.head, to: r };
                });
          }),
          findPosV: function (e, t, n, i) {
            var r = 1,
              o = i;
            t < 0 && ((r = -1), (t = -t));
            for (var a = Ce(this.doc, e), s = 0; s < t; ++s) {
              var l = Vn(this, a, 'div');
              if ((null == o ? (o = l.left) : (l.left = o), (a = Ta(this, l, r, n)).hitSide)) break;
            }
            return a;
          },
          moveV: Vi(function (e, t) {
            var n = this,
              i = this.doc,
              r = [],
              o = !this.display.shift && !i.extend && i.sel.somethingSelected();
            if (
              (i.extendSelectionsBy(function (a) {
                if (o) return e < 0 ? a.from() : a.to();
                var s = Vn(n, a.head, 'div');
                null != a.goalColumn && (s.left = a.goalColumn), r.push(s.left);
                var l = Ta(n, s, e, t);
                return 'page' == t && a == i.sel.primary() && Ci(n, zn(n, l, 'div').top - s.top), l;
              }, z),
              r.length)
            )
              for (var a = 0; a < i.sel.ranges.length; a++) i.sel.ranges[a].goalColumn = r[a];
          }),
          findWordAt: function (e) {
            var t = se(this.doc, e.line).text,
              n = e.ch,
              i = e.ch;
            if (t) {
              var r = this.getHelper(e, 'wordChars');
              ('before' != e.sticky && i != t.length) || !n ? ++i : --n;
              for (
                var o = t.charAt(n),
                  a = te(o, r)
                    ? function (e) {
                        return te(e, r);
                      }
                    : /\s/.test(o)
                      ? function (e) {
                          return /\s/.test(e);
                        }
                      : function (e) {
                          return !/\s/.test(e) && !te(e);
                        };
                n > 0 && a(t.charAt(n - 1));
              )
                --n;
              for (; i < t.length && a(t.charAt(i)); ) ++i;
            }
            return new mr(me(e.line, n), me(e.line, i));
          },
          toggleOverwrite: function (e) {
            (null != e && e == this.state.overwrite) ||
              ((this.state.overwrite = !this.state.overwrite)
                ? D(this.display.cursorDiv, 'CodeMirror-overwrite')
                : E(this.display.cursorDiv, 'CodeMirror-overwrite'),
              at(this, 'overwriteToggle', this, this.state.overwrite));
          },
          hasFocus: function () {
            return this.display.input.getField() == N();
          },
          isReadOnly: function () {
            return !(!this.options.readOnly && !this.doc.cantEdit);
          },
          scrollTo: Vi(function (e, t) {
            Si(this, e, t);
          }),
          getScrollInfo: function () {
            var e = this.display.scroller;
            return {
              left: e.scrollLeft,
              top: e.scrollTop,
              height: e.scrollHeight - En(this) - this.display.barHeight,
              width: e.scrollWidth - En(this) - this.display.barWidth,
              clientHeight: _n(this),
              clientWidth: Tn(this),
            };
          },
          scrollIntoView: Vi(function (e, t) {
            null == e
              ? ((e = { from: this.doc.sel.primary().head, to: null }),
                null == t && (t = this.options.cursorScrollMargin))
              : 'number' == typeof e
                ? (e = { from: me(e, 0), to: null })
                : null == e.from && (e = { from: e, to: null }),
              e.to || (e.to = e.from),
              (e.margin = t || 0),
              null != e.from.line
                ? (function (e, t) {
                    ki(e), (e.curOp.scrollToPos = t);
                  })(this, e)
                : Ei(this, e.from, e.to, e.margin);
          }),
          setSize: Vi(function (e, t) {
            var n = this,
              i = function (e) {
                return 'number' == typeof e || /^\d+$/.test(String(e)) ? e + 'px' : e;
              };
            null != e && (this.display.wrapper.style.width = i(e)),
              null != t && (this.display.wrapper.style.height = i(t)),
              this.options.lineWrapping && $n(this);
            var r = this.display.viewFrom;
            this.doc.iter(r, this.display.viewTo, function (e) {
              if (e.widgets)
                for (var t = 0; t < e.widgets.length; t++)
                  if (e.widgets[t].noHScroll) {
                    Yi(n, r, 'widget');
                    break;
                  }
              ++r;
            }),
              (this.curOp.forceUpdate = !0),
              at(this, 'refresh', this);
          }),
          operation: function (e) {
            return Wi(this, e);
          },
          refresh: Vi(function () {
            var e = this.display.cachedTextHeight;
            Ki(this),
              (this.curOp.forceUpdate = !0),
              Hn(this),
              Si(this, this.doc.scrollLeft, this.doc.scrollTop),
              or(this),
              (null == e || Math.abs(e - Zn(this.display)) > 0.5) && ri(this),
              at(this, 'refresh', this);
          }),
          swapDoc: Vi(function (e) {
            var t = this.doc;
            return (
              (t.cm = null),
              Tr(this, e),
              Hn(this),
              this.display.input.reset(),
              Si(this, e.scrollLeft, e.scrollTop),
              (this.curOp.forceScroll = !0),
              ln(this, 'swapDoc', this, t),
              t
            );
          }),
          getInputField: function () {
            return this.display.input.getField();
          },
          getWrapperElement: function () {
            return this.display.wrapper;
          },
          getScrollerElement: function () {
            return this.display.scroller;
          },
          getGutterElement: function () {
            return this.display.gutters;
          },
        }),
          dt(e),
          (e.registerHelper = function (t, i, r) {
            n.hasOwnProperty(t) || (n[t] = e[t] = { _global: [] }), (n[t][i] = r);
          }),
          (e.registerGlobalHelper = function (t, i, r, o) {
            e.registerHelper(t, i, o), n[t]._global.push({ pred: r, val: o });
          });
      })(ma);
    var Ra,
      Ba = 'iter insert remove copy getEditor constructor'.split(' ');
    for (var Pa in ko.prototype)
      ko.prototype.hasOwnProperty(Pa) &&
        H(Ba, Pa) < 0 &&
        (ma.prototype[Pa] = (function (e) {
          return function () {
            return e.apply(this.doc, arguments);
          };
        })(ko.prototype[Pa]));
    return (
      dt(ko),
      (ma.inputStyles = { textarea: Da, contenteditable: _a }),
      (ma.defineMode = function (e) {
        ma.defaults.mode || 'null' == e || (ma.defaults.mode = e),
          function (e, t) {
            arguments.length > 2 && (t.dependencies = Array.prototype.slice.call(arguments, 2)),
              (Tt[e] = t);
          }.apply(this, arguments);
      }),
      (ma.defineMIME = function (e, t) {
        _t[e] = t;
      }),
      ma.defineMode('null', function () {
        return {
          token: function (e) {
            return e.skipToEnd();
          },
        };
      }),
      ma.defineMIME('text/plain', 'null'),
      (ma.defineExtension = function (e, t) {
        ma.prototype[e] = t;
      }),
      (ma.defineDocExtension = function (e, t) {
        ko.prototype[e] = t;
      }),
      (ma.fromTextArea = function (e, t, n, i) {
        if (
          (((t = t ? I(t) : {}).value = e.value),
          !t.tabindex && e.tabIndex && (t.tabindex = e.tabIndex),
          !t.placeholder && e.placeholder && (t.placeholder = e.placeholder),
          null == t.autofocus)
        ) {
          var r = N();
          t.autofocus = r == e || (null != e.getAttribute('autofocus') && r == document.body);
        }
        function o() {
          e.value = c.getValue();
        }
        var a;
        if (e.form && (it(e.form, 'submit', o), !t.leaveSubmitMethodAlone)) {
          var s = e.form;
          a = s.submit;
          try {
            var l = (s.submit = function () {
              o(), (s.submit = a), s.submit(), (s.submit = l);
            });
          } catch (e) {}
        }
        (t.finishInit = function (t) {
          (t.save = o),
            (t.getTextArea = function () {
              return e;
            }),
            (t.toTextArea = function () {
              (t.toTextArea = isNaN),
                o(),
                e.parentNode.removeChild(t.getWrapperElement()),
                (e.style.display = ''),
                e.form &&
                  (ot(e.form, 'submit', o),
                  'function' == typeof e.form.submit && (e.form.submit = a));
            });
        }),
          (e.style.display = 'none');
        var c = ma(
          function (t) {
            return e.parentNode.insertBefore(t, e.nextSibling);
          },
          t,
          n,
          i,
        );
        return c;
      }),
      ((Ra = ma).off = ot),
      (Ra.on = it),
      (Ra.wheelEventPixels = hr),
      (Ra.Doc = ko),
      (Ra.splitLines = Ft),
      (Ra.countColumn = O),
      (Ra.findColumn = V),
      (Ra.isWordChar = ee),
      (Ra.Pass = j),
      (Ra.signal = at),
      (Ra.Line = Vt),
      (Ra.changeEnd = yr),
      (Ra.scrollbarModel = Bi),
      (Ra.Pos = me),
      (Ra.cmpPos = ge),
      (Ra.modes = Tt),
      (Ra.mimeModes = _t),
      (Ra.resolveMode = At),
      (Ra.getMode = Mt),
      (Ra.modeExtensions = Lt),
      (Ra.extendMode = Nt),
      (Ra.copyState = Dt),
      (Ra.startState = Bt),
      (Ra.innerMode = Rt),
      (Ra.commands = zo),
      (Ra.keyMap = Io),
      (Ra.keyName = jo),
      (Ra.isModifierKey = Uo),
      (Ra.lookupKey = Ho),
      (Ra.normalizeKeyMap = $o),
      (Ra.StringStream = Pt),
      (Ra.SharedTextMarker = xo),
      (Ra.TextMarker = bo),
      (Ra.LineWidget = go),
      (Ra.e_preventDefault = ut),
      (Ra.e_stopPropagation = ht),
      (Ra.e_stop = ft),
      (Ra.addClass = D),
      (Ra.contains = L),
      (Ra.rmClass = E),
      (Ra.keyNames = Do),
      (ma.version = '5.26.0'),
      ma
    );
  })();
});
