// editing/source-mode.
export default function initializeEditingSourceMode(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(countTrailingLines, 'name', { value: 'm', configurable: true });
  Object.defineProperty(countNodeSourceLines, 'name', { value: 'g', configurable: true });

  if (!this) {
    self;
  }
  var clientHeight,
    CodeMirror = requireModule('libraries/codemirror'),
    jquery =
      (requireModule('codemirror/active-line'),
      requireModule('codemirror/markdown-overlay'),
      requireModule('libraries/jquery')),
    documentModel = requireModule('model/document-model'),
    utilities = requireModule('shared/utilities'),
    markdownParser = requireModule('model/markdown-parser'),
    undoManager = requireModule('editing/undo-manager'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    sourceContainer = jquery('#marklyra-source'),
    sourceChanged = false,
    SourceModeController = Object.defineProperty(
      function (editor) {
        this.editor = editor;
        this.cm = null;
        this.inSourceMode = false;
        this.renderedHTML = '';
      },
      'name',
      { value: 'f', configurable: true },
    );
  function countTrailingLines(documentNode, defaultTrailingLines) {
    var trailingLines = 'number' == typeof documentNode ? documentNode : documentNode.get('tail');
    if (void 0 === trailingLines) {
      if (void 0 === defaultTrailingLines) {
        if (documentNode.get('after')) {
          return 1;
        } else {
          return 0;
        }
      } else {
        return defaultTrailingLines;
      }
    } else {
      return trailingLines;
    }
  }
  function countNodeSourceLines(documentNode, omitTrailingLines) {
    Object.defineProperty(countChildSourceLines, 'name', { value: 'n', configurable: true });
    Object.defineProperty(belongsToTightListItem, 'name', { value: 'i', configurable: true });

    function countChildSourceLines(inputDocumentNode, omitTrailingLines) {
      return inputDocumentNode
        .get('children')
        .toArray()
        .reduce(function (totalLines, childNode) {
          return totalLines + countNodeSourceLines(childNode, omitTrailingLines);
        }, 0);
    }
    function belongsToTightListItem(inputDocumentNode) {
      return (
        DocumentNode.isType(inputDocumentNode.get('parent'), NodeType.list_item) &&
        false !== inputDocumentNode.get('parent').get('tight')
      );
    }
    switch (documentNode.get('type')) {
      case NodeType.meta_block:
        return (
          2 + documentNode.get('text').match(/(\n|$)/g).length + countTrailingLines(documentNode)
        );
      case NodeType.heading:
        return (
          (documentNode.get('ahead') || 0) +
          ((
            documentNode.get('pattern') ||
            (!DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) &&
            (1 == File.option.headingStyle || 3 == File.option.headingStyle) &&
            documentNode.get('depth') <= 2
              ? '==='
              : '#')
          ).match(/[-=]/)
            ? 2
            : 1) +
          countTrailingLines(documentNode)
        );
      case NodeType.paragraph:
        var trailingBlankLines = documentNode.get('tail');
        if (omitTrailingLines || belongsToTightListItem(documentNode)) {
          trailingBlankLines = 0;
        }
        if (
          DocumentNode.isType(documentNode.get('after'), NodeType.paragraph) &&
          trailingBlankLines < 1
        ) {
          documentNode.unset('tail');
          trailingBlankLines = 1;
        }
        if (
          !(
            void 0 !== trailingBlankLines ||
            (!DocumentNode.isType(documentNode.get('after'), NodeType.math_block) &&
              documentNode.get('after'))
          )
        ) {
          trailingBlankLines = 0;
        }
        return (
          (documentNode.get('ahead') || 0) +
          (documentNode.get('text').split(/\n/g).length || 1) +
          countTrailingLines(
            void 0 === trailingBlankLines ? documentNode : trailingBlankLines,
            trailingBlankLines,
          )
        );
      case NodeType.blockquote:
        return (
          (documentNode.get('ahead') || 0) +
          countChildSourceLines(documentNode) +
          countTrailingLines(documentNode)
        );
      case NodeType.list:
        var listLineCount = documentNode.get('ahead') || 0;
        documentNode.isLoose(true);
        listLineCount += countChildSourceLines(documentNode);
        if (
          DocumentNode.isType(documentNode.get('after'), NodeType.list) &&
          (!documentNode.get('tail') || documentNode.get('tail')) < 2 &&
          documentNode.get('pattern') == documentNode.get('after').get('pattern') &&
          documentNode.get('style') == documentNode.get('after').get('style')
        ) {
          documentNode.unset('tail');
          listLineCount++;
          if (belongsToTightListItem(documentNode)) {
            listLineCount++;
          }
        }
        if (!omitTrailingLines) {
          listLineCount += countTrailingLines(
            documentNode,
            belongsToTightListItem(documentNode) || !documentNode.get('after') ? 0 : 1,
          );
        }
        return listLineCount;
      case NodeType.list_item:
        return documentNode.toMark().split(/\n/).length;
      case NodeType.html_block:
        return (
          (documentNode.get('ahead') || 1) +
          (documentNode.get('text').match(/\n/g) || []).length +
          countTrailingLines(documentNode)
        );
      case NodeType.fences:
        var match = /`|~/.exec(documentNode.get('pattern') || '```'),
          fenceBoundaryLines =
            (documentNode.get('noCloseTag') ? 1 : 2) + (documentNode.get('empty') ? 0 : 1);
        return (
          (documentNode.get('ahead') || 0) +
          (match ? fenceBoundaryLines : 1) +
          (documentNode.get('text').match(/\n/g) || []).length +
          countTrailingLines(documentNode)
        );
      case NodeType.math_block:
        return (
          (documentNode.get('ahead') || 0) +
          3 +
          (documentNode.get('text').match(/\n/g) || []).length +
          countTrailingLines(
            documentNode,
            DocumentNode.isType(documentNode.get('before'), NodeType.paragraph) &&
              DocumentNode.isType(documentNode.get('after'), NodeType.paragraph)
              ? 0
              : 1,
          )
        );
      case NodeType.hr:
        return (documentNode.get('ahead') || 0) + countTrailingLines(documentNode) + 1;
      case NodeType.toc:
        return (
          (documentNode.get('ahead') || 0) +
          (documentNode.get('pattern') || '').split(/\n/).length +
          countTrailingLines(documentNode)
        );
      case NodeType.def_footnote:
      case NodeType.def_link:
        return (
          (documentNode.get('ahead') || 0) +
          1 +
          countTrailingLines(
            documentNode,
            !documentNode.get('after') ||
              DocumentNode.isType(documentNode.get('after'), DocumentNode.TYPE.def_link)
              ? 0
              : 1,
          )
        );
      case NodeType.table:
        return (
          (documentNode.get('ahead') || 0) +
          documentNode.get('children').length +
          1 +
          countTrailingLines(documentNode)
        );
      case NodeType.table_row:
        if (documentNode.get('before')) {
          return 1;
        } else {
          return 2;
        }
      case NodeType.table_cell:
        return 0;
      default:
        return 1;
    }
  }
  SourceModeController.prototype.prep = function () {
    if (this.cm) {
      if (!this.cm.mode) {
        this.cm.setOption('mode', 'gfm');
      }
    } else {
      var receiver = this;
      this.cm = CodeMirror(
        document.querySelector('#marklyra-source'),
        {
          lineWrapping: true,
          mode: 'gfm',
          theme: 'marklyra-default',
          styleSelectedText: true,
          maxHighlightLength: 1 / 0,
          styleActiveLine: true,
          visibleSpace: true,
          viewportMargin: 100,
          autoCloseBrackets: !File.option.noPairingMatch,
          autoCloseTags: true,
          resetSelectionOnContextMenu: false,
          extraKeys: {
            Enter: 'newlineAndIndentContinueMarkdownList',
            Tab: 'autoIndentMarkdownList',
            'Shift-Tab': 'autoUnindentMarkdownList',
          },
          lineNumbers: true,
          dragDrop: false,
          indentUnit: File.option.codeIndentSize,
          tabSize: File.option.codeIndentSize,
          lineWiseCopyCut: File.option.lineWiseCopyCut,
        },
        this.editor,
      );
      sourceContainer.css('z-index', '2');
      var editor = this.editor;
      this.cm.on('changes', function (codeMirror, srcChanges) {
        editor.fences.handleUserReplacement(codeMirror, srcChanges);
        if (
          receiver.inSourceMode &&
          (document.querySelector('.on-search-panel-open') &&
            '+findReplace' !== srcChanges[0].origin &&
            'setValue' !== srcChanges[0].origin &&
            receiver.editor.searchPanel.closePanel(),
          File.isTypeWriterMode
            ? receiver.scrollAdjust()
            : srcChanges[0] && srcChanges[0].text.length > 2 && receiver.scrollAdjust(),
          'begin' !== srcChanges[0].origin && 'sync' !== srcChanges[0].origin)
        ) {
          sourceChanged = true;
          var historySize = File.editor.sourceView.cm.doc.historySize();
          JSBridge.menu.update({
            'Edit→Undo': { enabled: !File.isLocked && historySize.undo > 0 },
            'Edit→Redo': { enabled: !File.isLocked && historySize.redo > 0 },
          });
          if ('fromDisk' !== srcChanges[0].origin) {
            File.updateChangeCount(File.ChangeType.NSChangeDone);
          }
          editor.syncChange([{ type: 'sync', srcChanges: srcChanges }]);
          File.needsUpdateSnap();
        }
      });
      this.cm.on('contextmenu', function (codeMirror, contextEvent) {
        if (receiver.inSourceMode) {
          var cursorPosition = codeMirror.getCursor('from'),
            currentCursorPosition = codeMirror.getCursor('to');
          setTimeout(function () {
            (function (__marklyraSourceContextCM) {
              const __marklyraSourceContextSetter = __marklyraSourceContextCM.setSelection;
              return (function (
                __marklyraSourceContextAnchor,
                __marklyraSourceContextHead,
                __marklyraSourceContextOptions,
              ) {
                const __marklyraSourceContextReplay = window.__MARKLYRA_REPLAY_SOURCE_CONTEXT__;
                const __marklyraSourceContextExecute = () =>
                  Reflect.apply(__marklyraSourceContextSetter, __marklyraSourceContextCM, [
                    __marklyraSourceContextAnchor,
                    __marklyraSourceContextHead,
                    __marklyraSourceContextOptions,
                  ]);
                if (typeof __marklyraSourceContextReplay === 'function') {
                  return __marklyraSourceContextReplay(
                    __marklyraSourceContextCM,
                    contextEvent,
                    __marklyraSourceContextExecute,
                  );
                } else {
                  return __marklyraSourceContextExecute();
                }
              })(cursorPosition, currentCursorPosition, { scroll: false });
            })(codeMirror);
          }, 180);
          if (File.isNodeHtml) {
            File.editor.contextMenu.show(contextEvent);
          }
        }
      });
      var mousePressed = false,
        pendingScrollAdjust = false;
      this.cm.on('cursorActivity', function (codeMirror, cursorActivityEvent) {
        pendingScrollAdjust = false;
        if (receiver.inSourceMode) {
          if (File.isFocusMode) {
            editor.updateFocusMode(true);
          }
          if (!(codeMirror.curOp && !codeMirror.curOp.scrollToPos)) {
            if (File.isTypeWriterMode) {
              if (File.option.scrollWithCursor) {
                if (mousePressed) {
                  pendingScrollAdjust = true;
                } else {
                  receiver.scrollAdjust();
                }
              }
            } else {
              if (!mousePressed) {
                receiver.normalScrollAdjust();
              }
            }
          }
          if (File.isNodeHtml) {
            File.editor.contextMenu.hide(cursorActivityEvent);
          }
        }
      });
      this.cm.on('scrollCursorIntoView', function (unusedParameter1, event) {
        if (!(receiver.inSourceMode && !File.isTypeWriterMode)) {
          event.preventDefault();
        }
      });
      this.cm.display.scroller.addEventListener(
        'mousedown',
        function (unusedParameter1) {
          mousePressed = true;
        },
        true,
      );
      window.addEventListener('mouseup', function (unusedParameter1) {
        if (pendingScrollAdjust && mousePressed) {
          receiver.scrollAdjust();
        }
        pendingScrollAdjust = false;
        mousePressed = false;
      });
      this.cm.display.scroller.addEventListener(
        'wheel',
        function (wheelEvent) {
          if (!(Math.abs(wheelEvent.deltaY) < 4)) {
            if (File.isFocusMode && File.isTypeWriterMode) {
              editor.updateFocusMode(false);
            }
          }
        },
        { passive: true },
      );
    }
  };
  SourceModeController.prototype.show = function () {
    File.sync();
    var sourcePosition,
      markdown = this.editor.getMarkdown();
    try {
      sourcePosition = captureSourcePosition.call(this);
    } catch (error) {
      sourcePosition = null;
      console.warn(error.stack);
    }
    this.editor.refocus(null);
    this.editor.cleanTooltip();
    this.editor.searchPanel.closePanel(true);
    this.inSourceMode = true;
    if (File.isNode) {
      JSBridge.invoke('window.setInSourceMode', true);
    }
    jquery('body').addClass('marklyra-sourceview-on');
    var contentContainer = jquery('content');
    jquery('body').find('.md-tooltip-hide').hide();
    document.body.classList.remove('marklyra-show-notification');
    contentContainer.find('.auto-suggest-container.marklyra-show').removeClass('marklyra-show');
    this.renderedHTML = '';
    this.prep();
    this.cm.setValue(markdown, 'begin');
    sourceChanged = false;
    sourceContainer.show();
    restoreCodeMirrorPosition.call(this, sourcePosition);
    this.cm.refresh();
    this.cm.focus();
    this.cm.getDoc().clearHistory();
    this.cm.options.readOnly = File.isLocked;
    this.enableTypeWriterMode(File.isTypeWriterMode);
  };
  SourceModeController.prototype.enableTypeWriterMode = function (enabled) {
    if (this.cm) {
      if (enabled) {
        var lineHeight = this.cm.defaultTextHeight();
        clientHeight = document.querySelector('content').clientHeight;
        this.cm.display.lineSpace.parentNode.style.paddingTop =
          (clientHeight - lineHeight) / 2 + 'px';
        this.cm.display.lineSpace.parentNode.style.paddingBottom =
          (clientHeight - lineHeight) / 2 + 'px';
      } else {
        this.cm.display.lineSpace.parentNode.style.paddingTop = '';
        this.cm.display.lineSpace.parentNode.style.paddingBottom = '';
      }
      this.scrollAdjust();
    }
  };
  SourceModeController.prototype.setValue = function (text, markChanged, changeOrigin) {
    if (this.cm) {
      if (text != this.cm.getValue()) {
        this.cm.setValue(text, changeOrigin || 'begin');
      }
      if (markChanged) {
        sourceChanged = true;
      }
    }
  };
  SourceModeController.prototype.onSave = function () {
    this.cm.doc.history.lastModTime = 0;
  };
  SourceModeController.prototype.hide = function () {
    var editor = this.editor;
    editor.searchPanel.closePanel();
    jquery('body').removeClass('marklyra-sourceview-on');
    this.inSourceMode = false;
    if (File.isNode) {
      JSBridge.invoke('window.setInSourceMode', false);
    }
    var cursorPosition = this.cm.getCursor();
    cursorPosition.lineText = this.cm.getLine(cursorPosition.line);
    (function (sourcePosition) {
      var textSlice = sourcePosition.lineText.substring(0, sourcePosition.ch);
      sourcePosition.inRef =
        textSlice.match(openingBracketPattern) && !textSlice.match(closingBracketPattern);
      sourcePosition.textBefore = textSlice;
    })(cursorPosition);
    if (sourceChanged) {
      if (File.isMac && !File.isDocumentEdited() && this.renderedHTML) {
        console.debug('use renderedHTML');
        jquery(File.editor.sessionStr).html(this.renderedHTML);
        setTimeout(function () {
          File.editor.refresh();
        }, 500);
        File.editor.syncChange([
          {
            type: 'sync',
            allHtml: this.renderedHTML,
            json: undoManager.buildAllDoc(File.editor.nodeMap).json,
          },
        ]);
      } else {
        console.debug('reloadContent');
        File.reloadContent(this.cm.getValue(File.useCRLF ? '\r\n' : '\n'), {
          delayRefresh: true,
          skipChangeCount: true,
          skipStore: true,
        });
      }
    } else {
      File.editor.tryEnterBusyMode(this.cm.getValue());
    }
    sourceContainer.hide();
    restoreRichTextPosition.call(this, cursorPosition);
    editor.selection.scrollAdjust();
    window.Reporter.fullValidate();
  };
  SourceModeController.prototype.scrollAdjust = function () {
    var scrollInfo = this.cm.getScrollInfo(),
      cursorPosition = this.cm.getCursor(),
      top = this.cm.charCoords(cursorPosition, 'local').top,
      halfViewportHeight = scrollInfo.clientHeight / 2;
    this.cm.scrollTo(null, top - halfViewportHeight - 5);
  };
  SourceModeController.prototype.normalScrollAdjust = function () {
    var scrollInfo = this.cm.getScrollInfo(),
      cursorPosition = this.cm.getCursor(),
      bottom = this.cm.charCoords(cursorPosition, 'local').bottom;
    if (scrollInfo.clientHeight + scrollInfo.top - 59 < bottom) {
      this.cm.scrollTo(null, scrollInfo.top + 60);
    }
  };
  var openingBracketPattern = /\[/,
    closingBracketPattern = /\]/;
  var focusNodeSourcePosition = Object.defineProperty(
      function (editor, documentNode, itemIndex, sourcePosition) {
        Object.defineProperty(sourceColumnOffset, 'name', { value: 'o', configurable: true });

        var embeddedCodeMirror = null;
        function sourceColumnOffset(searchValue, fromStart, baseOffset) {
          if (void 0 === baseOffset) {
            baseOffset =
              (baseOffset = fromStart
                ? sourcePosition.lineText.indexOf(searchValue)
                : sourcePosition.lineText.lastIndexOf(searchValue)) < 0
                ? 0
                : baseOffset;
          }
          return Math.max(0, sourcePosition.ch - baseOffset);
        }
        var nodeElement = editor.findElemById(documentNode.cid);
        switch (documentNode.get('type')) {
          case NodeType.paragraph:
            for (
              var parts = documentNode.get('text').split(/\n/),
                precedingTextLength = 0,
                currentItemIndex = 0;
              currentItemIndex < itemIndex && currentItemIndex < parts.length;
              currentItemIndex++
            ) {
              precedingTextLength += parts[currentItemIndex].length + 1;
            }
            nodeElement.find('.md-math-after-sym, .md-emoji-control-ch').text('');
            editor.undo.exeCommand({
              type: 'cursor',
              id: documentNode.cid,
              start: precedingTextLength + sourceColumnOffset(parts[itemIndex]),
            });
            nodeElement.find('.md-math-after-sym, .md-emoji-control-ch').text('​');
            break;
          case NodeType.heading:
            nodeElement.find('.md-math-after-sym, .md-emoji-control-ch').text('');
            editor.undo.exeCommand({
              type: 'cursor',
              id: documentNode.cid,
              start: (function (offsetCorrections, sourceOffset) {
                var correctedOffset = sourceOffset;
                for (var correctionIndex in offsetCorrections) {
                  if (void 0 !== correctionIndex && correctionIndex <= sourceOffset) {
                    correctedOffset += offsetCorrections[correctionIndex];
                  }
                }
                return correctedOffset;
              })(documentNode.cursorDiff || [], sourceColumnOffset(documentNode.get('text'))),
            });
            nodeElement.find('.md-math-after-sym, .md-emoji-control-ch').text('​');
            break;
          case NodeType.hr:
          case NodeType.toc:
            if (documentNode.get('after')) {
              editor.selection.jumpIntoElemBegin(
                editor.findElemById(documentNode.get('after').getVeryFirst().cid),
              );
            } else {
              editor.selection.selectNode(documentNode);
            }
            break;
          case NodeType.math_block:
            embeddedCodeMirror = editor.mathBlock.startEditing(documentNode.cid);
            itemIndex--;
            break;
          case NodeType.html_block:
            embeddedCodeMirror = editor.htmlBlock.startEditing(documentNode.cid);
            break;
          case NodeType.fences:
            if ((documentNode.get('pattern') || '```').match(/`/)) {
              itemIndex--;
            }
            embeddedCodeMirror = editor.fences.getCm(documentNode.cid);
            break;
          case NodeType.def_link:
          case NodeType.def_footnote:
            if (sourcePosition.inRef) {
              editor.undo.exeCommand({
                type: 'cursor',
                id: documentNode.cid,
                start: sourceColumnOffset(documentNode.get('ref'), true),
              });
            } else {
              var match = new RegExp(
                  '(]:\\s*)' +
                    utilities.escapeRegExp(documentNode.get('href') || documentNode.get('text')),
                ).exec(sourcePosition.lineText),
                start = match ? match.index + match[1].length : 0;
              editor.undo.exeCommand({
                type: 'cursor',
                id: documentNode.cid,
                start: documentNode.get('ref').length + sourceColumnOffset(void 0, void 0, start),
              });
            }
            break;
          case NodeType.meta_block:
            for (
              parts = documentNode.get('text').split(/\n/),
                start = sourcePosition.ch,
                currentItemIndex = 0;
              currentItemIndex < itemIndex - 1;
              currentItemIndex++
            ) {
              start += (parts[currentItemIndex] || '').length + 1;
            }
            editor.undo.exeCommand({ type: 'cursor', id: documentNode.cid, start: start });
            break;
          case NodeType.table_row:
            !(function (tablePosition) {
              var textBefore = tablePosition.textBefore;
              tablePosition.cellsBefore = markdownParser.splitTableCell(
                textBefore.replace(/^\s*\|/, ''),
                true,
              ) || [textBefore];
              tablePosition.cellsOffset = tablePosition.cellsBefore.last().length;
              tablePosition.cellsBefore = tablePosition.cellsBefore.length;
            })(sourcePosition);
            editor.undo.exeCommand({
              type: 'cursor',
              id: documentNode.getNthChild(Math.max(0, sourcePosition.cellsBefore - 1)).cid,
              start: sourcePosition.cellsOffset,
            });
            break;
          default:
            editor.selection.jumpIntoElemEnd(
              editor.findElemById(documentNode.getVeryFirst(true).cid),
            );
        }
        if (embeddedCodeMirror) {
          embeddedCodeMirror.focus();
          if (itemIndex >= embeddedCodeMirror.lineCount()) {
            embeddedCodeMirror.execCommand('goDocEnd');
          } else {
            embeddedCodeMirror.setCursor({
              line: itemIndex,
              ch: sourceColumnOffset(embeddedCodeMirror.getLine(itemIndex)),
            });
          }
        }
      },
      'name',
      { value: 'b', configurable: true },
    ),
    locateSourceLine = Object.defineProperty(
      function (editor, documentNode, line, sourcePosition) {
        var currentDocumentNode,
          nodeLineCount = 0;
        for (
          line + (documentNode.get('ahead') || 0) > sourcePosition.line &&
            editor.selection.jumpIntoElemBegin(
              editor.findElemById(documentNode.getVeryFirst().cid),
            ),
            nodeLineCount = countNodeSourceLines(documentNode);
          documentNode.get('after') && line + nodeLineCount <= sourcePosition.line;
        ) {
          line += nodeLineCount;
          nodeLineCount = countNodeSourceLines((documentNode = documentNode.get('after')));
        }
        if (
          documentNode.get('children').length &&
          !DocumentNode.isType(documentNode, NodeType.table_row)
        ) {
          locateSourceLine(
            editor,
            documentNode.getFirstChild(),
            line + (documentNode.get('ahead') || 0),
            sourcePosition,
          );
        } else {
          if (
            line +
              nodeLineCount -
              ((currentDocumentNode = documentNode),
              DocumentNode.isType(currentDocumentNode, NodeType.table_row)
                ? 0
                : countTrailingLines(currentDocumentNode)) >
            sourcePosition.line
          ) {
            focusNodeSourcePosition(
              editor,
              documentNode,
              sourcePosition.line - line - (documentNode.get('ahead') || 0),
              sourcePosition,
            );
          } else {
            editor.selection.jumpIntoElemEnd(
              editor.findElemById(documentNode.getVeryFirst(true).cid),
            );
          }
        }
      },
      'name',
      { value: 'w', configurable: true },
    );
  SourceModeController.prototype.gotoLine = function (sourcePosition) {
    var editor = this.editor;
    try {
      locateSourceLine(editor, editor.nodeMap.getFirst(), 0, sourcePosition);
    } catch (error) {
      console.warn(error.stack);
    }
  };
  var restoreRichTextPosition = Object.defineProperty(
      function (sourcePosition) {
        var editor = this.editor;
        try {
          locateSourceLine(editor, editor.nodeMap.getFirst(), 0, sourcePosition);
        } catch (error) {
          console.warn(error.stack);
        }
        editor.refocus();
      },
      'name',
      { value: 'x', configurable: true },
    ),
    captureSourcePosition = Object.defineProperty(
      function (position) {
        if (this.editor.focusCid) {
          var nodeElement = this.editor.findElemById(this.editor.focusCid),
            documentNode = this.editor.getNode(this.editor.focusCid),
            line = 0,
            text = '',
            columnPatternPrefix = '',
            range = this.editor.selection.getRangy();
          if (documentNode) {
            line =
              Object.defineProperty(
                function countPrecedingSourceLines(inputDocumentNode, precedingLineCount) {
                  precedingLineCount = precedingLineCount || 0;
                  if (inputDocumentNode) {
                    if (inputDocumentNode.get('before')) {
                      return countPrecedingSourceLines(
                        inputDocumentNode.get('before'),
                        precedingLineCount + countNodeSourceLines(inputDocumentNode.get('before')),
                      );
                    } else {
                      if (inputDocumentNode.get('parent')) {
                        return countPrecedingSourceLines(
                          inputDocumentNode.get('parent'),
                          precedingLineCount + (inputDocumentNode.get('parent').get('ahead') || 0),
                        );
                      } else {
                        return precedingLineCount;
                      }
                    }
                  } else {
                    return precedingLineCount;
                  }
                },
                'name',
                { value: 'e', configurable: true },
              )(documentNode) + (documentNode.get('ahead') || 0);
            if (DocumentNode.isType(documentNode, NodeType.fences)) {
              var indentedCode = !/`|~/.exec(documentNode.get('pattern') || '```');
              if (!indentedCode) {
                line++;
              }
              (position = document.activeElement.classList.contains('marklyra-cm-lang-input')
                ? { line: -1, before: documentNode.get('pattern') || '```' }
                : this.editor.fences.getCm(documentNode.cid).doc.getCursor()).before =
                (indentedCode ? documentNode.get('pattern') : '') +
                this.editor.fences
                  .getCm(documentNode.cid)
                  .getLine(position.line)
                  .substring(0, position.ch);
              position.line = position.line + line;
              position.ch = void 0;
              return position;
            }
            if (DocumentNode.isType(documentNode, NodeType.math_block)) {
              if (this.editor.mathBlock.currentCm) {
                (position = this.editor.mathBlock.currentCm.doc.getCursor()).line =
                  position.line + line + 1;
                return position;
              } else {
                return { line: line, ch: -1 };
              }
            }
            if (DocumentNode.isType(documentNode, NodeType.toc)) {
              return { line: line, before: ']' };
            }
            if (DocumentNode.isType(documentNode, NodeType.hr)) {
              return { line: line, before: this.get('pattern') || '------' };
            }
            if (DocumentNode.isType(documentNode, NodeType.def_link, NodeType.def_footnote)) {
              var currentElement,
                element = this.editor.getJQueryElem(range.startContainer);
              if ((currentElement = element.closest('.md-def-content')).length) {
                range.setStartBefore(currentElement[0]);
                return { line: line, before: (text = ']: ' + range.toString()) };
              }
              if (
                (currentElement = element.closest('.md-def-title')).length &&
                element.text().length
              ) {
                range.setStartBefore(currentElement[0]);
                return { line: line, before: (text = '"' + range.toString()) };
              }
            }
            if (DocumentNode.isType(documentNode, NodeType.table, NodeType.table_row)) {
              return { line: line, ch: -1 };
            }
            range.setStartBefore(nodeElement[0]);
            text = jquery(range.toHtml()).rawText();
            if (DocumentNode.isType(documentNode, NodeType.table_cell)) {
              for (
                columnPatternPrefix = '', documentNode = documentNode.get('before');
                documentNode;
              ) {
                columnPatternPrefix = '\\|[^|]*' + columnPatternPrefix;
                documentNode = documentNode.get('before');
              }
              return {
                line: line,
                beforeRegExp: (text =
                  columnPatternPrefix + '\\|\\s*' + utilities.escapeRegExp(text)),
              };
            }
            if (DocumentNode.isType(documentNode, NodeType.meta_block)) {
              return {
                line: (line =
                  ((text = text.replace(/^---/gm, '​---').replace(/\n$/g, '')).match(/\n/g) || [])
                    .length + 1),
                before: (text = text.substring(text.lastIndexOf('\\n'))),
              };
            }
            if (DocumentNode.isType(documentNode, NodeType.html_block)) {
              if (this.editor.htmlBlock.currentCm) {
                (position = this.editor.htmlBlock.currentCm.doc.getCursor()).line =
                  position.line + line;
                return position;
              } else {
                return { line: line + 2, ch: -1 };
              }
            }
            if (
              '' === text &&
              DocumentNode.isType(documentNode, NodeType.paragraph, NodeType.heading)
            ) {
              if (DocumentNode.isType(documentNode, NodeType.heading)) {
                var markdown = documentNode.toMark();
                if (/^\s*#/.exec(markdown)) {
                  return { line: line, beforeRegExp: '^\\s*#+\\s*' };
                }
              }
              var topBlock = documentNode.getTopBlock();
              if (DocumentNode.isType(topBlock, NodeType.list, NodeType.blockquote)) {
                return { line: line, ch: 0, afterIndent: true };
              }
            }
            var textLines = text.split(/\n/) || [text];
            text = textLines.last();
            return {
              line: line + textLines.length - 1,
              before: text.replace(/(\u200B*):(\u200B*)/g, ':').replace(/\u200B\$/g, '$'),
            };
          }
        }
      },
      'name',
      { value: 'C', configurable: true },
    ),
    restoreCodeMirrorPosition = Object.defineProperty(
      function (position) {
        if (position) {
          try {
            var characterOffset = position.ch;
            if (position.line < 0) {
              position.line = this.cm.doc.lineCount() - 1;
            }
            if (position.afterIndent) {
              var lineText = this.cm.doc.getLine(position.line);
              characterOffset = (/^((\s+)|([-+*]\s)|(\[( |x)\])|>|(\d+(\.|\))\s))+/i.exec(
                lineText,
              ) || [''])[0].length;
            }
            if (void 0 === characterOffset) {
              lineText = this.cm.doc.getLine(position.line) || '';
              if (position.before) {
                characterOffset = lineText.indexOf(position.before) + position.before.length;
              } else {
                if (position.beforeRegExp) {
                  var regex = new RegExp(position.beforeRegExp, 'g');
                  regex.exec(lineText);
                  characterOffset = regex.lastIndex;
                }
              }
            }
            this.cm.doc.setCursor({
              line: position.line,
              ch: characterOffset > 0 ? characterOffset : 0,
            });
            if (characterOffset < 0) {
              this.cm.execCommand('goLineEnd');
            }
          } catch (error) {
            console.warn(error.stack);
          }
        }
      },
      'name',
      { value: 'F', configurable: true },
    );
  moduleRecord.exports = SourceModeController;
}
