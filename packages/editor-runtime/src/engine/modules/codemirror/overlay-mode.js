// codemirror/overlay-mode.
// SystemJS module 23. Dependencies: 20.
$__System.registerDynamic('23', ['20'], !0, function (e, t, n) {
  'use strict';
  this || self;
  var i = e('20');
  i.overlayMode = function (e, t, n) {
    return {
      startState: function () {
        return {
          base: i.startState(e),
          overlay: i.startState(t),
          basePos: 0,
          baseCur: null,
          overlayPos: 0,
          overlayCur: null,
          streamSeen: null,
        };
      },
      copyState: function (n) {
        return {
          base: i.copyState(e, n.base),
          overlay: i.copyState(t, n.overlay),
          basePos: n.basePos,
          baseCur: null,
          overlayPos: n.overlayPos,
          overlayCur: null,
        };
      },
      token: function (i, r) {
        return (
          (i != r.streamSeen || Math.min(r.basePos, r.overlayPos) < i.start) &&
            ((r.streamSeen = i), (r.basePos = r.overlayPos = i.start)),
          i.start == r.basePos &&
            ((r.base.lineBefore = r.lineBefore),
            (r.base.lineAfter = r.lineAfter),
            (r.baseCur = e.token(i, r.base)),
            (r.basePos = i.pos)),
          i.start == r.overlayPos &&
            ((i.pos = i.start), (r.overlayCur = t.token(i, r.overlay)), (r.overlayPos = i.pos)),
          (i.pos = Math.min(r.basePos, r.overlayPos)),
          null == r.overlayCur
            ? r.baseCur
            : (null != r.baseCur && r.overlay.combineTokens) ||
                (n && null == r.overlay.combineTokens)
              ? r.baseCur + ' ' + r.overlayCur
              : r.overlayCur
        );
      },
      indent:
        e.indent &&
        function (t, n) {
          return e.indent(t.base, n);
        },
      electricChars: e.electricChars,
      innerMode: function (t) {
        return { state: t.base, mode: e };
      },
      blankLine: function (i) {
        var r, o;
        return (
          e.blankLine && (r = e.blankLine(i.base)),
          t.blankLine && (o = t.blankLine(i.overlay)),
          null == o ? r : n && null != r ? r + ' ' + o : o
        );
      },
    };
  };
});
