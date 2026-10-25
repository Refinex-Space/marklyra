// codemirror/markdown-overlay.
// SystemJS module 48. Dependencies: 20.
$__System.registerDynamic('48', ['20'], !0, function (e, t, n) {
  'use strict';
  this || self;
  var i = e('20');
  i.defineOption('visibleSpace', !1, function (e, t, n) {
    n == i.Init && (n = !1),
      n && !t
        ? e.removeOverlay('visiblespace')
        : !n &&
          t &&
          e.addOverlay({
            token: function (e, t) {
              if (!t) return null;
              if (t.atBlockStart && e.pos < t.atBlockStart)
                return e.eat(' ')
                  ? 'startspace startspace-' + (e.pos - 1)
                  : e.eat('\t')
                    ? 'starttab startspace-' + (e.pos - 1)
                    : (e.pos++, null);
              var n = /(^[ \t]+)|(\s+$)/.exec(e.string),
                i = e.string.length,
                r = n && n[1] ? n[1].length : -1;
              n && n[2] && n[2].length;
              return r > 0 && r > e.pos
                ? (e.pos++,
                  'startspace-' +
                    (e.pos - 1) +
                    ('\t' == e.string.charAt(e.pos - 1) ? ' starttab' : ' startspace'))
                : ((e.pos = i), null);
            },
            name: 'visiblespace',
          });
  });
});
