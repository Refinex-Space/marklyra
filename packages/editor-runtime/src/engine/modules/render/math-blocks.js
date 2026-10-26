// render/math-blocks.
export default function initializeRenderMathBlocks(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(waitForIdleRender, 'name', { value: 'y', configurable: true });
  Object.defineProperty(initializeMathRenderHooks, 'name', { value: 'b', configurable: true });
  Object.defineProperty(getMathJaxTags, 'name', { value: 'w', configurable: true });
  Object.defineProperty(getPrecedingTagCounter, 'name', { value: 'x', configurable: true });
  Object.defineProperty(resetMathTags, 'name', { value: 'C', configurable: true });
  Object.defineProperty(removeMathLabels, 'name', { value: 'F', configurable: true });
  Object.defineProperty(collectAddedLabels, 'name', { value: 'S', configurable: true });
  Object.defineProperty(renderTex, 'name', { value: 'k', configurable: true });
  Object.defineProperty(renderMathElements, 'name', { value: 'E', configurable: true });

  if (!this) {
    self;
  }
  var displayMetrics,
    CodeMirror = requireModule('libraries/codemirror'),
    jquery = requireModule('libraries/jquery'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    undoManager = requireModule('editing/undo-manager'),
    utilities = (undoManager.SnapFlag, requireModule('shared/utilities')),
    mediaActions = requireModule('media/actions'),
    keyboardShortcuts = requireModule('editing/keyboard-shortcuts'),
    map = keyboardShortcuts.map,
    NodeType = documentModel.TYPE,
    html =
      ((map = keyboardShortcuts.map),
      document.querySelector('#md-rawblock-tooltip-templ').innerHTML),
    isMathJaxReady = Object.defineProperty(
      function () {
        return !!(window.MathJax && window.MathJax.config && MathJax.startup.document);
      },
      'name',
      { value: 'm', configurable: true },
    ),
    waitForMathJax = Object.defineProperty(
      async function () {
        if (!isMathJaxReady()) {
          return new Promise((resolvePromise) => {
            var pollMathJaxReady = Object.defineProperty(
              function () {
                if (isMathJaxReady()) {
                  resolvePromise();
                } else {
                  setTimeout(pollMathJaxReady, 50);
                }
              },
              'name',
              { value: 't', configurable: true },
            );
            setTimeout(pollMathJaxReady, 50);
          });
        }
      },
      'name',
      { value: 'g', configurable: true },
    ),
    renderHooksInitialized = false;
  function waitForIdleRender(timeout) {
    if (window.requestIdleCallback) {
      return new Promise((resolvePromise) =>
        requestIdleCallback(resolvePromise, { timeout: timeout }),
      );
    } else {
      return (function (delay) {
        return new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
      })(timeout);
    }
  }
  async function initializeMathRenderHooks() {
    Object.defineProperty(skipDocumentRenderAction, 'name', { value: 'e', configurable: true });

    function skipDocumentRenderAction() {}
    var currentDomNode, hrefPrefixPattern, idPrefixPattern;
    if (!renderHooksInitialized) {
      await waitForMathJax();
      MathJax.startup.document.removeRenderAction('addMenu');
      MathJax.startup.document.addRenderAction(
        'afterRender',
        1001,
        skipDocumentRenderAction,
        (mathItem, unusedParameter2) => {
          var domNode = mathItem.typesetRoot.querySelector('svg');
          idPrefixPattern = hrefPrefixPattern = /^mjx-/i;
          (currentDomNode = domNode).querySelectorAll('[id]').forEach((item) => {
            if (!idPrefixPattern.exec(item.id)) {
              item.id = 'mjx-' + item.id;
            }
          });
          currentDomNode.querySelectorAll('[class]').forEach((element) => {
            element.setAttribute(
              'class',
              element
                .getAttribute('class')
                .split(/\s+/)
                .filter((item) => hrefPrefixPattern.exec(item))
                .join(' '),
            );
          });
          if (
            domNode.parentElement == mathItem.typesetRoot &&
            mathItem.typesetRoot.hasAttribute('aria-label')
          ) {
            domNode.setAttribute('alt', mathItem.typesetRoot.getAttribute('aria-label'));
          }
        },
      );
      displayMetrics = MathJax.getMetricsFor(
        document.querySelector('#write>p') || document.querySelector('#write'),
        true,
      );
      renderHooksInitialized = true;
      if (!File.option.noDisplayLinesInMath) {
        MathJax.startup.document.addRenderAction(
          'displayLines',
          1,
          skipDocumentRenderAction,
          (mathItem, unusedParameter2) => {
            mathItem.math = (function (text) {
              if ('\\u32E' == text[0]) {
                return text.substr(1);
              }
              if (!/\\(\\|newline)/.exec(text)) {
                return text;
              }
              var match = /^(?:\s|(?:\s*%[^\n]*\n))*\\([a-z]+)/i.exec(text);
              if (
                match &&
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
              ) {
                return text;
              } else {
                console.debug('wrap displayLines');
                return `\\displaylines{\n${text}\n}`;
              }
            })(mathItem.math);
          },
        );
      }
    }
  }
  function getMathJaxTags() {
    return MathJax.startup.document.inputJax[0].parseOptions.tags;
  }
  function getPrecedingTagCounter(searchValue) {
    var mathElements = Array.from(document.querySelectorAll('.md-math-block, .md-fences-math')),
      previousElement = null;
    if (searchValue.hasAttribute('data-tag-before')) {
      return searchValue.dataset.mathTagBefore;
    }
    if (mathElements.indexOf(searchValue) > -1) {
      if ((previousElement = mathElements[mathElements.indexOf(searchValue) - 1])) {
        return previousElement.dataset.mathTagAfter;
      } else {
        return 0;
      }
    }
    for (const candidateElement of mathElements) {
      if (
        searchValue.compareDocumentPosition(candidateElement) !=
        searchValue.DOCUMENT_POSITION_FOLLOWING
      ) {
        break;
      }
      previousElement = candidateElement;
    }
    if (previousElement) {
      return previousElement.dataset.mathTagAfter;
    } else {
      return 0;
    }
  }
  function resetMathTags(tagCounter, allLabels) {
    if (!allLabels) {
      allLabels = getMathJaxTags().allLabels;
    }
    MathJax.texReset(tagCounter);
    getMathJaxTags().allLabels = allLabels;
  }
  function removeMathLabels(items, labelMap) {
    items.forEach((item) => {
      delete labelMap[item];
    });
  }
  function collectAddedLabels(previousKeys, items) {
    var currentItems = [];
    items.forEach((searchValue) => {
      if (-1 == previousKeys.indexOf(searchValue)) {
        currentItems.push(searchValue);
      }
    });
    return currentItems;
  }
  function renderTex(texSource, tagMetadata, synchronous, resetCounter) {
    Object.defineProperty(captureRenderedMathState, 'name', { value: 's', configurable: true });

    tagMetadata = tagMetadata || {};
    var counter = getMathJaxTags().counter;
    if (resetCounter) {
      resetMathTags((counter = tagMetadata.mathTagBefore));
    }
    removeMathLabels(JSON.parse(tagMetadata.mathLabels || '[]'), getMathJaxTags().allLabels);
    var keys = Object.keys(getMathJaxTags().allLabels);
    function captureRenderedMathState(dom) {
      var renderResult = {};
      renderResult.dom = dom;
      renderResult.mathTagBefore = counter;
      renderResult.mathTagAfter = getMathJaxTags().counter;
      renderResult.mathLabels = JSON.stringify(
        collectAddedLabels(keys, Object.keys(getMathJaxTags().allLabels)),
      );
      return renderResult;
    }
    try {
      if (synchronous) {
        return captureRenderedMathState(MathJax.tex2svg(texSource, displayMetrics));
      } else {
        return new Promise((resolvePromise) => {
          MathJax.tex2svgPromise(texSource, displayMetrics).then(
            (result) => {
              resolvePromise(captureRenderedMathState(result));
            },
            () => {
              MathJax.tex2svgPromise('', displayMetrics).then((result) => {
                resolvePromise(captureRenderedMathState(result));
              });
            },
          );
        });
      }
    } catch (error) {}
  }
  async function renderMathElements(editor, items, resetCounter) {
    for (
      var currentItems = [], currentItemIndex = 0;
      currentItemIndex < items.length;
      currentItemIndex++
    ) {
      let element = items[currentItemIndex];
      if (!document.body.contains(element)) {
        return false;
      }
      let text = editor.getNode(element.getAttribute('cid')).get('text');
      if (currentItemIndex % 60 == 0) {
        await waitForIdleRender(100);
      }
      var renderResult = await renderTex(text, element.dataset, false, resetCounter);
      currentItems.push(renderResult);
    }
    items.forEach((inputElement, itemIndex) => {
      var renderResult = currentItems[itemIndex];
      inputElement.dataset.mathTagBefore = renderResult.mathTagBefore;
      var currentElement = inputElement.querySelector(
        '.md-math-container, .md-mathjax-preview, .md-fences-adv-panel-preview',
      );
      if (currentElement) {
        currentElement.innerHTML = '';
        currentElement.appendChild(renderResult.dom);
        currentElement.classList.remove('math-jax-preprocess');
        inputElement.dataset.mathTagAfter = renderResult.mathTagAfter;
        inputElement.dataset.mathLabels = renderResult.mathLabels;
      } else {
        var diagramPanel = jquery('#componenet .md-diagram-panel').clone();
        jquery(inputElement).append(diagramPanel);
      }
    });
    return items.length;
  }
  class MathBlockController {
    constructor(inputEditor) {
      this.isMathJaxReady = isMathJaxReady;
      this.getMathJaxTags = getMathJaxTags;
      this.renderTex = renderTex;
      this.editor = inputEditor;
      this.queue = {};
      this.cache = {};
      this.preview;
      this.bindEvent();
      initializeMathRenderHooks();
    }
    saveMathState() {
      this.state = { count: getMathJaxTags().counter, allLabels: getMathJaxTags().allLabels };
    }
    restoreMathState() {
      if (this.state) {
        MathJax.texReset(this.state.count);
        getMathJaxTags().allLabels = this.state.allLabels;
      }
    }
    beforeRenderMath() {
      document.querySelector('#write').classList.add('marklyra-before-first-render');
    }
    cacheUnder(container) {
      if (container && container.querySelectorAll) {
        container.querySelectorAll('mjx-container').forEach((inputElement) => {
          var element = inputElement.closest('.md-math-block, .md-fences-math'),
            documentNode = element && this.editor.getNode(element.getAttribute('cid'));
          if (documentNode && !documentNode.isDeleted()) {
            var text = documentNode.get('text');
            if (this.cache[text]) {
              delete this.cache[text];
            } else {
              if (element.dataset.mathTagBefore) {
                this.cache[text] = {
                  attr: `data-math-tag-before="${element.dataset.mathTagBefore}" data-math-tag-after="${element.dataset.mathTagAfter}" data-math-labels="${utilities.escape(element.dataset.mathLabels)}"`,
                  inner: inputElement.outerHTML,
                };
              }
            }
          }
        });
      }
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
            await receiver.startEditing(element, 'auto');
            currentEditor.undo.endSnap();
            return false;
          }
        })
        .on('losefocus', '.md-math-block', function (unusedParameter1) {
          receiver.stopEditing(this.getAttribute('cid'));
          if (document.activeElement != currentEditor.writingArea) {
            currentEditor.selection.scrollAdjust();
          }
        })
        .on('endfocus', '.md-math-block', function (unusedParameter1) {
          receiver.stopEditing(this.getAttribute('cid'), false, true);
          if (document.activeElement != currentEditor.writingArea) {
            currentEditor.selection.scrollAdjust();
          }
        })
        .on('keydown', '.md-math-block', async function (keyboardEvent) {
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if ('Enter' === map[keyCode]) {
            await receiver.startEditing(jquery(this), 'auto');
            keyboardEvent.stopPropagation();
            return keyboardEvent.preventDefault();
          }
        })
        .on('blur inline-change', '.md-math-block .marklyra-input', function () {
          if (receiver.currentCm) {
            var documentNode = receiver.editor.getNode(receiver.currentCm.cid);
            receiver.tryAddTagUndo(documentNode, jquery(this));
          }
        })
        .on('keydown', '.md-math-block .marklyra-input', function (keyboardEvent) {
          if ('Enter' == map[keyboardEvent.keyCode || keyboardEvent.which]) {
            receiver.editor.selection.moveUpOrDown(false, keyboardEvent);
          }
        })
        .on(
          'click',
          '.md-math-block .md-rawblock-after, .md-math-block .md-rawblock-before',
          function (clickEvent) {
            if (clickEvent.target == this) {
              this.querySelector('.marklyra-input').focus();
            }
          },
        )
        .on('keydown', '.md-math-block .marklyra-input', function (keyboardEvent) {
          var selectionRange,
            keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if ('Delete' == map[keyCode]) {
            if (
              (selectionRange = receiver.editor.selection.getRangy()).commonAncestorContainer
                .parentElement != this
            ) {
              return false;
            }
            if (
              selectionRange.startOffset == selectionRange.endOffset &&
              selectionRange.endOffset == this.textContent.length
            ) {
              receiver.editor.selection.moveUpOrDown(false);
              return false;
            }
          } else {
            if ('Backspace' == map[keyCode]) {
              if (
                (selectionRange = receiver.editor.selection.getRangy()).commonAncestorContainer
                  .parentElement != this
              ) {
                return false;
              }
              if (
                selectionRange.startOffset == selectionRange.endOffset &&
                0 == selectionRange.startOffset
              ) {
                receiver.editor.selection.moveUpOrDown(true);
                return false;
              }
            } else {
              if ('Return' == map[keyCode] || 'Enter' == map[keyCode]) {
                receiver.editor.selection.moveUpOrDown(false);
                return false;
              }
            }
          }
        })
        .on('paste', '.md-math-block .marklyra-input', function (inputEvent) {
          setTimeout(function () {
            inputEvent.target.textContent = inputEvent.target.textContent
              .replace(/(^[\n{]+)|([\n}]+$)/g, '')
              .split(/\r?\n/)[0];
            jquery(inputEvent.target).trigger('change');
          }, 0);
        })
        .on('click', '.md-fences-math .md-fences-adv-panel', function (unusedParameter1) {
          var element = jquery(this).prevAll('.CodeMirror');
          if (element.length && !element.hasClass('CodeMirror-focused')) {
            var currentCodeMirror = element[0].CodeMirror;
            if (currentCodeMirror) {
              currentCodeMirror.refresh();
              currentCodeMirror.focus();
            }
          }
        });
    }
    tryAddTagUndo(documentNode, element) {
      if (!element.hasClass('marklyra-input')) {
        return false;
      }
      if (!documentNode) {
        documentNode = this.editor.getNode(this.currentCm.cid);
      }
      var key = element.hasClass('marklyra-input-before') ? 'tagBefore' : 'tagAfter',
        previousValue = documentNode.get(key),
        nextValue = element.text();
      if (previousValue != nextValue) {
        var attributeCommand = undoManager.makeEmptyCommand();
        attributeCommand.undo.push({
          id: documentNode.cid,
          type: 'attr',
          key: key,
          value: previousValue || '',
        });
        documentNode.set(key, nextValue);
        attributeCommand.redo.push({
          id: documentNode.cid,
          type: 'attr',
          key: key,
          value: nextValue,
        });
        self.editor.undo.register(attributeCommand);
        return true;
      }
      return false;
    }
    async renderAfterLabelChanges(excludedElements) {
      var items = Array.from(document.querySelectorAll('.md-math-block, .md-fences-math'));
      excludedElements = excludedElements || [];
      var filteredItems = items.filter((element) => {
        if (~excludedElements.indexOf(element)) {
          return false;
        }
        try {
          var text = this.editor.getNode(element.getAttribute('cid')).get('text');
          return !!/\\(eq)?ref\{/.exec(text);
        } catch (error) {}
        return false;
      });
      return await renderMathElements(this.editor, filteredItems, true);
    }
    async renderAfter(searchValue, keepCounter) {
      await waitForMathJax();
      var mathElements = Array.from(document.querySelectorAll('.md-math-block, .md-fences-math')),
        itemIndex = mathElements.indexOf(searchValue) + 1,
        tagCounter = 0;
      if (!itemIndex) {
        for (var elementIndex in mathElements) {
          const candidateElement = mathElements[elementIndex];
          if (
            !(
              searchValue.compareDocumentPosition(candidateElement) &
              searchValue.DOCUMENT_POSITION_PRECEDING
            )
          ) {
            break;
          }
          itemIndex = elementIndex + 1;
        }
      }
      if (
        itemIndex &&
        !keepCounter &&
        !(tagCounter = searchValue.dataset.mathTagAfter) &&
        mathElements[itemIndex - 1]
      ) {
        tagCounter = mathElements[itemIndex - 1].dataset.mathTagAfter;
      }
      if (!keepCounter) {
        resetMathTags(tagCounter);
      }
      if (
        mathElements[itemIndex] &&
        mathElements[itemIndex].dataset.mathTagBefore - 0 == getMathJaxTags().counter
      ) {
        return false;
      }
      var slice = mathElements.slice(itemIndex);
      return 0 != (await renderMathElements(this.editor, slice)) && !!slice.length && slice;
    }
    async renderUnder(element, forceRender) {
      await waitForMathJax();
      var classList = document.querySelector('#write').classList;
      if (classList.contains('marklyra-before-first-render')) {
        setTimeout(() => {
          classList.remove('marklyra-before-first-render');
        }, 10);
      }
      var mathElements = Array.from(
        (element || document).querySelectorAll('.md-math-block, .md-fences-math'),
      );
      if (
        !(
          (element &&
            element.classList &&
            (element.classList.contains('md-math-block') ||
              element.classList.contains('md-fences-math')) &&
            (mathElements = [element]),
          forceRender) ||
          mathElements.find((inputElement) => !inputElement.querySelector('mjx-container'))
        )
      ) {
        mathElements = [];
      }
      if (mathElements.length) {
        if (mathElements.length > 30) {
          await waitForIdleRender(100);
        }
        var currentEditor = this.editor,
          mappedItems = Object.entries(getMathJaxTags().allLabels).map((item) => [
            item[0],
            item[1].tag,
          ]),
          needsFollowingRefresh =
            (element && element.dataset && element.dataset.needRefresh) || false;
        if (needsFollowingRefresh) {
          element.removeAttribute('data-need-refresh');
        }
        var startingCounter = getPrecedingTagCounter(mathElements[0]),
          mathTagAfter = mathElements.last().dataset.mathTagAfter;
        resetMathTags(startingCounter);
        if (false !== (await renderMathElements(currentEditor, mathElements))) {
          needsFollowingRefresh = needsFollowingRefresh || mathTagAfter != getMathJaxTags().counter;
          var currentMappedItems = Object.entries(getMathJaxTags().allLabels).map((item) => [
            item[0],
            item[1].tag,
          ]);
          if (
            (needsFollowingRefresh =
              needsFollowingRefresh ||
              (function (previousLabels, nextLabels) {
                if (previousLabels.length != nextLabels.length) {
                  return true;
                }
                for (var labelEntry of previousLabels) {
                  if (
                    !nextLabels.find((item) => item[0] == labelEntry[0] && item[1] == labelEntry[1])
                  ) {
                    return true;
                  }
                }
                return false;
              })(mappedItems, currentMappedItems))
          ) {
            var updatedNodes = await this.renderAfter(mathElements.last(), true);
            await Promise.all([
              this.renderAfterLabelChanges(updatedNodes),
              this.editor.mathInline.renderAll(true, void 0, true),
            ]);
          }
          if (!needsFollowingRefresh) {
            await this.editor.mathInline.renderAll(false, element);
          }
          if (!element) {
            this.editor.tryEnterBusyMode();
          }
        }
      } else {
        await this.editor.mathInline.renderAll(false, element);
      }
    }
    getTex(nodeId) {
      return this.editor.getNode(nodeId).get('text');
    }
    getCidAndElem(nodeOrElement) {
      var nodeId = nodeOrElement,
        element = nodeOrElement;
      if ('string' == typeof nodeOrElement) {
        element = this.editor.findElemById(nodeId);
      } else {
        nodeId = element.attr('cid');
      }
      return [nodeId, element];
    }
    syncToNode(nodeId) {
      var documentNode = 'string' == typeof nodeId ? this.editor.getNode(nodeId) : nodeId;
      if ((this.currentCm || {}).cid === documentNode.cid) {
        documentNode.set('text', this.currentCm.getValue());
      }
      return documentNode;
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
      this.beforeDeleteFences(documentNode);
      if (codeMirror && codeMirror.cid === documentNode.cid) {
        removeCommand.undo.push({
          type: 'fences-pos',
          pos: codeMirror.getCursor(),
          id: codeMirror.cid,
        });
      } else {
        removeCommand.undo.push(this.editor.selection.buildUndo());
      }
      removeCommand.undo.push(UndoManager.buildReplaceUndo(documentNode));
      documentNode.set('type', NodeType.paragraph);
      documentNode.set('text', '');
      removeCommand.redo.push(UndoManager.buildReplaceUndo(documentNode));
      paragraphElement = jquery(jquery.parseHTML(documentNode.toHTML())[0]);
      blockElement.replaceWith(paragraphElement);
      editor.selection.jumpIntoElemEnd(paragraphElement);
      removeCommand.redo.push(editor.selection.buildUndo());
      editor.undo.register(removeCommand);
      this.currentCm = void 0;
    }
    beforeDeleteFences(nodeOrId) {
      var nodeId = nodeOrId.cid,
        documentNode = nodeOrId,
        receiver = this;
      if (!nodeId) {
        nodeId = nodeOrId;
        documentNode = this.syncToNode(nodeId);
      }
      this.currentCm = void 0;
      var nodeElement = this.editor.findElemById(nodeId);
      removeMathLabels(
        JSON.parse(nodeElement.attr('data-math-labels') || '[]'),
        getMathJaxTags().allLabels,
      );
      this.stopEditing(documentNode.cid, false, true);
      if (File.option.autoNumberingForMath && !File.inBusyMode) {
        var element = nodeElement.next();
        setTimeout(async () => {
          if (element.length && element.closest('body')) {
            if (await receiver.renderAfter(element[0])) {
              await receiver.editor.mathInline.renderAll(true, void 0, true);
            }
          } else {
            receiver.forceRefreshSoon();
          }
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
              if (element) {
                this.currentCm = void 0;
                blockElement
                  .html(html.replace('{type}', jquery.localize.getString('Math', 'Menu')))
                  .removeClass('md-rawblock-on-edit');
                element.setAttribute('class', 'md-rawblock-container md-math-container');
                element.setAttribute('tabindex', '-1');
                blockElement[0].appendChild(element);
                await this.renderUnder(blockElement[0], true);
                if (moveToNextBlock) {
                  currentEditor.selection.jumpToNextBlock(documentNode, editCommand);
                }
                if (!skipHistory) {
                  currentEditor.undo.register(editCommand);
                }
              }
            } else {
              this.currentCm = void 0;
            }
          }
        } else {
          this.currentCm = void 0;
        }
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
        if (isMathJaxReady()) {
          restoreMathTags(element);
          var keys = Object.keys(getMathJaxTags().allLabels),
            currentElement = element.querySelector('.CodeMirror');
          if (currentElement && (currentElement = currentElement.CodeMirror)) {
            var localElement = element.querySelector('.md-fences-adv-panel-preview');
            if (localElement) {
              var texSource = currentElement.getValue() || '<Empty \\space Math \\space Block>',
                renderMetrics = MathJax.getMetricsFor(localElement, true);
              var __marklyraRenderTicket =
                typeof globalThis.__MARKLYRA_RENDER_TICKET__ === 'function'
                  ? globalThis.__MARKLYRA_RENDER_TICKET__(localElement, currentElement)
                  : null;
              try {
                let renderedSvg = await MathJax.tex2svgPromise(texSource, renderMetrics);
                if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) {
                  return;
                }
                if (
                  renderedSvg.querySelector("[data-mml-node='merror']") &&
                  localElement.children.length
                ) {
                  if (localElement.children[1]) {
                    localElement.children[1].remove();
                  }
                  renderedSvg.style.marginTop = '8px';
                  localElement.appendChild(renderedSvg);
                } else {
                  localElement.innerHTML = '';
                  localElement.appendChild(renderedSvg);
                }
              } catch (error) {
                if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) {
                  return;
                }
              }
              storeMathTags(element);
              var currentKeys = Object.keys(getMathJaxTags().allLabels);
              element.dataset.mathLabels = JSON.stringify(collectAddedLabels(keys, currentKeys));
              if (needsRefresh()) {
                element.dataset.needRefresh = true;
              }
            }
          }
        }
      })(blockElement).then(() => {
        if (File.option.autoNumberingForMath && !File.inBusyMode) {
          this.renderAfter(blockElement);
        }
      });
    }
    prepareStartEditing() {
      var previousLabels,
        mathTagBefore = null,
        counterChanged = false;
      return {
        isNeedRefresh: () => counterChanged,
        retrieveMathTag: function (blockElement) {
          if (!mathTagBefore) {
            if (blockElement.hasAttribute('data-math-tag-before')) {
              mathTagBefore = blockElement.dataset.mathTagBefore;
              previousLabels = JSON.parse(blockElement.dataset.mathLabels || '[]');
            } else {
              mathTagBefore = getPrecedingTagCounter(blockElement);
            }
          }
          if (mathTagBefore) {
            resetMathTags(mathTagBefore);
            blockElement.dataset.mathTagBefore = mathTagBefore;
          } else {
            blockElement.dataset.mathTagBefore = getMathJaxTags().counter;
          }
          removeMathLabels(
            JSON.parse(blockElement.dataset.mathLabels || '[]'),
            getMathJaxTags().allLabels,
          );
        },
        storeMathTag: function (blockElement) {
          var counter = getMathJaxTags().counter;
          if (
            blockElement.dataset.mathTagAfter &&
            blockElement.dataset.mathTagAfter - 0 != counter
          ) {
            blockElement.dataset.mathTagAfter = counter;
            counterChanged = true;
          }
          if (JSON.stringify(previousLabels) != blockElement.dataset.mathLabels) {
            counterChanged = true;
          }
        },
      };
    }
    async startEditing(nodeOrElement, cursorPlacement) {
      Object.defineProperty(renderPreviewElement, 'name', { value: 'C', configurable: true });

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
        if (jquery(document.activeElement).closest('.md-math-block').length) {
          scrollHeight = element.scrollHeight - element.scrollTop - element.clientHeight;
        }
        var currentCm,
          {
            isNeedRefresh: needsRefresh,
            retrieveMathTag: restoreMathTags,
            storeMathTag: storeMathTags,
          } = this.prepareStartEditing(),
          timerId = null;
        if (nodeId) {
          if (this.currentCm && this.currentCm.cid === nodeId) {
            if (currentEditor.writingArea.contains(this.currentCm.getWrapperElement())) {
              this.currentCm.focus();
              return this.currentCm;
            }
            this.currentCm = null;
          }
          if (this.currentCm) {
            await this.stopEditing(this.currentCm.cid);
            window.getSelection().removeAllRanges();
          }
          blockElement
            .html(
              html.replace('{type}', jquery.localize.getString('Math', 'Menu')) +
                document.querySelector('#md-mathblock-panel-templ').textContent,
            )
            .addClass('md-rawblock-on-edit');
          if (documentNode.get('tagBefore')) {
            blockElement
              .find('.md-rawblock-before .marklyra-input')
              .text(documentNode.get('tagBefore'));
          }
          if (documentNode.get('tagAfter')) {
            blockElement
              .find('.md-rawblock-after .marklyra-input')
              .text(documentNode.get('tagAfter'));
          }
          if (documentNode.get('legacyMath')) {
            blockElement.find('.md-rawblock-before').text('\\[');
            blockElement.find('.md-rawblock-after').text('\\]');
          }
          var editingPanel = blockElement.children('.md-mathblock-panel');
          if (!editingPanel.length) {
            return;
          }
          this.currentCm = (function (editor) {
            var codeMirror = CodeMirror(
              editingPanel[0].querySelector('.md-rawblock-input'),
              {
                styleSelectedText: true,
                styleActiveLine: true,
                lineWrapping: !File.option.noLineWrapping,
                mode: 'stex',
                placeholder: jquery.localize.getString('Input Math TeX here'),
                theme: ' inner null-scroll',
                autoCloseBrackets: !File.option.noPairingMatch,
                autoCloseTags: !File.option.noPairingMatch,
                value: documentNode.get('text').trim(),
                lineNumbers: File.option.showLineNumbersForFence,
                resetSelectionOnContextMenu: true,
                dragDrop: false,
                indentUnit: File.option.codeIndentSize,
                tabSize: File.option.codeIndentSize,
                lineWiseCopyCut: File.option.lineWiseCopyCut,
              },
              editor,
              nodeId,
            );
            codeMirror.on('changes', function (changedEditor, changes) {
              var refreshElement;
              editor.fences.handleUserReplacement(changedEditor, changes);
              editor.wordCount.quickUpdate(codeMirror.cid);
              refreshElement = blockElement[0];
              if (timerId) {
                clearTimeout(timerId);
              }
              timerId = setTimeout(async () => {
                await renderPreviewElement(refreshElement);
                timerId = null;
              }, 100);
              editor.selection.clearGlobalColumn();
              editor.syncChange([
                { type: 'sync', id: documentNode.id, tex: codeMirror.getValue() },
              ]);
              if (File.isTypeWriterMode && !File.option.scrollWithCursor) {
                editor.selection.typeWriterScroll(codeMirror.cursorCoords(codeMirror.getCursor()));
              }
            });
            codeMirror.on('cursorActivity', function () {
              editor.fences.handleCursorActivity(codeMirror);
            });
            codeMirror.on('blur', function (codeMirror) {
              setTimeout(function () {
                if (document.body.contains(codeMirror.getWrapperElement())) {
                  documentNode.set('text', codeMirror.getValue());
                }
              }, 0);
            });
            codeMirror.on('keydown', function (codeMirror, event) {
              editor.fences.onKeyDown(
                codeMirror,
                event,
                editor,
                function (codeMirror) {
                  if (!codeMirror.getValue().length) {
                    editor.mathBlock.remove(codeMirror.cid);
                    event.preventDefault();
                    return event.codemirrorIgnore;
                  }
                },
                function (codeMirror, keyboardEvent) {
                  if (keyboardEvent.shiftKey) {
                    keyboardEvent.stopPropagation();
                    return true;
                  } else {
                    if (
                      (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
                      (function (codeMirror) {
                        var cursorPosition = codeMirror.doc.getCursor();
                        return (
                          !cursorPosition ||
                          codeMirror.doc.indexFromPos(cursorPosition) >=
                            codeMirror.doc.getValue().length
                        );
                      })(codeMirror)
                    ) {
                      setTimeout(function () {
                        editor.UserOp.insertParagraph();
                      }, 20);
                      keyboardEvent.stopPropagation();
                      return true;
                    } else {
                      return void 0;
                    }
                  }
                },
              );
            });
            codeMirror.focus();
            return codeMirror;
          })(this.editor);
          renderPreviewElement(blockElement[0]).then(() => {
            if (File.option.autoNumberingForMath && !File.inBusyMode) {
              this.renderAfter(blockElement[0]);
            }
          });
          (currentCm = this.currentCm).focus();
          if (cursorPlacement) {
            if ('<Empty \\space Math \\space Block>' == currentCm.getValue()) {
              currentCm.execCommand('selectAll');
            } else {
              if ('end' == cursorPlacement || 'auto' == cursorPlacement) {
                currentCm.execCommand('goDocEnd');
              } else {
                if ('start' == cursorPlacement) {
                  currentCm.execCommand('goDocStart');
                }
              }
            }
            currentEditor.refocus(nodeId);
            if (null === scrollHeight || scrollHeight > 100) {
              currentEditor.selection.scrollAdjust();
            } else {
              element.scrollTop = element.scrollHeight - scrollHeight - element.clientHeight;
            }
          }
        }
        return this.currentCm;
      }
      async function renderPreviewElement(inputElement) {
        if (isMathJaxReady()) {
          restoreMathTags(inputElement);
          var keys = Object.keys(getMathJaxTags().allLabels),
            currentElement = inputElement.querySelector('.CodeMirror');
          if (currentElement && (currentElement = currentElement.CodeMirror)) {
            var localElement = inputElement.querySelector('.md-mathjax-preview');
            if (localElement) {
              var texSource = currentElement.getValue() || '<Empty \\space Math \\space Block>',
                renderMetrics = MathJax.getMetricsFor(localElement, true);
              var __marklyraRenderTicket =
                typeof globalThis.__MARKLYRA_RENDER_TICKET__ === 'function'
                  ? globalThis.__MARKLYRA_RENDER_TICKET__(localElement, currentElement)
                  : null;
              try {
                let renderedSvg = await MathJax.tex2svgPromise(texSource, renderMetrics);
                if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) {
                  return;
                }
                if (
                  renderedSvg.querySelector("[data-mml-node='merror']") &&
                  localElement.children.length
                ) {
                  if (localElement.children[1]) {
                    localElement.children[1].remove();
                  }
                  renderedSvg.style.marginTop = '8px';
                  localElement.appendChild(renderedSvg);
                } else {
                  localElement.innerHTML = '';
                  localElement.appendChild(renderedSvg);
                }
              } catch (error) {
                if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) {
                  return;
                }
              }
              storeMathTags(inputElement);
              var currentKeys = Object.keys(getMathJaxTags().allLabels);
              inputElement.dataset.mathLabels = JSON.stringify(
                collectAddedLabels(keys, currentKeys),
              );
              if (needsRefresh()) {
                inputElement.dataset.needRefresh = true;
              }
            }
          }
        }
      }
    }
    copyAsTex(targetElement) {
      var nodeId = (targetElement || document.activeElement || document.body).getAttribute('cid'),
        texSource = '';
      if (nodeId) {
        texSource = this.editor.getNode(nodeId).get('text').trim();
      }
      console.debug(texSource);
      this.editor.UserOp.setClipboard(null, null, texSource, true);
    }
    copyAsMathML(targetElement, plainTextOnly) {
      var texSource = '',
        currentEditor = this.editor,
        nodeId =
          (targetElement || document.activeElement || document.body).getAttribute('cid') ||
          currentEditor.focusCid;
      if (nodeId) {
        texSource = currentEditor.getNode(nodeId).get('text');
        if (!File.option.noDisplayLinesInMath) {
          texSource = '\\u32E' + texSource;
        }
      }
      var mathMl = MathJax.tex2mml(texSource, { display: true });
      console.debug(mathMl);
      if (plainTextOnly) {
        currentEditor.UserOp.nativeCopyText(mathMl);
      } else {
        var clipboardHtml =
          "<pre class='md-fences' lang='xml'>" + utilities.escape(mathMl) + '</pre>';
        currentEditor.UserOp.setClipboard(clipboardHtml, null, mathMl, true);
      }
    }
    copyAsImage(element) {
      var currentElement = (
          (element && element.querySelector) ||
          document.activeElement
        ).querySelector('svg'),
        currentEditor = this.editor,
        imageHtml = mediaActions.SVG2HtmlImg(currentElement);
      currentEditor.UserOp.setClipboard(imageHtml, null, imageHtml, true);
    }
    forceRefreshSoon() {
      if (this.forceRefreshTimer_) {
        clearTimeout(this.forceRefreshTimer_);
        this.forceRefreshTimer_ = null;
      }
      var receiver = this;
      this.forceRefreshTimer_ = setTimeout(function () {
        receiver.forceRefresh();
        receiver.forceRefreshTimer_ = null;
      }, 10);
    }
    cleanUpAMS() {
      if (window.MathJax && MathJax.texReset) {
        MathJax.texReset(0);
      }
    }
    async forceRefresh() {
      if (!(this.editor.sourceView && this.editor.sourceView.inSourceMode)) {
        if (isMathJaxReady()) {
          console.debug('refresh all mathjax');
          await initializeMathRenderHooks();
          this.editor.brush.clearAndPause();
          this.cleanUpAMS();
          await this.renderUnder(document, true);
          if (File.option.enableInlineMath) {
            await File.editor.mathInline.renderAll(true);
          }
          this.editor.brush.resume();
        } else {
          setTimeout(this.forceRefresh.bind(this), 500);
        }
      }
    }
  }
  Object.defineProperty(MathBlockController, 'name', { value: 'T', configurable: true });
  MathBlockController.isMathType = function (language) {
    return (
      File.option.gitlabMath &&
      'string' == typeof language &&
      DocumentNode.isType((language || '').toLowerCase(), 'math')
    );
  };
  moduleRecord.exports = MathBlockController;
}
