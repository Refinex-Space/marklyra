// codemirror/active-line.
export default function initializeCodemirrorActiveLine(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var CodeMirror = requireModule('libraries/codemirror'),
    activeLineClass = 'CodeMirror-activeline',
    activeBackgroundClass = 'CodeMirror-activeline-background',
    activeGutterClass = 'CodeMirror-activeline-gutter';
  function clearActiveLines(editor) {
    for (var lineIndex = 0; lineIndex < editor.state.activeLines.length; lineIndex++) {
      editor.removeLineClass(editor.state.activeLines[lineIndex], 'wrap', activeLineClass);
      editor.removeLineClass(
        editor.state.activeLines[lineIndex],
        'background',
        activeBackgroundClass,
      );
      editor.removeLineClass(editor.state.activeLines[lineIndex], 'gutter', activeGutterClass);
    }
  }
  function updateActiveLines(editor, selections) {
    for (
      var activeLines = [], selectionIndex = 0;
      selectionIndex < selections.length;
      selectionIndex++
    ) {
      var selection = selections[selectionIndex],
        styleOptions = editor.getOption('styleActiveLine');
      if (
        'object' == typeof styleOptions && styleOptions.nonEmpty
          ? selection.anchor.line == selection.head.line
          : selection.empty()
      ) {
        var lineHandle = editor.getLineHandleVisualStart(selection.head.line);
        if (activeLines[activeLines.length - 1] != lineHandle) {
          activeLines.push(lineHandle);
        }
      }
    }
    if (
      !(function (previousLines, nextLines) {
        if (previousLines.length != nextLines.length) {
          return false;
        }
        for (var lineIndex = 0; lineIndex < previousLines.length; lineIndex++) {
          if (previousLines[lineIndex] != nextLines[lineIndex]) {
            return false;
          }
        }
        return true;
      })(editor.state.activeLines, activeLines)
    ) {
      editor.operation(function () {
        clearActiveLines(editor);
        for (var lineIndex = 0; lineIndex < activeLines.length; lineIndex++) {
          editor.addLineClass(activeLines[lineIndex], 'wrap', activeLineClass);
          editor.addLineClass(activeLines[lineIndex], 'background', activeBackgroundClass);
          editor.addLineClass(activeLines[lineIndex], 'gutter', activeGutterClass);
        }
        editor.state.activeLines = activeLines;
      });
    }
  }
  function handleSelectionChange(editor, selectionChange) {
    updateActiveLines(editor, selectionChange.ranges);
  }
  CodeMirror.defineOption('styleActiveLine', false, function (editor, enabled, previousValue) {
    var wasEnabled = previousValue != CodeMirror.Init && previousValue;
    if (enabled != wasEnabled) {
      if (wasEnabled) {
        editor.off('beforeSelectionChange', handleSelectionChange);
        clearActiveLines(editor);
        delete editor.state.activeLines;
      }
      if (enabled) {
        editor.state.activeLines = [];
        updateActiveLines(editor, editor.listSelections());
        editor.on('beforeSelectionChange', handleSelectionChange);
      }
    }
  });
}
