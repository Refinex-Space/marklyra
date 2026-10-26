// codemirror/selection-markers.
export default function initializeCodemirrorSelectionMarkers(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  'use strict';
  if (!this) {
    self;
  }
  !(function (CodeMirror) {
    function updateMarkedSelection(editor) {
      if (editor.state.markedSelection) {
        editor.operation(function () {
          !(function (editor) {
            try {
              if (!editor.somethingSelected()) {
                return clearSelectionMarkers(editor);
              }
              if (editor.listSelections().length > 1) {
                return rebuildSelectionMarkers(editor);
              }
              var selectionStart = editor.getCursor('start'),
                selectionEnd = editor.getCursor('end'),
                markers = editor.state.markedSelection;
              if (!markers.length) {
                return markSelectionRange(editor, selectionStart, selectionEnd);
              }
              var firstMarkedRange = markers[0].find(),
                lastMarkedRange = markers[markers.length - 1].find();
              if (
                !firstMarkedRange ||
                !lastMarkedRange ||
                selectionEnd.line - selectionStart.line < markerLineSpan ||
                comparePositions(selectionStart, lastMarkedRange.to) >= 0 ||
                comparePositions(selectionEnd, firstMarkedRange.from) <= 0
              ) {
                return rebuildSelectionMarkers(editor);
              }
              for (; comparePositions(selectionStart, firstMarkedRange.from) > 0; ) {
                markers.shift().clear();
                firstMarkedRange = markers[0].find();
              }
              for (
                comparePositions(selectionStart, firstMarkedRange.from) < 0 &&
                (firstMarkedRange.to.line - selectionStart.line < markerLineSpan
                  ? (markers.shift().clear(),
                    markSelectionRange(editor, selectionStart, firstMarkedRange.to, 0))
                  : markSelectionRange(editor, selectionStart, firstMarkedRange.from, 0));
                comparePositions(selectionEnd, lastMarkedRange.to) < 0;
              ) {
                markers.pop().clear();
                lastMarkedRange = markers[markers.length - 1].find();
              }
              if (comparePositions(selectionEnd, lastMarkedRange.to) > 0) {
                if (selectionEnd.line - lastMarkedRange.from.line < markerLineSpan) {
                  markers.pop().clear();
                  markSelectionRange(editor, lastMarkedRange.from, selectionEnd);
                } else {
                  markSelectionRange(editor, lastMarkedRange.to, selectionEnd);
                }
              }
            } catch (error) {}
          })(editor);
        });
      }
    }
    function clearChangedSelection(editor) {
      if (editor.state.markedSelection && editor.state.markedSelection.length) {
        editor.operation(function () {
          clearSelectionMarkers(editor);
        });
      }
    }
    CodeMirror.defineOption('styleSelectedText', false, function (editor, style, previousValue) {
      var wasEnabled = previousValue && previousValue != CodeMirror.Init;
      if (style && !wasEnabled) {
        editor.state.markedSelection = [];
        editor.state.markedSelectionStyle =
          'string' == typeof style ? style : 'CodeMirror-selectedtext';
        rebuildSelectionMarkers(editor);
        editor.on('cursorActivity', updateMarkedSelection);
        editor.on('change', clearChangedSelection);
      } else {
        if (!style && wasEnabled) {
          editor.off('cursorActivity', updateMarkedSelection);
          editor.off('change', clearChangedSelection);
          clearSelectionMarkers(editor);
          editor.state.markedSelection = editor.state.markedSelectionStyle = null;
        }
      }
    });
    var markerLineSpan = 8,
      position = CodeMirror.Pos,
      comparePositions = CodeMirror.cmpPos;
    function markSelectionRange(editor, from, to, insertAt) {
      if (0 != comparePositions(from, to)) {
        for (
          var markers = editor.state.markedSelection,
            className = editor.state.markedSelectionStyle,
            line = from.line;
          ;
        ) {
          var rangeStart = line == from.line ? from : position(line, 0),
            nextLine = line + markerLineSpan,
            lastRange = nextLine >= to.line,
            rangeEnd = lastRange ? to : position(nextLine, 0),
            marker = editor.markText(rangeStart, rangeEnd, { className: className });
          if (null == insertAt) {
            markers.push(marker);
          } else {
            markers.splice(insertAt++, 0, marker);
          }
          if (lastRange) {
            break;
          }
          line = nextLine;
        }
      }
    }
    function clearSelectionMarkers(editor) {
      for (
        var markers = editor.state.markedSelection, markerIndex = 0;
        markerIndex < markers.length;
        ++markerIndex
      ) {
        markers[markerIndex].clear();
      }
      markers.length = 0;
    }
    function rebuildSelectionMarkers(editor) {
      clearSelectionMarkers(editor);
      for (
        var selections = editor.listSelections(), selectionIndex = 0;
        selectionIndex < selections.length;
        selectionIndex++
      ) {
        markSelectionRange(
          editor,
          selections[selectionIndex].from(),
          selections[selectionIndex].to(),
        );
      }
    }
  })(requireModule('libraries/codemirror'));
}
