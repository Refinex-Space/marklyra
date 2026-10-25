// render/diagrams.
// SystemJS module 15. Dependencies: 20, 11, e, 13, 1c.
$__System.registerDynamic(
  '15',
  ['20', '11', 'e', '13', '1c'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var mermaidParseError,
      activeMermaidOptions,
      currentSearchValue,
      CodeMirror = requireModule('20'),
      jquery = (requireModule('11'), requireModule('e')),
      documentModel = requireModule('13'),
      mathBlocks = (documentModel.TYPE, requireModule('1c')),
      DocumentNode = documentModel.Node,
      diagramRenderers = {},
      diagramLoaderPromises = {},
      renderSequence = 0;
    function f(diagramSource) {
      return [diagramSource, 0];
    }
    var timerId,
      g = function (searchValue) {
        var t = function (propertyName, computedStyle) {
            return (
              (computedStyle =
                computedStyle || window.getComputedStyle(document.body)).getPropertyValue(
                propertyName,
              ) || ''
            )
              .replace(/(^[\s\'\"]+)|([\s\'\"]+$)/g, '')
              .toLowerCase();
          },
          bodyStyle = searchValue ? void 0 : window.getComputedStyle(document.body);
        (searchValue = searchValue || t('--mermaid-theme')), (currentSearchValue = searchValue);
        var showSequenceNumbers = 'on' == t('--mermaid-sequence-numbers'),
          curve = t('--mermaid-flowchart-curve');
        -1 == ['linear', 'basis', 'step', 'natural'].indexOf(curve) && (curve = void 0);
        var leftPadding = t('--mermaid--gantt-left-padding') || 75;
        try {
          (leftPadding = parseFloat(leftPadding)), isNaN(leftPadding) && (leftPadding = 75);
        } catch (error) {
          leftPadding = 75;
        }
        var themeVariables = {};
        return (
          'night' == searchValue
            ? ((themeVariables = (function (computedStyle) {
                return (
                  computedStyle && computedStyle.getPropertyValue('--text-color').trim(),
                  {
                    darkMode: !1,
                    fontFamily:
                      (computedStyle
                        ? computedStyle.getPropertyValue('--mermaid-font-family').trim()
                        : void 0) || '"trebuchet ms", verdana, arial, sans-serif',
                  }
                );
              })(bodyStyle)),
              (searchValue = 'dark'))
            : ['base', 'default', 'dark', 'forest', 'neutral'].indexOf(searchValue) > -1 ||
              (bodyStyle
                ? (themeVariables = (function (computedStyle) {
                    var trimmedText = computedStyle.getPropertyValue('--node-fill').trim(),
                      darkMode = File.colorBrightness < 0.5;
                    trimmedText &&
                      /#/.exec(trimmedText) &&
                      (darkMode =
                        (299 * parseInt(trimmedText.substr(1, 2), 16) +
                          587 * parseInt(trimmedText.substr(3, 2), 16) +
                          114 * parseInt(trimmedText.substr(4, 2), 16)) /
                          1e3 <
                        40);
                    var themeOptions = {
                      darkMode: darkMode,
                      fontFamily:
                        computedStyle.getPropertyValue('--mermaid-font-family').trim() ||
                        '"trebuchet ms", verdana, arial, sans-serif',
                      noteTextColor: computedStyle.getPropertyValue('--text-color').trim(),
                      primaryColor: trimmedText,
                      background:
                        computedStyle.getPropertyValue('--mermaid-background').trim() ||
                        computedStyle.getPropertyValue('--bg-color').trim(),
                      noteBkgColor: computedStyle.getPropertyValue('--cluster-fill').trim(),
                      textColor:
                        computedStyle.getPropertyValue('--node-text-color').trim() ||
                        computedStyle.getPropertyValue('--text-color').trim(),
                    };
                    return (
                      '#ECECFF' !== trimmedText ||
                        themeOptions.darkMode ||
                        (themeOptions.secondaryColor = '#f4f4f4'),
                      themeOptions
                    );
                  })(bodyStyle))
                : (currentSearchValue = searchValue = 'default')),
          {
            securityLevel: 'loose',
            theme: searchValue || 'base',
            themeVariables: themeVariables,
            darkMode: 'night' == searchValue || 'dark' == searchValue,
            altFontFamily: 'sans-serif',
            fontFamily: 'sans-serif',
            startOnLoad: !1,
            flowchart: { htmlLabels: !0, useMaxWidth: !0, curve: curve },
            sequence: {
              showSequenceNumbers: showSequenceNumbers,
              useMaxWidth: !1,
              diagramMarginX: 8,
              diagramMarginY: 8,
              boxMargin: 8,
            },
            gantt: { leftPadding: leftPadding, rightPadding: 20 },
          }
        );
      };
    function v() {
      timerId && clearTimeout(timerId),
        (timerId = setTimeout(function () {
          (timerId = null),
            File.editor &&
              File.editor.diagrams &&
              (File.editor.diagrams.loadMermaidTheme(), File.editor.diagrams.refreshDiagram(!0));
        }, 500));
    }
    class y {
      constructor(editor) {
        this.editor = editor;
        var receiver = this;
        jquery(editor.sessionStr).on('refocus', '.md-fences-advanced', function () {
          var nodeId = this.getAttribute('cid');
          receiver.startPreview(nodeId);
          var currentCodeMirror = (this.querySelector('.CodeMirror') || {}).CodeMirror;
          currentCodeMirror || (currentCodeMirror = receiver.editor.fences.getCm(nodeId)),
            !currentCodeMirror.hasFocus() && currentCodeMirror.refresh();
        }),
          (this.refreshMermaidAfterZoom = v);
      }
      cancelDiagram(nodeId) {
        var codeMirror = this.editor.fences.getCm(nodeId);
        (this.editor
          .findElemById(nodeId)
          .find('.md-diagram-panel')
          .remove()
          .end()[0].style.marginBottom = ''),
          diagramRenderers[nodeId] && clearTimeout(diagramRenderers[nodeId]),
          (diagramRenderers[nodeId] = void 0),
          (diagramLoaderPromises[nodeId] = void 0),
          codeMirror.state.lint && CodeMirror.clearMarks(codeMirror),
          codeMirror.getWrapperElement().offsetHeight || codeMirror.refresh();
      }
      refreshDiagram(forceRefresh, writingArea) {
        var receiver = this;
        writingArea || (writingArea = document.querySelector('#write')),
          writingArea.querySelectorAll('.md-fences-advanced').forEach(function (element) {
            (!forceRefresh && element.querySelector('svg')) ||
              (receiver.editor.fences.getCm(element.getAttribute('cid')),
              receiver.updateDiagram(element.getAttribute('cid'), !0, !1, !0));
          });
      }
      loadMermaidTheme() {
        if (File.option.enableDiagram && window.mermaidAPI) {
          activeMermaidOptions = g();
          try {
            window.mermaidAPI.initialize(activeMermaidOptions);
          } catch (error) {
            window.Reporter.captureException(error, {
              level: 'warning',
              currentMermaidOptions: JSON.stringify(activeMermaidOptions),
            }),
              (activeMermaidOptions = g('default'));
            try {
              window.mermaidAPI.initialize(activeMermaidOptions);
            } catch (currentError) {
              window.Reporter.captureException(currentError);
            }
          }
        }
      }
      getCurrentMermaidOptions() {
        return activeMermaidOptions;
      }
      lazyload() {
        if (File.option.enableDiagram) {
          var receiver = this,
            editor = this.editor;
          if (window.debugMode)
            Promise.all([
              System.import('diagram/lodash.core.js'),
              System.import('diagram/mermaid.js'),
              System.import('diagram/raphael.js'),
            ]).then(function () {
              Promise.all([
                System.import('diagram/mermaid-zenuml.js'),
                System.import('diagram/sequence-diagram.js'),
                System.import('diagram/flowchart.js'),
              ]).then(function () {
                window.mermaid.registerExternalDiagrams([window['mermaid-zenuml']]), i();
              });
            });
          else {
            var libraryRoot = File.isNode ? './lib.asar' : './lib';
            jquery.getScript(libraryRoot + '/diagram/diagram.min.js', function () {
              jquery.getScript(libraryRoot + '/diagram/mermaid.min.js', function () {
                jquery.getScript(libraryRoot + '/diagram/mermaid-zenuml.min.js', function () {
                  window.mermaid.registerExternalDiagrams([window['mermaid-zenuml']]), i();
                });
              });
            });
          }
        }
        function i() {
          (receiver.modeLoaded = !0),
            (window.mermaidAPI = mermaid.mermaidAPI),
            receiver.loadMermaidTheme(),
            console.debug('diagram dependents are loaded'),
            jquery(editor.sessionStr)
              .on('click', '.md-diagram-panel', function (clickEvent) {
                var element = jquery(clickEvent.target).closest('a');
                if (element.length) return editor.tryOpenLink(element), !1;
                var currentElement = jquery(this).prevAll('.CodeMirror');
                if (currentElement.length && !currentElement.hasClass('CodeMirror-focused')) {
                  var currentCodeMirror = currentElement[0].CodeMirror;
                  currentCodeMirror && (currentCodeMirror.refresh(), currentCodeMirror.focus());
                }
              })
              .addClass('enable-diagrams'),
            receiver.refreshDiagram();
        }
      }
      async startPreview(nodeId, skipMathRefresh) {
        var language = this.editor.getNode(nodeId).get('lang'),
          codeMirror = this.editor.fences.getCm(nodeId);
        if (y.isDiagramType(language) || mathBlocks.isMathType(language)) {
          var nodeElement = this.editor.findElemById(nodeId),
            elements = nodeElement.find('.md-diagram-panel');
          elements.length ||
            ((elements = jquery('#componenet .md-diagram-panel').clone()),
            nodeElement.append(elements),
            y.isDiagramType(language)
              ? await this.updateDiagram(nodeId)
              : mathBlocks.isMathType(language) &&
                !skipMathRefresh &&
                this.editor.mathBlock.updateDiagram(nodeId),
            codeMirror.setOption('lint', {
              getAnnotations: function () {
                return [];
              },
              lintOnChange: !1,
            })),
            (nodeElement[0].style.marginBottom = nodeElement[0].classList.contains('md-focus')
              ? elements.height() + 50 + 'px'
              : '');
        }
      }
      async updateDiagram(nodeId, suppressLint, renderImmediately, skipMathRefresh) {
        var parsedDiagram,
          editor = this.editor,
          nodeElement = this.editor.findElemById(nodeId),
          codeMirror = this.editor.fences.getCm(nodeId),
          elements = nodeElement.find('.md-diagram-panel');
        if ((nodeElement[0].removeAttribute('mermaid-type'), !elements.length))
          return editor.diagrams.startPreview(nodeId, skipMathRefresh);
        function v(clearStoredError) {
          (elements.find('.md-diagram-panel-error')[0].innerHTML = ''),
            codeMirror.state.lint && CodeMirror.clearMarks(codeMirror),
            clearStoredError && (diagramLoaderPromises[codeMirror.cid] = null);
        }
        function y(parseError, diagramKind) {
          try {
            parseError.message = 'ERROR: [' + diagramKind + '] ' + parseError.message;
          } catch (error) {}
          ((
            document.querySelector("[cid='" + nodeId + "'] .md-diagram-panel-error") || {}
          ).textContent = parseError.message),
            parseError.loc &&
              ((diagramLoaderPromises[nodeId] = parseError),
              suppressLint ||
                (codeMirror.doc.lineCount() > 1 &&
                parseError.loc.first_line - 1 == (codeMirror.getCursor() || {}).line
                  ? v()
                  : editor.diagrams.attachError(codeMirror, parseError)));
        }
        var fill = '#fff';
        async function w() {
          if (elements.length) {
            if (DocumentNode.isType(codeMirror.options.mode, 'sequence'))
              !(function () {
                try {
                  (parsedDiagram = Diagram.parse(codeMirror.getValue() || 'title: Empty Diagram')),
                    (diagramLoaderPromises[nodeId] = null);
                } catch (error) {
                  return void y(error, 'Sequence');
                }
                v(!0), (elements.find('.md-diagram-panel-preview')[0].innerHTML = '');
                var normalizedText = (
                  window.getComputedStyle(document.body).getPropertyValue('--sequence-theme') || ''
                )
                  .replace(/(^[\s\'\"]+)|([\s\'\"]+$)/g, '')
                  .toLowerCase();
                parsedDiagram.drawSVG(elements.find('.md-diagram-panel-preview')[0], {
                  theme: 'hand' === normalizedText ? 'hand' : 'simple',
                });
                var element = elements.find('svg')[0],
                  zoom = elements.width() / (element.getAttribute('width').replace('px', '') - 0);
                zoom < 1 && (element.style.zoom = zoom);
              })();
            else if (DocumentNode.isType(codeMirror.options.mode, 'flow'))
              !(function () {
                try {
                  v(!0),
                    (parsedDiagram = flowchart.parse(
                      codeMirror.getValue().replace(/\r/g, '') ||
                        'st=>start: Empty Diagram\ne=>end\nst->e',
                    )),
                    (elements.find('.md-diagram-panel-preview')[0].innerHTML = ''),
                    parsedDiagram.drawSVG(elements.find('.md-diagram-panel-preview')[0], {
                      y: 0,
                      'font-color': 'currentColor',
                      'line-color': 'currentColor',
                      'element-color': 'currentColor',
                      fill: fill,
                    });
                } catch (error) {
                  return void y(error, 'Flowchart');
                }
              })();
            else {
              if (!DocumentNode.isType(codeMirror.options.mode, 'mermaid')) return;
              await (async function () {
                v(!0);
                var sourceAndLineOffset = f(codeMirror.getValue()),
                  first_line = sourceAndLineOffset[1],
                  element = elements.find('.md-diagram-panel-preview')[0],
                  text = sourceAndLineOffset[0],
                  currentText = (text.match(/^\s*(\w+)/m) || ['', ''])[1];
                var __marklyraRenderTicket =
                  typeof globalThis.__MARKLYRA_RENDER_TICKET__ === 'function'
                    ? globalThis.__MARKLYRA_RENDER_TICKET__(element, codeMirror)
                    : null;
                nodeElement[0].setAttribute('mermaid-type', currentText.toLowerCase());
                var a = function (svgMarkup) {
                  if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) return;
                  element.innerHTML = svgMarkup || '';
                  let currentElement = element.querySelector('svg');
                  if (currentElement) {
                    currentElement.classList.add('mermaid-svg');
                    let attributeValue = currentElement.getAttribute('aria-roledescription');
                    attributeValue && nodeElement[0].setAttribute('mermaid-type', attributeValue);
                  }
                };
                try {
                  if (
                    ((mermaidParseError = null),
                    a(''),
                    0 == text.trim().length
                      ? a('<text>' + jquery.localize.getString('Empty Diagram') + '</text>')
                      : window.mermaidAPI &&
                        a(
                          (
                            (await mermaidAPI.render(
                              'mermaidChart' + renderSequence++,
                              text,
                              element,
                            )) || {}
                          ).svg,
                        ),
                    mermaidParseError)
                  )
                    throw mermaidParseError;
                } catch (error) {
                  if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) return;
                  return error.hash
                    ? ((error.loc = error.hash.loc),
                      (error.line = error.hash.line),
                      error.loc
                        ? ((error.loc.first_line += first_line),
                          (error.loc.last_line += first_line),
                          (error.message = error.message.replace(
                            /^[^\n]*(\d)/,
                            function (unusedParameter1, reportedLine) {
                              return 'Parse error on line ' + (reportedLine - 0 + first_line);
                            },
                          )))
                        : (error.loc = { first_line: error.line + 1, last_line: error.line + 1 }),
                      void y(error, 'Mermaid'))
                    : void y(error, 'Mermaid');
                }
                v(!0);
              })();
            }
            var panelHeight = elements.height(),
              localElement = elements.closest('[cid]')[0];
            (localElement.style.marginBottom = localElement.classList.contains('md-focus')
              ? panelHeight + 40 + 'px'
              : ''),
              (diagramRenderers[nodeId] = null);
          }
        }
        window.CSS &&
          window.CSS.supports &&
          window.CSS.supports('(--foo: red)') &&
          (fill = 'var(--bg-color)'),
          diagramRenderers[nodeId] && clearTimeout(diagramRenderers[nodeId]),
          renderImmediately ? await w() : (diagramRenderers[nodeId] = setTimeout(w, 200));
      }
      attachError(codeMirror, parseError) {
        try {
          if (
            ((parseError = parseError || diagramLoaderPromises[codeMirror.cid]),
            codeMirror.state.lint && CodeMirror.clearMarks(codeMirror),
            !parseError || !parseError.loc)
          )
            return;
          var annotation = {
            from: CodeMirror.Pos(parseError.loc.first_line - 1, parseError.loc.first_column),
            to: CodeMirror.Pos(
              parseError.loc.last_line - 1,
              parseError.loc.last_column ||
                codeMirror.doc.getLine(parseError.loc.last_line - 1).length,
            ),
            message: parseError.message,
          };
          ((
            document.querySelector("[cid='" + codeMirror.cid + "'] .md-diagram-panel-error") || {}
          ).textContent = parseError.message),
            CodeMirror.updateLinting(codeMirror, [annotation]);
        } catch (error) {}
      }
      async mermaidSvgForExportTheme(themeCss) {
        var previousMermaidOptions = activeMermaidOptions,
          searchValue = currentSearchValue,
          editor = this.editor,
          receiver = this;
        var exportTheme = (function (textSlice) {
          var startOffset = textSlice.lastIndexOf('--mermaid-theme');
          return -1 == startOffset
            ? 'default'
            : ((textSlice = textSlice.substr(startOffset)),
              ((/--mermaid-theme\s*:\s*([^\s;]+)/.exec(textSlice) || [])[1] || 'default').replace(
                /['"]/g,
                '',
              ));
        })(themeCss);
        if (exportTheme == currentSearchValue) return null;
        var exportOptions = g(exportTheme);
        return await (async function (mermaidOptions) {
          window.mermaidAPI.initialize(mermaidOptions);
          var elements = document.querySelectorAll(".md-diagram[lang='mermaid']"),
            element = document.querySelector('#mermaid-canvas');
          element.innerHTML = '';
          var currentElement,
            documentNode,
            diagramSource,
            localElement,
            exportedSvgs = {};
          return (
            await Promise.all(
              Array.from(elements).map(
                (item) => (
                  (currentElement = item),
                  (documentNode = editor.getNode(currentElement.getAttribute('cid'))),
                  (diagramSource = f(documentNode.get('text'))[0]),
                  (localElement = document.createElement('div')),
                  localElement.setAttribute('id', 'export-mermaid-' + documentNode.cid),
                  element.appendChild(localElement),
                  new Promise((resolvePromise) => {
                    try {
                      mermaidAPI
                        .render('export-mermaid-' + documentNode.cid, diagramSource)
                        .then(function (result) {
                          var svgMarkup = (result || {}).svg || '';
                          (exportedSvgs[documentNode.cid] = svgMarkup), resolvePromise(svgMarkup);
                        });
                    } catch (error) {
                      console.error(error),
                        (exportedSvgs[documentNode.cid] = ''),
                        resolvePromise('');
                    }
                  })
                ),
              ),
            ),
            (activeMermaidOptions = previousMermaidOptions),
            (currentSearchValue = searchValue),
            (element.innerHTML = ''),
            receiver.loadMermaidTheme(),
            exportedSvgs
          );
        })(exportOptions);
      }
    }
    (y.isDiagramType = function (language) {
      return (
        File.option.enableDiagram &&
        'string' == typeof language &&
        DocumentNode.isType((language || '').toLowerCase().trim(), 'sequence', 'flow', 'mermaid')
      );
    }),
      (y.MODES = ['sequence', 'flow', 'mermaid']),
      (y.getMermaidOptions = g),
      (moduleRecord.exports = y);
  },
);
