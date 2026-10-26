// codemirror/overlay-mode.
export default function initializeCodemirrorOverlayMode(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  'use strict';
  if (!this) {
    self;
  }
  var CodeMirror = requireModule('libraries/codemirror');
  CodeMirror.overlayMode = function (baseMode, overlayMode, combineStyles) {
    return {
      startState: function () {
        return {
          base: CodeMirror.startState(baseMode),
          overlay: CodeMirror.startState(overlayMode),
          basePos: 0,
          baseCur: null,
          overlayPos: 0,
          overlayCur: null,
          streamSeen: null,
        };
      },
      copyState: function (state) {
        return {
          base: CodeMirror.copyState(baseMode, state.base),
          overlay: CodeMirror.copyState(overlayMode, state.overlay),
          basePos: state.basePos,
          baseCur: null,
          overlayPos: state.overlayPos,
          overlayCur: null,
        };
      },
      token: function (stream, state) {
        if (
          stream != state.streamSeen ||
          Math.min(state.basePos, state.overlayPos) < stream.start
        ) {
          state.streamSeen = stream;
          state.basePos = state.overlayPos = stream.start;
        }
        if (stream.start == state.basePos) {
          state.base.lineBefore = state.lineBefore;
          state.base.lineAfter = state.lineAfter;
          state.baseCur = baseMode.token(stream, state.base);
          state.basePos = stream.pos;
        }
        if (stream.start == state.overlayPos) {
          stream.pos = stream.start;
          state.overlayCur = overlayMode.token(stream, state.overlay);
          state.overlayPos = stream.pos;
        }
        stream.pos = Math.min(state.basePos, state.overlayPos);
        if (null == state.overlayCur) {
          return state.baseCur;
        } else {
          if (
            (null != state.baseCur && state.overlay.combineTokens) ||
            (combineStyles && null == state.overlay.combineTokens)
          ) {
            return state.baseCur + ' ' + state.overlayCur;
          } else {
            return state.overlayCur;
          }
        }
      },
      indent:
        baseMode.indent &&
        function (state, textAfter) {
          return baseMode.indent(state.base, textAfter);
        },
      electricChars: baseMode.electricChars,
      innerMode: function (state) {
        return { state: state.base, mode: baseMode };
      },
      blankLine: function (state) {
        var baseStyle, overlayStyle;
        if (baseMode.blankLine) {
          baseStyle = baseMode.blankLine(state.base);
        }
        if (overlayMode.blankLine) {
          overlayStyle = overlayMode.blankLine(state.overlay);
        }
        if (null == overlayStyle) {
          return baseStyle;
        } else {
          if (combineStyles && null != baseStyle) {
            return baseStyle + ' ' + overlayStyle;
          } else {
            return overlayStyle;
          }
        }
      },
    };
  };
}
