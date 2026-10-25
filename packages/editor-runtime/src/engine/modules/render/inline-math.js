// render/inline-math.
// SystemJS module 28. Dependencies: e, 13, 1b, 27, 29, 2a, 11, 1d.
$__System.registerDynamic(
  '28',
  ['e', '13', '1b', '27', '29', '2a', '11', '1d'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var jquery = requireModule('e'),
      keyboardShortcuts = (requireModule('13').Node, requireModule('1b'), requireModule('27')),
      dialogs = requireModule('29'),
      mediaActions = requireModule('2a'),
      utilities = (keyboardShortcuts.map, requireModule('11'));
    requireModule('1d');
    window.svgCache = {};
    var timerId,
      previewTarget,
      intersectionObserver = null,
      u = async function (domNode) {
        if (domNode) {
          var text = domNode.querySelector('script').textContent.replace(/\u200B+/g, ''),
            renderedSvg = '';
          try {
            renderedSvg = await MathJax.tex2svgPromise(text, { display: !1 });
          } catch (error) {
            return void window.Reporter.error('MathJax Error', {
              level: 'warning',
              extra: { text: text, stack: error.stack },
            });
          }
          var element = domNode.querySelector('mjx-container');
          element && element.remove(), domNode.prepend(renderedSvg);
          var parentElement = domNode.parentElement;
          if (parentElement && !parentElement.classList.contains('math-jax-postprocess')) {
            parentElement.classList.add('math-jax-postprocess'),
              parentElement.classList.remove('math-jax-preprocess');
            var clonedNode = domNode.cloneNode(!0);
            ((clonedNode.querySelector('script') || {}).textContent || '').replace(
              /\u200B+/g,
              '',
            ) === text &&
              (svgCache[text.trim()] = mediaActions.processExportedSVG(clonedNode.innerHTML, !0));
          }
        }
      },
      h = function () {
        timerId && clearTimeout(timerId),
          (timerId = setTimeout(function () {
            File.editor.tryEnterBusyMode(), (timerId = null);
          }, 100));
      },
      p = async function (editor, items, activeBookmark, lazyRender) {
        if (!items.length) return !1;
        (lazyRender = lazyRender && !!window.IntersectionObserver) ||
          activeBookmark ||
          editor.brush.pause();
        var isLargeBatch = items.length > 60;
        if (lazyRender) {
          var receiver = this;
          intersectionObserver && intersectionObserver.disconnect(),
            (intersectionObserver = new IntersectionObserver(function (inputItems) {
              inputItems.forEach(async function (item) {
                item.intersectionRatio <= 0 ||
                  (await u.call(receiver, item.target),
                  intersectionObserver && intersectionObserver.unobserve(item.target),
                  isLargeBatch && h());
              });
            })),
            items.forEach(function (item) {
              intersectionObserver.observe(item);
            });
        } else
          await Promise.all(
            Array.from(items).map((item) =>
              this.isUnderPreview(item) ? Promise.resolve() : u.call(this, item, activeBookmark),
            ),
          ),
            isLargeBatch && h();
        return lazyRender || activeBookmark || editor.brush.resume(), !0;
      },
      f = function () {
        var editor = this.editor;
        jquery(this.editor.sessionStr)
          .on('cursorChange', function (unusedParameter1, selectionState) {
            if (selectionState) {
              var element,
                range = selectionState.cursor || editor.selection.getRangy();
              if (!range) return y(editor);
              (element = jquery(range.commonAncestorContainer).closest(
                '.md-inline-math.md-expand',
              )).find('script').length
                ? previewTarget != element[0] && (y(editor), v(editor, element))
                : y(editor);
            }
          })
          .on('mousedown', '.md-inline-math mjx-container', function (unusedParameter1) {
            if ((y(editor), jquery('.md-expand').removeClass('md-expand'), !File.isLocked)) {
              var element = jquery(this).closest('.md-inline-math'),
                elements = element.addClass('md-expand').find('script');
              editor.selection.selectAllElem(elements), v(editor, element);
            }
          });
      },
      m = null,
      previewCache = {},
      v = async function (editor, inputElement) {
        previewTarget = inputElement[0];
        var previewPanel = jquery('#math-inline-preview'),
          element = document.querySelector('#math-inline-preview-content'),
          trimmedText = inputElement.find('script').text().trim();
        async function s(text, synchronous) {
          if (MathJax.tex2svg) {
            if (((element.dataset.text = text), previewCache[text] || svgCache[text])) {
              if (
                ((element.innerHTML = previewCache[text] || svgCache[text]),
                !element.querySelector('rect') && !previewCache[text])
              )
                return;
              previewCache[text] = previewCache[text] || svgCache[text];
            }
            try {
              var renderedSvg = synchronous
                ? MathJax.tex2svg(text, { display: !1 })
                : await MathJax.tex2svgPromise(text, { display: !1 });
              (element.innerHTML = ''), element.appendChild(renderedSvg);
            } catch (error) {
              window.Reporter.error('MathJax Error', {
                level: 'warning',
                extra: { text: text, stack: error.stack },
              });
            }
          }
        }
        m = async function () {
          var expandedMath = jquery('.md-inline-math.md-expand'),
            elements = expandedMath.find('script'),
            texSource = elements.text().replace(/\u200B+/g, ''),
            changeHandler = m;
          if (!elements.height())
            return jquery(editor.sessionStr).off('inline-math-changed', changeHandler);
          svgCache[texSource] ||
            (await s(texSource),
            dialogs.fixPopoverPosition(elements, previewPanel),
            expandedMath
              .find('mjx-container')
              .replaceWith(previewPanel.find('mjx-container').clone()));
        };
        var previewChanged = !1;
        inputElement.hasClass('math-jax-postprocess') &&
          (element.dataset.text || '').replace(/[\s\u200b]/g, '') !=
            trimmedText.replace(/[\s\u200b]/g, '') &&
          (previewChanged = !0),
          (previewChanged || 'none' === previewPanel[0].style.display) &&
            (jquery(editor.sessionStr).off('inline-math-changed'),
            jquery(editor.sessionStr).on('inline-math-changed', m),
            await s(trimmedText, !0),
            delete svgCache[trimmedText],
            previewPanel.show(),
            dialogs.fixPopoverPosition(inputElement.find('script'), previewPanel));
      },
      y = function (editor) {
        previewTarget = null;
        var previewPanel = jquery('#math-inline-preview');
        'none' !== previewPanel[0].style.display && previewPanel.hide(),
          m && (jquery(editor.sessionStr).off('inline-math-changed', m), (m = null));
      },
      b = function () {
        var range = this.editor.selection.getRangy();
        return jquery(range.commonAncestorContainer).closest('.md-inline-math');
      };
    moduleRecord.exports = class {
      constructor(editor) {
        (this.editor = editor), (this.queue = {}), f.call(this);
      }
      isUnderPreview(mathElement) {
        return previewTarget == mathElement;
      }
      async brush(element, selectionBookmark, preserveSelection) {
        var elements = element.querySelectorAll('.math-jax-preprocess .md-inline-math-container');
        return (
          await p.call(
            this,
            this.editor,
            elements,
            preserveSelection &&
              selectionBookmark &&
              element.getAttribute('cid') === selectionBookmark.startId
              ? selectionBookmark
              : null,
          ),
          elements.length
        );
      }
      showAutoSuggest(selectionRange) {
        if (File.option.enableInlineMath) {
          jquery('.md-math-prep').removeClass('md-math-prep'),
            dialogs.markRange(selectionRange, 'md-math-prep');
          var previewPanel = jquery('#math-inline-preview')
            .show()
            .addClass('md-math-inline-prep-preview')
            .css('width', 'auto');
          previewPanel.find('#math-inline-preview-content').text('<Empty Inline Math>'),
            dialogs.fixPopoverPosition(jquery('.md-math-prep'), previewPanel);
        }
      }
      onLeaveDocument() {
        intersectionObserver && intersectionObserver.disconnect();
        try {
          MathJax.texReset(0);
        } catch (error) {}
      }
      async renderAll(forceRender, rootElement, refreshReferences, disableLazyRender) {
        if (File.option.enableInlineMath) {
          var mathElements = [];
          refreshReferences
            ? (mathElements = Array.from(
                document.querySelectorAll('.md-inline-math-container'),
              ).filter((domNode) => {
                if (domNode.parentElement.classList.contains('math-jax-preprocess')) return !0;
                var innerText = domNode.querySelector('script').innerText;
                return /\\(label|(eq)?ref)\{/.exec(innerText)
                  ? (delete window.svgCache[innerText], o(domNode), !0)
                  : void 0;
              }))
            : forceRender
              ? ((window.svgCache = {}),
                (mathElements = document.querySelectorAll('.md-inline-math-container')).forEach(o))
              : (mathElements = (rootElement || document).querySelectorAll(
                  '.math-jax-preprocess .md-inline-math-container',
                )),
            mathElements.length &&
              (await p.call(
                this,
                this.editor,
                mathElements,
                void 0,
                ((File.inBusyMode && !rootElement) || mathElements.length > 1e3) &&
                  !forceRender &&
                  !disableLazyRender,
              ),
              this.renderInToc());
        }
        function o(domNode) {
          try {
            domNode.querySelector('mjx-container').remove();
          } catch (error) {}
          domNode.parentElement.classList.add('math-jax-preprocess'),
            domNode.parentElement.classList.remove('math-jax-postprocess');
        }
      }
      renderInToc() {
        File.option.enableInlineMath &&
          this.editor.mathBlock.isMathJaxReady() &&
          document.querySelectorAll('.math-in-toc').forEach(async function (item) {
            try {
              if (item.children[0] && item.children[0].tagName == 'mjx-container'.toUpperCase())
                return;
              var trimmedText = item.textContent.replace(/(^\$+)|(\$+$)|\u200B/g, '').trim(),
                html = svgCache[trimmedText];
              if (html) item.innerHTML = html;
              else {
                var renderedSvg = await MathJax.tex2svgPromise(trimmedText, { display: !1 });
                (item.innerHTML = ''), item.appendChild(renderedSvg);
              }
            } catch (error) {
              window.Reporter.captureException(error, { level: 'warning' });
            }
          }, this);
      }
      tryCloseInlinePreview() {
        y(this.editor);
      }
      copyAsTex() {
        var element = b.call(this),
          mathDelimiter = element.attr('pattern'),
          texSource = element
            .text()
            .replace('$$' == mathDelimiter ? /(^\$\$)|(\$\$$)/g : /(^\$)|(\$$)/g, '');
        console.debug(texSource), this.editor.UserOp.setClipboard(null, null, texSource, !0);
      }
      copyAsMathML(plainTextOnly) {
        var previewContent = jquery('#math-inline-preview-content')[0];
        if (previewContent) {
          var text = previewContent.dataset.text,
            editor = this.editor,
            mathMl = MathJax.tex2mml(text, { display: !1 });
          if ((console.debug(mathMl), plainTextOnly)) editor.UserOp.nativeCopyText(mathMl);
          else {
            var clipboardHtml =
              "<pre class='md-fences' lang='xml'>" + utilities.escape(mathMl) + '</pre>';
            editor.UserOp.setClipboard(clipboardHtml, null, mathMl, !0);
          }
        }
      }
      copyAsImage() {
        var element = document.querySelector('#math-inline-preview-content svg'),
          editor = this.editor,
          imageHtml = mediaActions.SVG2HtmlImg(element);
        editor.UserOp.setClipboard(imageHtml, null, imageHtml, !0);
      }
    };
  },
);
