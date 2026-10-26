// codemirror/close-brackets.
export default function initializeCodemirrorCloseBrackets(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  if (!this) {
    self;
  }
  !(function (CodeMirror) {
    var defaultOptions = {
        pairs: '()[]{}\'\'""',
        closeBefore: ')]}\'":;>',
        triples: '',
        explode: '[]{}',
      },
      position = CodeMirror.Pos;
    function getOptionValue(options, name) {
      if ('pairs' == name && 'string' == typeof options) {
        return options;
      } else {
        if ('object' == typeof options && null != options[name]) {
          return options[name];
        } else {
          return defaultOptions[name];
        }
      }
    }
    CodeMirror.defineOption('autoCloseBrackets', false, function (editor, options, previousValue) {
      if (previousValue && previousValue != CodeMirror.Init) {
        editor.removeKeyMap(keyMap);
        editor.state.closeBrackets = null;
      }
      if (options) {
        registerPairKeys(getOptionValue(options, 'pairs'));
        editor.state.closeBrackets = options;
        editor.addKeyMap(keyMap);
      }
    });
    var keyMap = {
      Backspace: function (editor) {
        var options = getBracketOptions(editor);
        if (!options || editor.getOption('disableInput')) {
          return CodeMirror.Pass;
        }
        for (
          var pairs = getOptionValue(options, 'pairs'),
            selections = editor.listSelections(),
            selectionIndex = 0;
          selectionIndex < selections.length;
          selectionIndex++
        ) {
          if (!selections[selectionIndex].empty()) {
            return CodeMirror.Pass;
          }
          var adjacentCharacters = getAdjacentCharacters(editor, selections[selectionIndex].head);
          if (!adjacentCharacters || pairs.indexOf(adjacentCharacters) % 2 != 0) {
            return CodeMirror.Pass;
          }
        }
        for (var selectionIndex = selections.length - 1; selectionIndex >= 0; selectionIndex--) {
          var cursor = selections[selectionIndex].head;
          editor.replaceRange(
            '',
            position(cursor.line, cursor.ch - 1),
            position(cursor.line, cursor.ch + 1),
            '+delete',
          );
        }
      },
      Enter: function (editor) {
        var options = getBracketOptions(editor),
          explodePairs = options && getOptionValue(options, 'explode');
        if (!explodePairs || editor.getOption('disableInput')) {
          return CodeMirror.Pass;
        }
        for (
          var selections = editor.listSelections(), selectionIndex = 0;
          selectionIndex < selections.length;
          selectionIndex++
        ) {
          if (!selections[selectionIndex].empty()) {
            return CodeMirror.Pass;
          }
          var adjacentCharacters = getAdjacentCharacters(editor, selections[selectionIndex].head);
          if (!adjacentCharacters || explodePairs.indexOf(adjacentCharacters) % 2 != 0) {
            return CodeMirror.Pass;
          }
        }
        editor.operation(function () {
          var lineSeparator = editor.lineSeparator() || '\n';
          editor.replaceSelection(lineSeparator + lineSeparator, null);
          editor.execCommand('goCharLeft');
          selections = editor.listSelections();
          for (var selectionIndex = 0; selectionIndex < selections.length; selectionIndex++) {
            var lineNumber = selections[selectionIndex].head.line;
            editor.indentLine(lineNumber, null, true);
            editor.indentLine(lineNumber + 1, null, true);
          }
        });
      },
    };
    function registerPairKeys(pairs) {
      for (var pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
        var character = pairs.charAt(pairIndex),
          keyName = "'" + character + "'";
        if (!keyMap[keyName]) {
          keyMap[keyName] = createCharacterHandler(character);
        }
      }
    }
    function createCharacterHandler(character) {
      return function (editor) {
        return (function (editor, character) {
          var options = getBracketOptions(editor);
          if (!options || editor.getOption('disableInput')) {
            return CodeMirror.Pass;
          }
          var pairs = getOptionValue(options, 'pairs'),
            pairIndex = pairs.indexOf(character);
          if (-1 == pairIndex) {
            return CodeMirror.Pass;
          }
          for (
            var operation,
              closeBefore = getOptionValue(options, 'closeBefore'),
              tripleCharacters = getOptionValue(options, 'triples'),
              symmetricPair = pairs.charAt(pairIndex + 1) == character,
              selections = editor.listSelections(),
              openingCharacter = pairIndex % 2 == 0,
              selectionIndex = 0;
            selectionIndex < selections.length;
            selectionIndex++
          ) {
            var selectionOperation,
              selection = selections[selectionIndex],
              cursor = selection.head,
              nextCharacter = editor.getRange(cursor, position(cursor.line, cursor.ch + 1));
            if (openingCharacter && !selection.empty()) {
              selectionOperation = 'surround';
            } else {
              if ((!symmetricPair && openingCharacter) || nextCharacter != character) {
                if (
                  symmetricPair &&
                  cursor.ch > 1 &&
                  tripleCharacters.indexOf(character) >= 0 &&
                  editor.getRange(position(cursor.line, cursor.ch - 2), cursor) ==
                    character + character
                ) {
                  if (
                    cursor.ch > 2 &&
                    /\bstring/.test(editor.getTokenTypeAt(position(cursor.line, cursor.ch - 2)))
                  ) {
                    return CodeMirror.Pass;
                  }
                  selectionOperation = 'addFour';
                } else {
                  if (symmetricPair) {
                    var previousCharacter =
                      0 == cursor.ch
                        ? ' '
                        : editor.getRange(position(cursor.line, cursor.ch - 1), cursor);
                    if (
                      CodeMirror.isWordChar(nextCharacter) ||
                      previousCharacter == character ||
                      CodeMirror.isWordChar(previousCharacter)
                    ) {
                      return CodeMirror.Pass;
                    }
                    selectionOperation = 'both';
                  } else {
                    if (
                      !openingCharacter ||
                      !(
                        0 === nextCharacter.length ||
                        /\s/.test(nextCharacter) ||
                        closeBefore.indexOf(nextCharacter) > -1
                      )
                    ) {
                      return CodeMirror.Pass;
                    }
                    selectionOperation = 'both';
                  }
                }
              } else {
                selectionOperation =
                  symmetricPair && startsStringToken(editor, cursor)
                    ? 'both'
                    : tripleCharacters.indexOf(character) >= 0 &&
                        editor.getRange(cursor, position(cursor.line, cursor.ch + 3)) ==
                          character + character + character
                      ? 'skipThree'
                      : 'skip';
              }
            }
            if (operation) {
              if (operation != selectionOperation) {
                return CodeMirror.Pass;
              }
            } else {
              operation = selectionOperation;
            }
          }
          var openingBracket = pairIndex % 2 ? pairs.charAt(pairIndex - 1) : character,
            closingBracket = pairIndex % 2 ? character : pairs.charAt(pairIndex + 1);
          editor.operation(function () {
            if ('skip' == operation) {
              editor.execCommand('goCharRight');
            } else {
              if ('skipThree' == operation) {
                for (var selectionIndex = 0; selectionIndex < 3; selectionIndex++) {
                  editor.execCommand('goCharRight');
                }
              } else {
                if ('surround' == operation) {
                  for (
                    var selectedTexts = editor.getSelections(), selectionIndex = 0;
                    selectionIndex < selectedTexts.length;
                    selectionIndex++
                  ) {
                    selectedTexts[selectionIndex] =
                      openingBracket + selectedTexts[selectionIndex] + closingBracket;
                  }
                  editor.replaceSelections(selectedTexts, 'around');
                  selectedTexts = editor.listSelections().slice();
                  for (
                    var selectionIndex = 0;
                    selectionIndex < selectedTexts.length;
                    selectionIndex++
                  ) {
                    selectedTexts[selectionIndex] =
                      ((selection = selectedTexts[selectionIndex]),
                      void 0,
                      (backwardSelection = CodeMirror.cmpPos(selection.anchor, selection.head) > 0),
                      {
                        anchor: new position(
                          selection.anchor.line,
                          selection.anchor.ch + (backwardSelection ? -1 : 1),
                        ),
                        head: new position(
                          selection.head.line,
                          selection.head.ch + (backwardSelection ? 1 : -1),
                        ),
                      });
                  }
                  editor.setSelections(selectedTexts);
                } else {
                  if ('both' == operation) {
                    editor.replaceSelection(openingBracket + closingBracket, null);
                    editor.triggerElectric(openingBracket + closingBracket);
                    editor.execCommand('goCharLeft');
                  } else {
                    if ('addFour' == operation) {
                      editor.replaceSelection(
                        openingBracket + openingBracket + openingBracket + openingBracket,
                        'before',
                      );
                      editor.execCommand('goCharRight');
                    }
                  }
                }
              }
            }
            var selection, backwardSelection;
          });
        })(editor, character);
      };
    }
    function getBracketOptions(editor) {
      var options = editor.state.closeBrackets;
      if (!options || options.override) {
        return options;
      } else {
        return editor.getModeAt(editor.getCursor()).closeBrackets || options;
      }
    }
    function getAdjacentCharacters(editor, cursor) {
      var characters = editor.getRange(
        position(cursor.line, cursor.ch - 1),
        position(cursor.line, cursor.ch + 1),
      );
      if (2 == characters.length) {
        return characters;
      } else {
        return null;
      }
    }
    function startsStringToken(editor, cursor) {
      var token = editor.getTokenAt(position(cursor.line, cursor.ch + 1));
      return (
        /\bstring/.test(token.type) &&
        token.start == cursor.ch &&
        (0 == cursor.ch || !/\bstring/.test(editor.getTokenTypeAt(cursor)))
      );
    }
    registerPairKeys(defaultOptions.pairs + '`');
  })(requireModule('libraries/codemirror'));
}
