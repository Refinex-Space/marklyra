// codemirror/editor-extensions.
export default function initializeCodemirrorEditorExtensions(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  if (!this) {
    self;
  }
  var CodeMirror = requireModule('libraries/codemirror'),
    originalFocus =
      (requireModule('codemirror/selection-markers'),
      requireModule('codemirror/close-brackets'),
      requireModule('codemirror/close-tags'),
      requireModule('codemirror/overlay-mode'),
      requireModule('codemirror/lint'),
      CodeMirror.prototype.focus);
  CodeMirror.prototype.focus = function () {
    CodeMirror.signal(this, 'focus', this);
    originalFocus.apply(this);
  };
  if (window.webkit) {
    delete CodeMirror.keyMap.emacsy['Alt-F'];
    delete CodeMirror.keyMap.emacsy['Alt-D'];
    delete CodeMirror.keyMap.emacsy['Alt-B'];
  }
  var position = CodeMirror.Pos;
  CodeMirror.commands.moveLineUp = function (editor) {
    if (editor.isReadOnly()) {
      return CodeMirror.Pass;
    }
    for (
      var selections = editor.listSelections(),
        linePairs = [],
        lastAffectedLine = editor.firstLine() - 1,
        nextSelections = [],
        selectionIndex = 0;
      selectionIndex < selections.length;
      selectionIndex++
    ) {
      var selection = selections[selectionIndex],
        precedingLine = selection.from().line - 1,
        lastSelectedLine = selection.to().line;
      nextSelections.push({
        anchor: position(selection.anchor.line - 1, selection.anchor.ch),
        head: position(selection.head.line - 1, selection.head.ch),
      });
      if (!(0 != selection.to().ch || selection.empty())) {
        --lastSelectedLine;
      }
      if (precedingLine > lastAffectedLine) {
        linePairs.push(precedingLine, lastSelectedLine);
      } else {
        if (linePairs.length) {
          linePairs[linePairs.length - 1] = lastSelectedLine;
        }
      }
      lastAffectedLine = lastSelectedLine;
    }
    editor.operation(function () {
      for (var pairIndex = 0; pairIndex < linePairs.length; pairIndex += 2) {
        var sourceLine = linePairs[pairIndex],
          targetLine = linePairs[pairIndex + 1],
          lineText = editor.getLine(sourceLine);
        editor.replaceRange('', position(sourceLine, 0), position(sourceLine + 1, 0), '+swapLine');
        if (targetLine > editor.lastLine()) {
          editor.replaceRange('\n' + lineText, position(editor.lastLine()), null, '+swapLine');
        } else {
          editor.replaceRange(lineText + '\n', position(targetLine, 0), null, '+swapLine');
        }
      }
      editor.setSelections(nextSelections);
      editor.scrollIntoView();
    });
  };
  CodeMirror.commands.moveLineDown = function (editor) {
    if (editor.isReadOnly()) {
      return CodeMirror.Pass;
    }
    for (
      var selections = editor.listSelections(),
        linePairs = [],
        lastAffectedLine = editor.lastLine() + 1,
        selectionIndex = selections.length - 1;
      selectionIndex >= 0;
      selectionIndex--
    ) {
      var selection = selections[selectionIndex],
        followingLine = selection.to().line + 1,
        firstSelectedLine = selection.from().line;
      if (!(0 != selection.to().ch || selection.empty())) {
        followingLine--;
      }
      if (followingLine < lastAffectedLine) {
        linePairs.push(followingLine, firstSelectedLine);
      } else {
        if (linePairs.length) {
          linePairs[linePairs.length - 1] = firstSelectedLine;
        }
      }
      lastAffectedLine = firstSelectedLine;
    }
    editor.operation(function () {
      for (var pairIndex = linePairs.length - 2; pairIndex >= 0; pairIndex -= 2) {
        var sourceLine = linePairs[pairIndex],
          targetLine = linePairs[pairIndex + 1],
          lineText = editor.getLine(sourceLine);
        if (sourceLine == editor.lastLine()) {
          editor.replaceRange('', position(sourceLine - 1), position(sourceLine), '+swapLine');
        } else {
          editor.replaceRange(
            '',
            position(sourceLine, 0),
            position(sourceLine + 1, 0),
            '+swapLine',
          );
        }
        editor.replaceRange(lineText + '\n', position(targetLine, 0), null, '+swapLine');
      }
      editor.scrollIntoView();
    });
  };
}
