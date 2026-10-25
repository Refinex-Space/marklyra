// codemirror/close-brackets.
// SystemJS module 21. Dependencies: 20.
$__System.registerDynamic('21', ['20'], !0, function (e, t, n) {
  this || self;
  !(function (e) {
    var t = { pairs: '()[]{}\'\'""', closeBefore: ')]}\'":;>', triples: '', explode: '[]{}' },
      n = e.Pos;
    function i(e, n) {
      return 'pairs' == n && 'string' == typeof e
        ? e
        : 'object' == typeof e && null != e[n]
          ? e[n]
          : t[n];
    }
    e.defineOption('autoCloseBrackets', !1, function (t, n, a) {
      a && a != e.Init && (t.removeKeyMap(r), (t.state.closeBrackets = null)),
        n && (o(i(n, 'pairs')), (t.state.closeBrackets = n), t.addKeyMap(r));
    });
    var r = {
      Backspace: function (t) {
        var r = s(t);
        if (!r || t.getOption('disableInput')) return e.Pass;
        for (var o = i(r, 'pairs'), a = t.listSelections(), c = 0; c < a.length; c++) {
          if (!a[c].empty()) return e.Pass;
          var d = l(t, a[c].head);
          if (!d || o.indexOf(d) % 2 != 0) return e.Pass;
        }
        for (var c = a.length - 1; c >= 0; c--) {
          var u = a[c].head;
          t.replaceRange('', n(u.line, u.ch - 1), n(u.line, u.ch + 1), '+delete');
        }
      },
      Enter: function (t) {
        var n = s(t),
          r = n && i(n, 'explode');
        if (!r || t.getOption('disableInput')) return e.Pass;
        for (var o = t.listSelections(), a = 0; a < o.length; a++) {
          if (!o[a].empty()) return e.Pass;
          var c = l(t, o[a].head);
          if (!c || r.indexOf(c) % 2 != 0) return e.Pass;
        }
        t.operation(function () {
          var e = t.lineSeparator() || '\n';
          t.replaceSelection(e + e, null), t.execCommand('goCharLeft'), (o = t.listSelections());
          for (var n = 0; n < o.length; n++) {
            var i = o[n].head.line;
            t.indentLine(i, null, !0), t.indentLine(i + 1, null, !0);
          }
        });
      },
    };
    function o(e) {
      for (var t = 0; t < e.length; t++) {
        var n = e.charAt(t),
          i = "'" + n + "'";
        r[i] || (r[i] = a(n));
      }
    }
    function a(t) {
      return function (r) {
        return (function (t, r) {
          var o = s(t);
          if (!o || t.getOption('disableInput')) return e.Pass;
          var a = i(o, 'pairs'),
            l = a.indexOf(r);
          if (-1 == l) return e.Pass;
          for (
            var d,
              u = i(o, 'closeBefore'),
              h = i(o, 'triples'),
              p = a.charAt(l + 1) == r,
              f = t.listSelections(),
              m = l % 2 == 0,
              g = 0;
            g < f.length;
            g++
          ) {
            var v,
              y = f[g],
              b = y.head,
              w = t.getRange(b, n(b.line, b.ch + 1));
            if (m && !y.empty()) v = 'surround';
            else if ((!p && m) || w != r)
              if (
                p &&
                b.ch > 1 &&
                h.indexOf(r) >= 0 &&
                t.getRange(n(b.line, b.ch - 2), b) == r + r
              ) {
                if (b.ch > 2 && /\bstring/.test(t.getTokenTypeAt(n(b.line, b.ch - 2))))
                  return e.Pass;
                v = 'addFour';
              } else if (p) {
                var x = 0 == b.ch ? ' ' : t.getRange(n(b.line, b.ch - 1), b);
                if (e.isWordChar(w) || x == r || e.isWordChar(x)) return e.Pass;
                v = 'both';
              } else {
                if (!m || !(0 === w.length || /\s/.test(w) || u.indexOf(w) > -1)) return e.Pass;
                v = 'both';
              }
            else
              v =
                p && c(t, b)
                  ? 'both'
                  : h.indexOf(r) >= 0 && t.getRange(b, n(b.line, b.ch + 3)) == r + r + r
                    ? 'skipThree'
                    : 'skip';
            if (d) {
              if (d != v) return e.Pass;
            } else d = v;
          }
          var C = l % 2 ? a.charAt(l - 1) : r,
            F = l % 2 ? r : a.charAt(l + 1);
          t.operation(function () {
            if ('skip' == d) t.execCommand('goCharRight');
            else if ('skipThree' == d) for (var i = 0; i < 3; i++) t.execCommand('goCharRight');
            else if ('surround' == d) {
              for (var r = t.getSelections(), i = 0; i < r.length; i++) r[i] = C + r[i] + F;
              t.replaceSelections(r, 'around'), (r = t.listSelections().slice());
              for (var i = 0; i < r.length; i++)
                r[i] =
                  ((o = r[i]),
                  void 0,
                  (a = e.cmpPos(o.anchor, o.head) > 0),
                  {
                    anchor: new n(o.anchor.line, o.anchor.ch + (a ? -1 : 1)),
                    head: new n(o.head.line, o.head.ch + (a ? 1 : -1)),
                  });
              t.setSelections(r);
            } else
              'both' == d
                ? (t.replaceSelection(C + F, null),
                  t.triggerElectric(C + F),
                  t.execCommand('goCharLeft'))
                : 'addFour' == d &&
                  (t.replaceSelection(C + C + C + C, 'before'), t.execCommand('goCharRight'));
            var o, a;
          });
        })(r, t);
      };
    }
    function s(e) {
      var t = e.state.closeBrackets;
      return !t || t.override ? t : e.getModeAt(e.getCursor()).closeBrackets || t;
    }
    function l(e, t) {
      var i = e.getRange(n(t.line, t.ch - 1), n(t.line, t.ch + 1));
      return 2 == i.length ? i : null;
    }
    function c(e, t) {
      var i = e.getTokenAt(n(t.line, t.ch + 1));
      return (
        /\bstring/.test(i.type) &&
        i.start == t.ch &&
        (0 == t.ch || !/\bstring/.test(e.getTokenTypeAt(t)))
      );
    }
    o(t.pairs + '`');
  })(e('20'));
});
