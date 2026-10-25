// editing/smart-quotes.
// SystemJS module 1e. Dependencies: 11, 13, 1b, 1d.
$__System.registerDynamic(
  '1e',
  ['11', '13', '1b', '1d'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self, requireModule('11');
    var range,
      currentRange,
      documentModel = requireModule('13'),
      SnapFlag = requireModule('1b').SnapFlag,
      rangy = (documentModel.Node, documentModel.TYPE, requireModule('1d')),
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
            domNode &&
              (2 == domNode.textContent.length
                ? (domNode.nodeValue =
                    smartQuotes.userQuote(isSingleQuote ? 2 : 0, !1, !0) +
                    smartQuotes.userQuote(isSingleQuote ? 3 : 1, !1, !0))
                : (domNode.nodeValue = smartQuotes.userQuote(isSingleQuote ? 2 : 0, !1, !0))),
              inputDomNode &&
                (inputDomNode.nodeValue = smartQuotes.userQuote(isSingleQuote ? 3 : 1, !1, !0));
          }
        },
        userQuote: function (quoteIndex, requireSmartQuote, preserveSpacing) {
          var text =
            (File.option.userQuotesArray || userQuotesArray)[quoteIndex] ||
            userQuotesArray[quoteIndex];
          return !requireSmartQuote || ('"' != text && "'" != text)
            ? preserveSpacing && !File.option.convertSmartOnRender
              ? text
              : text.trim()
            : null;
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
          (range = !1), (currentRange = !1);
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
            h = function (textBeforeCaret, isSingleQuote) {
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
            p = function () {
              return void 0 !== unescapedPrefix
                ? unescapedPrefix
                : (unescapedPrefix = f().replace(/\\[-."']/g, ''));
            },
            f = function () {
              try {
                var localRange = rangy.createRange();
                return (
                  localRange.setEnd(inputRange.startContainer, inputRange.startOffset),
                  localRange.setStart(
                    $(inputRange.startContainer).closest('[md-inline], [cid]')[0],
                    0,
                  ),
                  localRange.toString()
                );
              } catch (error) {}
              return '';
            },
            m = function (precedingCharacterCount, replacementText) {
              var insertionSelection = (function () {
                var selectionSnapshot = editor.selection.buildUndo(inputRange),
                  textNode = document.createTextNode(typedCharacter);
                return (
                  inputRange.insertNode(textNode),
                  inputRange.setStart(textNode, typedCharacter.length),
                  inputRange.setEnd(textNode, typedCharacter.length),
                  inputRange.select(),
                  editor.undo.addSnap(targetNode.cid, SnapFlag.ADD),
                  (selectionSnapshot.end = selectionSnapshot.start + 1),
                  (selectionSnapshot.start = selectionSnapshot.end),
                  selectionSnapshot
                );
              })();
              (insertionSelection.start -= 1 + precedingCharacterCount),
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
                replacementRange.deleteContents(),
                  replacementRange.insertNode(currentTextNode),
                  replacementRange.setStartAndEnd(currentTextNode, replacementText.length),
                  replacementRange.select();
              }
              editor.undo.addSnap(targetNode.cid, SnapFlag.REPLACE);
            },
            g = function (callbackRange, isSingleQuote) {
              var markElement = editor.getMarkElem(callbackRange.startContainer),
                startOffset = editor.selection.getOffset(markElement, callbackRange);
              return isSingleQuote
                ? !(
                    !range ||
                    range.startContainer != markElement[0] ||
                    range.startOffset != startOffset
                  ) || ((range = { startContainer: markElement[0], startOffset: startOffset }), !1)
                : !(
                    !currentRange ||
                    currentRange.startContainer != markElement[0] ||
                    currentRange.startOffset != startOffset
                  ) ||
                    ((currentRange = { startContainer: markElement[0], startOffset: startOffset }),
                    !1);
            };
          if (!File.option.convertSmartOnRender) {
            if ('-' == typedCharacter && File.option.smartDash) {
              if (!smartQuotes.shouldTriggerReplace(editor, inputRange)) return;
              var match;
              if (/\\$/.exec(p())) return;
              if ((match = /(--|–)$/.exec(p()))) return m(match[0].length, '—'), !0;
              if (/-$/.exec(p())) return m(1, File.option.twoHyphensToEm ? '—' : '–'), !0;
            }
            if ('.' == typedCharacter && File.option.smartDash) {
              if (!smartQuotes.shouldTriggerReplace(editor, inputRange)) return;
              if (/\\$/.exec(p())) return;
              if (/\.\.$/.exec(p())) return m(2, '…'), !0;
            }
            var useOpeningQuote;
            if ("'" == typedCharacter && File.option.smartQuote) {
              if (!smartQuotes.shouldTriggerReplace(editor, inputRange)) return;
              if (/\\$/.exec(p())) return;
              return (
                (useOpeningQuote = h(p(), !0)),
                g(inputRange, !0) && ((range = null), (useOpeningQuote = !useOpeningQuote)),
                useOpeningQuote
                  ? (m(0, smartQuotes.userQuote(2)), !0)
                  : (m(0, smartQuotes.userQuote(3)), !0)
              );
            }
            if ('"' == typedCharacter && File.option.smartQuote) {
              if (!smartQuotes.shouldTriggerReplace(editor, inputRange)) return;
              if (/\\$/.exec(p())) return;
              return (
                (useOpeningQuote = h(p(), !1)),
                g(inputRange, !1) && ((currentRange = null), (useOpeningQuote = !useOpeningQuote)),
                useOpeningQuote
                  ? (m(0, smartQuotes.userQuote(0, void 0, !0)), !0)
                  : (m(0, smartQuotes.userQuote(1, void 0, !0)), !0)
              );
            }
          }
        },
      };
    moduleRecord.exports = smartQuotes;
  },
);
