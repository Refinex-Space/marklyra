// codemirror/close-tags.
// SystemJS module 22. Dependencies: 20.
$__System.registerDynamic('22', ['20'], !0, function (e, t, n) {
  this || self;
  var i = e('20');
  !(function () {
    i.defineOption('autoCloseTags', !1, function (a, s, l) {
      if ((l != i.Init && l && a.removeKeyMap('autoCloseTags'), s)) {
        var c = { name: 'autoCloseTags' };
        ('object' != typeof s || s.whenClosing) &&
          (c["'/'"] = function (e) {
            return (function (e) {
              return e.getOption('disableInput') ? i.Pass : n(e, !0);
            })(e);
          }),
          ('object' != typeof s || s.whenOpening) &&
            (c["'>'"] = function (n) {
              return (function (n) {
                if (n.getOption('disableInput')) return i.Pass;
                for (var a = n.listSelections(), s = [], l = 0; l < a.length; l++) {
                  if (!a[l].empty()) return i.Pass;
                  var c = a[l].head,
                    d = n.getTokenAt(c),
                    u = i.innerMode(n.getMode(), d.state),
                    h = u.state;
                  if ('xml' != u.mode.name || !h.tagName) return i.Pass;
                  var p = n.getOption('autoCloseTags'),
                    f = 'html' == u.mode.configuration,
                    m = ('object' == typeof p && p.dontCloseTags) || (f && e),
                    g = ('object' == typeof p && p.indentTags) || (f && t),
                    v = h.tagName;
                  d.end > c.ch && (v = v.slice(0, v.length - d.end + c.ch));
                  var y = v.toLowerCase();
                  if (
                    !v ||
                    ('string' == d.type &&
                      (d.end != c.ch ||
                        !/[\"\']/.test(d.string.charAt(d.string.length - 1)) ||
                        1 == d.string.length)) ||
                    ('tag' == d.type && 'closeTag' == h.type) ||
                    d.string.indexOf('/') == d.string.length - 1 ||
                    (m && r(m, y) > -1) ||
                    o(n, v, c, h, !0)
                  )
                    return i.Pass;
                  var b = g && r(g, y) > -1;
                  s[l] = {
                    indent: b,
                    text: '>' + (b ? '\n\n' : '') + '</' + v + '>',
                    newPos: b ? i.Pos(c.line + 1, 0) : i.Pos(c.line, c.ch + 1),
                  };
                }
                for (var l = a.length - 1; l >= 0; l--) {
                  var w = s[l];
                  n.replaceRange(w.text, a[l].head, a[l].anchor, '+insert');
                  var x = n.listSelections().slice(0);
                  (x[l] = { head: w.newPos, anchor: w.newPos }),
                    n.setSelections(x),
                    w.indent &&
                      (n.indentLine(w.newPos.line, null, !0),
                      n.indentLine(w.newPos.line + 1, null, !0));
                }
              })(n);
            }),
          a.addKeyMap(c);
      }
    });
    var e = [
        'area',
        'base',
        'br',
        'col',
        'command',
        'embed',
        'hr',
        'img',
        'input',
        'keygen',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr',
      ],
      t = [
        'applet',
        'blockquote',
        'body',
        'button',
        'div',
        'dl',
        'fieldset',
        'form',
        'frameset',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'head',
        'html',
        'iframe',
        'layer',
        'legend',
        'object',
        'ol',
        'p',
        'select',
        'table',
        'ul',
      ];
    function n(e, t) {
      for (var n = e.listSelections(), r = [], a = t ? '/' : '</', s = 0; s < n.length; s++) {
        if (!n[s].empty()) return i.Pass;
        var l,
          c = n[s].head,
          d = e.getTokenAt(c),
          u = i.innerMode(e.getMode(), d.state),
          h = u.state;
        if (t && ('string' == d.type || '<' != d.string.charAt(0) || d.start != c.ch - 1))
          return i.Pass;
        if ('xml' != u.mode.name)
          if ('htmlmixed' == e.getMode().name && 'javascript' == u.mode.name) l = a + 'script';
          else {
            if ('htmlmixed' != e.getMode().name || 'css' != u.mode.name) return i.Pass;
            l = a + 'style';
          }
        else {
          if (!h.context || !h.context.tagName || o(e, h.context.tagName, c, h)) return i.Pass;
          l = a + h.context.tagName;
        }
        '>' != e.getLine(c.line).charAt(d.end) && (l += '>'), (r[s] = l);
      }
      e.replaceSelections(r), (n = e.listSelections());
      for (s = 0; s < n.length; s++)
        (s == n.length - 1 || n[s].head.line < n[s + 1].head.line) && e.indentLine(n[s].head.line);
    }
    function r(e, t) {
      if (e.indexOf) return e.indexOf(t);
      for (var n = 0, i = e.length; n < i; ++n) if (e[n] == t) return n;
      return -1;
    }
    function o(e, t, n, r, o) {
      if (!i.scanForClosingTag) return !1;
      var a = Math.min(e.lastLine() + 1, n.line + 500),
        s = i.scanForClosingTag(e, n, null, a);
      if (!s || s.tag != t) return !1;
      for (var l = r.context, c = o ? 1 : 0; l && l.tagName == t; l = l.prev) ++c;
      n = s.to;
      for (var d = 1; d < c; d++) {
        var u = i.scanForClosingTag(e, n, null, a);
        if (!u || u.tag != t) return !1;
        n = u.to;
      }
      return !0;
    }
    i.commands.closeTag = function (e) {
      return n(e);
    };
  })();
});
