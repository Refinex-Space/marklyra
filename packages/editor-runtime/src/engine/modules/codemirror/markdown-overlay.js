// codemirror/markdown-overlay.
export default function initializeCodemirrorMarkdownOverlay(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  'use strict';
  if (!this) {
    self;
  }
  var CodeMirror = requireModule('libraries/codemirror');
  CodeMirror.defineOption('visibleSpace', false, function (editor, enabled, previousValue) {
    if (previousValue == CodeMirror.Init) {
      previousValue = false;
    }
    if (previousValue && !enabled) {
      editor.removeOverlay('visiblespace');
    } else {
      if (!previousValue && enabled) {
        editor.addOverlay({
          token: function (stream, state) {
            if (!state) {
              return null;
            }
            if (state.atBlockStart && stream.pos < state.atBlockStart) {
              if (stream.eat(' ')) {
                return 'startspace startspace-' + (stream.pos - 1);
              } else {
                if (stream.eat('\t')) {
                  return 'starttab startspace-' + (stream.pos - 1);
                } else {
                  stream.pos++;
                  return null;
                }
              }
            }
            var whitespaceMatch = /(^[ \t]+)|(\s+$)/.exec(stream.string),
              lineLength = stream.string.length,
              leadingWhitespaceLength =
                whitespaceMatch && whitespaceMatch[1] ? whitespaceMatch[1].length : -1;
            if (whitespaceMatch && whitespaceMatch[2]) {
              whitespaceMatch[2].length;
            }
            if (leadingWhitespaceLength > 0 && leadingWhitespaceLength > stream.pos) {
              stream.pos++;
              return (
                'startspace-' +
                (stream.pos - 1) +
                ('\t' == stream.string.charAt(stream.pos - 1) ? ' starttab' : ' startspace')
              );
            } else {
              stream.pos = lineLength;
              return null;
            }
          },
          name: 'visiblespace',
        });
      }
    }
  });
}
