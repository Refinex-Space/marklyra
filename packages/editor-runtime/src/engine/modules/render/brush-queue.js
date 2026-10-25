// render/brush-queue.
// SystemJS module 2b. Dependencies: 2c, 11, 19, 13, 2d, 1b, 2a, 1d.
$__System.registerDynamic(
  '2b',
  ['2c', '11', '19', '13', '2d', '1b', '2a', '1d'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self, requireModule('2c');
    var utilities = requireModule('11'),
      markdownParser = requireModule('19'),
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      formatting = requireModule('2d'),
      undoManager = requireModule('1b'),
      mediaActions = requireModule('2a'),
      SnapFlag = undoManager.SnapFlag,
      BrushQueue =
        (requireModule('1d'),
        function (inputEditor) {
          (this.editor = inputEditor),
            (this.queue = []),
            (this.interval = 200),
            (this.inline = new markdownParser.InlineLexer()),
            (this.articleArea = document.querySelector(this.editor.sessionStr));
        });
    BrushQueue.prototype = {
      addToQueue: function (nodeId, inlineOnly) {
        (inlineOnly = inlineOnly || !1),
          utilities.isNullOrEmpty(nodeId) ||
            this.queue.push({ cid: nodeId, inlineOnly: inlineOnly });
      },
      run: function () {
        this.timerID || this.scheduleNext(),
          this.editor._brushInitCallback &&
            (this.editor._brushInitCallback(), (this.editor._brushInitCallback = null));
      },
      scheduleNext: function () {
        var receiver = this;
        this.timerID = window.setTimeout(async function () {
          await receiver.brushQueue(), receiver.scheduleNext();
        }, this.interval);
      },
      clearAndPause: function () {
        this.willExpandSoon && clearTimeout(this.willExpandSoon), (this.queue = []), this.pause();
      },
      pause: function () {
        clearTimeout(this.timerID),
          (this.timerID = null),
          this.editor.mathBlock && this.editor.mathBlock.clearCache();
      },
      resume: async function (flushQueue) {
        flushQueue && (await this.brushQueue()), this.run();
      },
      restart: function () {
        (this.queue = []), this.run();
      },
      brushNode: function (nodeId) {
        var selectionBookmark = this.editor.selection.buildUndo();
        g.call(this, nodeId, {}, selectionBookmark, !1) &&
          (function (__marklyraBrushEditor) {
            const __marklyraBrushUndo = __marklyraBrushEditor.undo;
            return (function (__marklyraBrushCommand, __marklyraBrushBookmark) {
              const __marklyraBrushRestore = window.__MARKLYRA_RESTORE_BRUSH_CURSOR__;
              return typeof __marklyraBrushRestore === 'function'
                ? __marklyraBrushRestore(
                    __marklyraBrushEditor,
                    __marklyraBrushBookmark,
                    (__marklyraBrushNext) =>
                      Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                        __marklyraBrushNext,
                      ]),
                  )
                : Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                    __marklyraBrushBookmark,
                  ]);
            })(__marklyraBrushUndo.exeCommand, selectionBookmark);
          })(this.editor);
      },
      brushQueue: async function () {
        var receiver = this,
          processedNodes = {},
          queueLength = receiver.queue.length;
        if (!this.editor.isIME && !this.editor.isMousePressed) {
          if (receiver.queue.length > 0 && !File.isLocked) {
            console.debug('brushQueue', receiver.queue);
            var selectionChanged = !1,
              onlyInlineTasks = !0;
            !(function () {
              var range = receiver.editor.selection.getRangy();
              if (range) {
                var localElement = a(range.startContainer),
                  element = localElement.closest('[cid]'),
                  currentElement = a(range.endContainer).closest('[cid]');
                element &&
                  element.querySelectorAll('.md-math-after-sym').forEach(function (item) {
                    let text = item.textContent.replace(/\u200b/g, '');
                    text != item.textContent && (item.textContent = text);
                  }),
                  currentElement &&
                    currentElement != element &&
                    currentElement.querySelectorAll('.md-math-after-sym').forEach(function (item) {
                      item.textContent = item.textContent.replace(/\u200b/g, '');
                    }),
                  range.collapsed &&
                    (range.startContainer.parentElement ||
                      (range.selectNode(localElement),
                      range.collapse(!1),
                      receiver.editor.selection.setRange(range)));
              }
            })();
            var selectionBookmark = receiver.editor.selection.buildUndo();
            var __marklyraBrushBatch = receiver.queue.slice(),
              __marklyraBrushConsumed = new Set(__marklyraBrushBatch);
            await Promise.all(
              __marklyraBrushBatch.map((item) =>
                (async function (task) {
                  return (
                    processedNodes[task.cid] ||
                      ((processedNodes[task.cid] = 1),
                      (selectionChanged =
                        (await g.call(
                          receiver,
                          task.cid,
                          processedNodes,
                          selectionBookmark,
                          task.inlineOnly,
                          !0,
                        )) || selectionChanged),
                      (onlyInlineTasks = onlyInlineTasks && task.inlineOnly)),
                    Promise.resolve()
                  );
                })(item),
              ),
            ),
              (receiver.queue = receiver.queue.filter(function (__marklyraBrushTask) {
                return !__marklyraBrushConsumed.has(__marklyraBrushTask);
              })),
              selectionChanged &&
                selectionBookmark &&
                (function (__marklyraBrushEditor) {
                  const __marklyraBrushUndo = __marklyraBrushEditor.undo;
                  return (function (__marklyraBrushCommand, __marklyraBrushBookmark) {
                    const __marklyraBrushRestore = window.__MARKLYRA_RESTORE_BRUSH_CURSOR__;
                    return typeof __marklyraBrushRestore === 'function'
                      ? __marklyraBrushRestore(
                          __marklyraBrushEditor,
                          __marklyraBrushBookmark,
                          (__marklyraBrushNext) =>
                            Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                              __marklyraBrushNext,
                            ]),
                        )
                      : Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                          __marklyraBrushBookmark,
                        ]);
                  })(__marklyraBrushUndo.exeCommand, selectionBookmark);
                })(receiver.editor),
              this.expand(!0, !1, onlyInlineTasks);
          }
          queueLength && this.triggerAutoComplete();
        }
        function a(domNode) {
          return domNode.closest ? domNode : domNode.parentElement;
        }
      },
      triggerAutoComplete: function (allowMathSuggestions) {
        var match,
          currentMatch,
          completionAnchor = null,
          emojiMatch = null,
          currentEditor = this.editor,
          autoComplete = this.editor.autoComplete,
          surroundingText = this.editor.selection.getTextAround(),
          textBeforeCaret = surroundingText[0],
          textAfterCaret = surroundingText[1],
          completionBookmark = surroundingText[2],
          currentElement = this.editor.getJQueryElem(
            (this.editor.selection.getRangy() || {}).commonAncestorContainer,
          ),
          elementLength = currentElement.closest('.md-inline-math').length,
          mathSuggestionsEnabled = allowMathSuggestions && File.option.enableInlineMath,
          range = this.editor.selection.getRangy();
        if (completionBookmark && range && range.collapsed && (textBeforeCaret || textAfterCaret)) {
          if (
            ((currentEditor.lastCursor = currentEditor.selection.buildUndo(range)),
            (currentMatch = function () {
              if (range && range.collapsed) {
                var element = $(range.endContainer).closest('.md-lang'),
                  languageText = element.text(),
                  start = element.prev().text().length + element.parent().prevAll().text().length;
                if (languageText)
                  return (
                    (completionAnchor = {
                      start: start,
                      end: start + languageText.length,
                      containerNode: element.closest('[mdtype]')[0],
                    }),
                    languageText
                  );
              }
            }.call(this)))
          )
            return void autoComplete.show(this.editor.fences.ALL, completionAnchor, currentMatch, {
              type: 'fences',
              render: this.editor.fences.autoCompleteRender,
            });
          if ((emojiMatch = /:(\w+)$/.exec(textBeforeCaret))) {
            if (File.option.noEmojiAutoComplete) return;
            return void (
              (match = /^(\w*:*)(\s|$)/.exec(textAfterCaret || '')) &&
              ((completionBookmark.start -= emojiMatch[1].length + 1),
              (completionBookmark.end += match[1].length),
              (completionAnchor = completionBookmark),
              autoComplete.show(
                [],
                completionAnchor,
                emojiMatch[1] + match[1],
                this.editor.emoji.autoCompleteOption(),
              ))
            );
          }
          mathSuggestionsEnabled &&
            (currentMatch = /\$?\$$/.exec(textBeforeCaret)) &&
            0 == $('.md-expand.md-inline-math').length &&
            (function () {
              var remainingDollars,
                length = (/^\$+/.exec(textAfterCaret) || '').length;
              if (length <= currentMatch[0].length)
                (remainingDollars = '$'.repeat(currentMatch[0].length - length)).length &&
                  (range.insertNode(document.createTextNode(remainingDollars)), range.collapse(!0)),
                  (completionBookmark.start -= currentMatch[0].length),
                  (completionBookmark.end += currentMatch[0].length),
                  range.moveToBookmark(completionBookmark),
                  currentEditor.mathInline.showAutoSuggest(range),
                  currentEditor.restoreLastCursor(null, !0),
                  currentEditor.undo.addSnap(currentEditor.focusCid, SnapFlag.REPLACE),
                  (completionAnchor = null);
            })();
        } else elementLength && currentElement.trigger('inline-math-changed');
        this.editor.autoComplete.hide();
      },
      expandOnDelay: function (crossBoundary) {
        var receiver = this;
        this.willExpandSoon && clearTimeout(this.willExpandSoon),
          (this.willExpandSoon = setTimeout(function () {
            receiver.expand(crossBoundary);
          }, 10));
      },
      closestExpandable: function (inputElement) {
        var element = inputElement.closest('[md-inline]'),
          currentElement = element.parent().closest('[md-inline]');
        if (!currentElement.length) return element;
        var inlineType = element.attr('md-inline');
        return (inlineType &&
          !DocumentNode.isType(
            inlineType,
            NodeType.plain,
            NodeType.br,
            NodeType.tag,
            NodeType.autolink,
            NodeType.pants,
            NodeType.attr,
            NodeType.linebreak,
          ) &&
          element.prevAll('[md-inline]').length) ||
          element.nextAll('[md-inline]').length
          ? element
          : this.closestExpandable(currentElement);
      },
      expand: function (
        crossBoundary,
        suppressSelectionWork,
        skipInlineReparse,
        preserveEndBoundary,
      ) {
        if (
          (!suppressSelectionWork && this.editor.wordCount.updateInSelection(),
          this.willExpandSoon && (clearTimeout(this.willExpandSoon), (this.willExpandSoon = null)),
          !this.editor.isIME && !File.isLocked)
        ) {
          var selectionElement,
            selection = this.editor.selection,
            range = selection.getRangy(),
            rangy = selection.rangy,
            currentRange = range ? range.cloneRange() : null;
          if (
            currentRange &&
            (currentRange.startContainer != this.editor.writingArea ||
              0 != currentRange.startOffset)
          )
            if (($('.selected').removeClass('selected'), range)) {
              if (
                (this.editor.selection.deRange(range),
                (selectionElement = this.editor.getJQueryElem(range.commonAncestorContainer)),
                this.editor.stylize.putBookmark(
                  currentRange,
                  this.editor.stylize.buildBookmark(selectionElement),
                ),
                (function (expandedElements) {
                  try {
                    var element = document.querySelector('.md-inline-math.md-expand');
                    if (!element) return;
                    if (expandedElements.length && element.contains(expandedElements[0])) return;
                    var currentElement = element.querySelector('.md-inline-math-container script'),
                      mathPreview = svgCache[currentElement.innerHTML.trim()];
                    (mathPreview = mathPreview
                      ? $(mathPreview)[0]
                      : document.querySelector('#math-inline-preview-content mjx-container')) &&
                      ($(element.querySelector('mjx-container')).replaceWith(mathPreview),
                      (window.svgCache[currentElement.textContent.trim()] =
                        mediaActions.processExportedSVG(
                          element.querySelector('.md-inline-math-container').innerHTML,
                          !0,
                        )));
                  } catch (error) {}
                })(selectionElement),
                !suppressSelectionWork &&
                  !skipInlineReparse &&
                  (function (inputElement, selectionRange) {
                    var element = inputElement.closest('[cid]');
                    if (
                      element.length &&
                      inputElement.closest('[md-inline]').length &&
                      !inputElement.closest('.md-block-like').length
                    ) {
                      var elements = element.find('.md-block-like');
                      if (!elements.length) return !1;
                      var documentNode = editor.findNodeByElem(inputElement.closest('[cid]')),
                        selectionBookmark = editor.selection.buildUndo(selectionRange);
                      if (documentNode.cid != selectionBookmark.endId) return !1;
                      var length = elements.prevAll().rawText().length,
                        currentLength = elements.rawText().length;
                      if (
                        !editor.lastCursor ||
                        editor.lastCursor.endId != selectionBookmark.endId ||
                        editor.lastCursor.startOffset > length + currentLength ||
                        editor.lastCursor.endOffset < length + currentLength
                      )
                        return !1;
                      var beforeMetadata = !1;
                      selectionRange.comparePoint(elements[0], 0) < 0 &&
                        ((selectionBookmark.start = selectionBookmark.end =
                          selectionBookmark.end - length - currentLength),
                        (beforeMetadata = !0));
                      var parseResult = editor.simpleParse(documentNode, !1);
                      if (parseResult)
                        return (
                          editor.findElemById(parseResult[2]).replaceWith(parseResult[1]),
                          beforeMetadata &&
                            parseResult[3].length > 1 &&
                            (selectionBookmark.startId = selectionBookmark.endId =
                              parseResult[3].last().getVeryFirst().cid),
                          editor.undo.exeCommand(selectionBookmark),
                          (parseResult[0].undo[0] = editor.lastCursor),
                          parseResult[0].redo.push(editor.selection.buildUndo()),
                          editor.undo.register(parseResult[0]),
                          editor.quickRefresh(),
                          !0
                        );
                    }
                    return !1;
                  })(selectionElement, range))
              )
                return;
              if (
                isInputComponent(document.activeElement) ||
                ('write' !== document.activeElement.id &&
                  document.activeElement.hasAttribute('tabindex'))
              )
                return (
                  $('.md-expand').removeClass('md-expand'),
                  $(this.editor.sessionStr).trigger('cursorChange', this.editor.styleBookmark)
                );
              if (
                (!selectionElement.closest('[cid]').length &&
                  !selectionElement.find('[cid]').length) ||
                DocumentNode.isType(
                  selectionElement.closest('[cid]').attr('mdtype'),
                  NodeType.fences,
                  NodeType.math_block,
                  NodeType.html_block,
                )
              )
                return $(this.editor.sessionStr).trigger('cursorChange', this.editor.styleBookmark);
              if (range.collapsed) {
                var startExpansion,
                  expandableElement = m(selectionElement),
                  localElement = selectionElement.closest('[mdtype]'),
                  endExpansion = [],
                  localLength = expandableElement.visibleText().length,
                  boundaryInfo =
                    localLength > 0 &&
                    localLength < expandableElement.text().length &&
                    (function (inputRange, expansionRoot) {
                      function n(domNode) {
                        for (var nextSibling = domNode.nextSibling; nextSibling; ) {
                          if (nextSibling.offsetWidth) return !1;
                          nextSibling = nextSibling.nextSibling;
                        }
                        return !0;
                      }
                      if (!expansionRoot) return null;
                      if (
                        inputRange.endOffset == inputRange.endContainer.length ||
                        '​' == inputRange.endContainer.textContent
                      ) {
                        for (
                          var domNode = inputRange.endContainer;
                          (expansionRoot.contains(domNode) || expansionRoot == domNode) &&
                          !domNode.parentElement.getAttribute('cid') &&
                          n(domNode);
                        )
                          domNode = domNode.parentElement;
                        return [domNode, !0];
                      }
                      if (0 == inputRange.startOffset) {
                        for (
                          var currentDomNode = inputRange.startContainer;
                          (expansionRoot.contains(currentDomNode) ||
                            expansionRoot == currentDomNode) &&
                          !currentDomNode.parentElement.getAttribute('cid') &&
                          (!(boundaryNode = currentDomNode).previousSibling ||
                            (1 == boundaryNode.previousSibling.nodeType &&
                              !boundaryNode.previousSibling.offsetWidth));
                        )
                          currentDomNode = currentDomNode.parentElement;
                        return [currentDomNode, !1];
                      }
                      var boundaryNode;
                      return null;
                    })(range, expandableElement[0]);
                if (boundaryInfo) {
                  var [boundaryElement, collapseAtEnd] = boundaryInfo;
                  (startExpansion = $(boundaryElement).addClass('md-expand')),
                    (currentRange = rangy.createRange()),
                    collapseAtEnd
                      ? currentRange.collapseToPoint(
                          boundaryElement,
                          boundaryElement.childNodes
                            ? boundaryElement.childNodes.length
                            : boundaryElement.length,
                        )
                      : currentRange.collapseToPoint(boundaryElement, 0),
                    this.editor.selection.setRange(currentRange, !0);
                } else if (
                  (k(range, -1),
                  $(range.endContainer).parent().hasClass('md-softbreak') &&
                    currentRange.startContainer === currentRange.endContainer &&
                    (range = currentRange.cloneRange()),
                  (startExpansion =
                    localElement[0] != $(range.startContainer).closest('[mdtype]')[0]
                      ? expandableElement
                      : m(this.editor.getJQueryElem(range.startContainer))),
                  range.startContainer === range.endContainer)
                )
                  if (
                    (range.toString().length && range.collapse(!1),
                    3 == range.endContainer.nodeType &&
                      range.endOffset == range.endContainer.textContent.length &&
                      E(range.endContainer.nextElementSibling))
                  )
                    range.endContainer.nextElementSibling.classList.add('selected'),
                      range.selectNode(range.endContainer.nextElementSibling);
                  else {
                    k(range, 1);
                    var intersectingElements = range.getNodes([1], E);
                    intersectingElements.length &&
                      (currentRange.setStart(intersectingElements[0], 0),
                      currentRange.setEnd(intersectingElements[0], 0),
                      editor.selection.setRange(currentRange, !0));
                  }
              } else startExpansion = m(this.editor.getJQueryElem(range.startContainer));
              if (
                (!(endExpansion = m(this.editor.getJQueryElem(range.endContainer))).length &&
                  (endExpansion = startExpansion),
                startExpansion.length || endExpansion.length)
              ) {
                var selectionRebased = !1;
                currentRange.collapsed ||
                  (selectionRebased =
                    (currentRange =
                      (function (inputRange) {
                        var originalRange,
                          collapsed = inputRange.collapsed,
                          extendEndBoundary = !1;
                        try {
                          var blockElement,
                            expandedAncestor,
                            commonAncestorContainer = inputRange.commonAncestorContainer;
                          if (
                            0 == inputRange.startOffset &&
                            startExpansion.length &&
                            (startExpansion = editor.getJQueryElem(inputRange.startContainer))
                              .length
                          )
                            if (
                              startExpansion.closest('.md-expand').length ||
                              startExpansion[0].hasAttribute('cid') ||
                              startExpansion[0].querySelector('[cid]') ||
                              startExpansion.closest('.md-image:not(.md-img-loaded)').length
                            )
                              (expandedAncestor = startExpansion.closest('.md-expand')).length &&
                                (startExpansion = expandedAncestor);
                            else {
                              if (
                                ((blockElement = startExpansion.closest('[cid]')[0]),
                                !(startExpansion = (function t(candidateElement, blockBoundary) {
                                  if (
                                    !candidateElement.prevAll(':not(.md-meta, .md-content)').text()
                                      .length
                                  ) {
                                    var element = candidateElement.parent();
                                    return element.attr('mdtype')
                                      ? candidateElement
                                      : blockBoundary.contains(element[0]) || crossBoundary
                                        ? t(element, blockBoundary)
                                        : m(candidateElement);
                                  }
                                  return m(candidateElement);
                                })(
                                  startExpansion,
                                  commonAncestorContainer.contains &&
                                    commonAncestorContainer.contains(blockElement)
                                    ? blockElement
                                    : commonAncestorContainer,
                                )).length)
                              )
                                return null;
                              (originalRange = inputRange.cloneRange()),
                                inputRange.setStartBefore(startExpansion[0]),
                                (extendEndBoundary =
                                  !preserveEndBoundary &&
                                  !collapsed &&
                                  0 == inputRange.startOffset &&
                                  inputRange.startContainer.getAttribute &&
                                  inputRange.startContainer.getAttribute('cid')),
                                inputRange.containsNode(startExpansion[0]) ||
                                  (inputRange = originalRange),
                                collapsed && inputRange.collapse(!0);
                            }
                          if (
                            inputRange.endOffset ==
                            (inputRange.endContainer.nodeType === document.TEXT_NODE
                              ? inputRange.endContainer.length
                              : inputRange.endContainer.childNodes.length)
                          ) {
                            var currentElement = editor.getJQueryElem(inputRange.endContainer);
                            if (currentElement.length)
                              if (
                                currentElement.closest('.md-expand').length ||
                                currentElement[0].hasAttribute('cid') ||
                                currentElement[0].querySelector('[cid]') ||
                                currentElement.closest('.md-image:not(.md-img-loaded)').length
                              )
                                (expandedAncestor = currentElement.closest('.md-expand')).length &&
                                  (currentElement = expandedAncestor);
                              else {
                                if (
                                  ((blockElement = currentElement.closest('[cid]')[0]),
                                  !(currentElement = (function e(candidateElement, endBoundary) {
                                    if (
                                      !candidateElement
                                        .nextAll(':not(.md-meta, .md-content)')
                                        .text().length
                                    ) {
                                      var element = candidateElement.parent();
                                      return element.hasClass('[mdtype]') ||
                                        element[0].contains(endBoundary)
                                        ? m(candidateElement)
                                        : e(element, endBoundary);
                                    }
                                    return m(candidateElement);
                                  })(
                                    currentElement,
                                    commonAncestorContainer.contains &&
                                      commonAncestorContainer.contains(blockElement)
                                      ? blockElement
                                      : commonAncestorContainer,
                                  )).length)
                                )
                                  return null;
                                (originalRange = inputRange.cloneRange()),
                                  inputRange.setEndAfter(currentElement[0]),
                                  extendEndBoundary &&
                                  inputRange.endContainer.childNodes &&
                                  inputRange.endContainer.childNodes.length == inputRange.endOffset
                                    ? inputRange.setStartBefore(startExpansion[0])
                                    : inputRange.containsNode(currentElement[0]) ||
                                      (inputRange = originalRange),
                                  collapsed && inputRange.collapse(!1);
                              }
                          }
                        } catch (error) {
                          console.warn(error);
                        }
                        return inputRange;
                      })(currentRange) || currentRange) && !currentRange.collapsed),
                  $('.md-expand').removeClass('md-expand'),
                  startExpansion.length ? f.call(this, startExpansion) : f.call(this, endExpansion),
                  startExpansion.length &&
                    endExpansion.length &&
                    !endExpansion.hasClass('md-img-loaded') &&
                    f.call(this, endExpansion, !0);
              } else $('.md-expand').removeClass('md-expand');
              if (selectionRebased)
                this.editor.selection.deRange(currentRange, !0, currentRange.cloneRange());
              else {
                var localDomNode = window.getSelection().anchorNode;
                localDomNode &&
                  (3 === localDomNode.nodeType ||
                    (localDomNode.hasAttribute && localDomNode.hasAttribute('contenteditable'))) &&
                  ((currentRange = currentRange || this.editor.selection.getRangy()),
                  this.editor.selection.deRange(currentRange, !0, currentRange.cloneRange())),
                  currentRange.commonAncestorContainer.parentElement &&
                  currentRange.commonAncestorContainer.parentElement.classList.contains(
                    'marklyra-focusable-btn',
                  )
                    ? currentRange.commonAncestorContainer.parentElement.classList.add('selected')
                    : E(localDomNode) && localDomNode.classList.add('selected');
              }
              $(this.editor.sessionStr).trigger('cursorChange', this.editor.styleBookmark);
            } else
              (selectionElement = this.editor.getMarkElem()),
                $('.md-expand').removeClass('md-expand'),
                selectionElement.length &&
                  DocumentNode.isType(
                    selectionElement.attr('mdtype'),
                    DocumentNode.TYPE.hr,
                    DocumentNode.TYPE.toc,
                  ) &&
                  (this.editor.stylize.putBookmark(
                    null,
                    this.editor.stylize.buildBookmark(selectionElement),
                  ),
                  $(this.editor.sessionStr).trigger('cursorChange', this.editor.styleBookmark));
        }
        function k(selectionRange, direction) {
          return selection.extendRange(selectionRange, direction);
        }
        function E(element) {
          return (
            element && element.classList && element.classList.contains('marklyra-focusable-btn')
          );
        }
      },
      focusContainer: function (container) {
        p.call(this, container);
      },
    };
    var p = function (inputElement) {
        var element = inputElement.closest('tr.md-end-block, li[cid]')[0],
          domNode = inputElement[0];
        if (element && domNode) {
          for (; element !== domNode && element.contains(domNode); ) {
            if (
              domNode.previousSibling &&
              domNode.previousSibling.hasAttribute &&
              domNode.previousSibling.hasAttribute('cid')
            )
              return !1;
            domNode = domNode.parentElement;
          }
          element.classList.add('md-focus-container');
        }
      },
      f = function (element, keepFocusContainer) {
        keepFocusContainer || $('.md-focus-container').removeClass('md-focus-container'),
          element.length &&
            p(
              element.addClass('md-expand').trigger('expand').closest('[cid]').addClass('md-focus'),
            );
      };
    function m(inputElement) {
      var element = inputElement.parent().closest('[md-inline]');
      return element.length ? m(element) : inputElement.closest('[md-inline]');
    }
    var g = async function (
      inputNodeId,
      processedNodes,
      selectionBookmark,
      inlineOnly,
      awaitInlineMath,
    ) {
      var nodeElement,
        sourceText,
        parseResult,
        documentNode = inputNodeId,
        nodeId = inputNodeId,
        start = 0;
      function v(element) {
        for (var itemIndex = 0; itemIndex < element.attributes.length; itemIndex++)
          DocumentNode.isType(
            element.attributes[itemIndex].name,
            'cid',
            'contenteditable',
            'id',
            'for',
            'onerror',
            'onload',
          ) && element.removeAttributeNode(element.attributes[itemIndex]);
        element.classList.remove('md-img-loaded'), element.classList.remove('md-img-error');
      }
      function y(container) {
        for (
          var elements = container.querySelectorAll('*'), itemIndex = 0;
          itemIndex < elements.length;
          itemIndex++
        )
          v(elements[itemIndex]);
        v(container);
      }
      async function b(
        inputElement,
        documentNode,
        parseResult,
        selectionBookmark,
        editor,
        cursorDiff,
      ) {
        if (inputElement.length) {
          var domChanged,
            innerHtml = parseResult.innerHtml,
            clonedNode = inputElement[0].cloneNode(!0),
            divElement = document.createElement('div'),
            elementsLength =
              ((cursorDiff = parseResult.cursorDiff), inputElement.find('.md-footnote').length);
          divElement.innerHTML = innerHtml;
          var expandedMathText = null;
          return (
            clonedNode.querySelectorAll('.md-expand').forEach(function (element) {
              element.classList.contains('md-inline-math') &&
                ((element.querySelector('.md-before') || {}).textContent !==
                (element.querySelector('.md-after') || {}).textContent
                  ? (element.textContent = '')
                  : (expandedMathText = element.rawText(!0))),
                element.classList.remove('md-expand');
            }),
            clonedNode.querySelectorAll('.md-inline-math').forEach(function (element) {
              (element.textContent = element.rawText(!0)),
                element.setAttribute('id', ''),
                expandedMathText == element.textContent && element.setAttribute('class', '');
            }),
            divElement.querySelectorAll('.md-inline-math').forEach(function (element) {
              (element.textContent = element.rawText(!0)),
                element.setAttribute('id', ''),
                expandedMathText == element.textContent && element.setAttribute('class', '');
            }),
            y(clonedNode),
            y(divElement),
            clonedNode.innerHTML.replace(/\s*class=\"\"/gi, '') !=
            divElement.innerHTML.replace(/\s*class=\"\"/gi, '')
              ? (inputElement.html(innerHtml),
                parseResult.mdlike
                  ? inputElement.attr('mdlike') != parseResult.mdlike &&
                    inputElement.attr('mdlike', parseResult.mdlike)
                  : inputElement.attr('mdlike') && inputElement.removeAttr('mdlike'),
                editor.selection.clearGlobalColumn(),
                awaitInlineMath
                  ? await editor.mathInline.brush(inputElement[0], selectionBookmark, !0)
                  : editor.mathInline.brush(inputElement[0], selectionBookmark, !0),
                (domChanged = !0))
              : (inputElement.hasClass('unholdable') && inputElement.removeClass('unholdable'),
                inputElement.find('.math-jax-preprocess').length &&
                  editor.mathInline.brush(inputElement[0], selectionBookmark, !0)),
            (inputElement.find('.md-footnote').length || elementsLength) &&
              editor.docMenu &&
              editor.docMenu.refreshFootnoteReverseLink(),
            editor.focusCid === documentNode.cid
              ? ((function (
                  selectionBookmark,
                  cursorOffsets,
                  historyEntry,
                  unusedParameter4,
                  editor,
                  domChanged,
                ) {
                  if (domChanged || cursorOffsets.length)
                    return (
                      selectionBookmark &&
                        (historyEntry && historyEntry.undo.unshift(Object.clone(selectionBookmark)),
                        (selectionBookmark.start = x(
                          cursorOffsets,
                          selectionBookmark.start - start,
                        )),
                        (selectionBookmark.end = x(cursorOffsets, selectionBookmark.end - start)),
                        historyEntry && historyEntry.redo.push(selectionBookmark),
                        editor.undo &&
                          (function (__marklyraBrushEditor) {
                            const __marklyraBrushUndo = __marklyraBrushEditor.undo;
                            return (function (__marklyraBrushCommand, __marklyraBrushBookmark) {
                              const __marklyraBrushRestore =
                                window.__MARKLYRA_RESTORE_BRUSH_CURSOR__;
                              return typeof __marklyraBrushRestore === 'function'
                                ? __marklyraBrushRestore(
                                    __marklyraBrushEditor,
                                    __marklyraBrushBookmark,
                                    (__marklyraBrushNext) =>
                                      Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                                        __marklyraBrushNext,
                                      ]),
                                  )
                                : Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                                    __marklyraBrushBookmark,
                                  ]);
                            })(__marklyraBrushUndo.exeCommand, selectionBookmark);
                          })(editor)),
                      !0
                    );
                })(selectionBookmark, cursorDiff, parseResult.command, 0, editor, domChanged),
                !1)
              : domChanged
          );
        }
      }
      async function w(nodeElement, documentNode, parseResult, selectionBookmark, editor) {
        return parseResult.blockChanged
          ? (function (element, documentNode, parseResult, selectionBookmark, editor) {
              var cursorOffsets = parseResult.cursorDiff || [];
              return (
                editor.selection.clearGlobalColumn(),
                parseResult.replaceCid
                  ? (editor.findElemById(parseResult.replaceCid).replaceWith(parseResult.html),
                    editor.refreshUnder(editor.findElemById(parseResult.replaceCid)[0]))
                  : element.closest('p').replaceWith(parseResult.html),
                parseResult.toRemove &&
                  parseResult.toRemove.forEach(function (callbackNodeId) {
                    editor.findElemById(callbackNodeId).remove();
                  }),
                (editor.focusCid && editor.focusCid !== documentNode.cid) ||
                  ((editor.focusCid = parseResult.focus),
                  editor.focusCid && p(editor.findElemById(editor.focusCid)),
                  selectionBookmark &&
                    (parseResult.command.undo.unshift(Object.clone(selectionBookmark)),
                    cursorOffsets.length &&
                      ((selectionBookmark.start = x(cursorOffsets, selectionBookmark.start)),
                      (selectionBookmark.end = x(cursorOffsets, selectionBookmark.end))),
                    (selectionBookmark.id = parseResult.focus),
                    (selectionBookmark.startId = parseResult.focus),
                    (selectionBookmark.endId = parseResult.focus),
                    (selectionBookmark.start -= parseResult.offset),
                    (selectionBookmark.end -= parseResult.offset),
                    parseResult.command.redo.push(Object.clone(selectionBookmark))),
                  editor.undo.register(parseResult.command)),
                !0
              );
            })(nodeElement, documentNode, parseResult, selectionBookmark, editor)
          : await b(nodeElement, documentNode, parseResult, selectionBookmark, editor);
      }
      function x(offsetCorrections, sourceOffset) {
        var correctedOffset = sourceOffset;
        for (var correctionIndex in offsetCorrections)
          void 0 !== correctionIndex &&
            correctionIndex <= sourceOffset &&
            (correctedOffset += offsetCorrections[correctionIndex]);
        return correctedOffset;
      }
      try {
        if (
          ('string' == typeof inputNodeId
            ? (documentNode = this.editor.getNode(inputNodeId))
            : (nodeId = documentNode.id),
          !documentNode)
        )
          return;
        if (DocumentNode.isType(documentNode, NodeType.meta_block)) return;
        if (formatting.CONST.NoInline.indexOf(documentNode.get('type')) > -1) return;
        if (documentNode.get('children').length)
          return (
            documentNode
              .get('children')
              .toArray()
              .map(function (item) {
                processedNodes && (processedNodes[item.id] = 1),
                  g.call(this, item, processedNodes, selectionBookmark, inlineOnly);
              }, this),
            !0
          );
        if (
          ((nodeElement = this.editor.findElemById(nodeId)),
          documentNode.get('type') == NodeType.def_footnote)
        ) {
          var currentElements = nodeElement.find('.md-def-content');
          return (
            (sourceText = currentElements.rawText(!1)),
            (start = 0),
            (parseResult = markdownParser.quickParse(sourceText, this, documentNode, !0)),
            await w(currentElements, documentNode, parseResult, selectionBookmark, this.editor)
          );
        }
        return (
          (sourceText = nodeElement.rawText('emoji')),
          (start = 0),
          (parseResult = markdownParser.quickParse(
            sourceText,
            this,
            documentNode,
            inlineOnly || !DocumentNode.isType(documentNode, NodeType.paragraph),
            null,
            selectionBookmark,
          )),
          await w(nodeElement, documentNode, parseResult, selectionBookmark, this.editor)
        );
      } catch (error) {
        console.debug(error.stack);
      }
    };
    moduleRecord.exports = BrushQueue;
  },
);
