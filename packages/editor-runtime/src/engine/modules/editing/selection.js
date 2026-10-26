// editing/selection.
export default function initializeEditingSelection(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(cancelNativeScrollEvent, 'name', { value: 'v', configurable: true });

  if (!this) {
    self;
  }
  var timerId,
    utilities = requireModule('shared/utilities'),
    jquery = requireModule('libraries/jquery'),
    rangy = requireModule('libraries/rangy'),
    CodeMirror = requireModule('libraries/codemirror'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    map = requireModule('editing/keyboard-shortcuts').map,
    NodeType = DocumentNode.TYPE,
    WESTERN_WORD_SPLITTER = utilities.WESTERN_WORD_SPLITTER;
  window.setAttributeOnlyNeeded = function (element, attributeName, attributeValue) {
    if (element.getAttribute(attributeName) != attributeValue) {
      if (
        'true' == attributeValue &&
        'write' == element.id &&
        '<p>&nbsp;</p>' == element.children[0].outerHTML
      ) {
        return;
      }
      element.setAttribute(attributeName, attributeValue);
      if ('write' === element.id && File.isNode && 'false' === attributeValue) {
        var listItems = jquery('.md-list-item');
        listItems.css('display', 'block');
        setTimeout(() => {
          listItems.css('display', 'list-item');
        }, 0);
      }
      if (
        'write' == element.id &&
        'false' == attributeValue &&
        File.editor &&
        File.editor.selection
      ) {
        var domNode = document.activeElement;
        if (domNode && DocumentNode.isType(domNode.tagName, 'INPUT', 'TEXTAREA')) {
          return;
        }
        if (domNode && domNode.classList && domNode.classList.contains('marklyra-input')) {
          return;
        }
        var range = File.editor.selection.getRangy(),
          currentDomNode = range && range.startContainer,
          localElement = currentDomNode && currentDomNode.parentElement;
        if (localElement) {
          var currentElement = localElement.closest('[contenteditable]');
          if (currentElement && 'false' != currentElement.getAttribute('contenteditable')) {
            currentElement.focus();
            File.editor.selection.setRange(range);
          }
        }
      }
      return true;
    }
  };
  var currentLeft,
    clientHeight,
    SelectionController = Object.defineProperty(
      function (inputEditor) {
        this.rangy = rangy;
        rangy.init();
        this.savedSel = {};
        this.editor = inputEditor;
        jquery(document).on('selectionchange', function (unusedParameter1) {
          if (inputEditor.writingArea.contains(document.activeElement)) {
            this.selectionBeforeBlur = null;
          }
          if (
            inputEditor.selection.selectWordTime &&
            new Date() - inputEditor.selection.selectWordTime > 200
          ) {
            inputEditor.selection.selectWordTime = null;
          }
        });
        this.updateMetrics();
        jquery('#write')
          .on('mouseleave', (blurEvent) => {
            if (document.activeElement == blurEvent.currentTarget) {
              if (!this.selectionBeforeBlur) {
                this.selectionBeforeBlur = this.buildUndo();
              }
            }
          })
          .on('cursorChange', () => {
            this.selectionBeforeBlur = null;
          });
      },
      'name',
      { value: 'm', configurable: true },
    ),
    scrollTop = jquery.fn.scrollTop;
  function cancelNativeScrollEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }
  jquery.fn.oldScrollTop = scrollTop;
  jquery.fn.scrollTop = function (inputScrollTop) {
    if (null !== inputScrollTop) {
      if (void 0 === inputScrollTop) {
        return (this[0] || {}).scrollTop;
      } else {
        (this[0] || {}).scrollTop = inputScrollTop;
        return inputScrollTop;
      }
    }
  };
  jquery(document.body)
    .on('hidden.bs.modal', '.modal', function (unusedParameter1) {
      File.editor.restoreLastCursor();
    })
    .on('.show.bs.modal', '.modal', function () {
      var lastCursor = File.editor.selection.buildUndo();
      if (lastCursor) {
        File.editor.lastCursor = lastCursor;
      }
    });
  rangy.rangePrototype.insertNodeAtEnd = function (insertedNode) {
    var endRange = this.cloneRange();
    endRange.collapse(false);
    endRange.insertNode(insertedNode);
    endRange.detach();
    this.setEndAfter(insertedNode);
  };
  jquery(window).on('resize', function () {
    if (!File.suppressResize) {
      clientHeight = document.querySelector('content').clientHeight;
    }
  });
  SelectionController.prototype = {
    clearGlobalColumn: function () {
      currentLeft = void 0;
    },
    updateMetrics: function () {
      clientHeight = document.querySelector('content').clientHeight;
      var defaultTextHeight = this.editor.defaultTextHeight;
      this.editor.defaultTextHeight = parseInt(jquery('#write p').css('line-height'));
      if (!(!isNaN(this.editor.defaultTextHeight) && this.editor.defaultTextHeight)) {
        this.editor.defaultTextHeight = defaultTextHeight;
      }
    },
    jumpIntoElemBegin: function (element, deferRefocus) {
      try {
        var receiver = this,
          currentEditor = this.editor,
          codeMirrorElement = element.find('.CodeMirror')[0],
          childBlocks = element.children('[mdtype]');
        if (!element || !element.length) {
          console.sendError('cannot jumpIntoElemBegin to empty elem', 'warning');
          window.getSelection().removeAllRanges();
          return false;
        }
        if (element.length > 1) {
          element = jquery(element[0]);
        }
        if (codeMirrorElement) {
          codeMirrorElement.CodeMirror.focus();
          return codeMirrorElement.CodeMirror.execCommand('goDocStart');
        }
        if (focusBlockBoundary(currentEditor, false, currentEditor.findNodeByElem(element))) {
          return;
        }
        if (
          DocumentNode.isType(
            element.attr('mdtype'),
            DocumentNode.TYPE.image,
            DocumentNode.TYPE.hr,
            DocumentNode.TYPE.math_block,
          )
        ) {
          return this.selectNode(null, element);
        }
        if (element.hasClass('footnotes')) {
          return this.jumpIntoElemBegin(element.find('.md-def-name'));
        }
        if (childBlocks.length) {
          return this.jumpIntoElemBegin(jquery(childBlocks[0]), deferRefocus);
        }
        var range = rangy.createRange();
        if (element[0].querySelector('[md-inline]')) {
          element[0].querySelector('[md-inline]').classList.add('md-expand');
        }
        range.setStart(element[0], 0);
        range.setEnd(element[0], 0);
        this.deRange(range);
        receiver.setRange(range, true);
        if (deferRefocus) {
          setTimeout(function () {
            receiver.setRange(range, true);
            receiver.editor.refocus();
          }, 20);
        } else {
          if (!window.getSelection().anchorNode && element.length) {
            !Object.defineProperty(
              function collapseRangeToFirstLeaf(domNode) {
                if (3 == domNode.nodeType) {
                  range.setStart(domNode, 0);
                  range.setEnd(domNode, 0);
                } else {
                  if (domNode.childNodes.length) {
                    collapseRangeToFirstLeaf(domNode.childNodes[0]);
                  } else {
                    range.setStart(domNode, 0);
                    range.setEnd(domNode, 0);
                  }
                }
              },
              'name',
              { value: 'e', configurable: true },
            )(element[0]);
            window.getSelection().addRange(range.nativeRange);
          }
        }
        return window.getSelection().anchorOffset;
      } catch (error) {
        console.sendError('cursor may go wrong', false);
        Reporter.error('cursor may go wrong', {
          level: 'warning',
          filename: 'Selection.js',
          extra: { dom: element && Reporter.sanitizeDom(element[0]) },
        });
      }
    },
    jumpIntoElemEnd: function (element, deferRefocus) {
      var codeMirrorElement = element.find('.CodeMirror')[0];
      if (element.length > 1) {
        element = jquery(element[0]);
      }
      if (codeMirrorElement) {
        codeMirrorElement.CodeMirror.execCommand('goDocEnd');
      } else {
        if (focusBlockBoundary(this.editor, true, this.editor.findNodeByElem(element))) {
          return;
        }
        if (
          DocumentNode.isType(
            element.attr('mdtype'),
            DocumentNode.TYPE.image,
            DocumentNode.TYPE.hr,
            DocumentNode.TYPE.math_block,
          )
        ) {
          return this.selectNode(null, element);
        }
        if (element.children('[mdtype]').length) {
          return this.jumpIntoElemEnd(jquery(element.children('[mdtype]')[0]), deferRefocus);
        }
        if (element.hasClass('md-def-footnote')) {
          var range = rangy.createRange();
          range.setStart(element.find('.md-def-content')[0], 1);
          range.setEnd(element.find('.md-def-content')[0], 1);
          this.deRange(range, true);
        } else {
          element.addClass('md-expand');
          this.restoreSelection(element[0], element.text().length);
          element.removeClass('md-expand');
        }
      }
    },
    jumpInto: function (element, offset) {
      if ('' == element.text()) {
        return this.jumpIntoElemBegin(element);
      }
      this.restoreSelection(element[0], offset);
    },
    fixUnselectableRange: function (range, checkOnly) {
      if (!range || !range.collapse) {
        return false;
      }
      var domNode = (range.startContainer.childNodes || [])[range.startOffset];
      return (
        !(!domNode || 'IMG' != domNode.tagName) &&
        (!!checkOnly ||
          (range.setStart(
            domNode.previousElementSibling,
            domNode.previousElementSibling.childNodes.length - 1,
          ),
          range.collapse(true),
          true))
      );
    },
    setRange: function (range, skipExpansion) {
      if (range) {
        this.selectionBeforeBlur = null;
        this.fixUnselectableRange(range);
        if (!skipExpansion) {
          var element = this.editor.brush.closestExpandable(jquery(range.startContainer)),
            currentElement = this.editor.brush.closestExpandable(jquery(range.endContainer));
          if (
            !(
              currentElement.is(element.next()) &&
              element.hasClass('md-image') &&
              range.endContainer.length == range.endOffset
            )
          ) {
            element.addClass('md-expand');
          }
          currentElement.addClass('md-expand');
        }
        if (
          range.commonAncestorContainer &&
          range.commonAncestorContainer.getAttribute &&
          'linebreak' == range.commonAncestorContainer.getAttribute('md-inline') &&
          '\n' == range.toString()
        ) {
          range.collapse(true);
        }
        if (File.isTypeWriterMode && File.option.scrollWithCursor) {
          timerId = setTimeout(() => {
            this.typeWriterScroll();
          }, 180);
        }
        this.rangy.getSelection().setSingleRange(range, range.isBackward);
        this.editor.wordCount.updateInSelection(this.getTextInSelection(range));
        jquery(this.editor.sessionStr).trigger('cursorChange');
      }
    },
    getOffset: function (containerNode, selectionRange) {
      if (selectionRange && !selectionRange.nativeRange) {
        selectionRange = this.wrappedRange(selectionRange);
      }
      if ((selectionRange = selectionRange || this.getRangy())) {
        try {
          if (void 0 !== containerNode.length) {
            containerNode = containerNode[0];
          }
          return selectionRange.getBookmark(containerNode).start;
        } catch (error) {}
      }
      return 0;
    },
    restoreEdge: function (containerNode, start, restoreEnd, existingRange) {
      if (containerNode.jquery) {
        containerNode = containerNode.length ? containerNode[0] : null;
      }
      var targetRange = existingRange,
        range = rangy.createRange();
      if (containerNode) {
        range.moveToBookmark({ containerNode: containerNode, start: start, end: start });
        if (targetRange) {
          if (restoreEnd) {
            targetRange.setEnd(range.endContainer, range.endOffset);
          } else {
            targetRange.setStart(range.startContainer, range.startOffset);
          }
          return targetRange;
        } else {
          return range;
        }
      } else {
        return targetRange || range;
      }
    },
    saveSelection: function (containerNode, selectionRange) {
      if (containerNode) {
        if (containerNode.jquery) {
          containerNode = containerNode[0];
        }
        if ((selectionRange = selectionRange || this.getRangy())) {
          this.savedSel = selectionRange.getBookmark(containerNode);
          return this.savedSel;
        } else {
          return void 0;
        }
      }
    },
    restoreSelection: function (element, start) {
      if (!element) {
        return window.getSelection().removeAllRanges();
      }
      if (element.jquery) {
        element = element[0];
      }
      if (!element) {
        return window.getSelection().removeAllRanges();
      }
      var wasNonEditable = 'false' === element.getAttribute('contenteditable');
      if (void 0 === start || null === start || '' === start) {
        start = this.savedSel;
      } else {
        if ('number' == typeof start) {
          start = { start: start, end: start };
        }
      }
      if (!getEmbeddedCodeMirror(this.editor, element, start.start)) {
        var range = rangy.createRange();
        range.moveToBookmark({ start: start.start, end: start.end, containerNode: element });
        if (range.endContainer == element && 0 == range.endOffset && start.end > 0) {
          var length = element.rawText().length;
          if (start.end > length) {
            range.moveToBookmark({
              start: Math.min(start.start, length),
              end: Math.min(start.end, length),
              containerNode: element,
            });
          }
        }
        if (
          'BODY' == document.activeElement.tagName ||
          ('write' !== document.activeElement.id && document.activeElement.hasAttribute('tabindex'))
        ) {
          var scrollTop = jquery('content').scrollTop();
          this.editor.writingArea.focus();
          jquery('content').scrollTop(scrollTop);
        }
        if (range.collapsed) {
          this.deRange(range);
        }
        if (wasNonEditable) {
          element.setAttribute('contenteditable', 'true');
        }
        this.setRange(range);
        if (
          !(
            !wasNonEditable ||
            element.classList.contains('md-def-link') ||
            element.classList.contains('md-def-footnote')
          )
        ) {
          element.setAttribute('contenteditable', 'false');
        }
        return range;
      }
    },
    getVeryFirstElem: function (element) {
      if (element.children('[cid]').length > 0) {
        return this.getVeryFirstElem(element.children('[cid]').first());
      } else {
        return element;
      }
    },
    getVeryLastElem: function (element) {
      if (element.children('[cid]').length > 0) {
        return this.getVeryLastElem(element.children('[cid]').last());
      } else {
        return element;
      }
    },
    getSelection: function () {
      return this.rangy.getSelection();
    },
    prepNode: function (text, event, preserveSelection, isComposition) {
      var editCommand,
        currentEditor = this.editor,
        range = this.getRangy(),
        UndoManager = this.editor.undo.UndoManager,
        SnapFlag = UndoManager.SnapFlag,
        hasSelection = range && !range.collapsed;
      if (
        !(function () {
          if (isComposition && hasSelection && File.isWin) {
            var element = range.commonAncestorContainer.closest
              ? range.commonAncestorContainer
              : range.commonAncestorContainer.parentElement;
            if ((element = element.closest('[cid]')) && !element.querySelector('[cid]')) {
              currentEditor.undo.addSnap(element.getAttribute('cid'), SnapFlag.NONE);
              currentEditor.brush.addToQueue(element.getAttribute('cid'));
              return true;
            }
          }
        })()
      ) {
        currentLeft = void 0;
        if (File.inBusyMode) {
          setAttributeOnlyNeeded(this.editor.writingArea, 'contenteditable', 'false');
        }
        try {
          if (hasSelection) {
            if (preserveSelection) {
              return editCommand;
            }
            if (currentEditor.UserOp.surroundPair(currentEditor, text, range)) {
              return void (event && event.preventDefault());
            }
            editCommand = currentEditor.UserOp.backspaceHandler(
              currentEditor,
              null,
              'delSelection',
              true,
              true,
            );
          }
          range = this.getRangy();
          var currentDocumentNodeInstance,
            pairHandled,
            selection = this.rangy.getSelection(),
            atAnchorEnd = selection.anchorOffset == rangy.dom.getNodeLength(selection.anchorNode),
            localElement = currentEditor.getJQueryElem(selection.anchorNode),
            blockElement = currentEditor.getMarkElem(selection.anchorNode),
            documentNode = currentEditor.findNodeByElem(blockElement),
            selectionBookmark = range.getBookmark(blockElement[0]);
          if (localElement[0] == this.editor.writingArea) {
            if (0 != range.startOffset) {
              selection.removeAllRanges();
              return void (event && event.preventDefault());
            }
            this.jumpTop();
          }
          if (localElement.hasClass('marklyra-input') || !documentNode) {
            return;
          }
          if (!(editCommand || preserveSelection)) {
            currentEditor.undo.addSnap(documentNode.cid, SnapFlag.NONE);
            currentEditor.brush.addToQueue(documentNode.cid);
          }
          if (File.inBusyMode) {
            var currentElement = localElement.closest("[contenteditable='true']");
            if (document.activeElement !== currentElement[0]) {
              currentElement.focus();
            }
          }
          if (localElement.hasClass('md-def-url') && (text.match(/\s/g) || []).length) {
            if (atAnchorEnd) {
              this.jumpIntoElemBegin(blockElement.find('.md-def-title'));
            }
            return event && event.preventDefault();
          }
          if (!preserveSelection && editCommand) {
            var nodeId = blockElement.attr('cid'),
              snapshotFlag = text.length > 1 ? SnapFlag.REPLACE : SnapFlag.ADD;
            editCommand.source = nodeId + '#' + snapshotFlag;
            editCommand.date = new Date();
          }
          (blockElement.is('.unholdable') ? blockElement : blockElement.closest('.unholdable'))
            .find('.math-jax-postprocess>.md-math-after-sym')
            .text('');
          if (DocumentNode.isType(documentNode, NodeType.def_link, NodeType.def_footnote)) {
            if (blockElement[0] == localElement[0] && range.collapsed) {
              return void this.jumpIntoElemBegin(blockElement.find('.md-def-name'));
            }
          } else {
            if (
              !(
                documentNode.get('type') == NodeType.meta_block ||
                documentNode.get('type') == NodeType.fences
              )
            ) {
              if (documentNode.isBlock() && documentNode.canNotDirectEdit()) {
                window.getSelection().removeAllRanges();
                if (event) {
                  event.preventDefault();
                }
              } else {
                if (localElement.hasClass('md-image')) {
                  if (!(1 != range.startOffset || localElement.prev().length)) {
                    localElement.before('​');
                    range.setStartBefore(localElement.parent());
                    selection.setSingleRange(range);
                  }
                }
              }
            }
          }
          if (documentNode.get('children').length) {
            console.debug('wrong cursor');
            var childNodes = window.getSelection().anchorNode.childNodes,
              anchorOffset = window.getSelection().anchorOffset,
              previousChild = anchorOffset > 0 ? childNodes[anchorOffset - 1] : null,
              followingChild = anchorOffset < childNodes.length ? childNodes[anchorOffset] : null,
              currentDocumentNode = currentEditor.findNodeByElem(
                previousChild ? currentEditor.getMarkElem(previousChild) : [],
              ),
              localDocumentNode = currentEditor.findNodeByElem(
                followingChild ? currentEditor.getMarkElem(followingChild) : [],
              );
            text = text.replace(/\u200B/g, '');
            if (DocumentNode.isType(localDocumentNode, documentModel.TYPE.table)) {
              currentEditor.undo.endSnap(true);
              editCommand = editCommand || UndoManager.makeEmptyCommand();
              var documentNodeInstance = new DocumentNode({
                type: documentModel.TYPE.paragraph,
                text: text,
                in: localDocumentNode.get('in'),
              });
              localDocumentNode.addBefore(documentNodeInstance);
              UndoManager.addUndoForInsert(editCommand, documentNodeInstance);
              currentEditor
                .findElemById(localDocumentNode.id)
                .before(documentNodeInstance.toHTML());
              currentEditor.selection.restoreSelection(
                currentEditor.findElemById(documentNodeInstance.id)[0],
                text.length,
              );
              currentDocumentNodeInstance = documentNodeInstance;
            } else {
              if (DocumentNode.isType(currentDocumentNode, documentModel.TYPE.table)) {
                currentEditor.undo.endSnap(true);
                editCommand = editCommand || UndoManager.makeEmptyCommand();
                documentNodeInstance = new DocumentNode({
                  type: documentModel.TYPE.paragraph,
                  text: text,
                  in: currentDocumentNode.get('in'),
                });
                currentDocumentNode.addAfter(documentNodeInstance);
                UndoManager.addUndoForInsert(editCommand, documentNodeInstance);
                currentEditor
                  .findElemById(currentDocumentNode.id)
                  .after(documentNodeInstance.toHTML());
                currentEditor.selection.restoreSelection(
                  currentEditor.findElemById(documentNodeInstance.id)[0],
                  text.length,
                );
                currentDocumentNodeInstance = documentNodeInstance;
              } else {
                if (localDocumentNode) {
                  localDocumentNode = localDocumentNode.getVeryFirst();
                  currentEditor.undo.addSnap(localDocumentNode.cid, SnapFlag.NONE);
                  localDocumentNode.set(
                    'text',
                    text + localDocumentNode.safeGetStrAttr('text', true),
                  );
                  currentEditor
                    .findElemById(localDocumentNode.id)
                    .replaceWith(localDocumentNode.toHTML());
                  if (localDocumentNode) {
                    currentEditor.selection.jumpInto(
                      currentEditor.findElemById(localDocumentNode.id),
                      1,
                    );
                  }
                  editCommand = null;
                } else {
                  if (currentDocumentNode) {
                    currentDocumentNode = currentDocumentNode.getVeryFirst(true);
                    currentEditor.undo.addSnap(currentDocumentNode.cid, SnapFlag.NONE);
                    currentDocumentNode.set(
                      'text',
                      currentDocumentNode.safeGetStrAttr('text', true) + text,
                    );
                    currentEditor
                      .findElemById(currentDocumentNode.id)
                      .replaceWith(currentDocumentNode.toHTML());
                    currentEditor.selection.jumpIntoElemEnd(
                      currentEditor.findElemById(currentDocumentNode.id),
                    );
                    editCommand = null;
                  }
                }
              }
            }
            if (editCommand) {
              editCommand.redo.push(this.buildUndo());
            }
            if (!preserveSelection) {
              currentEditor.refocus(
                currentDocumentNodeInstance ? currentDocumentNodeInstance.id : void 0,
              );
            }
            if (event) {
              event.preventDefault();
            }
          }
          if (!preserveSelection) {
            if (!hasSelection && text) {
              !(function (element, selectionBookmark) {
                var rawText = element.rawText(),
                  normalizedText = element.rawText(true),
                  itemIndex = 0,
                  currentItemIndex = 0;
                if (rawText != normalizedText) {
                  for (; itemIndex < selectionBookmark.start; ) {
                    if (rawText[itemIndex] == normalizedText[currentItemIndex]) {
                      itemIndex++;
                      currentItemIndex++;
                    } else {
                      if ('​' != rawText[itemIndex]) {
                        break;
                      }
                      itemIndex++;
                    }
                  }
                  selectionBookmark.start -= itemIndex - currentItemIndex;
                  selectionBookmark.end -= itemIndex - currentItemIndex;
                }
              })(blockElement, selectionBookmark);
              if (
                !(pairHandled = currentEditor.UserOp.handlePair(
                  currentEditor,
                  text,
                  documentNode,
                  selectionBookmark,
                  editCommand,
                  range,
                ))
              ) {
                pairHandled = currentEditor.UserOp.PunctuationOp.handlerCh(
                  currentEditor,
                  text,
                  documentNode,
                  selectionBookmark,
                  editCommand,
                  range,
                );
              }
              if (!pairHandled) {
                pairHandled = currentEditor.htmlBlock.autoCloseTagWhenInput(
                  currentEditor,
                  text,
                  documentNode,
                  selectionBookmark,
                  editCommand,
                  range,
                );
              }
              if (pairHandled) {
                if ('object' == typeof pairHandled) {
                  editCommand = pairHandled;
                }
                if (event) {
                  event.preventDefault();
                }
              }
            } else {
              if (editCommand) {
                currentEditor.UserOp.insertInlineText(
                  currentEditor,
                  documentNode,
                  text,
                  selectionBookmark.start,
                  editCommand,
                  true,
                );
                if (event) {
                  event.preventDefault();
                }
              }
            }
          }
          if (!preserveSelection && editCommand) {
            this.editor.undo.register(editCommand);
          }
          return editCommand;
        } catch (error) {
          console.warn(error);
        }
      }
    },
    getPosBookmark: function (selectionRange) {
      var element = editor.getMarkElem();
      if (element.length) {
        var codeMirror = this.editor.fences.queue[element.attr('cid')];
        if (codeMirror) {
          return {
            isCm: codeMirror,
            cid: codeMirror.cid,
            start: codeMirror.indexFromPos(codeMirror.getCursor()),
          };
        } else {
          if (selectionRange) {
            return {
              isCm: false,
              cid: element.attr('cid'),
              start: selectionRange.getBookmark(element[0]).start,
            };
          } else {
            return null;
          }
        }
      }
    },
    wrappedRange: function (range) {
      if (window.StaticRange && range instanceof StaticRange) {
        var currentRange = this.rangy.createRange();
        currentRange.setStart(range.startContainer, range.startOffset);
        currentRange.setEnd(range.endContainer, range.endOffset);
        return currentRange;
      }
      return this.rangy.WrappedRange(currentRange);
    },
    getRangy: function (normalizeRange) {
      var selection = this.rangy.getSelection(),
        selectionRange = selection.rangeCount ? selection.getRangeAt(0) : null;
      if (selectionRange) {
        selectionRange.isBackward = selection.isBackward();
        if (normalizeRange) {
          this.deRange(selectionRange);
        }
      }
      return selectionRange;
    },
    storeToJson: function (selectionSnapshot) {
      if (!selectionSnapshot) {
        selectionSnapshot = this.buildUndo();
      }
      if (selectionSnapshot && selectionSnapshot.pos) {
        return { id: selectionSnapshot.id, pos: selectionSnapshot.pos };
      } else {
        return selectionSnapshot;
      }
    },
    buildUndo: function (range, element, excludeMathSuffix) {
      var selectionSnapshot = { type: 'cursor' };
      if (this.editor.sourceView && this.editor.sourceView.inSourceMode) {
        selectionSnapshot.pos = this.editor.sourceView.cm.getCursor();
        selectionSnapshot.inSourceMode = true;
        return selectionSnapshot;
      }
      try {
        if (
          (element =
            ((range = range || this.getRangy()) && range.commonAncestorContainer
              ? this.editor.getMarkElem(range.commonAncestorContainer)
              : element) || this.editor.getMarkElem()).find('.CodeMirror').length
        ) {
          var codeMirror = element.find('.CodeMirror')[0].CodeMirror;
          selectionSnapshot.id = codeMirror.cid;
          selectionSnapshot.pos = codeMirror.getCursor();
          selectionSnapshot.selections = codeMirror.listSelections();
        } else {
          if (
            element.attr('mdtype') &&
            element.children('[tabindex]').addBack('[tabindex]').length
          ) {
            selectionSnapshot.id = element.attr('cid');
            selectionSnapshot.focus = element.attr('mdtype');
          } else {
            if (!range) {
              return null;
            }
            var currentElement = this.editor.getMarkElem(
                this.getDetailPos(range.startContainer, range.startOffset)[0],
              ),
              localElement = this.editor.getMarkElem(
                this.getDetailPos(range.endContainer, range.endOffset)[0],
              ),
              selectionBookmark = range.getBookmark(currentElement[0], excludeMathSuffix);
            if (
              DocumentNode.isType(
                currentElement.attr('mdtype'),
                NodeType.fences,
                NodeType.html_block,
                NodeType.math_block,
              )
            ) {
              selectionBookmark.start = 0;
            }
            if (currentElement[0] === localElement[0]) {
              selectionSnapshot.id = currentElement.attr('cid');
              if (!selectionSnapshot.id) {
                return null;
              }
              selectionSnapshot.start = selectionBookmark.start;
              selectionSnapshot.end = selectionBookmark.end;
            } else {
              selectionSnapshot.startId = currentElement.attr('cid');
              selectionSnapshot.endId = localElement.attr('cid');
              if (!selectionSnapshot.startId || !selectionSnapshot.endId) {
                return null;
              }
              selectionSnapshot.start = selectionBookmark.start;
              selectionSnapshot.end = range.getBookmark(localElement[0]).end;
            }
          }
        }
      } catch (error) {
        console.debug(error.stack);
        return null;
      }
      return selectionSnapshot;
    },
    selectNode: function (documentNode, element) {
      if (
        (element = element || editor.findElemById(documentNode.id)).length &&
        'write' !== element.attr('id') &&
        void 0 !== element.attr('tabindex')
      ) {
        window.getSelection().removeAllRanges();
        element.addClass('onfocus');
        element.focus();
      }
    },
    jumpToLineEdge: function (moveToEnd, returnOnly) {
      return this.extendToLineEdge(moveToEnd, null, returnOnly, true);
    },
    fixExtendToLineEdge: function (moveToEnd, element, returnOnly, collapseSelection) {
      element = element || this.editor.getMarkElem()[0];
      var selectionRange = this.getRangy();
      if (
        selectionRange &&
        element &&
        !isInputComponent(document.activeElement) &&
        !isInputComponent(element) &&
        DocumentNode.isType(element.getAttribute('mdtype'), NodeType.paragraph, NodeType.heading)
      ) {
        var mathBookmark,
          selectionBookmark,
          mathElement = null,
          range = this.rangy.createRange();
        if (moveToEnd) {
          if (
            (mathElement = element.querySelectorAll('.md-inline-math').last()) &&
            (range.setStartBefore(mathElement),
            range.collapse(false),
            (mathBookmark = range.getBookmark(element)),
            (selectionBookmark = selectionRange.getBookmark(element)),
            mathBookmark.end == selectionBookmark.end &&
              ((selectionBookmark.end = element.textContent.length),
              collapseSelection && (selectionBookmark.start = selectionBookmark.end),
              selectionRange.moveToBookmark(selectionBookmark),
              !returnOnly))
          ) {
            this.setRange(selectionRange);
            return void this.editor.brush.expandOnDelay(true);
          }
        } else {
          if (
            (mathElement = element.querySelectorAll('.md-inline-math')[0]) &&
            (range.setStartAndEnd(mathElement, mathElement.childNodes.length),
            (mathBookmark = range.getBookmark(element)),
            (selectionBookmark = selectionRange.getBookmark(element)),
            mathBookmark.start == selectionBookmark.start &&
              ((selectionBookmark.start = 0),
              collapseSelection && (selectionBookmark.end = selectionBookmark.start),
              selectionRange.moveToBookmark(selectionBookmark),
              !returnOnly))
          ) {
            this.setRange(selectionRange);
            return void this.editor.brush.expandOnDelay(true);
          }
        }
        this.editor.brush.expandOnDelay(true);
      }
    },
    extendToLineEdge: function (moveToEnd, containerNode, returnOnly, collapseSelection) {
      containerNode = containerNode || this.editor.getMarkElem()[0];
      var selectionRange = this.getRangy();
      if (
        !selectionRange ||
        !containerNode ||
        isInputComponent(document.activeElement) ||
        isInputComponent(containerNode)
      ) {
        return false;
      }
      var selectionBookmark = selectionRange.getBookmark(containerNode),
        range = rangy.createRange();
      if (moveToEnd) {
        selectionBookmark.end = containerNode.textContent.length;
        if (collapseSelection) {
          selectionBookmark.start = selectionBookmark.end;
        }
      } else {
        selectionBookmark.start = 0;
        if (collapseSelection) {
          selectionBookmark.end = 0;
        }
        range.isBackward = true;
      }
      range.moveToBookmark(selectionBookmark);
      if (!returnOnly) {
        this.setRange(range);
      }
      return range;
    },
    extendCharFromCollapse: function (range, backward) {
      var characterCode,
        extended = false,
        forward = !backward;
      if (range.commonAncestorContainer.nodeType == document.TEXT_NODE) {
        if (backward && range.startOffset > 0) {
          range.setStart(range.startContainer, range.startOffset - 1);
          if (
            range.startOffset > 0 &&
            (characterCode = range.toString().charCodeAt(0)) >= 56320 &&
            characterCode <= 57343
          ) {
            range.setStart(range.startContainer, range.startOffset - 1);
            if (
              !((characterCode = range.toString().charCodeAt(0)) >= 55296 && characterCode <= 56319)
            ) {
              range.setStart(range.startContainer, range.startOffset + 1);
            }
          }
          extended = true;
        }
        if (forward && range.endOffset < range.commonAncestorContainer.textContent.length) {
          range.setEnd(range.endContainer, range.endOffset + 1);
          if (
            (characterCode = range.toString().charCodeAt(range.toString().length)) >= 55296 &&
            characterCode <= 56319 &&
            range.endOffset < range.commonAncestorContainer.textContent.length
          ) {
            range.setEnd(range.endContainer, range.endOffset + 1);
          }
          extended = true;
        }
      }
      if (!extended) {
        var element = this.editor.getMarkElem(range.startContainer)[0];
        if (!element) {
          return range;
        }
        var selectionBookmark = range.getBookmark(element);
        if (
          (backward && 0 === selectionBookmark.start) ||
          (forward && selectionBookmark.end >= element.textContent.length)
        ) {
          return false;
        }
        if (backward) {
          selectionBookmark.start--;
        } else {
          selectionBookmark.end++;
        }
        if (
          element.classList.contains('md-def-link') ||
          element.classList.contains('md-def-footnote')
        ) {
          var textLength = element.querySelector('.md-def-name').textContent.length;
          if (
            !(
              selectionBookmark.start != textLength &&
              selectionBookmark.start !=
                textLength + 1 + element.querySelector('.md-def-content').textContent.length
            )
          ) {
            if (backward) {
              if (selectionBookmark.end - selectionBookmark.start <= 1) {
                selectionBookmark.end--;
              }
              selectionBookmark.start--;
            } else {
              if (selectionBookmark.end - selectionBookmark.start <= 1) {
                selectionBookmark.start++;
              }
              selectionBookmark.end++;
            }
          }
        }
        range.moveToBookmark(selectionBookmark);
        if ('​' == range.toString()) {
          if (backward) {
            if (selectionBookmark.end > 0) {
              selectionBookmark.end--;
            }
          } else {
            if (selectionBookmark.end < element.textContent.length) {
              selectionBookmark.end++;
            }
          }
          range.moveToBookmark(selectionBookmark);
        }
      }
      return range;
    },
    isSameRange: function (range, inputRange) {
      try {
        return (
          range.startContainer == inputRange.startContainer &&
          range.endContainer == inputRange.endContainer &&
          range.startOffset == inputRange.startOffset &&
          range.endOffset == inputRange.endOffset
        );
      } catch (error) {}
      return false;
    },
    moveLeftOrRight: function (isBackward, keyboardEvent) {
      currentLeft = void 0;
      var receiver = this,
        element = this.editor.getMarkElem()[0],
        range = this.getRangy(),
        currentEditor = this.editor;
      if (
        element &&
        'write' !== element.id &&
        element.hasAttribute('tabindex') &&
        keyboardEvent &&
        !keyboardEvent.metaKey &&
        !keyboardEvent.shiftKey &&
        !keyboardEvent.ctrlKey
      ) {
        return this.moveUpOrDown(isBackward, keyboardEvent, true);
      }
      if (!((keyboardEvent && isInputComponent(keyboardEvent.target)) || !range) && element) {
        if (
          !(
            !File.inBusyMode ||
            (range &&
              !jquery(range.startContainer).closest("[contenteditable='false'][cid]").length)
          )
        ) {
          setAttributeOnlyNeeded(currentEditor.writingArea, 'contenteditable', 'true');
        }
        var shiftKey = keyboardEvent.shiftKey;
        if (
          keyboardEvent &&
          jquery(isBackward ? range.startContainer : range.endContainer).closest(
            "[mdtype='table_cell']",
          ).length
        ) {
          setTimeout(function () {
            if (!keyboardEvent || !keyboardEvent.isDefaultPrevented()) {
              var selectionRange = receiver.getRangy();
              if (receiver.isSameRange(selectionRange, range)) {
                receiver.editor.tableEdit.moveToNextCell(false, isBackward);
                if (shiftKey) {
                  selectionRange = receiver.getRangy();
                  if (isBackward) {
                    selectionRange.setEnd(range.endContainer, range.endOffset);
                  } else {
                    selectionRange.setStart(range.startContainer, range.startOffset);
                  }
                  selectionRange.isBackward = isBackward;
                  jquery(range.endContainer).closest('figure').attr('contenteditable', true);
                  receiver.setRange(selectionRange);
                }
              }
            }
          }, 0);
        } else {
          var selectionBookmark = range.getBookmark(element),
            currentRange = rangy.createRange();
          if (keyboardEvent) {
            if (
              !keyboardEvent.metaKey &&
              !keyboardEvent.ctrlKey &&
              !keyboardEvent.shiftKey &&
              range.toString().length
            ) {
              range.collapse(isBackward);
              this.setRange(range, true);
              var startElement = this.editor.getMarkElem(range.startContainer);
              if (startElement.length) {
                focusBlockBoundary(
                  this.editor,
                  !isBackward,
                  this.editor.findNodeByElem(startElement),
                );
              }
              keyboardEvent.preventDefault();
              return true;
            }
            var commandPressed = File.isMac && keyboardEvent.metaKey;
            if (
              isBackward &&
              0 === selectionBookmark.start &&
              (!range || range.collapsed || range.isBackward)
            ) {
              if (commandPressed) {
                return;
              }
              return this.moveUpOrDown(true, keyboardEvent, true);
            }
            var length = jquery(element).rawText().length;
            if (
              !isBackward &&
              selectionBookmark.end >= length &&
              (!range || range.collapsed || !range.isBackward) &&
              (!element.classList.contains('md-def-link') ||
                0 !=
                  currentEditor.getJQueryElem(range.startContainer).closest('.md-def-title').length)
            ) {
              if (commandPressed) {
                return;
              }
              return this.moveUpOrDown(false, keyboardEvent, true);
            }
            var currentElement = document.querySelector('.marklyra-focusable-btn.selected');
            if (
              currentElement &&
              !keyboardEvent.metaKey &&
              !keyboardEvent.ctrlKey &&
              !keyboardEvent.shiftKey &&
              selectionBookmark.end == selectionBookmark.start
            ) {
              currentElement.classList.remove('selected');
              selectionBookmark.end += isBackward ? -1 : 1;
              selectionBookmark.start += isBackward ? -1 : 1;
              currentRange.moveToBookmark(selectionBookmark);
              this.setRange(currentRange, true);
              keyboardEvent.preventDefault();
              return true;
            }
            if (
              File.isNodeHtml &&
              !isBackward &&
              keyboardEvent.ctrlKey &&
              !keyboardEvent.shiftKey
            ) {
              var trailingText = element.textContent.substring(selectionBookmark.end) || '';
              if (!/^[^\$]+\s+[^\$]/.exec(trailingText) && -1 != trailingText.indexOf('$')) {
                var selection = window.getSelection();
                if (null != selection) {
                  selection.modify('move', 'right', 'word');
                  var domNode =
                    selection.anchorNode &&
                    selection.anchorNode.parentElement &&
                    selection.anchorNode.parentElement.closest('mjx-container');
                  if (0 == selection.startOffset && domNode) {
                    if (0 == (receiver.getRangy().getBookmark(domNode) || {}).start) {
                      selection.collapse(domNode.parentElement.previousElementSibling, 0);
                    }
                  }
                  keyboardEvent.preventDefault();
                  return true;
                }
              }
              if (/^\w+$/.exec(trailingText)) {
                selectionBookmark.start = selectionBookmark.end = length;
                currentRange.moveToBookmark(selectionBookmark);
                this.setRange(currentRange, true);
                keyboardEvent.preventDefault();
                return true;
              }
            }
          }
          var adjustedBookmark = Object.assign({}, selectionBookmark);
          if (isBackward) {
            selectionBookmark.end = selectionBookmark.start;
            selectionBookmark.start--;
          } else {
            selectionBookmark.start = selectionBookmark.end;
            selectionBookmark.end++;
          }
          currentRange.moveToBookmark(selectionBookmark);
          var extendedText = currentRange.toString();
          if (/\u200b|\007F/g.exec(extendedText)) {
            if (keyboardEvent.shiftKey) {
              if (isBackward) {
                adjustedBookmark.start -= 2;
              } else {
                adjustedBookmark.end += 2;
              }
              if (isBackward) {
                adjustedBookmark.start = Math.max(0, adjustedBookmark.start);
              }
              currentRange.moveToBookmark(adjustedBookmark);
            } else {
              currentRange.collapse(isBackward);
            }
            currentRange.isBackward = range && range.isBackward;
            this.setRange(currentRange, true);
            return true;
          }
          if (
            (function (inputRange) {
              return (
                inputRange.startContainer != inputRange.endContainer &&
                jquery(isBackward ? inputRange.startContainer : inputRange.endContainer)
                  .closest('.md-inline-math')
                  .addClass('md-expand').length
              );
            })(currentRange) &&
            !keyboardEvent.ctrlKey &&
            !keyboardEvent.metaKey &&
            !keyboardEvent.altKey &&
            !keyboardEvent.shiftKey
          ) {
            currentRange.collapse(isBackward);
            this.setRange(currentRange, true);
            if (keyboardEvent) {
              keyboardEvent.preventDefault();
            }
            return true;
          }
          var localElement = jquery(currentRange.commonAncestorContainer).closest(
              '.md-def-content',
            ),
            referenceNameElement = jquery(range.commonAncestorContainer).closest('.md-def-name');
          if (
            range.collapsed &&
            element &&
            !keyboardEvent.shiftKey &&
            (keyboardEvent.ctrlKey || keyboardEvent.metaKey)
          ) {
            if (localElement.length) {
              setTimeout(function () {
                var localRange = receiver.getRangy();
                if (!(localRange && element.contains(localRange.commonAncestorContainer))) {
                  if (isBackward) {
                    receiver.jumpIntoElemBegin(jquery(element));
                  } else {
                    receiver.jumpIntoElemEnd(jquery(element));
                  }
                }
              }, 0);
            } else {
              if (referenceNameElement.length) {
                if (!(isBackward || range.endOffset != range.endContainer.length)) {
                  receiver.jumpIntoElemEnd(jquery(element));
                }
              } else {
                setTimeout(function () {
                  var localRange = receiver.getRangy();
                  if (localRange && localRange.endContainer) {
                    var mathElement = jquery(
                      isBackward ? localRange.startContainer : localRange.endContainer,
                    )
                      .closest('.md-inline-math')
                      .addClass('md-expand');
                    if (
                      File.isMac &&
                      !mathElement.length &&
                      localRange.endContainer.length == localRange.endOffset &&
                      localRange.endContainer.nodeType == document.TEXT_NODE
                    ) {
                      mathElement = jquery(localRange.endContainer.parentElement).next(
                        '.md-inline-math',
                      );
                    }
                    if (mathElement.length) {
                      if (isBackward) {
                        localRange.setStart(mathElement.find('.md-before')[0], 0);
                        localRange.collapse(true);
                      } else {
                        localRange.setEnd(mathElement.find('.md-math-after-sym')[0], 0);
                        localRange.collapse(false);
                      }
                      receiver.setRange(localRange);
                    }
                  }
                }, 0);
              }
            }
          }
        }
      }
    },
    addUnholdable: function (documentNode, insertCommand, insertBefore, keepPlaceholder) {
      var placeholderNode = (function (documentNode, insertBefore, unusedParameter3) {
          var paragraph = NodeType.paragraph;
          if (documentNode.get('type') == NodeType.list_item) {
            paragraph = NodeType.list_item;
          }
          var documentNodeInstance = new DocumentNode({ type: paragraph });
          if (insertBefore) {
            documentNode.addBefore(documentNodeInstance);
          } else {
            documentNode.addAfter(documentNodeInstance);
          }
          DocumentNode.normalizeNode(documentNodeInstance);
          return documentNodeInstance;
        })(documentNode, insertBefore),
        nodeElement = this.editor.findElemById(documentNode.id),
        followingNode = insertBefore ? documentNode : void 0,
        precedingNode = insertBefore ? void 0 : documentNode;
      if (insertBefore) {
        nodeElement.before(placeholderNode.toHTML());
      } else {
        nodeElement.after(placeholderNode.toHTML());
      }
      this.editor.undo.endSnap(true);
      insertCommand = insertCommand || this.editor.undo.UndoManager.makeEmptyCommand();
      jquery('.unholdable').removeClass('unholdable');
      this.editor.findElemById(placeholderNode.id).addClass(keepPlaceholder ? '' : 'unholdable');
      this.editor.undo.UndoManager.addUndoForInsert(
        insertCommand,
        placeholderNode,
        precedingNode,
        followingNode,
      );
      insertCommand.discardable = true;
      return placeholderNode;
    },
    jumpToNextBlock: function (documentNode, insertCommand) {
      var nodeElement,
        nextBlock = documentNode.getClosetBlock(true).getVeryFirstBrotherIncludeTopBlock(false);
      if (nextBlock) {
      } else {
        if (!insertCommand) {
          return void window.getSelection().removeAllRanges();
        }
        nextBlock = this.addUnholdable(documentNode, insertCommand);
      }
      nodeElement = this.editor.findElemById(nextBlock.cid);
      this.jumpIntoElemBegin(nodeElement);
      insertCommand.redo.push(this.buildUndo());
      var currentEditor = this.editor;
      setTimeout(function () {
        currentEditor.refocus();
      }, 50);
    },
    unlockBlockUpOrDown: function (moveUp, keyboardEvent) {
      var currentEditor = this.editor;
      if (
        File.inBusyMode &&
        (keyboardEvent.shiftKey || keyboardEvent.metaKey || keyboardEvent.ctrlK)
      ) {
        setAttributeOnlyNeeded(currentEditor.writingArea, 'contenteditable', 'true');
      }
      var range = this.getRangy(),
        element = currentEditor.getMarkElem(
          range && (moveUp ? range.startContainer : range.endContainer),
        ),
        documentNode = currentEditor.findNodeByElem(element);
      if (documentNode) {
        for (
          var items = [],
            currentElement =
              'false' === element.attr('contenteditable')
                ? element
                : element.closest('[mdtype][contenteditable=false]');
          currentElement.length;
        ) {
          currentElement.attr('contenteditable', 'true');
          items.push(currentElement);
          currentElement = currentElement.closest('[mdtype][contenteditable=false]');
        }
        var adjacentBlock = documentNode
            .getClosetBlock(true)
            .getVeryFirstBrotherIncludeTopBlock(moveUp),
          localElement = adjacentBlock ? currentEditor.findElemById(adjacentBlock.id) : jquery();
        for (
          currentElement =
            'false' === localElement.attr('contenteditable')
              ? localElement
              : localElement.closest('[mdtype][contenteditable=false]');
          currentElement.length;
        ) {
          currentElement.attr('contenteditable', 'true');
          items.push(currentElement);
          currentElement = currentElement.closest('[mdtype][contenteditable=false]');
        }
        if (items.length) {
          setTimeout(function () {
            items.forEach(function (inputElement) {
              inputElement.attr('contenteditable', 'false');
            });
          }, 0);
        }
      }
    },
    moveUpOrDown: function (collapsed, keyboardEvent, ignoreColumn) {
      Object.defineProperty(isBoundaryBlock, 'name', { value: 'g', configurable: true });
      Object.defineProperty(moveToAdjacentBlock, 'name', { value: 'v', configurable: true });
      Object.defineProperty(moveFromBlockBoundary, 'name', { value: 'x', configurable: true });
      Object.defineProperty(moveWithinEmbeddedEditor, 'name', { value: 'k', configurable: true });
      Object.defineProperty(focusNavigationTarget, 'name', { value: 'E', configurable: true });
      Object.defineProperty(handleHorizontalBoundary, 'name', { value: 'T', configurable: true });
      Object.defineProperty(restoreExtendedSelection, 'name', { value: '_', configurable: true });

      if (
        File.inBusyMode &&
        keyboardEvent &&
        (keyboardEvent.shiftKey || keyboardEvent.metaKey || keyboardEvent.ctrlK)
      ) {
        this.editor.writingArea.setAttribute('contenteditable', 'true');
      }
      var currentBounds,
        range = this.getRangy(),
        receiver = this,
        horizontalKey =
          keyboardEvent &&
          DocumentNode.isType(map[keyboardEvent.keyCode || keyboardEvent.which], 'Right', 'Left'),
        controlJump =
          File.isNode && keyboardEvent && keyboardEvent.ctrlKey && !keyboardEvent.shiftKey,
        extendSelection = keyboardEvent && keyboardEvent.shiftKey;
      function isBoundaryBlock(documentNode, includeMissing) {
        if (includeMissing) {
          return (
            !documentNode ||
            DocumentNode.isType(
              documentNode,
              NodeType.fences,
              NodeType.html_block,
              NodeType.table,
              NodeType.math_block,
              NodeType.hr,
              NodeType.toc,
            )
          );
        } else {
          return DocumentNode.isType(
            documentNode,
            NodeType.fences,
            NodeType.html_block,
            NodeType.table,
            NodeType.math_block,
            NodeType.hr,
            NodeType.toc,
            NodeType.def_footnote,
            NodeType.def_link,
          );
        }
      }
      function moveToAdjacentBlock(documentNode, moveUp, beforeMove, sourceElement, targetLeft) {
        var adjacentBlock = documentNode.getVeryFirstBrotherIncludeTopBlock(moveUp),
          moveCommand = receiver.editor.undo.UndoManager.makeEmptyCommand();
        if (
          (!horizontalKey && !adjacentBlock && !documentNode.get(moveUp ? 'before' : 'after')) ||
          (isBoundaryBlock(documentNode) &&
            isBoundaryBlock(documentNode.get(moveUp ? 'before' : 'after'), true))
        ) {
          if (!(moveUp && DocumentNode.isType(documentNode, NodeType.meta_block))) {
            adjacentBlock = receiver.addUnholdable(
              Object.defineProperty(
                function findNavigableBlock(documentNode, moveUp) {
                  if (
                    DocumentNode.isType(
                      documentNode,
                      NodeType.fences,
                      NodeType.html_block,
                      NodeType.table,
                      NodeType.hr,
                      NodeType.def_link,
                      NodeType.def_footnote,
                    )
                  ) {
                    return documentNode;
                  }
                  var direction = moveUp ? 'before' : 'after';
                  if (documentNode.get('parent')) {
                    if (documentNode.get('parent').get(direction)) {
                      return documentNode;
                    } else {
                      if (documentNode.get(direction)) {
                        return documentNode;
                      } else {
                        return findNavigableBlock(documentNode.get('parent'));
                      }
                    }
                  } else {
                    return documentNode;
                  }
                },
                'name',
                { value: 'e', configurable: true },
              )(documentNode),
              moveCommand,
              moveUp,
            );
          }
        }
        moveCommand.undo.push(receiver.buildUndo());
        if (beforeMove) {
          beforeMove();
        }
        if (horizontalKey) {
          if (moveUp) {
            receiver.jumpIntoElemEnd(receiver.editor.findElemById(adjacentBlock.id));
          } else {
            receiver.jumpIntoElemBegin(receiver.editor.findElemById(adjacentBlock.id));
          }
        } else {
          if (controlJump) {
            receiver.jumpIntoElemBegin(receiver.editor.findElemById(adjacentBlock.id), true);
          } else {
            focusNavigationTarget(adjacentBlock, sourceElement, moveCommand, targetLeft);
          }
        }
        return moveCommand;
      }
      function moveFromBlockBoundary(documentNode, moveUp, sourceElement) {
        moveCommand = moveToAdjacentBlock(
          documentNode.getClosetBlock(),
          moveUp,
          void 0,
          sourceElement,
        );
        if (keyboardEvent) {
          keyboardEvent.preventDefault();
        }
        var UndoManager = receiver.editor.undo.UndoManager;
        if (!UndoManager.isEmptyCommand(moveCommand)) {
          moveCommand.redo.push(receiver.buildUndo());
          if (!UndoManager.isEmptyOrUnchangedCommand(moveCommand)) {
            receiver.editor.undo.register(moveCommand);
          }
        }
        receiver.scrollAdjust();
      }
      function moveWithinEmbeddedEditor(documentNode, moveUp, codeMirrorOverride, blockElement) {
        var top,
          codeMirror = codeMirrorOverride || receiver.editor.fences.getCm(documentNode.id),
          inBoundaryInput =
            blockElement[0].contains(document.activeElement) &&
            document.activeElement.classList.contains('marklyra-input'),
          atFirstLine = moveUp && 0 == codeMirror.doc.getCursor().line,
          atLastLine = !moveUp && codeMirror.doc.getCursor().line == codeMirror.lineCount() - 1;
        if (atFirstLine && moveUp) {
          atFirstLine =
            (top = codeMirror.cursorCoords().top) ==
            codeMirror.cursorCoords({ line: 0, ch: 0 }).top;
        }
        if (atLastLine && !moveUp) {
          atLastLine =
            (top = codeMirror.cursorCoords().top) ==
            codeMirror.cursorCoords({
              line: codeMirror.lineCount() - 1,
              ch: codeMirror.getLine(codeMirror.lineCount() - 1).length,
            }).top;
        }
        if (controlJump) {
          atFirstLine = true;
        }
        if (!(ignoreColumn || void 0 != currentLeft)) {
          currentLeft = inBoundaryInput
            ? jquery(document.activeElement).offset().left + document.activeElement.clientWidth
            : codeMirror.cursorCoords(codeMirror.getCursor()).right;
        }
        if (inBoundaryInput) {
          var inBeforeInput = document.activeElement.classList.contains('marklyra-input-before');
          if (!inBeforeInput && moveUp) {
            receiver.editor.fences.jumpCmEnd(codeMirror);
            if (!ignoreColumn) {
              alignCodeMirrorCursor(codeMirror, currentLeft);
            }
            return cancelNavigationEvent(keyboardEvent);
          }
          if (inBeforeInput && !moveUp) {
            receiver.editor.fences.jumpCmBegin(codeMirror);
            if (!ignoreColumn) {
              alignCodeMirrorCursor(codeMirror, currentLeft);
            }
            return cancelNavigationEvent(keyboardEvent);
          }
          atLastLine =
            atLastLine || document.activeElement.classList.contains('marklyra-input-after');
        } else {
          if (atLastLine && !moveUp) {
            if (
              documentNode.get('type') == NodeType.fences ||
              (documentNode.get('type') == NodeType.math_block && documentNode.get('tagAfter'))
            ) {
              codeMirror.getInputField().blur();
              setTimeout(function () {
                receiver.selectAllElem(blockElement.find('.marklyra-input-after').focus());
              }, 0);
              return cancelNavigationEvent(keyboardEvent);
            }
          } else {
            if (
              atFirstLine &&
              moveUp &&
              documentNode.get('type') == NodeType.math_block &&
              documentNode.get('tagBefore')
            ) {
              codeMirror.getInputField().blur();
              setTimeout(function () {
                receiver.selectAllElem(blockElement.find('.marklyra-input-before').focus());
              }, 0);
              return cancelNavigationEvent(keyboardEvent);
            }
          }
        }
        if (atFirstLine || atLastLine) {
          var position = codeMirror.getCursor();
          if (!inBoundaryInput) {
            controlJump =
              !currentLeft &&
              (0 == position.ch ||
                top != codeMirror.cursorCoords({ line: position.line, ch: position.ch - 1 }).top);
          }
          if (ignoreColumn) {
            controlJump = !moveUp;
          }
          moveCommand = moveToAdjacentBlock(
            documentNode,
            moveUp,
            function () {
              codeMirror.getInputField().blur();
            },
            blockElement,
            ignoreColumn ? void 0 : currentLeft,
          );
          if (!receiver.editor.undo.UndoManager.isEmptyCommand(moveCommand)) {
            if (moveUp) {
              moveCommand.redo.push(receiver.buildUndo());
            }
            receiver.editor.undo.register(moveCommand);
          }
          cancelNavigationEvent(keyboardEvent);
          if (!codeMirror.hasFocus()) {
            restoreExtendedSelection(moveCommand);
          }
        }
        if (keyboardEvent) {
          keyboardEvent.stopPropagation();
        }
      }
      function focusNavigationTarget(documentNode, element, moveCommand, targetLeft) {
        if (documentNode) {
          var nodeElement = receiver.editor.findElemById(documentNode.id);
          !(function (inputElement, placeholderNode, removeCommand) {
            if (inputElement.hasClass('unholdable') && placeholderNode) {
              if (inputElement.text().length) {
                inputElement.removeClass('unholdable');
              } else {
                receiver.editor.undo.endSnap(true);
                receiver.editor.undo.UndoManager.addUndoForRemove(removeCommand, placeholderNode);
                removeCommand.redo.push(receiver.buildUndo());
                placeholderNode.remove();
                inputElement.remove();
                receiver.editor.undo.register(removeCommand);
              }
            }
          })(element.closest('.unholdable'), currentDocumentNode, moveCommand);
          var extendSelection = keyboardEvent && keyboardEvent.shiftKey;
          if (!extendSelection && containsNonPlainInline(nodeElement)) {
            cancelNavigationEvent(keyboardEvent);
            nodeElement.find('img:first').trigger('click');
            return true;
          }
          if (
            extendSelection &&
            (DocumentNode.isType(
              documentNode,
              NodeType.fences,
              NodeType.html_block,
              NodeType.math_block,
            ) ||
              isUnholdableBlock(documentNode))
          ) {
            if (nodeElement.length) {
              var localRange = rangy.createRange();
              localRange.setStart(nodeElement[0], 0);
              localRange.setEnd(nodeElement[0], nodeElement[0].childNodes.length);
              receiver.deRange(localRange, true);
              if ('false' == nodeElement.attr('contenteditable')) {
                nodeElement.attr('contenteditable', 'true');
              }
            }
          } else {
            if (
              focusBlockBoundary(
                receiver.editor,
                collapsed,
                documentNode,
                keyboardEvent,
                moveCommand,
                ignoreColumn ? void 0 : currentLeft,
              )
            ) {
            } else {
              if (
                DocumentNode.isType(
                  documentNode,
                  NodeType.paragraph,
                  NodeType.heading,
                  NodeType.def_link,
                  NodeType.def_footnote,
                ) &&
                !documentNode.get('text')
              ) {
                receiver.jumpIntoElemBegin(nodeElement);
                if (keyboardEvent) {
                  keyboardEvent.preventDefault();
                }
              } else {
                if (DocumentNode.isType(documentNode, NodeType.meta_block) && collapsed) {
                  receiver.jumpIntoElemEnd(nodeElement);
                  if (keyboardEvent) {
                    keyboardEvent.preventDefault();
                  }
                } else {
                  if (
                    DocumentNode.isType(
                      documentNode,
                      NodeType.table,
                      NodeType.table_row,
                      NodeType.table_cell,
                    )
                  ) {
                    receiver.jumpIntoElemBegin(nodeElement);
                    cancelNavigationEvent(keyboardEvent);
                  } else {
                    if (nodeElement.length) {
                      if (ignoreColumn || 0 == element.closest('#write').length) {
                        if (collapsed) {
                          receiver.jumpIntoElemEnd(nodeElement);
                        } else {
                          receiver.jumpIntoElemBegin(nodeElement);
                        }
                      } else {
                        editor.selection.scrollAdjust(nodeElement, void 0, true, true);
                        if (File.inBusyMode) {
                          editor.writingArea.setAttribute('contenteditable', 'true');
                        }
                        var left = currentLeft;
                        if (void 0 !== targetLeft) {
                          left =
                            localRange &&
                            localRange.getBookmark(element[0]).end == element.text().length
                              ? currentLeft
                              : targetLeft;
                        }
                        if (void 0 != left) {
                          var selectionRange = receiver.getRangy(),
                            currentRange = null;
                          if (
                            (selectionRange && selectionRange.nativeRange.getClientRects()[0]) ||
                            void 0 != targetLeft
                          ) {
                            var bounds = (
                                nodeElement.children[0] || nodeElement[0]
                              ).getBoundingClientRect(),
                              targetY = collapsed ? bounds.y + bounds.height - 8 : bounds.y + 4;
                            currentRange = document.caretRangeFromPoint(left, targetY);
                          }
                          var insideTarget =
                              currentRange &&
                              (nodeElement[0] == currentRange.startContainer ||
                                nodeElement[0].contains(currentRange.startContainer)),
                            reverseFootnote = currentRange
                              ? jquery(currentRange.startContainer).closest(
                                  '.md-reverse-footnote-area',
                                )
                              : jquery();
                          if (insideTarget && reverseFootnote.length) {
                            currentRange.setStart(reverseFootnote[0].previousElementSibling, 1);
                            currentRange.setEnd(reverseFootnote[0].previousElementSibling, 1);
                            receiver.deRange(currentRange);
                          }
                          if (insideTarget) {
                            receiver.setRange(currentRange);
                          } else {
                            if (void 0 == targetLeft && selectionRange) {
                              window
                                .getSelection()
                                .modify('move', collapsed ? 'backward' : 'forward', 'line');
                            } else {
                              if (collapsed) {
                                receiver.jumpIntoElemEnd(nodeElement);
                              } else {
                                receiver.jumpIntoElemBegin(nodeElement);
                              }
                              if (!selectionRange) {
                                selectionRange = receiver.getRangy();
                              }
                              if (
                                (bounds =
                                  selectionRange && selectionRange.nativeRange.getClientRects()[0])
                              ) {
                                currentRange = document.caretRangeFromPoint(left, bounds.y);
                              }
                              if (
                                currentRange &&
                                (nodeElement[0] == currentRange.startContainer ||
                                  nodeElement[0].contains(currentRange.startContainer))
                              ) {
                                receiver.setRange(currentRange);
                              }
                            }
                          }
                        } else {
                          if (collapsed) {
                            receiver.jumpIntoElemEnd(nodeElement);
                          } else {
                            receiver.jumpIntoElemBegin(nodeElement);
                          }
                        }
                      }
                      if (File.isFocusMode) {
                        jquery('.md-focus').removeClass('md-focus');
                        nodeElement.addClass('md-focus');
                      }
                      cancelNavigationEvent(keyboardEvent);
                    }
                  }
                }
              }
            }
          }
        }
      }
      function handleHorizontalBoundary(sourceElement, documentNode, targetLeft) {
        var element = jquery(range.commonAncestorContainer.parentElement);
        if (!collapsed && element.hasClass('md-image-after-src')) {
          var afterImage = element.closest('.md-image').next();
          if (afterImage.length) {
            receiver.jumpIntoElemBegin(afterImage);
            cancelNavigationEvent(keyboardEvent);
          } else {
            moveFromBlockBoundary(documentNode, collapsed, sourceElement);
          }
          return false;
        }
        if (currentBounds && currentBounds.left) {
          var atDefinitionBoundary = !collapsed && range.collapsed;
          if (atDefinitionBoundary) {
            var classList = range.startContainer.parentElement.classList;
            atDefinitionBoundary =
              classList.contains('md-def-name') || classList.contains('md-tab');
          }
          if (atDefinitionBoundary) {
            var left = currentBounds.left,
              bottom = collapsed ? currentBounds.top - 9 : currentBounds.bottom + 9,
              currentRange = document.caretRangeFromPoint(left, bottom);
            this.setRange(currentRange, true);
            cancelNavigationEvent(keyboardEvent);
          } else {
            if (targetLeft || (File.isTypeWriterMode && File.option.scrollWithCursor)) {
              left = targetLeft || currentBounds.left;
              bottom = collapsed ? currentBounds.top - 9 : currentBounds.bottom + 9;
              currentRange = document.caretRangeFromPoint(left, bottom);
              if (!collapsed && this.fixUnselectableRange(currentRange, true)) {
                bottom =
                  ((
                    currentRange.startContainer.getClientRects &&
                    (currentRange.startContainer.getClientRects() || [{}])[0]
                  ).bottom || bottom) + 9;
                currentRange = document.caretRangeFromPoint(left, bottom);
                this.deRange(currentRange);
              }
              if (
                this.editor.writingArea.contains(currentRange.startContainer) &&
                (normalizeEmptyLineRange(currentRange) || {}).top != currentBounds.top
              ) {
                this.setRange(currentRange);
                cancelNavigationEvent(keyboardEvent);
              }
            }
          }
        }
      }
      function restoreExtendedSelection(moveCommand) {
        if (extendSelection && range) {
          var selectionRange = receiver.getRangy();
          if (selectionRange) {
            selectionRange.isBackward = range.isBackward || (range.collapsed && collapsed);
            if (selectionRange.isBackward) {
              selectionRange.setEnd(range.endContainer, range.endOffset);
            } else {
              selectionRange.setStart(range.startContainer, range.startOffset);
            }
            receiver.setRange(selectionRange);
            moveCommand.redo.push(receiver.buildUndo(selectionRange));
            cancelNavigationEvent(keyboardEvent);
          }
        }
      }
      try {
        var currentElement = this.editor.getMarkElem(),
          nodeType = currentElement.attr('mdtype'),
          currentDocumentNode = this.editor.findNodeByElem(currentElement),
          moveCommand = receiver.editor.undo.UndoManager.makeEmptyCommand();
        if (!currentDocumentNode) {
          return;
        }
        if (
          isUnholdableBlock(currentDocumentNode, currentElement) ||
          currentElement.hasClass('rawedit')
        ) {
          if (document.activeElement !== this.editor.writingArea) {
            var scrollTop = jquery('content').scrollTop();
            this.editor.writingArea.focus();
            jquery('content').scrollTop(scrollTop);
            window.getSelection().removeAllRanges();
          }
          moveFromBlockBoundary(currentDocumentNode, collapsed, currentElement);
          restoreExtendedSelection(moveCommand);
        } else {
          if (nodeType == documentModel.TYPE.fences) {
            moveWithinEmbeddedEditor(currentDocumentNode, collapsed, void 0, currentElement);
          } else {
            if (nodeType == documentModel.TYPE.html_block && this.editor.htmlBlock.currentCm) {
              moveWithinEmbeddedEditor(
                currentDocumentNode,
                collapsed,
                this.editor.htmlBlock.currentCm,
                currentElement,
              );
            } else {
              if (nodeType == documentModel.TYPE.math_block && this.editor.mathBlock.currentCm) {
                moveWithinEmbeddedEditor(
                  currentDocumentNode,
                  collapsed,
                  this.editor.mathBlock.currentCm,
                  currentElement,
                );
              } else {
                if (currentElement.closest('.td-span').length) {
                  if (
                    keyboardEvent &&
                    (keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey)
                  ) {
                    return;
                  }
                  var targetCell = (function (element, moveUp) {
                    var elements,
                      tableCell = element.closest('td'),
                      columnNumber = tableCell.prevAll().length + 1;
                    if (!tableCell.length) {
                      if (moveUp) {
                        return [];
                      }
                      columnNumber = (tableCell = element.closest('th')).prevAll().length + 1;
                    }
                    if ('TD' == tableCell[0].tagName) {
                      elements = tableCell
                        .closest('tr')
                        [moveUp ? 'prev' : 'next']()
                        .find('td:nth-child(' + columnNumber + ')>.td-span');
                      if (moveUp && !elements.length) {
                        elements = tableCell
                          .closest('tbody')
                          .prev()
                          .find('tr:last > th:nth-child(' + columnNumber + ') > .td-span');
                      }
                      return elements;
                    } else {
                      if (moveUp) {
                        return [];
                      } else {
                        return tableCell
                          .closest('thead')
                          .next()
                          .find('tr:first > td:nth-child(' + columnNumber + ')>.td-span');
                      }
                    }
                  })(currentElement.closest('.td-span'), collapsed);
                  if (targetCell.length) {
                    if (keyboardEvent) {
                      keyboardEvent.preventDefault();
                    }
                    if (collapsed) {
                      this.jumpIntoElemEnd(targetCell);
                    } else {
                      this.jumpIntoElemBegin(targetCell);
                    }
                    this.scrollAdjust(void 0, void 0, true);
                  } else {
                    if (horizontalKey) {
                      cancelNavigationEvent(keyboardEvent);
                      return false;
                    }
                    moveFromBlockBoundary(currentDocumentNode, collapsed, currentElement);
                  }
                } else {
                  if (currentElement.closest('.md-meta-block').length && !collapsed) {
                    currentElement[0].normalize();
                    if (
                      !currentElement
                        .text()
                        .substring(window.getSelection().focusOffset)
                        .match(/\S+\n+/)
                    ) {
                      moveFromBlockBoundary(currentDocumentNode, collapsed, currentElement);
                    }
                  } else {
                    if (!ignoreColumn && void 0 == currentLeft) {
                      var rangeRects = range.nativeRange.getClientRects();
                      currentLeft = (1 == rangeRects.length ? rangeRects[0] : {}).left;
                    }
                    var adjacentBlock = currentDocumentNode
                      .getClosetBlock(true)
                      .getVeryFirstBrotherIncludeTopBlock(collapsed);
                    moveCommand.undo.push(this.editor.lastCursor);
                    var edgeFlags = function (blockElement, inputRange) {
                      if (!(inputRange = inputRange || this.getRangy())) {
                        return 0;
                      }
                      if (
                        extendSelection ||
                        inputRange.collapsed ||
                        blockElement[0].contains(inputRange.commonAncestorContainer) ||
                        blockElement[0] == inputRange.commonAncestorContainer
                      ) {
                        if (
                          false ===
                          (currentBounds = normalizeEmptyLineRange(inputRange.nativeRange, true))
                        ) {
                          return 0;
                        }
                        if (!currentBounds || !blockElement.length || !blockElement.text().length) {
                          return 3;
                        }
                        var edgeFlags = 0,
                          bounds = blockElement[0].getBoundingClientRect();
                        if (
                          (function (blockElement, callbackRange) {
                            var domNode =
                              callbackRange.endContainer.nodeType == document.TEXT_NODE
                                ? callbackRange.endContainer.parentElement.parentElement
                                : null;
                            if (domNode && domNode.classList.contains('md-meta')) {
                              domNode = domNode.parentElement;
                            }
                            if (domNode && domNode.classList.contains('md-image')) {
                              if (
                                callbackRange.endContainer.textContent.length ==
                                  callbackRange.endOffset &&
                                blockElement.rawText().length ==
                                  callbackRange.getBookmark(blockElement[0]).end
                              ) {
                                return true;
                              }
                              var rangeRects = callbackRange.nativeRange.getClientRects();
                              if (!rangeRects.length) {
                                return;
                              }
                              var lastRect = rangeRects[rangeRects.length - 1],
                                currentDomNode = document.elementFromPoint(
                                  lastRect.x,
                                  lastRect.y + 28,
                                );
                              if (
                                currentDomNode &&
                                'IMG' == currentDomNode.tagName &&
                                (callbackRange.collapseAfter(currentDomNode),
                                blockElement.rawText().length ==
                                  callbackRange.getBookmark(blockElement[0]).end)
                              ) {
                                return true;
                              }
                            }
                          })(blockElement, inputRange)
                        ) {
                          edgeFlags |= 1;
                        } else {
                          if (
                            bounds.bottom - currentBounds.bottom <
                            parseInt(blockElement.css('paddingBottom')) + 10
                          ) {
                            edgeFlags |= 1;
                          }
                        }
                        if (
                          currentBounds.top - bounds.top <
                          parseInt(blockElement.css('paddingTop')) + 10
                        ) {
                          edgeFlags |= 2;
                        }
                        return edgeFlags;
                      }
                    }.call(this, currentElement);
                    if (edgeFlags & (collapsed ? 2 : 1)) {
                      if (adjacentBlock) {
                        focusNavigationTarget(
                          adjacentBlock,
                          currentElement,
                          moveCommand,
                          currentLeft,
                        );
                      } else {
                        if (!collapsed && currentElement.text().trim().length) {
                          moveFromBlockBoundary(currentDocumentNode, collapsed, currentElement);
                        }
                      }
                    } else {
                      if (edgeFlags) {
                        handleHorizontalBoundary.call(
                          this,
                          currentElement,
                          currentDocumentNode,
                          currentLeft,
                        );
                      } else {
                        handleHorizontalBoundary.call(this, currentElement, currentDocumentNode);
                      }
                    }
                    restoreExtendedSelection(moveCommand);
                    if (!keyboardEvent.isDefaultPrevented() && File.isTypeWriterMode) {
                      setTimeout(this.scrollAdjust.bind(this), 0);
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.debug(error.stack);
      }
    },
    click: function (clientX, clientY, eventType) {
      window.getSelection().removeAllRanges();
      var mouseEvent = document.createEvent('MouseEvent'),
        elementAtPoint = document.elementFromPoint(clientX, clientY);
      eventType = 'click';
      mouseEvent.initMouseEvent(
        eventType,
        true,
        true,
        window,
        null,
        clientX,
        clientY,
        0,
        0,
        false,
        false,
        false,
        false,
        0,
        null,
      );
      elementAtPoint.dispatchEvent(mouseEvent);
    },
    jumpDefComponent: function (selectName) {
      var blockElement = this.editor.getMarkElem(),
        range = rangy.createRange();
      if (selectName) {
        range.selectNodeContents(blockElement.find('.md-def-name')[0]);
        this.deRange(range, true);
      } else {
        range.selectNodeContents(blockElement.find('.md-def-content')[0]);
        this.deRange(range, true);
      }
      this.editor.refocus();
    },
    jumpSelection: function () {
      return this.scrollAdjust(null, 20);
    },
    jumpToLineStart: function (moveToEnd) {
      var currentEditor = this.editor;
      if (currentEditor.sourceView && currentEditor.sourceView.inSourceMode) {
        currentEditor.sourceView.cm.execCommand(moveToEnd ? 'goLineEnd' : 'goLineStart');
      }
      var element = this.editor.getMarkElem();
      if (isInputComponent(document.activeElement)) {
        window
          .getSelection()
          .modify('move', moveToEnd ? 'forward' : 'backward', 'paragraphboundary');
      } else {
        if (element.find('.CodeMirror').length) {
          var currentCodeMirror = element.find('.CodeMirror')[0].CodeMirror;
          if (currentCodeMirror) {
            currentCodeMirror.execCommand(moveToEnd ? 'goLineEnd' : 'goLineStart');
          }
        } else {
          if (element.closest('[mdtype="table"]').length) {
            if (moveToEnd) {
              this.jumpIntoElemEnd(element.closest('tr').find('.td-span').first());
            } else {
              this.jumpIntoElemBegin(element.closest('tr').find('.td-span').last());
            }
          } else {
            if (element.closest('.md-meta-block').length) {
              window
                .getSelection()
                .modify('move', moveToEnd ? 'forward' : 'backward', 'lineboundary');
            } else {
              if (moveToEnd) {
                this.jumpIntoElemEnd(element);
              } else {
                this.jumpIntoElemBegin(element);
              }
            }
          }
        }
      }
    },
    jumpToLineEnd: function () {
      this.jumpToLineStart(true);
    },
    jumpTop: function (extendSelection) {
      var currentEditor = this.editor;
      if (currentEditor.sourceView && currentEditor.sourceView.inSourceMode) {
        currentEditor.sourceView.cm.execCommand('goDocStart');
      } else {
        var selectionRange = this.getRangy();
        if (extendSelection && selectionRange) {
          selectionRange.setStart(currentEditor.writingArea, 0);
          this.deRange(selectionRange, true);
        } else {
          if (currentEditor.nodeMap) {
            var firstNode = currentEditor.nodeMap.getFirst();
            if (firstNode) {
              firstNode = firstNode.getVeryFirst() || firstNode;
            }
            this.jumpIntoElemBegin(currentEditor.findElemById((firstNode || {}).cid));
          }
        }
        if (!File.isTypeWriterMode) {
          jquery('content').animate({ scrollTop: 0 }, '100', 'swing', function () {
            currentEditor.library.outline.highlightVisibleHeader();
          });
        }
      }
    },
    jumpBottom: function (extendSelection) {
      var currentEditor = this.editor;
      if (currentEditor.sourceView && currentEditor.sourceView.inSourceMode) {
        currentEditor.sourceView.cm.execCommand('goDocEnd');
      } else {
        var range = this.getRangy();
        if (extendSelection && range) {
          range.setEnd(currentEditor.writingArea, currentEditor.writingArea.childNodes.length);
          range = this.deRange(range, true);
          try {
            if (
              range.endContainer.parentElement.classList.contains('md-def-title') &&
              '' == range.endContainer.parentElement.textContent
            ) {
              range.setEndAfter(range.endContainer.parentElement.previousSibling.previousSibling);
              range = this.deRange(range, true);
            }
          } catch (error) {}
        } else {
          var lastNode = currentEditor.nodeMap.getLast();
          if (lastNode) {
            lastNode = lastNode.getVeryFirst(true) || lastNode;
          }
          this.jumpIntoElemEnd(currentEditor.findElemById(lastNode.cid));
        }
        if (!File.isTypeWriterMode) {
          jquery('content').animate(
            {
              scrollTop:
                document.querySelector(this.editor.sessionStr).scrollHeight - window.innerHeight,
            },
            '100',
            'swing',
            function () {
              currentEditor.library.outline.highlightVisibleHeader();
            },
          );
        }
      }
    },
    lockNativeScroll: function () {
      window.addEventListener('wheel', cancelNativeScrollEvent, { passive: false });
      window.addEventListener('DOMMouseScroll', cancelNativeScrollEvent, { passive: false });
      this.nativeScrollLocked = false;
      var waitForScrollCompletion = Object.defineProperty(
        () => {
          this.nativeScrollLocked = setTimeout(() => {
            if (this.editor.isScrolling()) {
              waitForScrollCompletion();
            } else {
              this.nativeScrollLocked = false;
              window.removeEventListener('wheel', cancelNativeScrollEvent, { passive: false });
              window.removeEventListener('DOMMouseScroll', cancelNativeScrollEvent, {
                passive: false,
              });
            }
          }, 100);
        },
        'name',
        { value: 'e', configurable: true },
      );
      waitForScrollCompletion();
    },
    typeWriterScroll: function (element, alignElement, onComplete) {
      Object.defineProperty(centerSelectionBounds, 'name', { value: 'a', configurable: true });

      var currentEditor = this.editor;
      function centerSelectionBounds(bounds) {
        return (
          !(!bounds || (0 == bounds.top && 0 == bounds.bottom)) &&
          (isNaN(currentEditor.defaultTextHeight) && currentEditor.selection.updateMetrics(),
          (bounds = bounds.top - clientHeight / 2 + currentEditor.defaultTextHeight / 2),
          Math.abs(bounds) > 2
            ? onComplete
              ? jquery('content').animate(
                  { scrollTop: jquery('content').scrollTop() + bounds },
                  120,
                  'swing',
                  onComplete,
                )
              : jquery('content').scrollTop(jquery('content').scrollTop() + bounds)
            : onComplete && onComplete(),
          true)
        );
      }
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = null;
      if (File.isTypeWriterMode) {
        var currentBounds;
        if (alignElement) {
          return void (
            (currentBounds =
              element.jquery && element.length && element[0].getBoundingClientRect()) &&
            ((currentBounds = document.caretRangeFromPoint(
              (currentBounds.left + currentBounds.right) / 2,
              currentBounds.bottom - 10,
            )),
            this.typeWriterScroll(currentBounds))
          );
        }
        if (!element || element.getBoundingClientRect) {
          if (
            (currentBounds =
              element || (window.getSelection().rangeCount && window.getSelection().getRangeAt(0)))
          ) {
            centerSelectionBounds(normalizeEmptyLineRange(currentBounds));
          } else {
            if (onComplete) {
              onComplete();
            }
          }
          return;
        }
        if (element.top) {
          centerSelectionBounds(element);
        } else {
          if (element.jquery && element.length) {
            centerSelectionBounds(element[0].getBoundingClientRect());
          }
        }
      }
    },
    scrollAdjust: function (range, padding, scrollDuration, skipTypewriter) {
      Object.defineProperty(applyScrollPosition, 'name', { value: 'w', configurable: true });

      if (this.editor.sourceView && this.editor.sourceView.inSourceMode) {
        this.editor.sourceView.scrollAdjust();
      } else {
        if (!this.editor.isScrolling() || this.nativeScrollLocked) {
          if (File.isTypeWriterMode && !skipTypewriter) {
            return this.typeWriterScroll(range);
          }
          if (scrollDuration) {
            var durationType = typeof scrollDuration;
            scrollDuration =
              'number' === durationType ||
              ('string' === durationType && !window.isNaN(scrollDuration - 0))
                ? scrollDuration - 0
                : 70;
          }
          try {
            var top,
              bottom,
              currentRange,
              currentBounds,
              innerHeight = window.innerHeight,
              currentScrollTop = document.querySelector('content').scrollTop,
              currentEditor = this.editor,
              headingElements =
                range && range.jquery && range.closest("[mdtype='heading']").toArray();
            if (range && range.jquery) {
              if (!range.length) {
                return;
              }
              top = range.offset().top + currentScrollTop;
            } else {
              if (range && range.closest) {
                var element = range.closest('.md-diagram, .md-math-block'),
                  bounds = range.getBoundingClientRect();
                if (
                  (bottom =
                    (element ? element.getBoundingClientRect().bottom - 40 : bounds.top) +
                    currentScrollTop) +
                    40 -
                    (top = bounds.top + currentScrollTop) >
                  innerHeight - 160
                ) {
                  bottom = bounds.bottom + currentScrollTop;
                }
              } else {
                if (range && void 0 !== range.startContainer) {
                  top = (range.nativeRange || range).getClientRects()[0].top + currentScrollTop;
                } else {
                  var currentElement =
                    document.activeElement.closest &&
                    document.activeElement.closest('.CodeMirror-focused');
                  if (
                    currentElement &&
                    (currentElement = currentElement.querySelector('.CodeMirror-selected')) &&
                    currentElement.length
                  ) {
                    return this.scrollAdjust(currentElement);
                  }
                  currentRange = window.getSelection().getRangeAt(0);
                  if (
                    !(
                      !document.activeElement ||
                      ('VIDEO' != document.activeElement.tagName &&
                        'IMG' != document.activeElement.tagName &&
                        'IFRAME' != document.activeElement.tagName)
                    )
                  ) {
                    currentRange = null;
                  }
                  if (currentRange) {
                    if (
                      (currentBounds = currentRange.getBoundingClientRect()) &&
                      currentBounds.height
                    ) {
                      top = currentBounds.top + currentScrollTop;
                    } else {
                      var domNode = currentRange.endContainer;
                      if (domNode.nodeType === document.TEXT_NODE) {
                        if (
                          void 0 === (currentBounds = domNode.parentElement.getClientRects()[0])
                        ) {
                          bottom =
                            (currentBounds = domNode.parentElement
                              .closest('[cid]')
                              .getClientRects()[0]).bottom + currentScrollTop;
                        }
                        top = currentBounds.top + currentScrollTop;
                      } else {
                        top = void 0;
                        if (
                          domNode !== this.editor.writingArea &&
                          (currentBounds = domNode.getClientRects()[0]).height < 50
                        ) {
                          top = currentBounds.top + currentScrollTop;
                        }
                        if (void 0 === top) {
                          return;
                        }
                      }
                    }
                  } else {
                    top = jquery(document.activeElement).offset().top;
                  }
                }
              }
            }
            bottom = bottom || top;
            var topInset = 30;
            if (!File.inBusyMode) {
              topInset =
                (File.isNodeHtml
                  ? jquery('#top-titlebar').height()
                  : document.body.classList.contains('mac-seamless-mode')
                    ? 30
                    : 0) + (jquery('.on-search-panel-open #md-searchpanel').height() || 0);
            }
            if (void 0 !== padding && null !== padding) {
              if (File.inBusyMode || File._onInitParse) {
                var localScrollTop = top - padding - topInset;
                jquery('content')[0].scrollTop = localScrollTop;
                if (localScrollTop > 35e3) {
                  requestAnimationFrame(function () {
                    jquery('content')[0].scrollTop = localScrollTop;
                  });
                }
                currentEditor.library.outline.highlightVisibleHeaderWithDelay(headingElements);
              } else {
                jquery('content').animate(
                  { scrollTop: top - padding - topInset },
                  '500',
                  'swing',
                  function () {
                    currentEditor.library.outline.highlightVisibleHeaderWithDelay(headingElements);
                  },
                );
              }
            } else {
              if (top < currentScrollTop + topInset) {
                applyScrollPosition(top - topInset - (scrollDuration || 140));
              } else {
                if (bottom > innerHeight + currentScrollTop - (scrollDuration ? 70 : 140)) {
                  applyScrollPosition(bottom - innerHeight + (scrollDuration || 140));
                } else {
                  currentEditor.library.outline.highlightVisibleHeaderWithDelay();
                }
              }
            }
          } catch (error) {}
        }
      }
      function applyScrollPosition(inputScrollTop) {
        if (File.inBusyMode) {
          jquery('content')[0].scrollTop = inputScrollTop;
        } else {
          jquery('content').scrollTop(inputScrollTop);
        }
        currentEditor.library.outline.highlightVisibleHeaderWithDelay();
        currentEditor.selection.lockNativeScroll();
      }
    },
    selectAllElem: function (element) {
      if (!element[0] || ('INPUT' != element[0].tagName && 'TEXTAREA' != element[0].tagName)) {
        if (this.editor.sourceView.inSourceMode) {
          this.editor.sourceView.cm.execCommand('selectAll');
        } else {
          if (jquery('body').hasClass('marklyra-sourceview-on')) {
            return this.editor.sourceView.cm.execCommand('selectAll');
          }
          editor.needRemoveMathAfterSym = true;
          element.find('.math-jax-postprocess>.md-math-after-sym').text('​');
          var range = rangy.createRange();
          if (element.children().length) {
            range.setStart(element.children()[0]);
            range.setEndAfter(element.children()[element.children().length - 1]);
          } else {
            if (!element.length) {
              return;
            }
            range.selectNode(element[0]);
          }
          this.deRange(range, true);
        }
      } else {
        element[0].select();
      }
    },
    selectAll: function (event) {
      if (this.editor.sourceView.inSourceMode) {
        this.editor.sourceView.cm.execCommand('selectAll');
      } else {
        if (File.inBusyMode && !File.isLocked) {
          this.editor.writingArea.setAttribute('contenteditable', 'true');
        }
        editor.needRemoveMathAfterSym = true;
        jquery('.math-jax-postprocess>.md-math-after-sym').text('​');
        if (
          document.activeElement &&
          DocumentNode.isType(document.activeElement.tagName, 'INPUT', 'TEXTAREA')
        ) {
          document.activeElement.select();
        } else {
          var element = this.editor.getMarkElem(),
            range = rangy.createRange();
          if (element.hasClass('rawedit')) {
            if (!event) {
              range.selectNode(element[0]);
              this.setRange(range);
            }
          } else {
            if (event && DocumentNode.isType(event.target.tagName, 'INPUT', 'TEXTAREA')) {
              event.target.select();
              return true;
            }
            if (isInputComponent((event && event.target) || document.activeElement)) {
              this.selectAllElem(jquery((event && event.target) || document.activeElement));
              return false;
            }
            if (element.find('.CodeMirror').length) {
              element.find('.CodeMirror')[0].CodeMirror.execCommand('selectAll');
            } else {
              if (element.closest('[mdtype="table"]').length) {
                this.selectAllElem(element.closest("[mdtype='table_cell']"));
                if (event) {
                  event.preventDefault();
                }
              } else {
                if (element.closest('.md-meta-block').length) {
                  this.selectAllElem(element.closest("[mdtype='meta_block']"));
                  if (event) {
                    event.preventDefault();
                  }
                } else {
                  jquery(this.editor.sessionStr).addClass('md-expand');
                  jquery('.footnotes, .md-fences, .hr, .md-rawblock').attr('contenteditable', true);
                  range.setStart(jquery(this.editor.sessionStr).children()[0]);
                  if (jquery(this.editor.sessionStr).children()[0].classList.contains('md-hr')) {
                    range.setStart(jquery(this.editor.sessionStr).children()[1]);
                  }
                  range.setEndAfter(jquery(this.editor.sessionStr).children().last()[0]);
                  jquery(this.editor.sessionStr).removeClass('md-expand');
                  range = this.deRange(range);
                  this.fixSafariRange(range);
                  this.setRange(range);
                  if (event) {
                    event.preventDefault();
                  }
                  if (File.isMac) {
                    setTimeout(function () {
                      jquery('.footnotes, .md-fences, .hr, .md-rawblock').prop(
                        'contenteditable',
                        false,
                      );
                    }, 10);
                  }
                }
              }
            }
          }
          this.editor.lastCursor = this.buildUndo();
        }
      }
    },
    getEndNode: function (range) {
      return this.getDetailPos(range.endContainer, range.endOffset)[0];
    },
    getDetailPos: function (domNode, itemIndex, preferStart) {
      Object.defineProperty(ensureTextChild, 'name', { value: 'r', configurable: true });
      Object.defineProperty(getNodeEndOffset, 'name', { value: 'o', configurable: true });

      var stopTraversal = {};
      function ensureTextChild(inputDomNode) {
        if (1 === inputDomNode.nodeType && 0 === inputDomNode.childNodes.length) {
          inputDomNode.appendChild(document.createTextNode(''));
        }
      }
      function getNodeEndOffset(inputDomNode) {
        ensureTextChild(inputDomNode);
        if (inputDomNode.childNodes.length) {
          return inputDomNode.childNodes.length;
        }
        if (3 === inputDomNode.nodeType) {
          return inputDomNode.textContent.length;
        }
        if (void 0 !== inputDomNode.length) {
          return inputDomNode.length;
        }
        throw stopTraversal;
      }
      if (domNode.parentElement && domNode.parentElement.classList.contains('md-def-split')) {
        if (0 == itemIndex) {
          return this.getDetailPos(
            domNode.parentElement.previousElementSibling,
            domNode.parentElement.previousElementSibling.textContent.length,
            preferStart,
          );
        } else {
          return this.getDetailPos(domNode.parentElement.nextElementSibling, 0, preferStart);
        }
      }
      if (1 == domNode.nodeType) {
        var childNodes = domNode.childNodes;
        if (domNode.classList.contains('md-image') && 2 === itemIndex) {
          itemIndex = 1;
        }
        if (domNode.tagName == 'mjx-assistive-mml'.toUpperCase()) {
          if (!preferStart) {
            return this.getDetailPos(
              domNode.parentElement.parentElement.parentElement,
              domNode.parentElement.parentElement.parentElement.childElementCount,
            );
          }
        } else {
          if (domNode.tagName == 'mjx-container'.toUpperCase()) {
            if (0 == itemIndex) {
              return this.getDetailPos(domNode.parentElement.parentElement, 0);
            } else {
              return this.getDetailPos(
                domNode.parentElement.parentElement,
                domNode.parentElement.parentElement.childElementCount,
              );
            }
          }
        }
        ensureTextChild(domNode);
        if (
          !childNodes ||
          !childNodes.length ||
          (domNode.classList && domNode.classList.contains('md-fences'))
        ) {
          return [domNode, itemIndex];
        }
        try {
          var isCheckbox =
            childNodes[itemIndex] &&
            childNodes[itemIndex].getAttribute &&
            'checkbox' === childNodes[itemIndex].getAttribute('type');
          if (preferStart) {
            if (isCheckbox) {
              itemIndex++;
            }
            if (itemIndex == childNodes.length) {
              return this.getDetailPos(
                childNodes[itemIndex - 1],
                getNodeEndOffset(childNodes[itemIndex - 1]),
              );
            } else {
              return this.getDetailPos(childNodes[itemIndex], 0, true);
            }
          } else {
            if (0 == itemIndex) {
              if (isCheckbox) {
                itemIndex++;
              }
              return this.getDetailPos(childNodes[itemIndex], 0);
            } else {
              return this.getDetailPos(
                childNodes[itemIndex - 1],
                getNodeEndOffset(childNodes[itemIndex - 1]),
              );
            }
          }
        } catch (error) {
          return [domNode, itemIndex];
        }
      }
      return [domNode, itemIndex];
    },
    fixSafariRange: function (range) {
      if (File.isSafari) {
        var currentElement,
          boundaryElement,
          element = jquery(range.startContainer).closest('.md-meta, .md-content');
        if (
          element.length &&
          0 == range.startOffset &&
          (boundaryElement = (currentElement = element.closest(
            "[contenteditable='true'], [cid]",
          )).children()[0])
        ) {
          range.setStart(boundaryElement, 0);
        }
        if ((element = jquery(range.endContainer).closest('.md-meta, .md-content')).length) {
          if (
            (currentElement = element.closest("[contenteditable='true'], [cid]")).hasClass(
              'md-meta',
            )
          ) {
            currentElement = currentElement.parent().closest("[contenteditable='true'], [cid]");
          }
          if ((boundaryElement = currentElement.children().last()[0])) {
            range.setEndAfter(boundaryElement);
          }
        }
      }
    },
    deRange: function (range, applySelection, originalRange) {
      var fallbackRange = originalRange || range.cloneRange();
      try {
        var isBackward = range.isBackward,
          startPosition = this.getDetailPos(range.startContainer, range.startOffset, true),
          endPosition = this.getDetailPos(range.endContainer, range.endOffset, false);
        if (
          applySelection &&
          startPosition[0].parentElement &&
          'HR' == startPosition[0].parentElement.tagName
        ) {
          startPosition[0] = startPosition[0].parentElement.parentElement;
        }
        range.setStart.apply(range, startPosition);
        range.setEnd.apply(range, endPosition);
        range.isBackward = isBackward;
        if (originalRange && originalRange.equals(range)) {
          return originalRange;
        } else {
          if (applySelection) {
            this.setRange(range, true);
          }
          return range;
        }
      } catch (error) {}
      return fallbackRange;
    },
    selectBlock: function () {
      this._selectLine('block');
    },
    selectLine: function () {
      return this._selectLine(false);
    },
    selectLineWrap: function () {
      this._selectLine('line');
    },
    _selectLine: function (selectionUnit) {
      var currentCodeMirror, cursorPosition;
      if (this.editor.sourceView.inSourceMode) {
        cursorPosition = (currentCodeMirror = this.editor.sourceView.cm).getCursor(true);
        return void currentCodeMirror.setSelection(
          CodeMirror.Pos(cursorPosition.line, 0),
          CodeMirror.Pos(
            cursorPosition.line,
            currentCodeMirror.getLine(cursorPosition.line).length,
          ),
        );
      }
      var element = jquery(document.activeElement).closest('.CodeMirror');
      if (element.length) {
        cursorPosition = (currentCodeMirror = element[0].CodeMirror).getCursor(true);
        return void ('block' == selectionUnit
          ? currentCodeMirror.execCommand('selectAll')
          : currentCodeMirror.setSelection(
              CodeMirror.Pos(cursorPosition.line, 0),
              CodeMirror.Pos(
                cursorPosition.line,
                currentCodeMirror.getLine(cursorPosition.line).length,
              ),
            ));
      }
      if (document.activeElement && DocumentNode.isType(document.activeElement.tagName, 'INPUT')) {
        document.activeElement.select();
      } else {
        if ((currentRange = window.getSelection()).rangeCount) {
          var localElement = this.editor.getMarkElem(currentRange.commonAncestorContainer),
            range = rangy.createRange();
          if (!localElement.rawText().length) {
            return;
          }
          if (localElement.length) {
            if ('block' == selectionUnit) {
              if (localElement.closest('[mdtype="table"]').length) {
                localElement = localElement.closest('[mdtype="table"]');
              }
              this.selectAllElem(localElement);
              return localElement;
            }
            if (!localElement.closest("tr[mdtype='table_row']").length) {
              localElement.addClass('md-expand-on-selection');
              var currentRange = window.getSelection();
              if ((range = this.getRangy()).getBookmark(localElement[0]).start) {
                currentRange.modify(
                  'move',
                  'backward',
                  selectionUnit ? 'paragraphboundary' : 'sentence',
                );
              }
              currentRange.modify(
                'extend',
                'forward',
                selectionUnit ? 'paragraphboundary' : 'sentence',
              );
              range = this.getRangy();
              var currentElement = jquery(range.commonAncestorContainer).closest('.md-meta');
              if (currentElement.length) {
                this.selectAllElem(currentElement.closest('[md-inline]'));
              } else {
                if (
                  (currentElement = this.editor.getMarkElem(range.startContainer)).length &&
                  currentElement[0] !== this.editor.getMarkElem(range.endContainer)[0]
                ) {
                  range.setEndAfter(currentElement[0]);
                  this.deRange(range, true);
                }
              }
              localElement.removeClass('md-expand-on-selection');
              return localElement;
            }
            var tableRow = localElement.closest("tr[mdtype='table_row']");
            range.selectNode(tableRow[0]);
            tableRow.closest('[mdtype="table"]').attr('contenteditable', true);
            this.deRange(range, true);
            tableRow.closest('[mdtype="table"]').attr('contenteditable', false);
          }
        }
      }
    },
    fixTripleClick: function (pointerEvent) {
      var element = this.editor.getMarkElem(pointerEvent.target);
      if (element.attr('mdtype') == documentModel.TYPE.table_cell) {
        this.selectAllElem(element);
      } else {
        this.selectLineWrap();
      }
    },
    fixDblClick: function (pointerEvent) {
      var receiver = this,
        currentEditor = this.editor,
        range = this.getRangy();
      if (
        !(function () {
          var imageElement = jquery(pointerEvent.target).closest(
            "[md-inline='image'],[md-inline='imgtag']",
          );
          if (imageElement.length) {
            if ('image' == imageElement.attr('md-inline')) {
              var element = jquery(pointerEvent.target);
              if (!element.hasClass('md-image-src-span')) {
                element = element.closest('.md-image-src-span');
              }
              if (element.length) {
                if (range) {
                  var index = (element.text().match(/\s['"]/) || {}).index;
                  range.setStart(element[0], 0);
                  if (index) {
                    if (range.endOffset > index) {
                      return true;
                    }
                    range.setEnd(element[0].childNodes[0], index);
                  } else {
                    range.setEnd(element[0], 1);
                  }
                  currentEditor.selection.setRange(range);
                  return true;
                }
              } else {
                element = jquery(pointerEvent.target).closest('.md-image-before-src');
              }
              if (element.length && range) {
                var imageSyntax = element.text(),
                  startOffset = imageSyntax.indexOf(']') + 2;
                if (range.startOffset > startOffset) {
                  range.setStart(element[0].childNodes[0], startOffset);
                  range.setEnd(element[0].childNodes[0], imageSyntax.length - 1);
                  range.select(range.isBackward);
                  return true;
                }
                if (
                  range.startOffset >= 2 &&
                  range.endOffset > range.startOffset &&
                  range.endOffset < startOffset - 1
                ) {
                  range.setStart(element[0].childNodes[0], 2);
                  range.setEnd(element[0].childNodes[0], startOffset - 2);
                  range.select(range.isBackward);
                  return true;
                }
              }
              currentEditor.selection.selectAllElem(imageElement);
              return true;
            }
            if ('IMG' == pointerEvent.target.tagName) {
              currentEditor.selection.selectAllElem(imageElement);
              return true;
            }
          }
        })()
      ) {
        (function () {
          Object.defineProperty(previousInlineSibling, 'name', { value: 's', configurable: true });
          Object.defineProperty(lastSyntaxMarker, 'name', { value: 'l', configurable: true });

          if (
            range &&
            range.endContainer &&
            3 == range.endContainer.nodeType &&
            1 == range.endOffset
          ) {
            var domNode = range.endContainer,
              textSlice = domNode.textContent.substring(0, 1);
            if (/\s/.exec(textSlice)) {
              var ancestorElement = previousInlineSibling(domNode.parentElement);
              if (ancestorElement) {
                for (
                  var trailingElement = lastSyntaxMarker(ancestorElement), rangeAdjusted = false;
                  trailingElement;
                ) {
                  if (range.containsNode(trailingElement) && !trailingElement.offsetWidth) {
                    rangeAdjusted = true;
                    range.setEndBefore(trailingElement);
                  }
                  trailingElement =
                    (ancestorElement = previousInlineSibling(ancestorElement)) &&
                    lastSyntaxMarker(ancestorElement);
                }
                if (rangeAdjusted) {
                  receiver.setRange(range);
                }
                return rangeAdjusted;
              }
            }
          }
          function previousInlineSibling(inputDomNode) {
            for (
              var previousElementSibling = inputDomNode.previousElementSibling;
              !previousElementSibling &&
              !(inputDomNode = inputDomNode.parentElement).getAttribute('cid') &&
              inputDomNode;
            ) {
              previousElementSibling = inputDomNode.previousElementSibling;
            }
            return previousElementSibling;
          }
          function lastSyntaxMarker(element) {
            if (element.classList.contains('md-meta')) {
              return element;
            }
            for (; element; ) {
              if (!element.children) {
                return null;
              }
              if (
                (element = element.children[element.children.length - 1]) &&
                element.classList &&
                element.classList.contains('md-meta')
              ) {
                return element;
              }
            }
            return null;
          }
        })();
      }
    },
    selectWord: function (
      respectWordBoundaries,
      includeTrailingSpace,
      range,
      returnOnly,
      forSpellcheck,
    ) {
      var codeMirror, selectionRange;
      if (this.editor.sourceView.inSourceMode) {
        selectionRange = (codeMirror = this.editor.sourceView.cm).findWordAt(
          codeMirror.getCursor(),
        );
        return void (
          !returnOnly && codeMirror.extendSelection(selectionRange.anchor, selectionRange.head)
        );
      }
      this.selectWordTime = new Date();
      var element = jquery(document.activeElement).closest('.CodeMirror');
      if (element.length) {
        selectionRange = (codeMirror = element[0].CodeMirror).findWordAt(codeMirror.getCursor());
        return void (
          !returnOnly && codeMirror.extendSelection(selectionRange.anchor, selectionRange.head)
        );
      }
      if ((range = range || this.getRangy())) {
        var currentElement = null;
        if (
          respectWordBoundaries &&
          (currentElement = jquery(range.startContainer).closest('.md-meta, .md-content')).length
        ) {
          range.selectNode(currentElement.closest('[md-inline]')[0]);
          if (!returnOnly) {
            this.setRange(range);
          }
          return range;
        }
        if (
          (currentElement = jquery(range.startContainer).closest(
            ".md-content, [md-inline='url'], [md-inline='emoji'], [md-inline='escape']",
          )).length
        ) {
          range.selectNode(currentElement.closest('[md-inline]')[0]);
          if (!returnOnly) {
            this.setRange(range, true);
          }
          return range;
        }
        if (!(currentElement = jquery(range.startContainer).closest('[md-inline]')).length) {
          currentElement = jquery(range.startContainer).closest('[cid]');
        }
        if (currentElement.length) {
          var start = range.getBookmark(currentElement[0]).start,
            text = currentElement.rawText(),
            cjkPattern = /[\u3040-\uABFF\uD7A4-\uFAFF]/,
            letterPattern = /[a-zA-Z\u00C0-\u00ff]/,
            alphanumericPattern = /[0-9a-zA-Z\u00C0-\u00ff]/,
            apostrophePattern = /^['’‚‛]$/,
            items = [],
            cjkRun = null;
          text
            .split(
              forSpellcheck ? utilities.WESTERN_WORD_SPLITTER_SPELLCHECKER : WESTERN_WORD_SPLITTER,
            )
            .filter(function (item) {
              return !!item;
            })
            .forEach(function (item) {
              if (cjkPattern.test(item)) {
                if (cjkRun) {
                  cjkRun += item;
                } else {
                  cjkRun = item;
                }
              } else {
                if (cjkRun) {
                  items.push(cjkRun);
                } else {
                  var itemsLength = items.length;
                  if (apostrophePattern.exec(items[itemsLength - 1] || '')) {
                    if (
                      letterPattern.exec(item) &&
                      letterPattern.exec(items[itemsLength - 2] || '')
                    ) {
                      return void (items[itemsLength - 2] =
                        items[itemsLength - 2] + items.pop() + item);
                    }
                  } else {
                    if (
                      '.' == items[itemsLength - 1] &&
                      alphanumericPattern.exec(item) &&
                      alphanumericPattern.exec(items[itemsLength - 2] || '')
                    ) {
                      return void (items[itemsLength - 2] =
                        items[itemsLength - 2] + items.pop() + item);
                    }
                  }
                }
                items.push(item);
                cjkRun = null;
              }
            });
          if (cjkRun) {
            items.push(cjkRun);
          }
          if (items.length) {
            var currentStart = 0,
              textLength = text.length,
              wordStart = 0,
              itemIndex = 0,
              atWordEnd = false;
            for (itemIndex = 0; itemIndex < items.length; itemIndex++) {
              var length = items[itemIndex].length;
              if (wordStart + length >= start) {
                atWordEnd = wordStart + length == start;
                break;
              }
              wordStart += length;
            }
            if (itemIndex >= items.length - 1) {
              currentStart = (textLength = text.length) - items.last().length;
              if (respectWordBoundaries && utilities.NOT_WORD.exec(items.last())) {
                return;
              }
            } else {
              if (atWordEnd && !utilities.NOT_WORD.exec(items[itemIndex + 1])) {
                textLength =
                  (currentStart = wordStart + items[itemIndex].length) +
                  items[1 + itemIndex].length;
                if (includeTrailingSpace && /\s/.exec(items[itemIndex + 2] || 'a')) {
                  textLength += 1;
                }
              } else {
                if (utilities.NOT_WORD.exec(items[itemIndex])) {
                  if (respectWordBoundaries) {
                    return;
                  }
                  textLength =
                    (currentStart = wordStart + items[itemIndex].length) +
                    items[1 + itemIndex].length;
                } else {
                  textLength = (currentStart = wordStart) + items[itemIndex].length;
                  if (includeTrailingSpace && /\s/.exec(items[itemIndex + 1] || 'a')) {
                    textLength += 1;
                  }
                }
              }
            }
            range.moveToBookmark({
              containerNode: currentElement[0],
              start: currentStart,
              end: textLength,
            });
            if (!returnOnly) {
              this.setRange(range, true);
              this.editor.wordCount.updateInSelection();
            }
            return range;
          }
        }
      }
    },
    selectPhrase: function () {
      if (this.editor.sourceView.inSourceMode) {
        var codeMirror = this.editor.sourceView.cm,
          selectionRange = codeMirror.findWordAt(codeMirror.getCursor());
        codeMirror.extendSelection(selectionRange.anchor, selectionRange.head);
      } else {
        if (
          document.activeElement &&
          DocumentNode.isType(document.activeElement.tagName, 'INPUT')
        ) {
          document.activeElement.select();
        } else {
          var element = jquery(document.activeElement).closest('.CodeMirror');
          if (element.length) {
            (codeMirror = element[0].CodeMirror).execCommand('selectAll');
          } else {
            var selectionContainer,
              range = this.getRangy(true),
              selectContainerContents = false;
            if (range) {
              if (this.editor.styleBookmark.style) {
                var block = this.editor.styleBookmark.style.block;
                if (
                  block.indexOf(NodeType.def_footnote) > -1 ||
                  block.indexOf(NodeType.def_link) > -1
                ) {
                  if (/md-def-(name|url|title)|/gi.exec(document.activeElement.className)) {
                    selectContainerContents = true;
                    selectionContainer = jquery(range.startContainer).closest(
                      '.md-def-name, .md-def-url, .md-def-title',
                    )[0];
                  }
                } else {
                  if (block.indexOf(NodeType.table) > -1) {
                    selectContainerContents = true;
                    selectionContainer = jquery(range.startContainer).closest(
                      "[mdtype='table_cell']",
                    )[0];
                  }
                }
                if (
                  (selectionContainer =
                    selectionContainer ||
                    Object.defineProperty(
                      function closestEditableBoundary(domNode) {
                        if (domNode) {
                          if (domNode.nodeType === domNode.ELEMENT_NODE) {
                            if (
                              domNode.hasAttribute('md-inline') &&
                              domNode.getAttribute('md-inline') !== NodeType.plain
                            ) {
                              return domNode;
                            } else {
                              if (domNode.hasAttribute('mdtype')) {
                                return domNode;
                              } else {
                                if (
                                  domNode.classList.contains('md-def-name') ||
                                  domNode.classList.contains('md-def-content') ||
                                  domNode.classList.contains('md-def-title')
                                ) {
                                  return domNode;
                                } else {
                                  return closestEditableBoundary(domNode.parentElement);
                                }
                              }
                            }
                          } else {
                            if (domNode.nodeType === domNode.TEXT_NODE) {
                              return closestEditableBoundary(domNode.parentElement);
                            } else {
                              return null;
                            }
                          }
                        } else {
                          return null;
                        }
                      },
                      'name',
                      { value: 'e', configurable: true },
                    )(range.startContainer))
                ) {
                  (function (inputElement, selectionRange, contentsOnly) {
                    if (inputElement.getAttribute('md-inline') == NodeType.image) {
                      contentsOnly = false;
                      inputElement = inputElement.children[0];
                    }
                    if (contentsOnly) {
                      selectionRange.selectNodeContents(inputElement);
                    } else {
                      selectionRange.selectNode(inputElement);
                      editor.selection.deRange(selectionRange);
                    }
                  })(selectionContainer, range, selectContainerContents);
                  return this.setRange(range, true);
                }
              }
              return this.selectWord();
            }
          }
        }
      }
    },
    isCrossBlock: function (range) {
      if ((range = range || this.getRangy())) {
        return (
          !range.collapsed &&
          this.editor.getJQueryElem(range.commonAncestorContainer).find('[mdtype]').length
        );
      } else {
        return range;
      }
    },
    handleMouseSelection: function (pointerEvent) {
      if ('false' == this.editor.writingArea.getAttribute('contenteditable')) {
        if (!this.getBlockFromMouseEvent(pointerEvent).closest('.md-focus').length) {
          this.editor.writingArea.setAttribute('contenteditable', 'true');
        }
      }
    },
    getBlockFromMouseEvent: function (pointerEvent) {
      var target = pointerEvent.target;
      if (!this.editor.writingArea.contains(pointerEvent.target)) {
        target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY);
      }
      return jquery(target).closest('[cid]');
    },
    getTextAround: function () {
      var precedingText,
        followingText,
        range = this.getRangy();
      if (range && range.collapsed) {
        var inlineElement = jquery(range.startContainer).closest(
          "[md-inline='plain'], .md-lang",
        )[0];
        if (inlineElement) {
          var selectionBookmark = range.getBookmark(inlineElement);
          range.setStartBefore(inlineElement);
          precedingText = range.toString();
          range.collapse(false);
          range.setEndAfter(inlineElement);
          followingText = range.toString();
          range.setStart(inlineElement, 0);
          return [precedingText, followingText, selectionBookmark];
        }
      }
      return [];
    },
    getTextInSelection: function (range) {
      var element = jquery(document.activeElement).closest('.CodeMirror');
      if (element.length) {
        return element[0].CodeMirror.getSelection();
      } else {
        if (
          (range = range || this.getRangy()) &&
          !range.collapsed &&
          jquery(range.commonAncestorContainer).closest('#write').length
        ) {
          return jquery(jquery.parseHTML('<div>' + range.toHtml() + '</div>'))
            .find('[mdtype]')
            .after('\n')
            .filter('.md-toc')
            .text('[toc]')
            .end()
            .filter('.md-math-block')
            .text(function () {
              return jquery(this).find('script').html();
            })
            .end()
            .find('.CodeMirror-gutter-wrapper')
            .remove()
            .end()
            .end()
            .text();
        } else {
          return '';
        }
      }
    },
    extendRange: function (range, endOffset) {
      if (range.commonAncestorContainer.nodeType === document.TEXT_NODE) {
        if (endOffset > 0 && range.endOffset + endOffset <= range.commonAncestorContainer.length) {
          range.setEnd(range.commonAncestorContainer, range.endOffset + endOffset);
          return range;
        }
        if (endOffset < 0 && range.startOffset + endOffset >= 0) {
          range.setStart(range.commonAncestorContainer, range.startOffset + endOffset);
          return range;
        }
      }
      var containerNode = jquery(range.startContainer).closest('[cid]')[0],
        selectionBookmark = range.getBookmark(containerNode);
      if (selectionBookmark.containerNode) {
        if (endOffset > 0) {
          selectionBookmark.end += endOffset;
        } else {
          selectionBookmark.start += endOffset;
        }
        range.moveToBookmark(selectionBookmark);
        return range;
      } else {
        return range;
      }
    },
    createRange: function (startContainer, startOffset, endContainer, endOffset) {
      var range = rangy.createRange();
      range.setStart(startContainer, startOffset);
      range.setEnd(endContainer, endOffset);
      if (range.startContainer) {
        return range;
      } else {
        return null;
      }
    },
    moveToSelectable: function (moveToEnd, documentNode) {
      return focusBlockBoundary(this.editor, moveToEnd, documentNode);
    },
    includeTrailMeta: function (range) {
      Object.defineProperty(adjacentRangeBoundary, 'name', { value: 't', configurable: true });

      if (!range || range.collapsed) {
        return range;
      }
      function adjacentRangeBoundary(domNode, backward, inputDomNode) {
        var currentDomNode = backward ? domNode.previousElementSibling : domNode.nextElementSibling;
        if (
          domNode == range.commonAncestorContainer ||
          domNode.parentElement == range.commonAncestorContainer ||
          !domNode.parentElement ||
          (domNode.getAttribute && domNode.getAttribute('cid'))
        ) {
          return inputDomNode;
        } else {
          if (
            currentDomNode &&
            currentDomNode.classList &&
            currentDomNode.classList.contains('md-meta') &&
            !jquery(currentDomNode.parentElement).closest('.md-expand').length
          ) {
            inputDomNode = currentDomNode;
          }
          return adjacentRangeBoundary(domNode.parentElement, backward, inputDomNode);
        }
      }
      var rangeAdjusted;
      if (0 == range.startOffset) {
        var leadingElement = adjacentRangeBoundary(range.startContainer, true);
        if (leadingElement) {
          rangeAdjusted = true;
          range.setStart(leadingElement, 0);
        }
      }
      if (
        (range.endContainer.childNodes &&
          range.endOffset == range.endContainer.childNodes.length) ||
        (range.endContainer.nodeType == document.TEXT_NODE &&
          range.endOffset == range.endContainer.nodeValue.length)
      ) {
        var trailingElement = adjacentRangeBoundary(range.endContainer, false);
        if (trailingElement) {
          rangeAdjusted = true;
          range.setEnd(trailingElement, trailingElement.childNodes.length);
        }
      }
      if (rangeAdjusted) {
        this.setRange(range, true);
      }
      return range;
    },
  };
  var cancelNavigationEvent = Object.defineProperty(
      function (event) {
        if (event) {
          event.codemirrorIgnore = true;
          event.preventDefault();
          event.stopPropagation();
        }
      },
      'name',
      { value: 'y', configurable: true },
    ),
    isUnholdableBlock = Object.defineProperty(
      function (documentNode, element) {
        return (
          DocumentNode.isType(documentNode, DocumentNode.TYPE.hr, DocumentNode.TYPE.toc) &&
          (!element || ('write' !== element.attr('id') && element[0].hasAttribute('tabindex')))
        );
      },
      'name',
      { value: 'b', configurable: true },
    ),
    containsNonPlainInline = Object.defineProperty(
      function (element) {
        var domNode = element[0];
        return (
          domNode.childElementCount > 0 &&
          (function () {
            for (var childIndex = 0; childIndex < domNode.childElementCount; childIndex++) {
              if (domNode.children[0].getAttribute('md-inline') !== NodeType.image) {
                return false;
              }
            }
            return true;
          })()
        );
      },
      'name',
      { value: 'w', configurable: true },
    ),
    getEmbeddedCodeMirror = Object.defineProperty(
      function (editorInstance, element, cursorPosition) {
        var codeMirrorResult;
        if (element.getAttribute('mdtype') === NodeType.fences) {
          codeMirrorResult = editorInstance.fences.getCm(element.getAttribute('cid'));
        }
        if (element.getAttribute('mdtype') === NodeType.math_block) {
          codeMirrorResult = editorInstance.mathBlock.startEditing(jquery(element));
        }
        if (element.getAttribute('mdtype') === NodeType.html_block) {
          codeMirrorResult = editorInstance.htmlBlock.startEditing(jquery(element));
        }
        if (codeMirrorResult) {
          if (codeMirrorResult.then) {
            codeMirrorResult.then((result) => {
              result.focus();
              result.setCursor(cursorPosition);
            });
          } else {
            codeMirrorResult.focus();
            codeMirrorResult.setCursor(cursorPosition);
          }
          return true;
        }
      },
      'name',
      { value: 'x', configurable: true },
    ),
    alignCodeMirrorCursor = Object.defineProperty(
      function (codeMirror, right) {
        if (void 0 != right) {
          var bounds = codeMirror.cursorCoords(codeMirror.getCursor());
          bounds.left = bounds.right = right;
          var cursorPosition = codeMirror.coordsChar(bounds);
          codeMirror.setCursor(cursorPosition);
        }
      },
      'name',
      { value: 'C', configurable: true },
    ),
    focusBlockBoundary = Object.defineProperty(
      function (editorInstance, moveToEnd, documentNode, keyboardEvent, moveCommand, targetLeft) {
        if (!documentNode) {
          return false;
        }
        var nodeElement = editorInstance.findElemById(documentNode.id);
        editorInstance.lastCursor = editorInstance.selection.buildUndo();
        var hasNoMoveCommand = !moveCommand;
        if (DocumentNode.isType(documentNode, NodeType.fences)) {
          (codeMirror = editorInstance.fences.getCm(documentNode.id)).focus();
          if (moveToEnd) {
            nodeElement.find('.marklyra-input-after').focus();
            setTimeout(function () {
              if (File.isTypeWriterMode && File.option.scrollWithCursor) {
                editorInstance.selection.typeWriterScroll(
                  nodeElement.find('.marklyra-input-after'),
                );
              }
            }, 0);
          } else {
            codeMirror.execCommand('goDocStart');
            alignCodeMirrorCursor(codeMirror, targetLeft);
          }
          cancelNavigationEvent(keyboardEvent);
          return true;
        }
        if (DocumentNode.isType(documentNode, NodeType.math_block)) {
          if (moveToEnd) {
            codeMirror = editorInstance.mathBlock.startEditing(
              nodeElement,
              !documentNode.get('tagAfter') && 'end',
              hasNoMoveCommand,
            );
            if (documentNode.get('tagAfter')) {
              setTimeout(function () {
                editorInstance.selection.selectAllElem(
                  nodeElement.find('.marklyra-input-after').focus(),
                );
              }, 0);
            } else {
              alignCodeMirrorCursor(codeMirror, targetLeft);
            }
          } else {
            codeMirror = editorInstance.mathBlock.startEditing(
              nodeElement,
              !documentNode.get('tagBefore') && 'start',
              hasNoMoveCommand,
            );
            if (documentNode.get('tagBefore')) {
              setTimeout(function () {
                editorInstance.selection.selectAllElem(
                  nodeElement.find('.marklyra-input-before').focus(),
                );
              }, 0);
            } else {
              alignCodeMirrorCursor(codeMirror, targetLeft);
            }
          }
          cancelNavigationEvent(keyboardEvent);
          return true;
        }
        if (DocumentNode.isType(documentNode, NodeType.html_block)) {
          var codeMirror = editorInstance.htmlBlock.startEditing(
            nodeElement,
            moveToEnd ? 'end' : 'start',
            hasNoMoveCommand,
          );
          alignCodeMirrorCursor(codeMirror, targetLeft);
          cancelNavigationEvent(keyboardEvent);
          return true;
        }
        return (
          !!isUnholdableBlock(documentNode) &&
          (cancelNavigationEvent(keyboardEvent),
          window.getSelection().removeAllRanges(),
          editorInstance.findElemById(documentNode.id).focus(),
          editorInstance.refocus(),
          true)
        );
      },
      'name',
      { value: 'F', configurable: true },
    ),
    normalizeEmptyLineRange = Object.defineProperty(
      function (range, skipAdjustment) {
        if (
          (function (inputRange) {
            return (
              inputRange.collapsed &&
              inputRange.startContainer &&
              inputRange.startContainer.nodeType == document.TEXT_NODE &&
              '\n' == inputRange.startContainer.textContent &&
              (inputRange.startContainer.nextSibling || {}.classList) &&
              inputRange.startContainer.nextSibling.classList.contains('md-emptyline')
            );
          })(range)
        ) {
          return range.startContainer.nextSibling.getBoundingClientRect();
        }
        var element,
          rangeRects = range.getClientRects(),
          bounds = 1 == rangeRects.length && rangeRects[rangeRects.length - 1];
        if (rangeRects.length > 1) {
          if (skipAdjustment) {
            return false;
          }
          bounds = range.getBoundingClientRect();
        }
        if (!bounds && range.collapsed) {
          if (
            (element =
              range.startContainer.nodeType == document.TEXT_NODE
                ? range.startContainer.parentElement
                : range.startContainer) &&
            'write' != element.getAttribute('id')
          ) {
            if ((bounds = element.getBoundingClientRect()).height > 150) {
              return null;
            } else {
              return bounds;
            }
          } else {
            return null;
          }
        } else {
          return bounds;
        }
      },
      'name',
      { value: 'S', configurable: true },
    );
  moduleRecord.exports = SelectionController;
  moduleRecord.exports.buildRange = function (containerNode, startOffset, endOffset) {
    if (!containerNode) {
      return window.getSelection().removeAllRanges();
    }
    var textOffset = 0,
      range = rangy.createRange(),
      foundStart = false,
      stopTraversal = {};
    range.collapseToPoint(containerNode, 0);
    try {
      !Object.defineProperty(
        function locateTextOffsets(domNode) {
          if (3 == domNode.nodeType) {
            var nextTextOffset = textOffset + domNode.textContent.length;
            if (!foundStart && startOffset >= textOffset && startOffset <= nextTextOffset) {
              range.setStart(domNode, startOffset - textOffset);
              foundStart = true;
            }
            if (foundStart && endOffset >= textOffset && endOffset <= nextTextOffset) {
              range.setEnd(domNode, endOffset - textOffset);
              throw stopTraversal;
            }
            textOffset = nextTextOffset;
          } else {
            for (
              var itemIndex = 0, childNodesLength = domNode.childNodes.length;
              itemIndex < childNodesLength;
              ++itemIndex
            ) {
              locateTextOffsets(domNode.childNodes[itemIndex]);
            }
          }
        },
        'name',
        { value: 'e', configurable: true },
      )(containerNode);
    } catch (error) {
      if (error == stopTraversal) {
        return range;
      }
      throw error;
    }
  };
  moduleRecord.exports.rangy = rangy;
}
