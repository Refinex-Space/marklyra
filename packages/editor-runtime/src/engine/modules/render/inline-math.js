// render/inline-math.
export default function initializeRenderInlineMath(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery'),
    keyboardShortcuts =
      (requireModule('model/document-model').Node,
      requireModule('editing/undo-manager'),
      requireModule('editing/keyboard-shortcuts')),
    dialogs = requireModule('ui/dialogs'),
    mediaActions = requireModule('media/actions'),
    utilities = (keyboardShortcuts.map, requireModule('shared/utilities'));
  requireModule('libraries/rangy');
  window.svgCache = {};
  var timerId,
    previewTarget,
    intersectionObserver = null,
    renderInlineMath = Object.defineProperty(
      async function (domNode) {
        if (domNode) {
          var text = domNode.querySelector('script').textContent.replace(/\u200B+/g, ''),
            renderedSvg = '';
          try {
            renderedSvg = await MathJax.tex2svgPromise(text, { display: false });
          } catch (error) {
            return void window.Reporter.error('MathJax Error', {
              level: 'warning',
              extra: { text: text, stack: error.stack },
            });
          }
          var element = domNode.querySelector('mjx-container');
          if (element) {
            element.remove();
          }
          domNode.prepend(renderedSvg);
          var parentElement = domNode.parentElement;
          if (parentElement && !parentElement.classList.contains('math-jax-postprocess')) {
            parentElement.classList.add('math-jax-postprocess');
            parentElement.classList.remove('math-jax-preprocess');
            var clonedNode = domNode.cloneNode(true);
            if (
              ((clonedNode.querySelector('script') || {}).textContent || '').replace(
                /\u200B+/g,
                '',
              ) === text
            ) {
              svgCache[text.trim()] = mediaActions.processExportedSVG(clonedNode.innerHTML, true);
            }
          }
        }
      },
      'name',
      { value: 'u', configurable: true },
    ),
    scheduleBusyModeCheck = Object.defineProperty(
      function () {
        if (timerId) {
          clearTimeout(timerId);
        }
        timerId = setTimeout(function () {
          File.editor.tryEnterBusyMode();
          timerId = null;
        }, 100);
      },
      'name',
      { value: 'h', configurable: true },
    ),
    renderInlineMathBatch = Object.defineProperty(
      async function (editor, items, activeBookmark, lazyRender) {
        if (!items.length) {
          return false;
        }
        if (!((lazyRender = lazyRender && !!window.IntersectionObserver) || activeBookmark)) {
          editor.brush.pause();
        }
        var isLargeBatch = items.length > 60;
        if (lazyRender) {
          var receiver = this;
          if (intersectionObserver) {
            intersectionObserver.disconnect();
          }
          intersectionObserver = new IntersectionObserver(function (inputItems) {
            inputItems.forEach(async function (item) {
              if (!(item.intersectionRatio <= 0)) {
                await renderInlineMath.call(receiver, item.target);
                if (intersectionObserver) {
                  intersectionObserver.unobserve(item.target);
                }
                if (isLargeBatch) {
                  scheduleBusyModeCheck();
                }
              }
            });
          });
          items.forEach(function (item) {
            intersectionObserver.observe(item);
          });
        } else {
          await Promise.all(
            Array.from(items).map((item) =>
              this.isUnderPreview(item)
                ? Promise.resolve()
                : renderInlineMath.call(this, item, activeBookmark),
            ),
          );
          if (isLargeBatch) {
            scheduleBusyModeCheck();
          }
        }
        if (!(lazyRender || activeBookmark)) {
          editor.brush.resume();
        }
        return true;
      },
      'name',
      { value: 'p', configurable: true },
    ),
    bindPreviewEvents = Object.defineProperty(
      function () {
        var editor = this.editor;
        jquery(this.editor.sessionStr)
          .on('cursorChange', function (unusedParameter1, selectionState) {
            if (selectionState) {
              var element,
                range = selectionState.cursor || editor.selection.getRangy();
              if (!range) {
                return hideInlineMathPreview(editor);
              }
              if (
                (element = jquery(range.commonAncestorContainer).closest(
                  '.md-inline-math.md-expand',
                )).find('script').length
              ) {
                if (previewTarget != element[0]) {
                  hideInlineMathPreview(editor);
                  showInlineMathPreview(editor, element);
                }
              } else {
                hideInlineMathPreview(editor);
              }
            }
          })
          .on('mousedown', '.md-inline-math mjx-container', function (unusedParameter1) {
            hideInlineMathPreview(editor);
            jquery('.md-expand').removeClass('md-expand');
            if (!File.isLocked) {
              var element = jquery(this).closest('.md-inline-math'),
                elements = element.addClass('md-expand').find('script');
              editor.selection.selectAllElem(elements);
              showInlineMathPreview(editor, element);
            }
          });
      },
      'name',
      { value: 'f', configurable: true },
    ),
    previewChangeHandler = null,
    previewCache = {},
    showInlineMathPreview = Object.defineProperty(
      async function (editor, inputElement) {
        Object.defineProperty(renderPreviewMath, 'name', { value: 's', configurable: true });

        previewTarget = inputElement[0];
        var previewPanel = jquery('#math-inline-preview'),
          element = document.querySelector('#math-inline-preview-content'),
          trimmedText = inputElement.find('script').text().trim();
        async function renderPreviewMath(text, synchronous) {
          if (MathJax.tex2svg) {
            element.dataset.text = text;
            if (previewCache[text] || svgCache[text]) {
              element.innerHTML = previewCache[text] || svgCache[text];
              if (!element.querySelector('rect') && !previewCache[text]) {
                return;
              }
              previewCache[text] = previewCache[text] || svgCache[text];
            }
            try {
              var renderedSvg = synchronous
                ? MathJax.tex2svg(text, { display: false })
                : await MathJax.tex2svgPromise(text, { display: false });
              element.innerHTML = '';
              element.appendChild(renderedSvg);
            } catch (error) {
              window.Reporter.error('MathJax Error', {
                level: 'warning',
                extra: { text: text, stack: error.stack },
              });
            }
          }
        }
        previewChangeHandler = Object.defineProperty(
          async function () {
            var expandedMath = jquery('.md-inline-math.md-expand'),
              elements = expandedMath.find('script'),
              texSource = elements.text().replace(/\u200B+/g, ''),
              changeHandler = previewChangeHandler;
            if (!elements.height()) {
              return jquery(editor.sessionStr).off('inline-math-changed', changeHandler);
            }
            if (!svgCache[texSource]) {
              await renderPreviewMath(texSource);
              dialogs.fixPopoverPosition(elements, previewPanel);
              expandedMath
                .find('mjx-container')
                .replaceWith(previewPanel.find('mjx-container').clone());
            }
          },
          'name',
          { value: 'm', configurable: true },
        );
        var previewChanged = false;
        if (
          inputElement.hasClass('math-jax-postprocess') &&
          (element.dataset.text || '').replace(/[\s\u200b]/g, '') !=
            trimmedText.replace(/[\s\u200b]/g, '')
        ) {
          previewChanged = true;
        }
        if (previewChanged || 'none' === previewPanel[0].style.display) {
          jquery(editor.sessionStr).off('inline-math-changed');
          jquery(editor.sessionStr).on('inline-math-changed', previewChangeHandler);
          await renderPreviewMath(trimmedText, true);
          delete svgCache[trimmedText];
          previewPanel.show();
          dialogs.fixPopoverPosition(inputElement.find('script'), previewPanel);
        }
      },
      'name',
      { value: 'v', configurable: true },
    ),
    hideInlineMathPreview = Object.defineProperty(
      function (editor) {
        previewTarget = null;
        var previewPanel = jquery('#math-inline-preview');
        if ('none' !== previewPanel[0].style.display) {
          previewPanel.hide();
        }
        if (previewChangeHandler) {
          jquery(editor.sessionStr).off('inline-math-changed', previewChangeHandler);
          previewChangeHandler = null;
        }
      },
      'name',
      { value: 'y', configurable: true },
    ),
    getSelectedInlineMath = Object.defineProperty(
      function () {
        var range = this.editor.selection.getRangy();
        return jquery(range.commonAncestorContainer).closest('.md-inline-math');
      },
      'name',
      { value: 'b', configurable: true },
    );
  moduleRecord.exports = class {
    constructor(editor) {
      this.editor = editor;
      this.queue = {};
      bindPreviewEvents.call(this);
    }
    isUnderPreview(mathElement) {
      return previewTarget == mathElement;
    }
    async brush(element, selectionBookmark, preserveSelection) {
      var elements = element.querySelectorAll('.math-jax-preprocess .md-inline-math-container');
      await renderInlineMathBatch.call(
        this,
        this.editor,
        elements,
        preserveSelection &&
          selectionBookmark &&
          element.getAttribute('cid') === selectionBookmark.startId
          ? selectionBookmark
          : null,
      );
      return elements.length;
    }
    showAutoSuggest(selectionRange) {
      if (File.option.enableInlineMath) {
        jquery('.md-math-prep').removeClass('md-math-prep');
        dialogs.markRange(selectionRange, 'md-math-prep');
        var previewPanel = jquery('#math-inline-preview')
          .show()
          .addClass('md-math-inline-prep-preview')
          .css('width', 'auto');
        previewPanel.find('#math-inline-preview-content').text('<Empty Inline Math>');
        dialogs.fixPopoverPosition(jquery('.md-math-prep'), previewPanel);
      }
    }
    onLeaveDocument() {
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }
      try {
        MathJax.texReset(0);
      } catch (error) {}
    }
    async renderAll(forceRender, rootElement, refreshReferences, disableLazyRender) {
      Object.defineProperty(clearRenderedMath, 'name', { value: 'o', configurable: true });

      if (File.option.enableInlineMath) {
        var mathElements = [];
        if (refreshReferences) {
          mathElements = Array.from(document.querySelectorAll('.md-inline-math-container')).filter(
            (domNode) => {
              if (domNode.parentElement.classList.contains('math-jax-preprocess')) {
                return true;
              }
              var innerText = domNode.querySelector('script').innerText;
              if (/\\(label|(eq)?ref)\{/.exec(innerText)) {
                delete window.svgCache[innerText];
                clearRenderedMath(domNode);
                return true;
              } else {
                return void 0;
              }
            },
          );
        } else {
          if (forceRender) {
            window.svgCache = {};
            (mathElements = document.querySelectorAll('.md-inline-math-container')).forEach(
              clearRenderedMath,
            );
          } else {
            mathElements = (rootElement || document).querySelectorAll(
              '.math-jax-preprocess .md-inline-math-container',
            );
          }
        }
        if (mathElements.length) {
          await renderInlineMathBatch.call(
            this,
            this.editor,
            mathElements,
            void 0,
            ((File.inBusyMode && !rootElement) || mathElements.length > 1e3) &&
              !forceRender &&
              !disableLazyRender,
          );
          this.renderInToc();
        }
      }
      function clearRenderedMath(domNode) {
        try {
          domNode.querySelector('mjx-container').remove();
        } catch (error) {}
        domNode.parentElement.classList.add('math-jax-preprocess');
        domNode.parentElement.classList.remove('math-jax-postprocess');
      }
    }
    renderInToc() {
      if (File.option.enableInlineMath && this.editor.mathBlock.isMathJaxReady()) {
        document.querySelectorAll('.math-in-toc').forEach(async function (item) {
          try {
            if (item.children[0] && item.children[0].tagName == 'mjx-container'.toUpperCase()) {
              return;
            }
            var trimmedText = item.textContent.replace(/(^\$+)|(\$+$)|\u200B/g, '').trim(),
              html = svgCache[trimmedText];
            if (html) {
              item.innerHTML = html;
            } else {
              var renderedSvg = await MathJax.tex2svgPromise(trimmedText, { display: false });
              item.innerHTML = '';
              item.appendChild(renderedSvg);
            }
          } catch (error) {
            window.Reporter.captureException(error, { level: 'warning' });
          }
        }, this);
      }
    }
    tryCloseInlinePreview() {
      hideInlineMathPreview(this.editor);
    }
    copyAsTex() {
      var element = getSelectedInlineMath.call(this),
        mathDelimiter = element.attr('pattern'),
        texSource = element
          .text()
          .replace('$$' == mathDelimiter ? /(^\$\$)|(\$\$$)/g : /(^\$)|(\$$)/g, '');
      console.debug(texSource);
      this.editor.UserOp.setClipboard(null, null, texSource, true);
    }
    copyAsMathML(plainTextOnly) {
      var previewContent = jquery('#math-inline-preview-content')[0];
      if (previewContent) {
        var text = previewContent.dataset.text,
          editor = this.editor,
          mathMl = MathJax.tex2mml(text, { display: false });
        console.debug(mathMl);
        if (plainTextOnly) {
          editor.UserOp.nativeCopyText(mathMl);
        } else {
          var clipboardHtml =
            "<pre class='md-fences' lang='xml'>" + utilities.escape(mathMl) + '</pre>';
          editor.UserOp.setClipboard(clipboardHtml, null, mathMl, true);
        }
      }
    }
    copyAsImage() {
      var element = document.querySelector('#math-inline-preview-content svg'),
        editor = this.editor,
        imageHtml = mediaActions.SVG2HtmlImg(element);
      editor.UserOp.setClipboard(imageHtml, null, imageHtml, true);
    }
  };
}
