// editing/formatting.
// SystemJS module 2d. Dependencies: 2c, 11, 13, 1b, 1d, 19, 37.
$__System.registerDynamic(
  '2d',
  ['2c', '11', '13', '1b', '1d', '19', '37'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self, requireModule('2c');
    var utilities = requireModule('11'),
      documentModel = requireModule('13'),
      undoManager = requireModule('1b'),
      SnapFlag = undoManager.SnapFlag,
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      nodeCollectionUtilities = documentModel.NodeCollectionUtils,
      rangy = requireModule('1d'),
      markdownParser = requireModule('19'),
      documentMenu = requireModule('37');
    function p(documentNode) {
      if (documentNode.get('style') == DocumentNode.ListType.ol) return DocumentNode.ListType.ol;
      var hasNonTaskItem = !1;
      return (
        documentNode.get('children').map(function (item) {
          hasNonTaskItem = hasNonTaskItem || item.get('style') !== DocumentNode.ListType.task;
        }),
        hasNonTaskItem ? DocumentNode.ListType.ul : DocumentNode.ListType.task
      );
    }
    var f = function (element, styleType, selectionBookmark, restoreSelection, removeOnly) {
        var range = rangy.createRange();
        function a(inputElement) {
          var syntaxElements;
          (syntaxElements =
            inputElement.attr('md-inline') == styleType
              ? inputElement.children('.md-meta:not(.md-content)')
              : inputElement
                  .find('[md-inline="' + styleType + '"]')
                  .children('.md-meta:not(.md-content)')),
            selectionBookmark && (selectionBookmark.end -= syntaxElements.text().length),
            syntaxElements.remove(),
            inputElement
              .children('.md-meta')
              .filter(function () {
                return 0 == (this.textContent || '').length;
              })
              .remove(),
            inputElement.attr('md-inline') == styleType &&
              selectionBookmark &&
              (selectionBookmark.end = selectionBookmark.start + inputElement.text().length);
        }
        if (
          (element[0].hasAttribute('mdtype') &&
            (element.wrapInner('<span></span>'), (element = $(element[0].firstChild))),
          selectionBookmark
            ? ((selectionBookmark.containerNode = element[0]),
              range.moveToBookmark(selectionBookmark))
            : range.selectNode(element[0]),
          range.commonAncestorContainer.nodeType == document.ELEMENT_NODE &&
            range.commonAncestorContainer.getAttribute('md-inline') == styleType)
        )
          a($(range.commonAncestorContainer));
        else {
          for (
            var SPANElement = document.createElement('SPAN'),
              selectedFragment = range.extractContents(),
              itemIndex = 0;
            itemIndex < selectedFragment.childNodes.length;
            itemIndex++
          )
            SPANElement.appendChild(selectedFragment.childNodes[itemIndex].cloneNode(!0));
          a($(SPANElement)),
            SPANElement.childNodes.length != SPANElement.childElementCount ||
              1 != SPANElement.childNodes.length ||
              SPANElement.childNodes[0].getAttribute('md-inline') ||
              (SPANElement = SPANElement.childNodes[0]),
            range.insertNode(SPANElement),
            range.setStart(SPANElement, 0),
            range.setEnd(SPANElement, SPANElement.childNodes.length);
        }
        return (
          removeOnly ||
            g.call(this, range, styleType, element[0], restoreSelection ? selectionBookmark : null),
          this.editor.brush.addToQueue(element.attr('cid')),
          range
        );
      },
      m = function (treePosition, selectionRange) {
        return selectionRange.collapsed &&
          treePosition[2] === treePosition[1] &&
          DocumentNode.isType(treePosition[1], NodeType.line)
          ? [treePosition[0], treePosition[1].getFirstBrother(), treePosition[1].getLastBrother()]
          : treePosition;
      },
      g = function (range, styleType, containerNode, inputEnd) {
        if (DocumentNode.isType(styleType, NodeType.link, NodeType.image))
          v.call(this, range, styleType, containerNode, inputEnd);
        else if (
          range.commonAncestorContainer == range.startContainer &&
          range.startContainer == range.endContainer
        ) {
          var items = (function (inputRange) {
              var itemIndex,
                currentItems = [],
                segmentStartIndex = 0,
                commonAncestorContainer = inputRange.commonAncestorContainer;
              if (!commonAncestorContainer.childElementCount) return [inputRange];
              function o() {
                if (itemIndex != segmentStartIndex && 0 != itemIndex) {
                  var currentRange = rangy.createRange();
                  currentRange.setStart(commonAncestorContainer.children[segmentStartIndex], 0),
                    currentRange.setEndAfter(commonAncestorContainer.children[itemIndex - 1]),
                    currentItems.push(currentRange);
                }
              }
              for (
                itemIndex = 0;
                itemIndex < commonAncestorContainer.childElementCount;
                itemIndex++
              ) {
                var element = commonAncestorContainer.children[itemIndex];
                element.classList &&
                  element.classList.contains('md-softbreak') &&
                  (o(), (segmentStartIndex = itemIndex + 1));
              }
              return (
                segmentStartIndex < itemIndex &&
                  (segmentStartIndex > 0 ? o() : currentItems.push(inputRange)),
                currentItems
              );
            })(range),
            spansMultipleSegments = items.length > 1,
            receiver = this;
          items.forEach(function (item, itemIndex) {
            var end = v.call(
              receiver,
              item,
              styleType,
              containerNode,
              itemIndex == items.length - 1 ? inputEnd : void 0,
              spansMultipleSegments,
            );
            inputEnd &&
              end &&
              (inputEnd instanceof Object ? (inputEnd.end += end) : (inputEnd += end));
          });
        } else v.call(this, range, styleType, containerNode, inputEnd);
      },
      v = function (range, styleType, containerNode, inputStart, includeSyntaxInSelection) {
        var text,
          selectionBookmark,
          start,
          end,
          closingSyntax,
          clipboardText,
          syntaxPair = CONST.SyntaxMap[styleType];
        if (inputStart) {
          var rangeAdjusted,
            element = this.editor.getJQueryElem(range.startContainer),
            currentElement = this.editor.getJQueryElem(range.endContainer);
          if (
            (element.closest('md-before').length || element.closest('md-content').length
              ? (range.setStartBefore(element.closest('[md-inline]')[0]), (rangeAdjusted = !0))
              : element.closest('md-meta').length &&
                (range.setStartAfter(element.closest('[md-inline]')[0]), (rangeAdjusted = !0)),
            currentElement.closest('md-after').length || element.closest('md-content').length
              ? (range.setEndAfter(element.closest('[md-inline]')[0]), (rangeAdjusted = !0))
              : currentElement.closest('md-meta').length &&
                (range.setEndBefore(element.closest('[md-inline]')[0]), (rangeAdjusted = !0)),
            (text = range.toString()),
            range.collapsed || 0 === text.trim())
          )
            return;
          selectionBookmark = rangeAdjusted
            ? selectionBookmark ||
              range.getBookmark(
                containerNode && document.body.contains(containerNode)
                  ? containerNode
                  : range.commonAncestorContainer,
              )
            : inputStart instanceof Object
              ? inputStart
              : { start: inputStart, end: inputStart };
        } else text = range.toString();
        return (
          (start = /^\s+/g.exec(text)),
          (end = /\s+$/g.exec(text)),
          (start = start ? start[0].length : 0),
          (end = end ? end[0].length : 0),
          (start || end) &&
            (((selectionBookmark =
              selectionBookmark ||
              range.getBookmark(
                containerNode && document.body.contains(containerNode)
                  ? containerNode
                  : range.commonAncestorContainer || range.commonAncestorContainer,
              )).start += start),
            (selectionBookmark.end -= end),
            range.moveToBookmark(selectionBookmark)),
          (closingSyntax = syntaxPair[1]),
          (clipboardText = JSBridge.clipboard.readText()) &&
            clipboardText.length > 5e3 &&
            (clipboardText = ''),
          DocumentNode.isType(styleType, NodeType.link)
            ? utilities.isURL(text)
              ? (closingSyntax = '](' + text + ')')
              : utilities.isURL(clipboardText) &&
                (closingSyntax = '](' + clipboardText.trim() + ')')
            : DocumentNode.isType(styleType, NodeType.image) &&
              (utilities.isImg(text)
                ? (closingSyntax = '](' + text + ')')
                : utilities.isImg(clipboardText) && (closingSyntax = '](' + clipboardText + ')')),
          range.insertNodeAtEnd(document.createTextNode(closingSyntax)),
          range.insertNode(document.createTextNode(syntaxPair[0])),
          inputStart &&
            (DocumentNode.isType(styleType, NodeType.link)
              ? range.moveToBookmark({
                  containerNode: containerNode,
                  start: selectionBookmark.start + 1,
                  end: 1 + selectionBookmark.end,
                })
              : range.moveToBookmark({
                  containerNode: containerNode,
                  start:
                    selectionBookmark.start + (includeSyntaxInSelection ? 0 : syntaxPair[0].length),
                  end:
                    selectionBookmark.end +
                    syntaxPair[0].length +
                    (includeSyntaxInSelection ? syntaxPair[1].length : 0),
                }),
            editor.selection.setRange(range, !0)),
          (syntaxPair[0] || '').length + (syntaxPair[1] || '').length
        );
      },
      y = function (range, styleType, removeOnly) {
        var currentEditor = this.editor;
        function r(documentNode) {
          var children = documentNode.get('children');
          if (children.length) children.toArray().map(r);
          else if (currentEditor.stylize.canContainInline(documentNode.get('type'))) {
            currentEditor.findElemById(documentNode.id).text().length &&
              (currentEditor.stylize.putStyleInBlock(
                currentEditor.findElemById(documentNode.id),
                styleType,
                void 0,
                void 0,
                !0,
                removeOnly,
              ),
              currentEditor.store(documentNode),
              currentEditor.brush.addToQueue(documentNode.id));
          }
          return documentNode;
        }
        currentEditor.undo.endSnap(!0);
        var startPosition = currentEditor.selection.getDetailPos(
            range.startContainer,
            range.startOffset,
          ),
          endPosition = currentEditor.selection.getDetailPos(range.endContainer, range.endOffset),
          element = currentEditor.getMarkElem(startPosition[0]),
          currentElement = currentEditor.getMarkElem(endPosition[0]),
          startNode = currentEditor.findNodeByElem(element),
          endNode = currentEditor.findNodeByElem(currentElement);
        if (startNode && endNode) {
          var treePosition = DocumentNode.getTreePosition(startNode, endNode),
            currentDocumentNode = treePosition[1],
            lastBlock = treePosition[2],
            formatCommand = undoManager.makeEmptyCommand(currentEditor.selection.buildUndo()),
            endRange = range.cloneRange(),
            startRange = range.cloneRange(),
            localDocumentNode = currentDocumentNode;
          for (
            formatCommand.undo.push(undoManager.buildReplaceUndo(currentDocumentNode)),
              startRange.setEndAfter(element[0]),
              this.canContainInline(startNode) &&
                startRange.toString().length &&
                (this.putStyleInBlock(
                  element,
                  styleType,
                  startRange.getBookmark(element[0]),
                  void 0,
                  !0,
                  removeOnly,
                ),
                currentEditor.store(startNode, !0)),
              currentEditor.UserOp.decorateOneSide(startNode, currentDocumentNode, 'after', r),
              formatCommand.redo.push(undoManager.buildReplaceUndo(currentDocumentNode)),
              currentEditor.brush.addToQueue(element.attr('cid')),
              localDocumentNode = currentDocumentNode.get('after');
            localDocumentNode && localDocumentNode !== lastBlock;
          )
            formatCommand.undo.push(undoManager.buildReplaceUndo(localDocumentNode)),
              r(localDocumentNode),
              formatCommand.redo.push(undoManager.buildReplaceUndo(localDocumentNode)),
              (localDocumentNode = localDocumentNode.get('after'));
          endNode &&
            endNode != currentDocumentNode &&
            (endRange.setStartBefore(currentElement[0]),
            endRange.toString().length &&
              (formatCommand.undo.push(undoManager.buildReplaceUndo(lastBlock)),
              this.canContainInline(endNode) &&
                (this.putStyleInBlock(
                  currentElement,
                  styleType,
                  endRange.getBookmark(currentElement[0]),
                  void 0,
                  !0,
                  removeOnly,
                ),
                currentEditor.store(endNode, !0)),
              currentEditor.UserOp.decorateOneSide(endNode, lastBlock, 'before', r),
              formatCommand.redo.push(undoManager.buildReplaceUndo(lastBlock)),
              currentEditor.brush.addToQueue(currentElement.attr('cid')))),
            formatCommand.redo.push(currentEditor.selection.buildUndo()),
            currentEditor.undo.register(formatCommand),
            $('.md-expand').removeClass('md-expand'),
            currentEditor.brush.resume(!0);
        } else currentEditor.brush.resume(!0);
      };
    function b(editorInstance, inputElement, blockElement, styleType) {
      var replacementText,
        element = inputElement.closest('[md-inline="' + styleType + '"]');
      element.length ||
        'link' != styleType ||
        (element = inputElement.closest('[md-inline="reflink"], [md-inline="autolink"]')),
        'image' == styleType &&
          (element.length
            ? (replacementText = /!\[([^\]]*)\]/.exec(element.text())[1])
            : replacementText ||
              ((element = inputElement.closest('[md-inline="refimg"]')).length
                ? (replacementText = /!\[((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*)\]/.exec(
                    element.text(),
                  )[1])
                : (element = inputElement.closest('.md-url').closest('[md-inline]')).length &&
                  (replacementText = '!' + element.text()))),
        styleType == NodeType.comment &&
          (replacementText = element.text().replace(/(^<\!--)|(-->)$/g, ''));
      var blockNode = editorInstance.findNodeByElem(blockElement);
      replacementText
        ? (element.text(replacementText), editorInstance.selection.selectAllElem(element))
        : (element.children('.md-meta, .md-content').remove(),
          editorInstance.brush.addToQueue(element.closest('[cid]').attr('cid'), !0)),
        blockNode && editorInstance.undo.addSnap(blockNode.id, SnapFlag.REPLACE);
    }
    class w {
      constructor(inputEditor) {
        (this.editor = inputEditor), (this.CONST = CONST), this.putBookmark(null, { block: [] });
      }
      removeStyle(element, unusedParameter2, unusedParameter3) {
        element.children('.md-meta').remove();
      }
      canContainInline(element) {
        return (
          element.jquery && (element = element.attr('mdtype')),
          DocumentNode.isType(
            element,
            NodeType.paragraph,
            NodeType.def_footnote,
            NodeType.heading,
            NodeType.table_cell,
          )
        );
      }
      putStyle(range, searchValue, toggleExisting) {
        this.editor.selection.deRange(range), this.editor.undo.endSnap(!0);
        var removeOnly,
          element = this.editor.getMarkElem(range.commonAncestorContainer),
          isInlineInsertion = CONST.InsertInline.indexOf(searchValue) > -1;
        if (
          (isInlineInsertion && (element = this.editor.getMarkElem(range.startContainer)),
          element.length && 0 === element.find('[mdtype]').length && this.canContainInline(element))
        ) {
          var formatCommand = undoManager.makeEmptyCommand(this.editor.selection.buildUndo()),
            blockNode = this.editor.store(element.attr('cid'));
          formatCommand.undo.push(undoManager.buildReplaceUndo(blockNode)),
            (removeOnly = toggleExisting && this.hasStyleInRange(searchValue, range, !0)),
            (range = this.putStyleForRange(element, searchValue, range, !0, removeOnly)).select(),
            this.editor.store(element.attr('cid')),
            formatCommand.redo.push(undoManager.buildReplaceUndo(blockNode)),
            formatCommand.redo.push(this.editor.selection.buildUndo()),
            this.editor.undo.register(formatCommand),
            this.editor.brush.addToQueue(blockNode.id, !0);
        } else if (!isInlineInsertion)
          return (
            (removeOnly = toggleExisting && this.hasStyleInRange(searchValue, range, !1)),
            y.call(this, range, searchValue, removeOnly)
          );
      }
      putStyleInBlock(
        element,
        styleType,
        selectionBookmark,
        restoreSelection,
        skipEmpty,
        removeOnly,
      ) {
        if (!skipEmpty || 0 != element.text().length) {
          element[0].hasAttribute('mdtype') && element.addClass('md-expand');
          try {
            return f.call(
              this,
              element,
              styleType,
              selectionBookmark,
              restoreSelection,
              removeOnly,
            );
          } catch (error) {
            console.error(error);
          }
        }
      }
      putStyleForRange(element, styleType, range, restoreSelection, removeOnly) {
        var selectionBookmark = range.getBookmark(element[0]);
        return (
          element[0].hasAttribute('mdtype') &&
            range.commonAncestorContainer.nodeType != document.TEXT_NODE &&
            element.addClass('md-expand'),
          f.call(this, element, styleType, selectionBookmark, restoreSelection, removeOnly)
        );
      }
      addStyle(node, attributeValue) {
        console.debug('addStyle ' + attributeValue);
        var trimmedText,
          syntaxPair = CONST.SyntaxMap[attributeValue],
          SPANElement = document.createElement('SPAN');
        (SPANElement.className = 'md-meta md-expand'),
          SPANElement.setAttribute('md-inline', attributeValue),
          ('link' != attributeValue && 'image' != attributeValue) ||
            ((trimmedText = (trimmedText = JSBridge.clipboard.readText() || '').trim()),
            'link' == attributeValue &&
              (utilities.isURL(trimmedText) ||
              (!/[^.a-z0-9\\\/% _#@]/i.exec(trimmedText) &&
                trimmedText.length < 256 &&
                ((/[\\\/]/.exec(trimmedText) && !/[\\\/.][\s]/.exec(trimmedText)) ||
                  /\.[a-z]+$/.exec(trimmedText)))
                ? (syntaxPair[1] = '](' + trimmedText + ')')
                : (syntaxPair[1] = ']()')),
            'image' == attributeValue &&
              (utilities.isImg(trimmedText)
                ? (syntaxPair[1] = '](' + trimmedText + ')')
                : (syntaxPair[1] = ']()'))),
          SPANElement.appendChild(document.createTextNode(syntaxPair[0] + syntaxPair[1])),
          node.insertNode(SPANElement),
          node.moveToBookmark({
            containerNode: SPANElement,
            start: syntaxPair[0].length,
            end: syntaxPair[0].length,
          }),
          this.editor.selection.rangy.getSelection().setSingleRange(node);
      }
      detach(range, styleType) {
        return (
          !(
            !range.collapsed ||
            !$.parseHTML('<div>' + range.toHtml() + '</div>')[0].querySelector(
              '[md-inline="' + styleType + '"]',
            )
          ) || $(range.commonAncestorContainer).closest('[md-inline="' + styleType + '"]').length
        );
      }
      canToggleStyle(styleType, element, allowMetadata, excludedStyles) {
        excludedStyles = excludedStyles || this.CONST.NoInline;
        var hasExcludedStyle = (function (styleState) {
          for (var itemIndex = 0; itemIndex < excludedStyles.length; itemIndex++)
            if (styleState.hasStyle(excludedStyles[itemIndex])) return !0;
        })(this);
        return (
          !!this.hasStyle(styleType) ||
          (!(
            hasExcludedStyle ||
            (/(md-meta|md-content)(\s+|$)/g.exec(element[0].className) && !allowMetadata) ||
            /md-blockmeta/g.exec(element[0].className)
          ) &&
            !hasExcludedStyle)
        );
      }
      clearStyle() {
        if (
          window.getSelection().rangeCount &&
          !isInputComponent(document.activeElement) &&
          !File.isLocked
        ) {
          this.editor.brush.clearAndPause();
          var range = this.editor.selection.getRangy();
          if ((this.editor.undo.endSnap(!0), range)) {
            for (
              var visitedNode,
                clearCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo()),
                startPosition = editor.selection.getDetailPos(
                  range.startContainer,
                  range.startOffset,
                ),
                endPosition = editor.selection.getDetailPos(range.endContainer, range.endOffset),
                startElement = editor.getMarkElem(startPosition[0]),
                endElement = editor.getMarkElem(endPosition[0]),
                startNode = editor.findNodeByElem(startElement),
                endNode = editor.findNodeByElem(endElement),
                treePosition = DocumentNode.getTreePosition(startNode, endNode),
                currentBlock = treePosition[1],
                documentNode = treePosition[2],
                currentDocumentNode = currentBlock,
                items = [];
              currentDocumentNode && currentDocumentNode != documentNode.get('after');
            )
              (visitedNode = currentDocumentNode),
                (currentDocumentNode = currentDocumentNode.get('after')),
                this.editor
                  .findElemById(visitedNode.id)
                  .find('.md-meta, .md-content')
                  .each(function () {
                    var nodeId = this.closest('[cid]').getAttribute('cid');
                    -1 == items.indexOf(nodeId) && items.push(nodeId);
                  })
                  .remove();
            items.forEach((nodeId) => {
              var localDocumentNode = editor.getNode(nodeId);
              clearCommand.undo.push(undoManager.buildReplaceUndo(localDocumentNode)),
                this.editor.store(nodeId),
                this.editor.brush.addToQueue(nodeId),
                clearCommand.redo.push(undoManager.buildReplaceUndo(localDocumentNode));
            }),
              this.editor.undo.register(clearCommand);
          }
          this.editor.brush.resume(), this.editor.brush.expand();
        }
      }
      toggleStyle(styleType) {
        if (
          !File.isLocked &&
          window.getSelection().rangeCount &&
          'INPUT' != document.activeElement.tagName &&
          'TEXTAREA' != document.activeElement.tagName &&
          !File.isLocked
        ) {
          var start,
            blockNode,
            range = this.editor.selection.getRangy(),
            hasCurrentStyle = this.hasStyle(styleType),
            element = this.editor.getJQueryElem(range.commonAncestorContainer),
            currentElement = this.editor.getMarkElem(range.commonAncestorContainer);
          if (!hasCurrentStyle) {
            var localElement = this.editor.getJQueryElem(range.startContainer);
            'link' == styleType &&
              (hasCurrentStyle = localElement.closest(
                '[md-inline="reflink"], [md-inline="autolink"]',
              ).length),
              'image' == styleType &&
                (hasCurrentStyle = localElement.closest('[md-inline="refimg"], .md-url').length);
          }
          this.editor.brush.pause();
          do {
            if (!this.canToggleStyle(styleType, element, range.collapsed, this.CONST.NoInlineBlock))
              break;
            if (
              !this.canToggleStyle(
                styleType,
                element,
                range.collapsed,
                this.CONST.NoInlineInline,
              ) &&
              !1 === f(range, element.closest('[md-inline]')[0])
            )
              break;
            if (hasCurrentStyle) b(this.editor, element, currentElement, styleType);
            else {
              if (!range.collapsed) {
                this.putStyle(range, styleType, !0);
                break;
              }
              if (!(blockNode = this.editor.findNodeByElem(currentElement))) return;
              this.editor.undo.addSnap(blockNode.id, SnapFlag.NONE),
                (start = range.getBookmark(currentElement[0]).start);
              var textSlice = currentElement.text().substring(start - 1, start + 1),
                emptyStrongSyntax =
                  '**' == textSlice &&
                  $(range.startContainer).closest("[md-inline='plain']").length;
              styleType == NodeType.em && emptyStrongSyntax
                ? (range.moveToBookmark({
                    containerNode: currentElement[0],
                    start: start - 1,
                    end: start + 1,
                  }),
                  range.extractContents())
                : p(range, textSlice)
                  ? this.addStyle(range, styleType)
                  : (currentElement.addClass('md-expand'),
                    emptyStrongSyntax ||
                      styleType == NodeType.image ||
                      this.editor.selection.selectWord(!0, !1, range),
                    (range = this.editor.selection.getRangy()).collapsed
                      ? this.addStyle(range, styleType)
                      : g.call(this, range, styleType, currentElement[0], start)),
                this.editor.undo.addSnap(blockNode.id, SnapFlag.REPLACE);
            }
            if (
              (this.editor.brush.addToQueue(currentElement.attr('cid')),
              styleType == NodeType.inline_math && !hasCurrentStyle)
            ) {
              var currentEditor = this.editor;
              setTimeout(function () {
                currentEditor.brush.triggerAutoComplete(!0);
              }, 100);
            }
          } while (0);
          this.editor.brush.resume(!0);
        }
        function p(selectionRange, selectedText) {
          return (
            !selectedText ||
            (selectionRange.collapsed &&
              /^[\(\)\[\]\^&_\-+*#@!~`\\\/\{\}'":;<>,.?%\s]+$/.exec(selectedText))
          );
        }
        function f(inputRange, containerNode) {
          if (containerNode && inputRange) {
            if (0 !== inputRange.startOffset) return !1;
            for (
              var startContainer = inputRange.startContainer;
              containerNode.contains(startContainer);
            ) {
              if (startContainer.previousElementSibling) return !1;
              startContainer = startContainer.parent;
            }
            if (inputRange.endOffset !== inputRange.endContainer.length) return !1;
            for (
              var endContainer = inputRange.endContainer;
              containerNode.contains(endContainer);
            ) {
              if (endContainer.nextElementSibling) return !1;
              endContainer = endContainer.parent;
            }
            return !0;
          }
        }
      }
      putBookmark(cursor, style) {
        return (this.editor.styleBookmark = { cursor: cursor, style: style });
      }
      isAtFootnoteDefSpan() {
        var range = this.editor.selection.getRangy();
        return (
          range && this.editor.getJQueryElem(range.startContainer).closest('.md-def-name').length
        );
      }
      buildBookmark(inputElement) {
        if (File.ignoreStyleChange) return File.editor.styleBookmark.style;
        var searchValue,
          styleBookmark = { inline: [], block: [], state: '' },
          range = this.editor.selection.getRangy(),
          element = (inputElement =
            inputElement ||
            this.editor.getJQueryElem(
              (range && range.commonAncestorContainer) || document.activeElement,
            ) ||
            $()).closest('[md-inline]'),
          currentElement = inputElement;
        if (0 == inputElement.length) {
          if (
            !(inputElement = this.editor.getMarkElem()).length ||
            !DocumentNode.isType(
              inputElement.attr('mdtype'),
              DocumentNode.TYPE.hr,
              DocumentNode.TYPE.toc,
            )
          )
            return styleBookmark;
          currentElement = inputElement;
        }
        for (; element.length; )
          (searchValue = element.attr('md-inline')),
            this.CONST.LinkList.indexOf(searchValue) > -1 && (searchValue = 'link'),
            styleBookmark.inline.push(searchValue),
            (currentElement = element),
            (element = element.parent().closest('[md-inline]')),
            DocumentNode.isType(searchValue, 'image', 'imgtag', 'refimg') &&
              (File.isTextBundle() || File.isTextPack()) &&
              /^assets[\/\\]/.exec(element.attr('data-src')) &&
              styleBookmark.inline.push('embed-resource');
        for (element = currentElement.closest('[mdtype], [mdlike]'); element.length; ) {
          if ((searchValue = element.attr('mdlike') || element.attr('mdtype')) === NodeType.heading)
            styleBookmark.block.push('header' + element[0].tagName.substring(1));
          else if (searchValue === NodeType.list) {
            var blockNode = this.editor.findNodeByElem(element);
            blockNode && styleBookmark.block.push(p(blockNode));
          } else
            searchValue === NodeType.list_item
              ? element.hasClass('md-task-list-item') &&
                !styleBookmark.state &&
                (styleBookmark.state = element.hasClass('task-list-done') ? 'checked' : 'unchecked')
              : ((searchValue = searchValue.replace(/^h([1-6])$/, 'header$1')),
                styleBookmark.block.push(searchValue));
          element = element.parent().closest('[mdtype]');
        }
        return (
          (styleBookmark.canContainInline = CONST.NoInline.indexOf(styleBookmark.block[0]) > -1),
          (styleBookmark.textSelected =
            CONST.Selectable.indexOf(styleBookmark.block[0]) > -1 || (range && !range.collapsed)),
          (styleBookmark.rangeSelected = range && !range.collapsed),
          styleBookmark
        );
      }
      hasStyleInRange(styleType, selectionRange, wrapHtml) {
        var selectedHtml = selectionRange.toHtml();
        return (
          wrapHtml && (selectedHtml = '<div>' + selectedHtml + '</div>'),
          0 ==
            $(selectedHtml)
              .find("[md-inline='" + styleType + "']")
              .remove()
              .end()
              .text()
              .trim().length
        );
      }
      hasStyle(searchValue) {
        var style = this.editor.styleBookmark.style;
        if (style)
          return (
            (style.inline || []).indexOf(searchValue) > -1 ||
            (style.block || []).indexOf(searchValue) > -1
          );
      }
      changeStyleFromMenu(text) {
        if (!File.isLocked && !document.body.classList.contains('modal-open')) {
          var styleType = CONST.NameMapToStyle[text.toLowerCase()];
          DocumentNode.isType(
            styleType,
            'header1',
            'header2',
            'header3',
            'header4',
            'header5',
            'header6',
            NodeType.paragraph,
          )
            ? this.changeBlock(styleType)
            : DocumentNode.isType(
                  styleType,
                  NodeType.def_footnote,
                  NodeType.def_link,
                  NodeType.hr,
                  NodeType.fences,
                  NodeType.math_block,
                  NodeType.toc,
                )
              ? this.insertBlock(styleType)
              : DocumentNode.isType(styleType, NodeType.table)
                ? File.editor.tableEdit.insertTable()
                : DocumentNode.isType(styleType, NodeType.meta_block)
                  ? this.insertMetaBlock()
                  : DocumentNode.isType(styleType, NodeType.blockquote) &&
                    this.toggleIndent(NodeType.blockquote);
        }
      }
      changeBetweenCodeMirror(targetType, documentNode) {
        if (DocumentNode.isType(documentNode, NodeType.math_block, NodeType.fences)) {
          var currentEditor = this.editor,
            changeCommand = undoManager.makeEmptyCommand(currentEditor.selection.buildUndo());
          if (
            (currentEditor.undo.endSnap(!0),
            DocumentNode.isType(documentNode, NodeType.fences)
              ? (currentEditor.fences.syncToNode(documentNode.cid),
                currentEditor.fences.beforeDeleteFences(documentNode))
              : (currentEditor.mathBlock.syncToNode(documentNode.cid),
                currentEditor.mathBlock.beforeDeleteFences(documentNode)),
            changeCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
            documentNode.set('type', targetType),
            targetType === NodeType.fences)
          ) {
            var suggestedLanguage = currentEditor.fences.getCodeLangSuggest(!0);
            documentNode.set('lang', suggestedLanguage);
          }
          changeCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
            currentEditor.findElemById(documentNode.id).replaceWith(documentNode.toHTML()),
            targetType == NodeType.fences
              ? currentEditor.fences.getCm(documentNode.id)
              : targetType == NodeType.math_block &&
                currentEditor.mathBlock.startEditing(documentNode.id),
            currentEditor.selection.jumpIntoElemBegin(currentEditor.findElemById(documentNode.id)),
            changeCommand.redo.push(currentEditor.selection.buildUndo()),
            currentEditor.undo.register(changeCommand),
            currentEditor.refocus(),
            documentMenu.refreshBlockMenu();
        }
      }
      toggleFences() {
        if (!File.isLocked && !document.body.classList.contains('modal-open')) {
          var documentNode = this.editor.getNode(null, !0, !0);
          if (DocumentNode.isType(documentNode, NodeType.fences)) {
            var lang = this.editor.fences.getCodeLangSuggest(!0);
            this.changeBlock(NodeType.paragraph, documentNode, void 0, { lang: lang });
          } else
            DocumentNode.isType(documentNode, NodeType.math_block)
              ? this.changeBetweenCodeMirror(NodeType.fences, documentNode)
              : this.insertBlock(NodeType.fences);
        }
      }
      toggleMathBlock() {
        if (!File.isLocked && !document.body.classList.contains('modal-open')) {
          var documentNode = this.editor.getNode(null, !0, !0);
          DocumentNode.isType(documentNode, NodeType.math_block)
            ? this.changeBlock(NodeType.paragraph, documentNode)
            : DocumentNode.isType(documentNode, NodeType.fences)
              ? this.changeBetweenCodeMirror(NodeType.math_block, documentNode)
              : this.insertBlock(NodeType.math_block);
        }
      }
      changeBlock(paragraph, documentNode, toggleHeading, attributes) {
        if (
          !File.isLocked &&
          !document.body.classList.contains('modal-open') &&
          (documentNode = documentNode || this.editor.getNode(null, !0, !0))
        ) {
          var changeCommand,
            markerPattern,
            headingDepth,
            selectionSnapshot,
            currentBlockType = CONST.getMenuBlockType(documentNode),
            currentEditor = this.editor,
            nodeId = documentNode.cid;
          if (
            (currentEditor.undo.endSnap(!0),
            DocumentNode.isType(
              currentBlockType,
              NodeType.math_block,
              NodeType.html_block,
              NodeType.table,
            ))
          )
            currentEditor.UserOp.insertParagraph();
          else if (
            !DocumentNode.isType(
              documentNode,
              NodeType.table_row,
              NodeType.table_cell,
              NodeType.blockquote,
              NodeType.list,
              NodeType.list_item,
            ) &&
            (File.option.expandSimpleBlock &&
              DocumentNode.isType(currentBlockType, NodeType.paragraph) &&
              documentNode.get('depth') > 0 &&
              (currentBlockType = 'header' + documentNode.get('depth')),
            (currentEditor.lastCursor =
              currentEditor.selection.buildUndo() || currentEditor.selection.selectionBeforeBlur),
            currentBlockType == paragraph &&
              toggleHeading &&
              DocumentNode.isType(documentNode, NodeType.heading) &&
              (paragraph = NodeType.paragraph),
            (currentBlockType != NodeType.paragraph && !~currentBlockType.indexOf('head')) ||
              (paragraph != NodeType.paragraph && !~paragraph.indexOf('head')) ||
              (selectionSnapshot = currentEditor.selection.buildUndo()),
            currentBlockType != paragraph && currentBlockType)
          ) {
            if (
              (DocumentNode.isType(currentBlockType, NodeType.fences) &&
                (currentEditor.fences.syncToNode(documentNode.cid),
                currentEditor.fences.beforeDeleteFences(documentNode)),
              (changeCommand = undoManager.makeEmptyCommand(currentEditor.lastCursor)).undo.push(
                undoManager.buildReplaceUndo(documentNode),
              ),
              DocumentNode.isType(currentBlockType, NodeType.def_link) &&
                documentNode.set(
                  'text',
                  (documentNode.get('href') || '') +
                    (documentNode.get('tittle') ? ' "' + documentNode.get('tittle') + '"' : ''),
                ),
              0 == paragraph.indexOf('header'))
            )
              (headingDepth = paragraph.substr(6) - 0),
                (markerPattern = documentNode.get('pattern')) && /-|=/.exec(markerPattern)
                  ? (markerPattern =
                      headingDepth <= 2
                        ? markerPattern.replace(/-|=/g, 1 == headingDepth ? '=' : '-')
                        : void 0)
                  : markerPattern &&
                    (markerPattern = markerPattern.replace(/#+/g, '#'.repeat(headingDepth))),
                (documentNode = DocumentNode.isType(documentNode, NodeType.paragraph)
                  ? File.option.expandSimpleBlock &&
                    documentNode.get('depth') &&
                    /^#/.exec(documentNode.get('text'))
                    ? (function (headingDepth, unusedParameter2, deferRender) {
                        ((selectionSnapshot = Object.clone(changeCommand.undo[0])).start +=
                          headingDepth - documentNode.get('depth')),
                          (selectionSnapshot.end += headingDepth - documentNode.get('depth')),
                          documentNode.set('depth', headingDepth);
                        var text = documentNode.get('text');
                        if (
                          ((text = text
                            .replace(/^#+/, '#'.repeat(headingDepth))
                            .replace(/#+$/, '#'.repeat(headingDepth))),
                          documentNode.set('text', text),
                          !deferRender)
                        ) {
                          var renderedHtml = markdownParser.renderHtmlWithBlockMeta(
                            documentNode,
                            File.editor.brush,
                          );
                          currentEditor.findElemById(documentNode.id).replaceWith(renderedHtml);
                        }
                        return (
                          changeCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
                          documentNode
                        );
                      })(headingDepth)
                    : (function (headingDepth, headingPattern) {
                        var splitNodes = (function () {
                          var precedingParagraph,
                            followingParagraph,
                            text = documentNode.get('text') || '',
                            textLines = text.split(/\n/) || [];
                          if ((documentNode.set('text', text), !textLines.length))
                            return [precedingParagraph, documentNode, followingParagraph];
                          var cursorLine = utilities.findLine(text, currentEditor.lastCursor.start);
                          return (
                            documentNode.set('text', cursorLine.line),
                            cursorLine.start > 0 &&
                              ((precedingParagraph = documentNode.addBefore(
                                new DocumentNode({
                                  type: NodeType.paragraph,
                                  text: text.substring(0, cursorLine.start - 1),
                                }),
                              )),
                              undoManager.addUndoForInsert(changeCommand, precedingParagraph)),
                            cursorLine.start + cursorLine.line.length < text.length &&
                              ((followingParagraph = documentNode.addAfter(
                                new DocumentNode({
                                  type: NodeType.paragraph,
                                  text: text.substring(
                                    cursorLine.start + cursorLine.line.length + 1,
                                  ),
                                }),
                              )),
                              undoManager.addUndoForInsert(changeCommand, followingParagraph)),
                            ((selectionSnapshot = Object.clone(changeCommand.undo[0])).start -=
                              cursorLine.start),
                            (selectionSnapshot.end -= cursorLine.start),
                            [precedingParagraph, documentNode, followingParagraph]
                          );
                        })();
                        C(headingDepth, headingPattern, !0);
                        var replacementHtml =
                          (splitNodes[0] ? splitNodes[0].toHTML() : '') +
                          splitNodes[1].toHTML() +
                          (splitNodes[2] ? splitNodes[2].toHTML() : '');
                        return (
                          currentEditor.findElemById(documentNode.id).replaceWith(replacementHtml),
                          splitNodes[1]
                        );
                      })(headingDepth, markerPattern)
                  : C(headingDepth, markerPattern));
            else {
              var parseResult;
              DocumentNode.isType(documentNode, NodeType.paragraph) &&
                currentBlockType !== NodeType.paragraph &&
                documentNode.set('text', documentNode.get('text').replace(/^#+\s*/, '')),
                documentNode.set('type', paragraph),
                attributes &&
                  Object.keys(attributes).forEach((item) => {
                    void 0 !== attributes[item] && documentNode.set(item, attributes[item]);
                  }),
                documentNode.set('pattern', void 0),
                DocumentNode.isType(documentNode, NodeType.paragraph) ||
                  currentBlockType != NodeType.paragraph ||
                  documentNode.set('text', documentNode.get('text').replace(/\r?\n/g, ' ')),
                DocumentNode.isType(currentBlockType, NodeType.meta_block, NodeType.fences) &&
                  DocumentNode.isType(documentNode, NodeType.paragraph) &&
                  (documentNode.set('type', NodeType.raw_edit),
                  (parseResult = currentEditor.simpleParse(documentNode)) ||
                    documentNode.set('type', NodeType.paragraph));
              var range = rangy.createRange();
              if (parseResult) {
                var parsedElements = $(parseResult[1]),
                  currentNodeId = parsedElements[0].getAttribute('cid'),
                  localNodeId = parsedElements.last()[0].getAttribute('cid');
                currentEditor.findElemById(parseResult[2]).replaceWith(parseResult[1]),
                  parseResult && undoManager.append(changeCommand, parseResult[0]),
                  range.setStartBefore(currentEditor.findElemById(currentNodeId)[0]),
                  range.setEndAfter(currentEditor.findElemById(localNodeId)[0]);
              } else
                DocumentNode.normalizeNode(documentNode),
                  changeCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
                  currentEditor.findElemById(documentNode.id).replaceWith(documentNode.toHTML()),
                  currentEditor.lastCursor && currentEditor.lastCursor.pos
                    ? range.moveToBookmark({
                        containerNode: currentEditor.findElemById(documentNode.id)[0],
                        start: currentEditor.lastCursor.pos.ch,
                        end: currentEditor.lastCursor.pos.ch,
                      })
                    : (range.setStartBefore(currentEditor.findElemById(documentNode.id)[0]),
                      range.setEndAfter(currentEditor.findElemById(documentNode.id)[0]));
              (range = currentEditor.selection.deRange(range, !0)),
                (selectionSnapshot = selectionSnapshot || currentEditor.selection.buildUndo(range));
            }
            selectionSnapshot ||
              ((selectionSnapshot = Object.clone(changeCommand.undo[0])).startId === nodeId &&
                (selectionSnapshot.startId = documentNode.cid),
              selectionSnapshot.endId === nodeId && (selectionSnapshot.endId = documentNode.cid),
              selectionSnapshot.id === nodeId && (selectionSnapshot.id = documentNode.cid)),
              currentEditor.undo.exeCommand(selectionSnapshot),
              changeCommand.redo.push(selectionSnapshot),
              currentEditor.undo.register(changeCommand),
              currentEditor.refocus();
          }
        }
        function C(headingDepth, headingPattern, deferRender) {
          return (
            documentNode.set('type', NodeType.heading),
            documentNode.set('depth', headingDepth),
            documentNode.set('pattern', headingPattern),
            deferRender ||
              currentEditor.findElemById(documentNode.id).replaceWith(documentNode.toHTML()),
            changeCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
            documentNode
          );
        }
      }
      increaseHeaderLevel() {
        if (!File.isLocked && !document.body.classList.contains('modal-open')) {
          var element = this.editor.getMarkElem(),
            blockType = element.attr('mdtype');
          (blockType != NodeType.heading && blockType != NodeType.paragraph) ||
            this.editor.stylize.changeHeadingLevel(
              this.editor.findNodeByElem(element),
              !0,
              element.attr('mdlike'),
            );
        }
      }
      decreaseHeaderLevel() {
        if (!File.isLocked && !document.body.classList.contains('modal-open')) {
          var element = this.editor.getMarkElem(),
            blockType = element.attr('mdtype');
          (blockType != NodeType.heading && blockType != NodeType.paragraph) ||
            this.editor.stylize.changeHeadingLevel(
              this.editor.findNodeByElem(element),
              !1,
              element.attr('mdlike'),
            );
        }
      }
      insertMetaBlock(returnCommand, text) {
        if (!File.isLocked && !document.body.classList.contains('modal-open')) {
          (text = text || ''), this.editor.undo.endSnap(!0);
          var after = this.editor.nodeMap.getFirst();
          if (!DocumentNode.isType(after, NodeType.meta_block)) {
            this.editor.lastCursor = this.editor.selection.buildUndo();
            var command = undoManager.makeEmptyCommand(
                this.editor.lastCursor || this.editor.selection.buildUndo(),
              ),
              documentNodeInstance = new DocumentNode({
                type: NodeType.meta_block,
                in: this.editor.nodeMap,
                attachTo: this.editor.nodeMap,
                after: after,
                text: text,
              });
            return (
              undoManager.addUndoForInsert(command, documentNodeInstance),
              returnCommand
                ? { command: command, node: documentNodeInstance }
                : (this.editor.findElemById(after.cid).before(documentNodeInstance.toHTML()),
                  this.editor.selection.restoreSelection(
                    this.editor.findElemById(documentNodeInstance.cid),
                    0,
                  ),
                  command.redo.push(this.editor.selection.buildUndo()),
                  this.editor.undo.register(command),
                  this.editor.selection.scrollAdjust(),
                  this.editor.refocus(documentNodeInstance.cid),
                  documentNodeInstance)
            );
          }
        }
      }
      insertAlert(alert, targetElement) {
        var documentNodeInstance,
          currentDocumentNodeInstance,
          documentNode,
          alertElement = targetElement || this.editor.getMarkElem().closest('.md-alert');
        if (alertElement.length) {
          documentNode = (documentNodeInstance =
            this.editor.findNodeByElem(alertElement)).getFirstChild();
          var remainingText,
            alertCommand = undoManager.makeEmptyCommand();
          return (
            documentNodeInstance.get('alert') == alert && (alert = ''),
            alertCommand.undo.push(undoManager.buildReplaceUndo(documentNodeInstance)),
            alertCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
            documentNodeInstance.set('alert', alert),
            (remainingText = alert
              ? documentNode.get('text').replace(/\[\![a-z]+\]/i, `[!${alert.toUpperCase()}]`)
              : documentNode.get('text').replace(/\s*\[\![a-z]+\]\s*/i, '')),
            documentNode.set('text', remainingText),
            alertCommand.redo.push(undoManager.buildReplaceUndo(documentNodeInstance)),
            alertCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
            !remainingText.length &&
              documentNode.get('after') &&
              (undoManager.addUndoForRemove(alertCommand, documentNode), documentNode.remove()),
            this.editor.undo.register(alertCommand),
            alertElement.replaceWith(documentNodeInstance.toHTML()),
            void this.editor.selection.jumpIntoElemEnd(
              this.editor.findElemById(documentNodeInstance.getVeryFirst(!0).id),
            )
          );
        }
        (documentNodeInstance = new DocumentNode({
          type: NodeType.blockquote,
          alert: alert,
        })).appendChild(
          new DocumentNode({ type: NodeType.paragraph, text: '[!' + alert.toUpperCase() + ']' }),
        ),
          (currentDocumentNodeInstance = new DocumentNode({ type: NodeType.paragraph, text: '' })),
          documentNodeInstance.appendChild(currentDocumentNodeInstance),
          this.insertBlock(NodeType.blockquote, documentNodeInstance),
          this.editor.selection.jumpIntoElemEnd(
            this.editor.findElemById(currentDocumentNodeInstance.id),
          );
      }
      insertBlock(type, existingNode) {
        if (
          !(File.isLocked || ('table' != type && document.body.classList.contains('modal-open')))
        ) {
          this.editor.focusAndRestorePos();
          var currentEditor = this.editor,
            selectionRange = currentEditor.selection.getRangy(),
            selectedMarkHtml = '',
            insertCommand = null,
            text = '';
          if (
            (currentEditor.undo.endSnap(!0),
            !selectionRange &&
              currentEditor.selection.selectionBeforeBlur &&
              (currentEditor.undo.exeCommand(currentEditor.selection.selectionBeforeBlur, []),
              (selectionRange = currentEditor.selection.getRangy())),
            !selectionRange || selectionRange.collapsed || existingNode)
          )
            insertCommand = undoManager.makeEmptyCommand();
          else {
            if (
              ((selectedMarkHtml = currentEditor.UserOp.prepMarkHtml(
                selectionRange.toHtml(),
                currentEditor,
              ).html()),
              (text = selectionRange.toString()),
              (insertCommand = currentEditor.UserOp.backspaceHandler(
                currentEditor,
                null,
                'delSelection',
                !0,
              )),
              !(selectionRange = currentEditor.selection.getRangy()))
            )
              return;
            currentEditor.selection.deRange(selectionRange, !0),
              currentEditor.refocus(null, !1, !0, !1, !0);
          }
          var documentNode = currentEditor.getNode(null, !0, !0);
          if (documentNode) {
            var currentBlockType = CONST.getMenuBlockType(documentNode),
              nodeElement = currentEditor.findElemById(documentNode.id);
            currentEditor.lastCursor = currentEditor.selection.buildUndo(selectionRange);
            var currentDocumentNode = existingNode || new DocumentNode({ type: type, text: '' });
            if (!existingNode && type == NodeType.fences) {
              var suggestedLanguage = currentEditor.fences.getCodeLangSuggest(!0);
              currentDocumentNode.set('lang', suggestedLanguage);
            }
            if (
              currentBlockType != type &&
              currentBlockType &&
              DocumentNode.isType(documentNode, NodeType.paragraph, NodeType.heading)
            ) {
              insertCommand.undo.push(this.editor.lastCursor),
                insertCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
              var splitResult = DocumentNode.splitAt(
                documentNode,
                (this.editor.lastCursor || { start: 0 }).start,
                currentEditor,
                !0,
              );
              if (!splitResult) return;
              var replacementHtml,
                currentNodeElement,
                prev = splitResult.prev,
                localDocumentNode = splitResult.next,
                nodeId = type == NodeType.hr ? localDocumentNode.id : currentDocumentNode.id;
              DocumentNode.isType(type, NodeType.math_block, NodeType.fences)
                ? currentDocumentNode.set(
                    'text',
                    selectedMarkHtml
                      ? currentEditor.UserOp.getMarkdownSourceFrom(selectedMarkHtml)
                      : '',
                  )
                : type == NodeType.def_link &&
                  ((text = (text.trim().split(/\n/) || [])[0] || ''),
                  /[\/\\]/.exec(text)
                    ? currentDocumentNode.set('href', text.substr(0, 160))
                    : currentDocumentNode.set('ref', (text.split(/\s/)[0] || text).substr(0, 20))),
                insertCommand.redo.push(currentEditor.undo.buildReplaceUndo(documentNode)),
                undoManager.addUndoForInsertArray(insertCommand, splitResult.insertArray),
                prev.addAfter(currentDocumentNode),
                undoManager.addUndoForInsert(insertCommand, currentDocumentNode),
                splitResult.insertArray.indexOf(localDocumentNode) > -1 &&
                  splitResult.insertArray.splice(
                    splitResult.insertArray.indexOf(localDocumentNode),
                    0,
                    currentDocumentNode,
                  ),
                existingNode && x(existingNode, documentNode.get('in')),
                localDocumentNode &&
                  DocumentNode.isEmptyBlock(localDocumentNode) &&
                  DocumentNode.isType(localDocumentNode.get('after'), NodeType.paragraph) &&
                  (undoManager.addUndoForRemove(insertCommand, localDocumentNode),
                  localDocumentNode.remove(),
                  (localDocumentNode = null)),
                DocumentNode.isEmptyBlock(prev) &&
                  (undoManager.addUndoForRemove(insertCommand, prev), prev.remove(), (prev = null)),
                (replacementHtml =
                  (documentNode.isDeleted() ? '' : documentNode.toHTML()) +
                  splitResult.insertArray
                    .map(function (item) {
                      return item.isDeleted() ? '' : item.toHTML();
                    })
                    .join('')),
                nodeElement.replaceWith(replacementHtml),
                (currentNodeElement = this.editor.findElemById(nodeId)),
                this.editor.selection.jumpIntoElemBegin(currentNodeElement);
            } else
              (documentNode = documentNode.getClosetBlock(!1)).addAfter(currentDocumentNode),
                existingNode && x(existingNode, documentNode.get('in')),
                undoManager.addUndoForInsert(insertCommand, currentDocumentNode),
                this.editor.findElemById(documentNode.cid).after(currentDocumentNode.toHTML()),
                this.editor.selection.jumpIntoElemBegin(
                  this.editor.findElemById(currentDocumentNode.cid),
                );
            return (
              (this.editor.lastCursor = this.editor.selection.buildUndo()),
              insertCommand.redo.push(this.editor.lastCursor),
              this.editor.undo.register(insertCommand),
              this.editor.refocus(),
              this.editor.selection.scrollAdjust(),
              currentDocumentNode
            );
          }
        }
        function x(inputDocumentNode, documentMap) {
          inputDocumentNode.set('in', documentMap),
            inputDocumentNode
              .get('children')
              .toArray()
              .map(function (item) {
                x(item, documentMap);
              });
        }
      }
      toggleTaskStatus(state) {
        if (!File.isLocked && !document.body.classList.contains('modal-open')) {
          var range = this.editor.selection.getRangy(),
            element = this.editor
              .getMarkElem(range && range.startContainer)
              .closest('.md-task-list-item'),
            wasChecked = element.hasClass('task-list-done');
          if ((void 0 === state && (state = !wasChecked), element.length && state !== wasChecked)) {
            var currentEditor = this.editor;
            if ((currentEditor.undo.endSnap(!0), range.collapsed))
              currentEditor.getNode(element.attr('cid')).attr('checked', state, currentEditor, !1);
            else {
              var toggleCommand = undoManager.makeEmptyCommand(),
                selectedNodes = $.parseHTML(range.toHtml());
              $(selectedNodes)
                .find(state ? '.task-list-not-done' : '.task-list-done')
                .addBack(state ? '.task-list-not-done' : '.task-list-done')
                .each(function () {
                  var itemCommand = currentEditor
                    .getNode(this.getAttribute('cid'))
                    .attr('checked', state, currentEditor, !0);
                  undoManager.append(toggleCommand, itemCommand);
                }),
                toggleCommand.undo.length
                  ? currentEditor.undo.register(toggleCommand)
                  : currentEditor
                      .getNode(element.attr('cid'))
                      .attr('checked', state, currentEditor, !1);
            }
            JSBridge.menu.update({
              'Paragraph→Task Status→Mark as Complete': { state: state },
              'Paragraph→Task Status→Mark as Incomplete': { state: !state },
            });
          }
        }
      }
      toggleIndent(type, enforceRequestedStyle, alertType) {
        if (!File.isLocked && !document.body.classList.contains('modal-open')) {
          this.editor.focusAndRestorePos();
          var currentEditor = this.editor,
            range = this.editor.selection.getRangy(),
            receiver = this;
          !range &&
            currentEditor.selection.selectionBeforeBlur &&
            (currentEditor.undo.exeCommand(currentEditor.selection.selectionBeforeBlur, []),
            (range = currentEditor.selection.getRangy()));
          var indentCommand = undoManager.makeEmptyCommand(currentEditor.selection.buildUndo());
          if (range) {
            currentEditor.undo.endSnap(!0);
            var firstBlock,
              lastBlock,
              collapsed = range.collapsed;
            if (
              !(
                (isInputComponent(document.activeElement) && !this.editor.fences.getFocused()) ||
                File.isLocked
              )
            ) {
              this.editor.store();
              var lastCursor = this.editor.selection.buildUndo();
              if (
                ((this.editor.lastCursor = lastCursor),
                (function (selectionRange) {
                  if (selectionRange && !selectionRange.collapsed) {
                    var rangeAdjusted = !1;
                    !(function e(inputRange) {
                      var previousElement,
                        endParagraph = n(inputRange.endContainer);
                      endParagraph.text().length ||
                        endParagraph.parent()[0] != inputRange.commonAncestorContainer ||
                        ((previousElement = endParagraph.prev()[0]) &&
                          ((rangeAdjusted = !0),
                          inputRange.setEndAfter(previousElement),
                          e(inputRange)));
                    })(selectionRange),
                      (function e(inputRange) {
                        var followingElement,
                          startParagraph = n(inputRange.startContainer);
                        startParagraph.text().length ||
                          startParagraph.parent()[0] != inputRange.commonAncestorContainer ||
                          ((followingElement = startParagraph.after()[0]) &&
                            ((rangeAdjusted = !0),
                            inputRange.setStartBefore(followingElement),
                            e(inputRange)));
                      })(selectionRange),
                      rangeAdjusted && currentEditor.selection.deRange(selectionRange);
                  }
                  function n(node) {
                    return $(node).closest('p');
                  }
                })(range),
                range)
              ) {
                var startPosition = currentEditor.selection.getDetailPos(
                    range.startContainer,
                    range.startOffset,
                  ),
                  endPosition = currentEditor.selection.getDetailPos(
                    range.endContainer,
                    range.endOffset,
                  ),
                  startElement = currentEditor.getMarkElem(startPosition[0]),
                  endElement = currentEditor.getMarkElem(endPosition[0]),
                  startNode = currentEditor.findNodeByElem(startElement),
                  endNode = currentEditor.findNodeByElem(endElement),
                  treePosition = DocumentNode.getTreePosition(startNode, endNode),
                  blockRange = m(treePosition, range);
                (firstBlock = blockRange[1]),
                  (lastBlock = blockRange[1] === blockRange[2] ? null : blockRange[2]);
              } else firstBlock = this.editor.findNodeByElem(this.editor.getMarkElem());
              firstBlock &&
                (this.editor.brush.pause(!0),
                type == NodeType.blockquote
                  ? (function (documentNode, inputDocumentNode, indentCommand) {
                      (documentNode = documentNode.getClosetBlock()),
                        (inputDocumentNode =
                          inputDocumentNode && inputDocumentNode.getClosetBlock());
                      var currentDocumentNode = documentNode.get('parent');
                      if (
                        (function (callbackDocumentNode, lastNode, parentNode) {
                          return (
                            (lastNode = lastNode || callbackDocumentNode),
                            !(!parentNode || parentNode.get('type') != NodeType.blockquote) &&
                              (!alertType || parentNode.get('alert') == alertType) &&
                              (range.collapsed ||
                                (!callbackDocumentNode.get('before') && !lastNode.get('after')))
                          );
                        })(documentNode, inputDocumentNode, currentDocumentNode)
                      ) {
                        if (
                          (undoManager.addUndoForUnwrap(indentCommand, currentDocumentNode),
                          currentDocumentNode.get('alert'))
                        ) {
                          let alertMarkerNode = currentDocumentNode.firstChild();
                          undoManager.addUndoForRemove(indentCommand, alertMarkerNode),
                            alertMarkerNode.remove();
                        }
                        currentDocumentNode.unwrap(currentEditor);
                      } else {
                        if (alertType) {
                          if (
                            documentNode.get('alert') ||
                            (currentDocumentNode && currentDocumentNode.get('alert'))
                          )
                            return receiver.insertAlert(
                              alertType,
                              currentEditor.findElemById(currentDocumentNode.id),
                            );
                          if (
                            currentDocumentNode &&
                            currentDocumentNode.get('type') == NodeType.blockquote &&
                            !documentNode.get('before') &&
                            !inputDocumentNode.get('after')
                          )
                            return void k(currentDocumentNode, alertType, indentCommand);
                        }
                        collapsed &&
                          (documentNode = inputDocumentNode =
                            (function e(callbackDocumentNode) {
                              var parentNode = callbackDocumentNode.get('parent');
                              return !parentNode ||
                                callbackDocumentNode.get('before') ||
                                callbackDocumentNode.get('after')
                                ? DocumentNode.isType(callbackDocumentNode, NodeType.list_item)
                                  ? callbackDocumentNode.getFirstChild()
                                  : callbackDocumentNode.isVirtualBlock()
                                    ? _(callbackDocumentNode)
                                    : callbackDocumentNode
                                : e(parentNode);
                            })(documentNode));
                        var documentNodeInstance = new DocumentNode({ type: type });
                        DocumentNode.wrap(
                          documentNodeInstance,
                          documentNode,
                          inputDocumentNode || documentNode,
                          currentEditor,
                        ),
                          undoManager.addUndoForWrap(indentCommand, documentNodeInstance),
                          alertType && k(documentNodeInstance, alertType, indentCommand);
                      }
                    })(firstBlock, lastBlock, indentCommand)
                  : (function (
                      inputDocumentNode,
                      callbackDocumentNode,
                      indentCommand,
                      listStyle,
                      selectionSnapshot,
                    ) {
                      var currentDocumentNode = (function (firstNode, lastNode) {
                          lastNode = lastNode || firstNode;
                          var documentNode = firstNode.get('parent');
                          if (range.collapsed) {
                            if (
                              !firstNode.get('before') &&
                              documentNode &&
                              DocumentNode.isType(documentNode.get('parent'), NodeType.list)
                            )
                              return documentNode.get('parent');
                          } else if (
                            documentNode &&
                            DocumentNode.isType(documentNode.getClosetBlock(), NodeType.list)
                          )
                            return documentNode.getClosetBlock();
                        })(inputDocumentNode, callbackDocumentNode),
                        currentListStyle = currentDocumentNode ? p(currentDocumentNode) : void 0;
                      if (enforceRequestedStyle)
                        if ('none' == listStyle) {
                          if (!currentDocumentNode) return;
                          listStyle = currentListStyle;
                        } else if (currentDocumentNode && listStyle == currentListStyle) return;
                      if (currentDocumentNode)
                        currentListStyle == listStyle
                          ? (currentDocumentNode.get('children').map(function (item) {
                              undoManager.addUndoForUnwrap(indentCommand, item),
                                console.debug(item.toMark()),
                                item.unwrap();
                            }),
                            undoManager.addUndoForUnwrap(indentCommand, currentDocumentNode),
                            currentDocumentNode.unwrap(currentEditor))
                          : (indentCommand.undo.push(
                              undoManager.buildReplaceUndo(currentDocumentNode),
                            ),
                            currentDocumentNode.set('pattern', void 0),
                            E(currentDocumentNode, listStyle),
                            currentEditor
                              .findElemById(currentDocumentNode.id)
                              .replaceWith(currentDocumentNode.toHTML()),
                            indentCommand.redo.push(
                              undoManager.buildReplaceUndo(currentDocumentNode),
                            ));
                      else {
                        callbackDocumentNode = _(callbackDocumentNode || inputDocumentNode);
                        for (
                          var wrappedNode,
                            localDocumentNode = (inputDocumentNode = _(inputDocumentNode)),
                            items = [],
                            nextNode = callbackDocumentNode.get('after');
                          localDocumentNode && localDocumentNode != nextNode;
                        ) {
                          var splitNodes;
                          (wrappedNode = localDocumentNode),
                            File.option.ignoreLineBreak ||
                              ((splitNodes = T(
                                localDocumentNode,
                                indentCommand,
                                selectionSnapshot,
                              )) &&
                                splitNodes[0] &&
                                (wrappedNode =
                                  localDocumentNode =
                                  inputDocumentNode =
                                    splitNodes[0]),
                              splitNodes && splitNodes[1] && (nextNode = splitNodes[1]));
                          var documentNodeInstance = new DocumentNode({ type: NodeType.list_item });
                          (localDocumentNode = localDocumentNode.get('after')),
                            DocumentNode.wrap(
                              documentNodeInstance,
                              wrappedNode,
                              wrappedNode,
                              currentEditor,
                            ),
                            items.push(documentNodeInstance),
                            undoManager.addUndoForWrap(indentCommand, documentNodeInstance);
                        }
                        E(
                          (currentDocumentNode = new DocumentNode({
                            type: NodeType.list,
                            in: inputDocumentNode.get('in'),
                          })),
                          listStyle,
                        );
                        var firstListItem = items[0],
                          lastListItem = items.last();
                        if (type == DocumentNode.ListType.task)
                          for (
                            var currentListItem = firstListItem;
                            currentListItem != lastListItem.get('after');
                          )
                            currentListItem.set('style', DocumentNode.ListType.task),
                              (currentListItem = currentListItem.get('after'));
                        DocumentNode.wrap(
                          currentDocumentNode,
                          firstListItem,
                          lastListItem,
                          currentEditor,
                        ),
                          undoManager.addUndoForWrap(indentCommand, currentDocumentNode);
                      }
                    })(firstBlock, lastBlock, indentCommand, type, lastCursor),
                this.editor.quickRefresh(),
                indentCommand.redo.push(lastCursor),
                this.editor.undo.exeCommand(lastCursor),
                this.editor.undo.register(indentCommand),
                this.editor.brush.resume(),
                this.editor.refocus(),
                this.editor.selection.scrollAdjust());
            }
          }
        }
        function k(documentNode, alertType, alertCommand) {
          alertCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
            documentNode.set('alert', alertType),
            alertCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
          var documentNodeInstance = new DocumentNode({
            type: NodeType.paragraph,
            text: '[!' + alertType.toUpperCase() + ']',
          });
          documentNode.prependChild(documentNodeInstance),
            undoManager.addUndoForInsert(alertCommand, documentNodeInstance),
            currentEditor.findElemById(documentNode.cid).replaceWith(documentNode.toHTML());
        }
        function E(documentNode, listStyle) {
          (listStyle != DocumentNode.ListType.ol && listStyle != DocumentNode.ListType.ul) ||
            (documentNode.set('style', listStyle),
            documentNode.get('children').map(function (item) {
              item.unset('style'), item.unset('checked');
            })),
            listStyle == DocumentNode.ListType.task &&
              (documentNode.set('style', DocumentNode.ListType.ul),
              documentNode.get('children').map(function (item) {
                item.set('style', DocumentNode.ListType.task);
              }));
        }
        function T(documentNode, splitCommand, selectionSnapshot) {
          if (!DocumentNode.isType(documentNode, NodeType.paragraph)) return documentNode;
          var textLines = documentNode.get('text').split(/\n/g) || [];
          if (textLines.length < 2) return documentNode;
          void 0 === selectionSnapshot.startId &&
            (selectionSnapshot.startId = selectionSnapshot.id),
            void 0 === selectionSnapshot.endId && (selectionSnapshot.endId = selectionSnapshot.id),
            delete selectionSnapshot.id;
          var startsInBlock = selectionSnapshot.startId == documentNode.cid,
            endsInBlock = selectionSnapshot.endId == documentNode.cid,
            collapsedSelection = selectionSnapshot.start == selectionSnapshot.end;
          if (startsInBlock && endsInBlock) {
            splitCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
            var splitParagraph,
              items = [],
              currentDocumentNode = documentNode;
            documentNode.set('text', textLines[0]);
            for (
              var documentNodeInstance, localDocumentNode = documentNode, itemIndex = 1;
              itemIndex < textLines.length;
              itemIndex++
            ) {
              var text = textLines[itemIndex];
              if (
                selectionSnapshot.start >
                  textLines[itemIndex - 1].length + textLines[itemIndex].length &&
                !collapsedSelection
              )
                (textLines[itemIndex] = documentNode.get('text') + '\n' + text),
                  documentNode.set('text', textLines[itemIndex]);
              else if (
                ((currentDocumentNode = splitParagraph =
                  currentDocumentNode.addAfter(
                    new DocumentNode({ type: NodeType.paragraph, text: text }),
                  )),
                items.push(splitParagraph),
                startsInBlock && selectionSnapshot.start > textLines[itemIndex - 1].length
                  ? ((selectionSnapshot.startId = splitParagraph.cid),
                    (selectionSnapshot.start -= textLines[itemIndex - 1].length + 1),
                    (localDocumentNode = splitParagraph))
                  : (startsInBlock = !1),
                endsInBlock && selectionSnapshot.end > textLines[itemIndex - 1].length)
              ) {
                if (
                  ((selectionSnapshot.endId = splitParagraph.cid),
                  (selectionSnapshot.end -= textLines[itemIndex - 1].length + 1),
                  !collapsedSelection &&
                    itemIndex < textLines.length - 1 &&
                    selectionSnapshot.end <= textLines[itemIndex].length)
                ) {
                  (documentNodeInstance = new DocumentNode({
                    type: NodeType.paragraph,
                    text: textLines.slice(itemIndex + 1).join('\n'),
                  })),
                    currentDocumentNode.addAfter(documentNodeInstance),
                    items.push(documentNodeInstance);
                  break;
                }
              } else endsInBlock = !1;
            }
            var replacementNodes = [documentNode].concat(items);
            return (
              currentEditor
                .findElemById(documentNode.cid)
                .replaceWith(nodeCollectionUtilities.toHTML(replacementNodes)),
              splitCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
              undoManager.addUndoForInsertArray(splitCommand, items),
              [localDocumentNode, documentNodeInstance]
            );
          }
        }
        function _(documentNode) {
          for (; documentNode && documentNode.isVirtualBlock(); )
            documentNode = documentNode.get('parent');
          return documentNode;
        }
      }
      changeHeadingLevel(documentNode, increaseLevel, headingTag) {
        var match,
          headingDepth,
          targetBlockType = null;
        documentNode.get('type') == NodeType.paragraph
          ? headingTag && (match = /h(\d)/.exec(headingTag))
            ? (headingDepth = match[1] - 0)
            : increaseLevel && (targetBlockType = 'header6')
          : documentNode.get('type') == NodeType.heading &&
            (headingDepth = documentNode.get('depth') - 0),
          void 0 !== headingDepth &&
            (7 == (headingDepth -= increaseLevel ? 1 : -1)
              ? (targetBlockType = 'paragraph')
              : headingDepth > 0 && (targetBlockType = 'header' + headingDepth)),
          targetBlockType && this.changeBlock(targetBlockType);
      }
    }
    var NoInlineBlock = [
        'hr',
        'fences',
        'def_link',
        'meta_block',
        'raw_edit',
        'math_block',
        'toc',
        'html_block',
      ],
      NoInlineInline = ['code', 'comment', 'atag', 'imgtag'],
      CONST = {
        SyntaxMap: {
          strong: ['**', '**'],
          em: ['*', '*'],
          code: ['`', '`'],
          del: ['~~', '~~'],
          underline: ['<u>', '</u>'],
          footnote: ['[^', ' ]'],
          link: ['[', ']()'],
          image: ['![', ']()'],
          highlight: ['==', '=='],
          superscript: ['^', '^'],
          subscript: ['~', '~'],
          inline_math: ['$', '$'],
          comment: ['\x3c!--', '--\x3e'],
        },
        NormalBlockMap: {
          line: 'Paragraph',
          paragraph: 'Paragraph',
          header1: 'Header 1',
          header2: 'Header 2',
          header3: 'Header 3',
          header4: 'Header 4',
          header5: 'Header 5',
          header6: 'Header 6',
          def_link: 'Link Reference',
          def_footnote: 'Footnotes',
        },
        InsertInline: ['link', 'image', 'footnote', 'inline_math'],
        LinkList: ['autolink', 'reflink', 'link'],
        NoInlineBlock: NoInlineBlock,
        NoInlineInline: NoInlineInline,
        NoInline: NoInlineBlock.concat(NoInlineInline),
        Selectable: ['hr', 'math_block', 'toc', 'html_block', 'fences'],
        InsertBlock: ['table', 'fences', 'hr'],
        StyleToNameMap: {
          paragraph: 'Paragraph',
          header1: 'Heading 1',
          header2: 'Heading 2',
          header3: 'Heading 3',
          header4: 'Heading 4',
          header5: 'Heading 5',
          header6: 'Heading 6',
          def_link: 'Link Reference',
          def_footnote: 'Footnotes',
          table: 'Table',
          fences: 'Code Fences',
          blockquote: 'Quote',
          toc: 'Table of Contents',
          hr: 'Horizontal Line',
          meta_block: 'YAML Front Matter',
          ol: 'Ordered List',
          ul: 'Unordered List',
          tasklist: 'Task List',
          html_block: 'HTML Block',
          strong: 'Strong',
          em: 'Emphasis',
          code: 'Code',
          del: 'Strike',
          highlight: 'Highlight',
          inline_math: 'Inline Math',
          math_block: 'Math Block',
          superscript: 'Superscript',
          subscript: 'subscript',
          image: 'Image',
          footnote: 'Superscript',
          autolink: 'Hyperlink',
          reflink: 'Hyperlink',
          link: 'Hyperlink',
          url: 'Hyperlink',
          underline: 'Underline',
          comment: 'Comment',
        },
        NameMapToStyle: {},
      };
    for (var styleKey in CONST.StyleToNameMap)
      CONST.NameMapToStyle[CONST.StyleToNameMap[styleKey].toLowerCase()] = styleKey;
    (CONST.InsertQuery = '[md-inline="' + CONST.InsertInline.join('"],[md-inline="') + '"]'),
      (CONST.getMenuBlockType = function (documentNode) {
        var nodeType = documentNode.get('type');
        switch (nodeType) {
          case NodeType.heading:
            return 'header' + documentNode.get('depth');
          case NodeType.list:
            return documentNode.get('style');
        }
        return nodeType;
      }),
      (w.CONST = CONST),
      (moduleRecord.exports = w);
  },
);
