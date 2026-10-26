// editing/character-pairs.
export default function initializeEditingCharacterPairs(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  'use strict';
  if (!this) {
    self;
  }
  requireModule('shared/utilities');
  var documentModel = requireModule('model/document-model'),
    SnapFlag = requireModule('editing/undo-manager').SnapFlag,
    smartQuotes =
      (documentModel.Node,
      documentModel.TYPE,
      requireModule('libraries/rangy'),
      requireModule('editing/smart-quotes')),
    closingCharacters = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'",
      '~': '~',
      '^': '^',
      '=': '=',
      '*': '*',
      '`': '`',
      $: '$',
      _: '_',
    },
    surroundPatternCache = null;
  var removablePairPatternCache = null;
  var inlinePairPatternCache = null;
  moduleExports.handlePair = function (
    editor,
    typedCharacter,
    targetNode,
    selectionBookmark,
    pendingCommand,
    range,
  ) {
    Object.defineProperty(advanceSelectionBookmark, 'name', { value: 'x', configurable: true });
    Object.defineProperty(insertCharacterPair, 'name', { value: 'C', configurable: true });

    var text, slice, currentTextSlice, localTextSlice;
    if (
      !File.option.noPairingMatch &&
      ((File.option.noLegacyMath &&
        File.option.enableInlineMath &&
        '[' !== typedCharacter &&
        '(' !== typedCharacter) ||
        (editor.undo.endSnap(),
        editor.undo.addSnap(targetNode.cid, 0),
        '\\' !==
          (text = editor.findElemById(targetNode.cid).rawText()).substring(
            Math.max(0, selectionBookmark.start - 1),
            selectionBookmark.start,
          )))
    ) {
      if (/^[\]\)\}'"]$/.exec(typedCharacter)) {
        editor.undo.endSnap();
        editor.undo.addSnap(targetNode.cid, 0);
        text = editor.findElemById(targetNode.cid).rawText();
        if (
          typedCharacter === text.substring(selectionBookmark.start, selectionBookmark.start + 1)
        ) {
          advanceSelectionBookmark();
          console.debug('move next');
          return pendingCommand || true;
        }
        if ("'" == typedCharacter || '"' == typedCharacter) {
          if ('' == text) {
            return (
              ("'" != typedCharacter ||
                !~(File.option.keyboardLayout || '').indexOf('Ukrainian')) &&
              insertCharacterPair()
            );
          }
          slice = (localTextSlice = text.substring(0, selectionBookmark.start)).slice(-1);
          var isSingleQuote = "'" == typedCharacter;
          if (
            smartQuotes.shouldTriggerReplaceQuote(true) &&
            -1 == '"\''.indexOf(smartQuotes.userQuote(isSingleQuote ? 2 : 0)) &&
            smartQuotes.shouldTriggerReplace(editor, range)
          ) {
            var closingQuote = smartQuotes.userQuote(isSingleQuote ? 3 : 1, void 0, true);
            if (
              closingQuote ==
              (currentTextSlice = text.substring(
                selectionBookmark.start,
                selectionBookmark.start + closingQuote.length,
              ))
            ) {
              advanceSelectionBookmark(closingQuote.length);
              return pendingCommand || true;
            }
            if (smartQuotes.userQuote(isSingleQuote ? 2 : 0) == slice) {
              return (function (quoteText) {
                console.debug('insertQuote');
                var selectionRange = editor.selection.getRangy(),
                  domNode = document.createTextNode(quoteText);
                selectionRange.insertNode(domNode);
                domNode.parentElement.normalize();
                advanceSelectionBookmark();
                if (pendingCommand) {
                  editor.undo.register(pendingCommand);
                }
                editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE);
                return true;
              })(closingQuote);
            }
          }
          if (
            typedCharacter != slice &&
            '\\' != slice &&
            !/[\w\u0430-\u044fàâäèéêëîïôœùûüÿçÀÂÄÈÉÊËÎÏÔŒÙÛÜŸÇĀ-ɏ]|(^[.?,!:~\)\]])/i.exec(
              text.substring(Math.max(0, selectionBookmark.start - 1), selectionBookmark.start + 1),
            ) &&
            !(function (textBeforeCaret, closingCharacter) {
              Object.defineProperty(normalizeQuoteCharacter, 'name', {
                value: 'i',
                configurable: true,
              });

              var configuredQuotes = File.option.userQuotesArray || ['“', '”', '‘', '’'];
              function normalizeQuoteCharacter(character, includeOpeningQuotes) {
                if (
                  (includeOpeningQuotes && configuredQuotes[0] == character) ||
                  configuredQuotes[1] == character
                ) {
                  return '"';
                } else {
                  if (
                    (includeOpeningQuotes && configuredQuotes[2] == character) ||
                    configuredQuotes[3] == character
                  ) {
                    return "'";
                  } else {
                    return character;
                  }
                }
              }
              for (
                var outerQuote, innerQuote, length = textBeforeCaret.length, itemIndex = 0;
                itemIndex < length;
                itemIndex++
              ) {
                var openingNormalized = normalizeQuoteCharacter(textBeforeCaret[itemIndex], true),
                  closingNormalized = normalizeQuoteCharacter(textBeforeCaret[itemIndex], false),
                  normalizedQuote = openingNormalized || closingNormalized;
                if (
                  !(
                    ("'" != normalizedQuote ||
                      (!outerQuote &&
                        /[\w\u0430-\u044fàâäèéêëîïôœùûüÿçÀÂÄÈÉÊËÎÏÔŒÙÛÜŸÇĀ-ɏ]/i.exec(
                          textBeforeCaret[itemIndex - 1] || '',
                        ))) &&
                    '"' != normalizedQuote
                  )
                ) {
                  if (outerQuote) {
                    if (outerQuote == normalizedQuote) {
                      outerQuote = null;
                      innerQuote = null;
                    } else {
                      innerQuote = innerQuote ? null : normalizedQuote;
                    }
                  } else {
                    outerQuote = normalizedQuote;
                  }
                }
              }
              return (
                (closingCharacter = normalizeQuoteCharacter(closingCharacter, false)) ==
                  outerQuote || closingCharacter == innerQuote
              );
            })(localTextSlice, typedCharacter)
          ) {
            return insertCharacterPair();
          }
          console.debug('insert ending quote');
        }
      } else {
        if (/^[\[\(\{]$/.exec(typedCharacter)) {
          editor.undo.endSnap();
          currentTextSlice = (text = editor.findElemById(targetNode.cid).rawText()).substring(
            selectionBookmark.start,
            selectionBookmark.start + 1,
          );
          if (!/[^\[\]{}()"'\s`>$]/.exec(currentTextSlice)) {
            return insertCharacterPair();
          }
        } else {
          if (
            File.option.autoPairExtendSymbol &&
            (function () {
              if (!inlinePairPatternCache) {
                var inlinePairCharacters = '*`_';
                if (File.option.enableInlineMath) {
                  inlinePairCharacters += '$';
                }
                inlinePairPatternCache = new RegExp('^[' + inlinePairCharacters + ']$');
              }
              return inlinePairPatternCache;
            })().exec(typedCharacter)
          ) {
            editor.undo.endSnap();
            if (
              range &&
              range.commonAncestorContainer &&
              range.commonAncestorContainer.parentElement &&
              (('CODE' == range.commonAncestorContainer.parentElement.tagName &&
                '`' != typedCharacter) ||
                ('SCRIPT' == range.commonAncestorContainer.parentElement.tagName &&
                  '$' != typedCharacter))
            ) {
              return;
            }
            text = editor.findElemById(targetNode.cid).rawText();
            if (
              File.option.enableInlineMath &&
              '$' == text.substring(selectionBookmark.start - 1, selectionBookmark.start) &&
              /[*`^_~=]/.exec(typedCharacter)
            ) {
              return;
            }
            var currentText =
              (localTextSlice = localTextSlice || text.substring(0, selectionBookmark.start))[
                localTextSlice.length - 1
              ] || '';
            if ('\\' == currentText) {
              return false;
            }
            currentTextSlice = text.substring(selectionBookmark.start, selectionBookmark.start + 1);
            var textSlice = text.substring(
                selectionBookmark.start + 1,
                selectionBookmark.start + 2,
              ),
              match = /[*_]/.exec(typedCharacter);
            if (currentTextSlice == typedCharacter) {
              if (match) {
                if (match && textSlice) {
                  return advanceSelectionBookmark() || true;
                }
                var element = $(editor.selection.getRangy().commonAncestorContainer);
                if (
                  element.closest('.md-after').length &&
                  element.parent().parent("[md-inline='strong'], [md-inline='em']").length
                ) {
                  return advanceSelectionBookmark() || true;
                } else {
                  localTextSlice = text.substring(0, selectionBookmark.start);
                  if (/[*_]$/.exec(localTextSlice)) {
                    return insertCharacterPair();
                  } else {
                    return advanceSelectionBookmark() || true;
                  }
                }
              }
              return advanceSelectionBookmark() || true;
            }
            var afterWhitespace = 0 == currentText.trim().length;
            if (
              afterWhitespace ||
              !(function (inputText, markerCharacter) {
                if ('`' == markerCharacter && /``$/.exec(inputText)) {
                  return true;
                }
                inputText.replace(/\\[*`_$]/g, '');
                if ('_' == markerCharacter) {
                  inputText = inputText.replace(/([a-z])_([a-z])/gi, '');
                }
                for (
                  var textLength = inputText.length, insideMarker = false, itemIndex = 0;
                  itemIndex < textLength;
                  itemIndex++
                ) {
                  if (inputText[itemIndex] == markerCharacter) {
                    insideMarker = !insideMarker;
                  }
                }
                return insideMarker;
              })(localTextSlice, typedCharacter)
            ) {
              if (afterWhitespace && !/^[^\s\>\)\]}'";:.,?!~*\/&#=_+-]/.exec(currentTextSlice)) {
                return insertCharacterPair();
              }
              if ((currentText + 'a').trim().split(/\b/).length > 1) {
                return insertCharacterPair();
              }
            }
          }
        }
      }
      return false;
    }
    function advanceSelectionBookmark(end) {
      end = end || 1;
      var currentRange = editor.selection.rangy.createRange();
      selectionBookmark.end += end;
      selectionBookmark.start += end;
      currentRange.moveToBookmark(selectionBookmark);
      currentRange.select(currentRange.isBackward);
      if (pendingCommand) {
        pendingCommand.redo.push(editor.selection.buildUndo());
      }
    }
    function insertCharacterPair() {
      if (!pendingCommand) {
        console.debug('insertTwo');
        var selectionRange = editor.selection.getRangy(),
          domNode = document.createTextNode(typedCharacter + closingCharacters[typedCharacter]);
        selectionRange.insertNode(domNode);
        selectionRange.setStart(domNode, typedCharacter.length);
        selectionRange.setEnd(domNode, typedCharacter.length);
        selectionRange.select();
        editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE);
        if (
          smartQuotes.shouldTriggerReplaceQuote(true) &&
          /['"]/.exec(typedCharacter) &&
          smartQuotes.shouldTriggerReplace(editor, range)
        ) {
          smartQuotes.replaceQuote(domNode);
        }
        var hasExtraQuoteSpacing = domNode.textContent.toString().length > 2;
        domNode.parentElement.normalize();
        advanceSelectionBookmark();
        if (hasExtraQuoteSpacing) {
          advanceSelectionBookmark();
        }
        editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE);
        return true;
      }
    }
  };
  moduleExports.surroundPair = function (editor, openingCharacter, range) {
    editor.undo.endSnap();
    if (!File.option.noPairingMatch) {
      var surroundBookmark,
        targetNode,
        element = $(range.commonAncestorContainer).closest('[cid]'),
        currentElement = $(range.commonAncestorContainer).closest(
          '.md-def-content:not(.md-def-url)',
        );
      if (
        ((element.length && !element.find('[cid], .md-def-name').length) ||
          currentElement.length) &&
        (function () {
          if (!surroundPatternCache) {
            var surroundCharacters = '\\{\\(\\["\'';
            if (File.option.autoPairExtendSymbol) {
              surroundCharacters += '*`~_';
              if (File.option.enableInlineMath) {
                surroundCharacters += '$';
              }
              if (File.option.enableSuperscript) {
                surroundCharacters += '^';
              }
              if (File.option.enableHighlight) {
                surroundCharacters += '=';
              }
            }
            surroundPatternCache = new RegExp('^[' + surroundCharacters + ']$');
          }
          return surroundPatternCache;
        })().exec(openingCharacter)
      ) {
        targetNode = editor.findNodeByElem(element);
        editor.undo.addSnap(targetNode.cid, 0);
        element = currentElement.length ? currentElement : element;
        surroundBookmark = range.getBookmark(element[0]);
        (range = editor.selection.rangy.createRange()).moveToBookmark(surroundBookmark);
        editor.selection.deRange(range);
        var textNode = document.createTextNode(openingCharacter),
          currentTextNode = document.createTextNode(closingCharacters[openingCharacter]);
        range.insertNode(textNode);
        surroundBookmark.end++;
        range.moveToBookmark(surroundBookmark);
        editor.selection.deRange(range);
        range.insertNodeAtEnd(currentTextNode);
        surroundBookmark.start++;
        range.moveToBookmark(surroundBookmark);
        range.select(range.isBackward);
        editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE);
        var openingQuote = smartQuotes.userQuote('"' == openingCharacter ? 0 : 2, false, true);
        if (
          smartQuotes.shouldTriggerReplaceQuote(true) &&
          /['"]/.exec(openingCharacter) &&
          !/['"]/.exec(openingQuote) &&
          smartQuotes.shouldTriggerReplace(editor, range)
        ) {
          smartQuotes.replaceQuote(textNode, currentTextNode);
          if (2 == openingQuote.length) {
            surroundBookmark.start += 1;
            surroundBookmark.end += 2;
          }
          range.moveToBookmark(surroundBookmark);
          range.select(range.isBackward);
        }
        editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE);
        return true;
      }
    }
  };
  moduleExports.tryRemovePairStart = function (unusedParameter1, range) {
    var selectedCharacter = range.toString();
    if (
      !File.option.noPairingMatch &&
      (1 != range.endOffset || !$(range.endContainer).closest('.md-after, .md-before').length) &&
      ((function () {
        if (!removablePairPatternCache) {
          var removablePairCharacters = '\\{\\(\\["\'';
          if (File.option.autoPairExtendSymbol) {
            removablePairCharacters += '*`~_';
            if (File.option.enableInlineMath) {
              removablePairCharacters += '$';
            }
            if (File.option.enableSuperscript) {
              removablePairCharacters += '^';
            }
          }
          removablePairPatternCache = new RegExp('[' + removablePairCharacters + ']');
        }
        return removablePairPatternCache;
      })().exec(selectedCharacter) ||
        smartQuotes.userQuote(0, true) == selectedCharacter ||
        smartQuotes.userQuote(2, true) == selectedCharacter)
    ) {
      var element = $(range.commonAncestorContainer).closest('[cid]'),
        text = element.rawText(),
        pairBookmark = range.getBookmark(element[0]),
        textSlice = text.substring(pairBookmark.end, pairBookmark.end + 1);
      if (
        closingCharacters[selectedCharacter] == textSlice ||
        (smartQuotes.userQuote(0, true) == selectedCharacter &&
          smartQuotes.userQuote(1, true) == textSlice) ||
        (smartQuotes.userQuote(2, true) == selectedCharacter &&
          smartQuotes.userQuote(3, true) == textSlice)
      ) {
        pairBookmark.end++;
        range.moveToBookmark(pairBookmark);
        return range;
      }
    }
  };
  Object.defineProperty(globalThis, '__MARKLYRA_RESET_PAIRING__', {
    value: Object.freeze(function () {
      surroundPatternCache = null;
      removablePairPatternCache = null;
      inlinePairPatternCache = null;
    }),
    writable: false,
    configurable: false,
    enumerable: false,
  });
  moduleExports.surroundPair = (function wrapPairingHistory(original) {
    const same = (left, right) => {
      if (Object.is(left, right)) {
        return true;
      }
      if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
        return false;
      }
      if (Array.isArray(left) !== Array.isArray(right)) {
        return false;
      }
      if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
        return false;
      }
      if (!Array.isArray(left) && Object.prototype.toString.call(left) !== '[object Object]') {
        return false;
      }
      const keys = Object.keys(left);
      if (keys.length !== Object.keys(right).length) {
        return false;
      }
      return keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
    };
    const snapshot = (command) => {
      if (
        !command ||
        !Array.isArray(command.undo) ||
        !Array.isArray(command.redo) ||
        command.undo.length !== 2 ||
        command.redo.length !== 2 ||
        ![undefined, null, false].includes(command.incomplete) ||
        Object.keys(command).some(
          (key) => !['undo', 'redo', 'source', 'date', 'incomplete'].includes(key),
        )
      ) {
        return null;
      }
      const [cursorBefore, before] = command.undo,
        [after, cursorAfter] = command.redo;
      if (
        cursorBefore?.type !== 'cursor' ||
        cursorAfter?.type !== 'cursor' ||
        before?.type !== 'replace' ||
        after?.type !== 'replace' ||
        typeof before.id !== 'string' ||
        before.id !== after.id ||
        before.json?.id !== before.id ||
        after.json?.id !== before.id ||
        !before.json?.content ||
        !after.json?.content ||
        cursorBefore.id !== before.id ||
        cursorAfter.id !== before.id
      ) {
        return null;
      }
      return { id: before.id, before: before.json, after: after.json, cursorBefore, cursorAfter };
    };
    return function (...args) {
      const undo = args[0]?.undo;
      const initialStack = Array.isArray(undo?.commandStack) ? undo.commandStack : null;
      const existing = initialStack ? new Set(initialStack) : null;
      const result = original.apply(this, args);
      if (
        result !== true ||
        !existing ||
        undo.commandStack !== initialStack ||
        !Number.isInteger(undo.index) ||
        undo.index !== initialStack.length - 1 ||
        typeof undo.setIndex !== 'function'
      ) {
        return result;
      }
      try {
        const added = initialStack.filter((command) => !existing.has(command));
        if (
          added.length !== 2 ||
          initialStack.at(-2) !== added[0] ||
          initialStack.at(-1) !== added[1]
        ) {
          return result;
        }
        const previous = snapshot(added[0]),
          last = snapshot(added[1]);
        if (
          !previous ||
          !last ||
          previous.id !== last.id ||
          same(previous.before, previous.after) ||
          !same(last.before, last.after) ||
          !same(last.cursorBefore, last.cursorAfter) ||
          !same(previous.after, last.before) ||
          !same(previous.cursorAfter, last.cursorBefore)
        ) {
          return result;
        }
        const expectedSource = `${last.id}#2`;
        const sourceMatches =
          added[0].source === expectedSource ||
          (added[0].source === null && added[0].date === null && added[0].incomplete === null);
        if (added[1].source !== expectedSource || !sourceMatches) {
          return result;
        }
        const indexDescriptor = Object.getOwnPropertyDescriptor(undo, 'index');
        if (!indexDescriptor?.writable || !Object.hasOwn(indexDescriptor, 'value')) {
          return result;
        }
        const previousIndex = undo.index;
        initialStack.pop();
        try {
          undo.setIndex(initialStack.length - 1);
        } catch {
          initialStack.push(added[1]);
          if (undo.index !== previousIndex) {
            undo.index = previousIndex;
          }
        }
      } catch {
        // An unfamiliar snapshot shape cannot justify deleting history.
      }
      return result;
    };
  })(moduleExports.surroundPair);
}
