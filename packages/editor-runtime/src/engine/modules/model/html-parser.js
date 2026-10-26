// model/html-parser.
export default function initializeModelHtmlParser(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    tableEditor = (documentModel.NodeCollectionUtils, requireModule('editing/table-editor')),
    markdownParser = requireModule('model/markdown-parser'),
    htmlBlocks = requireModule('render/html-blocks'),
    jquery = requireModule('libraries/jquery'),
    blockContainerTags = [
      'CONTENT',
      'HEADER',
      'FOOTER',
      'ARTICLE',
      'SECTION',
      'DIV',
      'P',
      'BLOCKQUOTE',
      'PRE',
      'UL',
      'OL',
      'TABLE',
      'HR',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'DL',
      'DT',
      'DD',
      'TBODY',
      'THEAD',
      'TFOOT',
      'ASID',
      'LI',
      'HTML',
      'BODY',
      'IFRAME',
      'STYLE',
      'SCRIPT',
      'FIGURE',
      'VIDEO',
      'AUDIO',
    ],
    excludedContentTags = [
      'TITLE',
      'SELECT',
      'TEXTAREA',
      'INPUT',
      'BUTTON',
      'SELECT',
      'SCRIPT',
      'CANVAS',
      'META',
      'PROGRESS',
      'HEAD',
      'EMBED',
      'STYLE',
      'TEMPLATE',
      'LINK',
      'NOSCRIPT',
      'MENU',
      'EMBED',
      'OBJECT',
    ],
    extractGistSource = Object.defineProperty(
      function (sourceElements) {
        var elements = sourceElements.find('.gist-file>.gist-data .blob-wrapper');
        if (!elements.length) {
          return null;
        }
        var text = elements
            .find('.blob-code.blob-code-inner')
            .map(function () {
              return this.textContent;
            })
            .toArray()
            .join('\n'),
          lang = /\stype-([^\s]+)/.exec(elements.attr('class') || ['', ''])[1];
        if ('text' == lang) {
          lang = '';
        }
        return { type: NodeType.fences, text: text, lang: lang };
      },
      'name',
      { value: 'p', configurable: true },
    ),
    htmlBlockStartPattern =
      /^\s*<(iframe|div|p|table|details|figure|img|a|video|audio|script|style|meta|svg|pre|code)(\s|\/?>)/,
    markdownTablePattern = /(\S.*\|.*)\n *([-:]+ *\|[-| :]*)\n((?:.*\|.*(?:\n|$))*)/,
    leadingPipeTablePattern = /\|(.+)\n *\|( *[-:]+[-| :]*)\n((?: *\|.*(?:\n|$))*)/,
    parseModes = { NORMAL: 'normal', HTML: 'html' },
    extractMarkdownText = Object.defineProperty(
      function (sourceElements, splitLines, editor, baseUrl, urlRemap) {
        Object.defineProperty(splitOuterWhitespace, 'name', { value: 'a', configurable: true });

        function splitOuterWhitespace(textSlice) {
          var whitespaceParts = ['', textSlice, ''],
            match = /^(\s*)/.exec(textSlice);
          if (match) {
            textSlice = textSlice.substring(match[0].length);
            whitespaceParts[0] = match[0];
          }
          if ((match = /(\s*)$/.exec(textSlice))) {
            textSlice = textSlice.substring(0, textSlice.length - match[0].length);
            whitespaceParts[2] = match[0];
          }
          whitespaceParts[1] = textSlice;
          return whitespaceParts;
        }
        editor = editor || File.editor;
        Object.defineProperty(
          function replaceInlineMarkup(container) {
            var currentElement, text, currentText, formattedParts;
            container.find('img').each(function () {
              var textSlice;
              (currentElement = jquery(this)).text(
                '![' +
                  (currentElement.attr('alt') || currentElement.attr('title') || 'img').replace(
                    /\r?\n/gi,
                    ' ',
                  ) +
                  '](' +
                  ((textSlice = currentElement.attr('src') || ''),
                  File.isMac &&
                    (0 == textSlice.indexOf('file:///') &&
                    -1 == textSlice.substring('file:///'.length).indexOf('/')
                      ? ((textSlice = textSlice.substring('file:///'.length)),
                        (textSlice = utilities.getAbsoluteURL(baseUrl, textSlice)) &&
                          urlRemap &&
                          urlRemap[textSlice] &&
                          (textSlice = urlRemap[textSlice]))
                      : 0 == textSlice.indexOf('webkit-fake-url:') &&
                        (File.isMacWK ||
                          (textSlice = bridge.callSync('images.convertFakeUrl', textSlice)))),
                  -1 == textSlice.indexOf(':/') &&
                    editor &&
                    editor.imgEdit &&
                    (textSlice = editor.imgEdit.resolveImagePath(textSlice)),
                  textSlice) +
                  ')',
              );
              currentElement.replaceWith(currentElement[0].childNodes[0]);
            });
            container.find('span.katex').each(function () {
              let element = this.querySelector('math annotation');
              if (element) {
                jquery(this).replaceWith('$' + element.textContent + '$');
              }
            });
            container.find('strong, b').each(function () {
              currentElement = jquery(this);
              if ('normal' !== this.style.fontWeight) {
                replaceInlineMarkup(currentElement);
                (formattedParts = splitOuterWhitespace(currentElement.text()))[1] =
                  formattedParts[1]
                    ? '**' + formattedParts[1].replace(/([^\\])\*/g, '$1\\*') + '**'
                    : '';
                currentElement.replaceWith(
                  formattedParts.join('').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                );
              }
            });
            container.find('em, i').each(function () {
              replaceInlineMarkup((currentElement = jquery(this)));
              (formattedParts = splitOuterWhitespace(currentElement.text()))[1] = formattedParts[1]
                ? '*' + formattedParts[1].replace(/([^\\*])\*([^*])/g, '$1\\*$2') + '*'
                : '';
              currentElement.replaceWith(
                formattedParts.join('').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
              );
            });
            container.find('code, pre, tt').each(function () {
              (currentElement = jquery(this)).replaceWith(
                '`' + currentElement.text().replace(/</g, '&lt;').replace(/>/g, '&gt;') + '`',
              );
            });
            container.find('del, strike').each(function () {
              replaceInlineMarkup((currentElement = jquery(this)));
              currentElement.replaceWith('~~' + currentElement.text() + '~~');
            });
            container.find('span').each(function () {
              currentElement = jquery(this);
              if (
                !(
                  0 != (this.style.fontWeight || '').indexOf('bold') &&
                  700 != this.style.fontWeight &&
                  900 != this.style.fontWeight
                )
              ) {
                replaceInlineMarkup(currentElement);
                (formattedParts = splitOuterWhitespace(currentElement.text()))[1] =
                  formattedParts[1]
                    ? '**' + formattedParts[1].replace(/([^\\])\*/g, '$1\\*') + '**'
                    : '';
                currentElement.replaceWith(
                  formattedParts.join('').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                );
              }
              if ('italic' == this.style.fontStyle) {
                replaceInlineMarkup(currentElement);
                (formattedParts = splitOuterWhitespace(currentElement.text()))[1] =
                  formattedParts[1]
                    ? '*' + formattedParts[1].replace(/([^\\*])\*([^*])/g, '$1\\*$2') + '*'
                    : '';
                currentElement.replaceWith(
                  formattedParts.join('').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                );
              }
            });
            container.find('br').each(function () {
              (currentElement = jquery(this)).replaceWith('');
            });
            container.find('a[href]:not(:empty)').each(function () {
              replaceInlineMarkup((currentElement = jquery(this)));
              text = utilities.getAbsoluteURL(
                baseUrl,
                utilities.decodeFromEscapedPath(currentElement.attr('href')),
              );
              if (0 == (currentText = currentElement.text()).length) {
                currentElement.replaceWith('');
              } else {
                if (text == currentText && /^(https?|mailto):/.exec(text)) {
                  currentElement.replaceWith(
                    text.replace(/</g, encodeURI('<')).replace(/>/g, encodeURI('>')),
                  );
                } else {
                  currentElement.replaceWith(
                    '[' +
                      currentText.replace(/([^\\])]([^(]|$)/, '$1\\]$2').replace(/\r?\n/gi, ' ') +
                      '](' +
                      text +
                      ')',
                  );
                }
              }
            });
            if (File.option.highlight) {
              container.find('mark').each(function () {
                replaceInlineMarkup((currentElement = jquery(this)));
                currentElement.replaceWith(
                  '==' +
                    currentElement
                      .text()
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/([^\\])\=/, '\\=') +
                    '==',
                );
              });
            }
          },
          'name',
          { value: 'e', configurable: true },
        )(sourceElements);
        var localText = (sourceElements[0].innerText || sourceElements[0].textContent || '')
          .replace(/(^[\r\n]+)|([\r\n]+$)/g, '')
          .replace(/([\r\n]|\u00a0)\s?/gi, ' ');
        if (splitLines) {
          return localText.split(/\uE033/g);
        } else {
          return localText.replace(/\uE033/g, ' ');
        }
      },
      'name',
      { value: 'y', configurable: true },
    );
  moduleExports.parseInlineHTML = function (htmlText, editor, baseUrl, urlRemap) {
    var sourceContainer = jquery(jquery.parseHTML('<div>' + htmlText + '</div>')[0]);
    sourceContainer
      .find('head, meta, script, css, .gutter, style, title, template, wbr, menu')
      .remove();
    if (sourceContainer[0].normalize) {
      sourceContainer[0].normalize();
    }
    for (var itemIndex = 0; itemIndex < sourceContainer[0].childNodes.length; itemIndex++) {
      var domNode = sourceContainer[0].childNodes[itemIndex];
      if (domNode.nodeType == domNode.TEXT_NODE) {
        if (/^[\s\r\n]*$/.exec(domNode.textContent)) {
          domNode.remove();
          itemIndex--;
        }
      } else {
        if (domNode.nodeType !== domNode.ELEMENT_NODE) {
          domNode.remove();
          itemIndex--;
        }
      }
    }
    return extractMarkdownText(sourceContainer, void 0, editor, baseUrl, urlRemap);
  };
  var temporaryDocumentMap = new documentModel.NodeMap();
  moduleExports.getMarkElemFromCurrentHtml = function (htmlText, editor, parseOptions) {
    if (/^\<(tbody|thead)/.exec(htmlText)) {
      htmlText = "<table mdtype='table'>" + htmlText + '</table>';
    }
    if (/^\<tr\s/.exec(htmlText) && /\<\/tr\>\s*$/.exec(htmlText)) {
      htmlText = "<table mdtype='table'>" + htmlText + '</table>';
    }
    return (function (sourceContainer, editor, parseOptions) {
      var nodeId, currentElement, listItems, listWrapper;
      editor = editor || File.editor;
      sourceContainer.find('.md-header-span').replaceWith(function () {
        var headingMarker = jquery(this).prev();
        if (headingMarker.length) {
          var trimmedTextLength = headingMarker.text().trim().length;
          headingMarker.remove();
          headingMarker.next().remove();
          return (
            '<h' +
            trimmedTextLength +
            " mdtype='heading'>" +
            this.innerHTML +
            '</h' +
            trimmedTextLength +
            '>'
          );
        }
      });
      sourceContainer.find('.math-jax-postprocess svg').remove();
      sourceContainer
        .find('.md-fences')
        .toArray()
        .map(function (element) {
          nodeId = element.getAttribute('cid');
          (currentElement = jquery(element)).attr('lang', currentElement.attr('lang') || '');
          if (nodeId) {
            currentElement.text(editor.fences.getValue(nodeId));
          }
        });
      if (void 0 === (parseOptions = parseOptions || {}).root) {
        parseOptions.root = File.editor.imgEdit.getLocalRootUrlForInsert() || '';
      }
      if (!(parseOptions && parseOptions.skipEmoji)) {
        sourceContainer
          .find('.md-emoji')
          .toArray()
          .map(function (item) {
            (currentElement = jquery(item)).text(':' + currentElement.attr('data-content') + ':');
          });
      }
      sourceContainer
        .find("[md-inline='image'], [md-inline='imgtag']")
        .toArray()
        .map(function (element, itemIndex) {
          element.setAttribute('data-root', parseOptions.root || File.bundle.filePath || '');
          if (!itemIndex) {
            element.setAttribute('data-copy-from-path', File.bundle.filePath || '');
          }
        });
      sourceContainer.find('img[data-real-src]').attr('src', function () {
        return this.dataset.realSrc;
      });
      sourceContainer
        .find("[mdtype='math_block']")
        .toArray()
        .map(function (element) {
          nodeId = element.getAttribute('cid');
          (currentElement = jquery(element)).text(editor.mathBlock.getTex(nodeId));
        });
      sourceContainer
        .find("[mdtype='html_block']")
        .toArray()
        .map(function (element) {
          nodeId = element.getAttribute('cid');
          var documentNode = editor.getNode(nodeId);
          (currentElement = jquery(element)).text(documentNode && documentNode.get('text'));
        });
      sourceContainer.find('.md-math-after-sym').remove();
      if ((listItems = sourceContainer.children('li[cid]')).length) {
        (listWrapper = jquery(
          document.querySelector("[cid='" + listItems[0].getAttribute('cid') + "']").parentElement,
        ).clone())
          .empty()
          .append(listItems)
          .wrap('div');
        sourceContainer = listWrapper.parent();
      }
      sourceContainer.find('[cid]').each(function () {
        var documentNode = editor.getNode(this.getAttribute('cid')),
          receiver = this;
        ['pattern', 'patternEnd', 'prespace', 'markindent', 'isFixed', 'ahead', 'tail'].forEach(
          function (attributeName) {
            if (documentNode && documentNode.get(attributeName)) {
              receiver.setAttribute(attributeName, documentNode.get(attributeName));
            }
          },
        );
      });
      sourceContainer.children('br').replaceWith('\n');
      return sourceContainer;
    })(jquery(jquery.parseHTML('<div>' + htmlText + '</div>')), editor, parseOptions);
  };
  moduleExports.getBlocksFromMarkHtml = function (
    htmlOrElements,
    inputTemporaryDocumentMap,
    stripMetadata,
    preserveDomIdentity,
  ) {
    if (!inputTemporaryDocumentMap) {
      temporaryDocumentMap.reset(true);
      inputTemporaryDocumentMap = temporaryDocumentMap;
    }
    var htmlText,
      sourceContainer = htmlOrElements;
    if (sourceContainer.jquery) {
      htmlText = sourceContainer.html();
    } else {
      htmlText = htmlOrElements;
      sourceContainer = jquery(jquery.parseHTML('<div>' + htmlText + '</div>')[0]);
    }
    var parsedNode,
      items = [],
      blockElements = sourceContainer.children('[mdtype]');
    if (blockElements.length) {
      blockElements.each(function (unusedParameter1) {
        parsedNode = DocumentNode.reverse(
          jquery(this),
          inputTemporaryDocumentMap,
          stripMetadata,
          preserveDomIdentity,
        );
        if (items.length) {
          items.last().addAfter(parsedNode);
        } else {
          parsedNode.unset('ahead');
        }
        items.push(parsedNode);
      });
      if (parsedNode) {
        parsedNode.unset('tail');
      }
      return items;
    } else {
      if (stripMetadata) {
        sourceContainer.find('[data-emoji]').text(function () {
          return this.getAttribute('data-emoji');
        });
        sourceContainer.find('.md-meta, .md-content').remove();
        sourceContainer.find('sup, sub').text(function () {
          return ' (' + this.textContent + ')';
        });
        if (File.option.convertSmartOnRender) {
          sourceContainer.find("[md-inline='pants']").text(function () {
            return this.getAttribute('data-text') || this.textContent;
          });
        }
        return sourceContainer.text();
      } else {
        return sourceContainer.rawText();
      }
    }
  };
  moduleExports.convertToPlain = function (nodes, unusedParameter2) {
    Object.defineProperty(collectPlainTextLines, 'name', { value: 'n', configurable: true });
    Object.defineProperty(nodeToPlainTextLines, 'name', { value: 'i', configurable: true });

    function collectPlainTextLines(collection, compact) {
      for (
        var documentNode = (
            collection instanceof Array ? collection[0] : collection.sortedFirst()
          ).getFirstBrother(),
          plainLines = [],
          nodeIndex = 0;
        nodeIndex < collection.length;
        nodeIndex++
      ) {
        plainLines = plainLines.concat(nodeToPlainTextLines(documentNode, compact));
        documentNode = documentNode.get('after');
      }
      return plainLines;
    }
    function nodeToPlainTextLines(documentNode, compact) {
      Object.defineProperty(withParagraphSpacing, 'name', { value: 'l', configurable: true });

      var definitionLine,
        items = [];
      function withParagraphSpacing(lineText) {
        if (compact) {
          return [lineText];
        } else {
          return [lineText, ''];
        }
      }
      switch (documentNode.get('type')) {
        case NodeType.fences:
          items = documentNode
            .get('text')
            .replace(/\u200B/g, '')
            .split('\n');
          for (var currentItemIndex = 0; currentItemIndex < items.length; currentItemIndex++) {
            items[currentItemIndex] = '    ' + items[currentItemIndex];
          }
          if (!compact) {
            items.push('');
          }
          return items;
        case NodeType.list:
          var style = documentNode.get('style'),
            listStartOffset = Number.isNaN(Number.parseInt(documentNode.get('start')))
              ? 0
              : Number.parseInt(documentNode.get('start')) - 1,
            childrenLength = documentNode.get('children').length;
          if (childrenLength) {
            var localDocumentNode = documentNode.getFirstChild();
            for (currentItemIndex = 0; localDocumentNode; ) {
              var currentItems = nodeToPlainTextLines(localDocumentNode, true),
                listPrefix = DocumentNode.getIndentPrefix(
                  style,
                  currentItemIndex + listStartOffset,
                  localDocumentNode,
                  void 0,
                  (childrenLength + '').length,
                );
              currentItems.map(function (unusedParameter1, itemIndex) {
                currentItems[itemIndex] =
                  (itemIndex ? ' '.repeat(listPrefix.length) : listPrefix) +
                  currentItems[itemIndex];
                items.push(currentItems[itemIndex]);
              });
              currentItemIndex++;
              localDocumentNode = localDocumentNode.get('after');
            }
          }
          if (!compact) {
            items.push('');
          }
          return items;
        case NodeType.table:
          for (
            var cellNode,
              localItemIndex,
              text,
              paddingWidth,
              columnAlignment,
              leftPaddingWidth,
              columnWidths = [],
              cellContents = [],
              rowIndex = 0,
              currentDocumentNode = documentNode.getFirstChild();
            currentDocumentNode;
          ) {
            for (
              cellNode = currentDocumentNode.getFirstChild(),
                cellContents[rowIndex] = [],
                localItemIndex = 0;
              cellNode;
            ) {
              cellContents[rowIndex][localItemIndex] = cellNode.toMark().trim();
              cellNode = cellNode.get('after');
              if (0 === rowIndex) {
                columnWidths[localItemIndex] = 4;
              }
              columnWidths[localItemIndex] = Math.max(
                cellContents[rowIndex][localItemIndex].length,
                columnWidths[localItemIndex],
              );
              columnWidths[localItemIndex] = Math.min(columnWidths[localItemIndex], 40);
              localItemIndex++;
            }
            currentDocumentNode = currentDocumentNode.get('after');
            rowIndex++;
          }
          for (rowIndex = 0; rowIndex < cellContents.length; rowIndex++) {
            for (
              text = '  ', localItemIndex = 0;
              localItemIndex < columnWidths.length;
              localItemIndex++
            ) {
              cellContents[rowIndex][localItemIndex] = cellContents[rowIndex][localItemIndex] || '';
              paddingWidth = Math.max(
                columnWidths[localItemIndex] - cellContents[rowIndex][localItemIndex].length,
                0,
              );
              text +=
                'right' == (columnAlignment = documentNode.get('align')[localItemIndex])
                  ? ' '.repeat(paddingWidth) + cellContents[rowIndex][localItemIndex]
                  : 'center' == columnAlignment
                    ? ' '.repeat((leftPaddingWidth = ~~(paddingWidth / 2))) +
                      cellContents[rowIndex][localItemIndex] +
                      ' '.repeat(paddingWidth - leftPaddingWidth)
                    : cellContents[rowIndex][localItemIndex] + ' '.repeat(paddingWidth);
              text += '\t';
            }
            items.push(text.replace(/\s$/, ''));
          }
          if (!compact) {
            items.push('');
          }
          return items;
        case NodeType.hr:
          return withParagraphSpacing('---');
        case NodeType.def_link:
          definitionLine =
            '[' +
            documentNode.get('ref') +
            ']: ' +
            documentNode.safeGetStrAttr('href') +
            (documentNode.safeGetStrAttr('title').length
              ? '\t"' + documentNode.get('title') + '"'
              : '');
          if (DocumentNode.isType(documentNode.get('after'), NodeType.def_link)) {
            return [definitionLine];
          } else {
            return withParagraphSpacing(definitionLine);
          }
        case NodeType.def_footnote:
          definitionLine = '[' + documentNode.get('ref') + ']: ' + documentNode.get('text');
          if (DocumentNode.isType(documentNode.get('after'), NodeType.def_footnote)) {
            return [definitionLine];
          } else {
            return withParagraphSpacing(definitionLine);
          }
        default:
          if (documentNode.get('children') && documentNode.get('children').length > 0) {
            return collectPlainTextLines(documentNode.get('children'), compact);
          } else {
            return withParagraphSpacing(documentNode.get('text'));
          }
      }
    }
    return collectPlainTextLines(nodes).join('\n');
  };
  moduleExports.parseHTML = function (htmlOrElements, documentMap, editor, baseUrl, urlRemap) {
    Object.defineProperty(detectTextParseMode, 'name', { value: 'F', configurable: true });
    Object.defineProperty(appendParsedNode, 'name', { value: 'S', configurable: true });
    Object.defineProperty(parseContainerChildren, 'name', { value: 'k', configurable: true });
    Object.defineProperty(parseTextLines, 'name', { value: 'E', configurable: true });
    Object.defineProperty(parseInlineContainer, 'name', { value: 'T', configurable: true });
    Object.defineProperty(parseElement, 'name', { value: 'A', configurable: true });

    var htmlText,
      sourceContainer = htmlOrElements;
    if (sourceContainer.jquery) {
      htmlText = sourceContainer.html();
    } else {
      htmlText = htmlOrElements;
      sourceContainer = jquery(jquery.parseHTML('<div>' + htmlText + '</div>')[0]);
    }
    var rawHtmlBlocks = [];
    function detectTextParseMode(textSlice) {
      var detectedMode = false;
      if ((textSlice = textSlice || '').length > 2e3) {
        textSlice = textSlice.substring(0, 2e3);
      }
      try {
        detectedMode = (detectedMode =
          (textSlice.match(/\n\s*(\!?\[|#{1,5}|>|```|([-+*]\s)|(\d+(\.|\))\s))/gm) || '').length >
            3 ||
          textSlice.match(leadingPipeTablePattern) ||
          textSlice.match(markdownTablePattern))
          ? parseModes.NORMAL
          : null;
      } catch (error) {}
      if (!detectedMode) {
        detectedMode = (detectedMode = htmlBlockStartPattern.exec(textSlice))
          ? parseModes.HTML
          : null;
      }
      if (!detectedMode) {
        detectedMode = (detectedMode = (textSlice.match(/(\/\w*>)|(\n\s+<)/g) || []).length > 6)
          ? parseModes.HTML
          : null;
      }
      return detectedMode;
    }
    function appendParsedNode(nodeAttributes, parentNode, items) {
      nodeAttributes.in = documentMap;
      if (nodeAttributes && nodeAttributes.text) {
        nodeAttributes.text = nodeAttributes.text.replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
      }
      var documentNodeInstance = new DocumentNode(nodeAttributes);
      if (items.length) {
        items.last().addAfter(documentNodeInstance);
      } else {
        if (parentNode) {
          parentNode.appendChild(documentNodeInstance);
        }
      }
      items.push(documentNodeInstance);
      return documentNodeInstance;
    }
    function parseContainerChildren(container, parseChildren, parentNode) {
      var parsedChildren = [];
      if (parseChildren) {
        for (var itemIndex = 0; itemIndex < container[0].childNodes.length; itemIndex++) {
          parseElement(jquery(container[0].childNodes[itemIndex]), parentNode, parsedChildren);
        }
      } else {
        if (DocumentNode.isType(parentNode, NodeType.blockquote, NodeType.list_item)) {
          parseInlineContainer(container, parentNode, parsedChildren);
        } else {
          parentNode.set('text', extractMarkdownText(container, void 0, editor, baseUrl, urlRemap));
        }
      }
    }
    function parseTextLines(sourceLines, parentNode, items) {
      for (
        var text,
          previousList,
          currentDocumentNode,
          ignoreListStyle,
          lineMatch = [],
          documentNode = null,
          itemIndex = 0;
        itemIndex < sourceLines.length;
        itemIndex++
      ) {
        text = sourceLines[itemIndex];
        if ((lineMatch = markdownParser.reDefLink.exec(text))) {
          documentNode = null;
          appendParsedNode(
            {
              type: NodeType.def_link,
              ref: lineMatch[1],
              href: lineMatch[3],
              title: lineMatch[8],
            },
            parentNode,
            items,
          );
        } else {
          if ((lineMatch = markdownParser.reDefFootnote.exec(text))) {
            documentNode = null;
            appendParsedNode(
              {
                type: NodeType.def_footnote,
                ref: lineMatch[1],
                text: (lineMatch[3] || '').trim(),
              },
              parentNode,
              items,
            );
          } else {
            if ((lineMatch = markdownParser.reOL.exec(text))) {
              documentNode = new DocumentNode({
                type: NodeType.paragraph,
                text: text,
                in: documentMap,
              });
              markdownParser.quickParse(text, editor.brush, documentNode, false, null, {
                id: documentNode.cid,
                start: 0,
                end: 0,
              });
              var previousNode = items.last();
              if (
                previousNode &&
                ((previousList = previousNode),
                (currentDocumentNode = documentNode),
                (ignoreListStyle = void 0),
                DocumentNode.isType(previousList, NodeType.list) &&
                  DocumentNode.isType(currentDocumentNode, NodeType.list) &&
                  (ignoreListStyle || previousList.get('style') == previousList.get('style')))
              ) {
                previousNode.appendChildrenTillEnd(documentNode.getFirstChild());
                documentNode.remove();
              } else {
                if (items.length) {
                  items.last().addAfter(documentNode);
                } else {
                  if (parentNode) {
                    parentNode.appendChild(documentNode);
                  }
                }
                items.push(documentNode);
              }
              documentNode = null;
            } else {
              if (null == documentNode) {
                documentNode = appendParsedNode(
                  { type: NodeType.paragraph, text: utilities.escapeHead(text) },
                  parentNode,
                  items,
                );
              } else {
                if (text) {
                  documentNode.set(
                    'text',
                    documentNode.get('text') + '\n' + utilities.escapeHead(text),
                  );
                } else {
                  documentNode = null;
                }
              }
            }
          }
        }
      }
    }
    function parseInlineContainer(sourceElement, parentNode, outputNodes) {
      if (sourceElement.find('br').length) {
        parseTextLines(
          extractMarkdownText(sourceElement, true, editor.baseURL, urlRemap),
          parentNode,
          outputNodes,
        );
      } else {
        if (3 == sourceElement[0].nodeType && !sourceElement.text().trim().length) {
          return;
        }
        if (1 == sourceElement[0].nodeType && 'BR' == sourceElement[0].tagName) {
          return;
        }
        parseTextLines(
          [extractMarkdownText(sourceElement, void 0, editor, baseUrl, urlRemap)],
          parentNode,
          outputNodes,
        );
      }
    }
    var allowedAlignments = { center: 'center', left: 'left', right: 'right' };
    function parseElement(element, parentNode, items, inputItems) {
      Object.defineProperty(appendParsedParagraph, 'name', { value: 'C', configurable: true });

      var createdNode,
        tableRows,
        text,
        containsBlocks = (function (sourceElement) {
          if (!sourceElement[0] || !sourceElement[0].tagName) {
            return false;
          }
          if (-1 == blockContainerTags.indexOf(sourceElement[0].tagName.toUpperCase())) {
            return sourceElement[0].querySelector('video, div, p, tr, pre');
          }
          var hasBlockChildren = false;
          sourceElement.children().each(function () {
            hasBlockChildren =
              hasBlockChildren ||
              (this.tagName &&
                (blockContainerTags.indexOf(this.tagName.toUpperCase()) > -1 ||
                  'BLOCK' == this.style.display));
          });
          return hasBlockChildren || sourceElement[0].querySelector('video, div, p, tr, pre');
        })(element),
        tagName = element[0].tagName;
      function appendParsedParagraph(inputText) {
        var paragraphNode = appendParsedNode(
            { type: NodeType.paragraph, text: inputText },
            parentNode,
            items,
          ),
          parsedNodes = (paragraphNode.parseFrom(void 0, void 0, true) || [])[1];
        if (parsedNodes && parsedNodes.length) {
          if (
            inputItems &&
            1 == parsedNodes.length &&
            !items.length &&
            parsedNodes[0].get('type') == NodeType.html_block
          ) {
            inputItems.push(inputText);
          } else {
            items.remove(paragraphNode);
            items.splice.apply(items, [items.length, 0].concat(parsedNodes));
          }
        }
      }
      if (
        !(
          element.data('skip') ||
          excludedContentTags.indexOf(tagName) > -1 ||
          element[0].nodeType === document.COMMENT_NODE
        )
      ) {
        if (inputItems && inputItems.length) {
          inputItems.push(('P' == tagName ? '\n' : '') + element.text());
        } else {
          if ('BLOCKQUOTE' === tagName) {
            parseContainerChildren(
              element,
              containsBlocks,
              (createdNode = appendParsedNode({ type: NodeType.blockquote }, parentNode, items)),
            );
          } else {
            if ('LI' === tagName && DocumentNode.isType(parentNode, NodeType.list)) {
              !(function (sourceElement, containsBlocks, parentNode) {
                var parsedChildren = [];
                if (!containsBlocks) {
                  return void parseInlineContainer(sourceElement, parentNode, parsedChildren);
                }
                let containerNode = sourceElement[0],
                  pElement = document.createElement('p'),
                  divElement = document.createElement('div'),
                  seenBlock = false;
                containerNode.childNodes.forEach((domNode) => {
                  if (!seenBlock) {
                    if (
                      domNode.tagName &&
                      (blockContainerTags.indexOf(domNode.tagName.toUpperCase()) > -1 ||
                        'BLOCK' == domNode.style.display)
                    ) {
                      seenBlock = true;
                      return void divElement.appendChild(domNode.cloneNode(true));
                    } else {
                      return void pElement.appendChild(domNode.cloneNode(true));
                    }
                  }
                  divElement.appendChild(domNode.cloneNode(true));
                });
                if (pElement.textContent.trim().length) {
                  parseInlineContainer(jquery(pElement), parentNode, parsedChildren);
                }
                for (var itemIndex = 0; itemIndex < divElement.childNodes.length; itemIndex++) {
                  parseElement(
                    jquery(divElement.childNodes[itemIndex]),
                    parentNode,
                    parsedChildren,
                  );
                }
              })(
                element,
                containsBlocks,
                (createdNode = appendParsedNode({ type: NodeType.list_item }, parentNode, items)),
              );
            } else {
              if ('UL' === tagName || 'OL' === tagName) {
                let listElement = element[0];
                if (!listElement.children.length) {
                  return;
                }
                if (
                  1 === listElement.children.length &&
                  'LI' !== listElement.children[0].tagName &&
                  ('UL' === listElement.children[0].tagName ||
                    'OL' === listElement.children[0].tagName)
                ) {
                  return void parseElement(
                    jquery(listElement.children[0]),
                    parentNode,
                    items,
                    inputItems,
                  );
                }
                var textParts = [];
                listElement.children.forEach((domNode) => {
                  if ('UL' === domNode.tagName || 'OL' === domNode.tagName) {
                    let currentDomNode = domNode.previousElementSibling;
                    if (currentDomNode && 'LI' === currentDomNode.tagName) {
                      if (!currentDomNode.querySelector('ul, ol, div, p')) {
                        currentDomNode.innerHTML = '<div>' + currentDomNode.innerHTML + '</div>';
                      }
                      currentDomNode.innerHTML += domNode.outerHTML;
                      return void (textParts[textParts.length - 1] = currentDomNode.outerHTML);
                    }
                  }
                  if ('LI' !== domNode.tagName) {
                    let liElement = document.createElement('li');
                    liElement.innerHTML = domNode.innerHTML;
                    textParts.push(liElement.outerHTML);
                  } else {
                    textParts.push(domNode.outerHTML);
                  }
                });
                listElement.innerHTML = textParts.join('');
                parseContainerChildren(
                  element,
                  containsBlocks,
                  (createdNode = appendParsedNode(
                    { type: NodeType.list, style: tagName.toLowerCase() },
                    parentNode,
                    items,
                  )),
                );
              } else {
                if ('DL' === tagName) {
                  createdNode = appendParsedNode(
                    { type: NodeType.list, style: 'ul' },
                    parentNode,
                    items,
                  );
                  (function (definitionElements, listNode) {
                    for (
                      var definitionItem, definitionNodes = [], itemIndex = 0;
                      itemIndex < definitionElements.length;
                      itemIndex++
                    ) {
                      if ('DT' == definitionElements[itemIndex].tagName) {
                        (definitionItem = appendParsedNode(
                          { type: NodeType.list_item },
                          listNode,
                          definitionNodes,
                        )).itemList = [];
                        appendParsedNode(
                          {
                            type: NodeType.paragraph,
                            text: extractMarkdownText(
                              jquery(definitionElements[itemIndex]),
                              void 0,
                              editor,
                              baseUrl,
                              urlRemap,
                            ),
                          },
                          definitionItem,
                          definitionItem.itemList,
                        );
                      }
                      if ('DD' == definitionElements[itemIndex].tagName && definitionItem) {
                        appendParsedNode(
                          {
                            type: NodeType.paragraph,
                            text: extractMarkdownText(
                              jquery(definitionElements[itemIndex]),
                              void 0,
                              editor,
                              baseUrl,
                              urlRemap,
                            ),
                          },
                          definitionItem,
                          definitionItem.itemList,
                        );
                      }
                    }
                  })(element.children(), createdNode);
                } else {
                  if ('TABLE' === tagName) {
                    if (
                      (tableRows = element.children().children('tr').add(element.children('tr')))
                        .length
                    ) {
                      createdNode = appendParsedNode({ type: NodeType.table }, parentNode, items);
                      items = [];
                      createdNode.cols = 1;
                      createdNode.set('align', Array(createdNode.cols - 0).fill());
                      tableRows.toArray().map(function (item) {
                        parseElement(jquery(item), createdNode, items);
                      });
                      tableEditor.verify(
                        createdNode,
                        createdNode.cols,
                        2,
                        function (tableNode, inputText) {
                          var parts = inputText.split(/(\r|\n)+/);
                          tableNode.set('type', NodeType.paragraph);
                          tableNode.clearChildren();
                          tableNode.set('text', parts[0]);
                          for (var itemIndex = 1; itemIndex < parts.length; itemIndex++) {
                            if (parts[itemIndex].trim().length) {
                              appendParsedNode(
                                { type: NodeType.paragraph, text: parts[itemIndex] },
                                parentNode,
                                items,
                              );
                            }
                          }
                        },
                      );
                    }
                  } else {
                    if ('THEAD' === tagName || 'TBODY' === tagName || 'TFOOT' === tagName) {
                      for (
                        var currentItems = [element], nextSection = element.next();
                        nextSection.length &&
                        DocumentNode.isType(nextSection[0].tagName, 'THEAD', 'TBODY', 'TFOOT');
                      ) {
                        currentItems.push(nextSection);
                        nextSection.data('skip', true);
                      }
                      element.wrap('<table></table>');
                      parseElement(element.parent(), parentNode, items);
                    } else {
                      if ('TR' === tagName && DocumentNode.isType(parentNode, NodeType.table)) {
                        var isHeader;
                        isHeader = (tableRows = element.children('th')).length;
                        tableRows = tableRows.add(element.children('td'));
                        parentNode.cols =
                          tableRows.length > parentNode.cols ? tableRows.length : parentNode.cols;
                        createdNode = appendParsedNode(
                          { type: NodeType.table_row, isHeader: isHeader },
                          parentNode,
                          items,
                        );
                        items = [];
                        tableRows.toArray().map(function (item) {
                          parseElement(jquery(item), createdNode, items);
                        });
                      } else {
                        if (
                          ('TD' !== tagName && 'TH' !== tagName) ||
                          !DocumentNode.isType(parentNode, NodeType.table_row)
                        ) {
                          if ('HR' === tagName) {
                            appendParsedNode({ type: NodeType.hr }, parentNode, items);
                          } else {
                            if (/H[1-6]/g.exec(tagName)) {
                              appendParsedNode(
                                {
                                  type: NodeType.heading,
                                  text: extractMarkdownText(
                                    element,
                                    void 0,
                                    editor,
                                    baseUrl,
                                    urlRemap,
                                  ),
                                  depth: element[0].tagName[1],
                                },
                                parentNode,
                                items,
                              );
                            } else {
                              if (element.hasClass('CodeMirror')) {
                                text = Array.from(
                                  element.find('.CodeMirror-line').map(function () {
                                    return this.textContent;
                                  }),
                                ).join('\n');
                                appendParsedNode(
                                  { type: NodeType.fences, text: text },
                                  parentNode,
                                  items,
                                );
                              } else {
                                if (
                                  'CODE' === tagName ||
                                  ('PRE' === tagName && 0 == element.find('pre').length) ||
                                  ('FIGURE' == tagName && element.hasClass('highlight'))
                                ) {
                                  text = '';
                                  var languageClasses =
                                      element.attr('class') +
                                      ' ' +
                                      element.children('code').attr('class'),
                                    lang =
                                      element.attr('lang') ||
                                      (/lang(?:uage)?\-([^\s]+)/.exec(languageClasses) || [])[1],
                                    tableRow = element.find('tr');
                                  if (tableRow.length > 1) {
                                    text = tableRow
                                      .map(function () {
                                        return this.innerText;
                                      })
                                      .toArray()
                                      .join('\n');
                                  } else {
                                    element.find('div, prev').each(function () {
                                      jquery(this).before('<br/>');
                                    });
                                    text = element[0].innerText.replace(
                                      /(^\s*\n+)|([\r\n]+$)/g,
                                      '',
                                    );
                                    if (!/\n/.exec(text)) {
                                      element.find('br').each(function () {
                                        jquery(this).before('\n');
                                      });
                                      text = element[0].innerText.replace(
                                        /(^\s*\n+)|([\r\n]+$)/g,
                                        '',
                                      );
                                    }
                                  }
                                  appendParsedNode(
                                    { type: NodeType.fences, text: text, lang: lang },
                                    parentNode,
                                    items,
                                  );
                                } else {
                                  if (
                                    DocumentNode.isType(
                                      (tagName || '').toUpperCase(),
                                      'VIDEO',
                                      'AUDIO',
                                      'IFRAME',
                                      'DETAILS',
                                      'SVG',
                                    )
                                  ) {
                                    element[0].style.position = '';
                                    element[0].style.float = '';
                                    text = element[0].outerHTML;
                                    appendParsedNode(
                                      { type: NodeType.html_block, text: text },
                                      parentNode,
                                      items,
                                    );
                                    return text;
                                  }
                                  if ('SCRIPT' == tagName) {
                                    return '';
                                  }
                                  if (element.hasClass('katex-display')) {
                                    let elements = element.find('math annotation');
                                    if (elements.length) {
                                      appendParsedParagraph(
                                        '$$\n' + elements[0].textContent + '\n$$',
                                      );
                                    } else {
                                      parseInlineContainer(element, parentNode, items);
                                    }
                                  } else {
                                    if ('P' != tagName && containsBlocks) {
                                      if (containsBlocks) {
                                        var paragraphWrapper, gistBlock;
                                        if ('DIV' == tagName) {
                                          if (element.is('.gist')) {
                                            if ((gistBlock = extractGistSource(element))) {
                                              return void appendParsedNode(
                                                gistBlock,
                                                parentNode,
                                                items,
                                              );
                                            }
                                          } else {
                                            if (
                                              !parentNode &&
                                              /monospace/.exec(element[0].style.fontFamily) &&
                                              /pre/.exec(element[0].style.whiteSpace)
                                            ) {
                                              var divLinesText = (function (containerNode) {
                                                if (!containerNode) {
                                                  return null;
                                                }
                                                var currentTextParts = [],
                                                  hasOtherElements = false;
                                                containerNode.children.forEach((domNode) => {
                                                  if ('DIV' == domNode.tagName) {
                                                    currentTextParts.push(domNode.textContent);
                                                  } else {
                                                    if ('BR' == domNode.tagName) {
                                                      currentTextParts.push('');
                                                    } else {
                                                      if (
                                                        domNode.nodeType == domNode.ELEMENT_NODE
                                                      ) {
                                                        hasOtherElements = true;
                                                      }
                                                    }
                                                  }
                                                });
                                                if (hasOtherElements) {
                                                  return null;
                                                } else {
                                                  return currentTextParts.join('\n');
                                                }
                                              })(element[0]);
                                              if (
                                                divLinesText &&
                                                detectTextParseMode(divLinesText)
                                              ) {
                                                return void appendParsedParagraph(divLinesText);
                                              }
                                            }
                                          }
                                        }
                                        var localTextParts = [];
                                        Array.from(element[0].childNodes).forEach(
                                          function (domNode, unusedParameter2) {
                                            if (
                                              domNode.nodeType != domNode.TEXT_NODE ||
                                              domNode.nodeValue.trim().length
                                            ) {
                                              if (
                                                domNode.nodeType == domNode.TEXT_NODE ||
                                                (htmlBlocks.ALL_INLINE_TYPE.indexOf(
                                                  (domNode.tagName || '').toLowerCase(),
                                                ) > -1 &&
                                                  !domNode.querySelector(
                                                    'p, div, h1, h2, h3, h4, h5, table',
                                                  ))
                                              ) {
                                                if (paragraphWrapper) {
                                                  paragraphWrapper.append(jquery(domNode));
                                                } else {
                                                  if ('BR' !== domNode.tagName) {
                                                    paragraphWrapper = jquery(domNode)
                                                      .wrap('<p></p>')
                                                      .parent();
                                                  }
                                                  if ('SPAN' == domNode.tagName) {
                                                    paragraphWrapper[0].className =
                                                      domNode.className;
                                                  }
                                                }
                                              } else {
                                                if (domNode.nodeType == domNode.ELEMENT_NODE) {
                                                  if (paragraphWrapper) {
                                                    parseElement(
                                                      paragraphWrapper,
                                                      parentNode,
                                                      items,
                                                      localTextParts,
                                                    );
                                                    paragraphWrapper = null;
                                                  }
                                                  if (
                                                    'DIV' == domNode.tagName &&
                                                    !domNode.textContent &&
                                                    !domNode.querySelector(
                                                      'img, video, audio, svg, iframe',
                                                    )
                                                  ) {
                                                    return;
                                                  }
                                                  parseElement(
                                                    jquery(domNode),
                                                    parentNode,
                                                    items,
                                                    localTextParts,
                                                  );
                                                }
                                              }
                                            }
                                          },
                                        );
                                        if (localTextParts.length) {
                                          var markdownText = localTextParts.join('\n'),
                                            parsedNodes = DocumentNode.parseFrom(
                                              markdownText,
                                              documentMap,
                                              void 0,
                                              true,
                                            )[1];
                                          items.splice.apply(
                                            items,
                                            [items.length, 0].concat(parsedNodes),
                                          );
                                          return markdownText;
                                        }
                                        if (paragraphWrapper) {
                                          parseElement(paragraphWrapper, parentNode, items);
                                          paragraphWrapper = null;
                                        }
                                      }
                                    } else {
                                      text = element[0].innerText || element[0].textContent || '';
                                      if (
                                        element[0].style &&
                                        'pre' !== element[0].style.whiteSpace &&
                                        'line' !== element[0].style.whiteSpace
                                      ) {
                                        text = text
                                          .replace(/(^[\r\n]+)|([\r\n]+$)/g, '')
                                          .replace(/[\r\n]/g, ' ');
                                      }
                                      var parseAsMarkdown =
                                        !parentNode && detectTextParseMode(text);
                                      text = text
                                        .replace(/^[\r\n]+\s*/, '')
                                        .replace(/\s*[\r\n]+$/, '');
                                      if (parseAsMarkdown) {
                                        appendParsedParagraph(text);
                                      } else {
                                        parseInlineContainer(element, parentNode, items);
                                      }
                                      if (parseAsMarkdown) {
                                        return text;
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          createdNode = appendParsedNode(
                            {
                              type: NodeType.table_cell,
                              text: extractMarkdownText(element, void 0, editor, baseUrl, urlRemap),
                            },
                            parentNode,
                            items,
                          );
                          if ('TH' === tagName) {
                            (function (inputElement, documentNode) {
                              if ('TH' === inputElement[0].tagName) {
                                var styleText = inputElement.attr('style') || '',
                                  match = /text\-align:([^;]+)($|;)/.exec(styleText),
                                  alignment = null;
                                if (match) {
                                  alignment =
                                    allowedAlignments[match[1].replace(/;/g, '').trim()] || null;
                                }
                                if (alignment) {
                                  var length = inputElement.prevAll('th').length;
                                  (documentNode.get('parent').get('parent').get('align') || [])[
                                    length
                                  ] = alignment;
                                }
                              }
                            })(element, createdNode);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return null;
      }
    }
    sourceContainer.find('head, meta, css, .gutter, style, title, template, wbr, menu').remove();
    if (sourceContainer[0].normalize) {
      sourceContainer[0].normalize();
    }
    var parsedBlocks = parseElement(sourceContainer, null, rawHtmlBlocks);
    return (
      parsedBlocks ||
      (rawHtmlBlocks.length &&
      (Object.defineProperty(
        function normalizeParsedBlocks(unusedParameter1, firstNode, lastNode, items) {
          var searchValue,
            documentNode = firstNode,
            currentItems = [];
          for (
            (function () {
              if (firstNode && firstNode !== lastNode) {
                for (
                  ;
                  documentNode &&
                  documentNode !== lastNode &&
                  DocumentNode.isType(documentNode, NodeType.paragraph) &&
                  DocumentNode.isEmptyBlock(documentNode);
                ) {
                  searchValue = documentNode;
                  documentNode = documentNode.get('after');
                  searchValue.remove();
                  if (items) {
                    items.splice(items.indexOf(searchValue), 1);
                  }
                }
                for (
                  firstNode = documentNode.get('before') || documentNode, documentNode = lastNode;
                  documentNode &&
                  documentNode !== firstNode &&
                  DocumentNode.isType(documentNode, NodeType.paragraph) &&
                  DocumentNode.isEmptyBlock(documentNode);
                ) {
                  searchValue = documentNode;
                  documentNode = documentNode.get('before');
                  searchValue.remove();
                  if (items) {
                    items.splice(items.indexOf(searchValue), 1);
                  }
                }
              }
            })(),
              documentNode = firstNode;
            documentNode;
          ) {
            var codeMatch = null;
            if (DocumentNode.isType(documentNode, NodeType.blockquote, NodeType.list_item)) {
              normalizeParsedBlocks(
                documentNode,
                documentNode.getFirstChild(),
                documentNode.getLastChild(),
              );
            } else {
              if (
                DocumentNode.isType(documentNode, NodeType.fences) &&
                DocumentNode.isType(documentNode.get('before'), NodeType.fences)
              ) {
                currentItems.push(documentNode);
                documentNode.head = documentNode.get('before').head || documentNode.get('before');
                documentNode.head.set(
                  'text',
                  documentNode.head.get('text') + '\n' + documentNode.get('text'),
                );
              } else {
                if (
                  DocumentNode.isType(documentNode, NodeType.list) &&
                  0 === documentNode.get('children').length
                ) {
                  documentNode.set('type', NodeType.paragraph);
                } else {
                  if (
                    DocumentNode.isType(documentNode, NodeType.paragraph) &&
                    (codeMatch = /^(`+)([^`]+)\1(?!`)\s*$/g.exec(documentNode.get('text')))
                  ) {
                    documentNode.set('type', NodeType.fences);
                    documentNode.set('text', codeMatch[2]);
                    continue;
                  }
                }
              }
            }
            documentNode = documentNode.get('after');
          }
          currentItems.map(function (inputSearchValue) {
            if (items) {
              items.splice(items.indexOf(inputSearchValue), 1);
            }
            inputSearchValue.remove();
          });
        },
        'name',
        { value: 'e', configurable: true },
      )(0, rawHtmlBlocks[0], rawHtmlBlocks.last(), rawHtmlBlocks),
      1 === rawHtmlBlocks.length && DocumentNode.isType(rawHtmlBlocks[0], NodeType.paragraph))
        ? rawHtmlBlocks[0].get('text')
        : rawHtmlBlocks)
    );
  };
}
