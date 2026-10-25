// codemirror/active-line.
// SystemJS module 47. Dependencies: 20.
$__System.registerDynamic('47', ['20'], !0, function (e, t, n) {
  this || self;
  var i = e('20'),
    r = 'CodeMirror-activeline',
    o = 'CodeMirror-activeline-background',
    a = 'CodeMirror-activeline-gutter';
  function s(e) {
    for (var t = 0; t < e.state.activeLines.length; t++)
      e.removeLineClass(e.state.activeLines[t], 'wrap', r),
        e.removeLineClass(e.state.activeLines[t], 'background', o),
        e.removeLineClass(e.state.activeLines[t], 'gutter', a);
  }
  function l(e, t) {
    for (var n = [], i = 0; i < t.length; i++) {
      var l = t[i],
        c = e.getOption('styleActiveLine');
      if ('object' == typeof c && c.nonEmpty ? l.anchor.line == l.head.line : l.empty()) {
        var d = e.getLineHandleVisualStart(l.head.line);
        n[n.length - 1] != d && n.push(d);
      }
    }
    (function (e, t) {
      if (e.length != t.length) return !1;
      for (var n = 0; n < e.length; n++) if (e[n] != t[n]) return !1;
      return !0;
    })(e.state.activeLines, n) ||
      e.operation(function () {
        s(e);
        for (var t = 0; t < n.length; t++)
          e.addLineClass(n[t], 'wrap', r),
            e.addLineClass(n[t], 'background', o),
            e.addLineClass(n[t], 'gutter', a);
        e.state.activeLines = n;
      });
  }
  function c(e, t) {
    l(e, t.ranges);
  }
  i.defineOption('styleActiveLine', !1, function (e, t, n) {
    var r = n != i.Init && n;
    t != r &&
      (r && (e.off('beforeSelectionChange', c), s(e), delete e.state.activeLines),
      t &&
        ((e.state.activeLines = []), l(e, e.listSelections()), e.on('beforeSelectionChange', c)));
  });
});
