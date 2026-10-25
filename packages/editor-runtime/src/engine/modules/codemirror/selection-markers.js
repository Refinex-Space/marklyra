// codemirror/selection-markers.
// SystemJS module 1f. Dependencies: 20.
$__System.registerDynamic('1f', ['20'], !0, function (e, t, n) {
  'use strict';
  this || self;
  !(function (e) {
    function t(e) {
      e.state.markedSelection &&
        e.operation(function () {
          !(function (e) {
            try {
              if (!e.somethingSelected()) return s(e);
              if (e.listSelections().length > 1) return l(e);
              var t = e.getCursor('start'),
                n = e.getCursor('end'),
                r = e.state.markedSelection;
              if (!r.length) return a(e, t, n);
              var c = r[0].find(),
                d = r[r.length - 1].find();
              if (!c || !d || n.line - t.line < i || o(t, d.to) >= 0 || o(n, c.from) <= 0)
                return l(e);
              for (; o(t, c.from) > 0; ) r.shift().clear(), (c = r[0].find());
              for (
                o(t, c.from) < 0 &&
                (c.to.line - t.line < i
                  ? (r.shift().clear(), a(e, t, c.to, 0))
                  : a(e, t, c.from, 0));
                o(n, d.to) < 0;
              )
                r.pop().clear(), (d = r[r.length - 1].find());
              o(n, d.to) > 0 &&
                (n.line - d.from.line < i ? (r.pop().clear(), a(e, d.from, n)) : a(e, d.to, n));
            } catch (e) {}
          })(e);
        });
    }
    function n(e) {
      e.state.markedSelection &&
        e.state.markedSelection.length &&
        e.operation(function () {
          s(e);
        });
    }
    e.defineOption('styleSelectedText', !1, function (i, r, o) {
      var a = o && o != e.Init;
      r && !a
        ? ((i.state.markedSelection = []),
          (i.state.markedSelectionStyle = 'string' == typeof r ? r : 'CodeMirror-selectedtext'),
          l(i),
          i.on('cursorActivity', t),
          i.on('change', n))
        : !r &&
          a &&
          (i.off('cursorActivity', t),
          i.off('change', n),
          s(i),
          (i.state.markedSelection = i.state.markedSelectionStyle = null));
    });
    var i = 8,
      r = e.Pos,
      o = e.cmpPos;
    function a(e, t, n, a) {
      if (0 != o(t, n))
        for (var s = e.state.markedSelection, l = e.state.markedSelectionStyle, c = t.line; ; ) {
          var d = c == t.line ? t : r(c, 0),
            u = c + i,
            h = u >= n.line,
            p = h ? n : r(u, 0),
            f = e.markText(d, p, { className: l });
          if ((null == a ? s.push(f) : s.splice(a++, 0, f), h)) break;
          c = u;
        }
    }
    function s(e) {
      for (var t = e.state.markedSelection, n = 0; n < t.length; ++n) t[n].clear();
      t.length = 0;
    }
    function l(e) {
      s(e);
      for (var t = e.listSelections(), n = 0; n < t.length; n++) a(e, t[n].from(), t[n].to());
    }
  })(e('20'));
});
