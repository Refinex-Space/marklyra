// model/markdown-parser.
export default function initializeModelMarkdownParser(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(splitTableCells, 'name', { value: 'le', configurable: true });
  Object.defineProperty(consumeBlockLine, 'name', { value: 'de', configurable: true });
  Object.defineProperty(InlineLexer, 'name', { value: 'pe', configurable: true });
  Object.defineProperty(protectCodeSpans, 'name', { value: 'xe', configurable: true });
  Object.defineProperty(restoreCodeSpans, 'name', { value: 'Ce', configurable: true });
  Object.defineProperty(restoreEscapedCharacters, 'name', { value: 'Fe', configurable: true });
  Object.defineProperty(createPatternBuilder, 'name', { value: 'ke', configurable: true });
  Object.defineProperty(EmptyRule, 'name', { value: 'Ee', configurable: true });
  Object.defineProperty(assignOwnProperties, 'name', { value: 'Te', configurable: true });
  Object.defineProperty(renderContentWithBlockSyntax, 'name', { value: 'Be', configurable: true });

  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    inlineDecoration = requireModule('render/inline-decoration'),
    undoManager = requireModule('editing/undo-manager'),
    emoji = requireModule('editing/emoji'),
    htmlBlocks = requireModule('render/html-blocks'),
    smartQuotes = requireModule('editing/smart-quotes'),
    listPrefixPatterns = {
      ul: /^(\s*)(([-+*])\s+)/,
      ol: /^(\s*)\d+((\.|\)))\s+/,
      tasklist: /^(\s*)(([-+*])\s*)\[((x|X)| )\]\s+/,
    },
    blockPrefixPattern = /^(\s*)([-+*>\[]|\d+(\.|\)))\s+/,
    indentationPattern = /^(\s*)[^\s]/,
    activeListMarkerPatterns = null,
    listMarkerPatterns = {
      ul: /^(\s*)([-+*])\s+/,
      ol: /^(\s*)(\d+(\.|\)))\s+/,
      tasklist: /^(\s*)([-+*]\s*\[((x|X)| )\])\s+/,
    },
    topLevelListMarkerPatterns = {
      ul: /^(\s{0,3})([-+*])\s+/,
      ol: /^(\s{0,3})(\d+(\.|\)))\s+/,
      tasklist: /^(\s{0,3})([-+*]\s*\[((x|X)| )\])\s+/,
    },
    lineEndingPattern = /\r\n|\r|\n|\u2424/,
    blankBlockLinePattern = /^[ \u00A0]{0,3}$/,
    whitespaceLinePattern = /^[\s\u00A0]*$/,
    blockquotePattern = /(^[ \u00A0]{0,3}>\s*)(.*)$/,
    headingPattern = /(^\s*(#{1,6})\s*)([^\n]+?)(\s+#+\s*)*$/,
    spacedHeadingPattern = /(^\s*(#{1,6})\s+)([^\n]+?)(\s+#+\s*)*$/,
    setextHeadingPattern = /^ *(=|-){2,}[\s\u00A0]*$/,
    blockStartPattern = /^\s*[-+*_<\[\{|#0-9`~=>$\\]/,
    openingFencePattern = /^( *(`{3,}|~{3,})[ \t\u00A0]*)([^\n`]+)? *$/,
    closingFencePattern = /^\s*(`{3,}|~{3,})\s*$/,
    displayMathFencePattern = /^\s*\${2}\s*(?:\{(.+)\})?$/,
    openingMathBracketPattern = /^\s*\\\[\s*$/,
    closingMathBracketPattern = /^\s*\\\]\s*$/,
    indentedCodeLinePattern = /^( {4}|(?: {0,3}\t))(\s*\S.*)$/,
    codeIndentPattern = /^( {4}|(?: {0,3}\t))/,
    horizontalRulePattern = /^\s*([-+_*])\s*\1\s*\1(\s|\1)*$/,
    tocMarkerPattern = /^\s*\[toc\]\s*$/i,
    tocAttributePattern = /^\s*\{:toc\}\s*$/i,
    wikiTocMarkerPattern = /^\s*\[\[_TOC_\]\]\s*$/,
    tocOptionsPattern = /^\s?\{:\s*toc(\s*|(\s+.*))\}/,
    referenceDefinitionPattern =
      /^\s*\[([^\]]+)\]:(\s*<?)([^\s>]+)(>?)((\s+)(["'(])([^\n]*)(["')]))?\s*$/,
    footnoteDefinitionPattern = /^\s*\[\^([^\]\n]+)\]:(\s*)([^\n]*)$/,
    frontMatterFencePattern = /^-{3}$/,
    tableRowPattern = /^ *\|([^\|]+\|.+)\|\s*$/,
    leadingPipeSeparatorPattern = /^\s*\|(\s*[-:]+\s*\|[-|\s:]*)$/,
    tableSeparatorPattern = /^\s*([-:]+\s*\|[-|\s:]*)$/,
    pipePattern = /\|/,
    htmlBlockOpenPattern = htmlBlocks.BLOCK_OPEN_REG,
    unicodeBlockStartPattern = /^\s*[-\u2013\u2014+*_<\u3010\[\{|#0-9`~=>$\\]/,
    unicodeDashPattern = /^\s*([-\u2013\u2014])/,
    unicodeTocPattern = /^\s*[\[\u3010]toc[\]\u3011]\s*$/i,
    unicodeFrontMatterFencePattern = /^(-{3}|\u2013[-\u2013\u2014]+|\u2014[-\u2013\u2014]*)$/,
    blockInterruptPatterns = [
      /^\s*([-+*]|(\d+[\.\)]))\s/,
      /^\s*(>|```|---)/,
      /^\s*#{1,6}/,
      indentedCodeLinePattern,
      htmlBlockOpenPattern,
    ],
    spacedBlockInterruptPatterns = [
      /^\s*([-+*]|(\d+[\.\)]))\s/,
      /^\s*(>|```|---)/,
      /^\s*#{1,6}\s+/,
      indentedCodeLinePattern,
      htmlBlockOpenPattern,
    ],
    quotePrefixCache = {},
    nestedQuotePrefixCache = {},
    listIndentCache = {},
    listContinuationCache = {},
    tabReplacement = '  ',
    detectFixedListNumbering = Object.defineProperty(
      function (documentNode) {
        if (documentNode.get('style') == DocumentNode.ListType.ol) {
          for (
            var fixedNumbering = (function (inputDocumentNode) {
                if (inputDocumentNode.get('style') == DocumentNode.ListType.ol) {
                  for (
                    var currentDocumentNode = inputDocumentNode.getFirstChild(),
                      hasSequentialItems = false,
                      nextNode = currentDocumentNode.get('after');
                    nextNode && nextNode._numText;
                  ) {
                    if (currentDocumentNode._numText.trim() != nextNode._numText.trim()) {
                      return false;
                    }
                    hasSequentialItems = true;
                    nextNode = (currentDocumentNode = nextNode).get('after');
                  }
                  return hasSequentialItems;
                }
              })(documentNode),
              localDocumentNode = documentNode.getFirstChild(),
              _numText = localDocumentNode._numText;
            localDocumentNode;
          ) {
            localDocumentNode._numText = void 0;
            localDocumentNode = localDocumentNode.get('after');
          }
          if (fixedNumbering) {
            documentNode.set('pattern', _numText);
          }
          documentNode.set('isFixed', fixedNumbering);
        }
      },
      'name',
      { value: 'ie', configurable: true },
    ),
    measureExpandedIndent = Object.defineProperty(
      function (text) {
        return (text || '').replace(/\t/g, tabReplacement).length;
      },
      'name',
      { value: 're', configurable: true },
    ),
    BlockCloseResult = { NOT_CLOSE: 0, CLOSE_EXCLUDE: 1, CLOSE_INCLUDE: 2, UNKNOWN: -1 },
    getHTMLTagReg = htmlBlocks.getHTMLTagReg,
    blockRules = {
      paragraph: {
        shouldClose: function (lineText) {
          if (lineText.match(blankBlockLinePattern)) {
            this.cur.set('tail', 1);
            return BlockCloseResult.CLOSE_INCLUDE;
          } else {
            return BlockCloseResult.UNKNOWN;
          }
        },
        onClose: function (endOfInput) {
          if (this.cur._lines.length > 1 && this.cur._lines[0].match(whitespaceLinePattern)) {
            this.cur.set('ahead', 1);
            this.cur._lines.shift();
          }
          if (!this.cur._lines.length) {
            this.cur._lines.push('');
          }
          this.cur.set('text', this.cur._lines.join('\n'));
          if (void 0 == this.cur.get('tail') && !endOfInput && this.cur._lines.last().trim()) {
            this.cur.set('tail', 0);
          }
          this.cur._lines = void 0;
        },
        onContinue: function (lineText) {
          this.cur._lines.push(lineText);
        },
      },
      html_block: {
        shouldClose: function (inputText) {
          var match,
            tagDepth = this.cur.get('depth') || 0,
            tagPattern = getHTMLTagReg(this.cur.get('style')),
            text = inputText;
          if (!inputText.trim()) {
            return BlockCloseResult.CLOSE_EXCLUDE;
          }
          for (; (match = tagPattern.exec(text)); ) {
            text = text.substring(match.index + match[0].length);
            if (match[2]) {
              tagDepth--;
            } else {
              if (!match[1]) {
                tagDepth++;
              }
            }
          }
          if (tagDepth <= 0) {
            this.cur.set('depth', 0);
            this.cur._lines.push(inputText);
            return BlockCloseResult.CLOSE_INCLUDE;
          } else {
            this.cur.set('depth', tagDepth);
            return BlockCloseResult.NOT_CLOSE;
          }
        },
        onClose: function () {
          var depth = this.cur.get('depth');
          this.cur.set('text', this.cur._lines.join('\n'));
          if (depth && this.skips.enableStartMatch) {
            if (1 != this.cur._lines.length || />/.exec(this.cur._lines[0])) {
              htmlBlocks.autoCloseTag(this.cur);
            } else {
              this.cur.set('type', NodeType.paragraph);
              this.cur.unset('style');
            }
          }
          this.cur._lines = void 0;
        },
        onContinue: function (lineText) {
          this.cur._lines.push(lineText);
        },
      },
      blockquote: {
        shouldClose: function (text) {
          if (text.trim().length) {
            if (text.match(blockquotePattern)) {
              return BlockCloseResult.NOT_CLOSE;
            } else {
              if (text.match(/\t|( {2,})/)) {
                return BlockCloseResult.NOT_CLOSE;
              } else {
                return BlockCloseResult.UNKNOWN;
              }
            }
          } else {
            this.cur.set('tail', 1);
            return BlockCloseResult.CLOSE_INCLUDE;
          }
        },
        onClose: function () {
          new BlockLexer(this.cur._lines, this.cur, null, null, this.skips);
          this.cur._lines = void 0;
          this.cur.unset('text');
          if (!(this.skips || {}).pass_format) {
            this.cur.set('userIndent', this.cur._lineIndents);
          }
          this.cur._lineIndents = void 0;
        },
        onContinue: function (text) {
          var _indent = this.cur._indent;
          if (!quotePrefixCache[_indent]) {
            quotePrefixCache[_indent] = new RegExp(
              '^((( {0,' +
                (_indent + 4) +
                '}|\\t)> {0,' +
                (_indent || 1) +
                '})|(\\t| {2})|>(\\t| {0,' +
                (_indent || 1) +
                '}))',
            );
          }
          var prefixMatch = quotePrefixCache[_indent].exec(text) || [''],
            prefixText = prefixMatch[0];
          if (!prefixMatch[2] && (prefixMatch[4] || '').length > 0) {
            prefixMatch[2] = '> '.substr(0, prefixText.length);
            text = prefixMatch[2] + text.substring(prefixText.length);
          }
          this.cur._indentSensitive =
            this.cur._indentSensitive ||
            /^\s*([-+*>]|\d+(\.|\)))\s/.exec(text.substring(prefixText.length));
          if (prefixMatch[2] && _indent < 4 && !this.cur._indentSensitive) {
            if (!nestedQuotePrefixCache[_indent]) {
              nestedQuotePrefixCache[_indent] = new RegExp('^( {1,' + (4 - _indent) + '}|\\t)>');
            }
            if (!nestedQuotePrefixCache[_indent].exec(text.substring(prefixText.length))) {
              prefixText += (new RegExp('^ {1,' + (4 - _indent) + '}').exec(
                text.substring(prefixText.length),
              ) || [''])[0];
            }
          }
          if (/^\s*>*\s*$/.exec(text)) {
            this.cur._lineIndents.push(text);
            this.cur._lines.push('');
          } else {
            this.cur._lineIndents.push(prefixText);
            this.cur._lines.push(text.substring(prefixText.length));
          }
        },
      },
      list: {
        shouldClose: function (lineText) {
          var match,
            lastChild = this.cur.getLastChild();
          if (!listIndentCache[lastChild._indent]) {
            listIndentCache[lastChild._indent] = new RegExp('^( {' + lastChild._indent + ',}|\\t)');
          }
          if (lineText.match(listIndentCache[lastChild._indent])) {
            this.cur.unset('tail');
            return BlockCloseResult.NOT_CLOSE;
          } else {
            if (lineText.match(whitespaceLinePattern)) {
              this.cur.set('tail', (this.cur.get('tail') || 0) + 1);
              if (this.cur.get('tail') > 1) {
                this.cur.set('tail', 1);
                return BlockCloseResult.CLOSE_EXCLUDE;
              } else {
                return BlockCloseResult.NOT_CLOSE;
              }
            } else {
              if (lineText.match(horizontalRulePattern)) {
                return BlockCloseResult.CLOSE_EXCLUDE;
              } else {
                if (
                  lastChild._minIndent < lastChild._indent &&
                  (listIndentCache[lastChild._minIndent] ||
                    (listIndentCache[lastChild._minIndent] = new RegExp(
                      '^( {' + lastChild._minIndent + ',})',
                    )),
                  lineText.match(listIndentCache[lastChild._minIndent]))
                ) {
                  this.cur.unset('tail');
                  lastChild._indent = /^\s+/.exec(lineText)[0].length;
                  lastChild._indentDecided = false;
                  return BlockCloseResult.NOT_CLOSE;
                } else {
                  if ((match = listPrefixPatterns[this.cur.get('style')].exec(lineText))) {
                    if (match[3] == this.cur._mark) {
                      return 0;
                    } else {
                      return 1;
                    }
                  } else {
                    if (this.lines[this.ln - 1].match(whitespaceLinePattern)) {
                      return BlockCloseResult.CLOSE_EXCLUDE;
                    } else {
                      return BlockCloseResult.UNKNOWN;
                    }
                  }
                }
              }
            }
          }
        },
        onClose: function () {
          for (
            var lastChild = this.cur.getLastChild(), trailingLines = this.cur.get('tail') || 0;
            trailingLines > 0 && !lastChild._lines.last().trim().length;
          ) {
            lastChild._lines.pop();
            lastChild._lineIndents.pop();
            trailingLines--;
          }
          new BlockLexer(lastChild._lines, lastChild, null, null, this.skips);
          lastChild.unset('text');
          if (!(this.skips || {}).pass_format) {
            lastChild.set('userIndent', lastChild._lineIndents);
          }
          lastChild._lines = void 0;
          lastChild._indent = void 0;
          lastChild._minIndent = void 0;
          lastChild._indentDecided = void 0;
          lastChild._lineIndents = void 0;
          this.cur._mark = void 0;
          this.cur.unset('text');
          if (!(this.skips || {}).pass_format) {
            detectFixedListNumbering(this.cur);
            if (!this.cur.get('tail') && this.lines[this.ln]) {
              this.cur.set('tail', 0);
            }
          }
        },
        onContinue: function (textSlice, markerText, _indent) {
          Object.defineProperty(appendListItemLine, 'name', { value: 'v', configurable: true });

          var currentMatch,
            lastChild = this.cur.getLastChild(),
            markerWidth = measureExpandedIndent(markerText),
            contentIndent = File.option.strictMarkdown ? markerWidth - _indent : 2,
            style = this.cur.get('style'),
            _numLength = 0;
          const orderedMarkerPattern = /^\s*(\d+)(\.|\))\s+/,
            numberedPrefixPattern = /^\s*(\d+(\.|\))\s+)/;
          function appendListItemLine(listItem, lineText, resetLines) {
            if (resetLines) {
              listItem._lines = [];
            }
            listItem._lines.push(lineText);
            listItem.set('userIndent', listItem._lineIndents);
          }
          var currentTextSlice, localMatch;
          _indent = _indent || (lastChild ? lastChild.get('prespace') : 0) || 0;
          if (!textSlice.match(whitespaceLinePattern)) {
            this.cur.unset('tail');
          }
          if (!lastChild) {
            if (style == DocumentNode.ListType.ol) {
              _numLength = orderedMarkerPattern.exec(textSlice)[1].length - 1;
            }
            lastChild = new DocumentNode({
              type: NodeType.list_item,
              prespace: _indent,
              markindent: markerWidth - _numLength - _indent,
            });
            this.cur.appendChild(lastChild);
            lastChild._indent = contentIndent + _indent;
            lastChild._minIndent =
              _numLength + (style == DocumentNode.ListType.ol ? 3 : 2) + _indent;
            if (style == DocumentNode.ListType.ol) {
              lastChild._numText = (numberedPrefixPattern.exec(textSlice) || [])[1];
              lastChild._numLength = _numLength;
            }
            if ((localMatch = listPrefixPatterns[DocumentNode.ListType.task].exec(textSlice))) {
              lastChild.set('checked', !!localMatch[5]);
              lastChild.set('style', DocumentNode.ListType.task);
              currentTextSlice = localMatch[0];
            } else {
              currentTextSlice = listPrefixPatterns[style].exec(textSlice)[0];
            }
            lastChild._lineIndents = [currentTextSlice];
            return void appendListItemLine(
              lastChild,
              textSlice.substring(currentTextSlice.length),
              true,
            );
          }
          lastChild._numLength = lastChild._numLength || 0;
          if (!listIndentCache[lastChild._indent]) {
            listIndentCache[lastChild._indent] = new RegExp('^( {' + lastChild._indent + ',}|\\t)');
          }
          var currentLength,
            _lines,
            match = textSlice.match(listIndentCache[lastChild._indent]);
          if (!listContinuationCache[lastChild._indent]) {
            if (lastChild._indent < 2) {
              listContinuationCache[lastChild._indent] = new RegExp('^\\t');
            }
            listContinuationCache[lastChild._indent] = new RegExp(
              '^( {2,' + lastChild._indent + '}|\\t)',
            );
          }
          currentLength = (textSlice.match(listContinuationCache[lastChild._indent]) || [''])[0]
            .length;
          currentTextSlice = (listContinuationCache[lastChild._indent].exec(textSlice) || [''])[0];
          textSlice = match ? textSlice.substring(currentTextSlice.length) : textSlice;
          if (
            lastChild.get('style') == DocumentNode.ListType.task &&
            !File.option.strictMarkdown &&
            match
          ) {
            currentTextSlice += (textSlice.match(/^ {4}/) || [''])[0];
            textSlice = textSlice.replace(/^ {4}/, '');
          }
          if (!match && (currentMatch = activeListMarkerPatterns[style].exec(textSlice))) {
            _indent = (currentMatch[1] || '').length;
            markerText = currentMatch[0];
            markerWidth = measureExpandedIndent(markerText);
            contentIndent = File.option.strictMarkdown ? markerWidth - _indent : 2;
            if (
              lastChild._lines.length > 1 &&
              lastChild._lines.last().match(whitespaceLinePattern)
            ) {
              lastChild._lines.pop();
              lastChild.set('tail', 1);
            } else {
              lastChild.set('tail', 0);
            }
            this.cur.unset('tail');
            new BlockLexer(lastChild._lines, lastChild, null, null, this.skips);
            if (!(this.skips || {}).pass_format) {
              lastChild.set('userIndent', lastChild._lineIndents);
            }
            lastChild.unset('text');
            lastChild._lines = void 0;
            lastChild._lineIndents = void 0;
            lastChild._indent = void 0;
            if (style == DocumentNode.ListType.ol) {
              _numLength = orderedMarkerPattern.exec(textSlice)[1].length - 1;
            }
            (lastChild = new DocumentNode({
              type: NodeType.list_item,
              prespace: _indent,
              markindent: markerWidth - _numLength - _indent,
            }))._numLength = _numLength;
            lastChild._numText = (numberedPrefixPattern.exec(textSlice) || [])[1];
            lastChild._minIndent =
              _numLength + (style == DocumentNode.ListType.ol ? 3 : 2) + _indent;
            currentTextSlice = currentMatch[0];
            if ((localMatch = listPrefixPatterns[DocumentNode.ListType.task].exec(textSlice))) {
              lastChild.set('checked', !!localMatch[5]);
              lastChild.set('style', DocumentNode.ListType.task);
              currentTextSlice = localMatch[0];
            }
            this.cur.appendChild(lastChild);
            lastChild._indent = contentIndent + _indent;
            lastChild._lineIndents = [currentTextSlice];
            return void appendListItemLine(
              lastChild,
              textSlice.substring(currentTextSlice.length),
              true,
            );
          }
          if (!lastChild._indentDecided) {
            if (
              (currentMatch = indentationPattern.exec(textSlice)) &&
              lastChild._indent &&
              lastChild._indent - _indent < 4
            ) {
              if (currentMatch[1].length) {
                var length = currentMatch[1].replace(/\t/, '    ').length,
                  totalIndent = length + lastChild._indent;
                if (
                  totalIndent > _indent + lastChild.get('markindent') &&
                  ((_lines = lastChild._lines),
                  blockPrefixPattern.exec(
                    (function (lines) {
                      if (!lines || 0 == lines.length) {
                        return '';
                      }
                      for (var itemIndex = lines.length - 1; itemIndex >= 0; itemIndex--) {
                        if (lines[itemIndex].trim().length > 0) {
                          return lines[itemIndex];
                        }
                      }
                      return '';
                    })(_lines),
                  ))
                ) {
                  length = lastChild.get('markindent') - lastChild._indent;
                } else {
                  if (totalIndent >= _indent + lastChild.get('markindent') + 4) {
                    length = length + lastChild._indent - 4 - lastChild.get('markindent');
                  }
                }
                lastChild._indent += length;
                this.cur.set('subindent', lastChild._indent - lastChild._numLength);
                lastChild.set('subindent', lastChild._indent - lastChild._numLength);
                currentTextSlice += textSlice.substring(0, length);
                textSlice = textSlice.substring(length);
              } else {
                lastChild.set('subindent', Math.max(2, currentLength - lastChild._numLength));
              }
            }
            lastChild._indentDecided = !!currentMatch;
          }
          lastChild._lineIndents.push(currentTextSlice);
          return void appendListItemLine(lastChild, textSlice, false);
        },
      },
      fences: {
        shouldClose: function (lineText) {
          var match;
          if ((match = closingFencePattern.exec(lineText))) {
            var closeResult =
              match[1][0] == this.cur._mark[0] && match[1].length >= this.cur._mark.length
                ? BlockCloseResult.CLOSE_INCLUDE
                : BlockCloseResult.NOT_CLOSE;
            if (closeResult == BlockCloseResult.CLOSE_INCLUDE && this.cur._mark != match[1]) {
              this.cur.set('patternEnd', match[0]);
            }
            return closeResult;
          }
          return BlockCloseResult.NOT_CLOSE;
        },
        onContinue: function (lineText) {
          this.cur._lines.push(lineText);
        },
        onClose: function (endOfInput) {
          let markerPattern = this.cur.get('pattern'),
            searchValue = (/^\s+/.exec(markerPattern) || [''])[0];
          if (searchValue) {
            let hasCommonIndent = true;
            for (let lineText of this.cur._lines) {
              if (0 != lineText.indexOf(searchValue)) {
                hasCommonIndent = false;
                break;
              }
            }
            if (hasCommonIndent) {
              this.cur._lines = this.cur._lines.map((text) => text.substr(searchValue.length));
              this.cur.set('userIndent', searchValue);
            }
          }
          this.cur.set('text', this.cur._lines.join('\n'));
          this.cur.set('empty', !this.cur._lines.length);
          if (endOfInput) {
            this.cur.set('noCloseTag', true);
          }
          this.cur._mark = void 0;
          this.cur._lines = void 0;
          var nextLine = this.lines[this.ln + 1];
          if (void 0 !== nextLine && nextLine.match(whitespaceLinePattern)) {
            this.cur.set('tail', 1);
            this.ln++;
          }
        },
      },
      code: {
        shouldClose: function (text) {
          if (text.match(indentedCodeLinePattern)) {
            return BlockCloseResult.NOT_CLOSE;
          } else {
            if (text.trim().length) {
              return BlockCloseResult.CLOSE_EXCLUDE;
            } else {
              if (this.cur._lines.length > 1 && !this.cur._lines.last().trim().length) {
                return BlockCloseResult.CLOSE_EXCLUDE;
              } else {
                return BlockCloseResult.NOT_CLOSE;
              }
            }
          }
        },
        onClose: function () {
          var text = this.lines[this.ln];
          if (text && !text.trim().length) {
            this.cur._lines.push(text.replace(codeIndentPattern, ''));
          }
          if (this.cur._lines.length > 1) {
            if (this.cur._lines.last().match(whitespaceLinePattern)) {
              this.cur.set('tail', 1);
              this.cur._lines.pop();
              if (
                this.cur._lines.length > 1 &&
                this.cur._lines.last().match(whitespaceLinePattern)
              ) {
                this.cur._lines.pop();
                this.ln--;
              }
            } else {
              this.cur.set('tail', 0);
            }
          }
          this.cur.set('text', this.cur._lines.join('\n'));
          this.cur.attributes.type = NodeType.fences;
          this.cur._lines = void 0;
        },
        onContinue: function (text) {
          this.cur._lines.push(text.replace(codeIndentPattern, ''));
        },
      },
    };
  function splitTableCells(text, unusedParameter2, expectedColumns) {
    Object.defineProperty(trimEmptyEdgeCells, 'name', { value: 'i', configurable: true });

    function trimEmptyEdgeCells(cells) {
      if (!(cells[0] || '').trim().length) {
        cells = cells.subarray(1);
      }
      if (!(cells.last() || '').trim().length) {
        cells = cells.subarray(0, cells.length - 1);
      }
      return cells;
    }
    var items,
      codeStartMarker = '',
      codeEndMarker = '',
      mathStartMarker = '',
      mathEndMarker = '',
      currentItems = [],
      localItems = [],
      placeholderIndex = 0,
      interruptPatterns = File.option.strictMarkdown
        ? spacedBlockInterruptPatterns
        : blockInterruptPatterns;
    for (var interruptPattern of interruptPatterns) {
      if (interruptPattern.exec(text)) {
        return null;
      }
    }
    if (-1 == text.indexOf('|')) {
      for (var interruptPattern of [
        horizontalRulePattern,
        tocMarkerPattern,
        tocAttributePattern,
        wikiTocMarkerPattern,
        tocOptionsPattern,
      ]) {
        if (interruptPattern.exec(text)) {
          return null;
        }
      }
    }
    text = text.replace(
      /(^|[^\\])((`+)([\s\S]*?[^`])\3(?!`))/g,
      function (unusedParameter1, prefixText, codeText) {
        currentItems.push(codeText);
        return [prefixText, codeStartMarker, ++placeholderIndex - 1, codeEndMarker].join('');
      },
    );
    if (File.option.enableInlineMath) {
      placeholderIndex = 0;
      text = text
        .replace(/\\\$/g, '')
        .replace(
          /(^|[^\\])((\$+)([\s\S]*?[^$])\3(?!\$))/g,
          function (unusedParameter1, inputText, callbackText) {
            localItems.push(callbackText.replace(/\uE07D/g, '\\$'));
            placeholderIndex++;
            return [
              inputText.replace(/\uE07D/g, '\\$'),
              mathStartMarker,
              placeholderIndex - 1,
              mathEndMarker,
            ].join('');
          },
        );
    }
    items = (text = text
      .replace(/\\\\/g, escapeMarkers.ESCAPE_ESCAPE)
      .replace(/\\\|/g, escapeMarkers.ESCAPE_VLINE)
      .replace(/\\\ /g, escapeMarkers.ESCAPE_SPACE)).split(pipePattern) || [text];
    if ('|' == text.trim() || !text.trim()) {
      return null;
    }
    items = trimEmptyEdgeCells(items);
    if (
      File.option.enableInlineMath &&
      ((text = text.replace(/\uE071(\d+)\uE072/g, function (unusedParameter1, placeholderIndex) {
        return localItems[placeholderIndex - 0];
      })),
      items.length < expectedColumns)
    ) {
      var splitCells = trimEmptyEdgeCells(text.split(pipePattern));
      if (splitCells.length == expectedColumns) {
        items = splitCells;
      }
    }
    for (placeholderIndex = items.length; placeholderIndex < expectedColumns; placeholderIndex++) {
      items.push('');
    }
    return items.map(function (inputText) {
      if (
        (currentText = inputText
          .replace(/\uE022/g, '\\ ')
          .replace(new RegExp('', 'g'), '\\$')
          .replace(/\uE071(\d+)\uE072/g, function (unusedParameter1, placeholderIndex) {
            return localItems[placeholderIndex - 0];
          })
          .replace(/\uE07A(\d+)\uE07B/g, function (unusedParameter1, placeholderIndex) {
            return currentItems[placeholderIndex - 0];
          }))
      ) {
        return currentText
          .replace(new RegExp(escapeMarkers.ESCAPE_ESCAPE, 'g'), '\\\\')
          .replace(new RegExp(escapeMarkers.ESCAPE_VLINE, 'g'), '\\|');
      } else {
        return currentText;
      }
      var currentText;
    });
  }
  var BlockLexer = Object.defineProperty(
    function (inputText, parentNode, documentMap, oldNode, parseSkips) {
      activeListMarkerPatterns = File.option.strictMarkdown
        ? topLevelListMarkerPatterns
        : listMarkerPatterns;
      var text = inputText;
      this.remap =
        File.shouldRemapPunctuation() &&
        (parseSkips.enableRemap || (oldNode && oldNode.cid == File.editor.focusCid));
      if ('string' == typeof inputText) {
        text = inputText.split(lineEndingPattern);
        if ('\n' === inputText.charCodeAt(inputText.length - 1)) {
          textLength -= 1;
        }
      }
      var textLength = text.length;
      for (
        this.lines = text,
          (function (parserState, parent, documentMap, oldNode, skips) {
            parserState.parent = parent;
            parserState.cur = null;
            parserState.skips = skips;
            parserState.ln = 0;
            parserState.blocks = [];
            parserState.oldNode = oldNode;
            parserState.nodeMap = parent || oldNode;
            parserState.nodeMap =
              (parserState.nodeMap ? parserState.nodeMap.get('in') : documentMap) || documentMap;
            tabReplacement = ' '.repeat(File.option.indentSize);
          })(this, parentNode, documentMap, oldNode, parseSkips),
          this.skips.enableMetaBlock = this.skips.enableMetaBlock && !parentNode;
        this.ln <= textLength;
        this.ln++
      ) {
        consumeBlockLine.call(this, text[this.ln], textLength);
      }
      for (var documentNode = this.blocks.last(); documentNode; ) {
        if (!(parentNode && 0 != documentNode.get('tail'))) {
          documentNode.unset('tail');
        }
        documentNode = documentNode.getLastChild();
      }
      return this;
    },
    'name',
    { value: 'ce', configurable: true },
  );
  function consumeBlockLine(text, lineCount) {
    Object.defineProperty(adoptLeadingBlankLine, 'name', { value: 'c', configurable: true });
    Object.defineProperty(consumeTrailingBlankLine, 'name', { value: 'u', configurable: true });
    Object.defineProperty(appendCompletedBlock, 'name', { value: 'p', configurable: true });
    Object.defineProperty(closeCurrentBlock, 'name', { value: 'f', configurable: true });
    Object.defineProperty(createListBlock, 'name', { value: 'm', configurable: true });
    Object.defineProperty(tryParseTable, 'name', { value: 'g', configurable: true });
    Object.defineProperty(appendTableOfContents, 'name', { value: 'v', configurable: true });
    Object.defineProperty(appendTableBlock, 'name', { value: 'y', configurable: true });

    var match,
      currentDocumentNode,
      blockRule,
      endOfInput = this.ln >= lineCount;
    function adoptLeadingBlankLine(documentNode) {
      if (
        DocumentNode.isType(this.cur, NodeType.paragraph) &&
        this.cur._lines &&
        1 == this.cur._lines.length &&
        this.cur._lines[0].match(whitespaceLinePattern)
      ) {
        (function (documentNode) {
          this.blocks.remove(documentNode);
          documentNode.remove();
        }).call(this, this.cur);
        this.cur = null;
        documentNode.set('ahead', 1);
        return true;
      }
    }
    function consumeTrailingBlankLine(documentNode) {
      var nextLine = this.lines[this.ln + 1];
      if (void 0 !== nextLine && nextLine.match(whitespaceLinePattern)) {
        this.ln++;
        documentNode.set('tail', 1);
        return true;
      }
      if (void 0 !== nextLine) {
        documentNode.set('tail', 0);
      }
    }
    function appendCompletedBlock(documentNode, keepCurrent) {
      var userIndent,
        resultNode = (documentNode = documentNode || this.cur);
      if (this.oldNode && !this.blocks.length) {
        if (this.oldNode !== documentNode) {
          userIndent = documentNode.get('userIndent');
          this.oldNode.appendChildrenTillEnd(documentNode.getFirstChild());
          this.oldNode.copyContentFrom(documentNode);
          this.oldNode.set('userIndent', userIndent);
          if (documentNode._lines) {
            this.oldNode._lines = documentNode._lines;
          }
          documentNode.remove();
        }
        this.blocks.push(this.oldNode);
        resultNode = this.oldNode;
      } else {
        if (this.parent) {
          this.parent.appendChild(documentNode);
        } else {
          if (this.blocks.length) {
            this.blocks.last().addAfter(documentNode);
          } else {
            console.sendError('parse error', 'error', documentNode.getText());
            documentNode.set('parent', this.parent);
            documentNode.set('in', this.nodeMap);
            documentNode.set('attachTo', this.nodeMap);
          }
        }
        this.blocks.push(documentNode);
      }
      this.cur = keepCurrent ? resultNode : null;
    }
    function closeCurrentBlock(keepCurrent, endOfInput) {
      if (this.cur) {
        if (!DocumentNode.isType(this.cur, NodeType.paragraph) || (this.cur._lines || []).length) {
          if (blockRule.onClose) {
            blockRule.onClose.call(this, endOfInput);
          }
          if ((endOfInput || this.ln < lineCount - 1) && void 0 == this.cur.get('tail')) {
            this.cur.set('tail', 0);
          }
          appendCompletedBlock.call(this, this.cur, keepCurrent);
        } else {
          this.cur = null;
        }
      }
    }
    function createListBlock(style, pattern, _mark) {
      var documentNodeInstance = new DocumentNode({
        type: NodeType.list,
        style: style,
        in: this.nodeMap,
        pattern: pattern,
      });
      if (style == DocumentNode.ListType.ol) {
        documentNodeInstance.set('start', _mark);
        documentNodeInstance._mark = (/[\.\)]/.exec(pattern) || [])[0];
      } else {
        documentNodeInstance._mark = _mark;
      }
      adoptLeadingBlankLine.call(this, documentNodeInstance);
      closeCurrentBlock.call(this, void 0, true);
      this.cur = documentNodeInstance;
    }
    function tryParseTable(allowNonPipeTable) {
      var separatorPattern = allowNonPipeTable
        ? tableSeparatorPattern
        : leadingPipeSeparatorPattern;
      if ((headerCells = splitTableCells(text))) {
        var headerCells,
          rowCells,
          rowText,
          itemIndex = this.ln + 1,
          linesLength = this.lines.length,
          currentText = this.lines[itemIndex],
          items = null,
          currentItems = [text, currentText];
        if (itemIndex < linesLength && this.lines[itemIndex].match(separatorPattern)) {
          for (
            items = [], itemIndex++;
            itemIndex < linesLength &&
            ((rowCells = null),
            (rowCells = splitTableCells((rowText = this.lines[itemIndex]), 0, headerCells.length)));
            itemIndex++
          ) {
            currentItems.push(rowText);
            items.push(rowCells);
          }
        }
        if (items) {
          return (
            (currentText = currentText.replace(/^ *\||\| *$/g, '').split(pipePattern)).length ==
              headerCells.length &&
            (appendTableBlock.call(
              this,
              headerCells,
              currentText,
              items,
              itemIndex - 1,
              allowNonPipeTable,
              currentItems,
            ),
            true)
          );
        }
      }
      return false;
    }
    function appendTableOfContents(pattern) {
      currentDocumentNode = new DocumentNode({
        type: NodeType.toc,
        in: this.nodeMap,
        pattern: pattern,
      });
      adoptLeadingBlankLine.call(this, currentDocumentNode);
      consumeTrailingBlankLine.call(this, currentDocumentNode);
      closeCurrentBlock.call(this, true);
      appendCompletedBlock.call(this, currentDocumentNode);
    }
    function appendTableBlock(
      headerCells,
      alignmentCells,
      items,
      lastLineIndex,
      isNonPipeTable,
      sourceText,
    ) {
      Object.defineProperty(appendTableRow, 'name', { value: 'y', configurable: true });

      var before,
        pass_format = (this.skips || {}).pass_format,
        documentNodeInstance = new DocumentNode({
          type: NodeType.table,
          in: this.nodeMap,
          style: !pass_format && alignmentCells && isNonPipeTable ? 'npTable' : void 0,
        }),
        length = headerCells.length,
        discardCellMargins =
          pass_format ||
          (function (headerCells, alignmentCells, rows) {
            if (!alignmentCells || !rows) {
              return true;
            }
            for (var itemIndex = 0; itemIndex < headerCells.length; itemIndex++) {
              var currentLength = (headerCells[itemIndex] || '').length;
              if (!(currentLength > 40)) {
                var displayWidth = utilities.wcswidth(headerCells[itemIndex]);
                if (
                  currentLength != (alignmentCells[itemIndex] || '').length &&
                  displayWidth != utilities.wcswidth(alignmentCells[itemIndex])
                ) {
                  return false;
                }
                for (var currentItemIndex = 0; currentItemIndex < rows.length; currentItemIndex++) {
                  var cellText = (rows[currentItemIndex] || [])[itemIndex] || '';
                  if (
                    !(cellText.length > 40) &&
                    currentLength !== cellText.length &&
                    displayWidth != utilities.wcswidth(cellText)
                  ) {
                    return false;
                  }
                }
              }
            }
            return true;
          })(headerCells, alignmentCells, items);
      function appendTableRow(documentNode, cells) {
        var currentBefore,
          localDocumentNode = new DocumentNode({
            type: NodeType.table_row,
            parent: documentNode,
            in: documentNode.get('in'),
            header: !before,
            before: before,
          });
        for (localItemIndex = 0; localItemIndex < length; localItemIndex++) {
          var leadingSpace = (cells[localItemIndex] || '').match(/^\s*/)[0];
          cells[localItemIndex] = (cells[localItemIndex] || '').substring(leadingSpace.length);
          var trailingSpace = (cells[localItemIndex] || '').match(/\s*$/)[0];
          currentBefore = new DocumentNode({
            type: NodeType.table_cell,
            parent: localDocumentNode,
            in: localDocumentNode.get('in'),
            before: currentBefore,
            text: (cells[localItemIndex] || '').trim(),
            marginLeft: discardCellMargins ? void 0 : leadingSpace,
            marginRight: discardCellMargins ? void 0 : trailingSpace,
          });
        }
        return localDocumentNode;
      }
      documentNodeInstance.set('alignText', discardCellMargins ? void 0 : alignmentCells.slice(0));
      if (!pass_format && alignmentCells && items) {
        documentNodeInstance.set('userText', sourceText);
      }
      alignmentCells = alignmentCells || Array(headerCells.length).fill();
      items = items || [[]];
      for (var localItemIndex = 0; localItemIndex < length; localItemIndex++) {
        alignmentCells[localItemIndex] = alignmentCells[localItemIndex] || '';
        if (alignmentCells[localItemIndex].match(/^ *-+: *$/)) {
          alignmentCells[localItemIndex] = 'right';
        } else {
          if (alignmentCells[localItemIndex].match(/^ *:-+: *$/)) {
            alignmentCells[localItemIndex] = 'center';
          } else {
            if (alignmentCells[localItemIndex].match(/^ *:-+ *$/)) {
              alignmentCells[localItemIndex] = 'left';
            } else {
              alignmentCells[localItemIndex] = null;
            }
          }
        }
      }
      documentNodeInstance.set('align', alignmentCells);
      before = appendTableRow.call(this, documentNodeInstance, headerCells);
      items.forEach(function (item) {
        before = appendTableRow.call(this, documentNodeInstance, item);
      }, this);
      adoptLeadingBlankLine.call(this, documentNodeInstance);
      closeCurrentBlock.call(this);
      if (lastLineIndex) {
        this.ln = lastLineIndex;
      }
      consumeTrailingBlankLine.call(this, documentNodeInstance);
      appendCompletedBlock.call(this, documentNodeInstance);
      this.cur = null;
    }
    if (this.cur) {
      blockRule = blockRules[this.cur.get('type')];
      var closeResult = !endOfInput && blockRule.shouldClose.call(this, text);
      if (closeResult > 0 || endOfInput) {
        closeCurrentBlock.call(this, false, endOfInput);
        if (2 == closeResult) {
          return;
        }
      } else {
        if (!closeResult) {
          return void (blockRule.onContinue && blockRule.onContinue.call(this, text));
        }
      }
    }
    if (!endOfInput) {
      if (!this.skips.old_code && (match = indentedCodeLinePattern.exec(text))) {
        if (this.skips.fromP) {
          if (!this.cur) {
            this.cur = new DocumentNode({ type: NodeType.paragraph, in: this.nodeMap });
            this.cur._lines = [];
          }
          return void this.cur._lines.push(text);
        } else {
          return void (DocumentNode.isType(this.cur, NodeType.code) && blockRule
            ? blockRule.onContinue && blockRule.onContinue.call(this, text)
            : DocumentNode.isType(this.cur, NodeType.paragraph) &&
                (this.cur._lines.last() || '').trim().length
              ? this.cur._lines.push(text)
              : ((currentDocumentNode = new DocumentNode({
                  type: NodeType.code,
                  pattern: match[1],
                  in: this.nodeMap,
                })),
                adoptLeadingBlankLine.call(this, currentDocumentNode),
                (currentDocumentNode._lines = [match[2]]),
                closeCurrentBlock.call(this),
                (this.cur = currentDocumentNode)));
        }
      }
      if (
        (match = setextHeadingPattern.exec(text)) &&
        DocumentNode.isType(this.cur, NodeType.paragraph) &&
        !utilities.isNullOrBlank(this.cur._lines.last())
      ) {
        currentDocumentNode = new DocumentNode({
          type: NodeType.heading,
          depth: '=' == match[1] ? 1 : 2,
          text: this.cur._lines.pop(),
          pattern: '{0}\n' + text,
          in: this.nodeMap,
        });
        adoptLeadingBlankLine.call(this, currentDocumentNode);
        closeCurrentBlock.call(this);
        consumeTrailingBlankLine.call(this, currentDocumentNode);
        return void appendCompletedBlock.call(this, currentDocumentNode);
      }
      var tryNonPipeTable = true;
      if (text.match(this.remap ? unicodeBlockStartPattern : blockStartPattern)) {
        if (
          (match = (File.option.strictMarkdown ? spacedHeadingPattern : headingPattern).exec(text))
        ) {
          currentDocumentNode = new DocumentNode({
            type: NodeType.heading,
            depth: match[2].length,
            text: match[3],
            pattern:
              (this.skips.enableStartMatch ? match[1].replace(/#$/, '# ') : match[1]) +
              '{0}' +
              (match[4] || ''),
            in: this.nodeMap,
          });
          adoptLeadingBlankLine.call(this, currentDocumentNode);
          consumeTrailingBlankLine.call(this, currentDocumentNode);
          closeCurrentBlock.call(this);
          return void appendCompletedBlock.call(this, currentDocumentNode);
        }
        if ((match = footnoteDefinitionPattern.exec(text))) {
          currentDocumentNode = new DocumentNode({
            type: NodeType.def_footnote,
            ref: match[1],
            pattern: match[2],
            text: match[3],
            in: this.nodeMap,
          });
          adoptLeadingBlankLine.call(this, currentDocumentNode);
          consumeTrailingBlankLine.call(this, currentDocumentNode);
          closeCurrentBlock.call(this, true);
          return void appendCompletedBlock.call(this, currentDocumentNode);
        }
        if ((match = referenceDefinitionPattern.exec(text))) {
          currentDocumentNode = new DocumentNode({
            type: NodeType.def_link,
            ref: match[1],
            href: match[3],
            title: match[8],
            in: this.nodeMap,
            pattern:
              '[;]:' +
              match[2] +
              ';' +
              match[4] +
              (match[5] ? ';' + match[6] + ';' + match[7] + ';' + match[9] : ''),
          });
          adoptLeadingBlankLine.call(this, currentDocumentNode);
          consumeTrailingBlankLine.call(this, currentDocumentNode);
          closeCurrentBlock.call(this, true);
          return void appendCompletedBlock.call(this, currentDocumentNode);
        }
        if (this.skips.fromP) {
          if (!this.cur) {
            this.cur = new DocumentNode({ type: NodeType.paragraph, in: this.nodeMap });
            this.cur._lines = [];
          }
          return void this.cur._lines.push(text);
        }
        if (this.skips.enableStartMatch && (match = tableRowPattern.exec(text))) {
          var rowCells = splitTableCells(text);
          if (rowCells && rowCells.length > 1) {
            return void appendTableBlock.call(this, rowCells);
          }
        }
        if ((match = blockquotePattern.exec(text))) {
          if (!/^(\s*>){10,}/.exec(text)) {
            currentDocumentNode = new DocumentNode({
              type: NodeType.blockquote,
              in: this.nodeMap,
              pattern: match[1],
            });
            adoptLeadingBlankLine.call(this, currentDocumentNode);
            currentDocumentNode._indent = match[1].replace(/^[ \u00A0]*>/, '').length;
            if (File.option.enableAlert) {
              let localText =
                (/^\s*\[\!(note|warning|important|tip|caution)\]\s*/i.exec(match[2]) || [])[1] ||
                '';
              if (localText) {
                currentDocumentNode.set('alert', localText.toLowerCase());
              }
            }
            currentDocumentNode._lines = [];
            currentDocumentNode._lineIndents = [];
            closeCurrentBlock.call(this);
            this.cur = currentDocumentNode;
            return void blockRules.blockquote.onContinue.call(this, text);
          }
          console.warn('too deep > level, ignore');
        }
        var metadataFencePattern = this.remap
            ? unicodeFrontMatterFencePattern
            : frontMatterFencePattern,
          metadataEndPattern = /^\.\.\.$/;
        if (this.skips.enableMetaBlock && 0 == this.ln && text.match(metadataFencePattern)) {
          var closingLineIndex = this.ln + 1,
            currentLinesLength = this.lines.length,
            patternEnd = void 0;
          if (!(acceptBlockStart = this.skips.enableStartMatch || false)) {
            for (; closingLineIndex < currentLinesLength; closingLineIndex++) {
              if (
                this.lines[closingLineIndex].match(metadataFencePattern) ||
                this.lines[closingLineIndex].match(metadataEndPattern)
              ) {
                patternEnd = (acceptBlockStart = closingLineIndex > this.ln + 1)
                  ? this.lines[closingLineIndex]
                  : void 0;
                break;
              }
            }
          }
          if (acceptBlockStart) {
            currentDocumentNode = new DocumentNode({
              type: NodeType.meta_block,
              in: this.nodeMap,
              text: this.lines.slice(this.ln + 1, closingLineIndex).join('\n'),
              patternEnd: patternEnd,
            });
            adoptLeadingBlankLine.call(this, currentDocumentNode);
            this.ln = closingLineIndex;
            consumeTrailingBlankLine.call(this, currentDocumentNode);
            closeCurrentBlock.call(this, true);
            return void appendCompletedBlock.call(this, currentDocumentNode);
          }
        }
        if (this.remap && text.match(unicodeDashPattern)) {
          var remappedLine = text.replace(/\u2013/g, '--').replace(/\u2014/g, '---');
          if ((match = horizontalRulePattern.exec(remappedLine))) {
            currentDocumentNode = new DocumentNode({
              type: NodeType.hr,
              pattern:
                typeof globalThis.__MARKLYRA_LITERAL_RULE__ === 'function'
                  ? globalThis.__MARKLYRA_LITERAL_RULE__(remappedLine, remappedLine.trim())
                  : remappedLine.trim(),
              in: this.nodeMap,
            });
            adoptLeadingBlankLine.call(this, currentDocumentNode);
            consumeTrailingBlankLine.call(this, currentDocumentNode);
            closeCurrentBlock.call(this, true);
            return void appendCompletedBlock.call(this, currentDocumentNode);
          }
        }
        if ((match = horizontalRulePattern.exec(text))) {
          currentDocumentNode = new DocumentNode({
            type: NodeType.hr,
            pattern:
              typeof globalThis.__MARKLYRA_LITERAL_RULE__ === 'function'
                ? globalThis.__MARKLYRA_LITERAL_RULE__(text, text.trim())
                : text.trim(),
            in: this.nodeMap,
          });
          adoptLeadingBlankLine.call(this, currentDocumentNode);
          consumeTrailingBlankLine.call(this, currentDocumentNode);
          closeCurrentBlock.call(this, true);
          return void appendCompletedBlock.call(this, currentDocumentNode);
        }
        if ((match = listPrefixPatterns.ul.exec(text))) {
          if (tocOptionsPattern.exec(this.lines[this.ln + 1] || '')) {
            appendTableOfContents.call(this, text + '\n' + this.lines[this.ln + 1]);
            return void this.ln++;
          } else {
            createListBlock.call(this, DocumentNode.ListType.ul, match[2], match[3]);
            return void (blockRule = blockRules[NodeType.list]).onContinue.call(
              this,
              text,
              match[0],
              match[1].length,
            );
          }
        }
        if ((match = listPrefixPatterns.ol.exec(text))) {
          var listStartText = match[0].match(/\d+/)[0].replace(/^1$/, '');
          if (
            !File.option.strictNumberStartOnNewLine ||
            !listStartText ||
            listStartText.trim() - 0 == 1
          ) {
            createListBlock.call(
              this,
              DocumentNode.ListType.ol,
              match[0].replace(/\d+/, '{0}'),
              listStartText,
            );
            return void (blockRule = blockRules[NodeType.list]).onContinue.call(
              this,
              text,
              match[0],
              match[1].length,
            );
          }
        }
        var legacyMath =
          !File.option.noLegacyMath && (match = text.match(openingMathBracketPattern));
        if (
          (legacyMath || (match = text.match(displayMathFencePattern))) &&
          ((tryNonPipeTable = false), !this.skips.math_block)
        ) {
          closingLineIndex = this.ln + 1;
          currentLinesLength = this.lines.length;
          var mathTagBefore,
            mathTagAfter,
            acceptBlockStart = this.skips.enableStartMatch || false;
          mathTagBefore = match[1];
          if (!acceptBlockStart) {
            for (; closingLineIndex < currentLinesLength; closingLineIndex++) {
              if (
                (match = this.lines[closingLineIndex].match(
                  legacyMath ? closingMathBracketPattern : displayMathFencePattern,
                ))
              ) {
                mathTagAfter = match[1];
                acceptBlockStart = true;
                break;
              }
            }
          }
          if (acceptBlockStart) {
            currentDocumentNode = new DocumentNode({
              type: NodeType.math_block,
              in: this.nodeMap,
              legacyMath: legacyMath,
              tagBefore: legacyMath ? '' : mathTagBefore,
              tagAfter: legacyMath ? '' : mathTagAfter,
              text: this.lines.slice(this.ln + 1, closingLineIndex).join('\n'),
            });
            adoptLeadingBlankLine.call(this, currentDocumentNode);
            this.ln = closingLineIndex;
            consumeTrailingBlankLine.call(this, currentDocumentNode);
            closeCurrentBlock.call(this, true);
            return void appendCompletedBlock.call(this, currentDocumentNode);
          }
        }
        if ((match = openingFencePattern.exec(text))) {
          (currentDocumentNode = new DocumentNode({
            type: NodeType.fences,
            lang: match[3],
            pattern: match[1] + '{0}',
            in: this.nodeMap,
          }))._mark = match[2];
          currentDocumentNode._lines = [];
          adoptLeadingBlankLine.call(this, currentDocumentNode);
          closeCurrentBlock.call(this);
          return void (this.cur = currentDocumentNode);
        }
        var tocPattern = this.remap ? unicodeTocPattern : tocMarkerPattern;
        if (text.match(tocPattern)) {
          return void appendTableOfContents.call(
            this,
            text.replace(/[\[\u3010]/, '[').replace(/[\]\u3011]/, ']'),
          );
        }
        if (text.match(tocAttributePattern)) {
          return void appendTableOfContents.call(this, text);
        }
        if (text.match(wikiTocMarkerPattern)) {
          return void appendTableOfContents.call(this, text);
        }
        if (tryParseTable.call(this, false)) {
          return;
        }
        if (File.option.blockHTML && (match = htmlBlockOpenPattern.exec(text))) {
          currentDocumentNode = new DocumentNode({
            type: NodeType.html_block,
            in: this.nodeMap,
            style: (match[1] || '').toLowerCase(),
            depth: 0,
          });
          adoptLeadingBlankLine.call(this, currentDocumentNode);
          closeCurrentBlock.call(this, true);
          var previousBlock = this.cur || (this.blocks || []).last();
          if (
            previousBlock &&
            DocumentNode.isType(previousBlock, NodeType.html_block) &&
            0 === previousBlock.get('tail') &&
            !currentDocumentNode.get('ahead')
          ) {
            if (previousBlock !== this.oldNode) {
              previousBlock.detach();
            }
            this.blocks.pop();
            this.cur = previousBlock;
            previousBlock._lines = previousBlock.get('text').split(/\n/);
            var searchValue = previousBlock.get('displayStyle') || previousBlock.get('style');
            if (htmlBlocks.HIDDEN_TYPE.indexOf(searchValue) > -1) {
              searchValue = match[1];
            }
            previousBlock.set('displayStyle', searchValue);
            previousBlock.unset('tail');
            previousBlock.set('style', match[1]);
            previousBlock.set('depth', 0);
            currentDocumentNode.remove();
            currentDocumentNode = previousBlock;
          } else {
            adoptLeadingBlankLine.call(this, currentDocumentNode);
            this.cur = currentDocumentNode;
            this.cur._lines = [];
          }
          blockRule = blockRules[NodeType.html_block];
          return void (blockRules.html_block.shouldClose.call(this, text) ==
          BlockCloseResult.CLOSE_INCLUDE
            ? (closeCurrentBlock.call(this, true),
              consumeTrailingBlankLine.call(this, this.cur),
              (this.cur = null))
            : ((this.cur._lines = this.cur._lines || []), this.cur._lines.push(text)));
        }
      }
      if (!(tryNonPipeTable && !this.skips.fromP && tryParseTable.call(this, true))) {
        if (!this.cur) {
          this.cur = new DocumentNode({ type: NodeType.paragraph, in: this.nodeMap });
          this.cur._lines = [];
        }
        if (DocumentNode.isType(this.cur, NodeType.paragraph)) {
          this.cur._lines.push(text);
        } else {
          if (blockRule && blockRule.onContinue) {
            blockRule.onContinue.call(this, text);
          }
        }
      }
    }
  }
  DocumentNode.parseFrom = function (text, documentMap, parseOptions, skipHtml) {
    parseOptions = parseOptions || {};
    return new DocumentNode({
      type: NodeType.raw_edit,
      in: documentMap,
      attachTo: parseOptions.noTop ? null : documentMap,
      text: text,
    }).parseFrom(parseOptions, void 0, skipHtml);
  };
  DocumentNode.prototype.parseFrom = function (parseOptions, text, skipHtml) {
    parseOptions = parseOptions || {};
    if (DocumentNode.isType(this.get('parent'), NodeType.table_row)) {
      this.set('type', NodeType.table_cell);
      this.set(
        'text',
        this.safeGetStrAttr('text')
          .replace(/\n|\r/gi, '')
          .replace(/([^\\])\|/gi, '$1|'),
      );
      return [!skipHtml && this.toHTML(), [this]];
    }
    if (
      !DocumentNode.isType(
        this,
        NodeType.paragraph,
        NodeType.raw_edit,
        NodeType.html_block,
        NodeType.list_item,
      )
    ) {
      return [!skipHtml && this.toHTML(), [this]];
    }
    var documentNode,
      currentDocumentNode =
        ((documentNode = this),
        (DocumentNode.isType(documentNode, NodeType.list_item) &&
        !documentNode.get('children').length
          ? new DocumentNode({
              type: NodeType.paragraph,
              text: '',
              parent: documentNode,
              in: documentNode.get('in'),
            })
          : null) || this),
      parseSkips = parseOptions.skips || {};
    text = text || currentDocumentNode.get('text');
    if (File.option.ignoreLineBreak) {
      text = text.replace(/\u00a0/g, ' ');
    }
    parseSkips.enableMetaBlock = this.get('attachTo') && !this.get('before');
    parseSkips.old_code = false !== parseSkips.old_code;
    if (this.isBlock(true)) {
      var previousNode = this.get('before'),
        nextNode = this.get('after'),
        blocks = new BlockLexer(
          text,
          null,
          currentDocumentNode.get('in'),
          currentDocumentNode,
          parseSkips,
        ).blocks;
      if (blocks.length <= 1) {
        return [!skipHtml && this.toHTML(), [this]];
      } else {
        blocks[0].set('before', previousNode);
        blocks.last().set('after', nextNode);
        return [!skipHtml && documentModel.NodeCollectionUtils.toHTML(blocks), blocks];
      }
    }
  };
  var lastTokenText = Object.defineProperty(
      function (tokens) {
        var lastToken = tokens.last();
        if (lastToken) {
          return lastToken.text || '';
        }
      },
      'name',
      { value: 'ue', configurable: true },
    ),
    rules = {
      escape: /^\\([\\:`*{}\[\]()#+\-.!_>$|<~"'&])/,
      escape2: /^[\uE013\uE014\uE018\uE020]/,
      autolink: /^<\uE016?((([^ >]+(@|:)[^ >]+))|(\s*www\.[^ >]+))\uE017?\uE019?>/,
      url: /^\uE016([^\uE017\uE019]+)(\uE017|(\uE019[-@+.,!\/~?%&=:#\uE006\w;()]*))/i,
      comment: /^<!--[\s\S]*?-->/,
      br: /^<w?br[\s/]*>(\s*<\/w?br>)*/i,
      tag: /^(?:<([A-Za-z][A-Za-z0-9-]*)(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|'[^']*'|"[^"]*"))?)*\s*(\/?)>|<(\/)([A-Za-z][A-Za-z0-9-]*)\s*[>]|[<][?].*?[?][>]|<![A-Z]+\s+[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>)/,
      underline: /^<u>([^\r]*?\S)<\/u>/i,
      atag: /^(<a\s.+?>)(.*?)(<\/\s*a>)/i,
      imgtag: /^<img(\s+[^<]+)(\/?\s*>([^<]*(<\/img>))?)/i,
      link: /^\[((?:\[[^\]]*\]|[^\[\]])*)\]\(<?((?:\([^)]*\)|[^()])*?)>?(?:[ \t]+((['"])((?:.|\n)*?)\4[ \t]*))?\)/,
      image:
        /(^\!\[((?:\[[^\]]*\]|[^\[\]])*)\]\()(<?((?:\([^)]*\)|[^()])*?)>?[ \t]*((['"])((?:.|\n)*?)\6[ \t]*)?)(\)(?:\s*{([^{}\(\)]*)})?)/,
      reflink: /^(!?)\[(inside)\]\[([^\]]*)\]/,
      strong: /^(\*\*|__)(?=\S)([^\r]*?\S?[*_]?)\1/,
      strong_esp: /^\uE031([^\uE031]+)\uE031/,
      em1: /^(\_)(?=\S)([^\r]*?[^\s_])\1(?!\1)/,
      em2: /^(\*)(?=\S)([^\r]*?[^\s*])(\1{1}|\1{3})(?!\1)/,
      highlight: /^(\=\=)(?=\S)([^\r]*?\S)\1/,
      code: /^(`+)([\s\S]*?[^`])\1(?!`)/,
      code2: /^\uE023(\d+)\uE023/,
      del: /^~~(?=\S)([\s\S]*?\S)~~/,
      tab: /^[\t]+/,
      text: /^(\s|\S)+?[^\n\t\u200B\uE010-\uE020\uE006\uE023\uE031\\<!\[._*`&{\$\:~\^\="'\-]*/,
      footnote: /^\[\^([^\]\n]+)\]/,
      attr: /^{( *([#.][-\w_\uE006]+ *|[-\w_\uE006]+=[-\w_"'\uE006]+ *)+)}/,
      entity: /^&#?[a-z0-9]+;/i,
      emoji: /^(\u200B?):([+\-\w\uE006]+):(\u200B?)/,
      inline_math: /^\$(.|\n)*(?:[^\\])\$/,
      legacy_inline_math: /^\\\((.+?)\\\)|^\\\[(.+?)(\\\]|\uE018)/,
      gitlab_inline_math: /^\$`(.|\n)*(?:[^\\])`\$/,
      subscript: /^~(([^\s\n]|(\\\s))+?)~/,
      superscript: /^\^(([^\s\n]|(\\\s))+?)\^/,
      linebreak: /[ \u00A0]{2}$/,
      emptyline: /^(\n)(?:\n|$)/,
      alert: /^\s*\[!(note|warning|important|tip|caution)\]\s*(\n|$)/i,
    };
  function InlineLexer(lexerOptions, decorateToken, content) {
    this.options = lexerOptions || assignOwnProperties({}, parserApi.defaults);
    this.options.decorate = decorateToken || inlineDecoration.decorate;
    this.options.context = content || this;
    this.rules = rules.normal;
    if (this.options.gfm) {
      if (this.options.breaks) {
        this.rules = rules.breaks;
      } else {
        this.rules = rules.gfm;
      }
    } else {
      if (this.options.pedantic) {
        this.rules = rules.pedantic;
      }
    }
    if (File.option.enableHighlight) {
      this.rules.escape2 = /^[\uE013\uE014\uE015\uE018\uE020]/;
    }
    if (File.option.enableSuperscript) {
      if (File.option.enableHighlight) {
        this.rules.escape = /^\\([\\:`*{}\[\]()#+\-.!_>$|<~"'&^=])/;
      } else {
        this.rules.escape = /^\\([\\:`*{}\[\]()#+\-.!_>$|<~"'&^])/;
      }
    } else {
      if (File.option.enableHighlight) {
        this.rules.escape = /^\\([\\:`*{}\[\]()#+\-.!_>$|<~"'&=])/;
      }
    }
  }
  rules.comment_ext = /^<!(--|\u2013|\u2014)[\s\S]*?(--|\u2013|\u2014)>/;
  rules.link_ext =
    /^[\[\u3010]((?:[\[\u3010][^\]\u3011]*[\u3011\]]|[^\[\]\u3010\u3011])*)[\]\u3011]\(<?((?:\([^)]*\)|[^()])*?)>?[ \t]*((["'])(?:(.|\n)*?)["'][ \t]*)?\)/;
  rules.image_ext =
    /(^\![\[\u3010]((?:[\[\u3010][^\]\u3011]*[\]\u3011]|[^\[\]\u3010\u3011])*)[\]\u3011][\(\uff08])((.|\n)*)([\)\uff09](?:\s*{([^{}\(\)\uff08\uff09]*)})?)/;
  rules.attr_ext = /^{( *([#.][-\w_\uE006]+ *|[-\w_\uE006]+=[-\w_"'«»‘’‚‛„‟‹›\uE006]+ *)+)}/;
  rules._inside = /(?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*/;
  rules._inside_ext =
    /(?:[\[\u3010][^\]\u3011]*[\]\u3011]|[^\[\]\u3010\u3011]|[\]\u3011](?=[^\[\u3010]*[\]\u3011]))*/;
  rules.tag_ext =
    /^(?:<([A-Za-z][A-Za-z0-9-]*)(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|[’‚‛'‹›][^'’‚‛]*['’‚‛‹›]|["“«»„‟][^"“«»„‟]*["“«»„‟]))?)*\s*(\/?)>|<(\/)([A-Za-z][A-Za-z0-9-]*)\s*[>]|[<][?].*?[?][>]|<![A-Z]+\s+[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>)/;
  rules.reflink = createPatternBuilder(rules.reflink)('inside', rules._inside)();
  rules.normal = assignOwnProperties({}, rules);
  rules.pedantic = assignOwnProperties({}, rules.normal, {
    strong: /^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,
    em: /^_(?=\S)([\s\S]*?\S)_(?!_)|^\*(?=\S)([\s\S]*?\S)\*(?!\*)/,
  });
  rules.gfm = rules.normal;
  rules.breaks = assignOwnProperties({}, rules.gfm, {
    text: createPatternBuilder(rules.gfm.text)('{2,}', '*')(),
  });
  InlineLexer.rules = rules;
  var escapeMarkers = {
      UNDER_CHAR: '',
      MATH_CHAR: '',
      DEF_FOOT_PERFIX_CHAR: '',
      ESCAPE_SATR: '',
      ESCAPE_UNDERLINE: '',
      ESCAPE_EQUAL: '',
      URL_START: '',
      URL_END: '',
      ESCAPE_END_SQUARE_BRACKET: '',
      URL_MAY_END: '',
      ESCAPE_ESCAPE: '',
      ESCAPE_VLINE: '',
      ESCAPE_SPACE: '',
      CODE: '',
    },
    escapedCharacterMap = { '': '[^', '': '*', '': '_', '': '=', '': ']', '': '\\' },
    literalCharacterMap = { '': '_', '': '', '': '', '': '' },
    escapeSequenceMap = {
      '\\\\': escapeMarkers.ESCAPE_ESCAPE,
      '\\*': escapeMarkers.ESCAPE_SATR,
      '\\=': escapeMarkers.ESCAPE_EQUAL,
      '\\_': escapeMarkers.ESCAPE_UNDERLINE,
      '\\]': escapeMarkers.ESCAPE_END_SQUARE_BRACKET,
    },
    autolinkPattern =
      /(?:(https?:\/\/(?:[a-z0-9]|\/|\.\.\/|(?:[-@+.,!\/~?%&=:#\uE006_](?![\s.~*-,_]|$)))+)|((?:mailto:\/{0,2})?[a-z0-9][a-z0-9\-_+\.\uE006]*@[a-z0-9](?:[a-z0-9\-_\uE006]{0,15}\.?){0,2}\.(?:com|co|net|org|edu|io|tv|fm|me|info|cc|ca|de|cn|ru|us|jp|au)(?:\.[a-z]+)*)|(www\.[a-z0-9][a-z0-9\-_\uE006]*(?:\.[a-z0-9\-_\uE006]+)+\/?(?:\/|\.\.\/|[a-z0-9]|(?:[-@+.,!\/~?%&=:#\uE006_](?![\s.~*-,_]|$)))*))/gi,
    CODE = 0,
    map = new Map();
  function protectCodeSpans(text) {
    return text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, function (codeText) {
      CODE++;
      map.set(CODE + '', codeText);
      return escapeMarkers.CODE + CODE + escapeMarkers.CODE;
    });
  }
  function restoreCodeSpans(text, keepStoredCode) {
    return text.replace(/\uE023(\d+)\uE023/g, function (unusedParameter1, placeholderKey) {
      var codeText = map.get(placeholderKey) || '';
      if (!keepStoredCode) {
        map.delete(placeholderKey);
      }
      return codeText;
    });
  }
  function restoreEscapedCharacters(text, keepStoredCode) {
    return restoreCodeSpans(
      text.replace(/[\uE006-\uE020]/g, function (marker) {
        if (escapedCharacterMap[marker]) {
          return '\\' + escapedCharacterMap[marker];
        } else {
          return literalCharacterMap[marker] || '';
        }
      }),
      keepStoredCode,
    ).replace(/\uE031/g, '*');
  }
  InlineLexer.skipLink = { autolink: 1, url: 1, link: 1, reflink: 1 };
  var hasOpenDoubleQuote = Object.defineProperty(
    function (tokens) {
      for (var itemIndex = tokens.length - 1; itemIndex >= 0; itemIndex--) {
        if (tokens[itemIndex].type == NodeType.pants) {
          if ('open_double' == tokens[itemIndex].desc) {
            return true;
          }
          if ('close_double' == tokens[itemIndex].desc) {
            return false;
          }
        }
      }
      return false;
    },
    'name',
    { value: 'Se', configurable: true },
  );
  function createPatternBuilder(inputSource, flags) {
    inputSource = inputSource.source;
    flags = flags || '';
    return Object.defineProperty(
      function replacePatternPart(placeholder, source) {
        if (placeholder) {
          source = (source = source.source || source).replace(/(^|[^\[])\^/g, '$1');
          inputSource = inputSource.replace(placeholder, source);
          return replacePatternPart;
        } else {
          return new RegExp(inputSource, flags);
        }
      },
      'name',
      { value: 'n', configurable: true },
    );
  }
  function EmptyRule() {}
  function assignOwnProperties(target) {
    for (var source, propertyName, itemIndex = 1; itemIndex < arguments.length; itemIndex++) {
      for (propertyName in (source = arguments[itemIndex])) {
        if (Object.prototype.hasOwnProperty.call(source, propertyName)) {
          target[propertyName] = source[propertyName];
        }
      }
    }
    return target;
  }
  InlineLexer.prototype.output = function (
    textSlice,
    decorateToken,
    alreadyPreprocessed,
    element,
    renderState,
  ) {
    Object.defineProperty(appendPlainToken, 'name', { value: 'S', configurable: true });
    Object.defineProperty(findClosingTagIndex, 'name', { value: 'k', configurable: true });
    Object.defineProperty(renderInlineTokens, 'name', { value: 'E', configurable: true });

    decorateToken = decorateToken || this.options.decorate;
    textSlice = textSlice || '';
    (element = assignOwnProperties(element || {}, this.options.skipOp)).attr =
      false !== element.attr;
    element.markLinebreak = true;
    if (!File.option.enableInlineMath) {
      element.inline_math = true;
    }
    if (!File.option.enableSubscript) {
      element.subscript = true;
    }
    if (!File.option.enableSuperscript) {
      element.superscript = true;
    }
    if (!File.option.enableHighlight) {
      element.highlight = true;
    }
    var currentText,
      linkTarget,
      currentMatch,
      length,
      token,
      remapPunctuation =
        (renderState = renderState || { cursorDiff: [], openQuote: null, hasContent: false })
          .isCur || File.shouldRemapPunctuation(),
      cursorDeltas = renderState.cursorDiff || [],
      recordCursorDelta = Object.defineProperty(
        function (offset, delta) {
          cursorDeltas[offset] = (cursorDeltas[offset] || 0) + delta;
        },
        'name',
        { value: 'y', configurable: true },
      ),
      itemIndex = 0,
      items = [],
      options = this.options,
      forEditor = decorateToken == inlineDecoration.decorate,
      forPrint = options.forPrint;
    function appendPlainToken(inputItems, text) {
      var lastToken = inputItems.last();
      if (lastToken && lastToken.type === NodeType.plain) {
        lastToken.text += text;
      } else {
        inputItems.push({ type: NodeType.plain, text: text });
      }
    }
    function findClosingTagIndex(tokens, startIndex, name) {
      for (
        var tagDepth = 1, currentItemIndex = startIndex;
        currentItemIndex < tokens.length;
        currentItemIndex++
      ) {
        if (
          tokens[currentItemIndex].name == name &&
          (tokens[currentItemIndex].pos < 0 && tagDepth--,
          tokens[currentItemIndex].pos > 0 && tagDepth++,
          !tagDepth)
        ) {
          return currentItemIndex;
        }
      }
      return 0;
    }
    function renderInlineTokens(tokens) {
      for (
        var renderedHtml = '', currentItemIndex = 0;
        currentItemIndex < tokens.length;
        currentItemIndex++
      ) {
        var token = tokens[currentItemIndex];
        if (token.type == NodeType.tag) {
          token.name = token.name || '';
          var isInlineTag = htmlBlocks.INLINE_TYPE.indexOf(token.name.toLowerCase()) > -1,
            isHiddenTag = htmlBlocks.HIDDEN_TYPE.indexOf(token.name.toLowerCase()) > -1,
            unsafeForPrint =
              forPrint && htmlBlocks.UNSFAE_TAGS.indexOf(token.name.toLowerCase()) > -1;
          if ((token.pos > 0 && forEditor && (isInlineTag || isHiddenTag)) || unsafeForPrint) {
            var text = token.name || '',
              closingTagIndex = findClosingTagIndex(tokens, currentItemIndex + 1, text);
            if (closingTagIndex > 0) {
              renderedHtml += decorateToken(
                {
                  type: NodeType.html_inline,
                  inner: renderInlineTokens(tokens.subarray(currentItemIndex + 1, closingTagIndex)),
                  name: text.toLowerCase(),
                  before: token.text,
                  after: tokens[closingTagIndex].text,
                  isMeta: !isInlineTag,
                },
                options,
                renderState,
              );
              currentItemIndex = closingTagIndex;
              continue;
            }
            if (forPrint) {
              renderedHtml += decorateToken(
                {
                  type: NodeType.html_inline,
                  inner: '',
                  name: text.toLowerCase(),
                  before: token.text,
                  after: '',
                  isMeta: !isInlineTag,
                },
                options,
                renderState,
              );
              continue;
            }
          }
        }
        renderedHtml += decorateToken(token, options, renderState);
      }
      return renderedHtml;
    }
    for (
      textSlice.length > 1e5 &&
        ((alreadyPreprocessed = true), appendPlainToken(items, textSlice), (textSlice = '')),
        alreadyPreprocessed ||
          (textSlice = (function (text, markUrls) {
            for (
              var localMatch, intrawordUnderscorePattern = /([a-z0-9])_([a-z0-9])/gi;
              (localMatch = intrawordUnderscorePattern.exec(text));
            ) {
              text =
                text.substring(0, localMatch.index + 1) +
                escapeMarkers.UNDER_CHAR +
                text.substring(localMatch.index + 2);
              if (intrawordUnderscorePattern.lastIndex) {
                intrawordUnderscorePattern.lastIndex--;
              }
            }
            text = text
              .replace(/\\[\*_=\]\\]/gi, function (escapeSequence) {
                return escapeSequenceMap[escapeSequence] || escapeSequence;
              })
              .replace(/([^\\`]|^)(`+)([\s\S]*?[^`])\2(?!`)/g, function (inputText, prefixText) {
                CODE++;
                map.set(CODE + '', inputText.substr(prefixText.length));
                return prefixText + escapeMarkers.CODE + CODE + escapeMarkers.CODE;
              });
            if (markUrls && text.length < 2e4) {
              autolinkPattern.lastIndex = 0;
              text = text.replace(
                autolinkPattern,
                function (URL_START, mailtoPrefix, unusedParameter3, urlSuffix) {
                  if (('' + mailtoPrefix + urlSuffix).indexOf('/') > -1) {
                    return escapeMarkers.URL_START + URL_START + escapeMarkers.URL_MAY_END;
                  } else {
                    return escapeMarkers.URL_START + URL_START + escapeMarkers.URL_END;
                  }
                },
              );
            }
            return text;
          })(textSlice, !element.url && !File.option.noAutoLink));
      textSlice;
    ) {
      if (element.markLinebreak && (currentMatch = /^\r?\n/.exec(textSlice))) {
        itemIndex += currentMatch[0].length;
        textSlice = textSlice.substring(currentMatch[0].length);
        items.push({
          type: textSlice || element.emptyline ? NodeType.softbreak : NodeType.emptyline,
          text: '\n',
          inner: '\n',
        });
      } else {
        if ((currentMatch = this.rules.escape2.exec(textSlice))) {
          itemIndex += currentMatch[0].length;
          textSlice = textSlice.substring(currentMatch[0].length);
          items.push({ type: NodeType.escape, text: escapedCharacterMap[currentMatch[0]] });
          renderState.hasContent = true;
        } else {
          if (
            !File.option.noLegacyMath &&
            (currentMatch = this.rules.legacy_inline_math.exec(textSlice))
          ) {
            itemIndex += (currentText = restoreEscapedCharacters(currentMatch[0], true)).length;
            textSlice = textSlice.substring(currentMatch[0].length);
            items.push({
              type: NodeType.inline_math,
              legacyMath: currentMatch[3] ? '[' : '(',
              text: restoreEscapedCharacters(currentMatch[1] || currentMatch[2], true),
            });
          }
          if ((currentMatch = this.rules.escape.exec(textSlice))) {
            itemIndex += currentMatch[0].length;
            textSlice = textSlice.substring(currentMatch[0].length);
            items.push({ type: NodeType.escape, text: currentMatch[1] });
            renderState.hasContent = true;
          } else {
            if (
              File.option.noAutoLink ||
              element.autolink ||
              !(currentMatch = this.rules.autolink.exec(textSlice))
            ) {
              if (element.url || !(currentMatch = this.rules.url.exec(textSlice))) {
                if (
                  (currentMatch = (
                    remapPunctuation ? this.rules.comment_ext : this.rules.comment
                  ).exec(textSlice))
                ) {
                  itemIndex += length = (currentText = restoreCodeSpans(currentMatch[0])).length;
                  textSlice = textSlice.substring(currentMatch[0].length);
                  if (remapPunctuation) {
                    currentText = currentText.replace(/[\u2013\u2014]/g, '--');
                    cursorDeltas[itemIndex] = currentText.length - length;
                  }
                  items.push({
                    type: element.comment ? NodeType.tag : NodeType.comment,
                    text: currentText,
                  });
                } else {
                  if ((currentMatch = this.rules.br.exec(textSlice))) {
                    itemIndex += currentMatch[0].length;
                    textSlice = textSlice.substring(currentMatch[0].length);
                    items.push({ type: NodeType.br, text: currentMatch[0] });
                  } else {
                    if (
                      (currentMatch = (
                        File.shouldRemapPunctuation() ? this.rules.tag_ext : this.rules.tag
                      ).exec(textSlice))
                    ) {
                      var underlineMatch;
                      if (
                        !element.underline &&
                        (underlineMatch = this.rules.underline.exec(textSlice))
                      ) {
                        itemIndex += (currentText = restoreCodeSpans(underlineMatch[0])).length;
                        textSlice = textSlice.substring(underlineMatch[0].length);
                        items.push({
                          type: NodeType.underline,
                          inner: this.output(
                            currentText == underlineMatch[0]
                              ? underlineMatch[1]
                              : this.rules.underline.exec(currentText)[1],
                            decorateToken,
                            true,
                            element,
                            renderState,
                          ),
                          text: currentText,
                        });
                        renderState.hasContent = true;
                        continue;
                      }
                      if (!element.imgtag && (underlineMatch = this.rules.imgtag.exec(textSlice))) {
                        var localText = (currentText = restoreCodeSpans(underlineMatch[0]));
                        if (remapPunctuation) {
                          localText = localText
                            .replace(/(\w=)[«»“”„‟〝〟]/g, '$1"')
                            .replace(/(\w=)[‚‘’‛‹›]/g, "$1'")
                            .replace(/[»«”“〞]([\s\/>]|$)/g, '"$1')
                            .replace(/[’‛‘›‹＇]([\s\/>]|$)/g, "'$1");
                        }
                        var imageSource = (/src\s*=\s*(['"])((.|\n)*?)\1/.exec(localText) || [])[2];
                        if (!imageSource) {
                          imageSource = (/src\s*=\s*([^\s'"]+)(\s|$)/.exec(localText) || [])[1];
                        }
                        if (imageSource) {
                          itemIndex += currentText.length;
                          textSlice = textSlice.substring(underlineMatch[0].length);
                          var styleText =
                              (/\sstyle\s*=\s*(['"])(.+?)\1/.exec(localText) || [])[2] || '',
                            width = (/(^|[^\w-])width\s*:\s*(.+?)(\s*;|$)/.exec(styleText) ||
                              [])[2],
                            height = (/(^|[^\w-])height*:\s*(.+?)(\s*;|$)/.exec(styleText) ||
                              [])[2],
                            zoom = (/(^|[^\w-])zoom*:\s*(.+?)(\s*;|$)/.exec(styleText) || [])[2],
                            align = (/\salign\s*=\s*(['"])(.+?)\1/.exec(localText) ||
                              /\salign\s*=\s*((.+?))[\s/>]/.exec(localText) ||
                              [])[2];
                          if (!width) {
                            width = (/\swidth\s*=\s*(['"])(.+?)\1/.exec(localText) ||
                              /\swidth\s*=\s*((.+?))[\s/>]/.exec(localText) ||
                              [])[2];
                            if (/\d\s*$/.exec(width || '')) {
                              width += 'px;';
                            }
                          }
                          if (!height) {
                            height = (/\sheight\s*=\s*(['"])(.+?)\1/.exec(localText) ||
                              /\sheight\s*=\s*((.+?))[\s/>]/.exec(localText) ||
                              [])[2];
                            if (/\d\s*$/.exec(height || '')) {
                              height += 'px;';
                            }
                          }
                          items.push({
                            type: NodeType.imgtag,
                            text: localText,
                            href: utilities.unescape(restoreEscapedCharacters(imageSource)),
                            width: width,
                            height: height,
                            zoom: zoom,
                            align: align,
                          });
                        } else {
                          itemIndex += (currentText = restoreCodeSpans(currentMatch[0])).length;
                          textSlice = textSlice.substring(currentMatch[0].length);
                          currentText = currentText
                            .replace(/(\w=)[«»“”„‟〝〟]/g, '$1"')
                            .replace(/(\w=)[‚‘’‛‹›]/g, "$1'")
                            .replace(/[»«”“〞]([\s\/>]|$)/g, '"$1')
                            .replace(/[’‛‘›‹＇]([\s\/>]|$)/g, "'$1");
                          items.push({
                            type: NodeType.tag,
                            text: restoreEscapedCharacters(currentText),
                          });
                        }
                        renderState.hasContent = true;
                        continue;
                      }
                      itemIndex += (currentText = restoreCodeSpans(currentMatch[0])).length;
                      textSlice = textSlice.substring(currentMatch[0].length);
                      currentText = currentText
                        .replace(/(\w=)[«»“”„‟〝〟]/g, '$1"')
                        .replace(/(\w=)[‚‘’‛‹›]/g, "$1'")
                        .replace(/[»«”“〞]([\s\/>]|$)/g, '"$1')
                        .replace(/[’‛‘›‹＇]([\s\/>]|$)/g, "'$1");
                      if (
                        'ruby' ==
                          (token = {
                            type: NodeType.tag,
                            pos:
                              currentMatch[1] || currentMatch[4]
                                ? currentMatch[3]
                                  ? -1
                                  : currentMatch[2]
                                    ? 0
                                    : 1
                                : 0,
                            name: (currentMatch[1] || currentMatch[4] || '').toLowerCase(),
                          }).name &&
                        token.pos > 0 &&
                        forEditor &&
                        (currentMatch = /<\/ruby>/.exec(textSlice))
                      ) {
                        var endOffset = currentMatch.index + currentMatch[0].length;
                        itemIndex += endOffset;
                        currentText += textSlice.substring(0, endOffset);
                        textSlice = textSlice.substring(endOffset);
                        token = {
                          type: NodeType.ruby,
                          text: restoreEscapedCharacters(currentText),
                        };
                      } else {
                        token.text = restoreEscapedCharacters(currentText);
                      }
                      items.push(token);
                      renderState.hasContent =
                        renderState.hasContent ||
                        -1 == htmlBlocks.NO_TEXT_BLOCK_TYPE.indexOf(token.name);
                    } else {
                      renderState.hasContent = true;
                      if (element.alert && (currentMatch = this.rules.alert.exec(textSlice))) {
                        currentText = currentMatch[0];
                        if (!this.options.forExport) {
                          currentText = currentText.replace(/\n$/, '');
                        }
                        itemIndex += length = currentText.length;
                        textSlice = textSlice.substring(currentText.length);
                        items.push({
                          type: NodeType.alert_text,
                          text: currentText,
                          inner: currentMatch[1].toLowerCase(),
                        });
                      } else {
                        if (
                          !element.link &&
                          (currentMatch = (
                            remapPunctuation ? this.rules.link_ext : this.rules.link
                          ).exec(textSlice))
                        ) {
                          var normalizedLink = currentMatch[0];
                          textSlice = textSlice.substring(currentMatch[0].length);
                          if (remapPunctuation) {
                            normalizedLink = restoreCodeSpans(
                              (normalizedLink =
                                '[' +
                                currentMatch[1] +
                                ']' +
                                normalizedLink.substring(currentMatch[1].length + 2)),
                            );
                            currentMatch = this.rules.link.exec(normalizedLink);
                          }
                          if (currentMatch) {
                            itemIndex += currentMatch[0].length;
                            textSlice = normalizedLink.substr(currentMatch[0].length) + textSlice;
                            items.push({
                              type: 'link',
                              href: restoreEscapedCharacters(currentMatch[2], true),
                              title: currentMatch[5],
                              markdown: currentMatch[0],
                              text: currentMatch[1] || '',
                              inner: currentMatch[1]
                                ? this.output(
                                    currentMatch[1],
                                    decorateToken,
                                    true,
                                    InlineLexer.skipLink,
                                    renderState,
                                  )
                                : '',
                              meta: restoreEscapedCharacters(
                                currentMatch[0].substring(currentMatch[1].length + 2),
                              ),
                            });
                            continue;
                          }
                          textSlice = protectCodeSpans(normalizedLink) + textSlice;
                        }
                        if (!element.image) {
                          if (
                            !remapPunctuation &&
                            (currentMatch = this.rules.image.exec(textSlice))
                          ) {
                            itemIndex += (currentText = restoreCodeSpans(currentMatch[0])).length;
                            textSlice = textSlice.substring(currentMatch[0].length);
                            if ((currentMatch = this.rules.image.exec(currentText))) {
                              items.push({
                                type: 'image',
                                href: restoreEscapedCharacters(currentMatch[4]),
                                title: currentMatch[7],
                                markdown: currentMatch[0],
                                components: [currentMatch[1], currentMatch[3], currentMatch[8]],
                                alt: currentMatch[2],
                                onlychild: !textSlice && !items.length,
                              });
                              continue;
                            }
                            textSlice = protectCodeSpans(currentText) + textSlice;
                            itemIndex -= currentText.length;
                          }
                          if (
                            remapPunctuation &&
                            (currentMatch = this.rules.image_ext.exec(textSlice))
                          ) {
                            length = currentMatch[0].length;
                            textSlice = textSlice.substring(currentMatch[0].length);
                            var normalizedImage =
                              currentMatch[1]
                                .replace(/^!\u3010/g, '![')
                                .replace(/[\u3011\]][\uff08\)]$/g, '](') +
                              currentMatch[3] +
                              currentMatch[5].replace(/^\uff09/g, ')');
                            normalizedImage = restoreCodeSpans(normalizedImage);
                            if ((currentMatch = this.rules.image.exec(normalizedImage))) {
                              itemIndex += currentMatch[0].length;
                              textSlice =
                                normalizedImage.substr(currentMatch[0].length) + textSlice;
                              items.push({
                                type: 'image',
                                href: restoreEscapedCharacters(currentMatch[4]),
                                title: currentMatch[7],
                                markdown: normalizedImage.substr(0, currentMatch[0].length),
                                components: [currentMatch[1], currentMatch[3], currentMatch[8]],
                                alt: currentMatch[2],
                                onlychild: !textSlice && !items.length,
                              });
                              continue;
                            }
                            textSlice = protectCodeSpans(normalizedImage) + textSlice;
                          }
                        }
                        if (
                          !element.footnote &&
                          itemIndex &&
                          (currentMatch = this.rules.footnote.exec(textSlice))
                        ) {
                          currentText = restoreCodeSpans(currentMatch[0]);
                          textSlice = textSlice.substring(currentMatch[0].length);
                          if (currentText != currentMatch[0]) {
                            currentMatch = this.rules.footnote.exec(currentText);
                          }
                          if (currentMatch) {
                            itemIndex += currentMatch[0].length;
                            textSlice = currentText.substr(currentMatch[0].length) + textSlice;
                            var referenceName = (currentMatch[2] || currentMatch[1]).replace(
                              /\s+/g,
                              ' ',
                            );
                            items.push({
                              type: NodeType.footnote,
                              inner: this.output(
                                currentMatch[1],
                                decorateToken,
                                true,
                                InlineLexer.skipLink,
                                renderState,
                              ),
                              text: restoreEscapedCharacters(currentMatch[1]),
                            });
                            continue;
                          }
                          textSlice = protectCodeSpans(currentText) + textSlice;
                        }
                        if ((currentMatch = this.rules.reflink.exec(textSlice))) {
                          if (element.reflink && !currentMatch[1]) {
                          } else {
                            currentText = restoreCodeSpans(currentMatch[0]);
                            textSlice = textSlice.substring(currentMatch[0].length);
                            if (currentText != currentMatch[0]) {
                              currentMatch = this.rules.reflink.exec(currentText);
                            }
                            if (currentMatch) {
                              itemIndex += currentMatch[0].length;
                              textSlice = currentText.substr(currentMatch[0].length) + textSlice;
                              referenceName = (currentMatch[3] || '').replace(/\s+/g, ' ');
                              items.push({
                                type: currentMatch[1] ? 'refimg' : 'reflink',
                                ref: restoreEscapedCharacters(referenceName),
                                inner: this.output(
                                  currentMatch[2],
                                  decorateToken,
                                  true,
                                  InlineLexer.skipLink,
                                  renderState,
                                ),
                                text: restoreEscapedCharacters(currentMatch[2]),
                                markdown: currentText,
                                onlychild: !textSlice && !items.length,
                              });
                              continue;
                            }
                            textSlice = protectCodeSpans(currentText) + textSlice;
                          }
                        }
                        if (
                          element.attr ||
                          !(currentMatch = (
                            remapPunctuation ? this.rules.attr_ext : this.rules.attr
                          ).exec(textSlice))
                        ) {
                          if (
                            (currentMatch = /^\uE031\uE031([^\uE031]+)\uE031\uE031/.exec(textSlice))
                          ) {
                            itemIndex += (currentText = restoreCodeSpans(currentMatch[0], true))
                              .length;
                            textSlice = textSlice.substring(currentMatch[0].length);
                            items.push({
                              type: NodeType.strong,
                              pattern: '**',
                              inner: this.output(
                                currentMatch[1],
                                decorateToken,
                                true,
                                element,
                                renderState,
                              ),
                              text: currentText,
                            });
                          } else {
                            if ((currentMatch = this.rules.strong.exec(textSlice))) {
                              var tripleEmphasisPattern = /^\*\*\*([^\*]*[^\s*\s])\*\*/;
                              textSlice = textSlice.substring(currentMatch[0].length);
                              if (tripleEmphasisPattern.exec(currentMatch[0])) {
                                textSlice =
                                  currentMatch[0].replace(tripleEmphasisPattern, '*$1') +
                                  textSlice;
                                continue;
                              }
                              itemIndex += (currentText = restoreCodeSpans(currentMatch[0], true))
                                .length;
                              items.push({
                                type: NodeType.strong,
                                pattern: currentMatch[1],
                                inner: this.output(
                                  currentMatch[2],
                                  decorateToken,
                                  true,
                                  element,
                                  renderState,
                                ),
                                text: currentText,
                              });
                            } else {
                              if ((currentMatch = this.rules.em1.exec(textSlice))) {
                                itemIndex += (currentText = restoreCodeSpans(currentMatch[0], true))
                                  .length;
                                textSlice = textSlice.substring(currentMatch[0].length);
                                items.push({
                                  type: NodeType.em,
                                  pattern: currentMatch[1],
                                  inner: this.output(
                                    currentMatch[2],
                                    decorateToken,
                                    true,
                                    element,
                                    renderState,
                                  ),
                                  text: currentText,
                                });
                              } else {
                                if ((currentMatch = this.rules.em2.exec(textSlice))) {
                                  var match = (
                                    currentMatch[2] + currentMatch[3].substring(1, 3)
                                  ).match(/\s\*(?!\*)/);
                                  if (match) {
                                    currentText = currentMatch[0].substr(0, match.index + 1);
                                    itemIndex += (currentMatch = /^\*+/.exec(currentText))[0]
                                      .length;
                                    textSlice = textSlice.substring(currentMatch[0].length);
                                    appendPlainToken(items, currentMatch[0]);
                                    continue;
                                  }
                                  itemIndex += (currentText = restoreCodeSpans(
                                    currentMatch[0],
                                    true,
                                  )).length;
                                  textSlice = textSlice.substring(currentMatch[0].length);
                                  items.push({
                                    type: NodeType.em,
                                    pattern: currentMatch[1],
                                    inner: this.output(
                                      currentMatch[2] + currentMatch[3].substring(1, 3),
                                      decorateToken,
                                      true,
                                      element,
                                      renderState,
                                    ),
                                    text: currentText,
                                  });
                                } else {
                                  if ((currentMatch = this.rules.code2.exec(textSlice))) {
                                    textSlice = textSlice.replace(
                                      this.rules.code2,
                                      function (unusedParameter1, placeholderKey) {
                                        var codeText = map.get(placeholderKey) || '';
                                        map.delete(placeholderKey);
                                        return codeText;
                                      },
                                    );
                                  }
                                  if ((currentMatch = this.rules.code.exec(textSlice))) {
                                    itemIndex += currentMatch[0].length;
                                    textSlice = textSlice.substring(currentMatch[0].length);
                                    items.push({
                                      type: NodeType.code,
                                      pattern: currentMatch[1],
                                      text: currentMatch[2],
                                    });
                                  } else {
                                    if ((currentMatch = this.rules.del.exec(textSlice))) {
                                      itemIndex += (currentText = restoreCodeSpans(
                                        currentMatch[0],
                                        true,
                                      )).length;
                                      textSlice = textSlice.substring(currentMatch[0].length);
                                      items.push({
                                        type: NodeType.del,
                                        pattern: '~~',
                                        inner: this.output(
                                          currentMatch[1],
                                          decorateToken,
                                          true,
                                          element,
                                          renderState,
                                        ),
                                        text: currentText,
                                      });
                                    } else {
                                      if (
                                        (currentMatch = this.rules.emoji.exec(textSlice)) &&
                                        emoji.data[
                                          (currentMatch[2] = currentMatch[2].replace(
                                            /\uE006/g,
                                            '_',
                                          ))
                                        ]
                                      ) {
                                        textSlice = textSlice.substring(currentMatch[0].length);
                                        items.push({
                                          type: NodeType.emoji,
                                          text: currentMatch[2],
                                          inner: emoji.data[currentMatch[2]],
                                        });
                                        if (!currentMatch[1].length) {
                                          recordCursorDelta(itemIndex, 1);
                                        }
                                        itemIndex += currentMatch[0].length;
                                        if (!currentMatch[3].length) {
                                          recordCursorDelta(itemIndex, 1);
                                        }
                                      } else {
                                        if (
                                          !element.subscript &&
                                          (currentMatch = this.rules.subscript.exec(textSlice))
                                        ) {
                                          currentText = restoreCodeSpans(currentMatch[0]);
                                          textSlice = textSlice.substring(currentMatch[0].length);
                                          if (currentText != currentMatch[0]) {
                                            currentMatch = this.rules.subscript.exec(currentText);
                                          }
                                          if (currentMatch) {
                                            itemIndex += currentMatch[0].length;
                                            textSlice =
                                              currentText.substr(currentMatch[0].length) +
                                              textSlice;
                                            var currentItems = [];
                                            if (
                                              (currentMatch = currentMatch[1].split(/\\\s/g))[0]
                                            ) {
                                              currentItems.push({
                                                type: NodeType.plain,
                                                text: currentMatch[0],
                                              });
                                            }
                                            for (
                                              var localItemIndex = 1;
                                              localItemIndex < currentMatch.length;
                                              localItemIndex++
                                            ) {
                                              currentItems.push({
                                                type: NodeType.escape,
                                                text: ' ',
                                              });
                                              if (currentMatch[localItemIndex]) {
                                                currentItems.push({
                                                  type: NodeType.plain,
                                                  text: currentMatch[localItemIndex],
                                                });
                                              }
                                            }
                                            items.push({
                                              type: NodeType.subscript,
                                              inner: renderInlineTokens(currentItems),
                                              text: currentMatch[0],
                                            });
                                            continue;
                                          }
                                          textSlice = protectCodeSpans(currentText) + textSlice;
                                        }
                                        if (
                                          !element.superscript &&
                                          (currentMatch = this.rules.superscript.exec(textSlice))
                                        ) {
                                          currentText = restoreCodeSpans(currentMatch[0]);
                                          textSlice = textSlice.substring(currentMatch[0].length);
                                          if (currentText != currentMatch[0]) {
                                            currentMatch = this.rules.superscript.exec(currentText);
                                          }
                                          if (currentMatch) {
                                            itemIndex += currentMatch[0].length;
                                            textSlice =
                                              currentText.substr(currentMatch[0].length) +
                                              textSlice;
                                            currentItems = [];
                                            if (
                                              (currentMatch = currentMatch[1].split(/\\\s/g))[0]
                                            ) {
                                              currentItems.push({
                                                type: NodeType.plain,
                                                text: currentMatch[0],
                                              });
                                            }
                                            for (
                                              localItemIndex = 1;
                                              localItemIndex < currentMatch.length;
                                              localItemIndex++
                                            ) {
                                              currentItems.push({
                                                type: NodeType.escape,
                                                text: ' ',
                                              });
                                              if (currentMatch[localItemIndex]) {
                                                currentItems.push({
                                                  type: NodeType.plain,
                                                  text: currentMatch[localItemIndex],
                                                });
                                              }
                                            }
                                            items.push({
                                              type: NodeType.superscript,
                                              inner: renderInlineTokens(currentItems),
                                              text: currentMatch[0],
                                            });
                                            continue;
                                          }
                                          textSlice = protectCodeSpans(currentText) + textSlice;
                                        }
                                        if (
                                          element.inline_math ||
                                          !(currentMatch = this.rules.inline_math.exec(textSlice))
                                        ) {
                                          if (
                                            element.highlight ||
                                            !(currentMatch = this.rules.highlight.exec(textSlice))
                                          ) {
                                            if (
                                              (currentMatch = this.rules.entity.exec(textSlice))
                                            ) {
                                              itemIndex += currentMatch[0].length;
                                              textSlice = textSlice.substring(
                                                currentMatch[0].length,
                                              );
                                              if (utilities.decodeHtmlEntity(currentMatch[0])) {
                                                items.push({
                                                  type: NodeType.html_entity,
                                                  inner: currentMatch[0],
                                                  text: currentMatch[0],
                                                });
                                              } else {
                                                appendPlainToken(items, currentMatch[0] || '');
                                              }
                                            } else {
                                              if (
                                                File.option.convertSmartOnRender &&
                                                File.option.smartDash
                                              ) {
                                                if (
                                                  (currentMatch = /^(---)($|[^-])/.exec(textSlice))
                                                ) {
                                                  itemIndex += currentMatch[1].length;
                                                  textSlice = textSlice.substring(
                                                    currentMatch[1].length,
                                                  );
                                                  items.push({
                                                    type: NodeType.pants,
                                                    inner: '—',
                                                    desc: 'em_dash',
                                                    meta: '--',
                                                    text: '---',
                                                  });
                                                  continue;
                                                }
                                                if ((currentMatch = /^--/.exec(textSlice))) {
                                                  textSlice = textSlice.substring(
                                                    currentMatch[0].length,
                                                  );
                                                  itemIndex += currentMatch[0].length;
                                                  items.push({
                                                    type: NodeType.pants,
                                                    inner: File.option.twoHyphensToEm ? '—' : '–',
                                                    desc: File.option.twoHyphensToEm
                                                      ? 'em_dash'
                                                      : 'en_dash',
                                                    meta: '-',
                                                    text: '--',
                                                  });
                                                  continue;
                                                }
                                                if ((currentMatch = /^\.{3}/.exec(textSlice))) {
                                                  itemIndex += currentMatch[0].length;
                                                  if (
                                                    '.' !==
                                                    (textSlice = textSlice.substring(
                                                      currentMatch[0].length,
                                                    ))[4]
                                                  ) {
                                                    items.push({
                                                      type: NodeType.pants,
                                                      inner: '…',
                                                      desc: 'ellipsis',
                                                      meta: '..',
                                                      text: '...',
                                                    });
                                                  } else {
                                                    appendPlainToken(items, currentMatch[0]);
                                                  }
                                                  continue;
                                                }
                                              }
                                              if (
                                                File.option.convertSmartOnRender &&
                                                File.option.smartQuote
                                              ) {
                                                var precedingText, previousCharacter;
                                                if ('"' == textSlice[0]) {
                                                  previousCharacter =
                                                    (precedingText = lastTokenText(items) || '')[
                                                      precedingText.length - 1
                                                    ] || '';
                                                  if (
                                                    /([\(\{\[\s\-/\u2018])$/.exec(precedingText) ||
                                                    previousCharacter == smartQuotes.userQuote(2)
                                                  ) {
                                                    itemIndex++;
                                                    textSlice = textSlice.substring(1);
                                                    items.push({
                                                      type: NodeType.pants,
                                                      inner: smartQuotes.userQuote(0, void 0, true),
                                                      desc: 'open_double',
                                                      text: '"',
                                                    });
                                                    continue;
                                                  }
                                                  if (
                                                    (currentMatch =
                                                      /^"($|[\)\s/.,;:?!\u2019])/.exec(textSlice))
                                                  ) {
                                                    itemIndex++;
                                                    textSlice = textSlice.substring(1);
                                                    items.push({
                                                      type: NodeType.pants,
                                                      inner: smartQuotes.userQuote(1, void 0, true),
                                                      desc: 'close_double',
                                                      text: '"',
                                                    });
                                                    continue;
                                                  }
                                                  if (hasOpenDoubleQuote(items)) {
                                                    itemIndex++;
                                                    textSlice = textSlice.substring(1);
                                                    items.push({
                                                      type: NodeType.pants,
                                                      inner: smartQuotes.userQuote(1, void 0, true),
                                                      desc: 'close_double',
                                                      text: '"',
                                                    });
                                                    continue;
                                                  }
                                                  itemIndex++;
                                                  textSlice = textSlice.substring(1);
                                                  items.push({
                                                    type: NodeType.pants,
                                                    inner: smartQuotes.userQuote(0, void 0, true),
                                                    desc: 'open_double',
                                                    text: '"',
                                                  });
                                                  continue;
                                                }
                                                if ("'" == textSlice[0]) {
                                                  if (
                                                    renderState.openQuote &&
                                                    (currentMatch = /^'($|[\)\s".,;:?!-])/.exec(
                                                      textSlice,
                                                    ))
                                                  ) {
                                                    itemIndex++;
                                                    textSlice = textSlice.substring(1);
                                                    items.push({
                                                      type: NodeType.pants,
                                                      inner: smartQuotes.userQuote(3),
                                                      desc: 'close_single',
                                                      text: "'",
                                                    });
                                                    renderState.openQuote.inner =
                                                      smartQuotes.userQuote(2);
                                                    renderState.openQuote.desc = 'open_single';
                                                    renderState.openQuote = null;
                                                    continue;
                                                  }
                                                  precedingText = lastTokenText(items) || '';
                                                  if (
                                                    textSlice.length <= 1 &&
                                                    /((^|[\s])$)/.exec(precedingText)
                                                  ) {
                                                    itemIndex += textSlice.length;
                                                    appendPlainToken(items, textSlice);
                                                    textSlice = '';
                                                    continue;
                                                  }
                                                  itemIndex++;
                                                  textSlice = textSlice.substring(1);
                                                  items.push({
                                                    type: NodeType.pants,
                                                    inner:
                                                      '’' == smartQuotes.userQuote(3) ? '’' : "'",
                                                    desc: 'close_single',
                                                    text: "'",
                                                  });
                                                  if (/(^|[\(\s"-])$/.exec(precedingText)) {
                                                    renderState.openQuote = items.last();
                                                  }
                                                  continue;
                                                }
                                              }
                                              if ((currentMatch = this.rules.tab.exec(textSlice))) {
                                                itemIndex += currentMatch[0].length;
                                                textSlice = textSlice.substring(
                                                  currentMatch[0].length,
                                                );
                                                items.push({
                                                  type: NodeType.tab,
                                                  inner: currentMatch[0],
                                                  text: currentMatch[0],
                                                });
                                              } else {
                                                if (
                                                  (currentMatch = this.rules.text.exec(textSlice))
                                                ) {
                                                  itemIndex += currentMatch[0].length;
                                                  if (
                                                    '\n' ==
                                                      (textSlice = textSlice.substring(
                                                        currentMatch[0].length,
                                                      ))[0] &&
                                                    this.rules.linebreak.exec(currentMatch[0] || '')
                                                  ) {
                                                    itemIndex++;
                                                    textSlice = textSlice.substring(1);
                                                    appendPlainToken(
                                                      items,
                                                      currentMatch[0].replace(
                                                        this.rules.linebreak,
                                                        '',
                                                      ),
                                                    );
                                                    items.push({
                                                      type: NodeType.linebreak,
                                                      text: '  \n',
                                                      isLast: !textSlice,
                                                    });
                                                  } else {
                                                    appendPlainToken(items, currentMatch[0] || '');
                                                  }
                                                } else {
                                                  if (textSlice) {
                                                    throw new Error(
                                                      'Infinite loop on byte: ' +
                                                        textSlice.charCodeAt(0),
                                                    );
                                                  }
                                                }
                                              }
                                            }
                                          } else {
                                            itemIndex += (currentText = restoreCodeSpans(
                                              currentMatch[0],
                                              true,
                                            )).length;
                                            textSlice = textSlice.substring(currentMatch[0].length);
                                            items.push({
                                              type: NodeType.highlight,
                                              inner: this.output(
                                                currentMatch[2],
                                                decorateToken,
                                                true,
                                                element,
                                                renderState,
                                              ),
                                              text: restoreEscapedCharacters(currentMatch[2], true),
                                            });
                                          }
                                        } else {
                                          var mathBoundaryPattern = null,
                                            braceDepth = 0,
                                            mathText = '',
                                            boundaryMatch = null,
                                            dollarPattern = /\$/,
                                            pattern = '$';
                                          for (
                                            /^\$\$/.exec(currentMatch[0])
                                              ? ((mathBoundaryPattern = /{|}|\$\$/g),
                                                (pattern = '$$'))
                                              : ((mathBoundaryPattern = /{|}|\$/g),
                                                (pattern = '$')),
                                              mathBoundaryPattern.exec(currentMatch[0]);
                                            (boundaryMatch = mathBoundaryPattern.exec(
                                              currentMatch[0],
                                            ));
                                          ) {
                                            if (
                                              dollarPattern.exec(boundaryMatch[0]) &&
                                              braceDepth <= 0 &&
                                              '\\' !=
                                                currentMatch[0].substring(
                                                  boundaryMatch.index - 1,
                                                  boundaryMatch.index,
                                                )
                                            ) {
                                              mathText = currentMatch[0].substring(
                                                0,
                                                boundaryMatch.index + boundaryMatch[0].length,
                                              );
                                              break;
                                            }
                                            if ('{' === boundaryMatch[0]) {
                                              if (
                                                !(
                                                  '\\' ===
                                                    boundaryMatch.input[boundaryMatch.index - 1] &&
                                                  '\\' !==
                                                    !boundaryMatch.input[boundaryMatch.index - 2]
                                                )
                                              ) {
                                                braceDepth++;
                                              }
                                            } else {
                                              if ('}' === boundaryMatch[0]) {
                                                if (
                                                  !(
                                                    '\\' ===
                                                      boundaryMatch.input[
                                                        boundaryMatch.index - 1
                                                      ] &&
                                                    '\\' !==
                                                      !boundaryMatch.input[boundaryMatch.index - 2]
                                                  )
                                                ) {
                                                  braceDepth--;
                                                }
                                              }
                                            }
                                          }
                                          var patternLength = pattern.length;
                                          if (
                                            mathText.length - 2 * patternLength > 0 &&
                                            /[^\s$]/.exec(mathText)
                                          ) {
                                            textSlice = textSlice.substring(mathText.length);
                                            var zeroWidthOffset = (mathText =
                                              restoreCodeSpans(mathText)).indexOf('​');
                                            if (zeroWidthOffset > -1) {
                                              cursorDeltas[itemIndex + zeroWidthOffset + 1] = -1;
                                            }
                                            itemIndex += mathText.length;
                                            items.push({
                                              type: NodeType.inline_math,
                                              text: restoreEscapedCharacters(
                                                mathText.substring(
                                                  patternLength,
                                                  mathText.length - patternLength,
                                                ),
                                              ),
                                              pattern: pattern,
                                            });
                                            continue;
                                          }
                                          itemIndex += (currentText = restoreCodeSpans(
                                            currentMatch[0],
                                          )).length;
                                          textSlice = textSlice.substring(currentMatch[0].length);
                                          appendPlainToken(items, currentText || '');
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        } else {
                          itemIndex += (currentText = restoreCodeSpans(currentMatch[0])).length;
                          textSlice = textSlice.substring(currentMatch[0].length);
                          items.push({ type: NodeType.attr, text: currentText });
                        }
                      }
                    }
                  }
                }
              } else {
                textSlice = textSlice.substring(currentMatch[0].length);
                currentText = currentMatch[0].replace(/[\uE016\uE017\uE019]/g, '');
                if ((currentMatch = /(&#?[a-z0-9]+;)([?!.,:**_~;]*)$/i.exec(currentText))) {
                  currentText = currentText.substr(0, currentMatch.index + currentMatch[1].length);
                  textSlice = (currentMatch[2] || '') + textSlice;
                } else {
                  if ((currentMatch = /[?!.,:**_~;]+$/.exec(currentText))) {
                    currentText = currentText.substr(0, currentMatch.index);
                    textSlice = currentMatch[0] + textSlice;
                  }
                  if ((currentMatch = /\)+$/.exec(currentText))) {
                    var extraClosingParens =
                      (currentText.match(/\)/g) || []).length -
                      (currentText.match(/\(/g) || []).length;
                    if (
                      extraClosingParens > 0 &&
                      (currentMatch = new RegExp('\\){' + extraClosingParens + '}$').exec(
                        currentText,
                      ))
                    ) {
                      currentText = currentText.substr(0, currentMatch.index);
                      textSlice = currentMatch[0] + textSlice;
                    }
                  }
                }
                itemIndex += currentText.length;
                linkTarget = currentText;
                if (null === /^\w+:\/\//.exec(currentText) && /@/.exec(currentText)) {
                  linkTarget = 'mailto:' + linkTarget;
                }
                items.push({
                  type: NodeType.url,
                  href: restoreEscapedCharacters(linkTarget),
                  text: currentText,
                });
                renderState.hasContent = true;
              }
            } else {
              itemIndex += currentMatch[0].length;
              textSlice = textSlice.substring(currentMatch[0].length);
              ('');
              currentText = currentMatch[1];
              linkTarget =
                '@' === currentMatch[4]
                  ? ':' === currentMatch[1].charAt(6)
                    ? currentText
                    : 'mailto:' + currentMatch[1]
                  : currentText;
              items.push({
                type: NodeType.autolink,
                href: restoreEscapedCharacters(linkTarget),
                text: currentText,
              });
              renderState.hasContent = true;
            }
          }
        }
      }
    }
    var renderedHtml = renderInlineTokens(items);
    if (!alreadyPreprocessed) {
      renderedHtml = restoreEscapedCharacters(renderedHtml, {});
    }
    return renderedHtml;
  };
  EmptyRule.exec = EmptyRule;
  var taskMarkerPattern = /^( *)[*+-][ \t\u00A0]+(\[(x|X)\]|\[ \]) +/,
    bulletMarkerPattern = /^( *)[*+-][ \t\u00A0]+/,
    orderedListPattern = /^( *)\d+(\.|\))[ \t\u00A0]+/,
    firstOrderedItemPattern = /^( *)1(\.|\))[ \t\u00A0]+/,
    blockquotePrefixPattern = Object.defineProperty(
      function () {
        if (File.shouldRemapPunctuation()) {
          return /^ *[>〉》][^\n]+/;
        } else {
          return /^ *>[^\n]+/;
        }
      },
      'name',
      { value: 'Ne', configurable: true },
    );
  var inlineHeadingPattern = /^( *#{1,6}\s*)([^\n]+?)(\s+#+ *)*$/m,
    strictHeadingPattern = /^( *#{1,6}\s+)([^\n]+?)(\s+#+ *)*$/m;
  function renderContentWithBlockSyntax(
    sourceText,
    inlineLexer,
    skipBlockSyntax,
    documentNode,
    cursorDiff,
    items,
  ) {
    Object.defineProperty(renderMatchedBlockSyntax, 'name', { value: 'u', configurable: true });

    var blockMatch = [],
      renderedPart = '',
      renderState = { cursorDiff: cursorDiff };
    function renderMatchedBlockSyntax(text, match, blockToken) {
      var currentItems = [];
      currentItems[0] = text.substr(0, match.index);
      currentItems[1] = text.substr(match.index, match[0].length);
      currentItems[2] = text.substr(match.index + match[0].length);
      return currentItems
        .map(function (item, itemIndex) {
          if (1 == itemIndex) {
            return inlineLexer.options.decorate(blockToken);
          } else {
            if (item) {
              return inlineLexer.options.decorate({
                type: NodeType.paragraph,
                inner: inlineLexer.output(
                  item,
                  null,
                  null,
                  {
                    attr: !DocumentNode.isType(documentNode, NodeType.heading),
                    emptyline: 2 != itemIndex,
                  },
                  renderState,
                ),
              });
            } else {
              return '';
            }
          }
        })
        .join('');
    }
    for (
      documentNode && documentNode.cid == File.editor.focusCid && (renderState.isCur = true);
      sourceText;
    ) {
      if (!skipBlockSyntax && /^\s*[-+*_<\[\{|#0-9`~=>$]/m.exec(sourceText)) {
        if ((blockMatch = /^ *>[^\n]+/m.exec(sourceText))) {
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: NodeType.blockquote,
            pattern: blockMatch[0].match(/^( *> ?)+/gm)[0],
            inner: renderContentWithBlockSyntax(
              blockMatch[0].replace(/^( *> ?)+/gm, ''),
              inlineLexer,
              true,
              documentNode,
              cursorDiff,
            ),
          });
          break;
        }
        if (
          (blockMatch = (
            File.option.strictMarkdown ? strictHeadingPattern : inlineHeadingPattern
          ).exec(sourceText))
        ) {
          var mdlike = 'h' + blockMatch[0].match(/#/g).length;
          items.push(mdlike);
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: NodeType.heading,
            meta_before: blockMatch[0].substring(0, blockMatch[1].length),
            meta_after: blockMatch[3] || '',
            mdlike: mdlike,
            inner: inlineLexer.output(blockMatch[2], null, null, { attr: false }, renderState),
          });
          break;
        }
        if ((blockMatch = /^( *(`{3,}|~{3,}|·{3,})[ \t\u00A0]*)([^\n`]+)? *$/m.exec(sourceText))) {
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: NodeType.fences,
            lang: blockMatch[3],
            pattern: blockMatch[1],
          });
          break;
        }
        if ((blockMatch = /^\s*\[\^([^\]\n]+)\]:(\s*)([^\n]*)$/m.exec(sourceText))) {
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: NodeType.def_footnote,
            ref: blockMatch[1],
            pattern: blockMatch[2],
            inner: inlineLexer.output(blockMatch[3] || '', null, null, null, renderState),
          });
          break;
        }
        if ((blockMatch = /^\s*\[([^\]\n]+)\]:(\s*)([^\n]*)/m.exec(sourceText))) {
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: NodeType.def_link,
            ref: blockMatch[1],
            pattern: blockMatch[2],
            inner: inlineLexer.output(blockMatch[3] || '', null, null, null, renderState),
          });
          break;
        }
        if ((blockMatch = /^(\s*)(([-+*]|\d+(\.|\)))[ \t]+)/m.exec(sourceText))) {
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: 'block',
            inner: inlineLexer.output(blockMatch[0] || '', null, null, null, renderState),
          });
          break;
        }
        if ((blockMatch = /^\s*(\$\$|\[toc\])\s*$/im.exec(sourceText))) {
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: 'block',
            inner: inlineLexer.output(blockMatch[0] || '', null, null, null, renderState),
          });
          break;
        }
        if ((blockMatch = /^\s*([-+_*])\s*\1\s*\1(\s|\1)*$/m.exec(sourceText))) {
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: 'block',
            inner: inlineLexer.output(blockMatch[0] || '', null, null, null, renderState),
          });
          break;
        }
        if ((blockMatch = /^ *\|([^\|]+\|.+)\|\s*$/m.exec(sourceText))) {
          renderedPart = renderMatchedBlockSyntax(sourceText, blockMatch, {
            type: 'block',
            inner: inlineLexer.output(blockMatch[0] || '', null, null, null, renderState),
          });
          break;
        }
      }
      var parentNode = documentNode.get('parent');
      if (
        DocumentNode.isType(documentNode, NodeType.paragraph) &&
        !documentNode.get('before') &&
        DocumentNode.isType(parentNode, NodeType.blockquote) &&
        parentNode.get('alert')
      ) {
        renderState.alert = true;
      }
      renderedPart = inlineLexer.options.decorate({
        type: NodeType.paragraph,
        inner: inlineLexer.output(
          sourceText,
          null,
          null,
          {
            attr: !DocumentNode.isType(documentNode, NodeType.heading),
            alert: renderState.alert,
          },
          renderState,
        ),
      });
      break;
    }
    return renderedPart;
  }
  var defaultInlineLexer,
    parserApi = {};
  parserApi.options = parserApi.setOptions = function (options) {
    assignOwnProperties(parserApi.defaults, options);
    return parserApi;
  };
  parserApi.defaults = {
    gfm: true,
    tables: true,
    breaks: false,
    pedantic: false,
    sanitize: false,
    smartLists: false,
    silent: false,
    highlight: null,
    langPrefix: 'lang-',
    smartypants: false,
    headerPrefix: '',
  };
  parserApi.parseInline = function (sourceText, context, cursorDiff) {
    if (!defaultInlineLexer) {
      defaultInlineLexer = new InlineLexer();
      parserApi.defaultInlineLexer = defaultInlineLexer;
    }
    return defaultInlineLexer.output(sourceText, null, null, context, { cursorDiff: cursorDiff });
  };
  parserApi.parsePandocAttr = function (text) {
    var element = {};
    if (text && '{' == text[0] && '}' == text[text.length - 1]) {
      ((text = text.replace(/(^{)|(}$)/g, '')).split(/\s+/) || [text]).forEach(function (item) {
        var match;
        if ((match = /^#(.+)/.exec(item))) {
          element.id = utilities.escapeInQuote(match[1]);
        } else {
          if ((match = /^\.(.+)/.exec(item))) {
            element.class = (element.class || '') + ' ' + utilities.escapeInQuote(match[1]);
          } else {
            if ((match = /^(.+)=(['"])([^'"]+)\2/.exec(item))) {
              element.attr = (element.attr || '') + ' ' + item;
              element.nativeAttr = element.nativeAttr || {};
              element.nativeAttr[match[1]] = match[3];
            }
          }
        }
      });
      return element;
    } else {
      return element;
    }
  };
  parserApi.attrToString = function (element) {
    var attributesText = '';
    if (element.id) {
      attributesText += " id='" + element.id + "'";
    }
    if (element.class) {
      attributesText += " class='" + element.class.trim() + "'";
    }
    if (element.attr) {
      attributesText += element.attr;
    }
    return attributesText;
  };
  parserApi.InlineLexer = InlineLexer;
  parserApi.quickParse = Object.defineProperty(
    function brushDocumentNode(
      textSlice,
      brush,
      documentNode,
      inlineOnly,
      command,
      selectionSnapshot,
    ) {
      Object.defineProperty(createParagraphNode, 'name', { value: 'm', configurable: true });
      Object.defineProperty(prepareBlockConversion, 'name', { value: 'g', configurable: true });
      Object.defineProperty(finishBlockConversion, 'name', { value: 'v', configurable: true });
      Object.defineProperty(convertParagraphToList, 'name', { value: 'y', configurable: true });

      var currentMatch,
        consumedPrefixLength = 0,
        localDocumentNode = documentNode,
        cursorDiff = [];
      function createParagraphNode(text, inputDocumentNode, nodeType) {
        return new DocumentNode({
          type: nodeType || NodeType.paragraph,
          text: text,
          parent: inputDocumentNode,
          in: inputDocumentNode.get('in'),
        });
      }
      function prepareBlockConversion(prefixText, editCommand, targetNode, lineInfo) {
        brush.editor.undo.endSnap(true);
        if (targetNode.cid == brush.editor.focusCid) {
          brush.editor.store();
        }
        editCommand.undo.push(undoManager.buildReplaceUndo(targetNode));
        var precedingParagraph = null;
        if (lineInfo && lineInfo.start) {
          consumedPrefixLength = consumedPrefixLength - lineInfo.start + prefixText.length;
          precedingParagraph = new DocumentNode({
            type: NodeType.paragraph,
            text: textSlice.substring(0, lineInfo.start - 1),
          });
          targetNode.addBefore(precedingParagraph);
          undoManager.addUndoForInsert(editCommand, precedingParagraph);
        } else {
          consumedPrefixLength += prefixText.length;
        }
        textSlice = textSlice.substring((lineInfo ? lineInfo.start : 0) + prefixText.length);
        return precedingParagraph;
      }
      function finishBlockConversion(
        parsedNode,
        inputCommand,
        containerNode,
        parseResult,
        precedingParagraph,
      ) {
        parseResult =
          parseResult ||
          brushDocumentNode(textSlice, brush, parsedNode, false, inputCommand, selectionSnapshot);
        inputCommand.redo.push(undoManager.buildReplaceUndo(containerNode));
        return {
          html:
            (precedingParagraph ? precedingParagraph.toHTML() : '') +
            containerNode.toHTML(parseResult.html),
          offset: consumedPrefixLength + parseResult.offset,
          focus: parseResult.focus,
          blockChanged: true,
          command: inputCommand,
        };
      }
      function convertParagraphToList(text, editCommand, listStyle, lineInfo) {
        var listItem,
          parseResult,
          indentSize = File.option.indentSize,
          precedingParagraph = prepareBlockConversion(
            (text = text.replace('【', '[').replace('】', ']')),
            editCommand,
            documentNode,
            lineInfo,
          );
        documentNode.set('type', NodeType.list);
        documentNode.set('text', '');
        documentNode.set('style', listStyle);
        (listItem = createParagraphNode('', documentNode, NodeType.list_item)).set(
          'checked',
          null != /x|X/g.exec(lineInfo.line),
        );
        if (text.indexOf('[') > -1) {
          listItem.set('style', DocumentNode.ListType.task);
        }
        if (listStyle == DocumentNode.ListType.ul) {
          if (File.option.prettyIndent) {
            documentNode.set(
              'pattern',
              text.replace(/\[[xX\s]\]\s+/, '').trim() + ' '.repeat(indentSize - 1),
            );
          } else {
            documentNode.set('pattern', text.replace(/\[[xX\s]\]\s+/, '').trim() + ' ');
          }
        }
        if (listStyle == DocumentNode.ListType.ol) {
          var listStartText = text.match(/\d+/)[0].replace(/^1$/, '');
          if ('' != listStartText) {
            documentNode.set('start', listStartText);
          } else {
            documentNode.unset('start');
          }
          if (File.option.prettyIndent) {
            documentNode.set(
              'pattern',
              text.replace(/\d+/, '{0}').trim() + ' '.repeat(indentSize - 1),
            );
          } else {
            documentNode.set('pattern', text.replace(/\d+/, '{0}').trim() + ' ');
          }
        }
        if (text && File.option.autoPairExtendSymbol && /\*\s$/.exec(text)) {
          textSlice = textSlice.replace(/^\*/, '');
        }
        localDocumentNode = createParagraphNode(textSlice, listItem, NodeType.paragraph);
        (parseResult = brushDocumentNode(textSlice, brush, localDocumentNode, false)).html =
          listItem.toHTML(parseResult.html);
        return finishBlockConversion(
          null,
          editCommand,
          documentNode,
          parseResult,
          precedingParagraph,
        );
      }
      command = command || (!inlineOnly && undoManager.makeEmptyCommand());
      if (File.option.strictMarkdown) {
        taskMarkerPattern = File.shouldRemapPunctuation()
          ? /^( {0,3})[*+-][ \t\u00A0]+([\[【](x|X)[\]】]|[\[【] [\]】]) +/
          : /^( {0,3})[*+-][ \t\u00A0]+(\[(x|X)\]|\[ \]) +/;
        bulletMarkerPattern = /^( {0,3})[*+-][ \t\u00A0]+/;
        orderedListPattern = /^( {0,3})\d+(\.|\))[ \t\u00A0]+/;
        firstOrderedItemPattern = /^( {0,3})1(\.|\))[ \t\u00A0]+/;
      }
      if (selectionSnapshot && void 0 === selectionSnapshot.endId) {
        selectionSnapshot.endId = selectionSnapshot.id;
      }
      if (selectionSnapshot && void 0 === selectionSnapshot.startId) {
        selectionSnapshot.startId = selectionSnapshot.id;
      }
      var outsideSelectionEnd = !selectionSnapshot || selectionSnapshot.endId != documentNode.cid;
      if (!(inlineOnly = inlineOnly || (textSlice.indexOf('\n') > -1 && outsideSelectionEnd))) {
        var cursorLine = utilities.findLine(
          textSlice,
          outsideSelectionEnd ? 0 : selectionSnapshot.end,
        );
        if (blockquotePrefixPattern().exec(cursorLine.line)) {
          if (!/^(\s*>){10,}/.exec(cursorLine.line)) {
            return (function (editCommand, lineInfo) {
              var precedingParagraph = prepareBlockConversion(
                lineInfo.line.match(/^ *[>〉》][ \u00A0]?/)[0],
                editCommand,
                documentNode,
                lineInfo,
              );
              documentNode.set('type', NodeType.blockquote);
              documentNode.set('text', '');
              localDocumentNode = createParagraphNode(textSlice, documentNode);
              editCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
              return finishBlockConversion(
                localDocumentNode,
                editCommand,
                documentNode,
                void 0,
                precedingParagraph,
              );
            })(command, cursorLine);
          }
        } else {
          if ((currentMatch = taskMarkerPattern.exec(cursorLine.line))) {
            return convertParagraphToList(
              currentMatch[0],
              command,
              DocumentNode.ListType.ul,
              cursorLine,
            );
          }
          if ((currentMatch = bulletMarkerPattern.exec(cursorLine.line))) {
            return convertParagraphToList(
              currentMatch[0],
              command,
              DocumentNode.ListType.ul,
              cursorLine,
            );
          }
          if (
            (currentMatch = (
              File.option.strictNumberStartOnNewLine && cursorLine.start
                ? firstOrderedItemPattern
                : orderedListPattern
            ).exec(cursorLine.line))
          ) {
            return convertParagraphToList(
              currentMatch[0],
              command,
              DocumentNode.ListType.ol,
              cursorLine,
            );
          }
          if (
            (currentMatch = (function (inputDocumentNode, lineInfo) {
              var currentDocumentNode = inputDocumentNode.get('parent');
              return (
                DocumentNode.isType(inputDocumentNode, NodeType.paragraph) &&
                !inputDocumentNode.get('before') &&
                DocumentNode.isType(currentDocumentNode, NodeType.list_item) &&
                currentDocumentNode.get('style') !== DocumentNode.ListType.task &&
                currentDocumentNode.get('parent').get('style') == DocumentNode.ListType.ul &&
                (File.shouldRemapPunctuation()
                  ? /(^ *[\[【](x|X)[\]】]( |\t)+)|((^ *[\[【] [\]】]) +)/g
                  : /(^ *\[(x|X)\]( |\t)+)|((^ *\[ \]) +)/g
                ).exec(lineInfo)
              );
            })(documentNode, textSlice))
          ) {
            return (function (markerText, editCommand) {
              var parseResult,
                childParseResult,
                currentDocumentNode = documentNode.get('parent');
              prepareBlockConversion(markerText, editCommand, currentDocumentNode);
              currentDocumentNode.set('style', DocumentNode.ListType.task);
              currentDocumentNode.set('checked', null != /x|X/g.exec(markerText));
              documentNode.set('text', textSlice);
              (childParseResult = brushDocumentNode(
                textSlice,
                brush,
                (localDocumentNode = documentNode),
                true,
                editCommand,
              )).html = void 0;
              (parseResult = finishBlockConversion(
                null,
                editCommand,
                currentDocumentNode,
                childParseResult,
              )).replaceCid = currentDocumentNode.cid;
              return parseResult;
            })(currentMatch[0], command);
          }
          if (
            (function (inputDocumentNode) {
              return (
                !!File.option.enableAlert &&
                DocumentNode.isType(inputDocumentNode.get('parent'), NodeType.blockquote) &&
                DocumentNode.isType(inputDocumentNode, NodeType.paragraph) &&
                !inputDocumentNode.get('before')
              );
            })(documentNode)
          ) {
            var alertResult = (function (prefixText, inputCommand) {
              var parseResult,
                currentDocumentNode = documentNode.get('parent'),
                match = /^\s*\[\!(note|warning|important|tip|caution)\]\s*(\n|$)/gi.exec(
                  prefixText,
                );
              let text = (match || [])[1] || '';
              if (text.toLowerCase() != (currentDocumentNode.get('alert') || '')) {
                var previousCommand = editor.undo.lastRegisteredOperationCommand();
                if (0 === (previousCommand.source || '').indexOf(documentNode.cid + '#')) {
                  editor.undo.removeLastRegisteredOperationCommand();
                  undoManager.append(inputCommand, previousCommand);
                }
                prepareBlockConversion(documentNode.get('text'), inputCommand, currentDocumentNode);
                consumedPrefixLength = 0;
                currentDocumentNode.set('alert', text.toLowerCase());
                documentNode.set('text', prefixText);
                var nextNode = documentNode.get('after'),
                  hasRemainingText = text && !match[0].length <= prefixText.length;
                if (!nextNode && hasRemainingText) {
                  nextNode = new DocumentNode({ type: NodeType.paragraph, text: '' });
                  documentNode.addAfter(nextNode);
                  undoManager.addUndoForInsert(inputCommand, nextNode, documentNode);
                }
                (parseResult = finishBlockConversion(null, inputCommand, currentDocumentNode, {
                  offset: 0,
                  focus: hasRemainingText ? nextNode.cid : documentNode.cid,
                  blockChanged: true,
                  command: inputCommand,
                  cursorDiff: [],
                })).replaceCid = currentDocumentNode.cid;
                return parseResult;
              }
            })(textSlice, command);
            if (alertResult) {
              return alertResult;
            }
          }
        }
      }
      var blockMetadata = [],
        renderResult = {
          innerHtml: renderContentWithBlockSyntax(
            textSlice,
            brush.inline,
            inlineOnly || DocumentNode.isType(documentNode, NodeType.heading),
            documentNode,
            cursorDiff,
            blockMetadata,
          ),
          offset: 0,
          focus: documentNode.cid,
          blockChanged: false,
          command: command,
          cursorDiff: cursorDiff,
          mdlike: blockMetadata[0],
        };
      renderResult.html =
        documentNode && documentNode.toHTML(renderResult.innerHtml, blockMetadata[0]);
      return renderResult;
    },
    'name',
    { value: 'e', configurable: true },
  );
  parserApi.reDefLink = referenceDefinitionPattern;
  parserApi.reDefFootnote = footnoteDefinitionPattern;
  parserApi.reOL = listPrefixPatterns[DocumentNode.ListType.ol];
  parserApi.renderHtmlWithBlockMeta = Object.defineProperty(
    function renderHtmlWithBlockMetadata(documentNode, brush) {
      if (DocumentNode.isType(documentNode, NodeType.paragraph)) {
        var blockMetadata = [],
          innerHtml = renderContentWithBlockSyntax(
            documentNode.safeGetStrAttr('text'),
            brush.inline,
            false,
            documentNode,
            [],
            blockMetadata,
          );
        return documentNode.toHTML(innerHtml, blockMetadata[0]);
      }
      if (documentNode.get('children').length) {
        for (
          var currentDocumentNode = documentNode.getFirstChild(), textParts = [];
          currentDocumentNode;
        ) {
          textParts.push(renderHtmlWithBlockMetadata(currentDocumentNode, brush));
          currentDocumentNode = currentDocumentNode.get('after');
        }
        return documentNode.toHTML(textParts.join(''));
      }
      return documentNode.toHTML(void 0, void 0, { mathCount: 0 });
    },
    'name',
    { value: 'e', configurable: true },
  );
  parserApi.splitTableCell = splitTableCells;
  parserApi.recoverEscape = restoreEscapedCharacters;
  parserApi.brushContent = renderContentWithBlockSyntax;
  moduleRecord.exports = parserApi;
  Object.defineProperty(globalThis, '__MARKLYRA_NATIVE_LITERAL__', {
    value: Object.freeze({
      version: 1,
      moduleSha256: '713a28919e6cd278377be1590412dbecce450724015463f289d1bc7b0a1b5623',
      sites: 2,
    }),
  });
}
