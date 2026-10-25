// model/markdown-parser.
// SystemJS module 19. Dependencies: 11, 13, 31, 1b, 5a, 17, 1e.
$__System.registerDynamic(
  '19',
  ['11', '13', '31', '1b', '5a', '17', '1e'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var utilities = requireModule('11'),
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      inlineDecoration = requireModule('31'),
      undoManager = requireModule('1b'),
      emoji = requireModule('5a'),
      htmlBlocks = requireModule('17'),
      smartQuotes = requireModule('1e'),
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
      ie = function (documentNode) {
        if (documentNode.get('style') == DocumentNode.ListType.ol) {
          for (
            var fixedNumbering = (function (inputDocumentNode) {
                if (inputDocumentNode.get('style') == DocumentNode.ListType.ol) {
                  for (
                    var currentDocumentNode = inputDocumentNode.getFirstChild(),
                      hasSequentialItems = !1,
                      nextNode = currentDocumentNode.get('after');
                    nextNode && nextNode._numText;
                  ) {
                    if (currentDocumentNode._numText.trim() != nextNode._numText.trim()) return !1;
                    (hasSequentialItems = !0),
                      (nextNode = (currentDocumentNode = nextNode).get('after'));
                  }
                  return hasSequentialItems;
                }
              })(documentNode),
              localDocumentNode = documentNode.getFirstChild(),
              _numText = localDocumentNode._numText;
            localDocumentNode;
          )
            (localDocumentNode._numText = void 0),
              (localDocumentNode = localDocumentNode.get('after'));
          fixedNumbering && documentNode.set('pattern', _numText),
            documentNode.set('isFixed', fixedNumbering);
        }
      },
      re = function (text) {
        return (text || '').replace(/\t/g, tabReplacement).length;
      },
      BlockCloseResult = { NOT_CLOSE: 0, CLOSE_EXCLUDE: 1, CLOSE_INCLUDE: 2, UNKNOWN: -1 },
      getHTMLTagReg = htmlBlocks.getHTMLTagReg,
      blockRules = {
        paragraph: {
          shouldClose: function (lineText) {
            return lineText.match(blankBlockLinePattern)
              ? (this.cur.set('tail', 1), BlockCloseResult.CLOSE_INCLUDE)
              : BlockCloseResult.UNKNOWN;
          },
          onClose: function (endOfInput) {
            this.cur._lines.length > 1 &&
              this.cur._lines[0].match(whitespaceLinePattern) &&
              (this.cur.set('ahead', 1), this.cur._lines.shift()),
              !this.cur._lines.length && this.cur._lines.push(''),
              this.cur.set('text', this.cur._lines.join('\n')),
              void 0 == this.cur.get('tail') &&
                !endOfInput &&
                this.cur._lines.last().trim() &&
                this.cur.set('tail', 0),
              (this.cur._lines = void 0);
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
            if (!inputText.trim()) return BlockCloseResult.CLOSE_EXCLUDE;
            for (; (match = tagPattern.exec(text)); )
              (text = text.substring(match.index + match[0].length)),
                match[2] ? tagDepth-- : match[1] || tagDepth++;
            return tagDepth <= 0
              ? (this.cur.set('depth', 0),
                this.cur._lines.push(inputText),
                BlockCloseResult.CLOSE_INCLUDE)
              : (this.cur.set('depth', tagDepth), BlockCloseResult.NOT_CLOSE);
          },
          onClose: function () {
            var depth = this.cur.get('depth');
            this.cur.set('text', this.cur._lines.join('\n')),
              depth &&
                this.skips.enableStartMatch &&
                (1 != this.cur._lines.length || />/.exec(this.cur._lines[0])
                  ? htmlBlocks.autoCloseTag(this.cur)
                  : (this.cur.set('type', NodeType.paragraph), this.cur.unset('style'))),
              (this.cur._lines = void 0);
          },
          onContinue: function (lineText) {
            this.cur._lines.push(lineText);
          },
        },
        blockquote: {
          shouldClose: function (text) {
            return text.trim().length
              ? text.match(blockquotePattern)
                ? BlockCloseResult.NOT_CLOSE
                : text.match(/\t|( {2,})/)
                  ? BlockCloseResult.NOT_CLOSE
                  : BlockCloseResult.UNKNOWN
              : (this.cur.set('tail', 1), BlockCloseResult.CLOSE_INCLUDE);
          },
          onClose: function () {
            new ce(this.cur._lines, this.cur, null, null, this.skips),
              (this.cur._lines = void 0),
              this.cur.unset('text'),
              (this.skips || {}).pass_format || this.cur.set('userIndent', this.cur._lineIndents),
              (this.cur._lineIndents = void 0);
          },
          onContinue: function (text) {
            var _indent = this.cur._indent;
            quotePrefixCache[_indent] ||
              (quotePrefixCache[_indent] = new RegExp(
                '^((( {0,' +
                  (_indent + 4) +
                  '}|\\t)> {0,' +
                  (_indent || 1) +
                  '})|(\\t| {2})|>(\\t| {0,' +
                  (_indent || 1) +
                  '}))',
              ));
            var prefixMatch = quotePrefixCache[_indent].exec(text) || [''],
              prefixText = prefixMatch[0];
            (!prefixMatch[2] &&
              (prefixMatch[4] || '').length > 0 &&
              ((prefixMatch[2] = '> '.substr(0, prefixText.length)),
              (text = prefixMatch[2] + text.substring(prefixText.length))),
            (this.cur._indentSensitive =
              this.cur._indentSensitive ||
              /^\s*([-+*>]|\d+(\.|\)))\s/.exec(text.substring(prefixText.length))),
            prefixMatch[2] && _indent < 4 && !this.cur._indentSensitive) &&
              (nestedQuotePrefixCache[_indent] ||
                (nestedQuotePrefixCache[_indent] = new RegExp(
                  '^( {1,' + (4 - _indent) + '}|\\t)>',
                )),
              nestedQuotePrefixCache[_indent].exec(text.substring(prefixText.length)) ||
                (prefixText += (new RegExp('^ {1,' + (4 - _indent) + '}').exec(
                  text.substring(prefixText.length),
                ) || [''])[0]));
            /^\s*>*\s*$/.exec(text)
              ? (this.cur._lineIndents.push(text), this.cur._lines.push(''))
              : (this.cur._lineIndents.push(prefixText),
                this.cur._lines.push(text.substring(prefixText.length)));
          },
        },
        list: {
          shouldClose: function (lineText) {
            var match,
              lastChild = this.cur.getLastChild();
            return (
              listIndentCache[lastChild._indent] ||
                (listIndentCache[lastChild._indent] = new RegExp(
                  '^( {' + lastChild._indent + ',}|\\t)',
                )),
              lineText.match(listIndentCache[lastChild._indent])
                ? (this.cur.unset('tail'), BlockCloseResult.NOT_CLOSE)
                : lineText.match(whitespaceLinePattern)
                  ? (this.cur.set('tail', (this.cur.get('tail') || 0) + 1),
                    this.cur.get('tail') > 1
                      ? (this.cur.set('tail', 1), BlockCloseResult.CLOSE_EXCLUDE)
                      : BlockCloseResult.NOT_CLOSE)
                  : lineText.match(horizontalRulePattern)
                    ? BlockCloseResult.CLOSE_EXCLUDE
                    : lastChild._minIndent < lastChild._indent &&
                        (listIndentCache[lastChild._minIndent] ||
                          (listIndentCache[lastChild._minIndent] = new RegExp(
                            '^( {' + lastChild._minIndent + ',})',
                          )),
                        lineText.match(listIndentCache[lastChild._minIndent]))
                      ? (this.cur.unset('tail'),
                        (lastChild._indent = /^\s+/.exec(lineText)[0].length),
                        (lastChild._indentDecided = !1),
                        BlockCloseResult.NOT_CLOSE)
                      : (match = listPrefixPatterns[this.cur.get('style')].exec(lineText))
                        ? match[3] == this.cur._mark
                          ? 0
                          : 1
                        : this.lines[this.ln - 1].match(whitespaceLinePattern)
                          ? BlockCloseResult.CLOSE_EXCLUDE
                          : BlockCloseResult.UNKNOWN
            );
          },
          onClose: function () {
            for (
              var lastChild = this.cur.getLastChild(), trailingLines = this.cur.get('tail') || 0;
              trailingLines > 0 && !lastChild._lines.last().trim().length;
            )
              lastChild._lines.pop(), lastChild._lineIndents.pop(), trailingLines--;
            new ce(lastChild._lines, lastChild, null, null, this.skips),
              lastChild.unset('text'),
              (this.skips || {}).pass_format || lastChild.set('userIndent', lastChild._lineIndents),
              (lastChild._lines = void 0),
              (lastChild._indent = void 0),
              (lastChild._minIndent = void 0),
              (lastChild._indentDecided = void 0),
              (lastChild._lineIndents = void 0),
              (this.cur._mark = void 0),
              this.cur.unset('text'),
              (this.skips || {}).pass_format ||
                (ie(this.cur),
                !this.cur.get('tail') && this.lines[this.ln] && this.cur.set('tail', 0));
          },
          onContinue: function (textSlice, markerText, _indent) {
            var currentMatch,
              lastChild = this.cur.getLastChild(),
              markerWidth = re(markerText),
              contentIndent = File.option.strictMarkdown ? markerWidth - _indent : 2,
              style = this.cur.get('style'),
              _numLength = 0;
            const orderedMarkerPattern = /^\s*(\d+)(\.|\))\s+/,
              numberedPrefixPattern = /^\s*(\d+(\.|\))\s+)/;
            function v(listItem, lineText, resetLines) {
              resetLines && (listItem._lines = []),
                listItem._lines.push(lineText),
                listItem.set('userIndent', listItem._lineIndents);
            }
            var currentTextSlice, localMatch;
            if (
              ((_indent = _indent || (lastChild ? lastChild.get('prespace') : 0) || 0),
              textSlice.match(whitespaceLinePattern) || this.cur.unset('tail'),
              !lastChild)
            )
              return (
                style == DocumentNode.ListType.ol &&
                  (_numLength = orderedMarkerPattern.exec(textSlice)[1].length - 1),
                (lastChild = new DocumentNode({
                  type: NodeType.list_item,
                  prespace: _indent,
                  markindent: markerWidth - _numLength - _indent,
                })),
                this.cur.appendChild(lastChild),
                (lastChild._indent = contentIndent + _indent),
                (lastChild._minIndent =
                  _numLength + (style == DocumentNode.ListType.ol ? 3 : 2) + _indent),
                style == DocumentNode.ListType.ol &&
                  ((lastChild._numText = (numberedPrefixPattern.exec(textSlice) || [])[1]),
                  (lastChild._numLength = _numLength)),
                (localMatch = listPrefixPatterns[DocumentNode.ListType.task].exec(textSlice))
                  ? (lastChild.set('checked', !!localMatch[5]),
                    lastChild.set('style', DocumentNode.ListType.task),
                    (currentTextSlice = localMatch[0]))
                  : (currentTextSlice = listPrefixPatterns[style].exec(textSlice)[0]),
                (lastChild._lineIndents = [currentTextSlice]),
                void v(lastChild, textSlice.substring(currentTextSlice.length), !0)
              );
            (lastChild._numLength = lastChild._numLength || 0),
              listIndentCache[lastChild._indent] ||
                (listIndentCache[lastChild._indent] = new RegExp(
                  '^( {' + lastChild._indent + ',}|\\t)',
                ));
            var currentLength,
              _lines,
              match = textSlice.match(listIndentCache[lastChild._indent]);
            if (
              (listContinuationCache[lastChild._indent] ||
                (lastChild._indent < 2 &&
                  (listContinuationCache[lastChild._indent] = new RegExp('^\\t')),
                (listContinuationCache[lastChild._indent] = new RegExp(
                  '^( {2,' + lastChild._indent + '}|\\t)',
                ))),
              (currentLength = (textSlice.match(listContinuationCache[lastChild._indent]) || [
                '',
              ])[0].length),
              (currentTextSlice = (listContinuationCache[lastChild._indent].exec(textSlice) || [
                '',
              ])[0]),
              (textSlice = match ? textSlice.substring(currentTextSlice.length) : textSlice),
              lastChild.get('style') == DocumentNode.ListType.task &&
                !File.option.strictMarkdown &&
                match &&
                ((currentTextSlice += (textSlice.match(/^ {4}/) || [''])[0]),
                (textSlice = textSlice.replace(/^ {4}/, ''))),
              !match && (currentMatch = activeListMarkerPatterns[style].exec(textSlice)))
            )
              return (
                (_indent = (currentMatch[1] || '').length),
                (markerText = currentMatch[0]),
                (markerWidth = re(markerText)),
                (contentIndent = File.option.strictMarkdown ? markerWidth - _indent : 2),
                lastChild._lines.length > 1 && lastChild._lines.last().match(whitespaceLinePattern)
                  ? (lastChild._lines.pop(), lastChild.set('tail', 1))
                  : lastChild.set('tail', 0),
                this.cur.unset('tail'),
                new ce(lastChild._lines, lastChild, null, null, this.skips),
                (this.skips || {}).pass_format ||
                  lastChild.set('userIndent', lastChild._lineIndents),
                lastChild.unset('text'),
                (lastChild._lines = void 0),
                (lastChild._lineIndents = void 0),
                (lastChild._indent = void 0),
                style == DocumentNode.ListType.ol &&
                  (_numLength = orderedMarkerPattern.exec(textSlice)[1].length - 1),
                ((lastChild = new DocumentNode({
                  type: NodeType.list_item,
                  prespace: _indent,
                  markindent: markerWidth - _numLength - _indent,
                }))._numLength = _numLength),
                (lastChild._numText = (numberedPrefixPattern.exec(textSlice) || [])[1]),
                (lastChild._minIndent =
                  _numLength + (style == DocumentNode.ListType.ol ? 3 : 2) + _indent),
                (currentTextSlice = currentMatch[0]),
                (localMatch = listPrefixPatterns[DocumentNode.ListType.task].exec(textSlice)) &&
                  (lastChild.set('checked', !!localMatch[5]),
                  lastChild.set('style', DocumentNode.ListType.task),
                  (currentTextSlice = localMatch[0])),
                this.cur.appendChild(lastChild),
                (lastChild._indent = contentIndent + _indent),
                (lastChild._lineIndents = [currentTextSlice]),
                void v(lastChild, textSlice.substring(currentTextSlice.length), !0)
              );
            if (!lastChild._indentDecided) {
              if (
                (currentMatch = indentationPattern.exec(textSlice)) &&
                lastChild._indent &&
                lastChild._indent - _indent < 4
              )
                if (currentMatch[1].length) {
                  var length = currentMatch[1].replace(/\t/, '    ').length,
                    totalIndent = length + lastChild._indent;
                  totalIndent > _indent + lastChild.get('markindent') &&
                  ((_lines = lastChild._lines),
                  blockPrefixPattern.exec(
                    (function (lines) {
                      if (!lines || 0 == lines.length) return '';
                      for (var itemIndex = lines.length - 1; itemIndex >= 0; itemIndex--)
                        if (lines[itemIndex].trim().length > 0) return lines[itemIndex];
                      return '';
                    })(_lines),
                  ))
                    ? (length = lastChild.get('markindent') - lastChild._indent)
                    : totalIndent >= _indent + lastChild.get('markindent') + 4 &&
                      (length = length + lastChild._indent - 4 - lastChild.get('markindent')),
                    (lastChild._indent += length),
                    this.cur.set('subindent', lastChild._indent - lastChild._numLength),
                    lastChild.set('subindent', lastChild._indent - lastChild._numLength),
                    (currentTextSlice += textSlice.substring(0, length)),
                    (textSlice = textSlice.substring(length));
                } else
                  lastChild.set('subindent', Math.max(2, currentLength - lastChild._numLength));
              lastChild._indentDecided = !!currentMatch;
            }
            return lastChild._lineIndents.push(currentTextSlice), void v(lastChild, textSlice, !1);
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
              return (
                closeResult == BlockCloseResult.CLOSE_INCLUDE &&
                  this.cur._mark != match[1] &&
                  this.cur.set('patternEnd', match[0]),
                closeResult
              );
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
              let hasCommonIndent = !0;
              for (let lineText of this.cur._lines)
                if (0 != lineText.indexOf(searchValue)) {
                  hasCommonIndent = !1;
                  break;
                }
              hasCommonIndent &&
                ((this.cur._lines = this.cur._lines.map((text) => text.substr(searchValue.length))),
                this.cur.set('userIndent', searchValue));
            }
            this.cur.set('text', this.cur._lines.join('\n')),
              this.cur.set('empty', !this.cur._lines.length),
              endOfInput && this.cur.set('noCloseTag', !0),
              (this.cur._mark = void 0),
              (this.cur._lines = void 0);
            var nextLine = this.lines[this.ln + 1];
            void 0 !== nextLine &&
              nextLine.match(whitespaceLinePattern) &&
              (this.cur.set('tail', 1), this.ln++);
          },
        },
        code: {
          shouldClose: function (text) {
            return text.match(indentedCodeLinePattern)
              ? BlockCloseResult.NOT_CLOSE
              : text.trim().length
                ? BlockCloseResult.CLOSE_EXCLUDE
                : this.cur._lines.length > 1 && !this.cur._lines.last().trim().length
                  ? BlockCloseResult.CLOSE_EXCLUDE
                  : BlockCloseResult.NOT_CLOSE;
          },
          onClose: function () {
            var text = this.lines[this.ln];
            text &&
              !text.trim().length &&
              this.cur._lines.push(text.replace(codeIndentPattern, '')),
              this.cur._lines.length > 1 &&
                (this.cur._lines.last().match(whitespaceLinePattern)
                  ? (this.cur.set('tail', 1),
                    this.cur._lines.pop(),
                    this.cur._lines.length > 1 &&
                      this.cur._lines.last().match(whitespaceLinePattern) &&
                      (this.cur._lines.pop(), this.ln--))
                  : this.cur.set('tail', 0)),
              this.cur.set('text', this.cur._lines.join('\n')),
              (this.cur.attributes.type = NodeType.fences),
              (this.cur._lines = void 0);
          },
          onContinue: function (text) {
            this.cur._lines.push(text.replace(codeIndentPattern, ''));
          },
        },
      };
    function le(text, unusedParameter2, expectedColumns) {
      function i(cells) {
        return (
          (cells[0] || '').trim().length || (cells = cells.subarray(1)),
          (cells.last() || '').trim().length || (cells = cells.subarray(0, cells.length - 1)),
          cells
        );
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
      for (var interruptPattern of interruptPatterns) if (interruptPattern.exec(text)) return null;
      if (-1 == text.indexOf('|'))
        for (var interruptPattern of [
          horizontalRulePattern,
          tocMarkerPattern,
          tocAttributePattern,
          wikiTocMarkerPattern,
          tocOptionsPattern,
        ])
          if (interruptPattern.exec(text)) return null;
      if (
        ((text = text.replace(
          /(^|[^\\])((`+)([\s\S]*?[^`])\3(?!`))/g,
          function (unusedParameter1, prefixText, codeText) {
            return (
              currentItems.push(codeText),
              [prefixText, codeStartMarker, ++placeholderIndex - 1, codeEndMarker].join('')
            );
          },
        )),
        File.option.enableInlineMath &&
          ((placeholderIndex = 0),
          (text = text
            .replace(/\\\$/g, '')
            .replace(
              /(^|[^\\])((\$+)([\s\S]*?[^$])\3(?!\$))/g,
              function (unusedParameter1, inputText, callbackText) {
                return (
                  localItems.push(callbackText.replace(/\uE07D/g, '\\$')),
                  placeholderIndex++,
                  [
                    inputText.replace(/\uE07D/g, '\\$'),
                    mathStartMarker,
                    placeholderIndex - 1,
                    mathEndMarker,
                  ].join('')
                );
              },
            ))),
        (items = (text = text
          .replace(/\\\\/g, escapeMarkers.ESCAPE_ESCAPE)
          .replace(/\\\|/g, escapeMarkers.ESCAPE_VLINE)
          .replace(/\\\ /g, escapeMarkers.ESCAPE_SPACE)).split(pipePattern) || [text]),
        '|' == text.trim() || !text.trim())
      )
        return null;
      if (
        ((items = i(items)),
        File.option.enableInlineMath &&
          ((text = text.replace(
            /\uE071(\d+)\uE072/g,
            function (unusedParameter1, placeholderIndex) {
              return localItems[placeholderIndex - 0];
            },
          )),
          items.length < expectedColumns))
      ) {
        var splitCells = i(text.split(pipePattern));
        splitCells.length == expectedColumns && (items = splitCells);
      }
      for (placeholderIndex = items.length; placeholderIndex < expectedColumns; placeholderIndex++)
        items.push('');
      return items.map(function (inputText) {
        return (currentText = inputText
          .replace(/\uE022/g, '\\ ')
          .replace(new RegExp('', 'g'), '\\$')
          .replace(/\uE071(\d+)\uE072/g, function (unusedParameter1, placeholderIndex) {
            return localItems[placeholderIndex - 0];
          })
          .replace(/\uE07A(\d+)\uE07B/g, function (unusedParameter1, placeholderIndex) {
            return currentItems[placeholderIndex - 0];
          }))
          ? currentText
              .replace(new RegExp(escapeMarkers.ESCAPE_ESCAPE, 'g'), '\\\\')
              .replace(new RegExp(escapeMarkers.ESCAPE_VLINE, 'g'), '\\|')
          : currentText;
        var currentText;
      });
    }
    var ce = function (inputText, parentNode, documentMap, oldNode, parseSkips) {
      activeListMarkerPatterns = File.option.strictMarkdown
        ? topLevelListMarkerPatterns
        : listMarkerPatterns;
      var text = inputText;
      (this.remap =
        File.shouldRemapPunctuation() &&
        (parseSkips.enableRemap || (oldNode && oldNode.cid == File.editor.focusCid))),
        'string' == typeof inputText &&
          ((text = inputText.split(lineEndingPattern)),
          '\n' === inputText.charCodeAt(inputText.length - 1) && (textLength -= 1));
      var textLength = text.length;
      for (
        this.lines = text,
          (function (parserState, parent, documentMap, oldNode, skips) {
            (parserState.parent = parent),
              (parserState.cur = null),
              (parserState.skips = skips),
              (parserState.ln = 0),
              (parserState.blocks = []),
              (parserState.oldNode = oldNode),
              (parserState.nodeMap = parent || oldNode),
              (parserState.nodeMap =
                (parserState.nodeMap ? parserState.nodeMap.get('in') : documentMap) || documentMap),
              (tabReplacement = ' '.repeat(File.option.indentSize));
          })(this, parentNode, documentMap, oldNode, parseSkips),
          this.skips.enableMetaBlock = this.skips.enableMetaBlock && !parentNode;
        this.ln <= textLength;
        this.ln++
      )
        de.call(this, text[this.ln], textLength);
      for (var documentNode = this.blocks.last(); documentNode; )
        (parentNode && 0 != documentNode.get('tail')) || documentNode.unset('tail'),
          (documentNode = documentNode.getLastChild());
      return this;
    };
    function de(text, lineCount) {
      var match,
        currentDocumentNode,
        blockRule,
        endOfInput = this.ln >= lineCount;
      function c(documentNode) {
        if (
          DocumentNode.isType(this.cur, NodeType.paragraph) &&
          this.cur._lines &&
          1 == this.cur._lines.length &&
          this.cur._lines[0].match(whitespaceLinePattern)
        )
          return (
            function (documentNode) {
              this.blocks.remove(documentNode), documentNode.remove();
            }.call(this, this.cur),
            (this.cur = null),
            documentNode.set('ahead', 1),
            !0
          );
      }
      function u(documentNode) {
        var nextLine = this.lines[this.ln + 1];
        if (void 0 !== nextLine && nextLine.match(whitespaceLinePattern))
          return this.ln++, documentNode.set('tail', 1), !0;
        void 0 !== nextLine && documentNode.set('tail', 0);
      }
      function p(documentNode, keepCurrent) {
        var userIndent,
          resultNode = (documentNode = documentNode || this.cur);
        this.oldNode && !this.blocks.length
          ? (this.oldNode !== documentNode &&
              ((userIndent = documentNode.get('userIndent')),
              this.oldNode.appendChildrenTillEnd(documentNode.getFirstChild()),
              this.oldNode.copyContentFrom(documentNode),
              this.oldNode.set('userIndent', userIndent),
              documentNode._lines && (this.oldNode._lines = documentNode._lines),
              documentNode.remove()),
            this.blocks.push(this.oldNode),
            (resultNode = this.oldNode))
          : (this.parent
              ? this.parent.appendChild(documentNode)
              : this.blocks.length
                ? this.blocks.last().addAfter(documentNode)
                : (console.sendError('parse error', 'error', documentNode.getText()),
                  documentNode.set('parent', this.parent),
                  documentNode.set('in', this.nodeMap),
                  documentNode.set('attachTo', this.nodeMap)),
            this.blocks.push(documentNode)),
          (this.cur = keepCurrent ? resultNode : null);
      }
      function f(keepCurrent, endOfInput) {
        this.cur &&
          (!DocumentNode.isType(this.cur, NodeType.paragraph) || (this.cur._lines || []).length
            ? (blockRule.onClose && blockRule.onClose.call(this, endOfInput),
              (endOfInput || this.ln < lineCount - 1) &&
                void 0 == this.cur.get('tail') &&
                this.cur.set('tail', 0),
              p.call(this, this.cur, keepCurrent))
            : (this.cur = null));
      }
      function m(style, pattern, _mark) {
        var documentNodeInstance = new DocumentNode({
          type: NodeType.list,
          style: style,
          in: this.nodeMap,
          pattern: pattern,
        });
        style == DocumentNode.ListType.ol
          ? (documentNodeInstance.set('start', _mark),
            (documentNodeInstance._mark = (/[\.\)]/.exec(pattern) || [])[0]))
          : (documentNodeInstance._mark = _mark),
          c.call(this, documentNodeInstance),
          f.call(this, void 0, !0),
          (this.cur = documentNodeInstance);
      }
      function g(allowNonPipeTable) {
        var separatorPattern = allowNonPipeTable
          ? tableSeparatorPattern
          : leadingPipeSeparatorPattern;
        if ((headerCells = le(text))) {
          var headerCells,
            rowCells,
            rowText,
            itemIndex = this.ln + 1,
            linesLength = this.lines.length,
            currentText = this.lines[itemIndex],
            items = null,
            currentItems = [text, currentText];
          if (itemIndex < linesLength && this.lines[itemIndex].match(separatorPattern))
            for (
              items = [], itemIndex++;
              itemIndex < linesLength &&
              ((rowCells = null),
              (rowCells = le((rowText = this.lines[itemIndex]), 0, headerCells.length)));
              itemIndex++
            )
              currentItems.push(rowText), items.push(rowCells);
          if (items)
            return (
              (currentText = currentText.replace(/^ *\||\| *$/g, '').split(pipePattern)).length ==
                headerCells.length &&
              (y.call(
                this,
                headerCells,
                currentText,
                items,
                itemIndex - 1,
                allowNonPipeTable,
                currentItems,
              ),
              !0)
            );
        }
        return !1;
      }
      function v(pattern) {
        (currentDocumentNode = new DocumentNode({
          type: NodeType.toc,
          in: this.nodeMap,
          pattern: pattern,
        })),
          c.call(this, currentDocumentNode),
          u.call(this, currentDocumentNode),
          f.call(this, !0),
          p.call(this, currentDocumentNode);
      }
      function y(headerCells, alignmentCells, items, lastLineIndex, isNonPipeTable, sourceText) {
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
              if (!alignmentCells || !rows) return !0;
              for (var itemIndex = 0; itemIndex < headerCells.length; itemIndex++) {
                var currentLength = (headerCells[itemIndex] || '').length;
                if (!(currentLength > 40)) {
                  var displayWidth = utilities.wcswidth(headerCells[itemIndex]);
                  if (
                    currentLength != (alignmentCells[itemIndex] || '').length &&
                    displayWidth != utilities.wcswidth(alignmentCells[itemIndex])
                  )
                    return !1;
                  for (
                    var currentItemIndex = 0;
                    currentItemIndex < rows.length;
                    currentItemIndex++
                  ) {
                    var cellText = (rows[currentItemIndex] || [])[itemIndex] || '';
                    if (
                      !(cellText.length > 40) &&
                      currentLength !== cellText.length &&
                      displayWidth != utilities.wcswidth(cellText)
                    )
                      return !1;
                  }
                }
              }
              return !0;
            })(headerCells, alignmentCells, items);
        function y(documentNode, cells) {
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
        documentNodeInstance.set(
          'alignText',
          discardCellMargins ? void 0 : alignmentCells.slice(0),
        ),
          !pass_format &&
            alignmentCells &&
            items &&
            documentNodeInstance.set('userText', sourceText),
          (alignmentCells = alignmentCells || Array(headerCells.length).fill()),
          (items = items || [[]]);
        for (var localItemIndex = 0; localItemIndex < length; localItemIndex++)
          (alignmentCells[localItemIndex] = alignmentCells[localItemIndex] || ''),
            alignmentCells[localItemIndex].match(/^ *-+: *$/)
              ? (alignmentCells[localItemIndex] = 'right')
              : alignmentCells[localItemIndex].match(/^ *:-+: *$/)
                ? (alignmentCells[localItemIndex] = 'center')
                : alignmentCells[localItemIndex].match(/^ *:-+ *$/)
                  ? (alignmentCells[localItemIndex] = 'left')
                  : (alignmentCells[localItemIndex] = null);
        documentNodeInstance.set('align', alignmentCells),
          (before = y.call(this, documentNodeInstance, headerCells)),
          items.forEach(function (item) {
            before = y.call(this, documentNodeInstance, item);
          }, this),
          c.call(this, documentNodeInstance),
          f.call(this),
          lastLineIndex && (this.ln = lastLineIndex),
          u.call(this, documentNodeInstance),
          p.call(this, documentNodeInstance),
          (this.cur = null);
      }
      if (this.cur) {
        blockRule = blockRules[this.cur.get('type')];
        var closeResult = !endOfInput && blockRule.shouldClose.call(this, text);
        if (closeResult > 0 || endOfInput) {
          if ((f.call(this, !1, endOfInput), 2 == closeResult)) return;
        } else if (!closeResult)
          return void (blockRule.onContinue && blockRule.onContinue.call(this, text));
      }
      if (!endOfInput) {
        if (!this.skips.old_code && (match = indentedCodeLinePattern.exec(text)))
          return this.skips.fromP
            ? (this.cur ||
                ((this.cur = new DocumentNode({ type: NodeType.paragraph, in: this.nodeMap })),
                (this.cur._lines = [])),
              void this.cur._lines.push(text))
            : void (DocumentNode.isType(this.cur, NodeType.code) && blockRule
                ? blockRule.onContinue && blockRule.onContinue.call(this, text)
                : DocumentNode.isType(this.cur, NodeType.paragraph) &&
                    (this.cur._lines.last() || '').trim().length
                  ? this.cur._lines.push(text)
                  : ((currentDocumentNode = new DocumentNode({
                      type: NodeType.code,
                      pattern: match[1],
                      in: this.nodeMap,
                    })),
                    c.call(this, currentDocumentNode),
                    (currentDocumentNode._lines = [match[2]]),
                    f.call(this),
                    (this.cur = currentDocumentNode)));
        if (
          (match = setextHeadingPattern.exec(text)) &&
          DocumentNode.isType(this.cur, NodeType.paragraph) &&
          !utilities.isNullOrBlank(this.cur._lines.last())
        )
          return (
            (currentDocumentNode = new DocumentNode({
              type: NodeType.heading,
              depth: '=' == match[1] ? 1 : 2,
              text: this.cur._lines.pop(),
              pattern: '{0}\n' + text,
              in: this.nodeMap,
            })),
            c.call(this, currentDocumentNode),
            f.call(this),
            u.call(this, currentDocumentNode),
            void p.call(this, currentDocumentNode)
          );
        var tryNonPipeTable = !0;
        if (text.match(this.remap ? unicodeBlockStartPattern : blockStartPattern)) {
          if (
            (match = (File.option.strictMarkdown ? spacedHeadingPattern : headingPattern).exec(
              text,
            ))
          )
            return (
              (currentDocumentNode = new DocumentNode({
                type: NodeType.heading,
                depth: match[2].length,
                text: match[3],
                pattern:
                  (this.skips.enableStartMatch ? match[1].replace(/#$/, '# ') : match[1]) +
                  '{0}' +
                  (match[4] || ''),
                in: this.nodeMap,
              })),
              c.call(this, currentDocumentNode),
              u.call(this, currentDocumentNode),
              f.call(this),
              void p.call(this, currentDocumentNode)
            );
          if ((match = footnoteDefinitionPattern.exec(text)))
            return (
              (currentDocumentNode = new DocumentNode({
                type: NodeType.def_footnote,
                ref: match[1],
                pattern: match[2],
                text: match[3],
                in: this.nodeMap,
              })),
              c.call(this, currentDocumentNode),
              u.call(this, currentDocumentNode),
              f.call(this, !0),
              void p.call(this, currentDocumentNode)
            );
          if ((match = referenceDefinitionPattern.exec(text)))
            return (
              (currentDocumentNode = new DocumentNode({
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
              })),
              c.call(this, currentDocumentNode),
              u.call(this, currentDocumentNode),
              f.call(this, !0),
              void p.call(this, currentDocumentNode)
            );
          if (this.skips.fromP)
            return (
              this.cur ||
                ((this.cur = new DocumentNode({ type: NodeType.paragraph, in: this.nodeMap })),
                (this.cur._lines = [])),
              void this.cur._lines.push(text)
            );
          if (this.skips.enableStartMatch && (match = tableRowPattern.exec(text))) {
            var rowCells = le(text);
            if (rowCells && rowCells.length > 1) return void y.call(this, rowCells);
          }
          if ((match = blockquotePattern.exec(text))) {
            if (!/^(\s*>){10,}/.exec(text)) {
              if (
                ((currentDocumentNode = new DocumentNode({
                  type: NodeType.blockquote,
                  in: this.nodeMap,
                  pattern: match[1],
                })),
                c.call(this, currentDocumentNode),
                (currentDocumentNode._indent = match[1].replace(/^[ \u00A0]*>/, '').length),
                File.option.enableAlert)
              ) {
                let localText =
                  (/^\s*\[\!(note|warning|important|tip|caution)\]\s*/i.exec(match[2]) || [])[1] ||
                  '';
                localText && currentDocumentNode.set('alert', localText.toLowerCase());
              }
              return (
                (currentDocumentNode._lines = []),
                (currentDocumentNode._lineIndents = []),
                f.call(this),
                (this.cur = currentDocumentNode),
                void blockRules.blockquote.onContinue.call(this, text)
              );
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
            if (!(acceptBlockStart = this.skips.enableStartMatch || !1))
              for (; closingLineIndex < currentLinesLength; closingLineIndex++)
                if (
                  this.lines[closingLineIndex].match(metadataFencePattern) ||
                  this.lines[closingLineIndex].match(metadataEndPattern)
                ) {
                  patternEnd = (acceptBlockStart = closingLineIndex > this.ln + 1)
                    ? this.lines[closingLineIndex]
                    : void 0;
                  break;
                }
            if (acceptBlockStart)
              return (
                (currentDocumentNode = new DocumentNode({
                  type: NodeType.meta_block,
                  in: this.nodeMap,
                  text: this.lines.slice(this.ln + 1, closingLineIndex).join('\n'),
                  patternEnd: patternEnd,
                })),
                c.call(this, currentDocumentNode),
                (this.ln = closingLineIndex),
                u.call(this, currentDocumentNode),
                f.call(this, !0),
                void p.call(this, currentDocumentNode)
              );
          }
          if (this.remap && text.match(unicodeDashPattern)) {
            var remappedLine = text.replace(/\u2013/g, '--').replace(/\u2014/g, '---');
            if ((match = horizontalRulePattern.exec(remappedLine)))
              return (
                (currentDocumentNode = new DocumentNode({
                  type: NodeType.hr,
                  pattern:
                    typeof globalThis.__MARKLYRA_LITERAL_RULE__ === 'function'
                      ? globalThis.__MARKLYRA_LITERAL_RULE__(remappedLine, remappedLine.trim())
                      : remappedLine.trim(),
                  in: this.nodeMap,
                })),
                c.call(this, currentDocumentNode),
                u.call(this, currentDocumentNode),
                f.call(this, !0),
                void p.call(this, currentDocumentNode)
              );
          }
          if ((match = horizontalRulePattern.exec(text)))
            return (
              (currentDocumentNode = new DocumentNode({
                type: NodeType.hr,
                pattern:
                  typeof globalThis.__MARKLYRA_LITERAL_RULE__ === 'function'
                    ? globalThis.__MARKLYRA_LITERAL_RULE__(text, text.trim())
                    : text.trim(),
                in: this.nodeMap,
              })),
              c.call(this, currentDocumentNode),
              u.call(this, currentDocumentNode),
              f.call(this, !0),
              void p.call(this, currentDocumentNode)
            );
          if ((match = listPrefixPatterns.ul.exec(text)))
            return tocOptionsPattern.exec(this.lines[this.ln + 1] || '')
              ? (v.call(this, text + '\n' + this.lines[this.ln + 1]), void this.ln++)
              : (m.call(this, DocumentNode.ListType.ul, match[2], match[3]),
                void (blockRule = blockRules[NodeType.list]).onContinue.call(
                  this,
                  text,
                  match[0],
                  match[1].length,
                ));
          if ((match = listPrefixPatterns.ol.exec(text))) {
            var listStartText = match[0].match(/\d+/)[0].replace(/^1$/, '');
            if (
              !File.option.strictNumberStartOnNewLine ||
              !listStartText ||
              listStartText.trim() - 0 == 1
            )
              return (
                m.call(
                  this,
                  DocumentNode.ListType.ol,
                  match[0].replace(/\d+/, '{0}'),
                  listStartText,
                ),
                void (blockRule = blockRules[NodeType.list]).onContinue.call(
                  this,
                  text,
                  match[0],
                  match[1].length,
                )
              );
          }
          var legacyMath =
            !File.option.noLegacyMath && (match = text.match(openingMathBracketPattern));
          if (
            (legacyMath || (match = text.match(displayMathFencePattern))) &&
            ((tryNonPipeTable = !1), !this.skips.math_block)
          ) {
            (closingLineIndex = this.ln + 1), (currentLinesLength = this.lines.length);
            var mathTagBefore,
              mathTagAfter,
              acceptBlockStart = this.skips.enableStartMatch || !1;
            if (((mathTagBefore = match[1]), !acceptBlockStart))
              for (; closingLineIndex < currentLinesLength; closingLineIndex++)
                if (
                  (match = this.lines[closingLineIndex].match(
                    legacyMath ? closingMathBracketPattern : displayMathFencePattern,
                  ))
                ) {
                  (mathTagAfter = match[1]), (acceptBlockStart = !0);
                  break;
                }
            if (acceptBlockStart)
              return (
                (currentDocumentNode = new DocumentNode({
                  type: NodeType.math_block,
                  in: this.nodeMap,
                  legacyMath: legacyMath,
                  tagBefore: legacyMath ? '' : mathTagBefore,
                  tagAfter: legacyMath ? '' : mathTagAfter,
                  text: this.lines.slice(this.ln + 1, closingLineIndex).join('\n'),
                })),
                c.call(this, currentDocumentNode),
                (this.ln = closingLineIndex),
                u.call(this, currentDocumentNode),
                f.call(this, !0),
                void p.call(this, currentDocumentNode)
              );
          }
          if ((match = openingFencePattern.exec(text)))
            return (
              ((currentDocumentNode = new DocumentNode({
                type: NodeType.fences,
                lang: match[3],
                pattern: match[1] + '{0}',
                in: this.nodeMap,
              }))._mark = match[2]),
              (currentDocumentNode._lines = []),
              c.call(this, currentDocumentNode),
              f.call(this),
              void (this.cur = currentDocumentNode)
            );
          var tocPattern = this.remap ? unicodeTocPattern : tocMarkerPattern;
          if (text.match(tocPattern))
            return void v.call(this, text.replace(/[\[\u3010]/, '[').replace(/[\]\u3011]/, ']'));
          if (text.match(tocAttributePattern)) return void v.call(this, text);
          if (text.match(wikiTocMarkerPattern)) return void v.call(this, text);
          if (g.call(this, !1)) return;
          if (File.option.blockHTML && (match = htmlBlockOpenPattern.exec(text))) {
            (currentDocumentNode = new DocumentNode({
              type: NodeType.html_block,
              in: this.nodeMap,
              style: (match[1] || '').toLowerCase(),
              depth: 0,
            })),
              c.call(this, currentDocumentNode),
              f.call(this, !0);
            var previousBlock = this.cur || (this.blocks || []).last();
            if (
              previousBlock &&
              DocumentNode.isType(previousBlock, NodeType.html_block) &&
              0 === previousBlock.get('tail') &&
              !currentDocumentNode.get('ahead')
            ) {
              previousBlock !== this.oldNode && previousBlock.detach(),
                this.blocks.pop(),
                (this.cur = previousBlock),
                (previousBlock._lines = previousBlock.get('text').split(/\n/));
              var searchValue = previousBlock.get('displayStyle') || previousBlock.get('style');
              htmlBlocks.HIDDEN_TYPE.indexOf(searchValue) > -1 && (searchValue = match[1]),
                previousBlock.set('displayStyle', searchValue),
                previousBlock.unset('tail'),
                previousBlock.set('style', match[1]),
                previousBlock.set('depth', 0),
                currentDocumentNode.remove(),
                (currentDocumentNode = previousBlock);
            } else
              c.call(this, currentDocumentNode),
                (this.cur = currentDocumentNode),
                (this.cur._lines = []);
            return (
              (blockRule = blockRules[NodeType.html_block]),
              void (blockRules.html_block.shouldClose.call(this, text) ==
              BlockCloseResult.CLOSE_INCLUDE
                ? (f.call(this, !0), u.call(this, this.cur), (this.cur = null))
                : ((this.cur._lines = this.cur._lines || []), this.cur._lines.push(text)))
            );
          }
        }
        (tryNonPipeTable && !this.skips.fromP && g.call(this, !0)) ||
          (this.cur ||
            ((this.cur = new DocumentNode({ type: NodeType.paragraph, in: this.nodeMap })),
            (this.cur._lines = [])),
          DocumentNode.isType(this.cur, NodeType.paragraph)
            ? this.cur._lines.push(text)
            : blockRule && blockRule.onContinue && blockRule.onContinue.call(this, text));
      }
    }
    (DocumentNode.parseFrom = function (text, documentMap, parseOptions, skipHtml) {
      return (
        (parseOptions = parseOptions || {}),
        new DocumentNode({
          type: NodeType.raw_edit,
          in: documentMap,
          attachTo: parseOptions.noTop ? null : documentMap,
          text: text,
        }).parseFrom(parseOptions, void 0, skipHtml)
      );
    }),
      (DocumentNode.prototype.parseFrom = function (parseOptions, text, skipHtml) {
        if (
          ((parseOptions = parseOptions || {}),
          DocumentNode.isType(this.get('parent'), NodeType.table_row))
        )
          return (
            this.set('type', NodeType.table_cell),
            this.set(
              'text',
              this.safeGetStrAttr('text')
                .replace(/\n|\r/gi, '')
                .replace(/([^\\])\|/gi, '$1|'),
            ),
            [!skipHtml && this.toHTML(), [this]]
          );
        if (
          !DocumentNode.isType(
            this,
            NodeType.paragraph,
            NodeType.raw_edit,
            NodeType.html_block,
            NodeType.list_item,
          )
        )
          return [!skipHtml && this.toHTML(), [this]];
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
        if (
          ((text = text || currentDocumentNode.get('text')),
          File.option.ignoreLineBreak && (text = text.replace(/\u00a0/g, ' ')),
          (parseSkips.enableMetaBlock = this.get('attachTo') && !this.get('before')),
          (parseSkips.old_code = !1 !== parseSkips.old_code),
          this.isBlock(!0))
        ) {
          var previousNode = this.get('before'),
            nextNode = this.get('after'),
            blocks = new ce(
              text,
              null,
              currentDocumentNode.get('in'),
              currentDocumentNode,
              parseSkips,
            ).blocks;
          return blocks.length <= 1
            ? [!skipHtml && this.toHTML(), [this]]
            : (blocks[0].set('before', previousNode),
              blocks.last().set('after', nextNode),
              [!skipHtml && documentModel.NodeCollectionUtils.toHTML(blocks), blocks]);
        }
      });
    var ue = function (tokens) {
        var lastToken = tokens.last();
        if (lastToken) return lastToken.text || '';
      },
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
    function pe(lexerOptions, decorateToken, content) {
      (this.options = lexerOptions || Te({}, parserApi.defaults)),
        (this.options.decorate = decorateToken || inlineDecoration.decorate),
        (this.options.context = content || this),
        (this.rules = rules.normal),
        this.options.gfm
          ? this.options.breaks
            ? (this.rules = rules.breaks)
            : (this.rules = rules.gfm)
          : this.options.pedantic && (this.rules = rules.pedantic),
        File.option.enableHighlight && (this.rules.escape2 = /^[\uE013\uE014\uE015\uE018\uE020]/),
        File.option.enableSuperscript
          ? File.option.enableHighlight
            ? (this.rules.escape = /^\\([\\:`*{}\[\]()#+\-.!_>$|<~"'&^=])/)
            : (this.rules.escape = /^\\([\\:`*{}\[\]()#+\-.!_>$|<~"'&^])/)
          : File.option.enableHighlight &&
            (this.rules.escape = /^\\([\\:`*{}\[\]()#+\-.!_>$|<~"'&=])/);
    }
    (rules.comment_ext = /^<!(--|\u2013|\u2014)[\s\S]*?(--|\u2013|\u2014)>/),
      (rules.link_ext =
        /^[\[\u3010]((?:[\[\u3010][^\]\u3011]*[\u3011\]]|[^\[\]\u3010\u3011])*)[\]\u3011]\(<?((?:\([^)]*\)|[^()])*?)>?[ \t]*((["'])(?:(.|\n)*?)["'][ \t]*)?\)/),
      (rules.image_ext =
        /(^\![\[\u3010]((?:[\[\u3010][^\]\u3011]*[\]\u3011]|[^\[\]\u3010\u3011])*)[\]\u3011][\(\uff08])((.|\n)*)([\)\uff09](?:\s*{([^{}\(\)\uff08\uff09]*)})?)/),
      (rules.attr_ext = /^{( *([#.][-\w_\uE006]+ *|[-\w_\uE006]+=[-\w_"'«»‘’‚‛„‟‹›\uE006]+ *)+)}/),
      (rules._inside = /(?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*/),
      (rules._inside_ext =
        /(?:[\[\u3010][^\]\u3011]*[\]\u3011]|[^\[\]\u3010\u3011]|[\]\u3011](?=[^\[\u3010]*[\]\u3011]))*/),
      (rules.tag_ext =
        /^(?:<([A-Za-z][A-Za-z0-9-]*)(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|[’‚‛'‹›][^'’‚‛]*['’‚‛‹›]|["“«»„‟][^"“«»„‟]*["“«»„‟]))?)*\s*(\/?)>|<(\/)([A-Za-z][A-Za-z0-9-]*)\s*[>]|[<][?].*?[?][>]|<![A-Z]+\s+[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>)/),
      (rules.reflink = ke(rules.reflink)('inside', rules._inside)()),
      (rules.normal = Te({}, rules)),
      (rules.pedantic = Te({}, rules.normal, {
        strong: /^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,
        em: /^_(?=\S)([\s\S]*?\S)_(?!_)|^\*(?=\S)([\s\S]*?\S)\*(?!\*)/,
      })),
      (rules.gfm = rules.normal),
      (rules.breaks = Te({}, rules.gfm, { text: ke(rules.gfm.text)('{2,}', '*')() })),
      (pe.rules = rules);
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
    function xe(text) {
      return text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, function (codeText) {
        return CODE++, map.set(CODE + '', codeText), escapeMarkers.CODE + CODE + escapeMarkers.CODE;
      });
    }
    function Ce(text, keepStoredCode) {
      return text.replace(/\uE023(\d+)\uE023/g, function (unusedParameter1, placeholderKey) {
        var codeText = map.get(placeholderKey) || '';
        return !keepStoredCode && map.delete(placeholderKey), codeText;
      });
    }
    function Fe(text, keepStoredCode) {
      return Ce(
        text.replace(/[\uE006-\uE020]/g, function (marker) {
          return escapedCharacterMap[marker]
            ? '\\' + escapedCharacterMap[marker]
            : literalCharacterMap[marker] || '';
        }),
        keepStoredCode,
      ).replace(/\uE031/g, '*');
    }
    pe.skipLink = { autolink: 1, url: 1, link: 1, reflink: 1 };
    var Se = function (tokens) {
      for (var itemIndex = tokens.length - 1; itemIndex >= 0; itemIndex--)
        if (tokens[itemIndex].type == NodeType.pants) {
          if ('open_double' == tokens[itemIndex].desc) return !0;
          if ('close_double' == tokens[itemIndex].desc) return !1;
        }
      return !1;
    };
    function ke(inputSource, t) {
      return (
        (inputSource = inputSource.source),
        (t = t || ''),
        function n(i, source) {
          return i
            ? ((source = (source = source.source || source).replace(/(^|[^\[])\^/g, '$1')),
              (inputSource = inputSource.replace(i, source)),
              n)
            : new RegExp(inputSource, t);
        }
      );
    }
    function Ee() {}
    function Te(e) {
      for (var t, n, itemIndex = 1; itemIndex < arguments.length; itemIndex++)
        for (n in (t = arguments[itemIndex]))
          Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
      return e;
    }
    (pe.prototype.output = function (
      textSlice,
      decorateToken,
      alreadyPreprocessed,
      element,
      renderState,
    ) {
      (decorateToken = decorateToken || this.options.decorate),
        (textSlice = textSlice || ''),
        ((element = Te(element || {}, this.options.skipOp)).attr = !1 !== element.attr),
        (element.markLinebreak = !0),
        File.option.enableInlineMath || (element.inline_math = !0),
        File.option.enableSubscript || (element.subscript = !0),
        File.option.enableSuperscript || (element.superscript = !0),
        File.option.enableHighlight || (element.highlight = !0);
      var currentText,
        linkTarget,
        currentMatch,
        length,
        token,
        remapPunctuation =
          (renderState = renderState || { cursorDiff: [], openQuote: null, hasContent: !1 })
            .isCur || File.shouldRemapPunctuation(),
        cursorDeltas = renderState.cursorDiff || [],
        y = function (offset, delta) {
          cursorDeltas[offset] = (cursorDeltas[offset] || 0) + delta;
        },
        itemIndex = 0,
        items = [],
        options = this.options,
        forEditor = decorateToken == inlineDecoration.decorate,
        forPrint = options.forPrint;
      function S(inputItems, text) {
        var lastToken = inputItems.last();
        lastToken && lastToken.type === NodeType.plain
          ? (lastToken.text += text)
          : inputItems.push({ type: NodeType.plain, text: text });
      }
      function k(tokens, startIndex, name) {
        for (
          var tagDepth = 1, currentItemIndex = startIndex;
          currentItemIndex < tokens.length;
          currentItemIndex++
        )
          if (
            tokens[currentItemIndex].name == name &&
            (tokens[currentItemIndex].pos < 0 && tagDepth--,
            tokens[currentItemIndex].pos > 0 && tagDepth++,
            !tagDepth)
          )
            return currentItemIndex;
        return 0;
      }
      function E(tokens) {
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
                closingTagIndex = k(tokens, currentItemIndex + 1, text);
              if (closingTagIndex > 0) {
                (renderedHtml += decorateToken(
                  {
                    type: NodeType.html_inline,
                    inner: E(tokens.subarray(currentItemIndex + 1, closingTagIndex)),
                    name: text.toLowerCase(),
                    before: token.text,
                    after: tokens[closingTagIndex].text,
                    isMeta: !isInlineTag,
                  },
                  options,
                  renderState,
                )),
                  (currentItemIndex = closingTagIndex);
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
          ((alreadyPreprocessed = !0), S(items, textSlice), (textSlice = '')),
          alreadyPreprocessed ||
            (textSlice = (function (text, markUrls) {
              for (
                var localMatch, intrawordUnderscorePattern = /([a-z0-9])_([a-z0-9])/gi;
                (localMatch = intrawordUnderscorePattern.exec(text));
              )
                (text =
                  text.substring(0, localMatch.index + 1) +
                  escapeMarkers.UNDER_CHAR +
                  text.substring(localMatch.index + 2)),
                  intrawordUnderscorePattern.lastIndex && intrawordUnderscorePattern.lastIndex--;
              return (
                (text = text
                  .replace(/\\[\*_=\]\\]/gi, function (escapeSequence) {
                    return escapeSequenceMap[escapeSequence] || escapeSequence;
                  })
                  .replace(
                    /([^\\`]|^)(`+)([\s\S]*?[^`])\2(?!`)/g,
                    function (inputText, prefixText) {
                      return (
                        CODE++,
                        map.set(CODE + '', inputText.substr(prefixText.length)),
                        prefixText + escapeMarkers.CODE + CODE + escapeMarkers.CODE
                      );
                    },
                  )),
                markUrls &&
                  text.length < 2e4 &&
                  ((autolinkPattern.lastIndex = 0),
                  (text = text.replace(
                    autolinkPattern,
                    function (URL_START, mailtoPrefix, unusedParameter3, urlSuffix) {
                      return ('' + mailtoPrefix + urlSuffix).indexOf('/') > -1
                        ? escapeMarkers.URL_START + URL_START + escapeMarkers.URL_MAY_END
                        : escapeMarkers.URL_START + URL_START + escapeMarkers.URL_END;
                    },
                  ))),
                text
              );
            })(textSlice, !element.url && !File.option.noAutoLink));
        textSlice;
      )
        if (element.markLinebreak && (currentMatch = /^\r?\n/.exec(textSlice)))
          (itemIndex += currentMatch[0].length),
            (textSlice = textSlice.substring(currentMatch[0].length)),
            items.push({
              type: textSlice || element.emptyline ? NodeType.softbreak : NodeType.emptyline,
              text: '\n',
              inner: '\n',
            });
        else if ((currentMatch = this.rules.escape2.exec(textSlice)))
          (itemIndex += currentMatch[0].length),
            (textSlice = textSlice.substring(currentMatch[0].length)),
            items.push({ type: NodeType.escape, text: escapedCharacterMap[currentMatch[0]] }),
            (renderState.hasContent = !0);
        else if (
          (!File.option.noLegacyMath &&
            (currentMatch = this.rules.legacy_inline_math.exec(textSlice)) &&
            ((itemIndex += (currentText = Fe(currentMatch[0], !0)).length),
            (textSlice = textSlice.substring(currentMatch[0].length)),
            items.push({
              type: NodeType.inline_math,
              legacyMath: currentMatch[3] ? '[' : '(',
              text: Fe(currentMatch[1] || currentMatch[2], !0),
            })),
          (currentMatch = this.rules.escape.exec(textSlice)))
        )
          (itemIndex += currentMatch[0].length),
            (textSlice = textSlice.substring(currentMatch[0].length)),
            items.push({ type: NodeType.escape, text: currentMatch[1] }),
            (renderState.hasContent = !0);
        else if (
          File.option.noAutoLink ||
          element.autolink ||
          !(currentMatch = this.rules.autolink.exec(textSlice))
        )
          if (element.url || !(currentMatch = this.rules.url.exec(textSlice)))
            if (
              (currentMatch = (remapPunctuation ? this.rules.comment_ext : this.rules.comment).exec(
                textSlice,
              ))
            )
              (itemIndex += length = (currentText = Ce(currentMatch[0])).length),
                (textSlice = textSlice.substring(currentMatch[0].length)),
                remapPunctuation &&
                  ((currentText = currentText.replace(/[\u2013\u2014]/g, '--')),
                  (cursorDeltas[itemIndex] = currentText.length - length)),
                items.push({
                  type: element.comment ? NodeType.tag : NodeType.comment,
                  text: currentText,
                });
            else if ((currentMatch = this.rules.br.exec(textSlice)))
              (itemIndex += currentMatch[0].length),
                (textSlice = textSlice.substring(currentMatch[0].length)),
                items.push({ type: NodeType.br, text: currentMatch[0] });
            else if (
              (currentMatch = (
                File.shouldRemapPunctuation() ? this.rules.tag_ext : this.rules.tag
              ).exec(textSlice))
            ) {
              var underlineMatch;
              if (!element.underline && (underlineMatch = this.rules.underline.exec(textSlice))) {
                (itemIndex += (currentText = Ce(underlineMatch[0])).length),
                  (textSlice = textSlice.substring(underlineMatch[0].length)),
                  items.push({
                    type: NodeType.underline,
                    inner: this.output(
                      currentText == underlineMatch[0]
                        ? underlineMatch[1]
                        : this.rules.underline.exec(currentText)[1],
                      decorateToken,
                      !0,
                      element,
                      renderState,
                    ),
                    text: currentText,
                  }),
                  (renderState.hasContent = !0);
                continue;
              }
              if (!element.imgtag && (underlineMatch = this.rules.imgtag.exec(textSlice))) {
                var localText = (currentText = Ce(underlineMatch[0]));
                remapPunctuation &&
                  (localText = localText
                    .replace(/(\w=)[«»“”„‟〝〟]/g, '$1"')
                    .replace(/(\w=)[‚‘’‛‹›]/g, "$1'")
                    .replace(/[»«”“〞]([\s\/>]|$)/g, '"$1')
                    .replace(/[’‛‘›‹＇]([\s\/>]|$)/g, "'$1"));
                var imageSource = (/src\s*=\s*(['"])((.|\n)*?)\1/.exec(localText) || [])[2];
                if (
                  (imageSource ||
                    (imageSource = (/src\s*=\s*([^\s'"]+)(\s|$)/.exec(localText) || [])[1]),
                  imageSource)
                ) {
                  (itemIndex += currentText.length),
                    (textSlice = textSlice.substring(underlineMatch[0].length));
                  var styleText = (/\sstyle\s*=\s*(['"])(.+?)\1/.exec(localText) || [])[2] || '',
                    width = (/(^|[^\w-])width\s*:\s*(.+?)(\s*;|$)/.exec(styleText) || [])[2],
                    height = (/(^|[^\w-])height*:\s*(.+?)(\s*;|$)/.exec(styleText) || [])[2],
                    zoom = (/(^|[^\w-])zoom*:\s*(.+?)(\s*;|$)/.exec(styleText) || [])[2],
                    align = (/\salign\s*=\s*(['"])(.+?)\1/.exec(localText) ||
                      /\salign\s*=\s*((.+?))[\s/>]/.exec(localText) ||
                      [])[2];
                  width ||
                    ((width = (/\swidth\s*=\s*(['"])(.+?)\1/.exec(localText) ||
                      /\swidth\s*=\s*((.+?))[\s/>]/.exec(localText) ||
                      [])[2]),
                    /\d\s*$/.exec(width || '') && (width += 'px;')),
                    height ||
                      ((height = (/\sheight\s*=\s*(['"])(.+?)\1/.exec(localText) ||
                        /\sheight\s*=\s*((.+?))[\s/>]/.exec(localText) ||
                        [])[2]),
                      /\d\s*$/.exec(height || '') && (height += 'px;')),
                    items.push({
                      type: NodeType.imgtag,
                      text: localText,
                      href: utilities.unescape(Fe(imageSource)),
                      width: width,
                      height: height,
                      zoom: zoom,
                      align: align,
                    });
                } else
                  (itemIndex += (currentText = Ce(currentMatch[0])).length),
                    (textSlice = textSlice.substring(currentMatch[0].length)),
                    (currentText = currentText
                      .replace(/(\w=)[«»“”„‟〝〟]/g, '$1"')
                      .replace(/(\w=)[‚‘’‛‹›]/g, "$1'")
                      .replace(/[»«”“〞]([\s\/>]|$)/g, '"$1')
                      .replace(/[’‛‘›‹＇]([\s\/>]|$)/g, "'$1")),
                    items.push({ type: NodeType.tag, text: Fe(currentText) });
                renderState.hasContent = !0;
                continue;
              }
              if (
                ((itemIndex += (currentText = Ce(currentMatch[0])).length),
                (textSlice = textSlice.substring(currentMatch[0].length)),
                (currentText = currentText
                  .replace(/(\w=)[«»“”„‟〝〟]/g, '$1"')
                  .replace(/(\w=)[‚‘’‛‹›]/g, "$1'")
                  .replace(/[»«”“〞]([\s\/>]|$)/g, '"$1')
                  .replace(/[’‛‘›‹＇]([\s\/>]|$)/g, "'$1")),
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
                  (currentMatch = /<\/ruby>/.exec(textSlice)))
              ) {
                var endOffset = currentMatch.index + currentMatch[0].length;
                (itemIndex += endOffset),
                  (currentText += textSlice.substring(0, endOffset)),
                  (textSlice = textSlice.substring(endOffset)),
                  (token = { type: NodeType.ruby, text: Fe(currentText) });
              } else token.text = Fe(currentText);
              items.push(token),
                (renderState.hasContent =
                  renderState.hasContent ||
                  -1 == htmlBlocks.NO_TEXT_BLOCK_TYPE.indexOf(token.name));
            } else if (
              ((renderState.hasContent = !0),
              element.alert && (currentMatch = this.rules.alert.exec(textSlice)))
            )
              (currentText = currentMatch[0]),
                this.options.forExport || (currentText = currentText.replace(/\n$/, '')),
                (itemIndex += length = currentText.length),
                (textSlice = textSlice.substring(currentText.length)),
                items.push({
                  type: NodeType.alert_text,
                  text: currentText,
                  inner: currentMatch[1].toLowerCase(),
                });
            else {
              if (
                !element.link &&
                (currentMatch = (remapPunctuation ? this.rules.link_ext : this.rules.link).exec(
                  textSlice,
                ))
              ) {
                var normalizedLink = currentMatch[0];
                if (
                  ((textSlice = textSlice.substring(currentMatch[0].length)),
                  remapPunctuation &&
                    ((normalizedLink = Ce(
                      (normalizedLink =
                        '[' +
                        currentMatch[1] +
                        ']' +
                        normalizedLink.substring(currentMatch[1].length + 2)),
                    )),
                    (currentMatch = this.rules.link.exec(normalizedLink))),
                  currentMatch)
                ) {
                  (itemIndex += currentMatch[0].length),
                    (textSlice = normalizedLink.substr(currentMatch[0].length) + textSlice),
                    items.push({
                      type: 'link',
                      href: Fe(currentMatch[2], !0),
                      title: currentMatch[5],
                      markdown: currentMatch[0],
                      text: currentMatch[1] || '',
                      inner: currentMatch[1]
                        ? this.output(currentMatch[1], decorateToken, !0, pe.skipLink, renderState)
                        : '',
                      meta: Fe(currentMatch[0].substring(currentMatch[1].length + 2)),
                    });
                  continue;
                }
                textSlice = xe(normalizedLink) + textSlice;
              }
              if (!element.image) {
                if (!remapPunctuation && (currentMatch = this.rules.image.exec(textSlice))) {
                  if (
                    ((itemIndex += (currentText = Ce(currentMatch[0])).length),
                    (textSlice = textSlice.substring(currentMatch[0].length)),
                    (currentMatch = this.rules.image.exec(currentText)))
                  ) {
                    items.push({
                      type: 'image',
                      href: Fe(currentMatch[4]),
                      title: currentMatch[7],
                      markdown: currentMatch[0],
                      components: [currentMatch[1], currentMatch[3], currentMatch[8]],
                      alt: currentMatch[2],
                      onlychild: !textSlice && !items.length,
                    });
                    continue;
                  }
                  (textSlice = xe(currentText) + textSlice), (itemIndex -= currentText.length);
                }
                if (remapPunctuation && (currentMatch = this.rules.image_ext.exec(textSlice))) {
                  (length = currentMatch[0].length),
                    (textSlice = textSlice.substring(currentMatch[0].length));
                  var normalizedImage =
                    currentMatch[1]
                      .replace(/^!\u3010/g, '![')
                      .replace(/[\u3011\]][\uff08\)]$/g, '](') +
                    currentMatch[3] +
                    currentMatch[5].replace(/^\uff09/g, ')');
                  if (
                    ((normalizedImage = Ce(normalizedImage)),
                    (currentMatch = this.rules.image.exec(normalizedImage)))
                  ) {
                    (itemIndex += currentMatch[0].length),
                      (textSlice = normalizedImage.substr(currentMatch[0].length) + textSlice),
                      items.push({
                        type: 'image',
                        href: Fe(currentMatch[4]),
                        title: currentMatch[7],
                        markdown: normalizedImage.substr(0, currentMatch[0].length),
                        components: [currentMatch[1], currentMatch[3], currentMatch[8]],
                        alt: currentMatch[2],
                        onlychild: !textSlice && !items.length,
                      });
                    continue;
                  }
                  textSlice = xe(normalizedImage) + textSlice;
                }
              }
              if (
                !element.footnote &&
                itemIndex &&
                (currentMatch = this.rules.footnote.exec(textSlice))
              ) {
                if (
                  ((currentText = Ce(currentMatch[0])),
                  (textSlice = textSlice.substring(currentMatch[0].length)),
                  currentText != currentMatch[0] &&
                    (currentMatch = this.rules.footnote.exec(currentText)),
                  currentMatch)
                ) {
                  (itemIndex += currentMatch[0].length),
                    (textSlice = currentText.substr(currentMatch[0].length) + textSlice);
                  var referenceName = (currentMatch[2] || currentMatch[1]).replace(/\s+/g, ' ');
                  items.push({
                    type: NodeType.footnote,
                    inner: this.output(
                      currentMatch[1],
                      decorateToken,
                      !0,
                      pe.skipLink,
                      renderState,
                    ),
                    text: Fe(currentMatch[1]),
                  });
                  continue;
                }
                textSlice = xe(currentText) + textSlice;
              }
              if ((currentMatch = this.rules.reflink.exec(textSlice)))
                if (element.reflink && !currentMatch[1]);
                else {
                  if (
                    ((currentText = Ce(currentMatch[0])),
                    (textSlice = textSlice.substring(currentMatch[0].length)),
                    currentText != currentMatch[0] &&
                      (currentMatch = this.rules.reflink.exec(currentText)),
                    currentMatch)
                  ) {
                    (itemIndex += currentMatch[0].length),
                      (textSlice = currentText.substr(currentMatch[0].length) + textSlice);
                    referenceName = (currentMatch[3] || '').replace(/\s+/g, ' ');
                    items.push({
                      type: currentMatch[1] ? 'refimg' : 'reflink',
                      ref: Fe(referenceName),
                      inner: this.output(
                        currentMatch[2],
                        decorateToken,
                        !0,
                        pe.skipLink,
                        renderState,
                      ),
                      text: Fe(currentMatch[2]),
                      markdown: currentText,
                      onlychild: !textSlice && !items.length,
                    });
                    continue;
                  }
                  textSlice = xe(currentText) + textSlice;
                }
              if (
                element.attr ||
                !(currentMatch = (remapPunctuation ? this.rules.attr_ext : this.rules.attr).exec(
                  textSlice,
                ))
              )
                if ((currentMatch = /^\uE031\uE031([^\uE031]+)\uE031\uE031/.exec(textSlice)))
                  (itemIndex += (currentText = Ce(currentMatch[0], !0)).length),
                    (textSlice = textSlice.substring(currentMatch[0].length)),
                    items.push({
                      type: NodeType.strong,
                      pattern: '**',
                      inner: this.output(currentMatch[1], decorateToken, !0, element, renderState),
                      text: currentText,
                    });
                else if ((currentMatch = this.rules.strong.exec(textSlice))) {
                  var tripleEmphasisPattern = /^\*\*\*([^\*]*[^\s*\s])\*\*/;
                  if (
                    ((textSlice = textSlice.substring(currentMatch[0].length)),
                    tripleEmphasisPattern.exec(currentMatch[0]))
                  ) {
                    textSlice =
                      currentMatch[0].replace(tripleEmphasisPattern, '*$1') + textSlice;
                    continue;
                  }
                  (itemIndex += (currentText = Ce(currentMatch[0], !0)).length),
                    items.push({
                      type: NodeType.strong,
                      pattern: currentMatch[1],
                      inner: this.output(currentMatch[2], decorateToken, !0, element, renderState),
                      text: currentText,
                    });
                } else if ((currentMatch = this.rules.em1.exec(textSlice)))
                  (itemIndex += (currentText = Ce(currentMatch[0], !0)).length),
                    (textSlice = textSlice.substring(currentMatch[0].length)),
                    items.push({
                      type: NodeType.em,
                      pattern: currentMatch[1],
                      inner: this.output(currentMatch[2], decorateToken, !0, element, renderState),
                      text: currentText,
                    });
                else if ((currentMatch = this.rules.em2.exec(textSlice))) {
                  var match = (currentMatch[2] + currentMatch[3].substring(1, 3)).match(
                    /\s\*(?!\*)/,
                  );
                  if (match) {
                    (currentText = currentMatch[0].substr(0, match.index + 1)),
                      (itemIndex += (currentMatch = /^\*+/.exec(currentText))[0].length),
                      (textSlice = textSlice.substring(currentMatch[0].length)),
                      S(items, currentMatch[0]);
                    continue;
                  }
                  (itemIndex += (currentText = Ce(currentMatch[0], !0)).length),
                    (textSlice = textSlice.substring(currentMatch[0].length)),
                    items.push({
                      type: NodeType.em,
                      pattern: currentMatch[1],
                      inner: this.output(
                        currentMatch[2] + currentMatch[3].substring(1, 3),
                        decorateToken,
                        !0,
                        element,
                        renderState,
                      ),
                      text: currentText,
                    });
                } else if (
                  ((currentMatch = this.rules.code2.exec(textSlice)) &&
                    (textSlice = textSlice.replace(
                      this.rules.code2,
                      function (unusedParameter1, placeholderKey) {
                        var codeText = map.get(placeholderKey) || '';
                        return map.delete(placeholderKey), codeText;
                      },
                    )),
                  (currentMatch = this.rules.code.exec(textSlice)))
                )
                  (itemIndex += currentMatch[0].length),
                    (textSlice = textSlice.substring(currentMatch[0].length)),
                    items.push({
                      type: NodeType.code,
                      pattern: currentMatch[1],
                      text: currentMatch[2],
                    });
                else if ((currentMatch = this.rules.del.exec(textSlice)))
                  (itemIndex += (currentText = Ce(currentMatch[0], !0)).length),
                    (textSlice = textSlice.substring(currentMatch[0].length)),
                    items.push({
                      type: NodeType.del,
                      pattern: '~~',
                      inner: this.output(currentMatch[1], decorateToken, !0, element, renderState),
                      text: currentText,
                    });
                else if (
                  (currentMatch = this.rules.emoji.exec(textSlice)) &&
                  emoji.data[(currentMatch[2] = currentMatch[2].replace(/\uE006/g, '_'))]
                )
                  (textSlice = textSlice.substring(currentMatch[0].length)),
                    items.push({
                      type: NodeType.emoji,
                      text: currentMatch[2],
                      inner: emoji.data[currentMatch[2]],
                    }),
                    !currentMatch[1].length && y(itemIndex, 1),
                    (itemIndex += currentMatch[0].length),
                    !currentMatch[3].length && y(itemIndex, 1);
                else {
                  if (!element.subscript && (currentMatch = this.rules.subscript.exec(textSlice))) {
                    if (
                      ((currentText = Ce(currentMatch[0])),
                      (textSlice = textSlice.substring(currentMatch[0].length)),
                      currentText != currentMatch[0] &&
                        (currentMatch = this.rules.subscript.exec(currentText)),
                      currentMatch)
                    ) {
                      (itemIndex += currentMatch[0].length),
                        (textSlice = currentText.substr(currentMatch[0].length) + textSlice);
                      var currentItems = [];
                      (currentMatch = currentMatch[1].split(/\\\s/g))[0] &&
                        currentItems.push({ type: NodeType.plain, text: currentMatch[0] });
                      for (
                        var localItemIndex = 1;
                        localItemIndex < currentMatch.length;
                        localItemIndex++
                      )
                        currentItems.push({ type: NodeType.escape, text: ' ' }),
                          currentMatch[localItemIndex] &&
                            currentItems.push({
                              type: NodeType.plain,
                              text: currentMatch[localItemIndex],
                            });
                      items.push({
                        type: NodeType.subscript,
                        inner: E(currentItems),
                        text: currentMatch[0],
                      });
                      continue;
                    }
                    textSlice = xe(currentText) + textSlice;
                  }
                  if (
                    !element.superscript &&
                    (currentMatch = this.rules.superscript.exec(textSlice))
                  ) {
                    if (
                      ((currentText = Ce(currentMatch[0])),
                      (textSlice = textSlice.substring(currentMatch[0].length)),
                      currentText != currentMatch[0] &&
                        (currentMatch = this.rules.superscript.exec(currentText)),
                      currentMatch)
                    ) {
                      (itemIndex += currentMatch[0].length),
                        (textSlice = currentText.substr(currentMatch[0].length) + textSlice);
                      currentItems = [];
                      (currentMatch = currentMatch[1].split(/\\\s/g))[0] &&
                        currentItems.push({ type: NodeType.plain, text: currentMatch[0] });
                      for (
                        localItemIndex = 1;
                        localItemIndex < currentMatch.length;
                        localItemIndex++
                      )
                        currentItems.push({ type: NodeType.escape, text: ' ' }),
                          currentMatch[localItemIndex] &&
                            currentItems.push({
                              type: NodeType.plain,
                              text: currentMatch[localItemIndex],
                            });
                      items.push({
                        type: NodeType.superscript,
                        inner: E(currentItems),
                        text: currentMatch[0],
                      });
                      continue;
                    }
                    textSlice = xe(currentText) + textSlice;
                  }
                  if (
                    element.inline_math ||
                    !(currentMatch = this.rules.inline_math.exec(textSlice))
                  )
                    if (element.highlight || !(currentMatch = this.rules.highlight.exec(textSlice)))
                      if ((currentMatch = this.rules.entity.exec(textSlice)))
                        (itemIndex += currentMatch[0].length),
                          (textSlice = textSlice.substring(currentMatch[0].length)),
                          utilities.decodeHtmlEntity(currentMatch[0])
                            ? items.push({
                                type: NodeType.html_entity,
                                inner: currentMatch[0],
                                text: currentMatch[0],
                              })
                            : S(items, currentMatch[0] || '');
                      else {
                        if (File.option.convertSmartOnRender && File.option.smartDash) {
                          if ((currentMatch = /^(---)($|[^-])/.exec(textSlice))) {
                            (itemIndex += currentMatch[1].length),
                              (textSlice = textSlice.substring(currentMatch[1].length)),
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
                            (textSlice = textSlice.substring(currentMatch[0].length)),
                              (itemIndex += currentMatch[0].length),
                              items.push({
                                type: NodeType.pants,
                                inner: File.option.twoHyphensToEm ? '—' : '–',
                                desc: File.option.twoHyphensToEm ? 'em_dash' : 'en_dash',
                                meta: '-',
                                text: '--',
                              });
                            continue;
                          }
                          if ((currentMatch = /^\.{3}/.exec(textSlice))) {
                            (itemIndex += currentMatch[0].length),
                              '.' !== (textSlice = textSlice.substring(currentMatch[0].length))[4]
                                ? items.push({
                                    type: NodeType.pants,
                                    inner: '…',
                                    desc: 'ellipsis',
                                    meta: '..',
                                    text: '...',
                                  })
                                : S(items, currentMatch[0]);
                            continue;
                          }
                        }
                        if (File.option.convertSmartOnRender && File.option.smartQuote) {
                          var precedingText, previousCharacter;
                          if ('"' == textSlice[0]) {
                            if (
                              ((previousCharacter =
                                (precedingText = ue(items) || '')[precedingText.length - 1] || ''),
                              /([\(\{\[\s\-/\u2018])$/.exec(precedingText) ||
                                previousCharacter == smartQuotes.userQuote(2))
                            ) {
                              itemIndex++,
                                (textSlice = textSlice.substring(1)),
                                items.push({
                                  type: NodeType.pants,
                                  inner: smartQuotes.userQuote(0, void 0, !0),
                                  desc: 'open_double',
                                  text: '"',
                                });
                              continue;
                            }
                            if ((currentMatch = /^"($|[\)\s/.,;:?!\u2019])/.exec(textSlice))) {
                              itemIndex++,
                                (textSlice = textSlice.substring(1)),
                                items.push({
                                  type: NodeType.pants,
                                  inner: smartQuotes.userQuote(1, void 0, !0),
                                  desc: 'close_double',
                                  text: '"',
                                });
                              continue;
                            }
                            if (Se(items)) {
                              itemIndex++,
                                (textSlice = textSlice.substring(1)),
                                items.push({
                                  type: NodeType.pants,
                                  inner: smartQuotes.userQuote(1, void 0, !0),
                                  desc: 'close_double',
                                  text: '"',
                                });
                              continue;
                            }
                            itemIndex++,
                              (textSlice = textSlice.substring(1)),
                              items.push({
                                type: NodeType.pants,
                                inner: smartQuotes.userQuote(0, void 0, !0),
                                desc: 'open_double',
                                text: '"',
                              });
                            continue;
                          }
                          if ("'" == textSlice[0]) {
                            if (
                              renderState.openQuote &&
                              (currentMatch = /^'($|[\)\s".,;:?!-])/.exec(textSlice))
                            ) {
                              itemIndex++,
                                (textSlice = textSlice.substring(1)),
                                items.push({
                                  type: NodeType.pants,
                                  inner: smartQuotes.userQuote(3),
                                  desc: 'close_single',
                                  text: "'",
                                }),
                                (renderState.openQuote.inner = smartQuotes.userQuote(2)),
                                (renderState.openQuote.desc = 'open_single'),
                                (renderState.openQuote = null);
                              continue;
                            }
                            if (
                              ((precedingText = ue(items) || ''),
                              textSlice.length <= 1 && /((^|[\s])$)/.exec(precedingText))
                            ) {
                              (itemIndex += textSlice.length),
                                S(items, textSlice),
                                (textSlice = '');
                              continue;
                            }
                            itemIndex++,
                              (textSlice = textSlice.substring(1)),
                              items.push({
                                type: NodeType.pants,
                                inner: '’' == smartQuotes.userQuote(3) ? '’' : "'",
                                desc: 'close_single',
                                text: "'",
                              }),
                              /(^|[\(\s"-])$/.exec(precedingText) &&
                                (renderState.openQuote = items.last());
                            continue;
                          }
                        }
                        if ((currentMatch = this.rules.tab.exec(textSlice)))
                          (itemIndex += currentMatch[0].length),
                            (textSlice = textSlice.substring(currentMatch[0].length)),
                            items.push({
                              type: NodeType.tab,
                              inner: currentMatch[0],
                              text: currentMatch[0],
                            });
                        else if ((currentMatch = this.rules.text.exec(textSlice)))
                          (itemIndex += currentMatch[0].length),
                            '\n' == (textSlice = textSlice.substring(currentMatch[0].length))[0] &&
                            this.rules.linebreak.exec(currentMatch[0] || '')
                              ? (itemIndex++,
                                (textSlice = textSlice.substring(1)),
                                S(items, currentMatch[0].replace(this.rules.linebreak, '')),
                                items.push({
                                  type: NodeType.linebreak,
                                  text: '  \n',
                                  isLast: !textSlice,
                                }))
                              : S(items, currentMatch[0] || '');
                        else if (textSlice)
                          throw new Error('Infinite loop on byte: ' + textSlice.charCodeAt(0));
                      }
                    else
                      (itemIndex += (currentText = Ce(currentMatch[0], !0)).length),
                        (textSlice = textSlice.substring(currentMatch[0].length)),
                        items.push({
                          type: NodeType.highlight,
                          inner: this.output(
                            currentMatch[2],
                            decorateToken,
                            !0,
                            element,
                            renderState,
                          ),
                          text: Fe(currentMatch[2], !0),
                        });
                  else {
                    var mathBoundaryPattern = null,
                      braceDepth = 0,
                      mathText = '',
                      boundaryMatch = null,
                      dollarPattern = /\$/,
                      pattern = '$';
                    for (
                      /^\$\$/.exec(currentMatch[0])
                        ? ((mathBoundaryPattern = /{|}|\$\$/g), (pattern = '$$'))
                        : ((mathBoundaryPattern = /{|}|\$/g), (pattern = '$')),
                        mathBoundaryPattern.exec(currentMatch[0]);
                      (boundaryMatch = mathBoundaryPattern.exec(currentMatch[0]));
                    ) {
                      if (
                        dollarPattern.exec(boundaryMatch[0]) &&
                        braceDepth <= 0 &&
                        '\\' !=
                          currentMatch[0].substring(boundaryMatch.index - 1, boundaryMatch.index)
                      ) {
                        mathText = currentMatch[0].substring(
                          0,
                          boundaryMatch.index + boundaryMatch[0].length,
                        );
                        break;
                      }
                      '{' === boundaryMatch[0]
                        ? ('\\' === boundaryMatch.input[boundaryMatch.index - 1] &&
                            '\\' !== !boundaryMatch.input[boundaryMatch.index - 2]) ||
                          braceDepth++
                        : '}' === boundaryMatch[0] &&
                          (('\\' === boundaryMatch.input[boundaryMatch.index - 1] &&
                            '\\' !== !boundaryMatch.input[boundaryMatch.index - 2]) ||
                            braceDepth--);
                    }
                    var patternLength = pattern.length;
                    if (mathText.length - 2 * patternLength > 0 && /[^\s$]/.exec(mathText)) {
                      textSlice = textSlice.substring(mathText.length);
                      var zeroWidthOffset = (mathText = Ce(mathText)).indexOf('​');
                      zeroWidthOffset > -1 && (cursorDeltas[itemIndex + zeroWidthOffset + 1] = -1),
                        (itemIndex += mathText.length),
                        items.push({
                          type: NodeType.inline_math,
                          text: Fe(
                            mathText.substring(patternLength, mathText.length - patternLength),
                          ),
                          pattern: pattern,
                        });
                      continue;
                    }
                    (itemIndex += (currentText = Ce(currentMatch[0])).length),
                      (textSlice = textSlice.substring(currentMatch[0].length)),
                      S(items, currentText || '');
                  }
                }
              else
                (itemIndex += (currentText = Ce(currentMatch[0])).length),
                  (textSlice = textSlice.substring(currentMatch[0].length)),
                  items.push({ type: NodeType.attr, text: currentText });
            }
          else {
            if (
              ((textSlice = textSlice.substring(currentMatch[0].length)),
              (currentText = currentMatch[0].replace(/[\uE016\uE017\uE019]/g, '')),
              (currentMatch = /(&#?[a-z0-9]+;)([?!.,:**_~;]*)$/i.exec(currentText)))
            )
              (currentText = currentText.substr(0, currentMatch.index + currentMatch[1].length)),
                (textSlice = (currentMatch[2] || '') + textSlice);
            else if (
              ((currentMatch = /[?!.,:**_~;]+$/.exec(currentText)) &&
                ((currentText = currentText.substr(0, currentMatch.index)),
                (textSlice = currentMatch[0] + textSlice)),
              (currentMatch = /\)+$/.exec(currentText)))
            ) {
              var extraClosingParens =
                (currentText.match(/\)/g) || []).length - (currentText.match(/\(/g) || []).length;
              extraClosingParens > 0 &&
                (currentMatch = new RegExp('\\){' + extraClosingParens + '}$').exec(currentText)) &&
                ((currentText = currentText.substr(0, currentMatch.index)),
                (textSlice = currentMatch[0] + textSlice));
            }
            (itemIndex += currentText.length),
              (linkTarget = currentText),
              null === /^\w+:\/\//.exec(currentText) &&
                /@/.exec(currentText) &&
                (linkTarget = 'mailto:' + linkTarget),
              items.push({ type: NodeType.url, href: Fe(linkTarget), text: currentText }),
              (renderState.hasContent = !0);
          }
        else
          (itemIndex += currentMatch[0].length),
            (textSlice = textSlice.substring(currentMatch[0].length)),
            '',
            (currentText = currentMatch[1]),
            (linkTarget =
              '@' === currentMatch[4]
                ? ':' === currentMatch[1].charAt(6)
                  ? currentText
                  : 'mailto:' + currentMatch[1]
                : currentText),
            items.push({ type: NodeType.autolink, href: Fe(linkTarget), text: currentText }),
            (renderState.hasContent = !0);
      var renderedHtml = E(items);
      return alreadyPreprocessed || (renderedHtml = Fe(renderedHtml, {})), renderedHtml;
    }),
      (Ee.exec = Ee);
    var taskMarkerPattern = /^( *)[*+-][ \t\u00A0]+(\[(x|X)\]|\[ \]) +/,
      bulletMarkerPattern = /^( *)[*+-][ \t\u00A0]+/,
      orderedListPattern = /^( *)\d+(\.|\))[ \t\u00A0]+/,
      firstOrderedItemPattern = /^( *)1(\.|\))[ \t\u00A0]+/,
      Ne = function () {
        return File.shouldRemapPunctuation() ? /^ *[>〉》][^\n]+/ : /^ *>[^\n]+/;
      };
    var inlineHeadingPattern = /^( *#{1,6}\s*)([^\n]+?)(\s+#+ *)*$/m,
      strictHeadingPattern = /^( *#{1,6}\s+)([^\n]+?)(\s+#+ *)*$/m;
    function Be(sourceText, inlineLexer, skipBlockSyntax, documentNode, cursorDiff, items) {
      var blockMatch = [],
        renderedPart = '',
        renderState = { cursorDiff: cursorDiff };
      function u(text, match, blockToken) {
        var currentItems = [];
        return (
          (currentItems[0] = text.substr(0, match.index)),
          (currentItems[1] = text.substr(match.index, match[0].length)),
          (currentItems[2] = text.substr(match.index + match[0].length)),
          currentItems
            .map(function (item, itemIndex) {
              return 1 == itemIndex
                ? inlineLexer.options.decorate(blockToken)
                : item
                  ? inlineLexer.options.decorate({
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
                    })
                  : '';
            })
            .join('')
        );
      }
      for (
        documentNode && documentNode.cid == File.editor.focusCid && (renderState.isCur = !0);
        sourceText;
      ) {
        if (!skipBlockSyntax && /^\s*[-+*_<\[\{|#0-9`~=>$]/m.exec(sourceText)) {
          if ((blockMatch = /^ *>[^\n]+/m.exec(sourceText))) {
            renderedPart = u(sourceText, blockMatch, {
              type: NodeType.blockquote,
              pattern: blockMatch[0].match(/^( *> ?)+/gm)[0],
              inner: Be(
                blockMatch[0].replace(/^( *> ?)+/gm, ''),
                inlineLexer,
                !0,
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
            items.push(mdlike),
              (renderedPart = u(sourceText, blockMatch, {
                type: NodeType.heading,
                meta_before: blockMatch[0].substring(0, blockMatch[1].length),
                meta_after: blockMatch[3] || '',
                mdlike: mdlike,
                inner: inlineLexer.output(blockMatch[2], null, null, { attr: !1 }, renderState),
              }));
            break;
          }
          if (
            (blockMatch = /^( *(`{3,}|~{3,}|·{3,})[ \t\u00A0]*)([^\n`]+)? *$/m.exec(sourceText))
          ) {
            renderedPart = u(sourceText, blockMatch, {
              type: NodeType.fences,
              lang: blockMatch[3],
              pattern: blockMatch[1],
            });
            break;
          }
          if ((blockMatch = /^\s*\[\^([^\]\n]+)\]:(\s*)([^\n]*)$/m.exec(sourceText))) {
            renderedPart = u(sourceText, blockMatch, {
              type: NodeType.def_footnote,
              ref: blockMatch[1],
              pattern: blockMatch[2],
              inner: inlineLexer.output(blockMatch[3] || '', null, null, null, renderState),
            });
            break;
          }
          if ((blockMatch = /^\s*\[([^\]\n]+)\]:(\s*)([^\n]*)/m.exec(sourceText))) {
            renderedPart = u(sourceText, blockMatch, {
              type: NodeType.def_link,
              ref: blockMatch[1],
              pattern: blockMatch[2],
              inner: inlineLexer.output(blockMatch[3] || '', null, null, null, renderState),
            });
            break;
          }
          if ((blockMatch = /^(\s*)(([-+*]|\d+(\.|\)))[ \t]+)/m.exec(sourceText))) {
            renderedPart = u(sourceText, blockMatch, {
              type: 'block',
              inner: inlineLexer.output(blockMatch[0] || '', null, null, null, renderState),
            });
            break;
          }
          if ((blockMatch = /^\s*(\$\$|\[toc\])\s*$/im.exec(sourceText))) {
            renderedPart = u(sourceText, blockMatch, {
              type: 'block',
              inner: inlineLexer.output(blockMatch[0] || '', null, null, null, renderState),
            });
            break;
          }
          if ((blockMatch = /^\s*([-+_*])\s*\1\s*\1(\s|\1)*$/m.exec(sourceText))) {
            renderedPart = u(sourceText, blockMatch, {
              type: 'block',
              inner: inlineLexer.output(blockMatch[0] || '', null, null, null, renderState),
            });
            break;
          }
          if ((blockMatch = /^ *\|([^\|]+\|.+)\|\s*$/m.exec(sourceText))) {
            renderedPart = u(sourceText, blockMatch, {
              type: 'block',
              inner: inlineLexer.output(blockMatch[0] || '', null, null, null, renderState),
            });
            break;
          }
        }
        var parentNode = documentNode.get('parent');
        DocumentNode.isType(documentNode, NodeType.paragraph) &&
          !documentNode.get('before') &&
          DocumentNode.isType(parentNode, NodeType.blockquote) &&
          parentNode.get('alert') &&
          (renderState.alert = !0),
          (renderedPart = inlineLexer.options.decorate({
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
          }));
        break;
      }
      return renderedPart;
    }
    var defaultInlineLexer,
      parserApi = {};
    (parserApi.options = parserApi.setOptions =
      function (options) {
        return Te(parserApi.defaults, options), parserApi;
      }),
      (parserApi.defaults = {
        gfm: !0,
        tables: !0,
        breaks: !1,
        pedantic: !1,
        sanitize: !1,
        smartLists: !1,
        silent: !1,
        highlight: null,
        langPrefix: 'lang-',
        smartypants: !1,
        headerPrefix: '',
      }),
      (parserApi.parseInline = function (sourceText, context, cursorDiff) {
        return (
          defaultInlineLexer ||
            ((defaultInlineLexer = new pe()), (parserApi.defaultInlineLexer = defaultInlineLexer)),
          defaultInlineLexer.output(sourceText, null, null, context, { cursorDiff: cursorDiff })
        );
      }),
      (parserApi.parsePandocAttr = function (text) {
        var element = {};
        return text && '{' == text[0] && '}' == text[text.length - 1]
          ? (((text = text.replace(/(^{)|(}$)/g, '')).split(/\s+/) || [text]).forEach(
              function (item) {
                var match;
                (match = /^#(.+)/.exec(item))
                  ? (element.id = utilities.escapeInQuote(match[1]))
                  : (match = /^\.(.+)/.exec(item))
                    ? (element.class =
                        (element.class || '') + ' ' + utilities.escapeInQuote(match[1]))
                    : (match = /^(.+)=(['"])([^'"]+)\2/.exec(item)) &&
                      ((element.attr = (element.attr || '') + ' ' + item),
                      (element.nativeAttr = element.nativeAttr || {}),
                      (element.nativeAttr[match[1]] = match[3]));
              },
            ),
            element)
          : element;
      }),
      (parserApi.attrToString = function (element) {
        var attributesText = '';
        return (
          element.id && (attributesText += " id='" + element.id + "'"),
          element.class && (attributesText += " class='" + element.class.trim() + "'"),
          element.attr && (attributesText += element.attr),
          attributesText
        );
      }),
      (parserApi.InlineLexer = pe),
      (parserApi.quickParse = function e(
        textSlice,
        brush,
        documentNode,
        inlineOnly,
        command,
        selectionSnapshot,
      ) {
        var currentMatch,
          consumedPrefixLength = 0,
          localDocumentNode = documentNode,
          cursorDiff = [];
        function m(text, inputDocumentNode, nodeType) {
          return new DocumentNode({
            type: nodeType || NodeType.paragraph,
            text: text,
            parent: inputDocumentNode,
            in: inputDocumentNode.get('in'),
          });
        }
        function g(prefixText, editCommand, targetNode, lineInfo) {
          brush.editor.undo.endSnap(!0),
            targetNode.cid == brush.editor.focusCid && brush.editor.store(),
            editCommand.undo.push(undoManager.buildReplaceUndo(targetNode));
          var precedingParagraph = null;
          return (
            lineInfo && lineInfo.start
              ? ((consumedPrefixLength = consumedPrefixLength - lineInfo.start + prefixText.length),
                (precedingParagraph = new DocumentNode({
                  type: NodeType.paragraph,
                  text: textSlice.substring(0, lineInfo.start - 1),
                })),
                targetNode.addBefore(precedingParagraph),
                undoManager.addUndoForInsert(editCommand, precedingParagraph))
              : (consumedPrefixLength += prefixText.length),
            (textSlice = textSlice.substring((lineInfo ? lineInfo.start : 0) + prefixText.length)),
            precedingParagraph
          );
        }
        function v(parsedNode, inputCommand, containerNode, parseResult, precedingParagraph) {
          return (
            (parseResult =
              parseResult || e(textSlice, brush, parsedNode, !1, inputCommand, selectionSnapshot)),
            inputCommand.redo.push(undoManager.buildReplaceUndo(containerNode)),
            {
              html:
                (precedingParagraph ? precedingParagraph.toHTML() : '') +
                containerNode.toHTML(parseResult.html),
              offset: consumedPrefixLength + parseResult.offset,
              focus: parseResult.focus,
              blockChanged: !0,
              command: inputCommand,
            }
          );
        }
        function y(text, editCommand, listStyle, lineInfo) {
          var listItem,
            parseResult,
            indentSize = File.option.indentSize,
            precedingParagraph = g(
              (text = text.replace('【', '[').replace('】', ']')),
              editCommand,
              documentNode,
              lineInfo,
            );
          if (
            (documentNode.set('type', NodeType.list),
            documentNode.set('text', ''),
            documentNode.set('style', listStyle),
            (listItem = m('', documentNode, NodeType.list_item)).set(
              'checked',
              null != /x|X/g.exec(lineInfo.line),
            ),
            text.indexOf('[') > -1 && listItem.set('style', DocumentNode.ListType.task),
            listStyle == DocumentNode.ListType.ul &&
              (File.option.prettyIndent
                ? documentNode.set(
                    'pattern',
                    text.replace(/\[[xX\s]\]\s+/, '').trim() + ' '.repeat(indentSize - 1),
                  )
                : documentNode.set('pattern', text.replace(/\[[xX\s]\]\s+/, '').trim() + ' ')),
            listStyle == DocumentNode.ListType.ol)
          ) {
            var listStartText = text.match(/\d+/)[0].replace(/^1$/, '');
            '' != listStartText
              ? documentNode.set('start', listStartText)
              : documentNode.unset('start'),
              File.option.prettyIndent
                ? documentNode.set(
                    'pattern',
                    text.replace(/\d+/, '{0}').trim() + ' '.repeat(indentSize - 1),
                  )
                : documentNode.set('pattern', text.replace(/\d+/, '{0}').trim() + ' ');
          }
          return (
            text &&
              File.option.autoPairExtendSymbol &&
              /\*\s$/.exec(text) &&
              (textSlice = textSlice.replace(/^\*/, '')),
            (localDocumentNode = m(textSlice, listItem, NodeType.paragraph)),
            ((parseResult = e(textSlice, brush, localDocumentNode, !1)).html = listItem.toHTML(
              parseResult.html,
            )),
            v(null, editCommand, documentNode, parseResult, precedingParagraph)
          );
        }
        (command = command || (!inlineOnly && undoManager.makeEmptyCommand())),
          File.option.strictMarkdown &&
            ((taskMarkerPattern = File.shouldRemapPunctuation()
              ? /^( {0,3})[*+-][ \t\u00A0]+([\[【](x|X)[\]】]|[\[【] [\]】]) +/
              : /^( {0,3})[*+-][ \t\u00A0]+(\[(x|X)\]|\[ \]) +/),
            (bulletMarkerPattern = /^( {0,3})[*+-][ \t\u00A0]+/),
            (orderedListPattern = /^( {0,3})\d+(\.|\))[ \t\u00A0]+/),
            (firstOrderedItemPattern = /^( {0,3})1(\.|\))[ \t\u00A0]+/)),
          selectionSnapshot &&
            void 0 === selectionSnapshot.endId &&
            (selectionSnapshot.endId = selectionSnapshot.id),
          selectionSnapshot &&
            void 0 === selectionSnapshot.startId &&
            (selectionSnapshot.startId = selectionSnapshot.id);
        var outsideSelectionEnd = !selectionSnapshot || selectionSnapshot.endId != documentNode.cid;
        if (!(inlineOnly = inlineOnly || (textSlice.indexOf('\n') > -1 && outsideSelectionEnd))) {
          var cursorLine = utilities.findLine(
            textSlice,
            outsideSelectionEnd ? 0 : selectionSnapshot.end,
          );
          if (Ne().exec(cursorLine.line)) {
            if (!/^(\s*>){10,}/.exec(cursorLine.line))
              return (function (editCommand, lineInfo) {
                var precedingParagraph = g(
                  lineInfo.line.match(/^ *[>〉》][ \u00A0]?/)[0],
                  editCommand,
                  documentNode,
                  lineInfo,
                );
                return (
                  documentNode.set('type', NodeType.blockquote),
                  documentNode.set('text', ''),
                  (localDocumentNode = m(textSlice, documentNode)),
                  editCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
                  v(localDocumentNode, editCommand, documentNode, void 0, precedingParagraph)
                );
              })(command, cursorLine);
          } else {
            if ((currentMatch = taskMarkerPattern.exec(cursorLine.line)))
              return y(currentMatch[0], command, DocumentNode.ListType.ul, cursorLine);
            if ((currentMatch = bulletMarkerPattern.exec(cursorLine.line)))
              return y(currentMatch[0], command, DocumentNode.ListType.ul, cursorLine);
            if (
              (currentMatch = (
                File.option.strictNumberStartOnNewLine && cursorLine.start
                  ? firstOrderedItemPattern
                  : orderedListPattern
              ).exec(cursorLine.line))
            )
              return y(currentMatch[0], command, DocumentNode.ListType.ol, cursorLine);
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
            )
              return (function (markerText, editCommand) {
                var parseResult,
                  childParseResult,
                  currentDocumentNode = documentNode.get('parent');
                return (
                  g(markerText, editCommand, currentDocumentNode),
                  currentDocumentNode.set('style', DocumentNode.ListType.task),
                  currentDocumentNode.set('checked', null != /x|X/g.exec(markerText)),
                  documentNode.set('text', textSlice),
                  ((childParseResult = e(
                    textSlice,
                    brush,
                    (localDocumentNode = documentNode),
                    !0,
                    editCommand,
                  )).html = void 0),
                  ((parseResult = v(
                    null,
                    editCommand,
                    currentDocumentNode,
                    childParseResult,
                  )).replaceCid = currentDocumentNode.cid),
                  parseResult
                );
              })(currentMatch[0], command);
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
                  0 === (previousCommand.source || '').indexOf(documentNode.cid + '#') &&
                    (editor.undo.removeLastRegisteredOperationCommand(),
                    undoManager.append(inputCommand, previousCommand)),
                    g(documentNode.get('text'), inputCommand, currentDocumentNode),
                    (consumedPrefixLength = 0),
                    currentDocumentNode.set('alert', text.toLowerCase()),
                    documentNode.set('text', prefixText);
                  var nextNode = documentNode.get('after'),
                    hasRemainingText = text && !match[0].length <= prefixText.length;
                  return (
                    !nextNode &&
                      hasRemainingText &&
                      ((nextNode = new DocumentNode({ type: NodeType.paragraph, text: '' })),
                      documentNode.addAfter(nextNode),
                      undoManager.addUndoForInsert(inputCommand, nextNode, documentNode)),
                    ((parseResult = v(null, inputCommand, currentDocumentNode, {
                      offset: 0,
                      focus: hasRemainingText ? nextNode.cid : documentNode.cid,
                      blockChanged: !0,
                      command: inputCommand,
                      cursorDiff: [],
                    })).replaceCid = currentDocumentNode.cid),
                    parseResult
                  );
                }
              })(textSlice, command);
              if (alertResult) return alertResult;
            }
          }
        }
        var blockMetadata = [],
          renderResult = {
            innerHtml: Be(
              textSlice,
              brush.inline,
              inlineOnly || DocumentNode.isType(documentNode, NodeType.heading),
              documentNode,
              cursorDiff,
              blockMetadata,
            ),
            offset: 0,
            focus: documentNode.cid,
            blockChanged: !1,
            command: command,
            cursorDiff: cursorDiff,
            mdlike: blockMetadata[0],
          };
        return (
          (renderResult.html =
            documentNode && documentNode.toHTML(renderResult.innerHtml, blockMetadata[0])),
          renderResult
        );
      }),
      (parserApi.reDefLink = referenceDefinitionPattern),
      (parserApi.reDefFootnote = footnoteDefinitionPattern),
      (parserApi.reOL = listPrefixPatterns[DocumentNode.ListType.ol]),
      (parserApi.renderHtmlWithBlockMeta = function e(documentNode, brush) {
        if (DocumentNode.isType(documentNode, NodeType.paragraph)) {
          var blockMetadata = [],
            innerHtml = Be(
              documentNode.safeGetStrAttr('text'),
              brush.inline,
              !1,
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
          )
            textParts.push(e(currentDocumentNode, brush)),
              (currentDocumentNode = currentDocumentNode.get('after'));
          return documentNode.toHTML(textParts.join(''));
        }
        return documentNode.toHTML(void 0, void 0, { mathCount: 0 });
      }),
      (parserApi.splitTableCell = le),
      (parserApi.recoverEscape = Fe),
      (parserApi.brushContent = Be),
      (moduleRecord.exports = parserApi);
    Object.defineProperty(globalThis, '__MARKLYRA_NATIVE_LITERAL__', {
      value: Object.freeze({
        version: 1,
        moduleSha256: '713a28919e6cd278377be1590412dbecce450724015463f289d1bc7b0a1b5623',
        sites: 2,
      }),
    });
  },
);
