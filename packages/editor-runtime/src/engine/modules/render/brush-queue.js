// render/brush-queue.
export default function initializeRenderBrushQueue(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(outermostInlineElement, 'name', { value: 'm', configurable: true });

  if (!this) {
    self;
  }
  requireModule('host/environment');
  var utilities = requireModule('shared/utilities'),
    markdownParser = requireModule('model/markdown-parser'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    formatting = requireModule('editing/formatting'),
    undoManager = requireModule('editing/undo-manager'),
    mediaActions = requireModule('media/actions'),
    SnapFlag = undoManager.SnapFlag,
    BrushQueue =
      (requireModule('libraries/rangy'),
      function (inputEditor) {
        this.editor = inputEditor;
        this.queue = [];
        this.interval = 200;
        this.inline = new markdownParser.InlineLexer();
        this.articleArea = document.querySelector(this.editor.sessionStr);
      });
  BrushQueue.prototype = {
    addToQueue: function (nodeId, inlineOnly) {
      inlineOnly = inlineOnly || false;
      if (!utilities.isNullOrEmpty(nodeId)) {
        this.queue.push({ cid: nodeId, inlineOnly: inlineOnly });
      }
    },
    run: function () {
      if (!this.timerID) {
        this.scheduleNext();
      }
      if (this.editor._brushInitCallback) {
        this.editor._brushInitCallback();
        this.editor._brushInitCallback = null;
      }
    },
    scheduleNext: function () {
      var receiver = this;
      this.timerID = window.setTimeout(async function () {
        await receiver.brushQueue();
        receiver.scheduleNext();
      }, this.interval);
    },
    clearAndPause: function () {
      if (this.willExpandSoon) {
        clearTimeout(this.willExpandSoon);
      }
      this.queue = [];
      this.pause();
    },
    pause: function () {
      clearTimeout(this.timerID);
      this.timerID = null;
      if (this.editor.mathBlock) {
        this.editor.mathBlock.clearCache();
      }
    },
    resume: async function (flushQueue) {
      if (flushQueue) {
        await this.brushQueue();
      }
      this.run();
    },
    restart: function () {
      this.queue = [];
      this.run();
    },
    brushNode: function (nodeId) {
      var selectionBookmark = this.editor.selection.buildUndo();
      if (brushDocumentNode.call(this, nodeId, {}, selectionBookmark, false)) {
        (function (__marklyraBrushEditor) {
          const __marklyraBrushUndo = __marklyraBrushEditor.undo;
          return (function (__marklyraBrushCommand, __marklyraBrushBookmark) {
            const __marklyraBrushRestore = window.__MARKLYRA_RESTORE_BRUSH_CURSOR__;
            if (typeof __marklyraBrushRestore === 'function') {
              return __marklyraBrushRestore(
                __marklyraBrushEditor,
                __marklyraBrushBookmark,
                (__marklyraBrushNext) =>
                  Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [__marklyraBrushNext]),
              );
            } else {
              return Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                __marklyraBrushBookmark,
              ]);
            }
          })(__marklyraBrushUndo.exeCommand, selectionBookmark);
        })(this.editor);
      }
    },
    brushQueue: async function () {
      Object.defineProperty(closestElement, 'name', { value: 'a', configurable: true });

      var receiver = this,
        processedNodes = {},
        queueLength = receiver.queue.length;
      if (!this.editor.isIME && !this.editor.isMousePressed) {
        if (receiver.queue.length > 0 && !File.isLocked) {
          console.debug('brushQueue', receiver.queue);
          var selectionChanged = false,
            onlyInlineTasks = true;
          !(function () {
            var range = receiver.editor.selection.getRangy();
            if (range) {
              var localElement = closestElement(range.startContainer),
                element = localElement.closest('[cid]'),
                currentElement = closestElement(range.endContainer).closest('[cid]');
              if (element) {
                element.querySelectorAll('.md-math-after-sym').forEach(function (item) {
                  let text = item.textContent.replace(/\u200b/g, '');
                  if (text != item.textContent) {
                    item.textContent = text;
                  }
                });
              }
              if (currentElement && currentElement != element) {
                currentElement.querySelectorAll('.md-math-after-sym').forEach(function (item) {
                  item.textContent = item.textContent.replace(/\u200b/g, '');
                });
              }
              if (range.collapsed) {
                if (!range.startContainer.parentElement) {
                  range.selectNode(localElement);
                  range.collapse(false);
                  receiver.editor.selection.setRange(range);
                }
              }
            }
          })();
          var selectionBookmark = receiver.editor.selection.buildUndo();
          var __marklyraBrushBatch = receiver.queue.slice(),
            __marklyraBrushConsumed = new Set(__marklyraBrushBatch);
          await Promise.all(
            __marklyraBrushBatch.map((item) =>
              (async function (task) {
                if (!processedNodes[task.cid]) {
                  processedNodes[task.cid] = 1;
                  selectionChanged =
                    (await brushDocumentNode.call(
                      receiver,
                      task.cid,
                      processedNodes,
                      selectionBookmark,
                      task.inlineOnly,
                      true,
                    )) || selectionChanged;
                  onlyInlineTasks = onlyInlineTasks && task.inlineOnly;
                }
                return Promise.resolve();
              })(item),
            ),
          );
          receiver.queue = receiver.queue.filter(function (__marklyraBrushTask) {
            return !__marklyraBrushConsumed.has(__marklyraBrushTask);
          });
          if (selectionChanged && selectionBookmark) {
            (function (__marklyraBrushEditor) {
              const __marklyraBrushUndo = __marklyraBrushEditor.undo;
              return (function (__marklyraBrushCommand, __marklyraBrushBookmark) {
                const __marklyraBrushRestore = window.__MARKLYRA_RESTORE_BRUSH_CURSOR__;
                if (typeof __marklyraBrushRestore === 'function') {
                  return __marklyraBrushRestore(
                    __marklyraBrushEditor,
                    __marklyraBrushBookmark,
                    (__marklyraBrushNext) =>
                      Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                        __marklyraBrushNext,
                      ]),
                  );
                } else {
                  return Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                    __marklyraBrushBookmark,
                  ]);
                }
              })(__marklyraBrushUndo.exeCommand, selectionBookmark);
            })(receiver.editor);
          }
          this.expand(true, false, onlyInlineTasks);
        }
        if (queueLength) {
          this.triggerAutoComplete();
        }
      }
      function closestElement(domNode) {
        if (domNode.closest) {
          return domNode;
        } else {
          return domNode.parentElement;
        }
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
        currentEditor.lastCursor = currentEditor.selection.buildUndo(range);
        if (
          (currentMatch = function () {
            if (range && range.collapsed) {
              var element = $(range.endContainer).closest('.md-lang'),
                languageText = element.text(),
                start = element.prev().text().length + element.parent().prevAll().text().length;
              if (languageText) {
                completionAnchor = {
                  start: start,
                  end: start + languageText.length,
                  containerNode: element.closest('[mdtype]')[0],
                };
                return languageText;
              }
            }
          }.call(this))
        ) {
          return void autoComplete.show(this.editor.fences.ALL, completionAnchor, currentMatch, {
            type: 'fences',
            render: this.editor.fences.autoCompleteRender,
          });
        }
        if ((emojiMatch = /:(\w+)$/.exec(textBeforeCaret))) {
          if (File.option.noEmojiAutoComplete) {
            return;
          }
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
        if (
          mathSuggestionsEnabled &&
          (currentMatch = /\$?\$$/.exec(textBeforeCaret)) &&
          0 == $('.md-expand.md-inline-math').length
        ) {
          (function () {
            var remainingDollars,
              length = (/^\$+/.exec(textAfterCaret) || '').length;
            if (length <= currentMatch[0].length) {
              if ((remainingDollars = '$'.repeat(currentMatch[0].length - length)).length) {
                range.insertNode(document.createTextNode(remainingDollars));
                range.collapse(true);
              }
              completionBookmark.start -= currentMatch[0].length;
              completionBookmark.end += currentMatch[0].length;
              range.moveToBookmark(completionBookmark);
              currentEditor.mathInline.showAutoSuggest(range);
              currentEditor.restoreLastCursor(null, true);
              currentEditor.undo.addSnap(currentEditor.focusCid, SnapFlag.REPLACE);
              completionAnchor = null;
            }
          })();
        }
      } else {
        if (elementLength) {
          currentElement.trigger('inline-math-changed');
        }
      }
      this.editor.autoComplete.hide();
    },
    expandOnDelay: function (crossBoundary) {
      var receiver = this;
      if (this.willExpandSoon) {
        clearTimeout(this.willExpandSoon);
      }
      this.willExpandSoon = setTimeout(function () {
        receiver.expand(crossBoundary);
      }, 10);
    },
    closestExpandable: function (inputElement) {
      var element = inputElement.closest('[md-inline]'),
        currentElement = element.parent().closest('[md-inline]');
      if (!currentElement.length) {
        return element;
      }
      var inlineType = element.attr('md-inline');
      if (
        (inlineType &&
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
      ) {
        return element;
      } else {
        return this.closestExpandable(currentElement);
      }
    },
    expand: function (
      crossBoundary,
      suppressSelectionWork,
      skipInlineReparse,
      preserveEndBoundary,
    ) {
      Object.defineProperty(extendSelectionRange, 'name', { value: 'k', configurable: true });
      Object.defineProperty(isFocusableButton, 'name', { value: 'E', configurable: true });

      if (!suppressSelectionWork) {
        this.editor.wordCount.updateInSelection();
      }
      if (this.willExpandSoon) {
        clearTimeout(this.willExpandSoon);
        this.willExpandSoon = null;
      }
      if (!this.editor.isIME && !File.isLocked) {
        var selectionElement,
          selection = this.editor.selection,
          range = selection.getRangy(),
          rangy = selection.rangy,
          currentRange = range ? range.cloneRange() : null;
        if (
          currentRange &&
          (currentRange.startContainer != this.editor.writingArea || 0 != currentRange.startOffset)
        ) {
          $('.selected').removeClass('selected');
          if (range) {
            this.editor.selection.deRange(range);
            selectionElement = this.editor.getJQueryElem(range.commonAncestorContainer);
            this.editor.stylize.putBookmark(
              currentRange,
              this.editor.stylize.buildBookmark(selectionElement),
            );
            (function (expandedElements) {
              try {
                var element = document.querySelector('.md-inline-math.md-expand');
                if (!element) {
                  return;
                }
                if (expandedElements.length && element.contains(expandedElements[0])) {
                  return;
                }
                var currentElement = element.querySelector('.md-inline-math-container script'),
                  mathPreview = svgCache[currentElement.innerHTML.trim()];
                if (
                  (mathPreview = mathPreview
                    ? $(mathPreview)[0]
                    : document.querySelector('#math-inline-preview-content mjx-container'))
                ) {
                  $(element.querySelector('mjx-container')).replaceWith(mathPreview);
                  window.svgCache[currentElement.textContent.trim()] =
                    mediaActions.processExportedSVG(
                      element.querySelector('.md-inline-math-container').innerHTML,
                      true,
                    );
                }
              } catch (error) {}
            })(selectionElement);
            if (
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
                  if (!elements.length) {
                    return false;
                  }
                  var documentNode = editor.findNodeByElem(inputElement.closest('[cid]')),
                    selectionBookmark = editor.selection.buildUndo(selectionRange);
                  if (documentNode.cid != selectionBookmark.endId) {
                    return false;
                  }
                  var length = elements.prevAll().rawText().length,
                    currentLength = elements.rawText().length;
                  if (
                    !editor.lastCursor ||
                    editor.lastCursor.endId != selectionBookmark.endId ||
                    editor.lastCursor.startOffset > length + currentLength ||
                    editor.lastCursor.endOffset < length + currentLength
                  ) {
                    return false;
                  }
                  var beforeMetadata = false;
                  if (selectionRange.comparePoint(elements[0], 0) < 0) {
                    selectionBookmark.start = selectionBookmark.end =
                      selectionBookmark.end - length - currentLength;
                    beforeMetadata = true;
                  }
                  var parseResult = editor.simpleParse(documentNode, false);
                  if (parseResult) {
                    editor.findElemById(parseResult[2]).replaceWith(parseResult[1]);
                    if (beforeMetadata && parseResult[3].length > 1) {
                      selectionBookmark.startId = selectionBookmark.endId = parseResult[3]
                        .last()
                        .getVeryFirst().cid;
                    }
                    editor.undo.exeCommand(selectionBookmark);
                    parseResult[0].undo[0] = editor.lastCursor;
                    parseResult[0].redo.push(editor.selection.buildUndo());
                    editor.undo.register(parseResult[0]);
                    editor.quickRefresh();
                    return true;
                  }
                }
                return false;
              })(selectionElement, range)
            ) {
              return;
            }
            if (
              isInputComponent(document.activeElement) ||
              ('write' !== document.activeElement.id &&
                document.activeElement.hasAttribute('tabindex'))
            ) {
              $('.md-expand').removeClass('md-expand');
              return $(this.editor.sessionStr).trigger('cursorChange', this.editor.styleBookmark);
            }
            if (
              (!selectionElement.closest('[cid]').length &&
                !selectionElement.find('[cid]').length) ||
              DocumentNode.isType(
                selectionElement.closest('[cid]').attr('mdtype'),
                NodeType.fences,
                NodeType.math_block,
                NodeType.html_block,
              )
            ) {
              return $(this.editor.sessionStr).trigger('cursorChange', this.editor.styleBookmark);
            }
            if (range.collapsed) {
              var startExpansion,
                expandableElement = outermostInlineElement(selectionElement),
                localElement = selectionElement.closest('[mdtype]'),
                endExpansion = [],
                localLength = expandableElement.visibleText().length,
                boundaryInfo =
                  localLength > 0 &&
                  localLength < expandableElement.text().length &&
                  (function (inputRange, expansionRoot) {
                    Object.defineProperty(hasNoVisibleFollowingSibling, 'name', {
                      value: 'n',
                      configurable: true,
                    });

                    function hasNoVisibleFollowingSibling(domNode) {
                      for (var nextSibling = domNode.nextSibling; nextSibling; ) {
                        if (nextSibling.offsetWidth) {
                          return false;
                        }
                        nextSibling = nextSibling.nextSibling;
                      }
                      return true;
                    }
                    if (!expansionRoot) {
                      return null;
                    }
                    if (
                      inputRange.endOffset == inputRange.endContainer.length ||
                      '​' == inputRange.endContainer.textContent
                    ) {
                      for (
                        var domNode = inputRange.endContainer;
                        (expansionRoot.contains(domNode) || expansionRoot == domNode) &&
                        !domNode.parentElement.getAttribute('cid') &&
                        hasNoVisibleFollowingSibling(domNode);
                      ) {
                        domNode = domNode.parentElement;
                      }
                      return [domNode, true];
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
                      ) {
                        currentDomNode = currentDomNode.parentElement;
                      }
                      return [currentDomNode, false];
                    }
                    var boundaryNode;
                    return null;
                  })(range, expandableElement[0]);
              if (boundaryInfo) {
                var [boundaryElement, collapseAtEnd] = boundaryInfo;
                startExpansion = $(boundaryElement).addClass('md-expand');
                currentRange = rangy.createRange();
                if (collapseAtEnd) {
                  currentRange.collapseToPoint(
                    boundaryElement,
                    boundaryElement.childNodes
                      ? boundaryElement.childNodes.length
                      : boundaryElement.length,
                  );
                } else {
                  currentRange.collapseToPoint(boundaryElement, 0);
                }
                this.editor.selection.setRange(currentRange, true);
              } else {
                extendSelectionRange(range, -1);
                if (
                  $(range.endContainer).parent().hasClass('md-softbreak') &&
                  currentRange.startContainer === currentRange.endContainer
                ) {
                  range = currentRange.cloneRange();
                }
                startExpansion =
                  localElement[0] != $(range.startContainer).closest('[mdtype]')[0]
                    ? expandableElement
                    : outermostInlineElement(this.editor.getJQueryElem(range.startContainer));
                if (range.startContainer === range.endContainer) {
                  if (range.toString().length) {
                    range.collapse(false);
                  }
                  if (
                    3 == range.endContainer.nodeType &&
                    range.endOffset == range.endContainer.textContent.length &&
                    isFocusableButton(range.endContainer.nextElementSibling)
                  ) {
                    range.endContainer.nextElementSibling.classList.add('selected');
                    range.selectNode(range.endContainer.nextElementSibling);
                  } else {
                    extendSelectionRange(range, 1);
                    var intersectingElements = range.getNodes([1], isFocusableButton);
                    if (intersectingElements.length) {
                      currentRange.setStart(intersectingElements[0], 0);
                      currentRange.setEnd(intersectingElements[0], 0);
                      editor.selection.setRange(currentRange, true);
                    }
                  }
                }
              }
            } else {
              startExpansion = outermostInlineElement(
                this.editor.getJQueryElem(range.startContainer),
              );
            }
            if (
              !(endExpansion = outermostInlineElement(
                this.editor.getJQueryElem(range.endContainer),
              )).length
            ) {
              endExpansion = startExpansion;
            }
            if (startExpansion.length || endExpansion.length) {
              var selectionRebased = false;
              if (!currentRange.collapsed) {
                selectionRebased =
                  (currentRange =
                    (function (inputRange) {
                      var originalRange,
                        collapsed = inputRange.collapsed,
                        extendEndBoundary = false;
                      try {
                        var blockElement,
                          expandedAncestor,
                          commonAncestorContainer = inputRange.commonAncestorContainer;
                        if (
                          0 == inputRange.startOffset &&
                          startExpansion.length &&
                          (startExpansion = editor.getJQueryElem(inputRange.startContainer)).length
                        ) {
                          if (
                            startExpansion.closest('.md-expand').length ||
                            startExpansion[0].hasAttribute('cid') ||
                            startExpansion[0].querySelector('[cid]') ||
                            startExpansion.closest('.md-image:not(.md-img-loaded)').length
                          ) {
                            if ((expandedAncestor = startExpansion.closest('.md-expand')).length) {
                              startExpansion = expandedAncestor;
                            }
                          } else {
                            blockElement = startExpansion.closest('[cid]')[0];
                            if (
                              !(startExpansion = Object.defineProperty(
                                function expandRangeStart(candidateElement, blockBoundary) {
                                  if (
                                    !candidateElement.prevAll(':not(.md-meta, .md-content)').text()
                                      .length
                                  ) {
                                    var element = candidateElement.parent();
                                    if (element.attr('mdtype')) {
                                      return candidateElement;
                                    } else {
                                      if (blockBoundary.contains(element[0]) || crossBoundary) {
                                        return expandRangeStart(element, blockBoundary);
                                      } else {
                                        return outermostInlineElement(candidateElement);
                                      }
                                    }
                                  }
                                  return outermostInlineElement(candidateElement);
                                },
                                'name',
                                { value: 't', configurable: true },
                              )(
                                startExpansion,
                                commonAncestorContainer.contains &&
                                  commonAncestorContainer.contains(blockElement)
                                  ? blockElement
                                  : commonAncestorContainer,
                              )).length
                            ) {
                              return null;
                            }
                            originalRange = inputRange.cloneRange();
                            inputRange.setStartBefore(startExpansion[0]);
                            extendEndBoundary =
                              !preserveEndBoundary &&
                              !collapsed &&
                              0 == inputRange.startOffset &&
                              inputRange.startContainer.getAttribute &&
                              inputRange.startContainer.getAttribute('cid');
                            if (!inputRange.containsNode(startExpansion[0])) {
                              inputRange = originalRange;
                            }
                            if (collapsed) {
                              inputRange.collapse(true);
                            }
                          }
                        }
                        if (
                          inputRange.endOffset ==
                          (inputRange.endContainer.nodeType === document.TEXT_NODE
                            ? inputRange.endContainer.length
                            : inputRange.endContainer.childNodes.length)
                        ) {
                          var currentElement = editor.getJQueryElem(inputRange.endContainer);
                          if (currentElement.length) {
                            if (
                              currentElement.closest('.md-expand').length ||
                              currentElement[0].hasAttribute('cid') ||
                              currentElement[0].querySelector('[cid]') ||
                              currentElement.closest('.md-image:not(.md-img-loaded)').length
                            ) {
                              if (
                                (expandedAncestor = currentElement.closest('.md-expand')).length
                              ) {
                                currentElement = expandedAncestor;
                              }
                            } else {
                              blockElement = currentElement.closest('[cid]')[0];
                              if (
                                !(currentElement = Object.defineProperty(
                                  function expandRangeEnd(candidateElement, endBoundary) {
                                    if (
                                      !candidateElement
                                        .nextAll(':not(.md-meta, .md-content)')
                                        .text().length
                                    ) {
                                      var element = candidateElement.parent();
                                      if (
                                        element.hasClass('[mdtype]') ||
                                        element[0].contains(endBoundary)
                                      ) {
                                        return outermostInlineElement(candidateElement);
                                      } else {
                                        return expandRangeEnd(element, endBoundary);
                                      }
                                    }
                                    return outermostInlineElement(candidateElement);
                                  },
                                  'name',
                                  { value: 'e', configurable: true },
                                )(
                                  currentElement,
                                  commonAncestorContainer.contains &&
                                    commonAncestorContainer.contains(blockElement)
                                    ? blockElement
                                    : commonAncestorContainer,
                                )).length
                              ) {
                                return null;
                              }
                              originalRange = inputRange.cloneRange();
                              inputRange.setEndAfter(currentElement[0]);
                              if (
                                extendEndBoundary &&
                                inputRange.endContainer.childNodes &&
                                inputRange.endContainer.childNodes.length == inputRange.endOffset
                              ) {
                                inputRange.setStartBefore(startExpansion[0]);
                              } else {
                                if (!inputRange.containsNode(currentElement[0])) {
                                  inputRange = originalRange;
                                }
                              }
                              if (collapsed) {
                                inputRange.collapse(false);
                              }
                            }
                          }
                        }
                      } catch (error) {
                        console.warn(error);
                      }
                      return inputRange;
                    })(currentRange) || currentRange) && !currentRange.collapsed;
              }
              $('.md-expand').removeClass('md-expand');
              if (startExpansion.length) {
                expandInlineElement.call(this, startExpansion);
              } else {
                expandInlineElement.call(this, endExpansion);
              }
              if (
                startExpansion.length &&
                endExpansion.length &&
                !endExpansion.hasClass('md-img-loaded')
              ) {
                expandInlineElement.call(this, endExpansion, true);
              }
            } else {
              $('.md-expand').removeClass('md-expand');
            }
            if (selectionRebased) {
              this.editor.selection.deRange(currentRange, true, currentRange.cloneRange());
            } else {
              var localDomNode = window.getSelection().anchorNode;
              if (
                localDomNode &&
                (3 === localDomNode.nodeType ||
                  (localDomNode.hasAttribute && localDomNode.hasAttribute('contenteditable')))
              ) {
                currentRange = currentRange || this.editor.selection.getRangy();
                this.editor.selection.deRange(currentRange, true, currentRange.cloneRange());
              }
              if (
                currentRange.commonAncestorContainer.parentElement &&
                currentRange.commonAncestorContainer.parentElement.classList.contains(
                  'marklyra-focusable-btn',
                )
              ) {
                currentRange.commonAncestorContainer.parentElement.classList.add('selected');
              } else {
                if (isFocusableButton(localDomNode)) {
                  localDomNode.classList.add('selected');
                }
              }
            }
            $(this.editor.sessionStr).trigger('cursorChange', this.editor.styleBookmark);
          } else {
            selectionElement = this.editor.getMarkElem();
            $('.md-expand').removeClass('md-expand');
            if (
              selectionElement.length &&
              DocumentNode.isType(
                selectionElement.attr('mdtype'),
                DocumentNode.TYPE.hr,
                DocumentNode.TYPE.toc,
              )
            ) {
              this.editor.stylize.putBookmark(
                null,
                this.editor.stylize.buildBookmark(selectionElement),
              );
              $(this.editor.sessionStr).trigger('cursorChange', this.editor.styleBookmark);
            }
          }
        }
      }
      function extendSelectionRange(selectionRange, direction) {
        return selection.extendRange(selectionRange, direction);
      }
      function isFocusableButton(element) {
        return element && element.classList && element.classList.contains('marklyra-focusable-btn');
      }
    },
    focusContainer: function (container) {
      markExpandedAncestors.call(this, container);
    },
  };
  var markExpandedAncestors = Object.defineProperty(
      function (inputElement) {
        var element = inputElement.closest('tr.md-end-block, li[cid]')[0],
          domNode = inputElement[0];
        if (element && domNode) {
          for (; element !== domNode && element.contains(domNode); ) {
            if (
              domNode.previousSibling &&
              domNode.previousSibling.hasAttribute &&
              domNode.previousSibling.hasAttribute('cid')
            ) {
              return false;
            }
            domNode = domNode.parentElement;
          }
          element.classList.add('md-focus-container');
        }
      },
      'name',
      { value: 'p', configurable: true },
    ),
    expandInlineElement = Object.defineProperty(
      function (element, keepFocusContainer) {
        if (!keepFocusContainer) {
          $('.md-focus-container').removeClass('md-focus-container');
        }
        if (element.length) {
          markExpandedAncestors(
            element.addClass('md-expand').trigger('expand').closest('[cid]').addClass('md-focus'),
          );
        }
      },
      'name',
      { value: 'f', configurable: true },
    );
  function outermostInlineElement(inputElement) {
    var element = inputElement.parent().closest('[md-inline]');
    if (element.length) {
      return outermostInlineElement(element);
    } else {
      return inputElement.closest('[md-inline]');
    }
  }
  var brushDocumentNode = Object.defineProperty(
    async function (inputNodeId, processedNodes, selectionBookmark, inlineOnly, awaitInlineMath) {
      Object.defineProperty(stripClonedIdentityAttributes, 'name', {
        value: 'v',
        configurable: true,
      });
      Object.defineProperty(stripClonedSubtreeIdentity, 'name', { value: 'y', configurable: true });
      Object.defineProperty(updateInlineDom, 'name', { value: 'b', configurable: true });
      Object.defineProperty(applyRenderedNode, 'name', { value: 'w', configurable: true });
      Object.defineProperty(correctSourceOffset, 'name', { value: 'x', configurable: true });

      var nodeElement,
        sourceText,
        parseResult,
        documentNode = inputNodeId,
        nodeId = inputNodeId,
        start = 0;
      function stripClonedIdentityAttributes(element) {
        for (var itemIndex = 0; itemIndex < element.attributes.length; itemIndex++) {
          if (
            DocumentNode.isType(
              element.attributes[itemIndex].name,
              'cid',
              'contenteditable',
              'id',
              'for',
              'onerror',
              'onload',
            )
          ) {
            element.removeAttributeNode(element.attributes[itemIndex]);
          }
        }
        element.classList.remove('md-img-loaded');
        element.classList.remove('md-img-error');
      }
      function stripClonedSubtreeIdentity(container) {
        for (
          var elements = container.querySelectorAll('*'), itemIndex = 0;
          itemIndex < elements.length;
          itemIndex++
        ) {
          stripClonedIdentityAttributes(elements[itemIndex]);
        }
        stripClonedIdentityAttributes(container);
      }
      async function updateInlineDom(
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
            clonedNode = inputElement[0].cloneNode(true),
            divElement = document.createElement('div'),
            elementsLength =
              ((cursorDiff = parseResult.cursorDiff), inputElement.find('.md-footnote').length);
          divElement.innerHTML = innerHtml;
          var expandedMathText = null;
          clonedNode.querySelectorAll('.md-expand').forEach(function (element) {
            if (element.classList.contains('md-inline-math')) {
              if (
                (element.querySelector('.md-before') || {}).textContent !==
                (element.querySelector('.md-after') || {}).textContent
              ) {
                element.textContent = '';
              } else {
                expandedMathText = element.rawText(true);
              }
            }
            element.classList.remove('md-expand');
          });
          clonedNode.querySelectorAll('.md-inline-math').forEach(function (element) {
            element.textContent = element.rawText(true);
            element.setAttribute('id', '');
            if (expandedMathText == element.textContent) {
              element.setAttribute('class', '');
            }
          });
          divElement.querySelectorAll('.md-inline-math').forEach(function (element) {
            element.textContent = element.rawText(true);
            element.setAttribute('id', '');
            if (expandedMathText == element.textContent) {
              element.setAttribute('class', '');
            }
          });
          stripClonedSubtreeIdentity(clonedNode);
          stripClonedSubtreeIdentity(divElement);
          if (
            clonedNode.innerHTML.replace(/\s*class=\"\"/gi, '') !=
            divElement.innerHTML.replace(/\s*class=\"\"/gi, '')
          ) {
            inputElement.html(innerHtml);
            if (parseResult.mdlike) {
              if (inputElement.attr('mdlike') != parseResult.mdlike) {
                inputElement.attr('mdlike', parseResult.mdlike);
              }
            } else {
              if (inputElement.attr('mdlike')) {
                inputElement.removeAttr('mdlike');
              }
            }
            editor.selection.clearGlobalColumn();
            if (awaitInlineMath) {
              await editor.mathInline.brush(inputElement[0], selectionBookmark, true);
            } else {
              editor.mathInline.brush(inputElement[0], selectionBookmark, true);
            }
            domChanged = true;
          } else {
            if (inputElement.hasClass('unholdable')) {
              inputElement.removeClass('unholdable');
            }
            if (inputElement.find('.math-jax-preprocess').length) {
              editor.mathInline.brush(inputElement[0], selectionBookmark, true);
            }
          }
          if ((inputElement.find('.md-footnote').length || elementsLength) && editor.docMenu) {
            editor.docMenu.refreshFootnoteReverseLink();
          }
          if (editor.focusCid === documentNode.cid) {
            (function (
              selectionBookmark,
              cursorOffsets,
              historyEntry,
              unusedParameter4,
              editor,
              domChanged,
            ) {
              if (domChanged || cursorOffsets.length) {
                if (selectionBookmark) {
                  if (historyEntry) {
                    historyEntry.undo.unshift(Object.clone(selectionBookmark));
                  }
                  selectionBookmark.start = correctSourceOffset(
                    cursorOffsets,
                    selectionBookmark.start - start,
                  );
                  selectionBookmark.end = correctSourceOffset(
                    cursorOffsets,
                    selectionBookmark.end - start,
                  );
                  if (historyEntry) {
                    historyEntry.redo.push(selectionBookmark);
                  }
                  if (editor.undo) {
                    (function (__marklyraBrushEditor) {
                      const __marklyraBrushUndo = __marklyraBrushEditor.undo;
                      return (function (__marklyraBrushCommand, __marklyraBrushBookmark) {
                        const __marklyraBrushRestore = window.__MARKLYRA_RESTORE_BRUSH_CURSOR__;
                        if (typeof __marklyraBrushRestore === 'function') {
                          return __marklyraBrushRestore(
                            __marklyraBrushEditor,
                            __marklyraBrushBookmark,
                            (__marklyraBrushNext) =>
                              Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                                __marklyraBrushNext,
                              ]),
                          );
                        } else {
                          return Reflect.apply(__marklyraBrushCommand, __marklyraBrushUndo, [
                            __marklyraBrushBookmark,
                          ]);
                        }
                      })(__marklyraBrushUndo.exeCommand, selectionBookmark);
                    })(editor);
                  }
                }
                return true;
              }
            })(selectionBookmark, cursorDiff, parseResult.command, 0, editor, domChanged);
            return false;
          } else {
            return domChanged;
          }
        }
      }
      async function applyRenderedNode(
        nodeElement,
        documentNode,
        parseResult,
        selectionBookmark,
        editor,
      ) {
        if (parseResult.blockChanged) {
          return (function (element, documentNode, parseResult, selectionBookmark, editor) {
            var cursorOffsets = parseResult.cursorDiff || [];
            editor.selection.clearGlobalColumn();
            if (parseResult.replaceCid) {
              editor.findElemById(parseResult.replaceCid).replaceWith(parseResult.html);
              editor.refreshUnder(editor.findElemById(parseResult.replaceCid)[0]);
            } else {
              element.closest('p').replaceWith(parseResult.html);
            }
            if (parseResult.toRemove) {
              parseResult.toRemove.forEach(function (callbackNodeId) {
                editor.findElemById(callbackNodeId).remove();
              });
            }
            if (!(editor.focusCid && editor.focusCid !== documentNode.cid)) {
              editor.focusCid = parseResult.focus;
              if (editor.focusCid) {
                markExpandedAncestors(editor.findElemById(editor.focusCid));
              }
              if (selectionBookmark) {
                parseResult.command.undo.unshift(Object.clone(selectionBookmark));
                if (cursorOffsets.length) {
                  selectionBookmark.start = correctSourceOffset(
                    cursorOffsets,
                    selectionBookmark.start,
                  );
                  selectionBookmark.end = correctSourceOffset(cursorOffsets, selectionBookmark.end);
                }
                selectionBookmark.id = parseResult.focus;
                selectionBookmark.startId = parseResult.focus;
                selectionBookmark.endId = parseResult.focus;
                selectionBookmark.start -= parseResult.offset;
                selectionBookmark.end -= parseResult.offset;
                parseResult.command.redo.push(Object.clone(selectionBookmark));
              }
              editor.undo.register(parseResult.command);
            }
            return true;
          })(nodeElement, documentNode, parseResult, selectionBookmark, editor);
        } else {
          return await updateInlineDom(
            nodeElement,
            documentNode,
            parseResult,
            selectionBookmark,
            editor,
          );
        }
      }
      function correctSourceOffset(offsetCorrections, sourceOffset) {
        var correctedOffset = sourceOffset;
        for (var correctionIndex in offsetCorrections) {
          if (void 0 !== correctionIndex && correctionIndex <= sourceOffset) {
            correctedOffset += offsetCorrections[correctionIndex];
          }
        }
        return correctedOffset;
      }
      try {
        if ('string' == typeof inputNodeId) {
          documentNode = this.editor.getNode(inputNodeId);
        } else {
          nodeId = documentNode.id;
        }
        if (!documentNode) {
          return;
        }
        if (DocumentNode.isType(documentNode, NodeType.meta_block)) {
          return;
        }
        if (formatting.CONST.NoInline.indexOf(documentNode.get('type')) > -1) {
          return;
        }
        if (documentNode.get('children').length) {
          documentNode
            .get('children')
            .toArray()
            .map(function (item) {
              if (processedNodes) {
                processedNodes[item.id] = 1;
              }
              brushDocumentNode.call(this, item, processedNodes, selectionBookmark, inlineOnly);
            }, this);
          return true;
        }
        nodeElement = this.editor.findElemById(nodeId);
        if (documentNode.get('type') == NodeType.def_footnote) {
          var currentElements = nodeElement.find('.md-def-content');
          sourceText = currentElements.rawText(false);
          start = 0;
          parseResult = markdownParser.quickParse(sourceText, this, documentNode, true);
          return await applyRenderedNode(
            currentElements,
            documentNode,
            parseResult,
            selectionBookmark,
            this.editor,
          );
        }
        sourceText = nodeElement.rawText('emoji');
        start = 0;
        parseResult = markdownParser.quickParse(
          sourceText,
          this,
          documentNode,
          inlineOnly || !DocumentNode.isType(documentNode, NodeType.paragraph),
          null,
          selectionBookmark,
        );
        return await applyRenderedNode(
          nodeElement,
          documentNode,
          parseResult,
          selectionBookmark,
          this.editor,
        );
      } catch (error) {
        console.debug(error.stack);
      }
    },
    'name',
    { value: 'g', configurable: true },
  );
  moduleRecord.exports = BrushQueue;
}
