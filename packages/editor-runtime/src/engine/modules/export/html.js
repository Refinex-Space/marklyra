// export/html.
// SystemJS module 43. Dependencies: 13, 11, 1c, 15, 19, 17, 33, 2a, 29.
$__System.registerDynamic(
  '43',
  ['13', '11', '1c', '15', '19', '17', '33', '2a', '29'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      DocumentMap = documentModel.NodeMap,
      NodeType = documentModel.TYPE,
      utilities = requireModule('11'),
      mathBlocks = requireModule('1c'),
      diagrams = requireModule('15'),
      markdownParser = requireModule('19'),
      htmlBlocks = requireModule('17'),
      fileIntegration = requireModule('33'),
      mediaActions = requireModule('2a'),
      dialogs = requireModule('29'),
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
      USE_PROFILES: { mathMl: !0, svg: !0 },
      ALLOW_DATA_ATTR: !1,
      ADD_ATTR: ['id', 'style'],
    };
    var items,
      set,
      diagramPlaceholder = '',
      exportContext = {},
      textParts = [],
      currentItems = [];
    function F(text, onComplete, targetFormat, assetDirectory) {
      var parts = text.split(/(\uE040\d+)\uE041/g);
      if (!parts) return onComplete(text);
      Promise.all(
        parts.map(async function (inputText) {
          if (inputText.charAt(0) == diagramPlaceholder) {
            var diagramIndex = inputText.substring(1) - 0,
              nodeId = items[diagramIndex].cid,
              diagramPath = await (async function (nodeId) {
                var element = document.querySelector("[cid='" + nodeId + "'] svg"),
                  elementLength = $(element).closest("[lang='mermaid']").length,
                  temporaryImagePath = await mediaActions.saveSVGToTempPath(element, elementLength);
                return (
                  temporaryImagePath && currentItems.push(temporaryImagePath), temporaryImagePath
                );
              })(nodeId);
            return (
              set.delete(nodeId),
              'latex' == targetFormat &&
                (diagramPath = await ((source = diagramPath),
                (folder = assetDirectory),
                folder
                  ? new Promise(function (resolvePromise) {
                      if (File.isNode) {
                        var fileName = reqnode('path').basename(source);
                        reqnode('fs-extra').move(source, folder + '/' + fileName, function () {
                          resolvePromise(fileName);
                        });
                      } else
                        File.isMac &&
                          bridge.callHandler(
                            'path.moveTo',
                            { source: source, folder: folder },
                            resolvePromise,
                          );
                    })
                  : Promise.resolve(source))),
              JSON.stringify(diagramPath)
            );
          }
          return inputText;
          var source, folder;
        }),
      ).then(
        function (result) {
          (text = result.join('')), onComplete(text);
        },
        function (unusedParameter1) {
          (text = parts.join('').replace(/[\uE040-\uE041]/g, '')), onComplete(text);
        },
      );
    }
    function S() {
      if (File.isNode)
        for (; currentItems.length; ) reqnode('fs').unlink(currentItems.pop(), function () {});
      else
        File.isMac && (bridge.callHandler('path.removeFiles', currentItems), (currentItems = []));
    }
    var nativeInlineLexer,
      E = function (literalText) {
        return markdownParser
          .recoverEscape(literalText)
          .replace(/["'\\\b\t\n\f\r]/g, function (escapedCharacter) {
            return escapeSequences[escapedCharacter];
          })
          .replace(/\u200b/g, '');
      },
      alignmentCommands = { left: 'AlignLeft', right: 'AlignRight', center: 'AlignCenter' },
      _ = function (documentNode, separator, firstChild, renderContext, inlinePrefix) {
        (separator = void 0 === separator ? ',' : separator),
          (renderContext = renderContext || exportContext);
        for (
          var nativeBlock,
            currentTextParts = [],
            currentDocumentNode = firstChild || documentNode.getFirstChild();
          currentDocumentNode;
        )
          (nativeBlock = B(currentDocumentNode, renderContext, inlinePrefix)) &&
            currentTextParts.push(nativeBlock),
            (currentDocumentNode = currentDocumentNode.get('after'));
        return currentTextParts.join(separator);
      },
      A = function (documentNode, sourceText) {
        sourceText = sourceText || documentNode.get('text');
        var parentNode = documentNode.get('parent'),
          inlineOptions = {};
        return (
          DocumentNode.isType(documentNode, NodeType.paragraph) &&
            !documentNode.get('before') &&
            DocumentNode.isType(parentNode, NodeType.blockquote) &&
            parentNode.get('alert') &&
            (inlineOptions.alert = !0),
          nativeInlineLexer.output(sourceText, void 0, void 0, inlineOptions).replace(/, $/, '') ||
            'Str ""'
        );
      },
      M = function (targetFormat) {
        return DocumentNode.isType(targetFormat, 'epub', 'rst', 'opml', 'textile', 'markdown');
      },
      L = function (targetFormat) {
        return DocumentNode.isType(targetFormat, 'gfm', 'markdown');
      },
      mathTagPattern = /([^\\]|^)\\tag{([^}]+)}\s*/,
      mathLabelPattern = /([^\\]|^)\\label{([^}]+)}\s*/,
      mathOverPattern = /([^\\]|^)\\over[^\w\d]/,
      B = function (documentNode, renderContext, inlinePrefix) {
        var text,
          o = function (parentNode, separator, firstChild, childPrefix) {
            return _(parentNode, separator, firstChild, renderContext, childPrefix);
          },
          useRawHtml = M(renderContext.target),
          p = function (inputDocumentNode, renderContext) {
            if (
              ((text = inputDocumentNode
                .get('text')
                .trim()
                .replace(/\u200b/g, '')),
              'epub' == renderContext.target)
            ) {
              var mathMl = DOMPurify.sanitize(
                MathJax.tex2mml(text, { display: !0 }),
                svgSanitizerOptions,
              );
              if (mathMl)
                return (
                  'RawBlock (Format "html") ' +
                  JSON.stringify(
                    (function (mathMlText) {
                      try {
                        var mathDocument = new DOMParser().parseFromString(mathMlText, 'text/html');
                        return (
                          mathDocument.querySelectorAll('mtable').forEach(function (element) {
                            element.hasAttribute('columnalign') &&
                              !element.getAttribute('columnalign') &&
                              element.removeAttribute('columnalign');
                          }),
                          mathDocument.body.innerHTML
                        );
                      } catch (error) {}
                      return mathMlText;
                    })(mathMl),
                  ) +
                  ' '
                );
            } else if ('latex' == renderContext.target) {
              if (
                text.match(
                  /^\\(begin|newcommand|renewcommand|newenvironment|renewenvironment|def|let){/,
                )
              )
                return 'RawBlock (Format "latex") ' + JSON.stringify(text);
            } else if (
              'docx' == renderContext.target &&
              ((text = text.replace(/\n[\\]+\n/g, '\n')),
              File.option.autoNumberingForMath && !/\\nonumber\s*$/.exec(text))
            ) {
              var mathSourceAndNumber = (function (inputText, numberingState) {
                var number;
                if (
                  ((numberingState.number = numberingState.number || 1),
                  File.option.autoNumberingForMath &&
                    ((number = numberingState.number), numberingState.number++),
                  mathOverPattern.test(inputText))
                )
                  return [inputText, number];
                var match = mathTagPattern.exec(inputText);
                return (
                  (inputText = inputText.replace(/([^\\]|^)\\eqref{([^}]+)}\s*/g, '$1($2)')),
                  match
                    ? ((number = match[2]),
                      [
                        (inputText =
                          inputText.replace(/([^\\]|^)\\tag{([^}]+)}\s*/g, '$1') +
                          '\\qquad\\text{(' +
                          utilities.escapeInQuote(number) +
                          ')}'),
                        number,
                      ])
                    : ((inputText = inputText +=
                        '\\qquad\\text{(' + utilities.escapeInQuote(number + '') + ')}'),
                      (match = mathLabelPattern.exec(inputText)) && (number = match[2]),
                      [inputText, number])
                );
              })(text, renderContext);
              return (
                'Plain [' +
                ['Math DisplayMath "' + E(mathSourceAndNumber[0]) + '" '].join(',') +
                ']'
              );
            }
            return 'Plain [Math DisplayMath "' + E(text) + '"]';
          },
          versionAfter2_10 = renderContext.versionAfter2_10;
        switch (documentNode.get('type')) {
          case NodeType.paragraph:
            return (text = A(documentNode)), 'Para [' + (inlinePrefix || '') + text + ']';
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
              A(documentNode) +
              ']'
            );
          case NodeType.blockquote:
            return (
              (text = o(documentNode)),
              !L(renderContext.target) &&
              DocumentNode.isType(
                documentNode.get('alert'),
                'note',
                'warning',
                'important',
                'tip',
                'caution',
              )
                ? `Div ("", ["${documentNode.get('alert')}", "alert"], []) [${text}]`
                : 'BlockQuote [' + text + ']'
            );
          case NodeType.list:
            var style = documentNode.get('style');
            return (
              (text = o(documentNode)),
              style == DocumentNode.ListType.ol
                ? 'OrderedList (1,Decimal,Period) [' + text + ']'
                : 'BulletList [' + text + ']'
            );
          case NodeType.list_item:
            let taskPrefix = '';
            return (
              documentNode.get('parent') &&
                documentNode.get('style') === DocumentNode.ListType.task &&
                (taskPrefix = documentNode.get('checked')
                  ? 'Str "\\9746" , Space , '
                  : 'Str "\\9744" , Space , '),
              '[' + (text = o(documentNode, void 0, void 0, taskPrefix)) + ']'
            );
          case NodeType.fences:
            if (
              diagrams.isDiagramType(documentNode.get('lang')) &&
              DocumentNode.isType(renderContext.target, 'epub', 'docx', 'odt', 'latex')
            ) {
              items.push(documentNode), set.add(documentNode.cid);
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
            if (mathBlocks.isMathType(documentNode.get('lang')))
              return p(documentNode, renderContext);
            var codeAttributes = markdownParser.parsePandocAttr(documentNode.get('lang'));
            if (Object.keys(codeAttributes).length) {
              var currentTextParts = [];
              for (var currentText in codeAttributes.nativeAttr)
                currentTextParts.push(
                  '("' +
                    currentText.replace(/['"]/g, '') +
                    '","' +
                    codeAttributes.nativeAttr[currentText].replace(/['"]/g, '') +
                    '")',
                );
              return (
                'CodeBlock ("' +
                E(codeAttributes.id || '') +
                '",[' +
                (codeAttributes.class || '')
                  .trim()
                  .split(/\s+/)
                  .map(function (item) {
                    return '"' + E(item) + '"';
                  })
                  .join(',') +
                '],[' +
                currentTextParts.join(',') +
                ']) "' +
                E(documentNode.get('text')) +
                '"'
              );
            }
            return (
              'CodeBlock ("",["' +
              E(getCodeMirrorMode(documentNode.get('lang') || '', !1, !0, !0)) +
              '"],[]) "' +
              E(documentNode.get('text')) +
              '"'
            );
          case NodeType.math_block:
            return p(documentNode, renderContext);
          case NodeType.hr:
            return 'HorizontalRule';
          case NodeType.def_footnote:
          case NodeType.def_link:
            return '';
          case NodeType.toc:
            return 'latex' == renderContext.target
              ? 'RawBlock (Format "latex") "\\\\tableofcontents"'
              : 'wiki' == renderContext.target
                ? 'RawBlock (Format "mediawiki") "__TOC__", RawBlock (Format "mediawiki") ""'
                : 'rst' == renderContext.target
                  ? 'RawBlock (Format "rst") ".. contents::", RawBlock (Format "rst") "\n"'
                  : 'opml' == renderContext.target
                    ? ''
                    : 'textile' == renderContext.target
                      ? 'RawBlock (Format "textile") "{toc}", RawBlock (Format "textile") "\n"'
                      : '';
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
              return (
                (tableBodies = nextNode
                  ? `(TableBody ("",[],[]) (RowHeadColumns 0) [] [${o(documentNode, ',', currentDocumentNode.get('after'))}])`
                  : '(TableBody ("",[],[]) (RowHeadColumns 0) [] [])'),
                `Table ("",[],[]) (Caption Nothing []) [${mappedItems.join(',')}] (TableHead ("",[],[]) [${B(currentDocumentNode, renderContext)}]) [${tableBodies}] (TableFoot ("",[],[])\n\t\t\t\t[])`
              );
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
              o(currentDocumentNode) +
              '] [' +
              (nextNode ? o(documentNode, ',', currentDocumentNode.get('after')) : '[]') +
              ']'
            );
          case NodeType.table_row:
            return versionAfter2_10
              ? `Row ("",[],[]) [${o(documentNode)}]`
              : '[' + o(documentNode) + ']';
          case NodeType.table_cell:
            return versionAfter2_10
              ? `Cell ("",[],[]) AlignDefault (RowSpan 1) (ColSpan 1) [Plain [${A(documentNode)}]]`
              : '[Plain [' + A(documentNode) + ']]';
          case NodeType.html_block:
            var exportHtml = htmlBlocks.buildHTMLForExport(
                documentNode.get('text'),
                File.editor,
                renderContext.target,
              ),
              localText = '';
            if (useRawHtml)
              return (
                (localText = htmlBlocks.convertToXHTML(exportHtml)),
                'RawBlock (Format "html") "' + E(localText.replace(/\r\n/g, '')) + '"'
              );
            try {
              localText = $.parseHTML(exportHtml)[0].textContent || '';
            } catch (currentError) {}
            return 'Para [Str "' + E(localText) + '"]';
          default:
            return '';
        }
      },
      inlineConstructors = [];
    (inlineConstructors[NodeType.strong] = 'Strong'),
      (inlineConstructors[NodeType.em] = 'Emph'),
      (inlineConstructors[NodeType.del] = 'Strikeout'),
      (inlineConstructors[NodeType.subscript] = 'Subscript'),
      (inlineConstructors[NodeType.superscript] = 'Superscript'),
      (inlineConstructors[NodeType.underline] = 'Underline');
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
      skipOp = { atag: !1, imgtag: !1, comment: !0 },
      j = function (token) {
        var t = function (token) {
          return token.inner || token.text || '';
        };
        plainInlineLexer ||
          (plainInlineLexer = new markdownParser.InlineLexer({ skipOp: skipOp }, t));
        try {
          return plainInlineLexer.output(token.text, t, !0);
        } catch (error) {
          return !1;
        }
      },
      q = function (token, renderContext) {
        var documentNode,
          linkTarget,
          linkTitle,
          linkConstructor,
          currentHighlightFormats,
          plainText,
          wordPattern = /^(\S*)(?:(\n)|(\s*))/,
          u = function (textSlice) {
            for (
              var match, nativeText = '';
              textSlice.length && (match = wordPattern.exec(textSlice));
            )
              (textSlice = textSlice.substring(match[0].length)),
                match[1] && (nativeText += 'Str "' + E(match[1]) + '", '),
                match[2]
                  ? (nativeText += File.option.preLinebreakOnExport ? 'LineBreak, ' : 'SoftBreak, ')
                  : match[3] && (nativeText += 'Space, ');
            return nativeText;
          };
        token.inner && (token.inner = token.inner.replace(/, $/, ''));
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
            return u(token.text);
          case NodeType.html_entity:
            return u(utilities.decodeHtmlEntity(token.text) || token.text);
          case NodeType.pants:
            return u(token.inner);
          case NodeType.softbreak:
            return File.option.preLinebreakOnExport ? 'LineBreak, ' : 'SoftBreak, ';
          case NodeType.code:
            return 'Code ("", [], []) "' + E(token.text.trim()) + '", ';
          case NodeType.autolink:
          case NodeType.url:
            return (
              'Link ("", [], []) [Str "' + E(token.text) + '"] ("' + E(token.href) + '", ""), '
            );
          case NodeType.atag:
            if (!M(renderContext.target))
              return (
                'Link ("", [], []) [' +
                token.inner +
                '] ("' +
                E(token.href) +
                '", "' +
                E('') +
                '"), '
              );
          case NodeType.imgtag:
            if (!M(renderContext.target)) {
              var element = $($.parseHTML(token.text));
              return (
                'Image ("",[],[]) [Str "' +
                E(element.attr('title') || element.attr('alt') || '') +
                '"] ("' +
                E(File.editor.imgEdit.getRealSrc(token.href).replace(fileProtocolPattern, '')) +
                '","fig:"), '
              );
            }
          case NodeType.tag:
          case NodeType.comment:
          case NodeType.ruby:
            return 'RawInline (Format "html") "' + E(token.text) + '", ';
          case NodeType.link:
            return (
              '#' == (token.href || '').trim()[0] &&
                (token.href = dialogs.normalizeAnchor(token.href, renderContext.anchorList)),
              'Link ("", [], []) [' +
                token.inner +
                '] ("' +
                E(token.href) +
                '", "' +
                E(token.title || '') +
                '"), '
            );
          case NodeType.image:
            return (
              'Image ("",[],[]) [Str "' +
              E(token.title || '') +
              '"] ("' +
              E(File.editor.imgEdit.getRealSrc(token.href).replace(fileProtocolPattern, '')) +
              '","fig:"), '
            );
          case NodeType.refimg:
            linkConstructor = 'Image';
          case NodeType.reflink:
            return (
              (linkTarget = (documentNode = renderContext.nodeMap.link_list.getNodeByRef(
                token.ref || token.text,
              ))
                ? E(documentNode.get('href').replace(fileProtocolPattern, ''))
                : ''),
              (linkTitle = E((documentNode && documentNode.get('title')) || '')),
              'Image' == (linkConstructor = linkConstructor || 'Link') &&
                (token.inner = 'Str "' + E(linkTitle || '') + '"'),
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
            return footnoteNode ? 'Note [Para [' + A(footnoteNode) + ']], ' : u(token.text);
          case NodeType.attr:
            return u(token.text);
          case NodeType.emoji:
            return 'Str "' + E(token.inner) + '", ';
          case NodeType.inline_math:
            if ('epub' == renderContext.target) {
              var mathMl = DOMPurify.sanitize(
                MathJax.tex2mml(token.text.replace(/(^\s*\$+)|(\$+\s*$)|\u200b/g, '').trim(), {
                  display: !1,
                }),
                svgSanitizerOptions,
              );
              if (mathMl) return 'RawInline (Format "html") ' + JSON.stringify(mathMl) + ', ';
            }
            return (
              'Math InlineMath "' + E(token.text.replace(/(^\s*\$+)|(\$+\s*$)|\u200b/g, '')) + '", '
            );
          case NodeType.br:
          case NodeType.linebreak:
            return 'LineBreak, ';
          case NodeType.highlight:
            if ('latex' == renderContext.target)
              -1 == textParts.indexOf('\\usepackage{color}') &&
                (textParts.push('\\usepackage{color}'), textParts.push('\\usepackage{soulutf8}'));
            else if ('docx' == renderContext.target)
              return (
                (plainText = j(token)),
                highlightFormats[renderContext.target].replace('$0', E(utilities.escape(plainText)))
              );
            return (
              (currentHighlightFormats = highlightFormats)[renderContext.target] ||
              currentHighlightFormats.html
            ).replace('$0', token.inner);
          case NodeType.alert_text:
            return L(renderContext.target)
              ? u(token.text || '')
              : inlineConstructors[NodeType.strong] +
                  ' [' +
                  u(utilities.capitalize(token.inner)).replace(/,\s*$/, '') +
                  '], LineBreak, ';
          case NodeType.underline:
            return renderContext.versionAfter2_10
              ? inlineConstructors[token.type] + ' [' + token.inner + '], '
              : ((currentHighlightFormats = underlineFormats),
                'docx' == renderContext.target
                  ? ((plainText = j(token)),
                    currentHighlightFormats[renderContext.target].replace(
                      '$0',
                      E(utilities.escape(plainText)),
                    ))
                  : (
                      currentHighlightFormats[renderContext.target] || currentHighlightFormats.html
                    ).replace('$0', token.inner));
          default:
            return u(token.text || '');
        }
      };
    DocumentMap.prototype.exportToNative = function (
      targetFormat,
      onComplete,
      assetDirectory,
      exportOptions,
    ) {
      (File.editor.export.cleanUpTempFiles = S),
        (exportOptions = exportOptions || {}),
        function (target) {
          if (
            ((exportContext = {
              forExport: !0,
              target: target,
              nodeMap: this,
              skipOp: skipOp,
              version: window.pandocVersion,
            }),
            (textParts = []),
            (items = []),
            (set = new Set()),
            void 0 === File.canvasratio)
          ) {
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
        }.call(this, targetFormat),
        'epub' == targetFormat && (File.editor.mathBlock.saveMathState(), MathJax.texReset(0)),
        (exportOptions = Object.assign({}, exportContext, exportOptions)),
        (nativeInlineLexer && nativeInlineLexer.options.nodeMap === this) ||
          (nativeInlineLexer = new markdownParser.InlineLexer(exportOptions, q)),
        (exportOptions.anchorMap = {}),
        (exportOptions.anchorList = dialogs.fetchAnchorList(exportOptions.anchorMap)),
        (exportOptions.versionAfter2_10 =
          utilities.compareVersion(exportOptions.version, '2.10') >= 0);
      var text = _(null, '\n ,', this.getFirst(), exportOptions),
        metadata = File.editor.docMenu.buildMetaMap() || {},
        tableOfContents = null;
      (text = text.replace(/\uE088/g, function () {
        return (
          null === tableOfContents &&
            (tableOfContents = (function (documentMap, linkHeadings, headingAnchors) {
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
                              A(documentNode) +
                              `] ("#${headingAnchors[documentNode.cid] || 'header-' + documentNode.cid}","")`
                            );
                          }
                        : function (documentNode) {
                            return (
                              'Str "' +
                              '\\t'.repeat(documentNode.get('depth') - 1) +
                              '", Link ("", [], []) [' +
                              A(documentNode) +
                              `] ("#${headingAnchors[documentNode.cid] || 'header-' + documentNode.cid}","")`
                            );
                          },
                    )
                    .join(',LineBreak,') +
                  ']]'
                );
              } catch (error) {
                return console.warn(error.stack), 'Para [Str ""]';
              }
            })(File.editor.nodeMap, M(targetFormat), exportOptions.anchorMap)),
          tableOfContents
        );
      })),
        'epub' == targetFormat &&
          void 0 == metadata.title &&
          (metadata.title = utilities.capitalizeEachWord(
            (File.bundle.fileName || '').replace(/\.[^.]+$/, '').replace(/-/g, ' '),
          ));
      var nativeDocument =
        'Pandoc (Meta {unMeta = fromList [' +
        (function (metadata) {
          var localItems = [];
          function n(metadataKey, metadataValue) {
            return (
              'cover-image' == metadataKey &&
                'string' == typeof metadataValue &&
                /^\.+[\\\/]/.exec(metadataValue) &&
                (metadataValue = fileIntegration.normalizePath(
                  (fileIntegration.getCurrentFileFolderPath() || '') + '/' + (metadataValue || ''),
                )),
              `("${E(metadataKey)}",${i(metadataValue)})`
            );
          }
          function i(inputItems) {
            return 'string' == typeof inputItems
              ? /^\\[a-zA-Z]/.exec(inputItems)
                ? `${inputItems.indexOf('\n') > -1 ? 'MetaBlocks [ RawBlock' : 'MetaInlines [ RawInline'} (Format "tex") "${E(inputItems)}"]`
                : 'MetaInlines [ ' +
                  (nativeInlineLexer.output(inputItems).replace(/, $/, '') || 'Str ""') +
                  ']'
              : inputItems instanceof Array
                ? 'MetaList [' + inputItems.map(i).join(', ') + ']'
                : `MetaMap ( fromList [${Object.keys(inputItems)
                    .map((item) => n(item, inputItems[item]))
                    .join(', ')}])`;
          }
          for (var metadataKey in (textParts.length &&
            (metadata['header-includes'] && 'string' == typeof metadata['header-includes']
              ? (metadata['header-includes'] = metadata['header-includes'] + textParts.join('\n'))
              : (metadata['header-includes'] = textParts.join('\n'))),
          metadata))
            localItems.push(n(metadataKey, metadata[metadataKey]));
          return localItems;
        })(metadata) +
        ']})\n [' +
        text +
        ']';
      return (
        DocumentNode.isType(targetFormat, 'epub', 'docx', 'odt', 'latex')
          ? F(nativeDocument, onComplete, targetFormat, assetDirectory)
          : onComplete(nativeDocument),
        'epub' == targetFormat && File.editor.mathBlock.restoreMathState(),
        nativeDocument
      );
    };
  },
);
