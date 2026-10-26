// render/diagrams.
export default function initializeRenderDiagrams(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  var mermaidParseError,
    activeMermaidOptions,
    currentSearchValue,
    CodeMirror = requireModule('libraries/codemirror'),
    jquery = (requireModule('shared/utilities'), requireModule('libraries/jquery')),
    documentModel = requireModule('model/document-model'),
    mathBlocks = (documentModel.TYPE, requireModule('render/math-blocks')),
    DocumentNode = documentModel.Node,
    diagramRenderers = {},
    diagramLoaderPromises = {},
    renderSequence = 0;
  function parseDiagramSource(diagramSource) {
    return [diagramSource, 0];
  }
  var timerId,
    buildDiagramThemeOptions = function (searchValue) {
      var readCssProperty = function (propertyName, computedStyle) {
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
      searchValue = searchValue || readCssProperty('--mermaid-theme');
      currentSearchValue = searchValue;
      var showSequenceNumbers = 'on' == readCssProperty('--mermaid-sequence-numbers'),
        curve = readCssProperty('--mermaid-flowchart-curve');
      if (-1 == ['linear', 'basis', 'step', 'natural'].indexOf(curve)) {
        curve = void 0;
      }
      var leftPadding = readCssProperty('--mermaid--gantt-left-padding') || 75;
      try {
        leftPadding = parseFloat(leftPadding);
        if (isNaN(leftPadding)) {
          leftPadding = 75;
        }
      } catch (error) {
        leftPadding = 75;
      }
      var themeVariables = {};
      if ('night' == searchValue) {
        themeVariables = (function (computedStyle) {
          if (computedStyle) {
            computedStyle.getPropertyValue('--text-color').trim();
          }
          return {
            darkMode: false,
            fontFamily:
              (computedStyle
                ? computedStyle.getPropertyValue('--mermaid-font-family').trim()
                : void 0) || '"trebuchet ms", verdana, arial, sans-serif',
          };
        })(bodyStyle);
        searchValue = 'dark';
      } else {
        if (!(['base', 'default', 'dark', 'forest', 'neutral'].indexOf(searchValue) > -1)) {
          if (bodyStyle) {
            themeVariables = (function (computedStyle) {
              var trimmedText = computedStyle.getPropertyValue('--node-fill').trim(),
                darkMode = File.colorBrightness < 0.5;
              if (trimmedText && /#/.exec(trimmedText)) {
                darkMode =
                  (299 * parseInt(trimmedText.substr(1, 2), 16) +
                    587 * parseInt(trimmedText.substr(3, 2), 16) +
                    114 * parseInt(trimmedText.substr(4, 2), 16)) /
                    1e3 <
                  40;
              }
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
              if (!('#ECECFF' !== trimmedText || themeOptions.darkMode)) {
                themeOptions.secondaryColor = '#f4f4f4';
              }
              return themeOptions;
            })(bodyStyle);
          } else {
            currentSearchValue = searchValue = 'default';
          }
        }
      }
      return {
        securityLevel: 'loose',
        theme: searchValue || 'base',
        themeVariables: themeVariables,
        darkMode: 'night' == searchValue || 'dark' == searchValue,
        altFontFamily: 'sans-serif',
        fontFamily: 'sans-serif',
        startOnLoad: false,
        flowchart: { htmlLabels: true, useMaxWidth: true, curve: curve },
        sequence: {
          showSequenceNumbers: showSequenceNumbers,
          useMaxWidth: false,
          diagramMarginX: 8,
          diagramMarginY: 8,
          boxMargin: 8,
        },
        gantt: { leftPadding: leftPadding, rightPadding: 20 },
      };
    };
  function scheduleDiagramThemeRefresh() {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(function () {
      timerId = null;
      if (File.editor && File.editor.diagrams) {
        File.editor.diagrams.loadMermaidTheme();
        File.editor.diagrams.refreshDiagram(true);
      }
    }, 500);
  }
  class DiagramController {
    constructor(editor) {
      this.editor = editor;
      var receiver = this;
      jquery(editor.sessionStr).on('refocus', '.md-fences-advanced', function () {
        var nodeId = this.getAttribute('cid');
        receiver.startPreview(nodeId);
        var currentCodeMirror = (this.querySelector('.CodeMirror') || {}).CodeMirror;
        if (!currentCodeMirror) {
          currentCodeMirror = receiver.editor.fences.getCm(nodeId);
        }
        if (!currentCodeMirror.hasFocus()) {
          currentCodeMirror.refresh();
        }
      });
      this.refreshMermaidAfterZoom = scheduleDiagramThemeRefresh;
    }
    cancelDiagram(nodeId) {
      var codeMirror = this.editor.fences.getCm(nodeId);
      this.editor
        .findElemById(nodeId)
        .find('.md-diagram-panel')
        .remove()
        .end()[0].style.marginBottom = '';
      if (diagramRenderers[nodeId]) {
        clearTimeout(diagramRenderers[nodeId]);
      }
      diagramRenderers[nodeId] = void 0;
      diagramLoaderPromises[nodeId] = void 0;
      if (codeMirror.state.lint) {
        CodeMirror.clearMarks(codeMirror);
      }
      if (!codeMirror.getWrapperElement().offsetHeight) {
        codeMirror.refresh();
      }
    }
    refreshDiagram(forceRefresh, writingArea) {
      var receiver = this;
      if (!writingArea) {
        writingArea = document.querySelector('#write');
      }
      writingArea.querySelectorAll('.md-fences-advanced').forEach(function (element) {
        if (!(!forceRefresh && element.querySelector('svg'))) {
          receiver.editor.fences.getCm(element.getAttribute('cid'));
          receiver.updateDiagram(element.getAttribute('cid'), true, false, true);
        }
      });
    }
    loadMermaidTheme() {
      if (File.option.enableDiagram && window.mermaidAPI) {
        activeMermaidOptions = buildDiagramThemeOptions();
        try {
          window.mermaidAPI.initialize(activeMermaidOptions);
        } catch (error) {
          window.Reporter.captureException(error, {
            level: 'warning',
            currentMermaidOptions: JSON.stringify(activeMermaidOptions),
          });
          activeMermaidOptions = buildDiagramThemeOptions('default');
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
        if (window.debugMode) {
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
              window.mermaid.registerExternalDiagrams([window['mermaid-zenuml']]);
              finishLoadingDiagramModes();
            });
          });
        } else {
          var libraryRoot = File.isNode ? './lib.asar' : './lib';
          jquery.getScript(libraryRoot + '/diagram/diagram.min.js', function () {
            jquery.getScript(libraryRoot + '/diagram/mermaid.min.js', function () {
              jquery.getScript(libraryRoot + '/diagram/mermaid-zenuml.min.js', function () {
                window.mermaid.registerExternalDiagrams([window['mermaid-zenuml']]);
                finishLoadingDiagramModes();
              });
            });
          });
        }
      }
      function finishLoadingDiagramModes() {
        receiver.modeLoaded = true;
        window.mermaidAPI = mermaid.mermaidAPI;
        receiver.loadMermaidTheme();
        console.debug('diagram dependents are loaded');
        jquery(editor.sessionStr)
          .on('click', '.md-diagram-panel', function (clickEvent) {
            var element = jquery(clickEvent.target).closest('a');
            if (element.length) {
              editor.tryOpenLink(element);
              return false;
            }
            var currentElement = jquery(this).prevAll('.CodeMirror');
            if (currentElement.length && !currentElement.hasClass('CodeMirror-focused')) {
              var currentCodeMirror = currentElement[0].CodeMirror;
              if (currentCodeMirror) {
                currentCodeMirror.refresh();
                currentCodeMirror.focus();
              }
            }
          })
          .addClass('enable-diagrams');
        receiver.refreshDiagram();
      }
    }
    async startPreview(nodeId, skipMathRefresh) {
      var language = this.editor.getNode(nodeId).get('lang'),
        codeMirror = this.editor.fences.getCm(nodeId);
      if (DiagramController.isDiagramType(language) || mathBlocks.isMathType(language)) {
        var nodeElement = this.editor.findElemById(nodeId),
          elements = nodeElement.find('.md-diagram-panel');
        if (!elements.length) {
          elements = jquery('#componenet .md-diagram-panel').clone();
          nodeElement.append(elements);
          if (DiagramController.isDiagramType(language)) {
            await this.updateDiagram(nodeId);
          } else {
            if (mathBlocks.isMathType(language) && !skipMathRefresh) {
              this.editor.mathBlock.updateDiagram(nodeId);
            }
          }
          codeMirror.setOption('lint', {
            getAnnotations: function () {
              return [];
            },
            lintOnChange: false,
          });
        }
        nodeElement[0].style.marginBottom = nodeElement[0].classList.contains('md-focus')
          ? elements.height() + 50 + 'px'
          : '';
      }
    }
    async updateDiagram(nodeId, suppressLint, renderImmediately, skipMathRefresh) {
      var parsedDiagram,
        editor = this.editor,
        nodeElement = this.editor.findElemById(nodeId),
        codeMirror = this.editor.fences.getCm(nodeId),
        elements = nodeElement.find('.md-diagram-panel');
      nodeElement[0].removeAttribute('mermaid-type');
      if (!elements.length) {
        return editor.diagrams.startPreview(nodeId, skipMathRefresh);
      }
      function clearDiagramError(clearStoredError) {
        elements.find('.md-diagram-panel-error')[0].innerHTML = '';
        if (codeMirror.state.lint) {
          CodeMirror.clearMarks(codeMirror);
        }
        if (clearStoredError) {
          diagramLoaderPromises[codeMirror.cid] = null;
        }
      }
      function showDiagramError(parseError, diagramKind) {
        try {
          parseError.message = 'ERROR: [' + diagramKind + '] ' + parseError.message;
        } catch (error) {}
        (
          document.querySelector("[cid='" + nodeId + "'] .md-diagram-panel-error") || {}
        ).textContent = parseError.message;
        if (parseError.loc) {
          diagramLoaderPromises[nodeId] = parseError;
          if (!suppressLint) {
            if (
              codeMirror.doc.lineCount() > 1 &&
              parseError.loc.first_line - 1 == (codeMirror.getCursor() || {}).line
            ) {
              clearDiagramError();
            } else {
              editor.diagrams.attachError(codeMirror, parseError);
            }
          }
        }
      }
      var fill = '#fff';
      async function renderDiagram() {
        if (elements.length) {
          if (DocumentNode.isType(codeMirror.options.mode, 'sequence')) {
            !(function () {
              try {
                parsedDiagram = Diagram.parse(codeMirror.getValue() || 'title: Empty Diagram');
                diagramLoaderPromises[nodeId] = null;
              } catch (error) {
                return void showDiagramError(error, 'Sequence');
              }
              clearDiagramError(true);
              elements.find('.md-diagram-panel-preview')[0].innerHTML = '';
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
              if (zoom < 1) {
                element.style.zoom = zoom;
              }
            })();
          } else {
            if (DocumentNode.isType(codeMirror.options.mode, 'flow')) {
              !(function () {
                try {
                  clearDiagramError(true);
                  parsedDiagram = flowchart.parse(
                    codeMirror.getValue().replace(/\r/g, '') ||
                      'st=>start: Empty Diagram\ne=>end\nst->e',
                  );
                  elements.find('.md-diagram-panel-preview')[0].innerHTML = '';
                  parsedDiagram.drawSVG(elements.find('.md-diagram-panel-preview')[0], {
                    y: 0,
                    'font-color': 'currentColor',
                    'line-color': 'currentColor',
                    'element-color': 'currentColor',
                    fill: fill,
                  });
                } catch (error) {
                  return void showDiagramError(error, 'Flowchart');
                }
              })();
            } else {
              if (!DocumentNode.isType(codeMirror.options.mode, 'mermaid')) {
                return;
              }
              await (async function () {
                clearDiagramError(true);
                var sourceAndLineOffset = parseDiagramSource(codeMirror.getValue()),
                  first_line = sourceAndLineOffset[1],
                  element = elements.find('.md-diagram-panel-preview')[0],
                  text = sourceAndLineOffset[0],
                  currentText = (text.match(/^\s*(\w+)/m) || ['', ''])[1];
                var __marklyraRenderTicket =
                  typeof globalThis.__MARKLYRA_RENDER_TICKET__ === 'function'
                    ? globalThis.__MARKLYRA_RENDER_TICKET__(element, codeMirror)
                    : null;
                nodeElement[0].setAttribute('mermaid-type', currentText.toLowerCase());
                var insertMermaidSvg = function (svgMarkup) {
                  if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) {
                    return;
                  }
                  element.innerHTML = svgMarkup || '';
                  let currentElement = element.querySelector('svg');
                  if (currentElement) {
                    currentElement.classList.add('mermaid-svg');
                    let attributeValue = currentElement.getAttribute('aria-roledescription');
                    if (attributeValue) {
                      nodeElement[0].setAttribute('mermaid-type', attributeValue);
                    }
                  }
                };
                try {
                  mermaidParseError = null;
                  insertMermaidSvg('');
                  if (0 == text.trim().length) {
                    insertMermaidSvg(
                      '<text>' + jquery.localize.getString('Empty Diagram') + '</text>',
                    );
                  } else {
                    if (window.mermaidAPI) {
                      insertMermaidSvg(
                        (
                          (await mermaidAPI.render(
                            'mermaidChart' + renderSequence++,
                            text,
                            element,
                          )) || {}
                        ).svg,
                      );
                    }
                  }
                  if (mermaidParseError) {
                    throw mermaidParseError;
                  }
                } catch (error) {
                  if (__marklyraRenderTicket && !__marklyraRenderTicket.current()) {
                    return;
                  }
                  if (error.hash) {
                    error.loc = error.hash.loc;
                    error.line = error.hash.line;
                    if (error.loc) {
                      error.loc.first_line += first_line;
                      error.loc.last_line += first_line;
                      error.message = error.message.replace(
                        /^[^\n]*(\d)/,
                        function (unusedParameter1, reportedLine) {
                          return 'Parse error on line ' + (reportedLine - 0 + first_line);
                        },
                      );
                    } else {
                      error.loc = { first_line: error.line + 1, last_line: error.line + 1 };
                    }
                    return void showDiagramError(error, 'Mermaid');
                  } else {
                    return void showDiagramError(error, 'Mermaid');
                  }
                }
                clearDiagramError(true);
              })();
            }
          }
          var panelHeight = elements.height(),
            localElement = elements.closest('[cid]')[0];
          localElement.style.marginBottom = localElement.classList.contains('md-focus')
            ? panelHeight + 40 + 'px'
            : '';
          diagramRenderers[nodeId] = null;
        }
      }
      if (window.CSS && window.CSS.supports && window.CSS.supports('(--foo: red)')) {
        fill = 'var(--bg-color)';
      }
      if (diagramRenderers[nodeId]) {
        clearTimeout(diagramRenderers[nodeId]);
      }
      if (renderImmediately) {
        await renderDiagram();
      } else {
        diagramRenderers[nodeId] = setTimeout(renderDiagram, 200);
      }
    }
    attachError(codeMirror, parseError) {
      try {
        parseError = parseError || diagramLoaderPromises[codeMirror.cid];
        if (codeMirror.state.lint) {
          CodeMirror.clearMarks(codeMirror);
        }
        if (!parseError || !parseError.loc) {
          return;
        }
        var annotation = {
          from: CodeMirror.Pos(parseError.loc.first_line - 1, parseError.loc.first_column),
          to: CodeMirror.Pos(
            parseError.loc.last_line - 1,
            parseError.loc.last_column ||
              codeMirror.doc.getLine(parseError.loc.last_line - 1).length,
          ),
          message: parseError.message,
        };
        (
          document.querySelector("[cid='" + codeMirror.cid + "'] .md-diagram-panel-error") || {}
        ).textContent = parseError.message;
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
        if (-1 == startOffset) {
          return 'default';
        } else {
          textSlice = textSlice.substr(startOffset);
          return (
            (/--mermaid-theme\s*:\s*([^\s;]+)/.exec(textSlice) || [])[1] || 'default'
          ).replace(/['"]/g, '');
        }
      })(themeCss);
      if (exportTheme == currentSearchValue) {
        return null;
      }
      var exportOptions = buildDiagramThemeOptions(exportTheme);
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
        await Promise.all(
          Array.from(elements).map(
            (item) => (
              (currentElement = item),
              (documentNode = editor.getNode(currentElement.getAttribute('cid'))),
              (diagramSource = parseDiagramSource(documentNode.get('text'))[0]),
              (localElement = document.createElement('div')),
              localElement.setAttribute('id', 'export-mermaid-' + documentNode.cid),
              element.appendChild(localElement),
              new Promise((resolvePromise) => {
                try {
                  mermaidAPI
                    .render('export-mermaid-' + documentNode.cid, diagramSource)
                    .then(function (result) {
                      var svgMarkup = (result || {}).svg || '';
                      exportedSvgs[documentNode.cid] = svgMarkup;
                      resolvePromise(svgMarkup);
                    });
                } catch (error) {
                  console.error(error);
                  exportedSvgs[documentNode.cid] = '';
                  resolvePromise('');
                }
              })
            ),
          ),
        );
        activeMermaidOptions = previousMermaidOptions;
        currentSearchValue = searchValue;
        element.innerHTML = '';
        receiver.loadMermaidTheme();
        return exportedSvgs;
      })(exportOptions);
    }
  }

  DiagramController.isDiagramType = function (language) {
    return (
      File.option.enableDiagram &&
      'string' == typeof language &&
      DocumentNode.isType((language || '').toLowerCase().trim(), 'sequence', 'flow', 'mermaid')
    );
  };
  DiagramController.MODES = ['sequence', 'flow', 'mermaid'];
  DiagramController.getMermaidOptions = buildDiagramThemeOptions;
  moduleRecord.exports = DiagramController;
}
