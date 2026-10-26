// editing/smart-quotes.
export default function initializeEditingSmartQuotes(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  requireModule('shared/utilities');
  var range,
    currentRange,
    documentModel = requireModule('model/document-model'),
    SnapFlag = requireModule('editing/undo-manager').SnapFlag,
    rangy = (documentModel.Node, documentModel.TYPE, requireModule('libraries/rangy')),
    userQuotesArray = ['“', '”', '‘', '’'],
    smartQuotes = {
      isSmartQuote: function (searchValue) {
        return (
          !!smartQuotes.shouldTriggerReplaceQuote() &&
          [
            smartQuotes.userQuote(0),
            smartQuotes.userQuote(1),
            smartQuotes.userQuote(2),
            smartQuotes.userQuote(3),
          ].indexOf(searchValue) > -1
        );
      },
      shouldTriggerReplaceQuote: function () {
        return !File.option.convertSmartOnRender && File.option.smartQuote;
      },
      replaceQuote: function (domNode, inputDomNode) {
        if (!File.option.convertSmartOnRender && File.option.smartQuote) {
          var isSingleQuote = "'" == domNode.textContent.toString()[0];
          if (domNode) {
            if (2 == domNode.textContent.length) {
              domNode.nodeValue =
                smartQuotes.userQuote(isSingleQuote ? 2 : 0, false, true) +
                smartQuotes.userQuote(isSingleQuote ? 3 : 1, false, true);
            } else {
              domNode.nodeValue = smartQuotes.userQuote(isSingleQuote ? 2 : 0, false, true);
            }
          }
          if (inputDomNode) {
            inputDomNode.nodeValue = smartQuotes.userQuote(isSingleQuote ? 3 : 1, false, true);
          }
        }
      },
      userQuote: function (quoteIndex, requireSmartQuote, preserveSpacing) {
        var text =
          (File.option.userQuotesArray || userQuotesArray)[quoteIndex] ||
          userQuotesArray[quoteIndex];
        if (!requireSmartQuote || ('"' != text && "'" != text)) {
          if (preserveSpacing && !File.option.convertSmartOnRender) {
            return text;
          } else {
            return text.trim();
          }
        } else {
          return null;
        }
      },
      shouldTriggerReplace: function (editor, inputRange) {
        var element = editor.getJQueryElem(inputRange.commonAncestorContainer);
        return (
          !element.closest(
            "[md-inline='code'], code, script, pre, [md-inline='escape'], .md-image-src-span, .md-url",
          ).length && !element.find("code, script, [md-inline='escape']").length
        );
      },
      clearLastQuoteState: function () {
        range = false;
        currentRange = false;
      },
      handlerCh: function (
        editor,
        typedCharacter,
        targetNode,
        unusedParameter4,
        unusedParameter5,
        inputRange,
      ) {
        var unescapedPrefix,
          shouldUseOpeningQuote = function (textBeforeCaret, isSingleQuote) {
            var previousCharacter = textBeforeCaret[textBeforeCaret.length - 1] || '';
            return (
              !(
                !/(^|[\(\{\[\s\-/\u2018])$/.exec(previousCharacter) &&
                !/(^|\s)[*`~+^$_]$/.exec(textBeforeCaret)
              ) ||
              !(!isSingleQuote || smartQuotes.userQuote(0) != previousCharacter) ||
              (!isSingleQuote && smartQuotes.userQuote(2) == previousCharacter)
            );
          },
          getUnescapedPrefix = function () {
            if (void 0 !== unescapedPrefix) {
              return unescapedPrefix;
            } else {
              return (unescapedPrefix = getTextBeforeCaret().replace(/\\[-."']/g, ''));
            }
          },
          getTextBeforeCaret = function () {
            try {
              var localRange = rangy.createRange();
              localRange.setEnd(inputRange.startContainer, inputRange.startOffset);
              localRange.setStart($(inputRange.startContainer).closest('[md-inline], [cid]')[0], 0);
              return localRange.toString();
            } catch (error) {}
            return '';
          },
          replacePrecedingCharacters = function (precedingCharacterCount, replacementText) {
            var insertionSelection = (function () {
              var selectionSnapshot = editor.selection.buildUndo(inputRange),
                textNode = document.createTextNode(typedCharacter);
              inputRange.insertNode(textNode);
              inputRange.setStart(textNode, typedCharacter.length);
              inputRange.setEnd(textNode, typedCharacter.length);
              inputRange.select();
              editor.undo.addSnap(targetNode.cid, SnapFlag.ADD);
              selectionSnapshot.end = selectionSnapshot.start + 1;
              selectionSnapshot.start = selectionSnapshot.end;
              return selectionSnapshot;
            })();
            insertionSelection.start -= 1 + precedingCharacterCount;
            editor.selection.restoreSelection(editor.findElemById(targetNode.cid)[0], {
              start: insertionSelection.end,
              end: insertionSelection.end,
            });
            var replacementRange = editor.selection.restoreSelection(
              editor.findElemById(targetNode.cid)[0],
              {
                start: insertionSelection.start,
                end: insertionSelection.end,
              },
            );
            if (replacementRange) {
              var currentTextNode = document.createTextNode(replacementText);
              replacementRange.deleteContents();
              replacementRange.insertNode(currentTextNode);
              replacementRange.setStartAndEnd(currentTextNode, replacementText.length);
              replacementRange.select();
            }
            editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE);
          },
          isClosingQuoteContext = function (callbackRange, isSingleQuote) {
            var markElement = editor.getMarkElem(callbackRange.startContainer),
              startOffset = editor.selection.getOffset(markElement, callbackRange);
            if (isSingleQuote) {
              return (
                !(
                  !range ||
                  range.startContainer != markElement[0] ||
                  range.startOffset != startOffset
                ) || ((range = { startContainer: markElement[0], startOffset: startOffset }), false)
              );
            } else {
              return (
                !(
                  !currentRange ||
                  currentRange.startContainer != markElement[0] ||
                  currentRange.startOffset != startOffset
                ) ||
                ((currentRange = { startContainer: markElement[0], startOffset: startOffset }),
                false)
              );
            }
          };
        if (!File.option.convertSmartOnRender) {
          if ('-' == typedCharacter && File.option.smartDash) {
            if (!smartQuotes.shouldTriggerReplace(editor, inputRange)) {
              return;
            }
            var match;
            if (/\\$/.exec(getUnescapedPrefix())) {
              return;
            }
            if ((match = /(--|–)$/.exec(getUnescapedPrefix()))) {
              replacePrecedingCharacters(match[0].length, '—');
              return true;
            }
            if (/-$/.exec(getUnescapedPrefix())) {
              replacePrecedingCharacters(1, File.option.twoHyphensToEm ? '—' : '–');
              return true;
            }
          }
          if ('.' == typedCharacter && File.option.smartDash) {
            if (!smartQuotes.shouldTriggerReplace(editor, inputRange)) {
              return;
            }
            if (/\\$/.exec(getUnescapedPrefix())) {
              return;
            }
            if (/\.\.$/.exec(getUnescapedPrefix())) {
              replacePrecedingCharacters(2, '…');
              return true;
            }
          }
          var useOpeningQuote;
          if ("'" == typedCharacter && File.option.smartQuote) {
            if (!smartQuotes.shouldTriggerReplace(editor, inputRange)) {
              return;
            }
            if (/\\$/.exec(getUnescapedPrefix())) {
              return;
            }
            useOpeningQuote = shouldUseOpeningQuote(getUnescapedPrefix(), true);
            if (isClosingQuoteContext(inputRange, true)) {
              range = null;
              useOpeningQuote = !useOpeningQuote;
            }
            if (useOpeningQuote) {
              replacePrecedingCharacters(0, smartQuotes.userQuote(2));
              return true;
            } else {
              replacePrecedingCharacters(0, smartQuotes.userQuote(3));
              return true;
            }
          }
          if ('"' == typedCharacter && File.option.smartQuote) {
            if (!smartQuotes.shouldTriggerReplace(editor, inputRange)) {
              return;
            }
            if (/\\$/.exec(getUnescapedPrefix())) {
              return;
            }
            useOpeningQuote = shouldUseOpeningQuote(getUnescapedPrefix(), false);
            if (isClosingQuoteContext(inputRange, false)) {
              currentRange = null;
              useOpeningQuote = !useOpeningQuote;
            }
            if (useOpeningQuote) {
              replacePrecedingCharacters(0, smartQuotes.userQuote(0, void 0, true));
              return true;
            } else {
              replacePrecedingCharacters(0, smartQuotes.userQuote(1, void 0, true));
              return true;
            }
          }
        }
      },
    };
  moduleRecord.exports = smartQuotes;
}
