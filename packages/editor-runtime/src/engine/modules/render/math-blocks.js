// render/math-blocks.
// SystemJS module 1c. Dependencies: 20, e, 13, 1b, 11, 2a, 27.
$__System.registerDynamic(
  '1c',
  ['20', 'e', '13', '1b', '11', '2a', '27'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var displayMetrics,
      CodeMirror = requireModule('20'),
      jquery = requireModule('e'),
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      undoManager = requireModule('1b'),
      utilities = (undoManager.SnapFlag, requireModule('11')),
      mediaActions = requireModule('2a'),
      keyboardShortcuts = requireModule('27'),
      map = keyboardShortcuts.map,
      NodeType = documentModel.TYPE,
      html =
        ((map = keyboardShortcuts.map),
        document.querySelector('#md-rawblock-tooltip-templ').innerHTML),
      m = function () {
        return !!(window.MathJax && window.MathJax.config && MathJax.startup.document);
      },
      g = async function () {
        if (!m())
          return new Promise((resolvePromise) => {
            var t = function () {
              m() ? resolvePromise() : setTimeout(t, 50);
            };
            setTimeout(t, 50);
          });
      },
      renderHooksInitialized = !1;
    function y(timeout) {
      return window.requestIdleCallback
        ? new Promise((resolvePromise) => requestIdleCallback(resolvePromise, { timeout: timeout }))
        : (function (delay) {
            return new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
          })(timeout);
    }
    async function b() {
      function e() {}
      var currentDomNode, hrefPrefixPattern, idPrefixPattern;
      renderHooksInitialized ||
        (await g(),
        MathJax.startup.document.removeRenderAction('addMenu'),
        MathJax.startup.document.addRenderAction(
          'afterRender',
          1001,
          e,
          (mathItem, unusedParameter2) => {
            var domNode = mathItem.typesetRoot.querySelector('svg');
            (idPrefixPattern = hrefPrefixPattern = /^mjx-/i),
              (currentDomNode = domNode).querySelectorAll('[id]').forEach((item) => {
                idPrefixPattern.exec(item.id) || (item.id = 'mjx-' + item.id);
              }),
              currentDomNode.querySelectorAll('[class]').forEach((element) => {
                element.setAttribute(
                  'class',
                  element
                    .getAttribute('class')
                    .split(/\s+/)
                    .filter((item) => hrefPrefixPattern.exec(item))
                    .join(' '),
                );
              }),
              domNode.parentElement == mathItem.typesetRoot &&
                mathItem.typesetRoot.hasAttribute('aria-label') &&
                domNode.setAttribute('alt', mathItem.typesetRoot.getAttribute('aria-label'));
          },
        ),
        (displayMetrics = MathJax.getMetricsFor(
          document.querySelector('#write>p') || document.querySelector('#write'),
          !0,
        )),
        (renderHooksInitialized = !0),
        File.option.noDisplayLinesInMath ||
          MathJax.startup.document.addRenderAction(
            'displayLines',
            1,
            e,
            (mathItem, unusedParameter2) => {
              mathItem.math = (function (text) {
                if ('\\u32E' == text[0]) return text.substr(1);
                if (!/\\(\\|newline)/.exec(text)) return text;
                var match = /^(?:\s|(?:\s*%[^\n]*\n))*\\([a-z]+)/i.exec(text);
                return match &&
                  (/(begin|command|matrix|align|eq)/.exec(match[1]) ||
                    [
                      'def',
                      'let',
                      'newenvironment',
                      'array',
                      'displaylines',
                      'enclose',
                      'gather',
                      'gathered',
                      'leqalignno',
                      'multiline',
                      'split',
                    ].indexOf(match[1]) > -1)
                  ? text
                  : (console.debug('wrap displayLines'), `\\displaylines{\n${text}\n}`);
              })(mathItem.math);
            },
          ));
    }
    function w() {
      return MathJax.startup.document.inputJax[0].parseOptions.tags;
    }
    function x(searchValue) {
      var mathElements = Array.from(document.querySelectorAll('.md-math-block, .md-fences-math')),
        previousElement = null;
      if (searchValue.hasAttribute('data-tag-before')) return searchValue.dataset.mathTagBefore;
      if (mathElements.indexOf(searchValue) > -1)
        return (previousElement = mathElements[mathElements.indexOf(searchValue) - 1])
          ? previousElement.dataset.mathTagAfter
          : 0;
      for (const candidateElement of mathElements) {
        if (
          searchValue.compareDocumentPosition(candidateElement) !=
          searchValue.DOCUMENT_POSITION_FOLLOWING
        )
          break;
        previousElement = candidateElement;
      }
      return previousElement ? previousElement.dataset.mathTagAfter : 0;
    }
    function C(tagCounter, allLabels) {
      allLabels || (allLabels = w().allLabels),
        MathJax.texReset(tagCounter),
        (w().allLabels = allLabels);
    }
    function F(items, labelMap) {
      items.forEach((item) => {
        delete labelMap[item];
      });
    }
    function S(previousKeys, items) {
      var currentItems = [];
      return (
        items.forEach((searchValue) => {
          -1 == previousKeys.indexOf(searchValue) && currentItems.push(searchValue);
        }),
        currentItems
      );
    }
    function k(texSource, tagMetadata, synchronous, resetCounter) {
      tagMetadata = tagMetadata || {};
      var counter = w().counter;
      resetCounter && C((counter = tagMetadata.mathTagBefore)),
        F(JSON.parse(tagMetadata.mathLabels || '[]'), w().allLabels);
      var keys = Object.keys(w().allLabels);
      function s(dom) {
        var renderResult = {};
        return (
          (renderResult.dom = dom),
          (renderResult.mathTagBefore = counter),
          (renderResult.mathTagAfter = w().counter),
          (renderResult.mathLabels = JSON.stringify(S(keys, Object.keys(w().allLabels)))),
          renderResult
        );
      }
      try {
        return synchronous
          ? s(MathJax.tex2svg(texSource, displayMetrics))
          : new Promise((resolvePromise) => {
              MathJax.tex2svgPromise(texSource, displayMetrics).then(
                (result) => {
                  resolvePromise(s(result));
                },
                () => {
                  MathJax.tex2svgPromise('', displayMetrics).then((result) => {
                    resolvePromise(s(result));
                  });
                },
              );
            });
      } catch (error) {}
    }
    async function E(editor, items, resetCounter) {
      for (
        var currentItems = [], currentItemIndex = 0;
        currentItemIndex < items.length;
        currentItemIndex++
      ) {
        let element = items[currentItemIndex];
        if (!document.body.contains(element)) return !1;
        let text = editor.getNode(element.getAttribute('cid')).get('text');
        currentItemIndex % 60 == 0 && (await y(100));
        var renderResult = await k(text, element.dataset, !1, resetCounter);
        currentItems.push(renderResult);
      }
      return (
        items.forEach((inputElement, itemIndex) => {
          var renderResult = currentItems[itemIndex];
          inputElement.dataset.mathTagBefore = renderResult.mathTagBefore;
          var currentElement = inputElement.querySelector(
            '.md-math-container, .md-mathjax-preview, .md-fences-adv-panel-preview',
          );
          if (currentElement)
            (currentElement.innerHTML = ''),
              currentElement.appendChild(renderResult.dom),
              currentElement.classList.remove('math-jax-preprocess'),
              (inputElement.dataset.mathTagAfter = renderResult.mathTagAfter),
              (inputElement.dataset.mathLabels = renderResult.mathLabels);
          else {
            var diagramPanel = jquery('#componenet .md-diagram-panel').clone();
            jquery(inputElement).append(diagramPanel);
          }
        }),
        items.length
      );
    }
    class T {
      constructor(inputEditor) {
        (this.isMathJaxReady = m),
          (this.getMathJaxTags = w),
          (this.renderTex = k),
          (this.editor = inputEditor),
          (this.queue = {}),
          (this.cache = {}),
          this.preview,
          this.bindEvent(),
          b();
      }
      saveMathState() {
        this.state = { count: w().counter, allLabels: w().allLabels };
      }
      restoreMathState() {
        this.state && (MathJax.texReset(this.state.count), (w().allLabels = this.state.allLabels));
      }
      beforeRenderMath() {
        document.querySelector('#write').classList.add('marklyra-before-first-render');
      }
      cacheUnder(container) {
        container &&
          container.querySelectorAll &&
          container.querySelectorAll('mjx-container').forEach((inputElement) => {
            var element = inputElement.closest('.md-math-block, .md-fences-math'),
              documentNode = element && this.editor.getNode(element.getAttribute('cid'));
            if (documentNode && !documentNode.isDeleted()) {
              var text = documentNode.get('text');
              this.cache[text]
                ? delete this.cache[text]
                : element.dataset.mathTagBefore &&
                  (this.cache[text] = {
                    attr: `data-math-tag-before="${element.dataset.mathTagBefore}" data-math-tag-after="${element.dataset.mathTagAfter}" data-math-labels="${utilities.escape(element.dataset.mathLabels)}"`,
                    inner: inputElement.outerHTML,
                  });
            }
          });
      }
      clearCache() {
        this.cache = {};
      }
      bindEvent() {
        var receiver = this,
          currentEditor = this.editor;
        jquery(this.editor.sessionStr)
          .on('mousedown', '.md-math-container', function (unusedParameter1) {
            currentEditor.undo.prepCursorSnap();
          })
          .on('click startedit', '.md-math-container', async function (mouseEvent) {
            if (void 0 === mouseEvent.which || 1 == mouseEvent.which) {
              var element = jquery(this).closest('[cid]');
              return await receiver.startEditing(element, 'auto'), currentEditor.undo.endSnap(), !1;
            }
          })
          .on('losefocus', '.md-math-block', function (unusedParameter1) {
            receiver.stopEditing(this.getAttribute('cid')),
              document.activeElement != currentEditor.writingArea &&
                currentEditor.selection.scrollAdjust();
          })
          .on('endfocus', '.md-math-block', function (unusedParameter1) {
            receiver.stopEditing(this.getAttribute('cid'), !1, !0),
              document.activeElement != currentEditor.writingArea &&
                currentEditor.selection.scrollAdjust();
          })
          .on('keydown', '.md-math-block', async function (keyboardEvent) {
            var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
            if ('Enter' === map[keyCode])
              return (
                await receiver.startEditing(jquery(this), 'auto'),
                keyboardEvent.stopPropagation(),
                keyboardEvent.preventDefault()
              );
          })
          .on('blur inline-change', '.md-math-block .marklyra-input', function () {
            if (receiver.currentCm) {
              var documentNode = receiver.editor.getNode(receiver.currentCm.cid);
              receiver.tryAddTagUndo(documentNode, jquery(this));
            }
          })
          .on('keydown', '.md-math-block .marklyra-input', function (keyboardEvent) {
            'Enter' == map[keyboardEvent.keyCode || keyboardEvent.which] &&
              receiver.editor.selection.moveUpOrDown(!1, keyboardEvent);
          })
          .on(
            'click',
            '.md-math-block .md-rawblock-after, .md-math-block .md-rawblock-before',
            function (clickEvent) {
              clickEvent.target == this && this.querySelector('.marklyra-input').focus();
            },
          )
          .on('keydown', '.md-math-block .marklyra-input', function (keyboardEvent) {
            var selectionRange,
              keyCode = keyboardEvent.keyCode || keyboardEvent.which;
            if ('Delete' == map[keyCode]) {
              if (
                (selectionRange = receiver.editor.selection.getRangy()).commonAncestorContainer
                  .parentElement != this
              )
                return !1;
              if (
                selectionRange.startOffset == selectionRange.endOffset &&
                selectionRange.endOffset == this.textContent.length
              )
                return receiver.editor.selection.moveUpOrDown(!1), !1;
            } else if ('Backspace' == map[keyCode]) {
              if (
                (selectionRange = receiver.editor.selection.getRangy()).commonAncestorContainer
                  .parentElement != this
              )
                return !1;
              if (
                selectionRange.startOffset == selectionRange.endOffset &&
                0 == selectionRange.startOffset
              )
                return receiver.editor.selection.moveUpOrDown(!0), !1;
            } else if ('Return' == map[keyCode] || 'Enter' == map[keyCode])
              return receiver.editor.selection.moveUpOrDown(!1), !1;
          })
          .on('paste', '.md-math-block .marklyra-input', function (inputEvent) {
            setTimeout(function () {
              (inputEvent.target.textContent = inputEvent.target.textContent
                .replace(/(^[\n{]+)|([\n}]+$)/g, '')
                .split(/\r?\n/)[0]),
                jquery(inputEvent.target).trigger('change');
            }, 0);
          })
          .on('click', '.md-fences-math .md-fences-adv-panel', function (unusedParameter1) {
            var element = jquery(this).prevAll('.CodeMirror');
            if (element.length && !element.hasClass('CodeMirror-focused')) {
              var currentCodeMirror = element[0].CodeMirror;
              currentCodeMirror && (currentCodeMirror.refresh(), currentCodeMirror.focus());
            }
          });
      }
      tryAddTagUndo(documentNode, element) {
        if (!element.hasClass('marklyra-input')) return !1;
        documentNode || (documentNode = this.editor.getNode(this.currentCm.cid));
        var key = element.hasClass('marklyra-input-before') ? 'tagBefore' : 'tagAfter',
          previousValue = documentNode.get(key),
          nextValue = element.text();
        if (previousValue != nextValue) {
          var attributeCommand = undoManager.makeEmptyCommand();
          return (
            attributeCommand.undo.push({
              id: documentNode.cid,
              type: 'attr',
              key: key,
              value: previousValue || '',
            }),
            documentNode.set(key, nextValue),
            attributeCommand.redo.push({
              id: documentNode.cid,
              type: 'attr',
              key: key,
              value: nextValue,
            }),
            self.editor.undo.register(attributeCommand),
            !0
          );
        }
        return !1;
      }
      async renderAfterLabelChanges(excludedElements) {
        var items = Array.from(document.querySelectorAll('.md-math-block, .md-fences-math'));
        excludedElements = excludedElements || [];
        var filteredItems = items.filter((element) => {
          if (~excludedElements.indexOf(element)) return !1;
          try {
            var text = this.editor.getNode(element.getAttribute('cid')).get('text');
            return !!/\\(eq)?ref\{/.exec(text);
          } catch (error) {}
          return !1;
        });
        return await E(this.editor, filteredItems, !0);
      }
      async renderAfter(searchValue, keepCounter) {
        await g();
        var mathElements = Array.from(document.querySelectorAll('.md-math-block, .md-fences-math')),
          itemIndex = mathElements.indexOf(searchValue) + 1,
          tagCounter = 0;
        if (!itemIndex)
          for (var elementIndex in mathElements) {
            const candidateElement = mathElements[elementIndex];
            if (
              !(
                searchValue.compareDocumentPosition(candidateElement) &
                searchValue.DOCUMENT_POSITION_PRECEDING
              )
            )
              break;
            itemIndex = elementIndex + 1;
          }
        if (
          (itemIndex &&
            !keepCounter &&
            !(tagCounter = searchValue.dataset.mathTagAfter) &&
            mathElements[itemIndex - 1] &&
            (tagCounter = mathElements[itemIndex - 1].dataset.mathTagAfter),
          !keepCounter && C(tagCounter),
          mathElements[itemIndex] &&
            mathElements[itemIndex].dataset.mathTagBefore - 0 == w().counter)
        )
          return !1;
        var slice = mathElements.slice(itemIndex);
        return 0 != (await E(this.editor, slice)) && !!slice.length && slice;
      }
      async renderUnder(element, forceRender) {
        await g();
        var classList = document.querySelector('#write').classList;
        classList.contains('marklyra-before-first-render') &&
          setTimeout(() => {
            classList.remove('marklyra-before-first-render');
          }, 10);
        var mathElements = Array.from(
          (element || document).querySelectorAll('.md-math-block, .md-fences-math'),
        );
        (element &&
          element.classList &&
          (element.classList.contains('md-math-block') ||
            element.classList.contains('md-fences-math')) &&
          (mathElements = [element]),
        forceRender) ||
          mathElements.find((inputElement) => !inputElement.querySelector('mjx-container')) ||
          (mathElements = []);
        if (mathElements.length) {
          mathElements.length > 30 && (await y(100));
          var currentEditor = this.editor,
            mappedItems = Object.entries(w().allLabels).map((item) => [item[0], item[1].tag]),
            needsFollowingRefresh =
              (element && element.dataset && element.dataset.needRefresh) || !1;
          needsFollowingRefresh && element.removeAttribute('data-need-refresh');
          var startingCounter = x(mathElements[0]),
            mathTagAfter = mathElements.last().dataset.mathTagAfter;
          if ((C(startingCounter), !1 !== (await E(currentEditor, mathElements)))) {
            needsFollowingRefresh = needsFollowingRefresh || mathTagAfter != w().counter;
            var currentMappedItems = Object.entries(w().allLabels).map((item) => [
              item[0],
              item[1].tag,
            ]);
            if (
              (needsFollowingRefresh =
                needsFollowingRefresh ||
                (function (previousLabels, nextLabels) {
                  if (previousLabels.length != nextLabels.length) return !0;
                  for (var labelEntry of previousLabels)
                    if (
                      !nextLabels.find(
                        (item) => item[0] == labelEntry[0] && item[1] == labelEntry[1],
                      )
                    )
                      return !0;
                  return !1;
                })(mappedItems, currentMappedItems))
            ) {
              var updatedNodes = await this.renderAfter(mathElements.last(), !0);
              await Promise.all([
                this.renderAfterLabelChanges(updatedNodes),
                this.editor.mathInline.renderAll(!0, void 0, !0),
              ]);
            }
            needsFollowingRefresh || (await this.editor.mathInline.renderAll(!1, element)),
              element || this.editor.tryEnterBusyMode();
          }
        } else await this.editor.mathInline.renderAll(!1, element);
      }
      getTex(nodeId) {
        return this.editor.getNode(nodeId).get('text');
      }
      getCidAndElem(nodeOrElement) {
        var nodeId = nodeOrElement,
          element = nodeOrElement;
        return (
          'string' == typeof nodeOrElement
            ? (element = this.editor.findElemById(nodeId))
            : (nodeId = element.attr('cid')),
          [nodeId, element]
        );
      }
      syncToNode(nodeId) {
        var documentNode = 'string' == typeof nodeId ? this.editor.getNode(nodeId) : nodeId;
        return (
          (this.currentCm || {}).cid === documentNode.cid &&
            documentNode.set('text', this.currentCm.getValue()),
          documentNode
        );
      }
      remove(nodeOrElement) {
        var paragraphElement,
          nodeAndElement = this.getCidAndElem(nodeOrElement),
          nodeId = nodeAndElement[0],
          blockElement = nodeAndElement[1],
          documentNode = editor.getNode(nodeId),
          UndoManager = editor.undo.UndoManager,
          removeCommand = UndoManager.makeEmptyCommand(),
          codeMirror = this.currentCm;
        this.beforeDeleteFences(documentNode),
          codeMirror && codeMirror.cid === documentNode.cid
            ? removeCommand.undo.push({
                type: 'fences-pos',
                pos: codeMirror.getCursor(),
                id: codeMirror.cid,
              })
            : removeCommand.undo.push(this.editor.selection.buildUndo()),
          removeCommand.undo.push(UndoManager.buildReplaceUndo(documentNode)),
          documentNode.set('type', NodeType.paragraph),
          documentNode.set('text', ''),
          removeCommand.redo.push(UndoManager.buildReplaceUndo(documentNode)),
          (paragraphElement = jquery(jquery.parseHTML(documentNode.toHTML())[0])),
          blockElement.replaceWith(paragraphElement),
          editor.selection.jumpIntoElemEnd(paragraphElement),
          removeCommand.redo.push(editor.selection.buildUndo()),
          editor.undo.register(removeCommand),
          (this.currentCm = void 0);
      }
      beforeDeleteFences(nodeOrId) {
        var nodeId = nodeOrId.cid,
          documentNode = nodeOrId,
          receiver = this;
        nodeId || ((nodeId = nodeOrId), (documentNode = this.syncToNode(nodeId))),
          (this.currentCm = void 0);
        var nodeElement = this.editor.findElemById(nodeId);
        if (
          (F(JSON.parse(nodeElement.attr('data-math-labels') || '[]'), w().allLabels),
          this.stopEditing(documentNode.cid, !1, !0),
          File.option.autoNumberingForMath && !File.inBusyMode)
        ) {
          var element = nodeElement.next();
          setTimeout(async () => {
            element.length && element.closest('body')
              ? (await receiver.renderAfter(element[0])) &&
                (await receiver.editor.mathInline.renderAll(!0, void 0, !0))
              : receiver.forceRefreshSoon();
          }, 10);
        }
      }
      async stopEditing(nodeOrElement, moveToNextBlock, skipHistory) {
        if ((this.currentCm && this.currentCm.cid) || nodeOrElement) {
          var nodeAndElement = this.getCidAndElem(nodeOrElement || this.currentCm.cid),
            nodeId = nodeAndElement[0],
            blockElement = nodeAndElement[1],
            currentEditor = this.editor,
            codeMirror = this.currentCm;
          if (blockElement[0] && codeMirror) {
            if (codeMirror.cid == nodeId) {
              var element = blockElement[0].querySelector('.md-mathjax-preview');
              if (element) {
                var editCommand = undoManager.makeEmptyCommand();
                editCommand.undo.push({
                  type: 'fences-pos',
                  pos: codeMirror.getCursor(),
                  id: codeMirror.cid,
                });
                var documentNode = this.syncToNode(nodeId);
                element &&
                  ((this.currentCm = void 0),
                  blockElement
                    .html(html.replace('{type}', jquery.localize.getString('Math', 'Menu')))
                    .removeClass('md-rawblock-on-edit'),
                  element.setAttribute('class', 'md-rawblock-container md-math-container'),
                  element.setAttribute('tabindex', '-1'),
                  blockElement[0].appendChild(element),
                  await this.renderUnder(blockElement[0], !0),
                  moveToNextBlock &&
                    currentEditor.selection.jumpToNextBlock(documentNode, editCommand),
                  !skipHistory && currentEditor.undo.register(editCommand));
              } else this.currentCm = void 0;
            }
          } else this.currentCm = void 0;
        }
      }
      updateDiagram(nodeId) {
        var {
          isNeedRefresh: needsRefresh,
          retrieveMathTag: restoreMathTags,
          storeMathTag: storeMathTags,
        } = this.prepareStartEditing();
        var blockElement = this.editor.findElemById(nodeId)[0];
        (async function (element) {
          if (m()) {
            restoreMathTags(element);
            var keys = Object.keys(w().allLabels),
              currentElement = element.querySelector('.CodeMirror');
            if (currentElement && (currentElement = currentElement.CodeMirror)) {
              var localElement = element.querySelector('.md-fences-adv-panel-preview');
              if (localElement) {
                var texSource = currentElement.getValue() || '<Empty \\space Math \\space Block>',
                  renderMetrics = MathJax.getMetricsFor(localElement, !0);
                var __marklyraRenderTicket =
                  typeof globalThis.__MARKLYRA_RENDER_TICKET__ === 'function'
                    ? globalThis.__MARKLYRA_RENDER_TICKET__(localElement, currentElement)
                    : null;
                try {
                  let renderedSvg = await MathJax.tex2svgPromise(texSource, renderMetrics);
                  if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) return;
                  renderedSvg.querySelector("[data-mml-node='merror']") &&
                  localElement.children.length
                    ? (localElement.children[1] && localElement.children[1].remove(),
                      (renderedSvg.style.marginTop = '8px'),
                      localElement.appendChild(renderedSvg))
                    : ((localElement.innerHTML = ''), localElement.appendChild(renderedSvg));
                } catch (error) {
                  if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) return;
                }
                storeMathTags(element);
                var currentKeys = Object.keys(w().allLabels);
                (element.dataset.mathLabels = JSON.stringify(S(keys, currentKeys))),
                  needsRefresh() && (element.dataset.needRefresh = !0);
              }
            }
          }
        })(blockElement).then(() => {
          File.option.autoNumberingForMath && !File.inBusyMode && this.renderAfter(blockElement);
        });
      }
      prepareStartEditing() {
        var previousLabels,
          mathTagBefore = null,
          counterChanged = !1;
        return {
          isNeedRefresh: () => counterChanged,
          retrieveMathTag: function (blockElement) {
            mathTagBefore ||
              (blockElement.hasAttribute('data-math-tag-before')
                ? ((mathTagBefore = blockElement.dataset.mathTagBefore),
                  (previousLabels = JSON.parse(blockElement.dataset.mathLabels || '[]')))
                : (mathTagBefore = x(blockElement))),
              mathTagBefore
                ? (C(mathTagBefore), (blockElement.dataset.mathTagBefore = mathTagBefore))
                : (blockElement.dataset.mathTagBefore = w().counter),
              F(JSON.parse(blockElement.dataset.mathLabels || '[]'), w().allLabels);
          },
          storeMathTag: function (blockElement) {
            var counter = w().counter;
            blockElement.dataset.mathTagAfter &&
              blockElement.dataset.mathTagAfter - 0 != counter &&
              ((blockElement.dataset.mathTagAfter = counter), (counterChanged = !0)),
              JSON.stringify(previousLabels) != blockElement.dataset.mathLabels &&
                (counterChanged = !0);
          },
        };
      }
      async startEditing(nodeOrElement, cursorPlacement) {
        var nodeAndElement = this.getCidAndElem(nodeOrElement),
          nodeId = nodeAndElement[0],
          blockElement = nodeAndElement[1],
          currentEditor = this.editor,
          documentNode = this.editor.getNode(nodeId);
        if (
          !File.isLocked &&
          (this.currentCm && this.currentCm.cid != nodeId && (await this.stopEditing()),
          DocumentNode.isType(documentNode, NodeType.math_block))
        ) {
          var element = document.querySelector('content'),
            scrollHeight = null;
          jquery(document.activeElement).closest('.md-math-block').length &&
            (scrollHeight = element.scrollHeight - element.scrollTop - element.clientHeight);
          var currentCm,
            {
              isNeedRefresh: needsRefresh,
              retrieveMathTag: restoreMathTags,
              storeMathTag: storeMathTags,
            } = this.prepareStartEditing(),
            timerId = null;
          if (nodeId) {
            if (this.currentCm && this.currentCm.cid === nodeId) {
              if (currentEditor.writingArea.contains(this.currentCm.getWrapperElement()))
                return this.currentCm.focus(), this.currentCm;
              this.currentCm = null;
            }
            this.currentCm &&
              (await this.stopEditing(this.currentCm.cid), window.getSelection().removeAllRanges()),
              blockElement
                .html(
                  html.replace('{type}', jquery.localize.getString('Math', 'Menu')) +
                    document.querySelector('#md-mathblock-panel-templ').textContent,
                )
                .addClass('md-rawblock-on-edit'),
              documentNode.get('tagBefore') &&
                blockElement
                  .find('.md-rawblock-before .marklyra-input')
                  .text(documentNode.get('tagBefore')),
              documentNode.get('tagAfter') &&
                blockElement
                  .find('.md-rawblock-after .marklyra-input')
                  .text(documentNode.get('tagAfter')),
              documentNode.get('legacyMath') &&
                (blockElement.find('.md-rawblock-before').text('\\['),
                blockElement.find('.md-rawblock-after').text('\\]'));
            var editingPanel = blockElement.children('.md-mathblock-panel');
            if (!editingPanel.length) return;
            (this.currentCm = (function (editor) {
              var codeMirror = CodeMirror(
                editingPanel[0].querySelector('.md-rawblock-input'),
                {
                  styleSelectedText: !0,
                  styleActiveLine: !0,
                  lineWrapping: !File.option.noLineWrapping,
                  mode: 'stex',
                  placeholder: jquery.localize.getString('Input Math TeX here'),
                  theme: ' inner null-scroll',
                  autoCloseBrackets: !File.option.noPairingMatch,
                  autoCloseTags: !File.option.noPairingMatch,
                  value: documentNode.get('text').trim(),
                  lineNumbers: File.option.showLineNumbersForFence,
                  resetSelectionOnContextMenu: !0,
                  dragDrop: !1,
                  indentUnit: File.option.codeIndentSize,
                  tabSize: File.option.codeIndentSize,
                  lineWiseCopyCut: File.option.lineWiseCopyCut,
                },
                editor,
                nodeId,
              );
              return (
                codeMirror.on('changes', function (changedEditor, changes) {
                  var refreshElement;
                  editor.fences.handleUserReplacement(changedEditor, changes),
                    editor.wordCount.quickUpdate(codeMirror.cid),
                    (refreshElement = blockElement[0]),
                    timerId && clearTimeout(timerId),
                    (timerId = setTimeout(async () => {
                      await C(refreshElement), (timerId = null);
                    }, 100)),
                    editor.selection.clearGlobalColumn(),
                    editor.syncChange([
                      { type: 'sync', id: documentNode.id, tex: codeMirror.getValue() },
                    ]),
                    File.isTypeWriterMode &&
                      !File.option.scrollWithCursor &&
                      editor.selection.typeWriterScroll(
                        codeMirror.cursorCoords(codeMirror.getCursor()),
                      );
                }),
                codeMirror.on('cursorActivity', function () {
                  editor.fences.handleCursorActivity(codeMirror);
                }),
                codeMirror.on('blur', function (codeMirror) {
                  setTimeout(function () {
                    document.body.contains(codeMirror.getWrapperElement()) &&
                      documentNode.set('text', codeMirror.getValue());
                  }, 0);
                }),
                codeMirror.on('keydown', function (codeMirror, event) {
                  editor.fences.onKeyDown(
                    codeMirror,
                    event,
                    editor,
                    function (codeMirror) {
                      if (!codeMirror.getValue().length)
                        return (
                          editor.mathBlock.remove(codeMirror.cid),
                          event.preventDefault(),
                          event.codemirrorIgnore
                        );
                    },
                    function (codeMirror, keyboardEvent) {
                      return keyboardEvent.shiftKey
                        ? (keyboardEvent.stopPropagation(), !0)
                        : (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
                            (function (codeMirror) {
                              var cursorPosition = codeMirror.doc.getCursor();
                              return (
                                !cursorPosition ||
                                codeMirror.doc.indexFromPos(cursorPosition) >=
                                  codeMirror.doc.getValue().length
                              );
                            })(codeMirror)
                          ? (setTimeout(function () {
                              editor.UserOp.insertParagraph();
                            }, 20),
                            keyboardEvent.stopPropagation(),
                            !0)
                          : void 0;
                    },
                  );
                }),
                codeMirror.focus(),
                codeMirror
              );
            })(this.editor)),
              C(blockElement[0]).then(() => {
                File.option.autoNumberingForMath &&
                  !File.inBusyMode &&
                  this.renderAfter(blockElement[0]);
              }),
              (currentCm = this.currentCm).focus(),
              cursorPlacement &&
                ('<Empty \\space Math \\space Block>' == currentCm.getValue()
                  ? currentCm.execCommand('selectAll')
                  : 'end' == cursorPlacement || 'auto' == cursorPlacement
                    ? currentCm.execCommand('goDocEnd')
                    : 'start' == cursorPlacement && currentCm.execCommand('goDocStart'),
                currentEditor.refocus(nodeId),
                null === scrollHeight || scrollHeight > 100
                  ? currentEditor.selection.scrollAdjust()
                  : (element.scrollTop =
                      element.scrollHeight - scrollHeight - element.clientHeight));
          }
          return this.currentCm;
        }
        async function C(inputElement) {
          if (m()) {
            restoreMathTags(inputElement);
            var keys = Object.keys(w().allLabels),
              currentElement = inputElement.querySelector('.CodeMirror');
            if (currentElement && (currentElement = currentElement.CodeMirror)) {
              var localElement = inputElement.querySelector('.md-mathjax-preview');
              if (localElement) {
                var texSource = currentElement.getValue() || '<Empty \\space Math \\space Block>',
                  renderMetrics = MathJax.getMetricsFor(localElement, !0);
                var __marklyraRenderTicket =
                  typeof globalThis.__MARKLYRA_RENDER_TICKET__ === 'function'
                    ? globalThis.__MARKLYRA_RENDER_TICKET__(localElement, currentElement)
                    : null;
                try {
                  let renderedSvg = await MathJax.tex2svgPromise(texSource, renderMetrics);
                  if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) return;
                  renderedSvg.querySelector("[data-mml-node='merror']") &&
                  localElement.children.length
                    ? (localElement.children[1] && localElement.children[1].remove(),
                      (renderedSvg.style.marginTop = '8px'),
                      localElement.appendChild(renderedSvg))
                    : ((localElement.innerHTML = ''), localElement.appendChild(renderedSvg));
                } catch (error) {
                  if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) return;
                }
                storeMathTags(inputElement);
                var currentKeys = Object.keys(w().allLabels);
                (inputElement.dataset.mathLabels = JSON.stringify(S(keys, currentKeys))),
                  needsRefresh() && (inputElement.dataset.needRefresh = !0);
              }
            }
          }
        }
      }
      copyAsTex(targetElement) {
        var nodeId = (targetElement || document.activeElement || document.body).getAttribute('cid'),
          texSource = '';
        nodeId && (texSource = this.editor.getNode(nodeId).get('text').trim()),
          console.debug(texSource),
          this.editor.UserOp.setClipboard(null, null, texSource, !0);
      }
      copyAsMathML(targetElement, plainTextOnly) {
        var texSource = '',
          currentEditor = this.editor,
          nodeId =
            (targetElement || document.activeElement || document.body).getAttribute('cid') ||
            currentEditor.focusCid;
        nodeId &&
          ((texSource = currentEditor.getNode(nodeId).get('text')),
          File.option.noDisplayLinesInMath || (texSource = '\\u32E' + texSource));
        var mathMl = MathJax.tex2mml(texSource, { display: !0 });
        if ((console.debug(mathMl), plainTextOnly)) currentEditor.UserOp.nativeCopyText(mathMl);
        else {
          var clipboardHtml =
            "<pre class='md-fences' lang='xml'>" + utilities.escape(mathMl) + '</pre>';
          currentEditor.UserOp.setClipboard(clipboardHtml, null, mathMl, !0);
        }
      }
      copyAsImage(element) {
        var currentElement = (
            (element && element.querySelector) ||
            document.activeElement
          ).querySelector('svg'),
          currentEditor = this.editor,
          imageHtml = mediaActions.SVG2HtmlImg(currentElement);
        currentEditor.UserOp.setClipboard(imageHtml, null, imageHtml, !0);
      }
      forceRefreshSoon() {
        this.forceRefreshTimer_ &&
          (clearTimeout(this.forceRefreshTimer_), (this.forceRefreshTimer_ = null));
        var receiver = this;
        this.forceRefreshTimer_ = setTimeout(function () {
          receiver.forceRefresh(), (receiver.forceRefreshTimer_ = null);
        }, 10);
      }
      cleanUpAMS() {
        window.MathJax && MathJax.texReset && MathJax.texReset(0);
      }
      async forceRefresh() {
        (this.editor.sourceView && this.editor.sourceView.inSourceMode) ||
          (m()
            ? (console.debug('refresh all mathjax'),
              await b(),
              this.editor.brush.clearAndPause(),
              this.cleanUpAMS(),
              await this.renderUnder(document, !0),
              File.option.enableInlineMath && (await File.editor.mathInline.renderAll(!0)),
              this.editor.brush.resume())
            : setTimeout(this.forceRefresh.bind(this), 500));
      }
    }
    (T.isMathType = function (language) {
      return (
        File.option.gitlabMath &&
        'string' == typeof language &&
        DocumentNode.isType((language || '').toLowerCase(), 'math')
      );
    }),
      (moduleRecord.exports = T);
  },
);
