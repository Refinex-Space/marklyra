// codemirror/editor-extensions.
// SystemJS module 25. Dependencies: 20, 1f, 21, 22, 23, 24.
$__System.registerDynamic('25', ['20', '1f', '21', '22', '23', '24'], !0, function (e, t, n) {
  this || self;
  var i = e('20'),
    r = (e('1f'), e('21'), e('22'), e('23'), e('24'), i.prototype.focus);
  (i.prototype.focus = function () {
    i.signal(this, 'focus', this), r.apply(this);
  }),
    window.webkit &&
      (delete i.keyMap.emacsy['Alt-F'],
      delete i.keyMap.emacsy['Alt-D'],
      delete i.keyMap.emacsy['Alt-B']);
  var o = i.Pos;
  (i.commands.moveLineUp = function (e) {
    if (e.isReadOnly()) return i.Pass;
    for (
      var t = e.listSelections(), n = [], r = e.firstLine() - 1, a = [], s = 0;
      s < t.length;
      s++
    ) {
      var l = t[s],
        c = l.from().line - 1,
        d = l.to().line;
      a.push({ anchor: o(l.anchor.line - 1, l.anchor.ch), head: o(l.head.line - 1, l.head.ch) }),
        0 != l.to().ch || l.empty() || --d,
        c > r ? n.push(c, d) : n.length && (n[n.length - 1] = d),
        (r = d);
    }
    e.operation(function () {
      for (var t = 0; t < n.length; t += 2) {
        var i = n[t],
          r = n[t + 1],
          s = e.getLine(i);
        e.replaceRange('', o(i, 0), o(i + 1, 0), '+swapLine'),
          r > e.lastLine()
            ? e.replaceRange('\n' + s, o(e.lastLine()), null, '+swapLine')
            : e.replaceRange(s + '\n', o(r, 0), null, '+swapLine');
      }
      e.setSelections(a), e.scrollIntoView();
    });
  }),
    (i.commands.moveLineDown = function (e) {
      if (e.isReadOnly()) return i.Pass;
      for (
        var t = e.listSelections(), n = [], r = e.lastLine() + 1, a = t.length - 1;
        a >= 0;
        a--
      ) {
        var s = t[a],
          l = s.to().line + 1,
          c = s.from().line;
        0 != s.to().ch || s.empty() || l--,
          l < r ? n.push(l, c) : n.length && (n[n.length - 1] = c),
          (r = c);
      }
      e.operation(function () {
        for (var t = n.length - 2; t >= 0; t -= 2) {
          var i = n[t],
            r = n[t + 1],
            a = e.getLine(i);
          i == e.lastLine()
            ? e.replaceRange('', o(i - 1), o(i), '+swapLine')
            : e.replaceRange('', o(i, 0), o(i + 1, 0), '+swapLine'),
            e.replaceRange(a + '\n', o(r, 0), null, '+swapLine');
        }
        e.scrollIntoView();
      });
    });
});
