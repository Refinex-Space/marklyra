// export/html.
export default function initializeExportHtml(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(resolveDiagramPlaceholders, 'name', { value: 'F', configurable: true });
  Object.defineProperty(removeTemporaryDiagramFiles, 'name', { value: 'S', configurable: true });

  if (!this) {
    self;
  }
  var documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    DocumentMap = documentModel.NodeMap,
    NodeType = documentModel.TYPE,
    utilities = requireModule('shared/utilities'),
    mathBlocks = requireModule('render/math-blocks'),
    diagrams = requireModule('render/diagrams'),
    markdownParser = requireModule('model/markdown-parser'),
    htmlBlocks = requireModule('render/html-blocks'),
    fileIntegration = requireModule('host/file-integration'),
    mediaActions = requireModule('media/actions'),
    dialogs = requireModule('ui/dialogs'),
    escapeSequences = {
      '\b': '\\b',
      '\t': '\\t',
      '\n': '\\n',
      '\f': '\\f',
      '\r': '\\r',
      '"': '\\"',
      "'": "'",
      '\\': '\\\\',
    };
  const svgSanitizerOptions = {
    USE_PROFILES: { mathMl: true, svg: true },
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['id', 'style'],
  };
  var items,
    set,
    diagramPlaceholder = '',
    exportContext = {},
    textParts = [],
    currentItems = [];
  function resolveDiagramPlaceholders(text, onComplete, targetFormat, assetDirectory) {
    var parts = text.split(/(\uE040\d+)\uE041/g);
    if (!parts) {
      return onComplete(text);
    }
    Promise.all(
      parts.map(async function (inputText) {
        if (inputText.charAt(0) == diagramPlaceholder) {
          var diagramIndex = inputText.substring(1) - 0,
            nodeId = items[diagramIndex].cid,
            diagramPath = await (async function (nodeId) {
              var element = document.querySelector("[cid='" + nodeId + "'] svg"),
                elementLength = $(element).closest("[lang='mermaid']").length,
                temporaryImagePath = await mediaActions.saveSVGToTempPath(element, elementLength);
              if (temporaryImagePath) {
                currentItems.push(temporaryImagePath);
              }
              return temporaryImagePath;
            })(nodeId);
          set.delete(nodeId);
          if ('latex' == targetFormat) {
            diagramPath = await ((source = diagramPath),
            (folder = assetDirectory),
            folder
              ? new Promise(function (resolvePromise) {
                  if (File.isNode) {
                    var fileName = reqnode('path').basename(source);
                    reqnode('fs-extra').move(source, folder + '/' + fileName, function () {
                      resolvePromise(fileName);
                    });
                  } else {
                    if (File.isMac) {
                      bridge.callHandler(
                        'path.moveTo',
                        { source: source, folder: folder },
                        resolvePromise,
                      );
                    }
                  }
                })
              : Promise.resolve(source));
          }
          return JSON.stringify(diagramPath);
        }
        return inputText;
        var source, folder;
      }),
    ).then(
      function (result) {
        text = result.join('');
        onComplete(text);
      },
      function (unusedParameter1) {
        text = parts.join('').replace(/[\uE040-\uE041]/g, '');
        onComplete(text);
      },
    );
  }
  function removeTemporaryDiagramFiles() {
    if (File.isNode) {
      for (; currentItems.length; ) {
        reqnode('fs').unlink(currentItems.pop(), function () {});
      }
    } else {
      if (File.isMac) {
        bridge.callHandler('path.removeFiles', currentItems);
        currentItems = [];
      }
    }
  }
  var nativeInlineLexer,
    escapeNativeString = Object.defineProperty(
      function (literalText) {
        return markdownParser
          .recoverEscape(literalText)
          .replace(/["'\\\b\t\n\f\r]/g, function (escapedCharacter) {
            return escapeSequences[escapedCharacter];
          })
          .replace(/\u200b/g, '');
      },
      'name',
      { value: 'E', configurable: true },
    ),
    alignmentCommands = { left: 'AlignLeft', right: 'AlignRight', center: 'AlignCenter' },
    renderNativeChildren = Object.defineProperty(
      function (documentNode, separator, firstChild, renderContext, inlinePrefix) {
        separator = void 0 === separator ? ',' : separator;
        renderContext = renderContext || exportContext;
        for (
          var nativeBlock,
            currentTextParts = [],
            currentDocumentNode = firstChild || documentNode.getFirstChild();
          currentDocumentNode;
        ) {
          if ((nativeBlock = renderNativeBlock(currentDocumentNode, renderContext, inlinePrefix))) {
            currentTextParts.push(nativeBlock);
          }
          currentDocumentNode = currentDocumentNode.get('after');
        }
        return currentTextParts.join(separator);
      },
      'name',
      { value: '_', configurable: true },
    ),
    renderNativeInlineContent = Object.defineProperty(
      function (documentNode, sourceText) {
        sourceText = sourceText || documentNode.get('text');
        var parentNode = documentNode.get('parent'),
          inlineOptions = {};
        if (
          DocumentNode.isType(documentNode, NodeType.paragraph) &&
          !documentNode.get('before') &&
          DocumentNode.isType(parentNode, NodeType.blockquote) &&
          parentNode.get('alert')
        ) {
          inlineOptions.alert = true;
        }
        return (
          nativeInlineLexer.output(sourceText, void 0, void 0, inlineOptions).replace(/, $/, '') ||
          'Str ""'
        );
      },
      'name',
      { value: 'A', configurable: true },
    ),
    requiresRawHtml = Object.defineProperty(
      function (targetFormat) {
        return DocumentNode.isType(targetFormat, 'epub', 'rst', 'opml', 'textile', 'markdown');
      },
      'name',
      { value: 'M', configurable: true },
    ),
    isMarkdownTarget = Object.defineProperty(
      function (targetFormat) {
        return DocumentNode.isType(targetFormat, 'gfm', 'markdown');
      },
      'name',
      { value: 'L', configurable: true },
    ),
    mathTagPattern = /([^\\]|^)\\tag{([^}]+)}\s*/,
    mathLabelPattern = /([^\\]|^)\\label{([^}]+)}\s*/,
    mathOverPattern = /([^\\]|^)\\over[^\w\d]/,
    renderNativeBlock = Object.defineProperty(
      function (documentNode, renderContext, inlinePrefix) {
        var text,
          renderChildBlocks = Object.defineProperty(
            function (parentNode, separator, firstChild, childPrefix) {
              return renderNativeChildren(
                parentNode,
                separator,
                firstChild,
                renderContext,
                childPrefix,
              );
            },
            'name',
            { value: 'o', configurable: true },
          ),
          useRawHtml = requiresRawHtml(renderContext.target),
          renderNativeMathBlock = Object.defineProperty(
            function (inputDocumentNode, renderContext) {
              text = inputDocumentNode
                .get('text')
                .trim()
                .replace(/\u200b/g, '');
              if ('epub' == renderContext.target) {
                var mathMl = DOMPurify.sanitize(
                  MathJax.tex2mml(text, { display: true }),
                  svgSanitizerOptions,
                );
                if (mathMl) {
                  return (
                    'RawBlock (Format "html") ' +
                    JSON.stringify(
                      (function (mathMlText) {
                        try {
                          var mathDocument = new DOMParser().parseFromString(
                            mathMlText,
                            'text/html',
                          );
                          mathDocument.querySelectorAll('mtable').forEach(function (element) {
                            if (
                              element.hasAttribute('columnalign') &&
                              !element.getAttribute('columnalign')
                            ) {
                              element.removeAttribute('columnalign');
                            }
                          });
                          return mathDocument.body.innerHTML;
                        } catch (error) {}
                        return mathMlText;
                      })(mathMl),
                    ) +
                    ' '
                  );
                }
              } else {
                if ('latex' == renderContext.target) {
                  if (
                    text.match(
                      /^\\(begin|newcommand|renewcommand|newenvironment|renewenvironment|def|let){/,
                    )
                  ) {
                    return 'RawBlock (Format "latex") ' + JSON.stringify(text);
                  }
                } else {
                  if (
                    'docx' == renderContext.target &&
                    ((text = text.replace(/\n[\\]+\n/g, '\n')),
                    File.option.autoNumberingForMath && !/\\nonumber\s*$/.exec(text))
                  ) {
                    var mathSourceAndNumber = (function (inputText, numberingState) {
                      var number;
                      numberingState.number = numberingState.number || 1;
                      if (File.option.autoNumberingForMath) {
                        number = numberingState.number;
                        numberingState.number++;
                      }
                      if (mathOverPattern.test(inputText)) {
                        return [inputText, number];
                      }
                      var match = mathTagPattern.exec(inputText);
                      inputText = inputText.replace(/([^\\]|^)\\eqref{([^}]+)}\s*/g, '$1($2)');
                      if (match) {
                        number = match[2];
                        return [
                          (inputText =
                            inputText.replace(/([^\\]|^)\\tag{([^}]+)}\s*/g, '$1') +
                            '\\qquad\\text{(' +
                            utilities.escapeInQuote(number) +
                            ')}'),
                          number,
                        ];
                      } else {
                        inputText = inputText +=
                          '\\qquad\\text{(' + utilities.escapeInQuote(number + '') + ')}';
                        if ((match = mathLabelPattern.exec(inputText))) {
                          number = match[2];
                        }
                        return [inputText, number];
                      }
                    })(text, renderContext);
                    return (
                      'Plain [' +
                      [
                        'Math DisplayMath "' + escapeNativeString(mathSourceAndNumber[0]) + '" ',
                      ].join(',') +
                      ']'
                    );
                  }
                }
              }
              return 'Plain [Math DisplayMath "' + escapeNativeString(text) + '"]';
            },
            'name',
            { value: 'p', configurable: true },
          ),
          versionAfter2_10 = renderContext.versionAfter2_10;
        switch (documentNode.get('type')) {
          case NodeType.paragraph:
            text = renderNativeInlineContent(documentNode);
            return 'Para [' + (inlinePrefix || '') + text + ']';
          case NodeType.meta_block:
            return '';
          case NodeType.heading:
            var anchorId = renderContext.anchorMap[documentNode.cid];
            return (
              'Header ' +
              documentNode.get('depth') +
              ' ("' +
              utilities.escapeInQuote(anchorId) +
              '", [], []) [' +
              (inlinePrefix || '') +
              renderNativeInlineContent(documentNode) +
              ']'
            );
          case NodeType.blockquote:
            text = renderChildBlocks(documentNode);
            if (
              !isMarkdownTarget(renderContext.target) &&
              DocumentNode.isType(
                documentNode.get('alert'),
                'note',
                'warning',
                'important',
                'tip',
                'caution',
              )
            ) {
              return `Div ("", ["${documentNode.get('alert')}", "alert"], []) [${text}]`;
            } else {
              return 'BlockQuote [' + text + ']';
            }
          case NodeType.list:
            var style = documentNode.get('style');
            text = renderChildBlocks(documentNode);
            if (style == DocumentNode.ListType.ol) {
              return 'OrderedList (1,Decimal,Period) [' + text + ']';
            } else {
              return 'BulletList [' + text + ']';
            }
          case NodeType.list_item:
            let taskPrefix = '';
            if (
              documentNode.get('parent') &&
              documentNode.get('style') === DocumentNode.ListType.task
            ) {
              taskPrefix = documentNode.get('checked')
                ? 'Str "\\9746" , Space , '
                : 'Str "\\9744" , Space , ';
            }
            return '[' + (text = renderChildBlocks(documentNode, void 0, void 0, taskPrefix)) + ']';
          case NodeType.fences:
            if (
              diagrams.isDiagramType(documentNode.get('lang')) &&
              DocumentNode.isType(renderContext.target, 'epub', 'docx', 'odt', 'latex')
            ) {
              items.push(documentNode);
              set.add(documentNode.cid);
              var bounds = document
                .querySelector("[cid='" + documentNode.cid + "'] svg")
                .getBoundingClientRect();
              return (
                'Div ("",[],[("style","text-align:center"), ("align", "center")]) [Para [Image ("",[' +
                JSON.stringify(documentNode.get('lang')) +
                '],[("width", "' +
                (bounds.right - bounds.left) +
                '"), ("align", "center")]) [Str ""] (' +
                (diagramPlaceholder + (items.length - 1)) +
                ',"fig:")]] '
              );
            }
            if (mathBlocks.isMathType(documentNode.get('lang'))) {
              return renderNativeMathBlock(documentNode, renderContext);
            }
            var codeAttributes = markdownParser.parsePandocAttr(documentNode.get('lang'));
            if (Object.keys(codeAttributes).length) {
              var currentTextParts = [];
              for (var currentText in codeAttributes.nativeAttr) {
                currentTextParts.push(
                  '("' +
                    currentText.replace(/['"]/g, '') +
                    '","' +
                    codeAttributes.nativeAttr[currentText].replace(/['"]/g, '') +
                    '")',
                );
              }
              return (
                'CodeBlock ("' +
                escapeNativeString(codeAttributes.id || '') +
                '",[' +
                (codeAttributes.class || '')
                  .trim()
                  .split(/\s+/)
                  .map(function (item) {
                    return '"' + escapeNativeString(item) + '"';
                  })
                  .join(',') +
                '],[' +
                currentTextParts.join(',') +
                ']) "' +
                escapeNativeString(documentNode.get('text')) +
                '"'
              );
            }
            return (
              'CodeBlock ("",["' +
              escapeNativeString(
                getCodeMirrorMode(documentNode.get('lang') || '', false, true, true),
              ) +
              '"],[]) "' +
              escapeNativeString(documentNode.get('text')) +
              '"'
            );
          case NodeType.math_block:
            return renderNativeMathBlock(documentNode, renderContext);
          case NodeType.hr:
            return 'HorizontalRule';
          case NodeType.def_footnote:
          case NodeType.def_link:
            return '';
          case NodeType.toc:
            if ('latex' == renderContext.target) {
              return 'RawBlock (Format "latex") "\\\\tableofcontents"';
            } else {
              if ('wiki' == renderContext.target) {
                return 'RawBlock (Format "mediawiki") "__TOC__", RawBlock (Format "mediawiki") ""';
              } else {
                if ('rst' == renderContext.target) {
                  return 'RawBlock (Format "rst") ".. contents::", RawBlock (Format "rst") "\n"';
                } else {
                  if ('opml' == renderContext.target) {
                    return '';
                  } else {
                    if ('textile' == renderContext.target) {
                      return 'RawBlock (Format "textile") "{toc}", RawBlock (Format "textile") "\n"';
                    } else {
                      return '';
                    }
                  }
                }
              }
            }
          case NodeType.table:
            var currentDocumentNode = documentNode.getFirstChild(),
              nextNode = currentDocumentNode.get('after'),
              tableBodies = '';
            if (versionAfter2_10) {
              var mappedItems = documentNode
                .get('align')
                .fill()
                .map(function (item) {
                  return `(${alignmentCommands[item] || 'AlignDefault'},ColWidthDefault)`;
                });
              tableBodies = nextNode
                ? `(TableBody ("",[],[]) (RowHeadColumns 0) [] [${renderChildBlocks(documentNode, ',', currentDocumentNode.get('after'))}])`
                : '(TableBody ("",[],[]) (RowHeadColumns 0) [] [])';
              return `Table ("",[],[]) (Caption Nothing []) [${mappedItems.join(',')}] (TableHead ("",[],[]) [${renderNativeBlock(currentDocumentNode, renderContext)}]) [${tableBodies}] (TableFoot ("",[],[])\n\t\t\t\t[])`;
            }
            var currentMappedItems = documentNode
                .get('align')
                .fill()
                .map(function (item) {
                  return alignmentCommands[item] || 'AlignDefault';
                }),
              localMappedItems = currentMappedItems.map(() => '0.0');
            return (
              'Table [] [' +
              currentMappedItems.join(',') +
              '] [' +
              localMappedItems.join(',') +
              '] [' +
              renderChildBlocks(currentDocumentNode) +
              '] [' +
              (nextNode
                ? renderChildBlocks(documentNode, ',', currentDocumentNode.get('after'))
                : '[]') +
              ']'
            );
          case NodeType.table_row:
            if (versionAfter2_10) {
              return `Row ("",[],[]) [${renderChildBlocks(documentNode)}]`;
            } else {
              return '[' + renderChildBlocks(documentNode) + ']';
            }
          case NodeType.table_cell:
            if (versionAfter2_10) {
              return `Cell ("",[],[]) AlignDefault (RowSpan 1) (ColSpan 1) [Plain [${renderNativeInlineContent(documentNode)}]]`;
            } else {
              return '[Plain [' + renderNativeInlineContent(documentNode) + ']]';
            }
          case NodeType.html_block:
            var exportHtml = htmlBlocks.buildHTMLForExport(
                documentNode.get('text'),
                File.editor,
                renderContext.target,
              ),
              localText = '';
            if (useRawHtml) {
              localText = htmlBlocks.convertToXHTML(exportHtml);
              return (
                'RawBlock (Format "html") "' +
                escapeNativeString(localText.replace(/\r\n/g, '')) +
                '"'
              );
            }
            try {
              localText = $.parseHTML(exportHtml)[0].textContent || '';
            } catch (currentError) {}
            return 'Para [Str "' + escapeNativeString(localText) + '"]';
          default:
            return '';
        }
      },
      'name',
      { value: 'B', configurable: true },
    ),
    inlineConstructors = [];
  inlineConstructors[NodeType.strong] = 'Strong';
  inlineConstructors[NodeType.em] = 'Emph';
  inlineConstructors[NodeType.del] = 'Strikeout';
  inlineConstructors[NodeType.subscript] = 'Subscript';
  inlineConstructors[NodeType.superscript] = 'Superscript';
  inlineConstructors[NodeType.underline] = 'Underline';
  var plainInlineLexer,
    underlineFormats = {
      html: 'RawInline (Format "html") "<u>", $0, RawInline (Format "html") "</u>", ',
      docx: 'RawInline (Format "openxml") "<w:r><w:rPr><w:u w:val=\\"single\\" /></w:rPr><w:t>$0</w:t></w:r>", ',
      rtf: 'RawInline (Format "rtf") "{\\\\ul ", $0, RawInline (Format "rtf") " }", ',
      latex: 'RawInline (Format "latex") "\\\\underline{", $0, RawInline (Format "latex") "}", ',
    },
    highlightFormats = {
      html: 'RawInline (Format "html") "<mark>", $0, RawInline (Format "html") "</mark>", ',
      docx: 'RawInline (Format "openxml") "<w:r><w:rPr><w:shd w:val=\\"clear\\" w:fill=\\"ffff00\\" /></w:rPr><w:t>$0</w:t></w:r>", ',
      rtf: 'RawInline (Format "rtf") "{{\\\\colortbl;\\\\red255\\\\green255\\\\blue0;} \\\\cb1 ", $0, RawInline (Format "rtf") "}", ',
      latex: 'RawInline (Format "latex") "\\\\hl{", $0, RawInline (Format "latex") "}", ',
    },
    skipOp = { atag: false, imgtag: false, comment: true },
    renderPlainInlineText = Object.defineProperty(
      function (token) {
        var readInlineTokenText = Object.defineProperty(
          function (token) {
            return token.inner || token.text || '';
          },
          'name',
          { value: 't', configurable: true },
        );
        if (!plainInlineLexer) {
          plainInlineLexer = new markdownParser.InlineLexer(
            { skipOp: skipOp },
            readInlineTokenText,
          );
        }
        try {
          return plainInlineLexer.output(token.text, readInlineTokenText, true);
        } catch (error) {
          return false;
        }
      },
      'name',
      { value: 'j', configurable: true },
    ),
    renderNativeInlineToken = Object.defineProperty(
      function (token, renderContext) {
        var documentNode,
          linkTarget,
          linkTitle,
          linkConstructor,
          currentHighlightFormats,
          plainText,
          wordPattern = /^(\S*)(?:(\n)|(\s*))/,
          renderNativeText = Object.defineProperty(
            function (textSlice) {
              for (
                var match, nativeText = '';
                textSlice.length && (match = wordPattern.exec(textSlice));
              ) {
                textSlice = textSlice.substring(match[0].length);
                if (match[1]) {
                  nativeText += 'Str "' + escapeNativeString(match[1]) + '", ';
                }
                if (match[2]) {
                  nativeText += File.option.preLinebreakOnExport ? 'LineBreak, ' : 'SoftBreak, ';
                } else {
                  if (match[3]) {
                    nativeText += 'Space, ';
                  }
                }
              }
              return nativeText;
            },
            'name',
            { value: 'u', configurable: true },
          );
        if (token.inner) {
          token.inner = token.inner.replace(/, $/, '');
        }
        var fileProtocolPattern = /^file:[\\\/]{0,2}/i;
        switch (token.type) {
          case NodeType.strong:
          case NodeType.em:
          case NodeType.del:
          case NodeType.subscript:
          case NodeType.superscript:
            return inlineConstructors[token.type] + ' [' + token.inner + '], ';
          case NodeType.plain:
          case NodeType.escape:
          case NodeType.tab:
          case NodeType.emptyline:
            return renderNativeText(token.text);
          case NodeType.html_entity:
            return renderNativeText(utilities.decodeHtmlEntity(token.text) || token.text);
          case NodeType.pants:
            return renderNativeText(token.inner);
          case NodeType.softbreak:
            if (File.option.preLinebreakOnExport) {
              return 'LineBreak, ';
            } else {
              return 'SoftBreak, ';
            }
          case NodeType.code:
            return 'Code ("", [], []) "' + escapeNativeString(token.text.trim()) + '", ';
          case NodeType.autolink:
          case NodeType.url:
            return (
              'Link ("", [], []) [Str "' +
              escapeNativeString(token.text) +
              '"] ("' +
              escapeNativeString(token.href) +
              '", ""), '
            );
          case NodeType.atag:
            if (!requiresRawHtml(renderContext.target)) {
              return (
                'Link ("", [], []) [' +
                token.inner +
                '] ("' +
                escapeNativeString(token.href) +
                '", "' +
                escapeNativeString('') +
                '"), '
              );
            }
          case NodeType.imgtag:
            if (!requiresRawHtml(renderContext.target)) {
              var element = $($.parseHTML(token.text));
              return (
                'Image ("",[],[]) [Str "' +
                escapeNativeString(element.attr('title') || element.attr('alt') || '') +
                '"] ("' +
                escapeNativeString(
                  File.editor.imgEdit.getRealSrc(token.href).replace(fileProtocolPattern, ''),
                ) +
                '","fig:"), '
              );
            }
          case NodeType.tag:
          case NodeType.comment:
          case NodeType.ruby:
            return 'RawInline (Format "html") "' + escapeNativeString(token.text) + '", ';
          case NodeType.link:
            if ('#' == (token.href || '').trim()[0]) {
              token.href = dialogs.normalizeAnchor(token.href, renderContext.anchorList);
            }
            return (
              'Link ("", [], []) [' +
              token.inner +
              '] ("' +
              escapeNativeString(token.href) +
              '", "' +
              escapeNativeString(token.title || '') +
              '"), '
            );
          case NodeType.image:
            return (
              'Image ("",[],[]) [Str "' +
              escapeNativeString(token.title || '') +
              '"] ("' +
              escapeNativeString(
                File.editor.imgEdit.getRealSrc(token.href).replace(fileProtocolPattern, ''),
              ) +
              '","fig:"), '
            );
          case NodeType.refimg:
            linkConstructor = 'Image';
          case NodeType.reflink:
            linkTarget = (documentNode = renderContext.nodeMap.link_list.getNodeByRef(
              token.ref || token.text,
            ))
              ? escapeNativeString(documentNode.get('href').replace(fileProtocolPattern, ''))
              : '';
            linkTitle = escapeNativeString((documentNode && documentNode.get('title')) || '');
            if ('Image' == (linkConstructor = linkConstructor || 'Link')) {
              token.inner = 'Str "' + escapeNativeString(linkTitle || '') + '"';
            }
            return (
              linkConstructor +
              ' ("", [], []) [' +
              token.inner +
              '] ("' +
              linkTarget +
              '", "' +
              linkTitle +
              '"), '
            );
          case NodeType.footnote:
            var footnoteNode = renderContext.nodeMap.foot_list.getNodeByRef(token.text);
            if (footnoteNode) {
              return 'Note [Para [' + renderNativeInlineContent(footnoteNode) + ']], ';
            } else {
              return renderNativeText(token.text);
            }
          case NodeType.attr:
            return renderNativeText(token.text);
          case NodeType.emoji:
            return 'Str "' + escapeNativeString(token.inner) + '", ';
          case NodeType.inline_math:
            if ('epub' == renderContext.target) {
              var mathMl = DOMPurify.sanitize(
                MathJax.tex2mml(token.text.replace(/(^\s*\$+)|(\$+\s*$)|\u200b/g, '').trim(), {
                  display: false,
                }),
                svgSanitizerOptions,
              );
              if (mathMl) {
                return 'RawInline (Format "html") ' + JSON.stringify(mathMl) + ', ';
              }
            }
            return (
              'Math InlineMath "' +
              escapeNativeString(token.text.replace(/(^\s*\$+)|(\$+\s*$)|\u200b/g, '')) +
              '", '
            );
          case NodeType.br:
          case NodeType.linebreak:
            return 'LineBreak, ';
          case NodeType.highlight:
            if ('latex' == renderContext.target) {
              if (-1 == textParts.indexOf('\\usepackage{color}')) {
                textParts.push('\\usepackage{color}');
                textParts.push('\\usepackage{soulutf8}');
              }
            } else {
              if ('docx' == renderContext.target) {
                plainText = renderPlainInlineText(token);
                return highlightFormats[renderContext.target].replace(
                  '$0',
                  escapeNativeString(utilities.escape(plainText)),
                );
              }
            }
            return (
              (currentHighlightFormats = highlightFormats)[renderContext.target] ||
              currentHighlightFormats.html
            ).replace('$0', token.inner);
          case NodeType.alert_text:
            if (isMarkdownTarget(renderContext.target)) {
              return renderNativeText(token.text || '');
            } else {
              return (
                inlineConstructors[NodeType.strong] +
                ' [' +
                renderNativeText(utilities.capitalize(token.inner)).replace(/,\s*$/, '') +
                '], LineBreak, '
              );
            }
          case NodeType.underline:
            if (renderContext.versionAfter2_10) {
              return inlineConstructors[token.type] + ' [' + token.inner + '], ';
            } else {
              currentHighlightFormats = underlineFormats;
              if ('docx' == renderContext.target) {
                plainText = renderPlainInlineText(token);
                return currentHighlightFormats[renderContext.target].replace(
                  '$0',
                  escapeNativeString(utilities.escape(plainText)),
                );
              } else {
                return (
                  currentHighlightFormats[renderContext.target] || currentHighlightFormats.html
                ).replace('$0', token.inner);
              }
            }
          default:
            return renderNativeText(token.text || '');
        }
      },
      'name',
      { value: 'q', configurable: true },
    );
  DocumentMap.prototype.exportToNative = function (
    targetFormat,
    onComplete,
    assetDirectory,
    exportOptions,
  ) {
    File.editor.export.cleanUpTempFiles = removeTemporaryDiagramFiles;
    exportOptions = exportOptions || {};
    (function (target) {
      exportContext = {
        forExport: true,
        target: target,
        nodeMap: this,
        skipOp: skipOp,
        version: window.pandocVersion,
      };
      textParts = [];
      items = [];
      set = new Set();
      if (void 0 === File.canvasratio) {
        File.canvasratio = 1;
        var canvasContext = document.createElement('canvas').getContext('2d'),
          deviceRatio = window.devicePixelRatio || 1,
          backingRatio =
            canvasContext.webkitBackingStorePixelRatio ||
            canvasContext.mozBackingStorePixelRatio ||
            canvasContext.msBackingStorePixelRatio ||
            canvasContext.oBackingStorePixelRatio ||
            canvasContext.backingStorePixelRatio ||
            1;
        File.canvasratio = deviceRatio / backingRatio;
      }
    }).call(this, targetFormat);
    if ('epub' == targetFormat) {
      File.editor.mathBlock.saveMathState();
      MathJax.texReset(0);
    }
    exportOptions = Object.assign({}, exportContext, exportOptions);
    if (!(nativeInlineLexer && nativeInlineLexer.options.nodeMap === this)) {
      nativeInlineLexer = new markdownParser.InlineLexer(exportOptions, renderNativeInlineToken);
    }
    exportOptions.anchorMap = {};
    exportOptions.anchorList = dialogs.fetchAnchorList(exportOptions.anchorMap);
    exportOptions.versionAfter2_10 = utilities.compareVersion(exportOptions.version, '2.10') >= 0;
    var text = renderNativeChildren(null, '\n ,', this.getFirst(), exportOptions),
      metadata = File.editor.docMenu.buildMetaMap() || {},
      tableOfContents = null;
    text = text.replace(/\uE088/g, function () {
      if (null === tableOfContents) {
        tableOfContents = (function (documentMap, linkHeadings, headingAnchors) {
          try {
            return (
              'Div ("toc", [], []) [Para [' +
              documentMap.toc.headers
                .map(
                  linkHeadings
                    ? function (documentNode) {
                        return (
                          'Str "' +
                          ' '.repeat(documentNode.get('depth') - 1) +
                          '", Link ("", [], []) [' +
                          renderNativeInlineContent(documentNode) +
                          `] ("#${headingAnchors[documentNode.cid] || 'header-' + documentNode.cid}","")`
                        );
                      }
                    : function (documentNode) {
                        return (
                          'Str "' +
                          '\\t'.repeat(documentNode.get('depth') - 1) +
                          '", Link ("", [], []) [' +
                          renderNativeInlineContent(documentNode) +
                          `] ("#${headingAnchors[documentNode.cid] || 'header-' + documentNode.cid}","")`
                        );
                      },
                )
                .join(',LineBreak,') +
              ']]'
            );
          } catch (error) {
            console.warn(error.stack);
            return 'Para [Str ""]';
          }
        })(File.editor.nodeMap, requiresRawHtml(targetFormat), exportOptions.anchorMap);
      }
      return tableOfContents;
    });
    if ('epub' == targetFormat && void 0 == metadata.title) {
      metadata.title = utilities.capitalizeEachWord(
        (File.bundle.fileName || '').replace(/\.[^.]+$/, '').replace(/-/g, ' '),
      );
    }
    var nativeDocument =
      'Pandoc (Meta {unMeta = fromList [' +
      (function (metadata) {
        Object.defineProperty(renderMetadataEntry, 'name', { value: 'n', configurable: true });
        Object.defineProperty(renderMetadataValue, 'name', { value: 'i', configurable: true });

        var localItems = [];
        function renderMetadataEntry(metadataKey, metadataValue) {
          if (
            'cover-image' == metadataKey &&
            'string' == typeof metadataValue &&
            /^\.+[\\\/]/.exec(metadataValue)
          ) {
            metadataValue = fileIntegration.normalizePath(
              (fileIntegration.getCurrentFileFolderPath() || '') + '/' + (metadataValue || ''),
            );
          }
          return `("${escapeNativeString(metadataKey)}",${renderMetadataValue(metadataValue)})`;
        }
        function renderMetadataValue(inputItems) {
          if ('string' == typeof inputItems) {
            if (/^\\[a-zA-Z]/.exec(inputItems)) {
              return `${inputItems.indexOf('\n') > -1 ? 'MetaBlocks [ RawBlock' : 'MetaInlines [ RawInline'} (Format "tex") "${escapeNativeString(inputItems)}"]`;
            } else {
              return (
                'MetaInlines [ ' +
                (nativeInlineLexer.output(inputItems).replace(/, $/, '') || 'Str ""') +
                ']'
              );
            }
          } else {
            if (inputItems instanceof Array) {
              return 'MetaList [' + inputItems.map(renderMetadataValue).join(', ') + ']';
            } else {
              return `MetaMap ( fromList [${Object.keys(inputItems)
                .map((item) => renderMetadataEntry(item, inputItems[item]))
                .join(', ')}])`;
            }
          }
        }
        for (var metadataKey in (textParts.length &&
          (metadata['header-includes'] && 'string' == typeof metadata['header-includes']
            ? (metadata['header-includes'] = metadata['header-includes'] + textParts.join('\n'))
            : (metadata['header-includes'] = textParts.join('\n'))),
        metadata)) {
          localItems.push(renderMetadataEntry(metadataKey, metadata[metadataKey]));
        }
        return localItems;
      })(metadata) +
      ']})\n [' +
      text +
      ']';
    if (DocumentNode.isType(targetFormat, 'epub', 'docx', 'odt', 'latex')) {
      resolveDiagramPlaceholders(nativeDocument, onComplete, targetFormat, assetDirectory);
    } else {
      onComplete(nativeDocument);
    }
    if ('epub' == targetFormat) {
      File.editor.mathBlock.restoreMathState();
    }
    return nativeDocument;
  };
}
