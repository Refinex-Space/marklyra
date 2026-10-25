// editing/selection.
// SystemJS module 32. Dependencies: 11, e, 1d, 20, 13, 27.
$__System.registerDynamic(
  '32',
  ['11', 'e', '1d', '20', '13', '27'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var timerId,
      utilities = requireModule('11'),
      jquery = requireModule('e'),
      rangy = requireModule('1d'),
      CodeMirror = requireModule('20'),
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      map = requireModule('27').map,
      NodeType = DocumentNode.TYPE,
      WESTERN_WORD_SPLITTER = utilities.WESTERN_WORD_SPLITTER;
    window.setAttributeOnlyNeeded = function (element, attributeName, attributeValue) {
      if (element.getAttribute(attributeName) != attributeValue) {
        if (
          'true' == attributeValue &&
          'write' == element.id &&
          '<p>&nbsp;</p>' == element.children[0].outerHTML
        )
          return;
        if (
          (element.setAttribute(attributeName, attributeValue),
          'write' === element.id && File.isNode && 'false' === attributeValue)
        ) {
          var listItems = jquery('.md-list-item');
          listItems.css('display', 'block'),
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
          if (domNode && DocumentNode.isType(domNode.tagName, 'INPUT', 'TEXTAREA')) return;
          if (domNode && domNode.classList && domNode.classList.contains('marklyra-input')) return;
          var range = File.editor.selection.getRangy(),
            currentDomNode = range && range.startContainer,
            localElement = currentDomNode && currentDomNode.parentElement;
          if (localElement) {
            var currentElement = localElement.closest('[contenteditable]');
            currentElement &&
              'false' != currentElement.getAttribute('contenteditable') &&
              (currentElement.focus(), File.editor.selection.setRange(range));
          }
        }
        return !0;
      }
    };
    var currentLeft,
      clientHeight,
      m = function (inputEditor) {
        (this.rangy = rangy),
          rangy.init(),
          (this.savedSel = {}),
          (this.editor = inputEditor),
          jquery(document).on('selectionchange', function (unusedParameter1) {
            inputEditor.writingArea.contains(document.activeElement) &&
              (this.selectionBeforeBlur = null),
              inputEditor.selection.selectWordTime &&
                new Date() - inputEditor.selection.selectWordTime > 200 &&
                (inputEditor.selection.selectWordTime = null);
          }),
          this.updateMetrics(),
          jquery('#write')
            .on('mouseleave', (blurEvent) => {
              document.activeElement == blurEvent.currentTarget &&
                (this.selectionBeforeBlur || (this.selectionBeforeBlur = this.buildUndo()));
            })
            .on('cursorChange', () => {
              this.selectionBeforeBlur = null;
            });
      },
      scrollTop = jquery.fn.scrollTop;
    function v(event) {
      event.preventDefault(), event.stopPropagation();
    }
    (jquery.fn.oldScrollTop = scrollTop),
      (jquery.fn.scrollTop = function (inputScrollTop) {
        if (null !== inputScrollTop)
          return void 0 === inputScrollTop
            ? (this[0] || {}).scrollTop
            : (((this[0] || {}).scrollTop = inputScrollTop), inputScrollTop);
      }),
      jquery(document.body)
        .on('hidden.bs.modal', '.modal', function (unusedParameter1) {
          File.editor.restoreLastCursor();
        })
        .on('.show.bs.modal', '.modal', function () {
          var lastCursor = File.editor.selection.buildUndo();
          lastCursor && (File.editor.lastCursor = lastCursor);
        }),
      (rangy.rangePrototype.insertNodeAtEnd = function (insertedNode) {
        var endRange = this.cloneRange();
        endRange.collapse(!1),
          endRange.insertNode(insertedNode),
          endRange.detach(),
          this.setEndAfter(insertedNode);
      }),
      jquery(window).on('resize', function () {
        File.suppressResize || (clientHeight = document.querySelector('content').clientHeight);
      }),
      (m.prototype = {
        clearGlobalColumn: function () {
          currentLeft = void 0;
        },
        updateMetrics: function () {
          clientHeight = document.querySelector('content').clientHeight;
          var defaultTextHeight = this.editor.defaultTextHeight;
          (this.editor.defaultTextHeight = parseInt(jquery('#write p').css('line-height'))),
            (!isNaN(this.editor.defaultTextHeight) && this.editor.defaultTextHeight) ||
              (this.editor.defaultTextHeight = defaultTextHeight);
        },
        jumpIntoElemBegin: function (element, deferRefocus) {
          try {
            var receiver = this,
              currentEditor = this.editor,
              codeMirrorElement = element.find('.CodeMirror')[0],
              childBlocks = element.children('[mdtype]');
            if (!element || !element.length)
              return (
                console.sendError('cannot jumpIntoElemBegin to empty elem', 'warning'),
                window.getSelection().removeAllRanges(),
                !1
              );
            if ((element.length > 1 && (element = jquery(element[0])), codeMirrorElement))
              return (
                codeMirrorElement.CodeMirror.focus(),
                codeMirrorElement.CodeMirror.execCommand('goDocStart')
              );
            if (F(currentEditor, !1, currentEditor.findNodeByElem(element))) return;
            if (
              DocumentNode.isType(
                element.attr('mdtype'),
                DocumentNode.TYPE.image,
                DocumentNode.TYPE.hr,
                DocumentNode.TYPE.math_block,
              )
            )
              return this.selectNode(null, element);
            if (element.hasClass('footnotes'))
              return this.jumpIntoElemBegin(element.find('.md-def-name'));
            if (childBlocks.length)
              return this.jumpIntoElemBegin(jquery(childBlocks[0]), deferRefocus);
            var range = rangy.createRange();
            return (
              element[0].querySelector('[md-inline]') &&
                element[0].querySelector('[md-inline]').classList.add('md-expand'),
              range.setStart(element[0], 0),
              range.setEnd(element[0], 0),
              this.deRange(range),
              receiver.setRange(range, !0),
              deferRefocus
                ? setTimeout(function () {
                    receiver.setRange(range, !0), receiver.editor.refocus();
                  }, 20)
                : !window.getSelection().anchorNode &&
                  element.length &&
                  (!(function e(domNode) {
                    3 == domNode.nodeType
                      ? (range.setStart(domNode, 0), range.setEnd(domNode, 0))
                      : domNode.childNodes.length
                        ? e(domNode.childNodes[0])
                        : (range.setStart(domNode, 0), range.setEnd(domNode, 0));
                  })(element[0]),
                  window.getSelection().addRange(range.nativeRange)),
              window.getSelection().anchorOffset
            );
          } catch (error) {
            console.sendError('cursor may go wrong', !1),
              Reporter.error('cursor may go wrong', {
                level: 'warning',
                filename: 'Selection.js',
                extra: { dom: element && Reporter.sanitizeDom(element[0]) },
              });
          }
        },
        jumpIntoElemEnd: function (element, deferRefocus) {
          var codeMirrorElement = element.find('.CodeMirror')[0];
          if ((element.length > 1 && (element = jquery(element[0])), codeMirrorElement))
            codeMirrorElement.CodeMirror.execCommand('goDocEnd');
          else {
            if (F(this.editor, !0, this.editor.findNodeByElem(element))) return;
            if (
              DocumentNode.isType(
                element.attr('mdtype'),
                DocumentNode.TYPE.image,
                DocumentNode.TYPE.hr,
                DocumentNode.TYPE.math_block,
              )
            )
              return this.selectNode(null, element);
            if (element.children('[mdtype]').length)
              return this.jumpIntoElemEnd(jquery(element.children('[mdtype]')[0]), deferRefocus);
            if (element.hasClass('md-def-footnote')) {
              var range = rangy.createRange();
              range.setStart(element.find('.md-def-content')[0], 1),
                range.setEnd(element.find('.md-def-content')[0], 1),
                this.deRange(range, !0);
            } else
              element.addClass('md-expand'),
                this.restoreSelection(element[0], element.text().length),
                element.removeClass('md-expand');
          }
        },
        jumpInto: function (element, offset) {
          if ('' == element.text()) return this.jumpIntoElemBegin(element);
          this.restoreSelection(element[0], offset);
        },
        fixUnselectableRange: function (range, checkOnly) {
          if (!range || !range.collapse) return !1;
          var domNode = (range.startContainer.childNodes || [])[range.startOffset];
          return (
            !(!domNode || 'IMG' != domNode.tagName) &&
            (!!checkOnly ||
              (range.setStart(
                domNode.previousElementSibling,
                domNode.previousElementSibling.childNodes.length - 1,
              ),
              range.collapse(!0),
              !0))
          );
        },
        setRange: function (range, skipExpansion) {
          if (range) {
            if (
              ((this.selectionBeforeBlur = null), this.fixUnselectableRange(range), !skipExpansion)
            ) {
              var element = this.editor.brush.closestExpandable(jquery(range.startContainer)),
                currentElement = this.editor.brush.closestExpandable(jquery(range.endContainer));
              (currentElement.is(element.next()) &&
                element.hasClass('md-image') &&
                range.endContainer.length == range.endOffset) ||
                element.addClass('md-expand'),
                currentElement.addClass('md-expand');
            }
            range.commonAncestorContainer &&
              range.commonAncestorContainer.getAttribute &&
              'linebreak' == range.commonAncestorContainer.getAttribute('md-inline') &&
              '\n' == range.toString() &&
              range.collapse(!0),
              File.isTypeWriterMode &&
                File.option.scrollWithCursor &&
                (timerId = setTimeout(() => {
                  this.typeWriterScroll();
                }, 180)),
              this.rangy.getSelection().setSingleRange(range, range.isBackward),
              this.editor.wordCount.updateInSelection(this.getTextInSelection(range)),
              jquery(this.editor.sessionStr).trigger('cursorChange');
          }
        },
        getOffset: function (containerNode, selectionRange) {
          if (
            (selectionRange &&
              !selectionRange.nativeRange &&
              (selectionRange = this.wrappedRange(selectionRange)),
            (selectionRange = selectionRange || this.getRangy()))
          )
            try {
              return (
                void 0 !== containerNode.length && (containerNode = containerNode[0]),
                selectionRange.getBookmark(containerNode).start
              );
            } catch (error) {}
          return 0;
        },
        restoreEdge: function (containerNode, start, restoreEnd, existingRange) {
          containerNode.jquery && (containerNode = containerNode.length ? containerNode[0] : null);
          var targetRange = existingRange,
            range = rangy.createRange();
          return containerNode
            ? (range.moveToBookmark({ containerNode: containerNode, start: start, end: start }),
              targetRange
                ? (restoreEnd
                    ? targetRange.setEnd(range.endContainer, range.endOffset)
                    : targetRange.setStart(range.startContainer, range.startOffset),
                  targetRange)
                : range)
            : targetRange || range;
        },
        saveSelection: function (containerNode, selectionRange) {
          if (containerNode)
            return (
              containerNode.jquery && (containerNode = containerNode[0]),
              (selectionRange = selectionRange || this.getRangy())
                ? ((this.savedSel = selectionRange.getBookmark(containerNode)), this.savedSel)
                : void 0
            );
        },
        restoreSelection: function (element, start) {
          if (!element) return window.getSelection().removeAllRanges();
          if ((element.jquery && (element = element[0]), !element))
            return window.getSelection().removeAllRanges();
          var wasNonEditable = 'false' === element.getAttribute('contenteditable');
          if (
            (void 0 === start || null === start || '' === start
              ? (start = this.savedSel)
              : 'number' == typeof start && (start = { start: start, end: start }),
            !x(this.editor, element, start.start))
          ) {
            var range = rangy.createRange();
            if (
              (range.moveToBookmark({ start: start.start, end: start.end, containerNode: element }),
              range.endContainer == element && 0 == range.endOffset && start.end > 0)
            ) {
              var length = element.rawText().length;
              start.end > length &&
                range.moveToBookmark({
                  start: Math.min(start.start, length),
                  end: Math.min(start.end, length),
                  containerNode: element,
                });
            }
            if (
              'BODY' == document.activeElement.tagName ||
              ('write' !== document.activeElement.id &&
                document.activeElement.hasAttribute('tabindex'))
            ) {
              var scrollTop = jquery('content').scrollTop();
              this.editor.writingArea.focus(), jquery('content').scrollTop(scrollTop);
            }
            return (
              range.collapsed && this.deRange(range),
              wasNonEditable && element.setAttribute('contenteditable', 'true'),
              this.setRange(range),
              !wasNonEditable ||
                element.classList.contains('md-def-link') ||
                element.classList.contains('md-def-footnote') ||
                element.setAttribute('contenteditable', 'false'),
              range
            );
          }
        },
        getVeryFirstElem: function (element) {
          return element.children('[cid]').length > 0
            ? this.getVeryFirstElem(element.children('[cid]').first())
            : element;
        },
        getVeryLastElem: function (element) {
          return element.children('[cid]').length > 0
            ? this.getVeryLastElem(element.children('[cid]').last())
            : element;
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
                if ((element = element.closest('[cid]')) && !element.querySelector('[cid]'))
                  return (
                    currentEditor.undo.addSnap(element.getAttribute('cid'), SnapFlag.NONE),
                    currentEditor.brush.addToQueue(element.getAttribute('cid')),
                    !0
                  );
              }
            })()
          ) {
            (currentLeft = void 0),
              File.inBusyMode &&
                setAttributeOnlyNeeded(this.editor.writingArea, 'contenteditable', 'false');
            try {
              if (hasSelection) {
                if (preserveSelection) return editCommand;
                if (currentEditor.UserOp.surroundPair(currentEditor, text, range))
                  return void (event && event.preventDefault());
                editCommand = currentEditor.UserOp.backspaceHandler(
                  currentEditor,
                  null,
                  'delSelection',
                  !0,
                  !0,
                );
              }
              range = this.getRangy();
              var currentDocumentNodeInstance,
                pairHandled,
                selection = this.rangy.getSelection(),
                atAnchorEnd =
                  selection.anchorOffset == rangy.dom.getNodeLength(selection.anchorNode),
                localElement = currentEditor.getJQueryElem(selection.anchorNode),
                blockElement = currentEditor.getMarkElem(selection.anchorNode),
                documentNode = currentEditor.findNodeByElem(blockElement),
                selectionBookmark = range.getBookmark(blockElement[0]);
              if (localElement[0] == this.editor.writingArea) {
                if (0 != range.startOffset)
                  return selection.removeAllRanges(), void (event && event.preventDefault());
                this.jumpTop();
              }
              if (localElement.hasClass('marklyra-input') || !documentNode) return;
              if (
                (editCommand ||
                  preserveSelection ||
                  (currentEditor.undo.addSnap(documentNode.cid, SnapFlag.NONE),
                  currentEditor.brush.addToQueue(documentNode.cid)),
                File.inBusyMode)
              ) {
                var currentElement = localElement.closest("[contenteditable='true']");
                document.activeElement !== currentElement[0] && currentElement.focus();
              }
              if (localElement.hasClass('md-def-url') && (text.match(/\s/g) || []).length)
                return (
                  atAnchorEnd && this.jumpIntoElemBegin(blockElement.find('.md-def-title')),
                  event && event.preventDefault()
                );
              if (!preserveSelection && editCommand) {
                var nodeId = blockElement.attr('cid'),
                  snapshotFlag = text.length > 1 ? SnapFlag.REPLACE : SnapFlag.ADD;
                (editCommand.source = nodeId + '#' + snapshotFlag), (editCommand.date = new Date());
              }
              if (
                ((blockElement.is('.unholdable')
                  ? blockElement
                  : blockElement.closest('.unholdable')
                )
                  .find('.math-jax-postprocess>.md-math-after-sym')
                  .text(''),
                DocumentNode.isType(documentNode, NodeType.def_link, NodeType.def_footnote))
              ) {
                if (blockElement[0] == localElement[0] && range.collapsed)
                  return void this.jumpIntoElemBegin(blockElement.find('.md-def-name'));
              } else
                documentNode.get('type') == NodeType.meta_block ||
                  documentNode.get('type') == NodeType.fences ||
                  (documentNode.isBlock() && documentNode.canNotDirectEdit()
                    ? (window.getSelection().removeAllRanges(), event && event.preventDefault())
                    : localElement.hasClass('md-image') &&
                      (1 != range.startOffset ||
                        localElement.prev().length ||
                        (localElement.before('​'),
                        range.setStartBefore(localElement.parent()),
                        selection.setSingleRange(range))));
              if (documentNode.get('children').length) {
                console.debug('wrong cursor');
                var childNodes = window.getSelection().anchorNode.childNodes,
                  anchorOffset = window.getSelection().anchorOffset,
                  previousChild = anchorOffset > 0 ? childNodes[anchorOffset - 1] : null,
                  followingChild =
                    anchorOffset < childNodes.length ? childNodes[anchorOffset] : null,
                  currentDocumentNode = currentEditor.findNodeByElem(
                    previousChild ? currentEditor.getMarkElem(previousChild) : [],
                  ),
                  localDocumentNode = currentEditor.findNodeByElem(
                    followingChild ? currentEditor.getMarkElem(followingChild) : [],
                  );
                if (
                  ((text = text.replace(/\u200B/g, '')),
                  DocumentNode.isType(localDocumentNode, documentModel.TYPE.table))
                ) {
                  currentEditor.undo.endSnap(!0),
                    (editCommand = editCommand || UndoManager.makeEmptyCommand());
                  var documentNodeInstance = new DocumentNode({
                    type: documentModel.TYPE.paragraph,
                    text: text,
                    in: localDocumentNode.get('in'),
                  });
                  localDocumentNode.addBefore(documentNodeInstance),
                    UndoManager.addUndoForInsert(editCommand, documentNodeInstance),
                    currentEditor
                      .findElemById(localDocumentNode.id)
                      .before(documentNodeInstance.toHTML()),
                    currentEditor.selection.restoreSelection(
                      currentEditor.findElemById(documentNodeInstance.id)[0],
                      text.length,
                    ),
                    (currentDocumentNodeInstance = documentNodeInstance);
                } else if (DocumentNode.isType(currentDocumentNode, documentModel.TYPE.table)) {
                  currentEditor.undo.endSnap(!0),
                    (editCommand = editCommand || UndoManager.makeEmptyCommand());
                  documentNodeInstance = new DocumentNode({
                    type: documentModel.TYPE.paragraph,
                    text: text,
                    in: currentDocumentNode.get('in'),
                  });
                  currentDocumentNode.addAfter(documentNodeInstance),
                    UndoManager.addUndoForInsert(editCommand, documentNodeInstance),
                    currentEditor
                      .findElemById(currentDocumentNode.id)
                      .after(documentNodeInstance.toHTML()),
                    currentEditor.selection.restoreSelection(
                      currentEditor.findElemById(documentNodeInstance.id)[0],
                      text.length,
                    ),
                    (currentDocumentNodeInstance = documentNodeInstance);
                } else
                  localDocumentNode
                    ? ((localDocumentNode = localDocumentNode.getVeryFirst()),
                      currentEditor.undo.addSnap(localDocumentNode.cid, SnapFlag.NONE),
                      localDocumentNode.set(
                        'text',
                        text + localDocumentNode.safeGetStrAttr('text', !0),
                      ),
                      currentEditor
                        .findElemById(localDocumentNode.id)
                        .replaceWith(localDocumentNode.toHTML()),
                      localDocumentNode &&
                        currentEditor.selection.jumpInto(
                          currentEditor.findElemById(localDocumentNode.id),
                          1,
                        ),
                      (editCommand = null))
                    : currentDocumentNode &&
                      ((currentDocumentNode = currentDocumentNode.getVeryFirst(!0)),
                      currentEditor.undo.addSnap(currentDocumentNode.cid, SnapFlag.NONE),
                      currentDocumentNode.set(
                        'text',
                        currentDocumentNode.safeGetStrAttr('text', !0) + text,
                      ),
                      currentEditor
                        .findElemById(currentDocumentNode.id)
                        .replaceWith(currentDocumentNode.toHTML()),
                      currentEditor.selection.jumpIntoElemEnd(
                        currentEditor.findElemById(currentDocumentNode.id),
                      ),
                      (editCommand = null));
                editCommand && editCommand.redo.push(this.buildUndo()),
                  !preserveSelection &&
                    currentEditor.refocus(
                      currentDocumentNodeInstance ? currentDocumentNodeInstance.id : void 0,
                    ),
                  event && event.preventDefault();
              }
              return (
                preserveSelection ||
                  (!hasSelection && text
                    ? (!(function (element, selectionBookmark) {
                        var rawText = element.rawText(),
                          normalizedText = element.rawText(!0),
                          itemIndex = 0,
                          currentItemIndex = 0;
                        if (rawText != normalizedText) {
                          for (; itemIndex < selectionBookmark.start; )
                            if (rawText[itemIndex] == normalizedText[currentItemIndex])
                              itemIndex++, currentItemIndex++;
                            else {
                              if ('​' != rawText[itemIndex]) break;
                              itemIndex++;
                            }
                          (selectionBookmark.start -= itemIndex - currentItemIndex),
                            (selectionBookmark.end -= itemIndex - currentItemIndex);
                        }
                      })(blockElement, selectionBookmark),
                      (pairHandled = currentEditor.UserOp.handlePair(
                        currentEditor,
                        text,
                        documentNode,
                        selectionBookmark,
                        editCommand,
                        range,
                      )) ||
                        (pairHandled = currentEditor.UserOp.PunctuationOp.handlerCh(
                          currentEditor,
                          text,
                          documentNode,
                          selectionBookmark,
                          editCommand,
                          range,
                        )),
                      pairHandled ||
                        (pairHandled = currentEditor.htmlBlock.autoCloseTagWhenInput(
                          currentEditor,
                          text,
                          documentNode,
                          selectionBookmark,
                          editCommand,
                          range,
                        )),
                      pairHandled &&
                        ('object' == typeof pairHandled && (editCommand = pairHandled),
                        event && event.preventDefault()))
                    : editCommand &&
                      (currentEditor.UserOp.insertInlineText(
                        currentEditor,
                        documentNode,
                        text,
                        selectionBookmark.start,
                        editCommand,
                        !0,
                      ),
                      event && event.preventDefault())),
                !preserveSelection && editCommand && this.editor.undo.register(editCommand),
                editCommand
              );
            } catch (error) {
              console.warn(error);
            }
          }
        },
        getPosBookmark: function (selectionRange) {
          var element = editor.getMarkElem();
          if (element.length) {
            var codeMirror = this.editor.fences.queue[element.attr('cid')];
            return codeMirror
              ? {
                  isCm: codeMirror,
                  cid: codeMirror.cid,
                  start: codeMirror.indexFromPos(codeMirror.getCursor()),
                }
              : selectionRange
                ? {
                    isCm: !1,
                    cid: element.attr('cid'),
                    start: selectionRange.getBookmark(element[0]).start,
                  }
                : null;
          }
        },
        wrappedRange: function (range) {
          if (window.StaticRange && range instanceof StaticRange) {
            var currentRange = this.rangy.createRange();
            return (
              currentRange.setStart(range.startContainer, range.startOffset),
              currentRange.setEnd(range.endContainer, range.endOffset),
              currentRange
            );
          }
          return this.rangy.WrappedRange(currentRange);
        },
        getRangy: function (normalizeRange) {
          var selection = this.rangy.getSelection(),
            selectionRange = selection.rangeCount ? selection.getRangeAt(0) : null;
          return (
            selectionRange &&
              ((selectionRange.isBackward = selection.isBackward()),
              normalizeRange && this.deRange(selectionRange)),
            selectionRange
          );
        },
        storeToJson: function (selectionSnapshot) {
          return (
            selectionSnapshot || (selectionSnapshot = this.buildUndo()),
            selectionSnapshot && selectionSnapshot.pos
              ? { id: selectionSnapshot.id, pos: selectionSnapshot.pos }
              : selectionSnapshot
          );
        },
        buildUndo: function (range, element, excludeMathSuffix) {
          var selectionSnapshot = { type: 'cursor' };
          if (this.editor.sourceView && this.editor.sourceView.inSourceMode)
            return (
              (selectionSnapshot.pos = this.editor.sourceView.cm.getCursor()),
              (selectionSnapshot.inSourceMode = !0),
              selectionSnapshot
            );
          try {
            if (
              (element =
                ((range = range || this.getRangy()) && range.commonAncestorContainer
                  ? this.editor.getMarkElem(range.commonAncestorContainer)
                  : element) || this.editor.getMarkElem()).find('.CodeMirror').length
            ) {
              var codeMirror = element.find('.CodeMirror')[0].CodeMirror;
              (selectionSnapshot.id = codeMirror.cid),
                (selectionSnapshot.pos = codeMirror.getCursor()),
                (selectionSnapshot.selections = codeMirror.listSelections());
            } else if (
              element.attr('mdtype') &&
              element.children('[tabindex]').addBack('[tabindex]').length
            )
              (selectionSnapshot.id = element.attr('cid')),
                (selectionSnapshot.focus = element.attr('mdtype'));
            else {
              if (!range) return null;
              var currentElement = this.editor.getMarkElem(
                  this.getDetailPos(range.startContainer, range.startOffset)[0],
                ),
                localElement = this.editor.getMarkElem(
                  this.getDetailPos(range.endContainer, range.endOffset)[0],
                ),
                selectionBookmark = range.getBookmark(currentElement[0], excludeMathSuffix);
              if (
                (DocumentNode.isType(
                  currentElement.attr('mdtype'),
                  NodeType.fences,
                  NodeType.html_block,
                  NodeType.math_block,
                ) && (selectionBookmark.start = 0),
                currentElement[0] === localElement[0])
              ) {
                if (((selectionSnapshot.id = currentElement.attr('cid')), !selectionSnapshot.id))
                  return null;
                (selectionSnapshot.start = selectionBookmark.start),
                  (selectionSnapshot.end = selectionBookmark.end);
              } else {
                if (
                  ((selectionSnapshot.startId = currentElement.attr('cid')),
                  (selectionSnapshot.endId = localElement.attr('cid')),
                  !selectionSnapshot.startId || !selectionSnapshot.endId)
                )
                  return null;
                (selectionSnapshot.start = selectionBookmark.start),
                  (selectionSnapshot.end = range.getBookmark(localElement[0]).end);
              }
            }
          } catch (error) {
            return console.debug(error.stack), null;
          }
          return selectionSnapshot;
        },
        selectNode: function (documentNode, element) {
          (element = element || editor.findElemById(documentNode.id)).length &&
            'write' !== element.attr('id') &&
            void 0 !== element.attr('tabindex') &&
            (window.getSelection().removeAllRanges(), element.addClass('onfocus'), element.focus());
        },
        jumpToLineEdge: function (moveToEnd, returnOnly) {
          return this.extendToLineEdge(moveToEnd, null, returnOnly, !0);
        },
        fixExtendToLineEdge: function (moveToEnd, element, returnOnly, collapseSelection) {
          element = element || this.editor.getMarkElem()[0];
          var selectionRange = this.getRangy();
          if (
            selectionRange &&
            element &&
            !isInputComponent(document.activeElement) &&
            !isInputComponent(element) &&
            DocumentNode.isType(
              element.getAttribute('mdtype'),
              NodeType.paragraph,
              NodeType.heading,
            )
          ) {
            var mathBookmark,
              selectionBookmark,
              mathElement = null,
              range = this.rangy.createRange();
            if (moveToEnd) {
              if (
                (mathElement = element.querySelectorAll('.md-inline-math').last()) &&
                (range.setStartBefore(mathElement),
                range.collapse(!1),
                (mathBookmark = range.getBookmark(element)),
                (selectionBookmark = selectionRange.getBookmark(element)),
                mathBookmark.end == selectionBookmark.end &&
                  ((selectionBookmark.end = element.textContent.length),
                  collapseSelection && (selectionBookmark.start = selectionBookmark.end),
                  selectionRange.moveToBookmark(selectionBookmark),
                  !returnOnly))
              )
                return this.setRange(selectionRange), void this.editor.brush.expandOnDelay(!0);
            } else if (
              (mathElement = element.querySelectorAll('.md-inline-math')[0]) &&
              (range.setStartAndEnd(mathElement, mathElement.childNodes.length),
              (mathBookmark = range.getBookmark(element)),
              (selectionBookmark = selectionRange.getBookmark(element)),
              mathBookmark.start == selectionBookmark.start &&
                ((selectionBookmark.start = 0),
                collapseSelection && (selectionBookmark.end = selectionBookmark.start),
                selectionRange.moveToBookmark(selectionBookmark),
                !returnOnly))
            )
              return this.setRange(selectionRange), void this.editor.brush.expandOnDelay(!0);
            this.editor.brush.expandOnDelay(!0);
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
          )
            return !1;
          var selectionBookmark = selectionRange.getBookmark(containerNode),
            range = rangy.createRange();
          return (
            moveToEnd
              ? ((selectionBookmark.end = containerNode.textContent.length),
                collapseSelection && (selectionBookmark.start = selectionBookmark.end))
              : ((selectionBookmark.start = 0),
                collapseSelection && (selectionBookmark.end = 0),
                (range.isBackward = !0)),
            range.moveToBookmark(selectionBookmark),
            !returnOnly && this.setRange(range),
            range
          );
        },
        extendCharFromCollapse: function (range, backward) {
          var characterCode,
            extended = !1,
            forward = !backward;
          if (
            (range.commonAncestorContainer.nodeType == document.TEXT_NODE &&
              (backward &&
                range.startOffset > 0 &&
                (range.setStart(range.startContainer, range.startOffset - 1),
                range.startOffset > 0 &&
                  (characterCode = range.toString().charCodeAt(0)) >= 56320 &&
                  characterCode <= 57343 &&
                  (range.setStart(range.startContainer, range.startOffset - 1),
                  ((characterCode = range.toString().charCodeAt(0)) >= 55296 &&
                    characterCode <= 56319) ||
                    range.setStart(range.startContainer, range.startOffset + 1)),
                (extended = !0)),
              forward &&
                range.endOffset < range.commonAncestorContainer.textContent.length &&
                (range.setEnd(range.endContainer, range.endOffset + 1),
                (characterCode = range.toString().charCodeAt(range.toString().length)) >= 55296 &&
                  characterCode <= 56319 &&
                  range.endOffset < range.commonAncestorContainer.textContent.length &&
                  range.setEnd(range.endContainer, range.endOffset + 1),
                (extended = !0))),
            !extended)
          ) {
            var element = this.editor.getMarkElem(range.startContainer)[0];
            if (!element) return range;
            var selectionBookmark = range.getBookmark(element);
            if (
              (backward && 0 === selectionBookmark.start) ||
              (forward && selectionBookmark.end >= element.textContent.length)
            )
              return !1;
            if (
              (backward ? selectionBookmark.start-- : selectionBookmark.end++,
              element.classList.contains('md-def-link') ||
                element.classList.contains('md-def-footnote'))
            ) {
              var textLength = element.querySelector('.md-def-name').textContent.length;
              (selectionBookmark.start != textLength &&
                selectionBookmark.start !=
                  textLength + 1 + element.querySelector('.md-def-content').textContent.length) ||
                (backward
                  ? (selectionBookmark.end - selectionBookmark.start <= 1 &&
                      selectionBookmark.end--,
                    selectionBookmark.start--)
                  : (selectionBookmark.end - selectionBookmark.start <= 1 &&
                      selectionBookmark.start++,
                    selectionBookmark.end++));
            }
            range.moveToBookmark(selectionBookmark),
              '​' == range.toString() &&
                (backward
                  ? selectionBookmark.end > 0 && selectionBookmark.end--
                  : selectionBookmark.end < element.textContent.length && selectionBookmark.end++,
                range.moveToBookmark(selectionBookmark));
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
          return !1;
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
          )
            return this.moveUpOrDown(isBackward, keyboardEvent, !0);
          if (!((keyboardEvent && isInputComponent(keyboardEvent.target)) || !range) && element) {
            !File.inBusyMode ||
              (range &&
                !jquery(range.startContainer).closest("[contenteditable='false'][cid]").length) ||
              setAttributeOnlyNeeded(currentEditor.writingArea, 'contenteditable', 'true');
            var shiftKey = keyboardEvent.shiftKey;
            if (
              keyboardEvent &&
              jquery(isBackward ? range.startContainer : range.endContainer).closest(
                "[mdtype='table_cell']",
              ).length
            )
              setTimeout(function () {
                if (!keyboardEvent || !keyboardEvent.isDefaultPrevented()) {
                  var selectionRange = receiver.getRangy();
                  receiver.isSameRange(selectionRange, range) &&
                    (receiver.editor.tableEdit.moveToNextCell(!1, isBackward),
                    shiftKey &&
                      ((selectionRange = receiver.getRangy()),
                      isBackward
                        ? selectionRange.setEnd(range.endContainer, range.endOffset)
                        : selectionRange.setStart(range.startContainer, range.startOffset),
                      (selectionRange.isBackward = isBackward),
                      jquery(range.endContainer).closest('figure').attr('contenteditable', !0),
                      receiver.setRange(selectionRange)));
                }
              }, 0);
            else {
              var selectionBookmark = range.getBookmark(element),
                currentRange = rangy.createRange();
              if (keyboardEvent) {
                if (
                  !keyboardEvent.metaKey &&
                  !keyboardEvent.ctrlKey &&
                  !keyboardEvent.shiftKey &&
                  range.toString().length
                ) {
                  range.collapse(isBackward), this.setRange(range, !0);
                  var startElement = this.editor.getMarkElem(range.startContainer);
                  return (
                    startElement.length &&
                      F(this.editor, !isBackward, this.editor.findNodeByElem(startElement)),
                    keyboardEvent.preventDefault(),
                    !0
                  );
                }
                var commandPressed = File.isMac && keyboardEvent.metaKey;
                if (
                  isBackward &&
                  0 === selectionBookmark.start &&
                  (!range || range.collapsed || range.isBackward)
                ) {
                  if (commandPressed) return;
                  return this.moveUpOrDown(!0, keyboardEvent, !0);
                }
                var length = jquery(element).rawText().length;
                if (
                  !isBackward &&
                  selectionBookmark.end >= length &&
                  (!range || range.collapsed || !range.isBackward) &&
                  (!element.classList.contains('md-def-link') ||
                    0 !=
                      currentEditor.getJQueryElem(range.startContainer).closest('.md-def-title')
                        .length)
                ) {
                  if (commandPressed) return;
                  return this.moveUpOrDown(!1, keyboardEvent, !0);
                }
                var currentElement = document.querySelector('.marklyra-focusable-btn.selected');
                if (
                  currentElement &&
                  !keyboardEvent.metaKey &&
                  !keyboardEvent.ctrlKey &&
                  !keyboardEvent.shiftKey &&
                  selectionBookmark.end == selectionBookmark.start
                )
                  return (
                    currentElement.classList.remove('selected'),
                    (selectionBookmark.end += isBackward ? -1 : 1),
                    (selectionBookmark.start += isBackward ? -1 : 1),
                    currentRange.moveToBookmark(selectionBookmark),
                    this.setRange(currentRange, !0),
                    keyboardEvent.preventDefault(),
                    !0
                  );
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
                      if (0 == selection.startOffset && domNode)
                        0 == (receiver.getRangy().getBookmark(domNode) || {}).start &&
                          selection.collapse(domNode.parentElement.previousElementSibling, 0);
                      return keyboardEvent.preventDefault(), !0;
                    }
                  }
                  if (/^\w+$/.exec(trailingText))
                    return (
                      (selectionBookmark.start = selectionBookmark.end = length),
                      currentRange.moveToBookmark(selectionBookmark),
                      this.setRange(currentRange, !0),
                      keyboardEvent.preventDefault(),
                      !0
                    );
                }
              }
              var adjustedBookmark = Object.assign({}, selectionBookmark);
              isBackward
                ? ((selectionBookmark.end = selectionBookmark.start), selectionBookmark.start--)
                : ((selectionBookmark.start = selectionBookmark.end), selectionBookmark.end++),
                currentRange.moveToBookmark(selectionBookmark);
              var extendedText = currentRange.toString();
              if (/\u200b|\007F/g.exec(extendedText))
                return (
                  keyboardEvent.shiftKey
                    ? (isBackward ? (adjustedBookmark.start -= 2) : (adjustedBookmark.end += 2),
                      isBackward && (adjustedBookmark.start = Math.max(0, adjustedBookmark.start)),
                      currentRange.moveToBookmark(adjustedBookmark))
                    : currentRange.collapse(isBackward),
                  (currentRange.isBackward = range && range.isBackward),
                  this.setRange(currentRange, !0),
                  !0
                );
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
              )
                return (
                  currentRange.collapse(isBackward),
                  this.setRange(currentRange, !0),
                  keyboardEvent && keyboardEvent.preventDefault(),
                  !0
                );
              var localElement = jquery(currentRange.commonAncestorContainer).closest(
                  '.md-def-content',
                ),
                referenceNameElement = jquery(range.commonAncestorContainer).closest(
                  '.md-def-name',
                );
              range.collapsed &&
                element &&
                !keyboardEvent.shiftKey &&
                (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
                (localElement.length
                  ? setTimeout(function () {
                      var localRange = receiver.getRangy();
                      (localRange && element.contains(localRange.commonAncestorContainer)) ||
                        (isBackward
                          ? receiver.jumpIntoElemBegin(jquery(element))
                          : receiver.jumpIntoElemEnd(jquery(element)));
                    }, 0)
                  : referenceNameElement.length
                    ? isBackward ||
                      range.endOffset != range.endContainer.length ||
                      receiver.jumpIntoElemEnd(jquery(element))
                    : setTimeout(function () {
                        var localRange = receiver.getRangy();
                        if (localRange && localRange.endContainer) {
                          var mathElement = jquery(
                            isBackward ? localRange.startContainer : localRange.endContainer,
                          )
                            .closest('.md-inline-math')
                            .addClass('md-expand');
                          File.isMac &&
                            !mathElement.length &&
                            localRange.endContainer.length == localRange.endOffset &&
                            localRange.endContainer.nodeType == document.TEXT_NODE &&
                            (mathElement = jquery(localRange.endContainer.parentElement).next(
                              '.md-inline-math',
                            )),
                            mathElement.length &&
                              (isBackward
                                ? (localRange.setStart(mathElement.find('.md-before')[0], 0),
                                  localRange.collapse(!0))
                                : (localRange.setEnd(mathElement.find('.md-math-after-sym')[0], 0),
                                  localRange.collapse(!1)),
                              receiver.setRange(localRange));
                        }
                      }, 0));
            }
          }
        },
        addUnholdable: function (documentNode, insertCommand, insertBefore, keepPlaceholder) {
          var placeholderNode = (function (documentNode, insertBefore, unusedParameter3) {
              var paragraph = NodeType.paragraph;
              documentNode.get('type') == NodeType.list_item && (paragraph = NodeType.list_item);
              var documentNodeInstance = new DocumentNode({ type: paragraph });
              return (
                insertBefore
                  ? documentNode.addBefore(documentNodeInstance)
                  : documentNode.addAfter(documentNodeInstance),
                DocumentNode.normalizeNode(documentNodeInstance),
                documentNodeInstance
              );
            })(documentNode, insertBefore),
            nodeElement = this.editor.findElemById(documentNode.id),
            followingNode = insertBefore ? documentNode : void 0,
            precedingNode = insertBefore ? void 0 : documentNode;
          return (
            insertBefore
              ? nodeElement.before(placeholderNode.toHTML())
              : nodeElement.after(placeholderNode.toHTML()),
            this.editor.undo.endSnap(!0),
            (insertCommand = insertCommand || this.editor.undo.UndoManager.makeEmptyCommand()),
            jquery('.unholdable').removeClass('unholdable'),
            this.editor
              .findElemById(placeholderNode.id)
              .addClass(keepPlaceholder ? '' : 'unholdable'),
            this.editor.undo.UndoManager.addUndoForInsert(
              insertCommand,
              placeholderNode,
              precedingNode,
              followingNode,
            ),
            (insertCommand.discardable = !0),
            placeholderNode
          );
        },
        jumpToNextBlock: function (documentNode, insertCommand) {
          var nodeElement,
            nextBlock = documentNode.getClosetBlock(!0).getVeryFirstBrotherIncludeTopBlock(!1);
          if (nextBlock);
          else {
            if (!insertCommand) return void window.getSelection().removeAllRanges();
            nextBlock = this.addUnholdable(documentNode, insertCommand);
          }
          (nodeElement = this.editor.findElemById(nextBlock.cid)),
            this.jumpIntoElemBegin(nodeElement),
            insertCommand.redo.push(this.buildUndo());
          var currentEditor = this.editor;
          setTimeout(function () {
            currentEditor.refocus();
          }, 50);
        },
        unlockBlockUpOrDown: function (moveUp, keyboardEvent) {
          var currentEditor = this.editor;
          File.inBusyMode &&
            (keyboardEvent.shiftKey || keyboardEvent.metaKey || keyboardEvent.ctrlK) &&
            setAttributeOnlyNeeded(currentEditor.writingArea, 'contenteditable', 'true');
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
            )
              currentElement.attr('contenteditable', 'true'),
                items.push(currentElement),
                (currentElement = currentElement.closest('[mdtype][contenteditable=false]'));
            var adjacentBlock = documentNode
                .getClosetBlock(!0)
                .getVeryFirstBrotherIncludeTopBlock(moveUp),
              localElement = adjacentBlock
                ? currentEditor.findElemById(adjacentBlock.id)
                : jquery();
            for (
              currentElement =
                'false' === localElement.attr('contenteditable')
                  ? localElement
                  : localElement.closest('[mdtype][contenteditable=false]');
              currentElement.length;
            )
              currentElement.attr('contenteditable', 'true'),
                items.push(currentElement),
                (currentElement = currentElement.closest('[mdtype][contenteditable=false]'));
            items.length &&
              setTimeout(function () {
                items.forEach(function (inputElement) {
                  inputElement.attr('contenteditable', 'false');
                });
              }, 0);
          }
        },
        moveUpOrDown: function (collapsed, keyboardEvent, ignoreColumn) {
          File.inBusyMode &&
            keyboardEvent &&
            (keyboardEvent.shiftKey || keyboardEvent.metaKey || keyboardEvent.ctrlK) &&
            this.editor.writingArea.setAttribute('contenteditable', 'true');
          var currentBounds,
            range = this.getRangy(),
            receiver = this,
            horizontalKey =
              keyboardEvent &&
              DocumentNode.isType(
                map[keyboardEvent.keyCode || keyboardEvent.which],
                'Right',
                'Left',
              ),
            controlJump =
              File.isNode && keyboardEvent && keyboardEvent.ctrlKey && !keyboardEvent.shiftKey,
            extendSelection = keyboardEvent && keyboardEvent.shiftKey;
          function g(documentNode, includeMissing) {
            return includeMissing
              ? !documentNode ||
                  DocumentNode.isType(
                    documentNode,
                    NodeType.fences,
                    NodeType.html_block,
                    NodeType.table,
                    NodeType.math_block,
                    NodeType.hr,
                    NodeType.toc,
                  )
              : DocumentNode.isType(
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
          function v(documentNode, moveUp, beforeMove, sourceElement, targetLeft) {
            var adjacentBlock = documentNode.getVeryFirstBrotherIncludeTopBlock(moveUp),
              moveCommand = receiver.editor.undo.UndoManager.makeEmptyCommand();
            return (
              ((!horizontalKey &&
                !adjacentBlock &&
                !documentNode.get(moveUp ? 'before' : 'after')) ||
                (g(documentNode) && g(documentNode.get(moveUp ? 'before' : 'after'), !0))) &&
                ((moveUp && DocumentNode.isType(documentNode, NodeType.meta_block)) ||
                  (adjacentBlock = receiver.addUnholdable(
                    (function e(documentNode, moveUp) {
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
                      )
                        return documentNode;
                      var direction = moveUp ? 'before' : 'after';
                      return documentNode.get('parent')
                        ? documentNode.get('parent').get(direction)
                          ? documentNode
                          : documentNode.get(direction)
                            ? documentNode
                            : e(documentNode.get('parent'))
                        : documentNode;
                    })(documentNode),
                    moveCommand,
                    moveUp,
                  ))),
              moveCommand.undo.push(receiver.buildUndo()),
              beforeMove && beforeMove(),
              horizontalKey
                ? moveUp
                  ? receiver.jumpIntoElemEnd(receiver.editor.findElemById(adjacentBlock.id))
                  : receiver.jumpIntoElemBegin(receiver.editor.findElemById(adjacentBlock.id))
                : controlJump
                  ? receiver.jumpIntoElemBegin(receiver.editor.findElemById(adjacentBlock.id), !0)
                  : E(adjacentBlock, sourceElement, moveCommand, targetLeft),
              moveCommand
            );
          }
          function x(documentNode, moveUp, sourceElement) {
            (moveCommand = v(documentNode.getClosetBlock(), moveUp, void 0, sourceElement)),
              keyboardEvent && keyboardEvent.preventDefault();
            var UndoManager = receiver.editor.undo.UndoManager;
            UndoManager.isEmptyCommand(moveCommand) ||
              (moveCommand.redo.push(receiver.buildUndo()),
              UndoManager.isEmptyOrUnchangedCommand(moveCommand) ||
                receiver.editor.undo.register(moveCommand)),
              receiver.scrollAdjust();
          }
          function k(documentNode, moveUp, codeMirrorOverride, blockElement) {
            var top,
              codeMirror = codeMirrorOverride || receiver.editor.fences.getCm(documentNode.id),
              inBoundaryInput =
                blockElement[0].contains(document.activeElement) &&
                document.activeElement.classList.contains('marklyra-input'),
              atFirstLine = moveUp && 0 == codeMirror.doc.getCursor().line,
              atLastLine = !moveUp && codeMirror.doc.getCursor().line == codeMirror.lineCount() - 1;
            if (
              (atFirstLine &&
                moveUp &&
                (atFirstLine =
                  (top = codeMirror.cursorCoords().top) ==
                  codeMirror.cursorCoords({ line: 0, ch: 0 }).top),
              atLastLine &&
                !moveUp &&
                (atLastLine =
                  (top = codeMirror.cursorCoords().top) ==
                  codeMirror.cursorCoords({
                    line: codeMirror.lineCount() - 1,
                    ch: codeMirror.getLine(codeMirror.lineCount() - 1).length,
                  }).top),
              controlJump && (atFirstLine = !0),
              ignoreColumn ||
                void 0 != currentLeft ||
                (currentLeft = inBoundaryInput
                  ? jquery(document.activeElement).offset().left +
                    document.activeElement.clientWidth
                  : codeMirror.cursorCoords(codeMirror.getCursor()).right),
              inBoundaryInput)
            ) {
              var inBeforeInput =
                document.activeElement.classList.contains('marklyra-input-before');
              if (!inBeforeInput && moveUp)
                return (
                  receiver.editor.fences.jumpCmEnd(codeMirror),
                  !ignoreColumn && C(codeMirror, currentLeft),
                  y(keyboardEvent)
                );
              if (inBeforeInput && !moveUp)
                return (
                  receiver.editor.fences.jumpCmBegin(codeMirror),
                  !ignoreColumn && C(codeMirror, currentLeft),
                  y(keyboardEvent)
                );
              atLastLine =
                atLastLine || document.activeElement.classList.contains('marklyra-input-after');
            } else if (atLastLine && !moveUp) {
              if (
                documentNode.get('type') == NodeType.fences ||
                (documentNode.get('type') == NodeType.math_block && documentNode.get('tagAfter'))
              )
                return (
                  codeMirror.getInputField().blur(),
                  setTimeout(function () {
                    receiver.selectAllElem(blockElement.find('.marklyra-input-after').focus());
                  }, 0),
                  y(keyboardEvent)
                );
            } else if (
              atFirstLine &&
              moveUp &&
              documentNode.get('type') == NodeType.math_block &&
              documentNode.get('tagBefore')
            )
              return (
                codeMirror.getInputField().blur(),
                setTimeout(function () {
                  receiver.selectAllElem(blockElement.find('.marklyra-input-before').focus());
                }, 0),
                y(keyboardEvent)
              );
            if (atFirstLine || atLastLine) {
              var position = codeMirror.getCursor();
              inBoundaryInput ||
                (controlJump =
                  !currentLeft &&
                  (0 == position.ch ||
                    top !=
                      codeMirror.cursorCoords({ line: position.line, ch: position.ch - 1 }).top)),
                ignoreColumn && (controlJump = !moveUp),
                (moveCommand = v(
                  documentNode,
                  moveUp,
                  function () {
                    codeMirror.getInputField().blur();
                  },
                  blockElement,
                  ignoreColumn ? void 0 : currentLeft,
                )),
                receiver.editor.undo.UndoManager.isEmptyCommand(moveCommand) ||
                  (moveUp && moveCommand.redo.push(receiver.buildUndo()),
                  receiver.editor.undo.register(moveCommand)),
                y(keyboardEvent),
                codeMirror.hasFocus() || _(moveCommand);
            }
            keyboardEvent && keyboardEvent.stopPropagation();
          }
          function E(documentNode, element, moveCommand, targetLeft) {
            if (documentNode) {
              var nodeElement = receiver.editor.findElemById(documentNode.id);
              !(function (inputElement, placeholderNode, removeCommand) {
                inputElement.hasClass('unholdable') &&
                  placeholderNode &&
                  (inputElement.text().length
                    ? inputElement.removeClass('unholdable')
                    : (receiver.editor.undo.endSnap(!0),
                      receiver.editor.undo.UndoManager.addUndoForRemove(
                        removeCommand,
                        placeholderNode,
                      ),
                      removeCommand.redo.push(receiver.buildUndo()),
                      placeholderNode.remove(),
                      inputElement.remove(),
                      receiver.editor.undo.register(removeCommand)));
              })(element.closest('.unholdable'), currentDocumentNode, moveCommand);
              var extendSelection = keyboardEvent && keyboardEvent.shiftKey;
              if (!extendSelection && w(nodeElement))
                return y(keyboardEvent), nodeElement.find('img:first').trigger('click'), !0;
              if (
                extendSelection &&
                (DocumentNode.isType(
                  documentNode,
                  NodeType.fences,
                  NodeType.html_block,
                  NodeType.math_block,
                ) ||
                  b(documentNode))
              ) {
                if (nodeElement.length) {
                  var localRange = rangy.createRange();
                  localRange.setStart(nodeElement[0], 0),
                    localRange.setEnd(nodeElement[0], nodeElement[0].childNodes.length),
                    receiver.deRange(localRange, !0),
                    'false' == nodeElement.attr('contenteditable') &&
                      nodeElement.attr('contenteditable', 'true');
                }
              } else if (
                F(
                  receiver.editor,
                  collapsed,
                  documentNode,
                  keyboardEvent,
                  moveCommand,
                  ignoreColumn ? void 0 : currentLeft,
                )
              );
              else if (
                DocumentNode.isType(
                  documentNode,
                  NodeType.paragraph,
                  NodeType.heading,
                  NodeType.def_link,
                  NodeType.def_footnote,
                ) &&
                !documentNode.get('text')
              )
                receiver.jumpIntoElemBegin(nodeElement),
                  keyboardEvent && keyboardEvent.preventDefault();
              else if (DocumentNode.isType(documentNode, NodeType.meta_block) && collapsed)
                receiver.jumpIntoElemEnd(nodeElement),
                  keyboardEvent && keyboardEvent.preventDefault();
              else if (
                DocumentNode.isType(
                  documentNode,
                  NodeType.table,
                  NodeType.table_row,
                  NodeType.table_cell,
                )
              )
                receiver.jumpIntoElemBegin(nodeElement), y(keyboardEvent);
              else if (nodeElement.length) {
                if (ignoreColumn || 0 == element.closest('#write').length)
                  collapsed
                    ? receiver.jumpIntoElemEnd(nodeElement)
                    : receiver.jumpIntoElemBegin(nodeElement);
                else {
                  editor.selection.scrollAdjust(nodeElement, void 0, !0, !0),
                    File.inBusyMode && editor.writingArea.setAttribute('contenteditable', 'true');
                  var left = currentLeft;
                  if (
                    (void 0 !== targetLeft &&
                      (left =
                        localRange &&
                        localRange.getBookmark(element[0]).end == element.text().length
                          ? currentLeft
                          : targetLeft),
                    void 0 != left)
                  ) {
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
                        ? jquery(currentRange.startContainer).closest('.md-reverse-footnote-area')
                        : jquery();
                    insideTarget &&
                      reverseFootnote.length &&
                      (currentRange.setStart(reverseFootnote[0].previousElementSibling, 1),
                      currentRange.setEnd(reverseFootnote[0].previousElementSibling, 1),
                      receiver.deRange(currentRange)),
                      insideTarget
                        ? receiver.setRange(currentRange)
                        : void 0 == targetLeft && selectionRange
                          ? window
                              .getSelection()
                              .modify('move', collapsed ? 'backward' : 'forward', 'line')
                          : (collapsed
                              ? receiver.jumpIntoElemEnd(nodeElement)
                              : receiver.jumpIntoElemBegin(nodeElement),
                            selectionRange || (selectionRange = receiver.getRangy()),
                            (bounds =
                              selectionRange && selectionRange.nativeRange.getClientRects()[0]) &&
                              (currentRange = document.caretRangeFromPoint(left, bounds.y)),
                            currentRange &&
                              (nodeElement[0] == currentRange.startContainer ||
                                nodeElement[0].contains(currentRange.startContainer)) &&
                              receiver.setRange(currentRange));
                  } else
                    collapsed
                      ? receiver.jumpIntoElemEnd(nodeElement)
                      : receiver.jumpIntoElemBegin(nodeElement);
                }
                File.isFocusMode &&
                  (jquery('.md-focus').removeClass('md-focus'), nodeElement.addClass('md-focus')),
                  y(keyboardEvent);
              }
            }
          }
          function T(sourceElement, documentNode, targetLeft) {
            var element = jquery(range.commonAncestorContainer.parentElement);
            if (!collapsed && element.hasClass('md-image-after-src')) {
              var afterImage = element.closest('.md-image').next();
              return (
                afterImage.length
                  ? (receiver.jumpIntoElemBegin(afterImage), y(keyboardEvent))
                  : x(documentNode, collapsed, sourceElement),
                !1
              );
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
                this.setRange(currentRange, !0), y(keyboardEvent);
              } else if (targetLeft || (File.isTypeWriterMode && File.option.scrollWithCursor)) {
                (left = targetLeft || currentBounds.left),
                  (bottom = collapsed ? currentBounds.top - 9 : currentBounds.bottom + 9),
                  (currentRange = document.caretRangeFromPoint(left, bottom));
                !collapsed &&
                  this.fixUnselectableRange(currentRange, !0) &&
                  ((bottom =
                    ((
                      currentRange.startContainer.getClientRects &&
                      (currentRange.startContainer.getClientRects() || [{}])[0]
                    ).bottom || bottom) + 9),
                  (currentRange = document.caretRangeFromPoint(left, bottom)),
                  this.deRange(currentRange)),
                  this.editor.writingArea.contains(currentRange.startContainer) &&
                    (S(currentRange) || {}).top != currentBounds.top &&
                    (this.setRange(currentRange), y(keyboardEvent));
              }
            }
          }
          function _(moveCommand) {
            if (extendSelection && range) {
              var selectionRange = receiver.getRangy();
              selectionRange &&
                ((selectionRange.isBackward = range.isBackward || (range.collapsed && collapsed)),
                selectionRange.isBackward
                  ? selectionRange.setEnd(range.endContainer, range.endOffset)
                  : selectionRange.setStart(range.startContainer, range.startOffset),
                receiver.setRange(selectionRange),
                moveCommand.redo.push(receiver.buildUndo(selectionRange)),
                y(keyboardEvent));
            }
          }
          try {
            var currentElement = this.editor.getMarkElem(),
              nodeType = currentElement.attr('mdtype'),
              currentDocumentNode = this.editor.findNodeByElem(currentElement),
              moveCommand = receiver.editor.undo.UndoManager.makeEmptyCommand();
            if (!currentDocumentNode) return;
            if (b(currentDocumentNode, currentElement) || currentElement.hasClass('rawedit')) {
              if (document.activeElement !== this.editor.writingArea) {
                var scrollTop = jquery('content').scrollTop();
                this.editor.writingArea.focus(),
                  jquery('content').scrollTop(scrollTop),
                  window.getSelection().removeAllRanges();
              }
              x(currentDocumentNode, collapsed, currentElement), _(moveCommand);
            } else if (nodeType == documentModel.TYPE.fences)
              k(currentDocumentNode, collapsed, void 0, currentElement);
            else if (nodeType == documentModel.TYPE.html_block && this.editor.htmlBlock.currentCm)
              k(currentDocumentNode, collapsed, this.editor.htmlBlock.currentCm, currentElement);
            else if (nodeType == documentModel.TYPE.math_block && this.editor.mathBlock.currentCm)
              k(currentDocumentNode, collapsed, this.editor.mathBlock.currentCm, currentElement);
            else if (currentElement.closest('.td-span').length) {
              if (
                keyboardEvent &&
                (keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey)
              )
                return;
              var targetCell = (function (element, moveUp) {
                var elements,
                  tableCell = element.closest('td'),
                  columnNumber = tableCell.prevAll().length + 1;
                if (!tableCell.length) {
                  if (moveUp) return [];
                  columnNumber = (tableCell = element.closest('th')).prevAll().length + 1;
                }
                return 'TD' == tableCell[0].tagName
                  ? ((elements = tableCell
                      .closest('tr')
                      [moveUp ? 'prev' : 'next']()
                      .find('td:nth-child(' + columnNumber + ')>.td-span')),
                    moveUp &&
                      !elements.length &&
                      (elements = tableCell
                        .closest('tbody')
                        .prev()
                        .find('tr:last > th:nth-child(' + columnNumber + ') > .td-span')),
                    elements)
                  : moveUp
                    ? []
                    : tableCell
                        .closest('thead')
                        .next()
                        .find('tr:first > td:nth-child(' + columnNumber + ')>.td-span');
              })(currentElement.closest('.td-span'), collapsed);
              if (targetCell.length)
                keyboardEvent && keyboardEvent.preventDefault(),
                  collapsed ? this.jumpIntoElemEnd(targetCell) : this.jumpIntoElemBegin(targetCell),
                  this.scrollAdjust(void 0, void 0, !0);
              else {
                if (horizontalKey) return y(keyboardEvent), !1;
                x(currentDocumentNode, collapsed, currentElement);
              }
            } else if (currentElement.closest('.md-meta-block').length && !collapsed)
              currentElement[0].normalize(),
                !currentElement
                  .text()
                  .substring(window.getSelection().focusOffset)
                  .match(/\S+\n+/) && x(currentDocumentNode, collapsed, currentElement);
            else {
              if (!ignoreColumn && void 0 == currentLeft) {
                var rangeRects = range.nativeRange.getClientRects();
                currentLeft = (1 == rangeRects.length ? rangeRects[0] : {}).left;
              }
              var adjacentBlock = currentDocumentNode
                .getClosetBlock(!0)
                .getVeryFirstBrotherIncludeTopBlock(collapsed);
              moveCommand.undo.push(this.editor.lastCursor);
              var edgeFlags = function (blockElement, inputRange) {
                if (!(inputRange = inputRange || this.getRangy())) return 0;
                if (
                  extendSelection ||
                  inputRange.collapsed ||
                  blockElement[0].contains(inputRange.commonAncestorContainer) ||
                  blockElement[0] == inputRange.commonAncestorContainer
                ) {
                  if (!1 === (currentBounds = S(inputRange.nativeRange, !0))) return 0;
                  if (!currentBounds || !blockElement.length || !blockElement.text().length)
                    return 3;
                  var edgeFlags = 0,
                    bounds = blockElement[0].getBoundingClientRect();
                  return (
                    (function (blockElement, callbackRange) {
                      var domNode =
                        callbackRange.endContainer.nodeType == document.TEXT_NODE
                          ? callbackRange.endContainer.parentElement.parentElement
                          : null;
                      if (
                        (domNode &&
                          domNode.classList.contains('md-meta') &&
                          (domNode = domNode.parentElement),
                        domNode && domNode.classList.contains('md-image'))
                      ) {
                        if (
                          callbackRange.endContainer.textContent.length ==
                            callbackRange.endOffset &&
                          blockElement.rawText().length ==
                            callbackRange.getBookmark(blockElement[0]).end
                        )
                          return !0;
                        var rangeRects = callbackRange.nativeRange.getClientRects();
                        if (!rangeRects.length) return;
                        var lastRect = rangeRects[rangeRects.length - 1],
                          currentDomNode = document.elementFromPoint(lastRect.x, lastRect.y + 28);
                        if (
                          currentDomNode &&
                          'IMG' == currentDomNode.tagName &&
                          (callbackRange.collapseAfter(currentDomNode),
                          blockElement.rawText().length ==
                            callbackRange.getBookmark(blockElement[0]).end)
                        )
                          return !0;
                      }
                    })(blockElement, inputRange)
                      ? (edgeFlags |= 1)
                      : bounds.bottom - currentBounds.bottom <
                          parseInt(blockElement.css('paddingBottom')) + 10 && (edgeFlags |= 1),
                    currentBounds.top - bounds.top <
                      parseInt(blockElement.css('paddingTop')) + 10 && (edgeFlags |= 2),
                    edgeFlags
                  );
                }
              }.call(this, currentElement);
              edgeFlags & (collapsed ? 2 : 1)
                ? adjacentBlock
                  ? E(adjacentBlock, currentElement, moveCommand, currentLeft)
                  : !collapsed &&
                    currentElement.text().trim().length &&
                    x(currentDocumentNode, collapsed, currentElement)
                : edgeFlags
                  ? T.call(this, currentElement, currentDocumentNode, currentLeft)
                  : T.call(this, currentElement, currentDocumentNode),
                _(moveCommand),
                !keyboardEvent.isDefaultPrevented() &&
                  File.isTypeWriterMode &&
                  setTimeout(this.scrollAdjust.bind(this), 0);
            }
          } catch (error) {
            console.debug(error.stack);
          }
        },
        click: function (clientX, clientY, eventType) {
          window.getSelection().removeAllRanges();
          var mouseEvent = document.createEvent('MouseEvent'),
            elementAtPoint = document.elementFromPoint(clientX, clientY);
          (eventType = 'click'),
            mouseEvent.initMouseEvent(
              eventType,
              !0,
              !0,
              window,
              null,
              clientX,
              clientY,
              0,
              0,
              !1,
              !1,
              !1,
              !1,
              0,
              null,
            ),
            elementAtPoint.dispatchEvent(mouseEvent);
        },
        jumpDefComponent: function (selectName) {
          var blockElement = this.editor.getMarkElem(),
            range = rangy.createRange();
          selectName
            ? (range.selectNodeContents(blockElement.find('.md-def-name')[0]),
              this.deRange(range, !0))
            : (range.selectNodeContents(blockElement.find('.md-def-content')[0]),
              this.deRange(range, !0)),
            this.editor.refocus();
        },
        jumpSelection: function () {
          return this.scrollAdjust(null, 20);
        },
        jumpToLineStart: function (moveToEnd) {
          var currentEditor = this.editor;
          currentEditor.sourceView &&
            currentEditor.sourceView.inSourceMode &&
            currentEditor.sourceView.cm.execCommand(moveToEnd ? 'goLineEnd' : 'goLineStart');
          var element = this.editor.getMarkElem();
          if (isInputComponent(document.activeElement))
            window
              .getSelection()
              .modify('move', moveToEnd ? 'forward' : 'backward', 'paragraphboundary');
          else if (element.find('.CodeMirror').length) {
            var currentCodeMirror = element.find('.CodeMirror')[0].CodeMirror;
            currentCodeMirror &&
              currentCodeMirror.execCommand(moveToEnd ? 'goLineEnd' : 'goLineStart');
          } else
            element.closest('[mdtype="table"]').length
              ? moveToEnd
                ? this.jumpIntoElemEnd(element.closest('tr').find('.td-span').first())
                : this.jumpIntoElemBegin(element.closest('tr').find('.td-span').last())
              : element.closest('.md-meta-block').length
                ? window
                    .getSelection()
                    .modify('move', moveToEnd ? 'forward' : 'backward', 'lineboundary')
                : moveToEnd
                  ? this.jumpIntoElemEnd(element)
                  : this.jumpIntoElemBegin(element);
        },
        jumpToLineEnd: function () {
          this.jumpToLineStart(!0);
        },
        jumpTop: function (extendSelection) {
          var currentEditor = this.editor;
          if (currentEditor.sourceView && currentEditor.sourceView.inSourceMode)
            currentEditor.sourceView.cm.execCommand('goDocStart');
          else {
            var selectionRange = this.getRangy();
            if (extendSelection && selectionRange)
              selectionRange.setStart(currentEditor.writingArea, 0),
                this.deRange(selectionRange, !0);
            else if (currentEditor.nodeMap) {
              var firstNode = currentEditor.nodeMap.getFirst();
              firstNode && (firstNode = firstNode.getVeryFirst() || firstNode),
                this.jumpIntoElemBegin(currentEditor.findElemById((firstNode || {}).cid));
            }
            File.isTypeWriterMode ||
              jquery('content').animate({ scrollTop: 0 }, '100', 'swing', function () {
                currentEditor.library.outline.highlightVisibleHeader();
              });
          }
        },
        jumpBottom: function (extendSelection) {
          var currentEditor = this.editor;
          if (currentEditor.sourceView && currentEditor.sourceView.inSourceMode)
            currentEditor.sourceView.cm.execCommand('goDocEnd');
          else {
            var range = this.getRangy();
            if (extendSelection && range) {
              range.setEnd(currentEditor.writingArea, currentEditor.writingArea.childNodes.length),
                (range = this.deRange(range, !0));
              try {
                range.endContainer.parentElement.classList.contains('md-def-title') &&
                  '' == range.endContainer.parentElement.textContent &&
                  (range.setEndAfter(
                    range.endContainer.parentElement.previousSibling.previousSibling,
                  ),
                  (range = this.deRange(range, !0)));
              } catch (error) {}
            } else {
              var lastNode = currentEditor.nodeMap.getLast();
              lastNode && (lastNode = lastNode.getVeryFirst(!0) || lastNode),
                this.jumpIntoElemEnd(currentEditor.findElemById(lastNode.cid));
            }
            File.isTypeWriterMode ||
              jquery('content').animate(
                {
                  scrollTop:
                    document.querySelector(this.editor.sessionStr).scrollHeight -
                    window.innerHeight,
                },
                '100',
                'swing',
                function () {
                  currentEditor.library.outline.highlightVisibleHeader();
                },
              );
          }
        },
        lockNativeScroll: function () {
          window.addEventListener('wheel', v, { passive: !1 }),
            window.addEventListener('DOMMouseScroll', v, { passive: !1 }),
            (this.nativeScrollLocked = !1);
          var e = () => {
            this.nativeScrollLocked = setTimeout(() => {
              this.editor.isScrolling()
                ? e()
                : ((this.nativeScrollLocked = !1),
                  window.removeEventListener('wheel', v, { passive: !1 }),
                  window.removeEventListener('DOMMouseScroll', v, { passive: !1 }));
            }, 100);
          };
          e();
        },
        typeWriterScroll: function (element, alignElement, onComplete) {
          var currentEditor = this.editor;
          function a(bounds) {
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
              !0)
            );
          }
          if ((timerId && clearTimeout(timerId), (timerId = null), File.isTypeWriterMode)) {
            var currentBounds;
            if (alignElement)
              return void (
                (currentBounds =
                  element.jquery && element.length && element[0].getBoundingClientRect()) &&
                ((currentBounds = document.caretRangeFromPoint(
                  (currentBounds.left + currentBounds.right) / 2,
                  currentBounds.bottom - 10,
                )),
                this.typeWriterScroll(currentBounds))
              );
            if (!element || element.getBoundingClientRect) {
              if (
                (currentBounds =
                  element ||
                  (window.getSelection().rangeCount && window.getSelection().getRangeAt(0)))
              )
                a(S(currentBounds));
              else onComplete && onComplete();
              return;
            }
            element.top
              ? a(element)
              : element.jquery && element.length && a(element[0].getBoundingClientRect());
          }
        },
        scrollAdjust: function (range, padding, scrollDuration, skipTypewriter) {
          if (this.editor.sourceView && this.editor.sourceView.inSourceMode)
            this.editor.sourceView.scrollAdjust();
          else if (!this.editor.isScrolling() || this.nativeScrollLocked) {
            if (File.isTypeWriterMode && !skipTypewriter) return this.typeWriterScroll(range);
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
                if (!range.length) return;
                top = range.offset().top + currentScrollTop;
              } else if (range && range.closest) {
                var element = range.closest('.md-diagram, .md-math-block'),
                  bounds = range.getBoundingClientRect();
                (bottom =
                  (element ? element.getBoundingClientRect().bottom - 40 : bounds.top) +
                  currentScrollTop) +
                  40 -
                  (top = bounds.top + currentScrollTop) >
                  innerHeight - 160 && (bottom = bounds.bottom + currentScrollTop);
              } else if (range && void 0 !== range.startContainer)
                top = (range.nativeRange || range).getClientRects()[0].top + currentScrollTop;
              else {
                var currentElement =
                  document.activeElement.closest &&
                  document.activeElement.closest('.CodeMirror-focused');
                if (
                  currentElement &&
                  (currentElement = currentElement.querySelector('.CodeMirror-selected')) &&
                  currentElement.length
                )
                  return this.scrollAdjust(currentElement);
                if (
                  ((currentRange = window.getSelection().getRangeAt(0)),
                  !document.activeElement ||
                    ('VIDEO' != document.activeElement.tagName &&
                      'IMG' != document.activeElement.tagName &&
                      'IFRAME' != document.activeElement.tagName) ||
                    (currentRange = null),
                  currentRange)
                )
                  if (
                    (currentBounds = currentRange.getBoundingClientRect()) &&
                    currentBounds.height
                  )
                    top = currentBounds.top + currentScrollTop;
                  else {
                    var domNode = currentRange.endContainer;
                    if (domNode.nodeType === document.TEXT_NODE)
                      void 0 === (currentBounds = domNode.parentElement.getClientRects()[0]) &&
                        (bottom =
                          (currentBounds = domNode.parentElement
                            .closest('[cid]')
                            .getClientRects()[0]).bottom + currentScrollTop),
                        (top = currentBounds.top + currentScrollTop);
                    else if (
                      ((top = void 0),
                      domNode !== this.editor.writingArea &&
                        (currentBounds = domNode.getClientRects()[0]).height < 50 &&
                        (top = currentBounds.top + currentScrollTop),
                      void 0 === top)
                    )
                      return;
                  }
                else top = jquery(document.activeElement).offset().top;
              }
              bottom = bottom || top;
              var topInset = 30;
              if (
                (File.inBusyMode ||
                  (topInset =
                    (File.isNodeHtml
                      ? jquery('#top-titlebar').height()
                      : document.body.classList.contains('mac-seamless-mode')
                        ? 30
                        : 0) + (jquery('.on-search-panel-open #md-searchpanel').height() || 0)),
                void 0 !== padding && null !== padding)
              )
                if (File.inBusyMode || File._onInitParse) {
                  var localScrollTop = top - padding - topInset;
                  (jquery('content')[0].scrollTop = localScrollTop),
                    localScrollTop > 35e3 &&
                      requestAnimationFrame(function () {
                        jquery('content')[0].scrollTop = localScrollTop;
                      }),
                    currentEditor.library.outline.highlightVisibleHeaderWithDelay(headingElements);
                } else
                  jquery('content').animate(
                    { scrollTop: top - padding - topInset },
                    '500',
                    'swing',
                    function () {
                      currentEditor.library.outline.highlightVisibleHeaderWithDelay(
                        headingElements,
                      );
                    },
                  );
              else
                top < currentScrollTop + topInset
                  ? w(top - topInset - (scrollDuration || 140))
                  : bottom > innerHeight + currentScrollTop - (scrollDuration ? 70 : 140)
                    ? w(bottom - innerHeight + (scrollDuration || 140))
                    : currentEditor.library.outline.highlightVisibleHeaderWithDelay();
            } catch (error) {}
          }
          function w(inputScrollTop) {
            File.inBusyMode
              ? (jquery('content')[0].scrollTop = inputScrollTop)
              : jquery('content').scrollTop(inputScrollTop),
              currentEditor.library.outline.highlightVisibleHeaderWithDelay(),
              currentEditor.selection.lockNativeScroll();
          }
        },
        selectAllElem: function (element) {
          if (!element[0] || ('INPUT' != element[0].tagName && 'TEXTAREA' != element[0].tagName))
            if (this.editor.sourceView.inSourceMode)
              this.editor.sourceView.cm.execCommand('selectAll');
            else {
              if (jquery('body').hasClass('marklyra-sourceview-on'))
                return this.editor.sourceView.cm.execCommand('selectAll');
              (editor.needRemoveMathAfterSym = !0),
                element.find('.math-jax-postprocess>.md-math-after-sym').text('​');
              var range = rangy.createRange();
              if (element.children().length)
                range.setStart(element.children()[0]),
                  range.setEndAfter(element.children()[element.children().length - 1]);
              else {
                if (!element.length) return;
                range.selectNode(element[0]);
              }
              this.deRange(range, !0);
            }
          else element[0].select();
        },
        selectAll: function (event) {
          if (this.editor.sourceView.inSourceMode)
            this.editor.sourceView.cm.execCommand('selectAll');
          else if (
            (File.inBusyMode &&
              !File.isLocked &&
              this.editor.writingArea.setAttribute('contenteditable', 'true'),
            (editor.needRemoveMathAfterSym = !0),
            jquery('.math-jax-postprocess>.md-math-after-sym').text('​'),
            document.activeElement &&
              DocumentNode.isType(document.activeElement.tagName, 'INPUT', 'TEXTAREA'))
          )
            document.activeElement.select();
          else {
            var element = this.editor.getMarkElem(),
              range = rangy.createRange();
            if (element.hasClass('rawedit'))
              event || (range.selectNode(element[0]), this.setRange(range));
            else {
              if (event && DocumentNode.isType(event.target.tagName, 'INPUT', 'TEXTAREA'))
                return event.target.select(), !0;
              if (isInputComponent((event && event.target) || document.activeElement))
                return (
                  this.selectAllElem(jquery((event && event.target) || document.activeElement)), !1
                );
              element.find('.CodeMirror').length
                ? element.find('.CodeMirror')[0].CodeMirror.execCommand('selectAll')
                : element.closest('[mdtype="table"]').length
                  ? (this.selectAllElem(element.closest("[mdtype='table_cell']")),
                    event && event.preventDefault())
                  : element.closest('.md-meta-block').length
                    ? (this.selectAllElem(element.closest("[mdtype='meta_block']")),
                      event && event.preventDefault())
                    : (jquery(this.editor.sessionStr).addClass('md-expand'),
                      jquery('.footnotes, .md-fences, .hr, .md-rawblock').attr(
                        'contenteditable',
                        !0,
                      ),
                      range.setStart(jquery(this.editor.sessionStr).children()[0]),
                      jquery(this.editor.sessionStr).children()[0].classList.contains('md-hr') &&
                        range.setStart(jquery(this.editor.sessionStr).children()[1]),
                      range.setEndAfter(jquery(this.editor.sessionStr).children().last()[0]),
                      jquery(this.editor.sessionStr).removeClass('md-expand'),
                      (range = this.deRange(range)),
                      this.fixSafariRange(range),
                      this.setRange(range),
                      event && event.preventDefault(),
                      File.isMac &&
                        setTimeout(function () {
                          jquery('.footnotes, .md-fences, .hr, .md-rawblock').prop(
                            'contenteditable',
                            !1,
                          );
                        }, 10));
            }
            this.editor.lastCursor = this.buildUndo();
          }
        },
        getEndNode: function (range) {
          return this.getDetailPos(range.endContainer, range.endOffset)[0];
        },
        getDetailPos: function (domNode, itemIndex, preferStart) {
          var stopTraversal = {};
          function r(inputDomNode) {
            1 === inputDomNode.nodeType &&
              0 === inputDomNode.childNodes.length &&
              inputDomNode.appendChild(document.createTextNode(''));
          }
          function o(inputDomNode) {
            if ((r(inputDomNode), inputDomNode.childNodes.length))
              return inputDomNode.childNodes.length;
            if (3 === inputDomNode.nodeType) return inputDomNode.textContent.length;
            if (void 0 !== inputDomNode.length) return inputDomNode.length;
            throw stopTraversal;
          }
          if (domNode.parentElement && domNode.parentElement.classList.contains('md-def-split'))
            return 0 == itemIndex
              ? this.getDetailPos(
                  domNode.parentElement.previousElementSibling,
                  domNode.parentElement.previousElementSibling.textContent.length,
                  preferStart,
                )
              : this.getDetailPos(domNode.parentElement.nextElementSibling, 0, preferStart);
          if (1 == domNode.nodeType) {
            var childNodes = domNode.childNodes;
            if (
              (domNode.classList.contains('md-image') && 2 === itemIndex && (itemIndex = 1),
              domNode.tagName == 'mjx-assistive-mml'.toUpperCase())
            ) {
              if (!preferStart)
                return this.getDetailPos(
                  domNode.parentElement.parentElement.parentElement,
                  domNode.parentElement.parentElement.parentElement.childElementCount,
                );
            } else if (domNode.tagName == 'mjx-container'.toUpperCase())
              return 0 == itemIndex
                ? this.getDetailPos(domNode.parentElement.parentElement, 0)
                : this.getDetailPos(
                    domNode.parentElement.parentElement,
                    domNode.parentElement.parentElement.childElementCount,
                  );
            if (
              (r(domNode),
              !childNodes ||
                !childNodes.length ||
                (domNode.classList && domNode.classList.contains('md-fences')))
            )
              return [domNode, itemIndex];
            try {
              var isCheckbox =
                childNodes[itemIndex] &&
                childNodes[itemIndex].getAttribute &&
                'checkbox' === childNodes[itemIndex].getAttribute('type');
              return preferStart
                ? (isCheckbox && itemIndex++,
                  itemIndex == childNodes.length
                    ? this.getDetailPos(childNodes[itemIndex - 1], o(childNodes[itemIndex - 1]))
                    : this.getDetailPos(childNodes[itemIndex], 0, !0))
                : 0 == itemIndex
                  ? (isCheckbox && itemIndex++, this.getDetailPos(childNodes[itemIndex], 0))
                  : this.getDetailPos(childNodes[itemIndex - 1], o(childNodes[itemIndex - 1]));
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
            element.length &&
              0 == range.startOffset &&
              (boundaryElement = (currentElement = element.closest(
                "[contenteditable='true'], [cid]",
              )).children()[0]) &&
              range.setStart(boundaryElement, 0),
              (element = jquery(range.endContainer).closest('.md-meta, .md-content')).length &&
                ((currentElement = element.closest("[contenteditable='true'], [cid]")).hasClass(
                  'md-meta',
                ) &&
                  (currentElement = currentElement
                    .parent()
                    .closest("[contenteditable='true'], [cid]")),
                (boundaryElement = currentElement.children().last()[0]) &&
                  range.setEndAfter(boundaryElement));
          }
        },
        deRange: function (range, applySelection, originalRange) {
          var fallbackRange = originalRange || range.cloneRange();
          try {
            var isBackward = range.isBackward,
              startPosition = this.getDetailPos(range.startContainer, range.startOffset, !0),
              endPosition = this.getDetailPos(range.endContainer, range.endOffset, !1);
            return (
              applySelection &&
                startPosition[0].parentElement &&
                'HR' == startPosition[0].parentElement.tagName &&
                (startPosition[0] = startPosition[0].parentElement.parentElement),
              range.setStart.apply(range, startPosition),
              range.setEnd.apply(range, endPosition),
              (range.isBackward = isBackward),
              originalRange && originalRange.equals(range)
                ? originalRange
                : (applySelection && this.setRange(range, !0), range)
            );
          } catch (error) {}
          return fallbackRange;
        },
        selectBlock: function () {
          this._selectLine('block');
        },
        selectLine: function () {
          return this._selectLine(!1);
        },
        selectLineWrap: function () {
          this._selectLine('line');
        },
        _selectLine: function (selectionUnit) {
          var currentCodeMirror, cursorPosition;
          if (this.editor.sourceView.inSourceMode)
            return (
              (cursorPosition = (currentCodeMirror = this.editor.sourceView.cm).getCursor(!0)),
              void currentCodeMirror.setSelection(
                CodeMirror.Pos(cursorPosition.line, 0),
                CodeMirror.Pos(
                  cursorPosition.line,
                  currentCodeMirror.getLine(cursorPosition.line).length,
                ),
              )
            );
          var element = jquery(document.activeElement).closest('.CodeMirror');
          if (element.length)
            return (
              (cursorPosition = (currentCodeMirror = element[0].CodeMirror).getCursor(!0)),
              void ('block' == selectionUnit
                ? currentCodeMirror.execCommand('selectAll')
                : currentCodeMirror.setSelection(
                    CodeMirror.Pos(cursorPosition.line, 0),
                    CodeMirror.Pos(
                      cursorPosition.line,
                      currentCodeMirror.getLine(cursorPosition.line).length,
                    ),
                  ))
            );
          if (
            document.activeElement &&
            DocumentNode.isType(document.activeElement.tagName, 'INPUT')
          )
            document.activeElement.select();
          else if ((currentRange = window.getSelection()).rangeCount) {
            var localElement = this.editor.getMarkElem(currentRange.commonAncestorContainer),
              range = rangy.createRange();
            if (!localElement.rawText().length) return;
            if (localElement.length) {
              if ('block' == selectionUnit)
                return (
                  localElement.closest('[mdtype="table"]').length &&
                    (localElement = localElement.closest('[mdtype="table"]')),
                  this.selectAllElem(localElement),
                  localElement
                );
              if (!localElement.closest("tr[mdtype='table_row']").length) {
                localElement.addClass('md-expand-on-selection');
                var currentRange = window.getSelection();
                (range = this.getRangy()).getBookmark(localElement[0]).start &&
                  currentRange.modify(
                    'move',
                    'backward',
                    selectionUnit ? 'paragraphboundary' : 'sentence',
                  ),
                  currentRange.modify(
                    'extend',
                    'forward',
                    selectionUnit ? 'paragraphboundary' : 'sentence',
                  ),
                  (range = this.getRangy());
                var currentElement = jquery(range.commonAncestorContainer).closest('.md-meta');
                return (
                  currentElement.length
                    ? this.selectAllElem(currentElement.closest('[md-inline]'))
                    : (currentElement = this.editor.getMarkElem(range.startContainer)).length &&
                      currentElement[0] !== this.editor.getMarkElem(range.endContainer)[0] &&
                      (range.setEndAfter(currentElement[0]), this.deRange(range, !0)),
                  localElement.removeClass('md-expand-on-selection'),
                  localElement
                );
              }
              var tableRow = localElement.closest("tr[mdtype='table_row']");
              range.selectNode(tableRow[0]),
                tableRow.closest('[mdtype="table"]').attr('contenteditable', !0),
                this.deRange(range, !0),
                tableRow.closest('[mdtype="table"]').attr('contenteditable', !1);
            }
          }
        },
        fixTripleClick: function (pointerEvent) {
          var element = this.editor.getMarkElem(pointerEvent.target);
          element.attr('mdtype') == documentModel.TYPE.table_cell
            ? this.selectAllElem(element)
            : this.selectLineWrap();
        },
        fixDblClick: function (pointerEvent) {
          var receiver = this,
            currentEditor = this.editor,
            range = this.getRangy();
          (function () {
            var imageElement = jquery(pointerEvent.target).closest(
              "[md-inline='image'],[md-inline='imgtag']",
            );
            if (imageElement.length) {
              if ('image' == imageElement.attr('md-inline')) {
                var element = jquery(pointerEvent.target);
                if (
                  (element.hasClass('md-image-src-span') ||
                    (element = element.closest('.md-image-src-span')),
                  element.length)
                ) {
                  if (range) {
                    var index = (element.text().match(/\s['"]/) || {}).index;
                    if ((range.setStart(element[0], 0), index)) {
                      if (range.endOffset > index) return !0;
                      range.setEnd(element[0].childNodes[0], index);
                    } else range.setEnd(element[0], 1);
                    return currentEditor.selection.setRange(range), !0;
                  }
                } else element = jquery(pointerEvent.target).closest('.md-image-before-src');
                if (element.length && range) {
                  var imageSyntax = element.text(),
                    startOffset = imageSyntax.indexOf(']') + 2;
                  if (range.startOffset > startOffset)
                    return (
                      range.setStart(element[0].childNodes[0], startOffset),
                      range.setEnd(element[0].childNodes[0], imageSyntax.length - 1),
                      range.select(range.isBackward),
                      !0
                    );
                  if (
                    range.startOffset >= 2 &&
                    range.endOffset > range.startOffset &&
                    range.endOffset < startOffset - 1
                  )
                    return (
                      range.setStart(element[0].childNodes[0], 2),
                      range.setEnd(element[0].childNodes[0], startOffset - 2),
                      range.select(range.isBackward),
                      !0
                    );
                }
                return currentEditor.selection.selectAllElem(imageElement), !0;
              }
              if ('IMG' == pointerEvent.target.tagName)
                return currentEditor.selection.selectAllElem(imageElement), !0;
            }
          })() ||
            (function () {
              if (
                range &&
                range.endContainer &&
                3 == range.endContainer.nodeType &&
                1 == range.endOffset
              ) {
                var domNode = range.endContainer,
                  textSlice = domNode.textContent.substring(0, 1);
                if (/\s/.exec(textSlice)) {
                  var ancestorElement = s(domNode.parentElement);
                  if (ancestorElement) {
                    for (
                      var trailingElement = l(ancestorElement), rangeAdjusted = !1;
                      trailingElement;
                    )
                      range.containsNode(trailingElement) &&
                        !trailingElement.offsetWidth &&
                        ((rangeAdjusted = !0), range.setEndBefore(trailingElement)),
                        (trailingElement =
                          (ancestorElement = s(ancestorElement)) && l(ancestorElement));
                    return rangeAdjusted && receiver.setRange(range), rangeAdjusted;
                  }
                }
              }
              function s(inputDomNode) {
                for (
                  var previousElementSibling = inputDomNode.previousElementSibling;
                  !previousElementSibling &&
                  !(inputDomNode = inputDomNode.parentElement).getAttribute('cid') &&
                  inputDomNode;
                )
                  previousElementSibling = inputDomNode.previousElementSibling;
                return previousElementSibling;
              }
              function l(element) {
                if (element.classList.contains('md-meta')) return element;
                for (; element; ) {
                  if (!element.children) return null;
                  if (
                    (element = element.children[element.children.length - 1]) &&
                    element.classList &&
                    element.classList.contains('md-meta')
                  )
                    return element;
                }
                return null;
              }
            })();
        },
        selectWord: function (
          respectWordBoundaries,
          includeTrailingSpace,
          range,
          returnOnly,
          forSpellcheck,
        ) {
          var codeMirror, selectionRange;
          if (this.editor.sourceView.inSourceMode)
            return (
              (selectionRange = (codeMirror = this.editor.sourceView.cm).findWordAt(
                codeMirror.getCursor(),
              )),
              void (
                !returnOnly &&
                codeMirror.extendSelection(selectionRange.anchor, selectionRange.head)
              )
            );
          this.selectWordTime = new Date();
          var element = jquery(document.activeElement).closest('.CodeMirror');
          if (element.length)
            return (
              (selectionRange = (codeMirror = element[0].CodeMirror).findWordAt(
                codeMirror.getCursor(),
              )),
              void (
                !returnOnly &&
                codeMirror.extendSelection(selectionRange.anchor, selectionRange.head)
              )
            );
          if ((range = range || this.getRangy())) {
            var currentElement = null;
            if (
              respectWordBoundaries &&
              (currentElement = jquery(range.startContainer).closest('.md-meta, .md-content'))
                .length
            )
              return (
                range.selectNode(currentElement.closest('[md-inline]')[0]),
                !returnOnly && this.setRange(range),
                range
              );
            if (
              (currentElement = jquery(range.startContainer).closest(
                ".md-content, [md-inline='url'], [md-inline='emoji'], [md-inline='escape']",
              )).length
            )
              return (
                range.selectNode(currentElement.closest('[md-inline]')[0]),
                !returnOnly && this.setRange(range, !0),
                range
              );
            if (
              ((currentElement = jquery(range.startContainer).closest('[md-inline]')).length ||
                (currentElement = jquery(range.startContainer).closest('[cid]')),
              currentElement.length)
            ) {
              var start = range.getBookmark(currentElement[0]).start,
                text = currentElement.rawText(),
                cjkPattern = /[\u3040-\uABFF\uD7A4-\uFAFF]/,
                letterPattern = /[a-zA-Z\u00C0-\u00ff]/,
                alphanumericPattern = /[0-9a-zA-Z\u00C0-\u00ff]/,
                apostrophePattern = /^['’‚‛]$/,
                items = [],
                cjkRun = null;
              if (
                (text
                  .split(
                    forSpellcheck
                      ? utilities.WESTERN_WORD_SPLITTER_SPELLCHECKER
                      : WESTERN_WORD_SPLITTER,
                  )
                  .filter(function (item) {
                    return !!item;
                  })
                  .forEach(function (item) {
                    if (cjkPattern.test(item)) cjkRun ? (cjkRun += item) : (cjkRun = item);
                    else {
                      if (cjkRun) items.push(cjkRun);
                      else {
                        var itemsLength = items.length;
                        if (apostrophePattern.exec(items[itemsLength - 1] || '')) {
                          if (
                            letterPattern.exec(item) &&
                            letterPattern.exec(items[itemsLength - 2] || '')
                          )
                            return void (items[itemsLength - 2] =
                              items[itemsLength - 2] + items.pop() + item);
                        } else if (
                          '.' == items[itemsLength - 1] &&
                          alphanumericPattern.exec(item) &&
                          alphanumericPattern.exec(items[itemsLength - 2] || '')
                        )
                          return void (items[itemsLength - 2] =
                            items[itemsLength - 2] + items.pop() + item);
                      }
                      items.push(item), (cjkRun = null);
                    }
                  }),
                cjkRun && items.push(cjkRun),
                items.length)
              ) {
                var currentStart = 0,
                  textLength = text.length,
                  wordStart = 0,
                  itemIndex = 0,
                  atWordEnd = !1;
                for (itemIndex = 0; itemIndex < items.length; itemIndex++) {
                  var length = items[itemIndex].length;
                  if (wordStart + length >= start) {
                    atWordEnd = wordStart + length == start;
                    break;
                  }
                  wordStart += length;
                }
                if (itemIndex >= items.length - 1) {
                  if (
                    ((currentStart = (textLength = text.length) - items.last().length),
                    respectWordBoundaries && utilities.NOT_WORD.exec(items.last()))
                  )
                    return;
                } else if (atWordEnd && !utilities.NOT_WORD.exec(items[itemIndex + 1]))
                  (textLength =
                    (currentStart = wordStart + items[itemIndex].length) +
                    items[1 + itemIndex].length),
                    includeTrailingSpace &&
                      /\s/.exec(items[itemIndex + 2] || 'a') &&
                      (textLength += 1);
                else if (utilities.NOT_WORD.exec(items[itemIndex])) {
                  if (respectWordBoundaries) return;
                  textLength =
                    (currentStart = wordStart + items[itemIndex].length) +
                    items[1 + itemIndex].length;
                } else
                  (textLength = (currentStart = wordStart) + items[itemIndex].length),
                    includeTrailingSpace &&
                      /\s/.exec(items[itemIndex + 1] || 'a') &&
                      (textLength += 1);
                return (
                  range.moveToBookmark({
                    containerNode: currentElement[0],
                    start: currentStart,
                    end: textLength,
                  }),
                  returnOnly ||
                    (this.setRange(range, !0), this.editor.wordCount.updateInSelection()),
                  range
                );
              }
            }
          }
        },
        selectPhrase: function () {
          if (this.editor.sourceView.inSourceMode) {
            var codeMirror = this.editor.sourceView.cm,
              selectionRange = codeMirror.findWordAt(codeMirror.getCursor());
            codeMirror.extendSelection(selectionRange.anchor, selectionRange.head);
          } else if (
            document.activeElement &&
            DocumentNode.isType(document.activeElement.tagName, 'INPUT')
          )
            document.activeElement.select();
          else {
            var element = jquery(document.activeElement).closest('.CodeMirror');
            if (element.length) (codeMirror = element[0].CodeMirror).execCommand('selectAll');
            else {
              var selectionContainer,
                range = this.getRangy(!0),
                selectContainerContents = !1;
              if (range) {
                if (this.editor.styleBookmark.style) {
                  var block = this.editor.styleBookmark.style.block;
                  if (
                    (block.indexOf(NodeType.def_footnote) > -1 ||
                    block.indexOf(NodeType.def_link) > -1
                      ? /md-def-(name|url|title)|/gi.exec(document.activeElement.className) &&
                        ((selectContainerContents = !0),
                        (selectionContainer = jquery(range.startContainer).closest(
                          '.md-def-name, .md-def-url, .md-def-title',
                        )[0]))
                      : block.indexOf(NodeType.table) > -1 &&
                        ((selectContainerContents = !0),
                        (selectionContainer = jquery(range.startContainer).closest(
                          "[mdtype='table_cell']",
                        )[0])),
                    (selectionContainer =
                      selectionContainer ||
                      (function e(domNode) {
                        return domNode
                          ? domNode.nodeType === domNode.ELEMENT_NODE
                            ? domNode.hasAttribute('md-inline') &&
                              domNode.getAttribute('md-inline') !== NodeType.plain
                              ? domNode
                              : domNode.hasAttribute('mdtype')
                                ? domNode
                                : domNode.classList.contains('md-def-name') ||
                                    domNode.classList.contains('md-def-content') ||
                                    domNode.classList.contains('md-def-title')
                                  ? domNode
                                  : e(domNode.parentElement)
                            : domNode.nodeType === domNode.TEXT_NODE
                              ? e(domNode.parentElement)
                              : null
                          : null;
                      })(range.startContainer)))
                  )
                    return (
                      (function (inputElement, selectionRange, contentsOnly) {
                        inputElement.getAttribute('md-inline') == NodeType.image &&
                          ((contentsOnly = !1), (inputElement = inputElement.children[0])),
                          contentsOnly
                            ? selectionRange.selectNodeContents(inputElement)
                            : (selectionRange.selectNode(inputElement),
                              editor.selection.deRange(selectionRange));
                      })(selectionContainer, range, selectContainerContents),
                      this.setRange(range, !0)
                    );
                }
                return this.selectWord();
              }
            }
          }
        },
        isCrossBlock: function (range) {
          return (range = range || this.getRangy())
            ? !range.collapsed &&
                this.editor.getJQueryElem(range.commonAncestorContainer).find('[mdtype]').length
            : range;
        },
        handleMouseSelection: function (pointerEvent) {
          'false' == this.editor.writingArea.getAttribute('contenteditable') &&
            (this.getBlockFromMouseEvent(pointerEvent).closest('.md-focus').length ||
              this.editor.writingArea.setAttribute('contenteditable', 'true'));
        },
        getBlockFromMouseEvent: function (pointerEvent) {
          var target = pointerEvent.target;
          return (
            this.editor.writingArea.contains(pointerEvent.target) ||
              (target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)),
            jquery(target).closest('[cid]')
          );
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
              return (
                range.setStartBefore(inlineElement),
                (precedingText = range.toString()),
                range.collapse(!1),
                range.setEndAfter(inlineElement),
                (followingText = range.toString()),
                range.setStart(inlineElement, 0),
                [precedingText, followingText, selectionBookmark]
              );
            }
          }
          return [];
        },
        getTextInSelection: function (range) {
          var element = jquery(document.activeElement).closest('.CodeMirror');
          return element.length
            ? element[0].CodeMirror.getSelection()
            : (range = range || this.getRangy()) &&
                !range.collapsed &&
                jquery(range.commonAncestorContainer).closest('#write').length
              ? jquery(jquery.parseHTML('<div>' + range.toHtml() + '</div>'))
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
                  .text()
              : '';
        },
        extendRange: function (range, endOffset) {
          if (range.commonAncestorContainer.nodeType === document.TEXT_NODE) {
            if (
              endOffset > 0 &&
              range.endOffset + endOffset <= range.commonAncestorContainer.length
            )
              return (
                range.setEnd(range.commonAncestorContainer, range.endOffset + endOffset), range
              );
            if (endOffset < 0 && range.startOffset + endOffset >= 0)
              return (
                range.setStart(range.commonAncestorContainer, range.startOffset + endOffset), range
              );
          }
          var containerNode = jquery(range.startContainer).closest('[cid]')[0],
            selectionBookmark = range.getBookmark(containerNode);
          return selectionBookmark.containerNode
            ? (endOffset > 0
                ? (selectionBookmark.end += endOffset)
                : (selectionBookmark.start += endOffset),
              range.moveToBookmark(selectionBookmark),
              range)
            : range;
        },
        createRange: function (startContainer, startOffset, endContainer, endOffset) {
          var range = rangy.createRange();
          return (
            range.setStart(startContainer, startOffset),
            range.setEnd(endContainer, endOffset),
            range.startContainer ? range : null
          );
        },
        moveToSelectable: function (moveToEnd, documentNode) {
          return F(this.editor, moveToEnd, documentNode);
        },
        includeTrailMeta: function (range) {
          if (!range || range.collapsed) return range;
          function t(domNode, backward, inputDomNode) {
            var currentDomNode = backward
              ? domNode.previousElementSibling
              : domNode.nextElementSibling;
            return domNode == range.commonAncestorContainer ||
              domNode.parentElement == range.commonAncestorContainer ||
              !domNode.parentElement ||
              (domNode.getAttribute && domNode.getAttribute('cid'))
              ? inputDomNode
              : (currentDomNode &&
                  currentDomNode.classList &&
                  currentDomNode.classList.contains('md-meta') &&
                  !jquery(currentDomNode.parentElement).closest('.md-expand').length &&
                  (inputDomNode = currentDomNode),
                t(domNode.parentElement, backward, inputDomNode));
          }
          var rangeAdjusted;
          if (0 == range.startOffset) {
            var leadingElement = t(range.startContainer, !0);
            leadingElement && ((rangeAdjusted = !0), range.setStart(leadingElement, 0));
          }
          if (
            (range.endContainer.childNodes &&
              range.endOffset == range.endContainer.childNodes.length) ||
            (range.endContainer.nodeType == document.TEXT_NODE &&
              range.endOffset == range.endContainer.nodeValue.length)
          ) {
            var trailingElement = t(range.endContainer, !1);
            trailingElement &&
              ((rangeAdjusted = !0),
              range.setEnd(trailingElement, trailingElement.childNodes.length));
          }
          return rangeAdjusted && this.setRange(range, !0), range;
        },
      });
    var y = function (event) {
        event && ((event.codemirrorIgnore = !0), event.preventDefault(), event.stopPropagation());
      },
      b = function (documentNode, element) {
        return (
          DocumentNode.isType(documentNode, DocumentNode.TYPE.hr, DocumentNode.TYPE.toc) &&
          (!element || ('write' !== element.attr('id') && element[0].hasAttribute('tabindex')))
        );
      },
      w = function (element) {
        var domNode = element[0];
        return (
          domNode.childElementCount > 0 &&
          (function () {
            for (var childIndex = 0; childIndex < domNode.childElementCount; childIndex++)
              if (domNode.children[0].getAttribute('md-inline') !== NodeType.image) return !1;
            return !0;
          })()
        );
      },
      x = function (editorInstance, element, cursorPosition) {
        var codeMirrorResult;
        if (
          (element.getAttribute('mdtype') === NodeType.fences &&
            (codeMirrorResult = editorInstance.fences.getCm(element.getAttribute('cid'))),
          element.getAttribute('mdtype') === NodeType.math_block &&
            (codeMirrorResult = editorInstance.mathBlock.startEditing(jquery(element))),
          element.getAttribute('mdtype') === NodeType.html_block &&
            (codeMirrorResult = editorInstance.htmlBlock.startEditing(jquery(element))),
          codeMirrorResult)
        )
          return (
            codeMirrorResult.then
              ? codeMirrorResult.then((result) => {
                  result.focus(), result.setCursor(cursorPosition);
                })
              : (codeMirrorResult.focus(), codeMirrorResult.setCursor(cursorPosition)),
            !0
          );
      },
      C = function (codeMirror, right) {
        if (void 0 != right) {
          var bounds = codeMirror.cursorCoords(codeMirror.getCursor());
          bounds.left = bounds.right = right;
          var cursorPosition = codeMirror.coordsChar(bounds);
          codeMirror.setCursor(cursorPosition);
        }
      },
      F = function (
        editorInstance,
        moveToEnd,
        documentNode,
        keyboardEvent,
        moveCommand,
        targetLeft,
      ) {
        if (!documentNode) return !1;
        var nodeElement = editorInstance.findElemById(documentNode.id);
        editorInstance.lastCursor = editorInstance.selection.buildUndo();
        var hasNoMoveCommand = !moveCommand;
        if (DocumentNode.isType(documentNode, NodeType.fences))
          return (
            (codeMirror = editorInstance.fences.getCm(documentNode.id)).focus(),
            moveToEnd
              ? (nodeElement.find('.marklyra-input-after').focus(),
                setTimeout(function () {
                  File.isTypeWriterMode &&
                    File.option.scrollWithCursor &&
                    editorInstance.selection.typeWriterScroll(
                      nodeElement.find('.marklyra-input-after'),
                    );
                }, 0))
              : (codeMirror.execCommand('goDocStart'), C(codeMirror, targetLeft)),
            y(keyboardEvent),
            !0
          );
        if (DocumentNode.isType(documentNode, NodeType.math_block))
          return (
            moveToEnd
              ? ((codeMirror = editorInstance.mathBlock.startEditing(
                  nodeElement,
                  !documentNode.get('tagAfter') && 'end',
                  hasNoMoveCommand,
                )),
                documentNode.get('tagAfter')
                  ? setTimeout(function () {
                      editorInstance.selection.selectAllElem(
                        nodeElement.find('.marklyra-input-after').focus(),
                      );
                    }, 0)
                  : C(codeMirror, targetLeft))
              : ((codeMirror = editorInstance.mathBlock.startEditing(
                  nodeElement,
                  !documentNode.get('tagBefore') && 'start',
                  hasNoMoveCommand,
                )),
                documentNode.get('tagBefore')
                  ? setTimeout(function () {
                      editorInstance.selection.selectAllElem(
                        nodeElement.find('.marklyra-input-before').focus(),
                      );
                    }, 0)
                  : C(codeMirror, targetLeft)),
            y(keyboardEvent),
            !0
          );
        if (DocumentNode.isType(documentNode, NodeType.html_block)) {
          var codeMirror = editorInstance.htmlBlock.startEditing(
            nodeElement,
            moveToEnd ? 'end' : 'start',
            hasNoMoveCommand,
          );
          return C(codeMirror, targetLeft), y(keyboardEvent), !0;
        }
        return (
          !!b(documentNode) &&
          (y(keyboardEvent),
          window.getSelection().removeAllRanges(),
          editorInstance.findElemById(documentNode.id).focus(),
          editorInstance.refocus(),
          !0)
        );
      },
      S = function (range, skipAdjustment) {
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
        )
          return range.startContainer.nextSibling.getBoundingClientRect();
        var element,
          rangeRects = range.getClientRects(),
          bounds = 1 == rangeRects.length && rangeRects[rangeRects.length - 1];
        if (rangeRects.length > 1) {
          if (skipAdjustment) return !1;
          bounds = range.getBoundingClientRect();
        }
        return !bounds && range.collapsed
          ? (element =
              range.startContainer.nodeType == document.TEXT_NODE
                ? range.startContainer.parentElement
                : range.startContainer) && 'write' != element.getAttribute('id')
            ? (bounds = element.getBoundingClientRect()).height > 150
              ? null
              : bounds
            : null
          : bounds;
      };
    (moduleRecord.exports = m),
      (moduleRecord.exports.buildRange = function (containerNode, startOffset, endOffset) {
        if (!containerNode) return window.getSelection().removeAllRanges();
        var textOffset = 0,
          range = rangy.createRange(),
          foundStart = !1,
          stopTraversal = {};
        range.collapseToPoint(containerNode, 0);
        try {
          !(function e(domNode) {
            if (3 == domNode.nodeType) {
              var nextTextOffset = textOffset + domNode.textContent.length;
              if (
                (!foundStart &&
                  startOffset >= textOffset &&
                  startOffset <= nextTextOffset &&
                  (range.setStart(domNode, startOffset - textOffset), (foundStart = !0)),
                foundStart && endOffset >= textOffset && endOffset <= nextTextOffset)
              )
                throw (range.setEnd(domNode, endOffset - textOffset), stopTraversal);
              textOffset = nextTextOffset;
            } else
              for (
                var itemIndex = 0, childNodesLength = domNode.childNodes.length;
                itemIndex < childNodesLength;
                ++itemIndex
              )
                e(domNode.childNodes[itemIndex]);
          })(containerNode);
        } catch (error) {
          if (error == stopTraversal) return range;
          throw error;
        }
      }),
      (moduleRecord.exports.rangy = rangy);
  },
);
