// model/markdown-serializer.
export default function initializeModelMarkdownSerializer(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  if (!this) {
    self;
  }
  var documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    DocumentMap = documentModel.NodeMap,
    NodeType = documentModel.TYPE,
    utilities = requireModule('shared/utilities'),
    sourceMarkerPattern = /\uE027/gi,
    unorderedListMarkers = ['-', '+', '*'];
  DocumentNode.UL_DEFAULT_START = unorderedListMarkers;
  DocumentNode.prototype.toMark = function () {
    var serializedNode = serializeNodeLines.call(this);
    if (serializedNode instanceof Array) {
      return serializedNode.join(File.useCRLF ? '\r\n' : '\n').replace(sourceMarkerPattern, '');
    } else {
      return serializedNode;
    }
  };
  var formatTableDelimiterCell = function (alignment, columnWidth) {
      if ('right' == alignment) {
        return '-'.repeat(columnWidth - 1) + ':';
      } else {
        if ('center' == alignment) {
          return ':' + '-'.repeat(columnWidth - 2) + ':';
        } else {
          if ('left' == alignment) {
            return ':' + '-'.repeat(columnWidth - 1);
          } else {
            return '-'.repeat(columnWidth);
          }
        }
      }
    },
    /**
     * Serialize one node without joining block lines or normalizing line endings.
     * Inline content returns Markdown text; block content returns source lines.
     * @this {DocumentNode}
     * @returns {string | string[]}
     */
    serializeNodeLines = function () {
      var serializedValue,
        blockContent,
        blockText,
        markdownLines = [];
      function serializeNodeContent(documentNode) {
        if (documentNode.get('children').length) {
          return serializeNodeCollection(documentNode.get('children'));
        }
        var currentText = documentNode.get('text') ? documentNode.get('text') : '';
        return (currentText = currentText
          .replace(/(\u200B*):(\u200B*)/g, ':')
          .replace(/\u200B\$/g, '$'));
      }
      function appendLeadingBlankLines(outputLines, documentNode) {
        appendBlankLines(outputLines, documentNode.get('ahead') || 0);
      }
      function isTrailingEmptyParagraph(documentNode) {
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
          ) {
            return true;
          }
        }
        return false;
      }
      function appendTrailingBlankLines(outputLines, documentNode, blankLineCount) {
        if (void 0 === blankLineCount) {
          blankLineCount = documentNode.get('after')
            ? isTrailingEmptyParagraph(documentNode.get('after'))
              ? 0
              : 1
            : 0;
        }
        appendBlankLines(
          outputLines,
          void 0 == documentNode.get('tail') ? blankLineCount : documentNode.get('tail'),
        );
      }
      function appendBlankLines(outputLines, blankLineCount) {
        for (var blankLineIndex = 0; blankLineIndex < blankLineCount; blankLineIndex++) {
          outputLines.push('');
        }
      }
      function belongsToTightListItem(documentNode) {
        return (
          DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) &&
          false !== documentNode.get('parent').get('tight')
        );
      }
      function formatTableDelimiterRow(columnWidths, documentNode) {
        var previousDelimiterIndex = -1,
          delimiterRow = '',
          alignText = this.get('alignText');
        for (
          this.set('align', this.get('align') || []), localItemIndex = 0;
          localItemIndex < columnWidths.length;
          localItemIndex++
        ) {
          columnAlignment = this.get('align')[localItemIndex];
          if (alignText) {
            var delimiterText = alignText[localItemIndex];
            if (delimiterText) {
              delimiterRow += delimiterText;
              previousDelimiterIndex = localItemIndex;
            } else {
              if (previousDelimiterIndex > -1) {
                var previousDelimiter = alignText[previousDelimiterIndex],
                  previousAlignment = this.get('align')[previousDelimiterIndex];
                if (
                  !(
                    ' ' != previousDelimiter[0] ||
                    ' ' === previousDelimiter[previousDelimiter.length - 1] ||
                    (previousAlignment && 'center' != previousAlignment)
                  )
                ) {
                  alignText[previousDelimiterIndex] = previousDelimiter + ' ';
                  delimiterRow += ' ';
                }
                delimiterRow += DocumentNode.adjustAlignText(
                  this,
                  previousDelimiterIndex,
                  columnAlignment,
                );
              } else {
                delimiterRow +=
                  ((outputCell = documentNode.getNthChild(localItemIndex)).get('marginLeft') ||
                    '') +
                  formatTableDelimiterCell(columnAlignment, 4) +
                  (outputCell.get('marginRight') || '');
              }
            }
            delimiterRow += '|';
          } else {
            delimiterRow +=
              ' ' + formatTableDelimiterCell(columnAlignment, columnWidths[localItemIndex]) + ' |';
          }
        }
        return delimiterRow;
      }
      try {
        switch (this.get('type')) {
          case NodeType.meta_block:
            markdownLines.push('---');
            (markdownLines = markdownLines.concat(
              (this.get('text') || '').replace(/^---/gm, '​---').split(/\r*\n/),
            )).push(this.get('patternEnd') || '---');
            appendTrailingBlankLines(markdownLines, this);
            return markdownLines;
          case NodeType.heading:
            appendLeadingBlankLines(markdownLines, this);
            blockContent = serializeNodeContent(this);
            if (this.get('pattern')) {
              blockContent = utilities.escapeStringReplace(blockContent);
              markdownLines = markdownLines.concat(
                this.get('pattern').replace('{0}', blockContent).split(/\r*\n/),
              );
            } else {
              if (
                !DocumentNode.isType(this.get('parent'), NodeType.list_item) &&
                (1 == File.option.headingStyle || 3 == File.option.headingStyle) &&
                this.get('depth') <= 2
              ) {
                markdownLines.push(blockContent);
                if (3 == File.option.headingStyle) {
                  markdownLines.push(
                    (1 == this.get('depth') ? '=' : '-').repeat(
                      Math.max(1, utilities.wcswidth(this.get('text'))),
                    ),
                  );
                } else {
                  markdownLines.push(1 == this.get('depth') ? '===' : '---');
                }
              } else {
                var headingLine = '#'.repeat(this.get('depth')) + ' ' + blockContent;
                if (2 == File.option.headingStyle) {
                  headingLine += ' ' + '#'.repeat(this.get('depth'));
                }
                markdownLines.push(headingLine);
              }
            }
            appendTrailingBlankLines(markdownLines, this);
            return markdownLines;
          case NodeType.paragraph:
            if (isTrailingEmptyParagraph(this)) {
              return markdownLines;
            } else {
              appendLeadingBlankLines(markdownLines, this);
              blockContent = serializeNodeContent(this)
                .split(/\r?\n/g)
                .map(function (item) {
                  return item || '';
                });
              markdownLines = /^( {4}|\t)/.exec(blockContent[0])
                ? markdownLines.concat(
                    blockContent.map(function (inputText) {
                      return inputText.replace(/^( {4}|\t)/, '​$1');
                    }),
                  )
                : markdownLines.concat(blockContent);
              if (
                void 0 === (currentTrailingBlankLines = this.get('tail')) &&
                this.get('after') &&
                DocumentNode.isType(this.get('parent'), NodeType.list_item)
              ) {
                currentTrailingBlankLines = belongsToTightListItem(this) ? 0 : void 0;
              }
              if (
                DocumentNode.isType(this.get('after'), NodeType.paragraph) &&
                currentTrailingBlankLines < 1
              ) {
                this.unset('tail');
              }
              if (
                DocumentNode.isType(this.get('after'), NodeType.math_block) &&
                !this.get('tail')
              ) {
                currentTrailingBlankLines = 0;
              }
              if (void 0 === currentTrailingBlankLines) {
                appendTrailingBlankLines(markdownLines, this, currentTrailingBlankLines);
              } else {
                appendBlankLines(markdownLines, currentTrailingBlankLines);
              }
              return markdownLines;
            }
          case NodeType.blockquote:
            appendLeadingBlankLines(markdownLines, this);
            blockContent = serializeNodeContent(this);
            if ((userIndents = reconcileStoredIndents(this.get('userIndent'), blockContent))) {
              blockContent.map(function (item, itemIndex) {
                blockContent[itemIndex] = (userIndents[itemIndex] || '') + item;
              });
            } else {
              this.unset('userIndent');
              blockText = getListItemPrefix(NodeType.blockquote, 0, this, this.get('pattern'));
              blockContent.map(function (item, itemIndex) {
                blockContent[itemIndex] = item ? blockText + item : blockText.replace(/\s+$/, '');
              });
            }
            appendTrailingBlankLines((markdownLines = markdownLines.concat(blockContent)), this);
            if (
              '' !== markdownLines.last() &&
              DocumentNode.isType(this.get('after'), NodeType.blockquote)
            ) {
              markdownLines.push('');
            }
            return markdownLines;
          case NodeType.list:
            appendLeadingBlankLines(markdownLines, this);
            var style = this.get('style'),
              looseList = this.isLoose(),
              childrenLength = this.get('children').length,
              localDocumentNode = this;
            if (childrenLength) {
              for (
                var listItem = this.getFirstChild(),
                  listStartOffset = Number.isNaN(Number.parseInt(this.get('start')))
                    ? 0
                    : Number.parseInt(this.get('start')) - 1,
                  currentItemIndex = 0;
                listItem;
              ) {
                listItem.set('tight', !looseList);
                blockContent = serializeNodeLines.call(listItem);
                serializedValue = this.get('pattern');
                if (looseList && serializedValue && listItem.get('markindent')) {
                  serializedValue = getBlockIndent(
                    style,
                    serializedValue.trim(),
                    listItem.get('markindent'),
                  );
                }
                var userIndents,
                  leadingSpaces = Math.min(listItem.get('prespace') || 0, 3),
                  fixedNumbering =
                    (void 0 === this.get('isFixed') && File.option.olStyle) || this.get('isFixed'),
                  length = (blockText =
                    ' '.repeat(leadingSpaces) +
                    getListItemPrefix(
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
                if (
                  (userIndents = reconcileStoredIndents(
                    listItem.get('userIndent'),
                    blockContent,
                    true,
                  ))
                ) {
                  if (listItem.get('style') == DocumentNode.ListType.task) {
                    if (userIndents[0].trim().length && -1 == userIndents[0].indexOf('[')) {
                      userIndents[0] = userIndents[0] + '[ ] ';
                    }
                    if (listItem.get('checked')) {
                      userIndents[0] = userIndents[0].replace('[ ]', '[x]');
                    } else {
                      userIndents[0] = userIndents[0].replace(/\[x\]/i, '[ ]');
                    }
                  }
                  blockContent.map(function (item, itemIndex) {
                    blockContent[itemIndex] = userIndents[itemIndex] + item;
                    markdownLines.push(blockContent[itemIndex].replace(sourceMarkerPattern, ''));
                  });
                } else {
                  listItem.unset('userIndent');
                  var currentBlockText = blockText;
                  if (listItem.get('style') == DocumentNode.ListType.task) {
                    currentBlockText = blockText + (listItem.get('checked') ? '[x] ' : '[ ] ');
                  }
                  blockContent.map(function (item, itemIndex) {
                    blockContent[itemIndex] =
                      (itemIndex ? (item ? continuationIndent : '') : currentBlockText) +
                      blockContent[itemIndex];
                    markdownLines.push(blockContent[itemIndex].replace(sourceMarkerPattern, ''));
                  });
                }
                currentItemIndex++;
                listItem = listItem.get('after');
              }
            }
            if (
              DocumentNode.isType(this.get('after'), NodeType.list) &&
              (!this.get('tail') || this.get('tail')) < 1 &&
              this.get('pattern') == this.get('after').get('pattern') &&
              this.get('style') == this.get('after').get('style')
            ) {
              this.unset('tail');
              markdownLines.push('');
              if (belongsToTightListItem(this)) {
                markdownLines.push('');
              }
            }
            appendTrailingBlankLines(
              markdownLines,
              this,
              belongsToTightListItem(this)
                ? 0
                : (function (listNode) {
                    var trailingBlankLines = localDocumentNode.get('tail'),
                      documentNode = localDocumentNode.get('after');
                    if (0 === trailingBlankLines) {
                      if (DocumentNode.isType(documentNode, NodeType.paragraph)) {
                        return void listNode.unset('tail');
                      }
                      if (
                        DocumentNode.isType(documentNode, NodeType.fences) &&
                        /^\s+$/.exec(documentNode.get('pattern') || '')
                      ) {
                        return void listNode.unset('tail');
                      }
                    }
                    return trailingBlankLines;
                  })(this),
            );
            return markdownLines;
          case NodeType.list_item:
            var currentTrailingBlankLines;
            for (
              'string' == typeof (blockContent = serializeNodeContent(this)) &&
                (blockContent = [blockContent]),
                markdownLines = markdownLines.concat(blockContent),
                void 0 == (currentTrailingBlankLines = this.get('tail')) &&
                  !this.get('tight') &&
                  this.get('after') &&
                  (currentTrailingBlankLines = 1),
                currentTrailingBlankLines > 0 && markdownLines.push('');
              markdownLines.length > 2 &&
              '' === markdownLines.last() &&
              '' === markdownLines[markdownLines.length - 2];
            ) {
              markdownLines.pop();
            }
            return markdownLines;
          case NodeType.fences:
            appendLeadingBlankLines(markdownLines, this);
            var text = this.getText();
            blockContent = text.split(/\r*\n/);
            if (true === this.get('empty')) {
              blockContent = [];
            }
            if (this.get('lang')) {
              if ((this.get('pattern') || '').trim()) {
                serializedValue = this.get('pattern');
              } else {
                this.unset('pattern');
                serializedValue = /^\s*```/gm.exec(this.get('text') || '') ? '~~~{0}' : '```{0}';
              }
            } else {
              serializedValue = this.get('pattern') || '```{0}';
            }
            var localText = serializedValue.replace(/\s*\{0\}/, ''),
              trimmedTextLength = localText.trim().length;
            if (this.get('pattern')) {
              localText = this.get('patternEnd') || localText;
            }
            var regex,
              fenceExtension = 0,
              match = serializedValue.match(/^\s+$/),
              fenceCharacter = (serializedValue.match(/[`~]/) || [])[0];
            if (fenceCharacter) {
              regex = new RegExp(`^(${fenceCharacter}{${trimmedTextLength},})s*$`);
            }
            for (currentItemIndex = 0; currentItemIndex < blockContent.length; currentItemIndex++) {
              if (regex) {
                var currentMatch = regex.exec(blockContent[currentItemIndex]);
                if (currentMatch && currentMatch[1]) {
                  fenceExtension =
                    Math.max(fenceExtension + trimmedTextLength, currentMatch[1].length + 1) -
                    trimmedTextLength;
                }
              }
              blockContent[currentItemIndex] =
                (match ? serializedValue : '') + blockContent[currentItemIndex];
              blockContent[currentItemIndex] = blockContent[currentItemIndex] || '';
              if (this.get('userIndent')) {
                blockContent[currentItemIndex] =
                  this.get('userIndent') + blockContent[currentItemIndex];
              }
            }
            if (!match) {
              if (fenceExtension) {
                serializedValue = fenceCharacter.repeat(fenceExtension + trimmedTextLength) + '{0}';
                localText = fenceCharacter.repeat(fenceExtension + trimmedTextLength);
              }
              markdownLines.push(
                serializedValue.replace(
                  /\{0\}/,
                  utilities.escapeStringReplace(this.get('lang') || ''),
                ),
              );
            }
            markdownLines = markdownLines.concat(blockContent);
            if (!(match || this.get('noCloseTag'))) {
              markdownLines.push(localText);
            }
            appendTrailingBlankLines(markdownLines, this);
            return markdownLines;
          case NodeType.math_block:
            appendLeadingBlankLines(markdownLines, this);
            if (this.get('legacyMath')) {
              markdownLines.push('\\[');
            } else {
              if (this.get('tagBefore')) {
                markdownLines.push('$$ {' + this.get('tagBefore') + '}');
              } else {
                markdownLines.push('$$');
              }
            }
            markdownLines = markdownLines.concat(
              this.get('text')
                .replace(/(^\n)|(\n$)/g, '')
                .split(/\r?\n/)
                .map(function (item) {
                  return item || '';
                }),
            );
            if (this.get('legacyMath')) {
              markdownLines.push('\\]');
            } else {
              if (this.get('tagAfter')) {
                markdownLines.push('$$ {' + this.get('tagAfter') + '}');
              } else {
                markdownLines.push('$$');
              }
            }
            appendTrailingBlankLines(
              markdownLines,
              this,
              DocumentNode.isType(this.get('after'), NodeType.paragraph) &&
                DocumentNode.isType(this.get('before'), NodeType.paragraph)
                ? 0
                : void 0,
            );
            return markdownLines;
          case NodeType.hr:
            appendLeadingBlankLines(markdownLines, this);
            markdownLines.push(this.get('pattern') || '------');
            appendTrailingBlankLines(markdownLines, this);
            return markdownLines;
          case NodeType.def_footnote:
            appendLeadingBlankLines(markdownLines, this);
            markdownLines.push(
              '[^' +
                this.get('ref') +
                ']:' +
                utilities.orDefault(this.get('pattern'), ' ') +
                serializeNodeContent(this),
            );
            appendTrailingBlankLines(
              markdownLines,
              this,
              !this.get('after') ||
                DocumentNode.isType(this.get('after'), DocumentNode.TYPE.def_footnote)
                ? 0
                : 1,
            );
            return markdownLines;
          case NodeType.def_link:
            appendLeadingBlankLines(markdownLines, this);
            var referenceDefinition,
              currentLength = this.safeGetStrAttr('title').length;
            if (this.get('pattern')) {
              var parts = this.get('pattern').split(';');
              referenceDefinition =
                parts[0] + this.get('ref') + parts[1] + this.safeGetStrAttr('href') + parts[2];
              if (currentLength) {
                referenceDefinition +=
                  (parts[3] || '\t') + (parts[4] || '"') + this.get('title') + (parts[5] || '"');
              }
            } else {
              referenceDefinition =
                '[' +
                this.get('ref') +
                ']: ' +
                this.safeGetStrAttr('href') +
                (currentLength ? '\t"' + this.get('title') + '"' : '');
            }
            markdownLines.push(referenceDefinition);
            appendTrailingBlankLines(
              markdownLines,
              this,
              !this.get('after') ||
                DocumentNode.isType(this.get('after'), DocumentNode.TYPE.def_link)
                ? 0
                : 1,
            );
            return markdownLines;
          case NodeType.table:
            appendLeadingBlankLines(markdownLines, this);
            if (this.get('userText')) {
              appendTrailingBlankLines(
                (markdownLines = markdownLines.concat(this.get('userText').clone())),
                this,
              );
              return markdownLines;
            }
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
              ) {
                cellContents[rowIndex][localItemIndex] = scannedCell.toMark().trim();
                scannedCell = scannedCell.get('after');
                if (0 === rowIndex) {
                  columnWidths[localItemIndex] = 4;
                }
                columnWidths[localItemIndex] = Math.max(
                  utilities.wcswidth(cellContents[rowIndex][localItemIndex]),
                  columnWidths[localItemIndex],
                );
                columnWidths[localItemIndex] = Math.min(columnWidths[localItemIndex], 60);
                if (isNaN(columnWidths[localItemIndex])) {
                  columnWidths[localItemIndex] = 0;
                }
                localItemIndex++;
              }
              currentDocumentNode = currentDocumentNode.get('after');
              rowIndex++;
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
              ) {}
              if (omitOuterPipes) {
                if ('|' == (rowMarkdown = rowMarkdown.replace(/(^\s*\|)|(\|\s*$)/g, '')).trim()) {
                  rowMarkdown = '|' + rowMarkdown;
                }
              } else {
                rowMarkdown = rowMarkdown.replace(/\s$/, '');
              }
              markdownLines.push(rowMarkdown);
              if (0 === rowIndex) {
                rowMarkdown =
                  '|' + formatTableDelimiterRow.call(this, columnWidths, currentDocumentNode);
                if (omitOuterPipes) {
                  markdownLines.push(rowMarkdown.replace(/(^\s*\|)|(\|\s*$)/g, ''));
                } else {
                  markdownLines.push(rowMarkdown.replace(/\s$/, ''));
                }
              }
              currentDocumentNode = currentDocumentNode.get('after');
            }
            appendTrailingBlankLines(markdownLines, this);
            return markdownLines;
          case NodeType.table_row:
            console.sendError('cannot call toMark on table_row');
            return '';
          case NodeType.table_cell:
            return escapeTablePipes(serializeNodeContent(this));
          case NodeType.toc:
            appendLeadingBlankLines(markdownLines, this);
            markdownLines.push(this.get('pattern') || '[TOC]');
            if (~(this.get('pattern') || '').indexOf('\n') && this.get('after')) {
              appendTrailingBlankLines(markdownLines, this, 2);
            } else {
              appendTrailingBlankLines(markdownLines, this);
            }
            return markdownLines;
          case NodeType.html_block:
            appendLeadingBlankLines(markdownLines, this);
            appendTrailingBlankLines(
              (markdownLines = markdownLines.concat(
                this.get('text')
                  .replace(/(^\n)|(\n$)/g, '')
                  .split(/\r?\n/)
                  .map(function (item) {
                    return item || '';
                  }),
              )),
              this,
            );
            return markdownLines;
          default:
            return serializeNodeContent(this);
        }
      } catch (error) {
        console.error(error.stack);
        return markdownLines;
      }
    },
    escapeTablePipes = function (text) {
      var placeholderStart = '',
        placeholderEnd = '',
        items = [],
        protectedIndex = 0,
        restoredIndex = 0;
      text = text.replace(/(^|[^\\])`[^`]*\|[^`]*`/g, function (codeSpan) {
        items.push(codeSpan);
        return [placeholderStart, ++protectedIndex - 1, placeholderEnd].join('');
      });
      if (File.option.enableInlineMath) {
        text = text.replace(/(^|[^\\])\$[^$]*\|[^$]*\$/g, function (mathSpan) {
          items.push(mathSpan);
          return [placeholderStart, ++protectedIndex - 1, placeholderEnd].join('');
        });
      }
      return text
        .replace(/\|/g, '\\|')
        .replace(/\\\\\|/g, '\\|')
        .replace(/\uE07A[^\uE07B]+\uE07B/g, function () {
          return items[++restoredIndex - 1];
        });
    },
    getBlockIndent = function (blockStyle, bulletMarker, indentWidth) {
      var prettyIndent = File.option.prettyIndent;
      if (void 0 !== indentWidth) {
        indentWidth -= 0;
      } else {
        indentWidth = Math.max(File.option.indentSize - 0, 2);
      }
      if (blockStyle == NodeType.blockquote) {
        return '>' + ' '.repeat(Math.min(indentWidth - 1, prettyIndent ? 4 : 1));
      } else {
        if (blockStyle === DocumentNode.ListType.ol) {
          return '{0}.' + ' '.repeat(Math.min(indentWidth - 2, prettyIndent ? 4 : 1) || 1);
        } else {
          if (blockStyle === DocumentNode.ListType.ul) {
            return (
              (bulletMarker || unorderedListMarkers[File.option.ulStyle]) +
              ' '.repeat(Math.min(indentWidth - 1, prettyIndent ? 4 : 1))
            );
          } else {
            return unorderedListMarkers[File.option.ulStyle] + ' ';
          }
        }
      }
    },
    getListItemPrefix = function (blockStyle, itemNumber, unusedParameter3, text) {
      var indentSize = File.option.indentSize;
      itemNumber++;
      text = text || getBlockIndent(blockStyle);
      if (!$.isNumeric(indentSize) || indentSize < 2) {
        indentSize = 2;
      }
      if (blockStyle == NodeType.blockquote) {
        return text;
      } else {
        if (blockStyle === DocumentNode.ListType.ol) {
          return text.replace('{0}', itemNumber);
        } else {
          return text;
        }
      }
    };
  DocumentNode.getIndentPrefix = getListItemPrefix;
  DocumentNode.getDefaultPrefixPattern = getBlockIndent;
  DocumentNode.markFromArr = function (nodes) {
    var serializedNodes = serializeNodeCollection(nodes);
    if (serializedNodes instanceof Array) {
      return serializedNodes.join(File.useCRLF ? '\r\n' : '\n').replace(sourceMarkerPattern, '');
    } else {
      return serializedNodes;
    }
  };
  var reconcileStoredIndents = function (storedIndents, contentLines, padNonemptyLines) {
      var length = contentLines.length;
      if (!storedIndents || !length) {
        return null;
      }
      if (1 == length) {
        if (1 == storedIndents.length) {
          return storedIndents;
        } else {
          return null;
        }
      }
      var items = null;
      if (storedIndents.length < length) {
        var text;
        if (!(text = storedIndents.last() || storedIndents[1] || '').length || text.trim().length) {
          return null;
        }
        items = storedIndents.concat(new Array(length - storedIndents.length).fill(text));
      } else {
        items = storedIndents.length > length ? storedIndents.slice(0, length) : storedIndents;
      }
      if (
        items &&
        padNonemptyLines &&
        (text = items.last() || items[1] || '').length &&
        !text.trim().length
      ) {
        return items.map((item, itemIndex) =>
          contentLines[itemIndex].length ? item || text : item,
        );
      }
      return items;
    },
    serializeNodeCollection = function (items) {
      var serializedLines = [],
        inlineMarkdown = '';
      function appendSerializedNode(node) {
        var serializedNode = serializeNodeLines.call(node);
        if (serializedNode instanceof Array) {
          serializedLines = serializedLines.concat(serializedNode);
        } else {
          inlineMarkdown += serializedNode;
        }
      }
      if (items.length) {
        if (items instanceof Array) {
          items.map(function (item) {
            appendSerializedNode(item);
          });
        } else {
          var documentNode = items.sortedFirst();
          do {
            appendSerializedNode(documentNode);
            documentNode = documentNode.get('after');
          } while (documentNode);
        }
      }
      if (serializedLines.length) {
        return serializedLines;
      } else {
        return inlineMarkdown;
      }
    };
  DocumentMap.prototype.toMark = function () {
    if (this.blocks.length > 0) {
      var documentNode = this.blocks.sortedFirst();
      documentNode = documentNode.getFirstBrother();
      var textParts = [],
        inlineMarkdown = '';
      do {
        var serializedNode = serializeNodeLines.call(documentNode);
        if (serializedNode instanceof Array) {
          textParts = textParts.concat(serializedNode);
        } else {
          inlineMarkdown += serializedNode;
        }
        documentNode = documentNode.get('after');
      } while (documentNode);
      if (textParts.length) {
        return textParts.join(File.useCRLF ? '\r\n' : '\n').replace(sourceMarkerPattern, '');
      } else {
        return inlineMarkdown;
      }
    }
    return '';
  };
  DocumentNode.getIndentPrefix = getListItemPrefix;
  Object.defineProperty(globalThis, '__MARKLYRA_NATIVE_SERIALIZATION__', {
    value: Object.freeze({
      version: 1,
      moduleSha256: 'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb',
      nodePrototype: DocumentNode.prototype,
      mapPrototype: DocumentMap.prototype,
      nodeToMark: DocumentNode.prototype.toMark,
      mapToMark: DocumentMap.prototype.toMark,
      lines: serializeNodeLines,
      array: Array,
    }),
  });
}
