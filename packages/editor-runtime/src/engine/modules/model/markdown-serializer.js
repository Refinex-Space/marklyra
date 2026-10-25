// model/markdown-serializer.
// SystemJS module 12. Dependencies: 13, 11.
$__System.registerDynamic(
  '12',
  ['13', '11'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self;
    var documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      DocumentMap = documentModel.NodeMap,
      NodeType = documentModel.TYPE,
      utilities = requireModule('11'),
      sourceMarkerPattern = /\uE027/gi,
      unorderedListMarkers = ['-', '+', '*'];
    (DocumentNode.UL_DEFAULT_START = unorderedListMarkers),
      (DocumentNode.prototype.toMark = function () {
        var serializedNode = u.call(this);
        return serializedNode instanceof Array
          ? serializedNode.join(File.useCRLF ? '\r\n' : '\n').replace(sourceMarkerPattern, '')
          : serializedNode;
      });
    var d = function (alignment, columnWidth) {
        return 'right' == alignment
          ? '-'.repeat(columnWidth - 1) + ':'
          : 'center' == alignment
            ? ':' + '-'.repeat(columnWidth - 2) + ':'
            : 'left' == alignment
              ? ':' + '-'.repeat(columnWidth - 1)
              : '-'.repeat(columnWidth);
      },
      u = function () {
        var serializedValue,
          blockContent,
          blockText,
          markdownLines = [];
        function o(documentNode) {
          if (documentNode.get('children').length) return g(documentNode.get('children'));
          var currentText = documentNode.get('text') ? documentNode.get('text') : '';
          return (currentText = currentText
            .replace(/(\u200B*):(\u200B*)/g, ':')
            .replace(/\u200B\$/g, '$'));
        }
        function c(outputLines, documentNode) {
          b(outputLines, documentNode.get('ahead') || 0);
        }
        function v(documentNode) {
          if (
            !documentNode.get('after') &&
            !documentNode.get('parent') &&
            documentNode.get('type') == NodeType.paragraph &&
            File &&
            File.editor
          ) {
            var nodeElement = File.editor.findElemById(documentNode.cid);
            if (
              nodeElement &&
              nodeElement.hasClass('unholdable') &&
              !documentNode.get('text').length
            )
              return !0;
          }
          return !1;
        }
        function y(outputLines, documentNode, blankLineCount) {
          void 0 === blankLineCount &&
            (blankLineCount = documentNode.get('after')
              ? v(documentNode.get('after'))
                ? 0
                : 1
              : 0),
            b(
              outputLines,
              void 0 == documentNode.get('tail') ? blankLineCount : documentNode.get('tail'),
            );
        }
        function b(outputLines, blankLineCount) {
          for (var blankLineIndex = 0; blankLineIndex < blankLineCount; blankLineIndex++)
            outputLines.push('');
        }
        function w(documentNode) {
          return (
            DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) &&
            !1 !== documentNode.get('parent').get('tight')
          );
        }
        function x(columnWidths, documentNode) {
          var previousDelimiterIndex = -1,
            delimiterRow = '',
            alignText = this.get('alignText');
          for (
            this.set('align', this.get('align') || []), localItemIndex = 0;
            localItemIndex < columnWidths.length;
            localItemIndex++
          )
            if (((columnAlignment = this.get('align')[localItemIndex]), alignText)) {
              var delimiterText = alignText[localItemIndex];
              if (delimiterText)
                (delimiterRow += delimiterText), (previousDelimiterIndex = localItemIndex);
              else if (previousDelimiterIndex > -1) {
                var previousDelimiter = alignText[previousDelimiterIndex],
                  previousAlignment = this.get('align')[previousDelimiterIndex];
                ' ' != previousDelimiter[0] ||
                  ' ' === previousDelimiter[previousDelimiter.length - 1] ||
                  (previousAlignment && 'center' != previousAlignment) ||
                  ((alignText[previousDelimiterIndex] = previousDelimiter + ' '),
                  (delimiterRow += ' ')),
                  (delimiterRow += DocumentNode.adjustAlignText(
                    this,
                    previousDelimiterIndex,
                    columnAlignment,
                  ));
              } else
                delimiterRow +=
                  ((outputCell = documentNode.getNthChild(localItemIndex)).get('marginLeft') ||
                    '') +
                  d(columnAlignment, 4) +
                  (outputCell.get('marginRight') || '');
              delimiterRow += '|';
            } else delimiterRow += ' ' + d(columnAlignment, columnWidths[localItemIndex]) + ' |';
          return delimiterRow;
        }
        try {
          switch (this.get('type')) {
            case NodeType.meta_block:
              return (
                markdownLines.push('---'),
                (markdownLines = markdownLines.concat(
                  (this.get('text') || '').replace(/^---/gm, '​---').split(/\r*\n/),
                )).push(this.get('patternEnd') || '---'),
                y(markdownLines, this),
                markdownLines
              );
            case NodeType.heading:
              if ((c(markdownLines, this), (blockContent = o(this)), this.get('pattern')))
                (blockContent = utilities.escapeStringReplace(blockContent)),
                  (markdownLines = markdownLines.concat(
                    this.get('pattern').replace('{0}', blockContent).split(/\r*\n/),
                  ));
              else if (
                !DocumentNode.isType(this.get('parent'), NodeType.list_item) &&
                (1 == File.option.headingStyle || 3 == File.option.headingStyle) &&
                this.get('depth') <= 2
              )
                markdownLines.push(blockContent),
                  3 == File.option.headingStyle
                    ? markdownLines.push(
                        (1 == this.get('depth') ? '=' : '-').repeat(
                          Math.max(1, utilities.wcswidth(this.get('text'))),
                        ),
                      )
                    : markdownLines.push(1 == this.get('depth') ? '===' : '---');
              else {
                var headingLine = '#'.repeat(this.get('depth')) + ' ' + blockContent;
                2 == File.option.headingStyle &&
                  (headingLine += ' ' + '#'.repeat(this.get('depth'))),
                  markdownLines.push(headingLine);
              }
              return y(markdownLines, this), markdownLines;
            case NodeType.paragraph:
              return v(this)
                ? markdownLines
                : (c(markdownLines, this),
                  (blockContent = o(this)
                    .split(/\r?\n/g)
                    .map(function (item) {
                      return item || '';
                    })),
                  (markdownLines = /^( {4}|\t)/.exec(blockContent[0])
                    ? markdownLines.concat(
                        blockContent.map(function (inputText) {
                          return inputText.replace(/^( {4}|\t)/, '​$1');
                        }),
                      )
                    : markdownLines.concat(blockContent)),
                  void 0 === (currentTrailingBlankLines = this.get('tail')) &&
                    this.get('after') &&
                    DocumentNode.isType(this.get('parent'), NodeType.list_item) &&
                    (currentTrailingBlankLines = w(this) ? 0 : void 0),
                  DocumentNode.isType(this.get('after'), NodeType.paragraph) &&
                    currentTrailingBlankLines < 1 &&
                    this.unset('tail'),
                  DocumentNode.isType(this.get('after'), NodeType.math_block) &&
                    !this.get('tail') &&
                    (currentTrailingBlankLines = 0),
                  void 0 === currentTrailingBlankLines
                    ? y(markdownLines, this, currentTrailingBlankLines)
                    : b(markdownLines, currentTrailingBlankLines),
                  markdownLines);
            case NodeType.blockquote:
              return (
                c(markdownLines, this),
                (blockContent = o(this)),
                (userIndents = m(this.get('userIndent'), blockContent))
                  ? blockContent.map(function (item, itemIndex) {
                      blockContent[itemIndex] = (userIndents[itemIndex] || '') + item;
                    })
                  : (this.unset('userIndent'),
                    (blockText = f(NodeType.blockquote, 0, this, this.get('pattern'))),
                    blockContent.map(function (item, itemIndex) {
                      blockContent[itemIndex] = item
                        ? blockText + item
                        : blockText.replace(/\s+$/, '');
                    })),
                y((markdownLines = markdownLines.concat(blockContent)), this),
                '' !== markdownLines.last() &&
                  DocumentNode.isType(this.get('after'), NodeType.blockquote) &&
                  markdownLines.push(''),
                markdownLines
              );
            case NodeType.list:
              c(markdownLines, this);
              var style = this.get('style'),
                looseList = this.isLoose(),
                childrenLength = this.get('children').length,
                localDocumentNode = this;
              if (childrenLength)
                for (
                  var listItem = this.getFirstChild(),
                    listStartOffset = Number.isNaN(Number.parseInt(this.get('start')))
                      ? 0
                      : Number.parseInt(this.get('start')) - 1,
                    currentItemIndex = 0;
                  listItem;
                ) {
                  listItem.set('tight', !looseList),
                    (blockContent = u.call(listItem)),
                    (serializedValue = this.get('pattern')),
                    looseList &&
                      serializedValue &&
                      listItem.get('markindent') &&
                      (serializedValue = p(
                        style,
                        serializedValue.trim(),
                        listItem.get('markindent'),
                      ));
                  var userIndents,
                    leadingSpaces = Math.min(listItem.get('prespace') || 0, 3),
                    fixedNumbering =
                      (void 0 === this.get('isFixed') && File.option.olStyle) ||
                      this.get('isFixed'),
                    length = (blockText =
                      ' '.repeat(leadingSpaces) +
                      f(
                        style,
                        (fixedNumbering ? 0 : currentItemIndex) + listStartOffset,
                        listItem,
                        serializedValue,
                        (childrenLength + '').length,
                      )).length,
                    numberWidthAdjustment =
                      style == DocumentNode.ListType.ol
                        ? (currentItemIndex + listStartOffset + '').length - 1
                        : 0,
                    continuationIndent = (length = listItem.get('subindent')
                      ? Math.min(
                          blockText.replace(/\s+$/, '').length + 4,
                          listItem.get('subindent') + numberWidthAdjustment,
                        )
                      : localDocumentNode.get('subindent')
                        ? Math.min(
                            blockText.replace(/\s+$/, '').length + 4,
                            localDocumentNode.get('subindent') + numberWidthAdjustment,
                          )
                        : File.option.indentByTab
                          ? 0
                          : Math.max(length, File.option.indentSize))
                      ? ' '.repeat(length)
                      : '\t';
                  if ((userIndents = m(listItem.get('userIndent'), blockContent, !0)))
                    listItem.get('style') == DocumentNode.ListType.task &&
                      (userIndents[0].trim().length &&
                        -1 == userIndents[0].indexOf('[') &&
                        (userIndents[0] = userIndents[0] + '[ ] '),
                      listItem.get('checked')
                        ? (userIndents[0] = userIndents[0].replace('[ ]', '[x]'))
                        : (userIndents[0] = userIndents[0].replace(/\[x\]/i, '[ ]'))),
                      blockContent.map(function (item, itemIndex) {
                        (blockContent[itemIndex] = userIndents[itemIndex] + item),
                          markdownLines.push(
                            blockContent[itemIndex].replace(sourceMarkerPattern, ''),
                          );
                      });
                  else {
                    listItem.unset('userIndent');
                    var currentBlockText = blockText;
                    listItem.get('style') == DocumentNode.ListType.task &&
                      (currentBlockText = blockText + (listItem.get('checked') ? '[x] ' : '[ ] ')),
                      blockContent.map(function (item, itemIndex) {
                        (blockContent[itemIndex] =
                          (itemIndex ? (item ? continuationIndent : '') : currentBlockText) +
                          blockContent[itemIndex]),
                          markdownLines.push(
                            blockContent[itemIndex].replace(sourceMarkerPattern, ''),
                          );
                      });
                  }
                  currentItemIndex++, (listItem = listItem.get('after'));
                }
              return (
                DocumentNode.isType(this.get('after'), NodeType.list) &&
                  (!this.get('tail') || this.get('tail')) < 1 &&
                  this.get('pattern') == this.get('after').get('pattern') &&
                  this.get('style') == this.get('after').get('style') &&
                  (this.unset('tail'), markdownLines.push(''), w(this) && markdownLines.push('')),
                y(
                  markdownLines,
                  this,
                  w(this)
                    ? 0
                    : (function (listNode) {
                        var trailingBlankLines = localDocumentNode.get('tail'),
                          documentNode = localDocumentNode.get('after');
                        if (0 === trailingBlankLines) {
                          if (DocumentNode.isType(documentNode, NodeType.paragraph))
                            return void listNode.unset('tail');
                          if (
                            DocumentNode.isType(documentNode, NodeType.fences) &&
                            /^\s+$/.exec(documentNode.get('pattern') || '')
                          )
                            return void listNode.unset('tail');
                        }
                        return trailingBlankLines;
                      })(this),
                ),
                markdownLines
              );
            case NodeType.list_item:
              var currentTrailingBlankLines;
              for (
                'string' == typeof (blockContent = o(this)) && (blockContent = [blockContent]),
                  markdownLines = markdownLines.concat(blockContent),
                  void 0 == (currentTrailingBlankLines = this.get('tail')) &&
                    !this.get('tight') &&
                    this.get('after') &&
                    (currentTrailingBlankLines = 1),
                  currentTrailingBlankLines > 0 && markdownLines.push('');
                markdownLines.length > 2 &&
                '' === markdownLines.last() &&
                '' === markdownLines[markdownLines.length - 2];
              )
                markdownLines.pop();
              return markdownLines;
            case NodeType.fences:
              c(markdownLines, this);
              var text = this.getText();
              (blockContent = text.split(/\r*\n/)),
                !0 === this.get('empty') && (blockContent = []),
                this.get('lang')
                  ? (this.get('pattern') || '').trim()
                    ? (serializedValue = this.get('pattern'))
                    : (this.unset('pattern'),
                      (serializedValue = /^\s*```/gm.exec(this.get('text') || '')
                        ? '~~~{0}'
                        : '```{0}'))
                  : (serializedValue = this.get('pattern') || '```{0}');
              var localText = serializedValue.replace(/\s*\{0\}/, ''),
                trimmedTextLength = localText.trim().length;
              this.get('pattern') && (localText = this.get('patternEnd') || localText);
              var regex,
                fenceExtension = 0,
                match = serializedValue.match(/^\s+$/),
                fenceCharacter = (serializedValue.match(/[`~]/) || [])[0];
              fenceCharacter &&
                (regex = new RegExp(`^(${fenceCharacter}{${trimmedTextLength},})s*$`));
              for (
                currentItemIndex = 0;
                currentItemIndex < blockContent.length;
                currentItemIndex++
              ) {
                if (regex) {
                  var currentMatch = regex.exec(blockContent[currentItemIndex]);
                  currentMatch &&
                    currentMatch[1] &&
                    (fenceExtension =
                      Math.max(fenceExtension + trimmedTextLength, currentMatch[1].length + 1) -
                      trimmedTextLength);
                }
                (blockContent[currentItemIndex] =
                  (match ? serializedValue : '') + blockContent[currentItemIndex]),
                  (blockContent[currentItemIndex] = blockContent[currentItemIndex] || ''),
                  this.get('userIndent') &&
                    (blockContent[currentItemIndex] =
                      this.get('userIndent') + blockContent[currentItemIndex]);
              }
              return (
                match ||
                  (fenceExtension &&
                    ((serializedValue =
                      fenceCharacter.repeat(fenceExtension + trimmedTextLength) + '{0}'),
                    (localText = fenceCharacter.repeat(fenceExtension + trimmedTextLength))),
                  markdownLines.push(
                    serializedValue.replace(
                      /\{0\}/,
                      utilities.escapeStringReplace(this.get('lang') || ''),
                    ),
                  )),
                (markdownLines = markdownLines.concat(blockContent)),
                match || this.get('noCloseTag') || markdownLines.push(localText),
                y(markdownLines, this),
                markdownLines
              );
            case NodeType.math_block:
              return (
                c(markdownLines, this),
                this.get('legacyMath')
                  ? markdownLines.push('\\[')
                  : this.get('tagBefore')
                    ? markdownLines.push('$$ {' + this.get('tagBefore') + '}')
                    : markdownLines.push('$$'),
                (markdownLines = markdownLines.concat(
                  this.get('text')
                    .replace(/(^\n)|(\n$)/g, '')
                    .split(/\r?\n/)
                    .map(function (item) {
                      return item || '';
                    }),
                )),
                this.get('legacyMath')
                  ? markdownLines.push('\\]')
                  : this.get('tagAfter')
                    ? markdownLines.push('$$ {' + this.get('tagAfter') + '}')
                    : markdownLines.push('$$'),
                y(
                  markdownLines,
                  this,
                  DocumentNode.isType(this.get('after'), NodeType.paragraph) &&
                    DocumentNode.isType(this.get('before'), NodeType.paragraph)
                    ? 0
                    : void 0,
                ),
                markdownLines
              );
            case NodeType.hr:
              return (
                c(markdownLines, this),
                markdownLines.push(this.get('pattern') || '------'),
                y(markdownLines, this),
                markdownLines
              );
            case NodeType.def_footnote:
              return (
                c(markdownLines, this),
                markdownLines.push(
                  '[^' +
                    this.get('ref') +
                    ']:' +
                    utilities.orDefault(this.get('pattern'), ' ') +
                    o(this),
                ),
                y(
                  markdownLines,
                  this,
                  !this.get('after') ||
                    DocumentNode.isType(this.get('after'), DocumentNode.TYPE.def_footnote)
                    ? 0
                    : 1,
                ),
                markdownLines
              );
            case NodeType.def_link:
              c(markdownLines, this);
              var referenceDefinition,
                currentLength = this.safeGetStrAttr('title').length;
              if (this.get('pattern')) {
                var parts = this.get('pattern').split(';');
                (referenceDefinition =
                  parts[0] + this.get('ref') + parts[1] + this.safeGetStrAttr('href') + parts[2]),
                  currentLength &&
                    (referenceDefinition +=
                      (parts[3] || '\t') +
                      (parts[4] || '"') +
                      this.get('title') +
                      (parts[5] || '"'));
              } else
                referenceDefinition =
                  '[' +
                  this.get('ref') +
                  ']: ' +
                  this.safeGetStrAttr('href') +
                  (currentLength ? '\t"' + this.get('title') + '"' : '');
              return (
                markdownLines.push(referenceDefinition),
                y(
                  markdownLines,
                  this,
                  !this.get('after') ||
                    DocumentNode.isType(this.get('after'), DocumentNode.TYPE.def_link)
                    ? 0
                    : 1,
                ),
                markdownLines
              );
            case NodeType.table:
              if ((c(markdownLines, this), this.get('userText')))
                return (
                  y((markdownLines = markdownLines.concat(this.get('userText').clone())), this),
                  markdownLines
                );
              for (
                var outputCell,
                  scannedCell,
                  localItemIndex,
                  rowMarkdown,
                  paddingWidth,
                  columnAlignment,
                  leftPaddingWidth,
                  columnWidths = [],
                  cellContents = [],
                  rowIndex = 0,
                  currentDocumentNode = this.getFirstChild();
                currentDocumentNode;
              ) {
                for (
                  scannedCell = currentDocumentNode.getFirstChild(),
                    cellContents[rowIndex] = [],
                    localItemIndex = 0;
                  scannedCell;
                )
                  (cellContents[rowIndex][localItemIndex] = scannedCell.toMark().trim()),
                    (scannedCell = scannedCell.get('after')),
                    0 === rowIndex && (columnWidths[localItemIndex] = 4),
                    (columnWidths[localItemIndex] = Math.max(
                      utilities.wcswidth(cellContents[rowIndex][localItemIndex]),
                      columnWidths[localItemIndex],
                    )),
                    (columnWidths[localItemIndex] = Math.min(columnWidths[localItemIndex], 60)),
                    isNaN(columnWidths[localItemIndex]) && (columnWidths[localItemIndex] = 0),
                    localItemIndex++;
                (currentDocumentNode = currentDocumentNode.get('after')), rowIndex++;
              }
              var omitOuterPipes = 'npTable' == this.get('style') && columnWidths.length > 1;
              for (
                this.set('align', this.get('align') || []),
                  currentDocumentNode = this.getFirstChild(),
                  rowIndex = 0;
                rowIndex < cellContents.length;
                rowIndex++
              ) {
                for (
                  rowMarkdown = '|',
                    outputCell = currentDocumentNode.getFirstChild(),
                    localItemIndex = 0;
                  localItemIndex < columnWidths.length &&
                  (void 0 !== outputCell.get('marginLeft')
                    ? ((rowMarkdown +=
                        outputCell.get('marginLeft') +
                        cellContents[rowIndex][localItemIndex] +
                        outputCell.get('marginRight')),
                      (rowMarkdown += '|'))
                    : ((rowMarkdown += ' '),
                      (paddingWidth = Math.max(
                        columnWidths[localItemIndex] -
                          utilities.wcswidth(cellContents[rowIndex][localItemIndex]),
                        0,
                      )),
                      (rowMarkdown +=
                        'right' == (columnAlignment = this.get('align')[localItemIndex])
                          ? ' '.repeat(paddingWidth) + cellContents[rowIndex][localItemIndex]
                          : 'center' == columnAlignment
                            ? ' '.repeat((leftPaddingWidth = ~~(paddingWidth / 2))) +
                              cellContents[rowIndex][localItemIndex] +
                              ' '.repeat(paddingWidth - leftPaddingWidth)
                            : cellContents[rowIndex][localItemIndex] + ' '.repeat(paddingWidth)),
                      (rowMarkdown += ' |')),
                  (outputCell = outputCell.get('after')));
                  localItemIndex++
                );
                omitOuterPipes
                  ? '|' == (rowMarkdown = rowMarkdown.replace(/(^\s*\|)|(\|\s*$)/g, '')).trim() &&
                    (rowMarkdown = '|' + rowMarkdown)
                  : (rowMarkdown = rowMarkdown.replace(/\s$/, '')),
                  markdownLines.push(rowMarkdown),
                  0 === rowIndex &&
                    ((rowMarkdown = '|' + x.call(this, columnWidths, currentDocumentNode)),
                    omitOuterPipes
                      ? markdownLines.push(rowMarkdown.replace(/(^\s*\|)|(\|\s*$)/g, ''))
                      : markdownLines.push(rowMarkdown.replace(/\s$/, ''))),
                  (currentDocumentNode = currentDocumentNode.get('after'));
              }
              return y(markdownLines, this), markdownLines;
            case NodeType.table_row:
              return console.sendError('cannot call toMark on table_row'), '';
            case NodeType.table_cell:
              return h(o(this));
            case NodeType.toc:
              return (
                c(markdownLines, this),
                markdownLines.push(this.get('pattern') || '[TOC]'),
                ~(this.get('pattern') || '').indexOf('\n') && this.get('after')
                  ? y(markdownLines, this, 2)
                  : y(markdownLines, this),
                markdownLines
              );
            case NodeType.html_block:
              return (
                c(markdownLines, this),
                y(
                  (markdownLines = markdownLines.concat(
                    this.get('text')
                      .replace(/(^\n)|(\n$)/g, '')
                      .split(/\r?\n/)
                      .map(function (item) {
                        return item || '';
                      }),
                  )),
                  this,
                ),
                markdownLines
              );
            default:
              return o(this);
          }
        } catch (error) {
          return console.error(error.stack), markdownLines;
        }
      },
      h = function (text) {
        var placeholderStart = '',
          placeholderEnd = '',
          items = [],
          protectedIndex = 0,
          restoredIndex = 0;
        return (
          (text = text.replace(/(^|[^\\])`[^`]*\|[^`]*`/g, function (codeSpan) {
            return (
              items.push(codeSpan),
              [placeholderStart, ++protectedIndex - 1, placeholderEnd].join('')
            );
          })),
          File.option.enableInlineMath &&
            (text = text.replace(/(^|[^\\])\$[^$]*\|[^$]*\$/g, function (mathSpan) {
              return (
                items.push(mathSpan),
                [placeholderStart, ++protectedIndex - 1, placeholderEnd].join('')
              );
            })),
          text
            .replace(/\|/g, '\\|')
            .replace(/\\\\\|/g, '\\|')
            .replace(/\uE07A[^\uE07B]+\uE07B/g, function () {
              return items[++restoredIndex - 1];
            })
        );
      },
      p = function (blockStyle, bulletMarker, indentWidth) {
        var prettyIndent = File.option.prettyIndent;
        return (
          void 0 !== indentWidth
            ? (indentWidth -= 0)
            : (indentWidth = Math.max(File.option.indentSize - 0, 2)),
          blockStyle == NodeType.blockquote
            ? '>' + ' '.repeat(Math.min(indentWidth - 1, prettyIndent ? 4 : 1))
            : blockStyle === DocumentNode.ListType.ol
              ? '{0}.' + ' '.repeat(Math.min(indentWidth - 2, prettyIndent ? 4 : 1) || 1)
              : blockStyle === DocumentNode.ListType.ul
                ? (bulletMarker || unorderedListMarkers[File.option.ulStyle]) +
                  ' '.repeat(Math.min(indentWidth - 1, prettyIndent ? 4 : 1))
                : unorderedListMarkers[File.option.ulStyle] + ' '
        );
      },
      f = function (blockStyle, itemNumber, unusedParameter3, text) {
        var indentSize = File.option.indentSize;
        return (
          itemNumber++,
          (text = text || p(blockStyle)),
          (!$.isNumeric(indentSize) || indentSize < 2) && (indentSize = 2),
          blockStyle == NodeType.blockquote
            ? text
            : blockStyle === DocumentNode.ListType.ol
              ? text.replace('{0}', itemNumber)
              : text
        );
      };
    (DocumentNode.getIndentPrefix = f),
      (DocumentNode.getDefaultPrefixPattern = p),
      (DocumentNode.markFromArr = function (nodes) {
        var serializedNodes = g(nodes);
        return serializedNodes instanceof Array
          ? serializedNodes.join(File.useCRLF ? '\r\n' : '\n').replace(sourceMarkerPattern, '')
          : serializedNodes;
      });
    var m = function (storedIndents, contentLines, padNonemptyLines) {
        var length = contentLines.length;
        if (!storedIndents || !length) return null;
        if (1 == length) return 1 == storedIndents.length ? storedIndents : null;
        var items = null;
        if (storedIndents.length < length) {
          var text;
          if (!(text = storedIndents.last() || storedIndents[1] || '').length || text.trim().length)
            return null;
          items = storedIndents.concat(new Array(length - storedIndents.length).fill(text));
        } else
          items = storedIndents.length > length ? storedIndents.slice(0, length) : storedIndents;
        if (
          items &&
          padNonemptyLines &&
          (text = items.last() || items[1] || '').length &&
          !text.trim().length
        )
          return items.map((item, itemIndex) =>
            contentLines[itemIndex].length ? item || text : item,
          );
        return items;
      },
      g = function (items) {
        var serializedLines = [],
          inlineMarkdown = '';
        function i(node) {
          var serializedNode = u.call(node);
          serializedNode instanceof Array
            ? (serializedLines = serializedLines.concat(serializedNode))
            : (inlineMarkdown += serializedNode);
        }
        if (items.length)
          if (items instanceof Array)
            items.map(function (item) {
              i(item);
            });
          else {
            var documentNode = items.sortedFirst();
            do {
              i(documentNode), (documentNode = documentNode.get('after'));
            } while (documentNode);
          }
        return serializedLines.length ? serializedLines : inlineMarkdown;
      };
    (DocumentMap.prototype.toMark = function () {
      if (this.blocks.length > 0) {
        var documentNode = this.blocks.sortedFirst();
        documentNode = documentNode.getFirstBrother();
        var textParts = [],
          inlineMarkdown = '';
        do {
          var serializedNode = u.call(documentNode);
          serializedNode instanceof Array
            ? (textParts = textParts.concat(serializedNode))
            : (inlineMarkdown += serializedNode),
            (documentNode = documentNode.get('after'));
        } while (documentNode);
        return textParts.length
          ? textParts.join(File.useCRLF ? '\r\n' : '\n').replace(sourceMarkerPattern, '')
          : inlineMarkdown;
      }
      return '';
    }),
      (DocumentNode.getIndentPrefix = f);
    Object.defineProperty(globalThis, '__MARKLYRA_NATIVE_SERIALIZATION__', {
      value: Object.freeze({
        version: 1,
        moduleSha256: 'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb',
        nodePrototype: DocumentNode.prototype,
        mapPrototype: DocumentMap.prototype,
        nodeToMark: DocumentNode.prototype.toMark,
        mapToMark: DocumentMap.prototype.toMark,
        lines: u,
        array: Array,
      }),
    });
  },
);
