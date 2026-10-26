// ui/word-count.
export default function initializeUiWordCount(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  requireModule('shared/utilities');
  var jquery = requireModule('libraries/jquery'),
    documentModel = requireModule('model/document-model'),
    currentDocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    countTextWords = function (text) {
      if (0 === text.trim().length) {
        return 0;
      }
      var cjkCharacterCount = 0,
        partsLength = [
          'd',
          text
            .replace(/[\u3040-\uABFF\uD7A4-\uFAFF]/gi, function (unusedParameter1) {
              cjkCharacterCount++;
              return ' ';
            })
            .replace(/['’]\w+/g, 'b')
            .replace(/(^|\s+)[(\u3000-\u303F)!-\/:-@\[-`{-~]+(\s+|$)/gm, ' '),
          'd',
        ]
          .join(' ')
          .split(/[(\u3000-\u303F)\s!-,\\:-@\[-`{-~]+/g).length;
      return cjkCharacterCount + partsLength - 2;
    },
    Delimiter = { WORD: 0, CHAR: 1, LINE: 2, TIME: 3 },
    pluralStatisticLabels = ['Words', 'Characters', 'Lines', 'Minutes'],
    singularStatisticLabels = ['Word', 'Character', 'Line', 'Minute'];
  class WordCountController {
    constructor(inputEditor) {
      this.editor = inputEditor;
      this.delimiter = (File.option.wordCountDelimiter || 0) - 0;
      this.Delimiter = Delimiter;
      this.defferUpdateTimer = null;
      this.defferSelectionUpdateTimer = null;
      this.lastCount = -1;
      this.selCount = 0;
      this.excludedCid = null;
      this.excludedCount = -1;
      if (File.isNodeHtml) {
        this.bindWordCountOnNode();
      }
      if (File.isMac) {
        this.setupBridge();
      }
    }
    setupBridge() {
      var receiver = this;
      bridge.registerHandler('wordCount.getLabelsToShowOnMac', function (unusedParameter1, reply) {
        reply(receiver.getLabelsToShowOnMac());
      });
    }
    getText(escapeHeading) {
      var currentEditor = this.editor,
        currentEscapeHeading = escapeHeading,
        domNode = escapeHeading;
      if (void 0 === domNode.nodeType) {
        domNode = document.querySelector("[cid='" + currentEscapeHeading + "']");
      } else {
        currentEscapeHeading = domNode.getAttribute('cid');
      }
      var nodeType = domNode && domNode.getAttribute('mdtype');
      if (nodeType == NodeType.toc) {
        return 'toc';
      }
      if (
        currentDocumentNode.isType(
          nodeType,
          NodeType.html_block,
          NodeType.math_block,
          NodeType.fences,
        )
      ) {
        var CodeMirror = (domNode.querySelector('.CodeMirror') || {}).CodeMirror;
        if (CodeMirror) {
          if (nodeType == NodeType.fences) {
            var attributeValue = domNode.getAttribute('lang');
            return (
              (attributeValue ? '```' + attributeValue + '\n' : '') +
              CodeMirror.getValue() +
              (attributeValue ? '```' : '')
            );
          }
          if (nodeType == NodeType.math_block) {
            return '$$\n' + CodeMirror.getValue() + '\n$$';
          } else {
            return CodeMirror.getValue();
          }
        }
        var documentNode = currentEditor.getNode(currentEscapeHeading);
        if (documentNode) {
          return documentNode.get('text');
        } else {
          return '';
        }
      }
      if (nodeType && !currentDocumentNode.canContainBlock(nodeType, true)) {
        if (this.useWordDelimiter()) {
          var currentDomNode = domNode;
          if (File.option.enableInlineMath && domNode.querySelector('svg')) {
            (currentDomNode = domNode.cloneNode(true))
              .querySelectorAll('svg')
              .forEach(function (item) {
                item.textContent = '';
              });
          }
          return currentDomNode.textContent;
        }
        return domNode.textContent;
      }
      return null;
    }
    useWordDelimiter() {
      return this.delimiter == Delimiter.WORD;
    }
    clearTimer() {
      if (this.defferUpdateTimer) {
        cancelIdleCallback(this.defferUpdateTimer);
        this.defferUpdateTimer = null;
      }
    }
    quickUpdate(documentNode, invalidateCache, cacheOnly) {
      var nodeText = null,
        localDocumentNode = documentNode;
      if (documentNode) {
        if (documentNode.cid) {
          nodeText = documentNode.get('text');
          localDocumentNode = documentNode.cid;
        } else {
          nodeText = this.getText(localDocumentNode);
        }
      }
      if (invalidateCache) {
        this.excludedCount = -1;
        this.excludedCid = null;
      }
      if (null !== nodeText) {
        if (this.delimiter == Delimiter.CHAR) {
          this.quickUpdateCharCount(localDocumentNode, nodeText, cacheOnly);
        }
        if (this.delimiter == Delimiter.WORD) {
          this.quickUpdateWordCount(localDocumentNode, nodeText, cacheOnly);
        }
        if (this.delimiter == Delimiter.LINE) {
          this.quickUpdateLineCount(localDocumentNode, nodeText, cacheOnly);
        }
        if (this.delimiter == Delimiter.TIME) {
          this.quickUpdateReadTime(localDocumentNode, nodeText, cacheOnly);
        }
      }
    }
    quickUpdateWordCount(excludedCid, nodeText, cacheOnly, asReadingTime) {
      var lastCount;
      if (this.excludedCid == excludedCid && this.excludedCount >= 0) {
        lastCount = countTextWords(nodeText) + this.excludedCount;
        if (cacheOnly && lastCount == this.lastCount) {
          return;
        }
        this.lastCount = lastCount;
        return void this.updateLabel(
          0,
          asReadingTime ? Math.round(this.lastCount / File.option.wordsPerMinute) : this.lastCount,
        );
      }
      if (!cacheOnly) {
        this.clearTimer();
        var receiver = this;
        this.defferUpdateTimer = requestIdleCallback(function () {
          receiver.lastCount = receiver.getWordCount();
          receiver.excludedCid = excludedCid;
          receiver.excludedCount = receiver.lastCount - countTextWords(nodeText);
          receiver.updateLabel(
            -1,
            asReadingTime
              ? Math.round(receiver.lastCount / File.option.wordsPerMinute)
              : receiver.lastCount,
          );
        });
      }
    }
    quickUpdateCharCount(excludedCid, text, cacheOnly, countLines) {
      var lastCount;
      if (this.excludedCid == excludedCid && this.excludedCount >= 0) {
        lastCount = (countLines ? text.split(/\n/g).length : text.length) + this.excludedCount;
        if (cacheOnly && lastCount == this.lastCount) {
          return;
        }
        this.lastCount = lastCount;
        return void this.updateLabel(0, this.lastCount);
      }
      if (!cacheOnly) {
        var markdown = this.editor.getMarkdown();
        this.lastCount = countLines ? markdown.split(/\n/g).length : markdown.length;
        this.excludedCid = excludedCid;
        this.excludedCount = this.lastCount - (countLines ? text.split(/\n/g).length : text.length);
        this.updateLabel(0, this.lastCount);
      }
    }
    quickUpdateReadTime(excludedNodeId, nodeText, cacheOnly) {
      this.quickUpdateWordCount(excludedNodeId, nodeText, cacheOnly, true);
    }
    quickUpdateLineCount(excludedNodeId, nodeText, cacheOnly) {
      this.quickUpdateCharCount(excludedNodeId, nodeText, cacheOnly, true);
    }
    getLabelsToShowOnMac() {
      File.sync();
      var documentWordCount = this.getWordCount(),
        selectedText = this.editor.selection.getTextInSelection();
      if (selectedText.length) {
        return [
          documentWordCount,
          countTextWords(selectedText),
          selectedText.length,
          Math.round(documentWordCount / File.option.wordsPerMinute),
        ].join('|');
      } else {
        return [
          documentWordCount,
          0,
          0,
          Math.round(documentWordCount / File.option.wordsPerMinute),
        ].join('|');
      }
    }
    updateLabel(selCount, all) {
      var statisticLabel = jquery.localize.getString(
        pluralStatisticLabels[this.delimiter],
        'Panel',
      );
      if (selCount < 0) {
        selCount = this.selCount;
      } else {
        this.selCount = selCount;
      }
      if (selCount > 0 && selCount < all) {
        if (File.isMac) {
          bridge.callHandler('word.updateWordCount', { sel: selCount, all: all });
        } else {
          if (File.isNodeHtml) {
            var element = document.querySelector('#footer-word-count-label'),
              text = element.textContent,
              currentText = selCount + ' / ' + all + ' ' + statisticLabel;
            if (text != currentText) {
              fastdom.mutate(function () {
                element.textContent = currentText;
              });
            }
          }
        }
      } else {
        if (all >= 0) {
          if (File.isMac) {
            bridge.callHandler('word.updateWordCount', { sel: selCount, all: all });
          } else {
            if (File.isNodeHtml) {
              var currentElement = document.querySelector('#footer-word-count-label');
              if (this.delimiter == Delimiter.TIME && 0 == all) {
                statisticLabel = jquery.localize.getString(
                  singularStatisticLabels[this.delimiter],
                  'Panel',
                );
                all = '≤ 1';
              } else {
                if (1 == all) {
                  statisticLabel = jquery.localize.getString(
                    singularStatisticLabels[this.delimiter],
                    'Panel',
                  );
                }
              }
              fastdom.mutate(function () {
                currentElement.textContent = all + ' ' + statisticLabel;
              });
            }
          }
        }
      }
    }
    updateLineCount(sourceOrRefresh) {
      var partsLength = (sourceOrRefresh =
        true === sourceOrRefresh
          ? this.editor.getMarkdown()
          : sourceOrRefresh || this.editor.getMarkdown()).split(/\n/g).length;
      if (this.lastCount != partsLength) {
        this.lastCount = partsLength;
        this.updateLabel(0, this.lastCount);
      }
    }
    updateCharCount(sourceText) {
      sourceText = sourceText || this.editor.getMarkdown();
      if (this.lastCount != sourceText.length) {
        this.lastCount = sourceText.length;
        this.updateLabel(0, this.lastCount);
      }
    }
    getWordCount() {
      var countableText = '';
      this.editor.writingArea.querySelectorAll('[mdtype]').forEach(function (item) {
        var text = this.getText(item);
        if (text) {
          countableText += '\n' + text;
        }
      }, this);
      return countTextWords(countableText);
    }
    updateWordCount() {
      if (this.delimiter == Delimiter.WORD) {
        this.clearTimer();
        var receiver = this;
        this.defferUpdateTimer = requestIdleCallback(function () {
          receiver.lastCount = receiver.getWordCount();
          receiver.updateLabel(0, receiver.lastCount);
        });
      }
    }
    updateReadTime() {
      this.clearTimer();
      var receiver = this;
      this.defferUpdateTimer = requestIdleCallback(function () {
        receiver.lastCount = receiver.getWordCount();
        receiver.updateLabel(0, Math.round(receiver.lastCount / File.option.wordsPerMinute));
      });
    }
    update(sourceOrRefresh) {
      if (this.delimiter == Delimiter.WORD) {
        this.updateWordCount();
      } else {
        if (this.delimiter == Delimiter.CHAR) {
          this.updateCharCount(sourceOrRefresh);
        } else {
          if (this.delimiter == Delimiter.LINE) {
            this.updateLineCount(sourceOrRefresh);
          } else {
            if (this.delimiter == Delimiter.TIME) {
              this.updateReadTime(sourceOrRefresh);
            }
          }
        }
      }
    }
    updateInSelection(selectionOverride) {
      if (this.defferSelectionUpdateTimer) {
        clearTimeout(this.defferSelectionUpdateTimer);
      }
      var currentEditor = this.editor,
        receiver = this;
      this.defferSelectionUpdateTimer = setTimeout(function () {
        var selectedText =
          void 0 == selectionOverride || null == selectionOverride
            ? currentEditor.selection.getTextInSelection()
            : selectionOverride;
        selectedText = selectedText || '';
        var selectedCount = 0;
        this.defferSelectionUpdateTimer = null;
        if (receiver.delimiter == Delimiter.CHAR) {
          selectedCount = selectedText.length;
        } else {
          if (receiver.delimiter != Delimiter.WORD) {
            return;
          }
          selectedCount = countTextWords(selectedText);
        }
        selectedCount = Math.min(selectedCount, receiver.lastCount);
        receiver.updateLabel(selectedCount, receiver.lastCount);
      }, 50);
    }
    getWordCountInSelection() {
      var selectedText = editor.selection.getTextInSelection();
      return countTextWords(selectedText);
    }
    getCharCountInSelection() {
      return editor.selection.getTextInSelection().length;
    }
    bindWordCountOnNode() {
      var receiver = this,
        currentEditor = this.editor;
      jquery('#footer-word-count')
        .on('click', function () {
          if (document.body.classList.contains('marklyra-show-word-count')) {
            document.body.classList.remove('marklyra-show-word-count');
            document.body.classList.remove('marklyra-show-word-count-in-selection');
          } else {
            document.body.classList.remove('marklyra-show-spell-check');
            document.body.classList.add('marklyra-show-word-count');
            File.sync();
            var documentWordCount = receiver.getWordCount();
            jquery('#footer-word-count-td').text(documentWordCount);
            var markdown = currentEditor.getMarkdown(),
              readingMinutes = Math.round(documentWordCount / File.option.wordsPerMinute);
            jquery('#footer-read-time-count-td').text(readingMinutes || '≤ 1');
            jquery('#footer-line-count-td').text((markdown.match(/\n/g) || []).length + 1);
            jquery('#footer-char-count-td').text(markdown.length);
            var selectedText = currentEditor.selection.getTextInSelection();
            if (selectedText.length) {
              jquery('#footer-char-count-td-sel').text(selectedText.length);
              jquery('#footer-word-count-td-sel').text(countTextWords(selectedText));
              document.body.classList.add('marklyra-show-word-count-in-selection');
            } else {
              document.body.classList.remove('marklyra-show-word-count-in-selection');
            }
          }
        })
        .on('before-show-marklyra-hint', function (popoverEvent) {
          if (document.body.classList.contains('marklyra-show-word-count')) {
            popoverEvent.cancel = true;
          }
        });
      jquery('#footer-word-count-info').on('click', '[data-delimiter]', function () {
        var delimiterIndex = this.dataset.delimiter - 0;
        receiver.setDelimiter(delimiterIndex);
        var text = this.children[0].textContent + ' ' + this.children[1].textContent;
        document.querySelector('#footer-word-count-label').textContent = text;
        document.body.classList.remove('marklyra-show-word-count');
        currentEditor.restoreLastCursor(null, true);
      });
    }
    setDelimiter(delimiter) {
      this.delimiter = delimiter;
      this.update(true);
      this.quickUpdate(editor.focusCid, true);
      JSBridge.putSetting('wordCountDelimiter', this.delimiter);
    }
  }

  WordCountController.Delimiter = Delimiter;
  moduleRecord.exports = WordCountController;
}
