// model/node-editing.
export default function initializeModelNodeEditing(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    utilities = (documentModel.NodeCollectionUtils, requireModule('shared/utilities')),
    undoManager = requireModule('editing/undo-manager'),
    diagrams = requireModule('render/diagrams'),
    mathBlocks = requireModule('render/math-blocks'),
    rangy = requireModule('libraries/rangy'),
    smartQuotes = requireModule('editing/smart-quotes');
  DocumentNode.normalizeNode = function (documentNode) {
    if (
      0 == documentNode.get('children').length &&
      (DocumentNode.isType(documentNode, NodeType.blockquote) ||
        DocumentNode.isType(documentNode, NodeType.list_item))
    ) {
      documentNode.appendChild(new DocumentNode({ type: NodeType.paragraph }));
    }
  };
  DocumentNode.genNormalSplitExitFunc = function (
    unusedParameter1,
    preserveNextMarker,
    skipReparse,
  ) {
    return function (documentNode, inputDocumentNode) {
      var splitResult = { prev: documentNode, next: inputDocumentNode };
      if (documentNode.get('type') == NodeType.paragraph) {
        if (!skipReparse) {
          documentNode.parseFrom({ skips: { enableStartMatch: true } });
        }
        if (!DocumentNode.isType(documentNode, NodeType.paragraph)) {
          splitResult.oldCid = documentNode.cid;
          splitResult.prev = documentNode;
        }
      }
      if (inputDocumentNode.get('type') == NodeType.paragraph) {
        if (!preserveNextMarker) {
          (function (callbackDocumentNode, previousNode) {
            try {
              var listStyle,
                text,
                currentDocumentNode = !previousNode.isDeleted() && previousNode.get('parent');
              currentDocumentNode =
                DocumentNode.isType(currentDocumentNode, NodeType.list_item) &&
                currentDocumentNode.get('parent');
              if (
                !(listStyle =
                  DocumentNode.isType(currentDocumentNode, NodeType.list) &&
                  currentDocumentNode.get('style'))
              ) {
                return;
              }
              if ((text = callbackDocumentNode.get('text')).match(/^(\s{2, }|\t)/)) {
                return;
              }
              if (listStyle == DocumentNode.ListType.ol) {
                text = text.replace(/^\s*\d+(\.|\))\s+/, '');
              } else {
                if (listStyle == DocumentNode.ListType.ul) {
                  text = text.replace(/^\s*[+*-]\s+/, '');
                }
              }
              callbackDocumentNode.set('text', text);
            } catch (error) {}
          })(inputDocumentNode, documentNode);
        }
        if (!skipReparse) {
          inputDocumentNode.parseFrom();
        }
        if (!DocumentNode.isType(inputDocumentNode, NodeType.paragraph)) {
          splitResult.next = inputDocumentNode;
        }
      }
      return splitResult;
    };
  };
  DocumentNode.prototype.breakOn = function (keepListItem, editor, softBreak) {
    Object.defineProperty(splitNodeContent, 'name', { value: 'h', configurable: true });
    Object.defineProperty(restoreSplitCursor, 'name', { value: 'p', configurable: true });

    var splitOffset, currentTextLength;
    if (
      DocumentNode.isType(
        this,
        NodeType.table,
        NodeType.table_row,
        NodeType.table_cell,
        NodeType.blockquote,
        NodeType.list,
        NodeType.list_item,
      )
    ) {
      return null;
    }
    var earlySplitResult,
      selectionSnapshot = editor.selection.buildUndo();
    if (DocumentNode.isType(this, NodeType.def_footnote)) {
      var element = editor.getJQueryElem(window.getSelection().baseNode);
      splitOffset = element.closest('.md-def-name').length
        ? editor.selection.getOffset(element.closest('.md-def-name'))
        : this.get('ref').length +
          1 +
          editor.selection.getOffset(element.closest('.md-def-content'));
    } else {
      var nodeElement = editor.findElemById(this.id);
      nodeElement.find('.md-emoji-control-ch, .md-ruby-container').remove();
      nodeElement.find('.md-math-after-sym').text('');
      splitOffset = editor.selection.getOffset(nodeElement);
    }
    if (
      !this.get('children').length &&
      ((currentTextLength = this.getText(false).length),
      DocumentNode.isType(this, NodeType.def_link, NodeType.def_footnote) &&
        (currentTextLength += this.get('ref').length + 1),
      !this.get('children').length)
    ) {
      if (
        (earlySplitResult = (function (documentNode) {
          documentNode = documentNode.getClosetBlock();
          if (
            currentTextLength <= 1 &&
            DocumentNode.isType(documentNode, NodeType.def_footnote, NodeType.def_footnote) &&
            !keepListItem &&
            !softBreak &&
            DocumentNode.isEmptyBlock(documentNode, null, true)
          ) {
            (command = undoManager.makeEmptyCommand(selectionSnapshot)).undo.push(
              undoManager.buildReplaceUndo(documentNode),
            );
            documentNode.unset('ahead');
            documentNode.unset('tail');
            documentNode.set('type', NodeType.paragraph);
            command.redo.push(undoManager.buildReplaceUndo(documentNode));
            command.redo.push({
              type: 'cursor',
              id: documentNode.getLastChild().cid,
              start: 0,
            });
            return {
              command: command,
              nextFocus: documentNode.getLastChild().cid,
              oldCid: documentNode.cid,
              newHtml: documentNode.toHTML(),
            };
          }
          var textLength = currentTextLength;
          if (currentTextLength) {
            textLength = documentNode.getText(false).trim().length;
          }
          if (
            0 == splitOffset &&
            0 == textLength &&
            !keepListItem &&
            !softBreak &&
            documentNode.closest(NodeType.blockquote, NodeType.list) &&
            documentNode.get('parent') &&
            documentNode.get('parent').canContainBlock(true) &&
            (documentNode.get('parent').get('type') != NodeType.list_item ||
              !documentNode.get('after')) &&
            !(function (inputDocumentNode) {
              var currentDocumentNode = inputDocumentNode.get('parent');
              return (
                DocumentNode.isType(currentDocumentNode, NodeType.list_item) &&
                !inputDocumentNode.get('before') &&
                !inputDocumentNode.get('after') &&
                !currentDocumentNode.get('before') &&
                !currentDocumentNode.get('after') &&
                currentDocumentNode.get('parent').get('attachTo')
              );
            })(documentNode)
          ) {
            var command;
            (command = undoManager.makeEmptyCommand()).undo.push(selectionSnapshot);
            var outdentResult = {};
            if (!(outdentResult = DocumentNode.upStream(documentNode))) {
              return;
            }
            command.undo = command.undo.concat(outdentResult.command.undo);
            command.redo = command.redo.concat(outdentResult.command.redo);
            outdentResult.nextFocus = outdentResult.nextFocus || documentNode.id;
            command.redo.push({ type: 'cursor', id: outdentResult.nextFocus, start: 0 });
            outdentResult.command = command;
            return outdentResult;
          }
        })(this.getClosetBlock()))
      ) {
        return earlySplitResult;
      } else {
        if (
          (earlySplitResult = (function (documentNode) {
            if (
              splitOffset == currentTextLength &&
              documentNode == editor.nodeMap.getFirst() &&
              DocumentNode.isType(documentNode, NodeType.paragraph) &&
              ((text = documentNode.get('text')),
              File.shouldRemapPunctuation()
                ? '---' == (text || '').replace(/\u2013/g, '--').replace(/\u2014/g, '---')
                : '---' == text)
            ) {
              var metadataInsert = editor.stylize.insertMetaBlock(true);
              metadataInsert.command.undo.push(undoManager.buildReplaceUndo(documentNode));
              documentNode.set('text', '');
              metadataInsert.command.redo.push(undoManager.buildReplaceUndo(documentNode));
              metadataInsert.newHtml = metadataInsert.node.toHTML() + documentNode.toHTML();
              metadataInsert.nextFocus = metadataInsert.node.id;
              metadataInsert.oldCid = documentNode.id;
              return metadataInsert;
            }
            var text;
          })(this))
        ) {
          return earlySplitResult;
        } else {
          return (function (documentNode, splitOffset, command) {
            command = command || undoManager.makeEmptyCommand();
            var splitResult = {},
              atEnd = splitOffset == currentTextLength && splitOffset > 0,
              currentDocumentNode = documentNode.getClosetBlock();
            command.undo.push(selectionSnapshot);
            if (
              DocumentNode.isType(currentDocumentNode.get('parent'), NodeType.list_item) &&
              !keepListItem
            ) {
              command.undo.push(undoManager.buildReplaceUndo(currentDocumentNode.get('parent')));
            } else {
              command.undo.push(undoManager.buildReplaceUndo(currentDocumentNode));
            }
            currentDocumentNode.unset('ahead');
            currentDocumentNode.unset('tail');
            if (softBreak && DocumentNode.isType(documentNode, NodeType.paragraph)) {
              return splitNodeContent(documentNode, splitOffset, command, atEnd);
            } else {
              if (
                (splitResult = DocumentNode.splitAt(
                  documentNode,
                  splitOffset,
                  editor,
                  keepListItem,
                ))
              ) {
                if (splitResult.undo) {
                  command.undo.push(splitResult.undo);
                  command.redo.push(splitResult.redo);
                }
                command.redo.push(editor.undo.buildReplaceUndo(splitResult.prev));
                if (!(splitResult.prev && splitResult.prev.contains(documentNode))) {
                  command.redo.push(editor.undo.buildReplaceUndo(documentNode));
                }
                documentNode = splitResult.insertArray[0]
                  ? splitResult.insertArray[0].get('before')
                  : documentNode;
                splitResult.oldCid = documentNode.cid;
                undoManager.addUndoForInsertArray(command, splitResult.insertArray);
                splitResult.newHtml =
                  documentNode.toHTML() +
                  splitResult.insertArray
                    .map(function (item) {
                      return item.toHTML();
                    })
                    .join('');
                restoreSplitCursor(splitResult, atEnd);
                command.redo.push({
                  type: 'cursor',
                  id: splitResult.nextFocus,
                  start: 0,
                });
                splitResult.command = command;
                return splitResult;
              } else {
                return void 0;
              }
            }
          })(this, (splitOffset = Math.min(currentTextLength, splitOffset)));
        }
      }
    }
    function splitNodeContent(documentNode, itemIndex, command, atEnd) {
      if (softBreak && DocumentNode.isType(documentNode, NodeType.paragraph)) {
        var currentText = documentNode.get('text') || '';
        if ('\n' == currentText[itemIndex]) {
          softBreak = false;
        } else {
          if ('\n' == currentText[itemIndex - 1]) {
            softBreak = false;
            itemIndex--;
          }
        }
        command.undo.push(undoManager.buildReplaceUndo(documentNode));
        documentNode.set('text', currentText.substring(0, itemIndex));
        if (!softBreak) {
          command.redo.push(undoManager.buildReplaceUndo(documentNode));
          return (function (inputDocumentNode, inputCommand, text) {
            var documentNodeInstance = new DocumentNode({
              type: NodeType.paragraph,
              text: text,
              in: inputDocumentNode.get('in'),
            });
            inputDocumentNode.addAfter(documentNodeInstance);
            undoManager.addUndoForInsert(inputCommand, documentNodeInstance);
            return {
              oldCid: inputDocumentNode.cid,
              prev: inputDocumentNode,
              next: documentNodeInstance,
              command: inputCommand,
              nextFocus: documentNodeInstance.cid,
              newHtml: inputDocumentNode.toHTML() + documentNodeInstance.toHTML(),
            };
          })(documentNode, command, currentText.substring(itemIndex + 1));
        }
        var splitText = DocumentNode.smartSplit(editor.findElemById(documentNode.id), itemIndex);
        documentNode.set('text', splitText[0]);
        var cursor,
          parseResult = documentNode.parseFrom({ skips: { enableStartMatch: true } }, void 0, true);
        if (
          1 == parseResult[1].length &&
          DocumentNode.isType(parseResult[1][0], NodeType.paragraph)
        ) {
          documentNode.set('text', splitText[0] + '\n' + splitText[1]);
          command.redo.push(undoManager.buildReplaceUndo(documentNode));
          cursor = { type: 'cursor', id: documentNode.id, start: splitText[0].length + 1 };
          command.redo.push(cursor);
          return {
            oldCid: documentNode.cid,
            nextFocus: documentNode.cid,
            prev: documentNode,
            newHtml: documentNode.toHTML(),
            command: command,
            cursor: cursor,
          };
        }
        command.redo.push(undoManager.buildReplaceUndo(documentNode));
        var items = parseResult[1],
          localDocumentNode = items.last(),
          currentDocumentNode = localDocumentNode.getVeryFirst(true).getClosetBlock();
        if (DocumentNode.isType(currentDocumentNode, NodeType.paragraph)) {
          cursor = {
            type: 'cursor',
            id: currentDocumentNode.id,
            start: currentDocumentNode.get('text').length + 1,
          };
          currentDocumentNode.set('text', currentDocumentNode.get('text') + '\n' + splitText[1]);
        } else {
          cursor = {
            type: 'cursor',
            id: (currentDocumentNode = new DocumentNode({
              type: NodeType.paragraph,
              text: splitText[1],
            })).id,
            start: 0,
          };
          items.last().addAfter(currentDocumentNode);
          items.push(currentDocumentNode);
        }
        undoManager.addUndoForInsertArray(command, items.subarray(1));
        var splitResult = {
          oldCid: documentNode.cid,
          nextFocus: currentDocumentNode.cid,
          prev: localDocumentNode,
          next: localDocumentNode.get('after'),
          newHtml: items
            .map(function (item) {
              return item.toHTML();
            })
            .join(''),
          command: command,
          cursor: cursor,
        };
        if (0 == cursor.start) {
          splitResult.cursor = void 0;
          restoreSplitCursor(splitResult, atEnd);
          command.redo.push({ type: 'cursor', id: splitResult.nextFocus, start: 0 });
        } else {
          command.redo.push(cursor);
        }
        return splitResult;
      }
    }
    function restoreSplitCursor(splitResult, atEnd) {
      var focusPrevious =
        atEnd ||
        (DocumentNode.isType(splitResult.next, NodeType.paragraph) &&
          !(splitResult.next.get('text') || '').trim().length);
      if (
        DocumentNode.isType(splitResult.prev, NodeType.meta_block) &&
        focusPrevious &&
        splitResult.prev.get('text').match(/\n$/)
      ) {
        splitResult.nextFocus = splitResult.next.getVeryFirst().id;
      } else {
        if (
          focusPrevious &&
          DocumentNode.isType(
            (splitResult.prev && splitResult.prev.getLastChild()) || splitResult.prev,
            NodeType.math_block,
            NodeType.fences,
            NodeType.meta_block,
            NodeType.html_block,
          )
        ) {
          var documentNode = splitResult.prev.getVeryFirst(true);
          if (
            !DocumentNode.isType(documentNode, NodeType.html_block) ||
            /\n/.exec(documentNode.get('text')) ||
            documentNode.get('depth')
          ) {
            splitResult.nextFocus = documentNode.id;
          } else {
            splitResult.nextFocus = splitResult.next.getVeryFirst().cid;
          }
        } else {
          if (atEnd && DocumentNode.isType(splitResult.prev, NodeType.table)) {
            splitResult.nextFocus = splitResult.prev.getLastChild().getVeryFirst().cid;
          } else {
            splitResult.nextFocus = splitResult.next.getVeryFirst().cid;
          }
        }
      }
    }
  };
  DocumentNode.isEmptyBlock = function (documentNode, excludedTypes, ignoreWhitespace) {
    var isEmptyText = ignoreWhitespace ? utilities.isNullOrBlank : utilities.isNullOrEmpty;
    if (DocumentNode.isType(documentNode, excludedTypes || [])) {
      return false;
    }
    if (documentNode.get('children').length) {
      if (DocumentNode.isType(documentNode, NodeType.paragraph)) {
        return isEmptyText(documentNode.get('text'));
      }
    } else {
      if (DocumentNode.isType(documentNode, NodeType.def_link)) {
        return (
          isEmptyText(documentNode.get('ref')) &&
          isEmptyText(documentNode.get('href')) &&
          isEmptyText(documentNode.get('title'))
        );
      }
      if (DocumentNode.isType(documentNode, NodeType.def_footnote)) {
        return isEmptyText(documentNode.get('ref')) && isEmptyText(documentNode.get('text'));
      }
      if (
        !DocumentNode.isType(
          documentNode,
          NodeType.table_cell,
          NodeType.table_row,
          NodeType.hr,
          NodeType.toc,
        )
      ) {
        return isEmptyText(documentNode.get('text'));
      }
    }
    return false;
  };
  var openingMarkers = { link: '[', footnote: '[^', reflink: '[' },
    closingMarkers = { footnote: ']' };
  DocumentNode.smartSplit = function (sourceElement, start, extractAfterCaret) {
    var currentElements,
      localElements,
      splitContent,
      range = rangy.createRange(),
      cursorAdjustment = 0;
    if (0 == start) {
      return ['', sourceElement.rawText(), cursorAdjustment];
    }
    if (start == (sourceElement[0].textContent || sourceElement[0].innerText).length) {
      var currentText = sourceElement.rawText();
      if (
        File.isMac &&
        File.option.smartQuote &&
        !File.option.convertSmartOnRender &&
        /["']$/.exec(currentText) &&
        currentText.length > 1
      ) {
        currentText = currentText.replace(/["']$/, function (quoteCharacter) {
          return smartQuotes.userQuote("'" == quoteCharacter ? 3 : 1, false, true);
        });
      }
      return [currentText, ''];
    }
    if (extractAfterCaret) {
      splitContent = $.parseHTML('<span />')[0];
      sourceElement[0].appendChild(splitContent);
      sourceElement.prepend('<span />');
      range.moveToBookmark({ containerNode: sourceElement[0], start: start, end: start });
      range.setEndAfter(splitContent);
      localElements = (splitContent = range.extractContents()).querySelectorAll(
        '.md-pair-s, .md-meta-i-c',
      );
      currentElements = sourceElement[0].querySelectorAll('.md-pair-s, .md-meta-i-c');
    } else {
      if (sourceElement[0].childElementCount < 3) {
        splitContent = $.parseHTML('<span />')[0];
        sourceElement[0].insertBefore(splitContent, sourceElement[0].firstChild);
        sourceElement.append('<span />');
      }
      range.moveToBookmark({ containerNode: sourceElement[0], start: 0, end: start });
      if (splitContent) {
        range.setStart(splitContent, 0);
      }
      currentElements = (splitContent = range.extractContents()).querySelectorAll(
        '.md-pair-s, .md-meta-i-c',
      );
      localElements = sourceElement[0].querySelectorAll('.md-pair-s, .md-meta-i-c');
    }
    for (
      var createOppositeSyntaxMarker = Object.defineProperty(
          (inlineElement, closingSide) => {
            var SPANElement = document.createElement('SPAN'),
              text = inlineElement.children(closingSide ? '.md-after' : '.md-before').rawText();
            if (closingSide) {
              SPANElement.classList.add('md-before');
            } else {
              SPANElement.classList.add('md-after');
            }
            if ('<u>' == text) {
              text = '</u>';
            } else {
              if ('</u>' == text) {
                text = '<u>';
              } else {
                if ('<' == text) {
                  text = '>';
                } else {
                  if ('>' == text) {
                    text = '<';
                  }
                }
              }
            }
            SPANElement.textContent = text;
            if (closingSide) {
              cursorAdjustment += text.length;
            }
            return SPANElement;
          },
          'name',
          { value: 'c', configurable: true },
        ),
        items = [],
        itemIndex = 0;
      itemIndex < currentElements.length;
      itemIndex++
    ) {
      if ((element = $(currentElements[itemIndex])).hasClass('md-meta-i-c')) {
        if (element.find(':not(.md-meta-i)').text().length) {
          if (!element.children('.md-after.md-meta-i').text().length) {
            element.append(closingMarkers[element.attr('md-inline')] || '');
          }
        } else {
          items.push(currentElements[itemIndex]);
        }
      } else {
        if (element.find(':not(.md-meta)').text().length) {
          if (!element.children('.md-after').text().length) {
            element.append(createOppositeSyntaxMarker(element, false));
          }
        } else {
          items.push(currentElements[itemIndex]);
        }
      }
    }
    for (itemIndex = 0; itemIndex < localElements.length; itemIndex++) {
      var element;
      if ((element = $(localElements[itemIndex])).hasClass('md-meta-i-c')) {
        if (element.find(':not(.md-meta-i)').text().length) {
          if (!element.children('.md-before.md-meta-i').text().length) {
            var openingMarker = openingMarkers[element.attr('md-inline')] || '';
            element.prepend(openingMarker);
            cursorAdjustment += openingMarker.length;
          }
        } else {
          items.push(localElements[itemIndex]);
        }
      } else {
        if (element.find(':not(.md-meta)').text().length) {
          if (!element.children('.md-before').text().length) {
            element.prepend(createOppositeSyntaxMarker(element, true));
          }
        } else {
          items.push(localElements[itemIndex]);
        }
      }
    }
    items.forEach((item) => {
      if (item) {
        item.textContent = '';
      }
    });
    var elements = splitContent.querySelectorAll('svg');
    for (itemIndex = 0; itemIndex < elements.length; itemIndex++) {
      if (elements[itemIndex].parentElement) {
        elements[itemIndex].parentElement.removeChild(elements[itemIndex]);
      }
    }
    return [$(splitContent).rawText(), sourceElement.rawText(), cursorAdjustment];
  };
  DocumentNode.splitAt = function (
    inputDocumentNode,
    endOffset,
    editor,
    keepListItem,
    skipReparse,
    splitListItem,
  ) {
    var currentUndoManager;
    splitListItem = splitListItem || !skipReparse;
    if (DocumentNode.isType(inputDocumentNode, NodeType.def_link, NodeType.def_footnote)) {
      return (function (documentNode, inputEndOffset, unusedParameter3) {
        var textSlice,
          text,
          next = documentNode.clone(),
          ref = documentNode.get('ref');
        if (inputEndOffset <= ref.length) {
          documentNode.set('ref', ref.substring(0, inputEndOffset));
          next.set('ref', ref.substring(inputEndOffset));
          next.set('href', documentNode.get('href'));
          next.set('title', documentNode.get('title'));
          documentNode.set('href', '');
          documentNode.set('title', '');
          textSlice = '';
          text = documentNode.get('text');
        } else {
          if (DocumentNode.isType(documentNode, NodeType.def_link)) {
            var currentText = documentNode.get('href') || '',
              localText = documentNode.get('title') || '';
            if (inputEndOffset <= ref.length + currentText.length) {
              documentNode.set('title', '');
              next.set('ref', '');
              documentNode.set('href', currentText.substring(0, inputEndOffset - ref.length - 1));
              next.set('href', currentText.substring(inputEndOffset - ref.length - 1));
            } else {
              next.set('ref', '');
              next.set('href', '');
              documentNode.set(
                'title',
                localText.substring(0, inputEndOffset - ref.length - currentText.length - 1),
              );
              next.set(
                'title',
                localText.substring(inputEndOffset - ref.length - currentText.length - 1),
              );
            }
          } else {
            var definitionText = documentNode.get('text') || '';
            next.set('ref', '');
            textSlice = definitionText.substring(0, inputEndOffset - ref.length - 1);
            text = definitionText.substring(inputEndOffset - ref.length - 1);
          }
        }
        documentNode.set('text', textSlice);
        if (!DocumentNode.isType(next, NodeType.def_link)) {
          next.set('text', text || '');
        }
        if (DocumentNode.isEmptyBlock(next) && !DocumentNode.isType(next, NodeType.paragraph)) {
          next.set('type', NodeType.paragraph);
          next.set('text', '');
        }
        documentNode.addAfter(next);
        return { oldCid: documentNode.cid, prev: documentNode, next: next, insertArray: [next] };
      })(inputDocumentNode, endOffset);
    }
    var currentTextSlice,
      localTextSlice,
      splitText,
      cursorDiff,
      emptyTrailingText,
      currentNext = inputDocumentNode.clone();
    if (inputDocumentNode.get('children').length) {
      console.error('cannot do Node.split at this node');
      return null;
    }
    if (DocumentNode.isType(inputDocumentNode, NodeType.paragraph, NodeType.heading)) {
      currentTextSlice = (splitText = DocumentNode.smartSplit(
        editor.findElemById(inputDocumentNode.id),
        endOffset,
      ))[0].replace(/\n$/, '');
      emptyTrailingText = !(localTextSlice = splitText[1].replace(/^\n/, ''));
      cursorDiff = splitText[2];
      if (DocumentNode.isType(inputDocumentNode.get('parent'), NodeType.list_item)) {
        if (!splitListItem) {
          currentUndoManager = undoManager.buildReplaceUndo(
            inputDocumentNode.get('parent').get('parent'),
          );
          inputDocumentNode
            .get('parent')
            .get('parent')
            .get('children')
            .toArray()
            .forEach(function (documentNode) {
              if (void 0 == documentNode.get('tail')) {
                currentUndoManager = null;
              } else {
                documentNode.unset('tail');
              }
            });
        }
      }
    } else {
      currentTextSlice = inputDocumentNode.getText().substring(0, endOffset);
      localTextSlice = inputDocumentNode.getText().substring(endOffset);
    }
    inputDocumentNode.set('text', currentTextSlice);
    currentNext.set('text', localTextSlice);
    var parseResult,
      localDocumentNode = inputDocumentNode,
      parsedNodes = [localDocumentNode],
      insertArray = [];
    if (!skipReparse) {
      if (DocumentNode.isType(inputDocumentNode, NodeType.paragraph) && !skipReparse) {
        insertArray = (parsedNodes = (parseResult = inputDocumentNode.parseFrom(
          { skips: { enableStartMatch: true } },
          void 0,
          true,
        ))[1]).subarray(1);
        localDocumentNode = parsedNodes.last().getVeryFirst().getClosetBlock();
      }
    }
    localDocumentNode.addAfter(currentNext);
    if (parsedNodes.last() == localDocumentNode) {
      insertArray.push(currentNext);
    }
    if (DocumentNode.isEmptyBlock(currentNext)) {
      currentNext.set('type', NodeType.paragraph);
    } else {
      if (DocumentNode.isEmptyBlock(localDocumentNode)) {
        if (
          !(
            DocumentNode.isType(localDocumentNode, NodeType.math_block, NodeType.fences) &&
            parseResult
          )
        ) {
          localDocumentNode.set('type', NodeType.paragraph);
        }
      }
    }
    var splitResult = {
      prev: localDocumentNode,
      next: currentNext,
      insertArray: insertArray,
      cursorDiff: cursorDiff,
    };
    if (keepListItem) {
      return splitResult;
    }
    if (
      splitListItem &&
      DocumentNode.isType(localDocumentNode.get('parent'), NodeType.list_item) &&
      !localDocumentNode.get('before')
    ) {
      var listItem = localDocumentNode.get('parent'),
        currentDocumentNode = listItem.get('parent'),
        resetListNumbering = false;
      if (currentDocumentNode.get('style') == DocumentNode.ListType.ol) {
        resetListNumbering =
          currentDocumentNode.getFirstChild().get('userIndent') !=
          currentDocumentNode.getLastChild().get('userIndent');
      }
      if (resetListNumbering && !currentUndoManager) {
        currentUndoManager = undoManager.buildReplaceUndo(currentDocumentNode);
      }
      var localNext = listItem.clone();
      if (!listItem.get('after') && listItem.get('before')) {
        listItem.set('tail', listItem.get('before').get('tail'));
      }
      if (listItem.get('style') == DocumentNode.ListType.task) {
        if (0 == endOffset) {
          listItem.set('checked', false);
        } else {
          if (emptyTrailingText) {
            localNext.set('checked', false);
          }
        }
      }
      listItem.addAfter(localNext);
      localNext.appendChildrenTillEnd(currentNext);
      if (resetListNumbering) {
        let itemToRenumber = currentDocumentNode.getFirstChild();
        for (; itemToRenumber; ) {
          itemToRenumber.unset('userIndent');
          itemToRenumber = itemToRenumber.get('after');
        }
      }
      insertArray = parsedNodes.subarray(1);
      if (parsedNodes.last() == localDocumentNode) {
        parsedNodes = [listItem];
      }
      if (parsedNodes.last() == listItem) {
        insertArray.push(localNext);
      }
      splitResult = {
        prev: listItem,
        next: localNext,
        insertArray: insertArray,
        cursorDiff: cursorDiff,
      };
    }
    if (currentUndoManager && splitResult.prev) {
      splitResult.undo = currentUndoManager;
      let snapshotNode = splitResult.prev.get('in').allNodes.get(currentUndoManager.id);
      if (snapshotNode) {
        splitResult.redo = undoManager.buildReplaceUndo(snapshotNode);
      }
    }
    return splitResult;
  };
  DocumentNode.genArrFrom = function (firstNode, lastNode) {
    for (var items = [], documentNode = firstNode; documentNode != lastNode; ) {
      items.push(documentNode);
      documentNode = documentNode.get('after');
    }
    if (lastNode) {
      items.push(lastNode);
    }
    return items;
  };
  DocumentNode.getTreePosition = function (documentNode, inputDocumentNode) {
    Object.defineProperty(getNodeDepth, 'name', { value: 'n', configurable: true });

    function getNodeDepth(callbackDocumentNode) {
      if (callbackDocumentNode.get('parent')) {
        return 1 + getNodeDepth(callbackDocumentNode.get('parent'));
      } else {
        return 0;
      }
    }
    if (documentNode == inputDocumentNode) {
      return [documentNode, documentNode, inputDocumentNode];
    }
    var depthDifference = getNodeDepth(documentNode) - getNodeDepth(inputDocumentNode);
    if (depthDifference > 0) {
      for (; depthDifference > 0; ) {
        documentNode = documentNode.get('parent');
        depthDifference--;
      }
    } else {
      if (depthDifference < 0) {
        for (; depthDifference < 0; ) {
          inputDocumentNode = inputDocumentNode.get('parent');
          depthDifference++;
        }
      }
    }
    return Object.defineProperty(
      function findSharedAncestor(callbackDocumentNode, otherNode) {
        if (callbackDocumentNode == otherNode) {
          return [callbackDocumentNode, callbackDocumentNode, otherNode];
        } else {
          if (
            callbackDocumentNode.get('parent') == otherNode.get('parent') ||
            (!callbackDocumentNode.get('parent') && !callbackDocumentNode.get('parent'))
          ) {
            return [callbackDocumentNode.get('parent'), callbackDocumentNode, otherNode];
          } else {
            return findSharedAncestor(callbackDocumentNode.get('parent'), otherNode.get('parent'));
          }
        }
      },
      'name',
      { value: 'e', configurable: true },
    )(documentNode, inputDocumentNode);
  };
  DocumentNode.prototype.copyContentFrom = function (sourceNode, propertyNames) {
    var receiver = this;
    (propertyNames || DocumentNode.property).map(function (item) {
      receiver.set(item, sourceNode.get(item));
    });
    if (this.get('after')) {
      this.set('noCloseTag', void 0);
    }
  };
  DocumentNode.prototype.clone = function () {
    var documentNodeInstance = new DocumentNode();
    documentNodeInstance.copyContentFrom(this);
    documentNodeInstance.set('in', this.get('in'));
    return documentNodeInstance;
  };
  DocumentNode.reverseAttrFromElem = function (
    targetNode,
    element,
    stripMetadata,
    preserveDomIdentity,
  ) {
    var columnAlignments,
      nodeType = element.attr('mdtype');
    switch (
      (targetNode.set('type', nodeType),
      element.find('mjx-container').remove(),
      stripMetadata &&
        (element.find('[data-emoji]').text(function () {
          return this.getAttribute('data-emoji');
        }),
        element.find('.md-meta, .md-content').remove(),
        element.find('sup, sub').text(function () {
          return ' (' + this.textContent + ')';
        })),
      File.option.convertSmartOnRender &&
        !document.body.contains(element[0]) &&
        element.find("[md-inline='pants']").text(function () {
          return this.getAttribute('data-text') || this.textContent;
        }),
      targetNode.set(
        'text',
        !preserveDomIdentity &&
          DocumentNode.isType(nodeType, NodeType.paragraph, NodeType.def_footnote, NodeType.heading)
          ? (function (sourceElement) {
              var imageRoot = File.editor.imgEdit.getLocalRootUrlForInsert();
              sourceElement.find('mjx-container').remove();
              sourceElement.find("[md-inline='image'], [md-inline='imgtag']").each(function () {
                var currentElement = $(this),
                  imageSource = currentElement.attr('data-src');
                if (
                  (imageRoot || File.bundle.filePath || '') !=
                    (currentElement.attr('data-root') || '') &&
                  !/^[a-z0-9\-]+:/i.exec(imageSource)
                ) {
                  var text = currentElement.find('img').attr('src') || imageSource || '',
                    currentText = currentElement.text();
                  if (currentElement.find('img').length) {
                    text = File.editor.imgEdit.resolveImagePath(
                      text.replace(/^file:\/\//, '').replace(/[#?]([^.]*)$/, ''),
                    );
                  }
                  if (!File.option.autoEscapeImageURL) {
                    text = utilities.decodeFromEscapedPath(text);
                  }
                  currentText =
                    'image' == this.getAttribute('md-inline')
                      ? currentText.replace(
                          /(\(<?)((?:\([^)]*\)|[^()])*?)(>?[ \t]*((['"])(.*?)\5[ \t]*)?\))/,
                          '$1' + text + '$3',
                        )
                      : currentText.replace(
                          /(^<img(\s+.+)*?\s+src\s*=\s*)("([^"]+)"|'([^']+)')(.*?(\/?\s*>.*?(<\/img>)?))/,
                          '$1"' + text + '"$6',
                        );
                  currentElement.text(currentText);
                }
              });
              return sourceElement;
            })(element).text()
          : element.text(),
      ),
      ['ahead', 'tail', 'prespace', 'markindent'].forEach(function (item) {
        if (element[0].hasAttribute(item)) {
          var numericAttribute = element.attr(item) - 0;
          if (!isNaN(numericAttribute)) {
            targetNode.set(item, numericAttribute);
          }
        }
      }),
      ['pattern', 'patternEnd'].forEach(function (item) {
        if (element[0].hasAttribute(item)) {
          targetNode.set(item, element.attr(item));
        }
      }),
      ['isFixed'].forEach(function (item) {
        if (element[0].hasAttribute(item)) {
          targetNode.set(item, 'true' == element.attr(item));
        }
      }),
      nodeType)
    ) {
      case NodeType.heading:
        targetNode.set('depth', element[0].tagName.replace(/H/gi, ''));
        break;
      case NodeType.list:
        targetNode.set('style', element[0].tagName.toLowerCase());
        targetNode.set('start', (element[0].getAttribute('start') || 1) - 0);
        break;
      case NodeType.math_block:
        if (preserveDomIdentity) {
          targetNode.refcid = element.attr('cid');
        }
        break;
      case NodeType.fences:
        var lastCodeLang =
          utilities.unescape(element.attr('lang')) || element.find('.marklyra-input').text();
        if (File.editor && File.editor.fences) {
          File.editor.fences.lastCodeLang = lastCodeLang;
        }
        targetNode.set('lang', lastCodeLang);
        targetNode.set('text', element.find('textarea[id]').val() || element.text());
        break;
      case NodeType.list_item:
        if (element.hasClass('md-task-list-item')) {
          targetNode.set('style', DocumentNode.ListType.task);
        }
        targetNode.set(
          'checked',
          element.hasClass('task-list-done') ||
            'checked' == element.children('input').attr('checked'),
        );
        break;
      case NodeType.def_link:
        targetNode.set('ref', element.find('.md-def-name').text());
        targetNode.set('title', element.find('.md-def-title').text());
        targetNode.set('href', element.find('.md-def-content').text());
        break;
      case NodeType.def_footnote:
        targetNode.set('text', element.find('.md-def-content').rawText());
        targetNode.set('ref', element.find('.md-def-name').text());
        break;
      case NodeType.table:
        columnAlignments = [];
        element
          .find('tbody>tr:first')
          .children()
          .toArray()
          .map(function (item) {
            columnAlignments[item.cellIndex] = item.style.textAlign;
            if ('' == item.style.textAlign) {
              columnAlignments[item.cellIndex] = null;
            }
          });
        if (!columnAlignments.length) {
          element
            .find('thead>tr:first')
            .children()
            .toArray()
            .map(function (item) {
              columnAlignments[item.cellIndex] = item.style.textAlign;
              if ('' == item.style.textAlign) {
                columnAlignments[item.cellIndex] = null;
              }
            });
        }
        targetNode.set('align', columnAlignments);
        break;
      case NodeType.table_row:
        targetNode.set('header', element.closest('thead').length > 0);
        break;
      case NodeType.html_block:
        targetNode.set('text', element.text());
        targetNode.set('style', element.attr('data-tag'));
    }
  };
  DocumentNode.reverse = function (sourceElement, documentMap, stripMetadata, preserveDomIdentity) {
    Object.defineProperty(appendReversedChild, 'name', { value: 'l', configurable: true });

    if (sourceElement.length && sourceElement[0].hasAttribute('mdtype')) {
      var documentNode,
        currentDocumentNode = new DocumentNode({ in: documentMap });
      DocumentNode.reverseAttrFromElem(
        currentDocumentNode,
        sourceElement,
        stripMetadata,
        preserveDomIdentity,
      );
      if (currentDocumentNode.get('type') == NodeType.table) {
        sourceElement.find('tr[mdtype]').each(appendReversedChild);
        DocumentNode.TableEdit.verify(currentDocumentNode);
      } else {
        if (currentDocumentNode.get('type') == NodeType.table_row) {
          sourceElement.children().children('span[mdtype]').each(appendReversedChild);
        } else {
          sourceElement.children('[mdtype]').each(appendReversedChild);
        }
      }
      if (documentNode) {
        documentNode.unset('tail');
      }
      return currentDocumentNode;
    }
    function appendReversedChild() {
      documentNode = DocumentNode.reverse($(this), documentMap, stripMetadata, preserveDomIdentity);
      currentDocumentNode.appendChild(documentNode);
      if (!documentNode.get('before')) {
        documentNode.unset('ahead');
      }
    }
  };
  DocumentNode.prototype.attr = function (key, lastCodeLang, editor, replayingHistory) {
    Object.defineProperty(createAttributeCommand, 'name', { value: 'a', configurable: true });

    function createAttributeCommand(targetNode, previousValue) {
      var attributeCommand = editor.undo.UndoManager.makeEmptyCommand();
      attributeCommand.undo.push({
        type: 'attr',
        id: targetNode.id,
        key: key,
        value: previousValue || targetNode.safeGetStrAttr(key),
      });
      attributeCommand.redo.push({
        type: 'attr',
        key: key,
        id: targetNode.id,
        value: lastCodeLang,
      });
      return attributeCommand;
    }
    editor.undo.endSnap(true);
    if (this.get(key) != lastCodeLang) {
      if (!replayingHistory) {
        editor.store();
      }
      var attributeCommand = createAttributeCommand(this);
      switch (
        (replayingHistory || 'align_idx' == key || editor.undo.register(attributeCommand), key)
      ) {
        case 'tagBefore':
        case 'tagAfter':
          if (!((currentCm = editor.mathBlock.currentCm) && currentCm.cid == this.cid)) {
            editor.mathBlock.startEditing(this.cid);
          }
          this.set(key, lastCodeLang);
          var element = $(
            "[cid='" +
              this.id +
              "'] .md-rawblock-" +
              ('tagBefore' == key ? 'before' : 'after') +
              ' .marklyra-input',
          )
            .text(lastCodeLang || '')
            .focus();
          editor.selection.selectAllElem(element);
          break;
        case 'lang':
          var currentCm;
          if (File.editor && File.editor.fences) {
            File.editor.fences.lastCodeLang = lastCodeLang;
          }
          if (!(currentCm = editor.fences.getCm(this.id))) {
            console.sendError('Failed to get CodeMirror', 'error', lastCodeLang);
            break;
          }
          var currentElement = $("[cid='" + this.id + "']");
          if (this.get('lang') == lastCodeLang) {
            break;
          }
          if (diagrams.isDiagramType(this.get('lang'))) {
            editor.diagrams.cancelDiagram(this.id);
          }
          if (mathBlocks.isMathType(this.get('lang'))) {
            editor.mathBlock.beforeDeleteFences(this.id);
          }
          currentCm.setOption('mode', getCodeMirrorMode(lastCodeLang));
          var fenceOptions = editor.fences.getOptionsFromFencesAttr(lastCodeLang);
          if (!File.option.showLineNumbersForFence) {
            if (fenceOptions.lineNumbers) {
              currentCm.setOption('lineNumbers', true);
              currentElement.addClass('md-fences-with-lineno');
            } else {
              currentElement.removeClass('md-fences-with-lineno');
            }
          }
          if (fenceOptions.firstLineNumber) {
            currentCm.setOption('firstLineNumber', fenceOptions.firstLineNumber);
          }
          currentCm.refresh();
          this.set('lang', lastCodeLang);
          currentElement
            .attr('lang', lastCodeLang)
            .find('.CodeMirror')
            .attr('lang', (lastCodeLang || '').toLowerCase());
          if (replayingHistory) {
            var tooltipInput = $("[cid='" + this.id + "'] .code-tooltip")
              .show()
              .find('.marklyra-input')
              .text(lastCodeLang || '')
              .focus();
            editor.selection.selectAllElem(tooltipInput);
          }
          Fences.renderFencesByUpdate(this, currentElement[0], lastCodeLang);
          if (diagrams.isDiagramType(lastCodeLang)) {
            editor.diagrams.updateDiagram(this.id);
          }
          if (mathBlocks.isMathType(lastCodeLang)) {
            editor.mathBlock.updateDiagram(this.id);
          }
          break;
        case 'checked':
          var domNode = document.querySelector("[cid='" + this.id + "']>input");
          if (lastCodeLang) {
            domNode.setAttribute('checked', 'checked');
            domNode.parentElement.classList.remove('task-list-not-done');
            domNode.parentElement.classList.add('task-list-done');
          } else {
            domNode.removeAttribute('checked');
            domNode.parentElement.classList.remove('task-list-done');
            domNode.parentElement.classList.add('task-list-not-done');
          }
          domNode.checked = lastCodeLang || false;
          this.set('checked', lastCodeLang || false);
          break;
        case 'href-title':
          if (this.get('type') == NodeType.image) {
            var parts = lastCodeLang.split(/\s/);
            editor.findElemById(this.id).find('img').attr('src', parts[0]);
            this.set('href', parts[0]);
            this.set('title', parts[1]);
            if (replayingHistory) {
              if (!(element = $("[cid='" + this.id + "']")).hasClass('onfocus')) {
                element.addClass('onfocus').focus();
                editor.EditHelper.showTooltipForImage(editor, element);
                $("[cid='" + this.id + "'] input.t-bracket-input")
                  .val(lastCodeLang || '')
                  .focus();
              }
            }
          }
          break;
        case 'alt':
          if (this.get('type') == NodeType.image) {
            editor.findElemById(this.id).find('img').attr('alt', lastCodeLang);
            this.set('alt', lastCodeLang);
            if (replayingHistory) {
              if (!(element = $("[cid='" + this.id + "']")).hasClass('onfocus')) {
                element.addClass('onfocus').focus();
                editor.EditHelper.showTooltipForImage(editor, element);
                $("[cid='" + this.id + "'] input.t-alt-input")
                  .val(lastCodeLang || '')
                  .focus();
              }
            }
          }
          break;
        case 'align_idx':
          if (this.get('type') == NodeType.table) {
            var columnIndex = lastCodeLang[0],
              alignment = lastCodeLang[1],
              alignmentText = lastCodeLang[2];
            element = editor.findElemById(this.id);
            this.set('align', this.get('align') || []);
            attributeCommand = createAttributeCommand(this, [
              columnIndex,
              this.get('align')[columnIndex],
            ]);
            var userText = this.get('userText');
            if (userText) {
              attributeCommand.undo = [undoManager.buildReplaceUndo(this)];
            }
            if (!replayingHistory) {
              alignmentText = DocumentNode.adjustAlignText(this, columnIndex, alignment);
            }
            if (this.get('alignText')) {
              this.get('alignText')[columnIndex] = alignmentText;
            }
            this.get('align')[columnIndex] = alignment;
            if (userText) {
              DocumentNode.tryResetTable(this);
              attributeCommand.redo = [undoManager.buildReplaceUndo(this)];
            } else {
              if (alignmentText) {
                attributeCommand.undo.last().value.push(this.get('alignText')[columnIndex]);
                attributeCommand.redo.last().value.push(alignmentText);
              }
            }
            if (!replayingHistory) {
              var selectionSnapshot = editor.selection.buildUndo();
              if (selectionSnapshot) {
                attributeCommand.undo.unshift(selectionSnapshot);
                attributeCommand.redo.push(selectionSnapshot);
              }
              editor.undo.register(attributeCommand);
            }
            alignment = alignment || '';
            element
              .find('tbody>tr>td:nth-child(' + (columnIndex + 1) + ')')
              .css('text-align', alignment);
            element
              .find('thead>tr>th:nth-child(' + (columnIndex + 1) + ')')
              .css('text-align', alignment);
            if (replayingHistory) {
              editor.tableEdit.showTableEdit(element);
            } else {
              var elements = element.find(".md-align-gp[data-col='" + columnIndex + "']");
              elements.find('button').removeClass('active').blur();
              elements
                .find('.md-align-' + alignment)
                .addClass('active')
                .focus();
            }
          }
          break;
        default:
          this.set(key, lastCodeLang);
      }
      return attributeCommand;
    }
  };
  DocumentNode.adjustAlignText = function (tableNode, columnIndex, alignment) {
    if (tableNode.get('alignText')) {
      var text = tableNode.get('alignText')[columnIndex];
      if (text) {
        text =
          'left' == alignment || 'center' == alignment
            ? (text = text.replace(/(^\s*)-/, '$1:')).replace(/(^\s*):(\s*$)/, '$1:-$2')
            : text.replace(/(^\s*):/, '$1-');
        text =
          'right' == alignment || 'center' == alignment
            ? (text = text.replace(/-(\s*$)/, ':$1')).replace(/(^\s*):(\s*$)/, '$1-:$2')
            : text.replace(/:(\s*$)/, '-$1');
        if (/^\s*::\s*$/.exec(text)) {
          text = text.replace('::', ':-:');
        }
        return text;
      }
    }
  };
  DocumentNode.tryResetTable = function (documentNode) {
    if (
      documentNode &&
      !documentNode.isDeleted() &&
      documentNode.get('type') == NodeType.table &&
      documentNode.get('userText')
    ) {
      documentNode.set('userText', void 0);
    }
  };
  DocumentNode.prototype.unwrap = function (editor) {
    console.debug(`unwrap ${this.cid}`);
    var items = [],
      documentNode = this.getFirstChild();
    do {
      var nextNode = documentNode.get('after');
      documentNode.set('parent', this.get('parent'));
      documentNode.set('attachTo', this.get('attachTo'));
      if (!documentNode.get('before')) {
        documentNode.set('before', this.get('before'));
      }
      if (!documentNode.get('after')) {
        documentNode.set('after', this.get('after'));
      }
      items.push(documentNode);
      if (documentNode.get('pattern')) {
        documentNode.set('pattern', documentNode.get('pattern').replace(/^\s+/, ''));
      }
      documentNode = nextNode;
    } while (documentNode);
    this.remove(true);
    if (editor) {
      editor
        .findElemById(this.cid)
        .replaceWith(documentModel.NodeCollectionUtils.toHTML(items, { mathCount: 0 }));
    }
    return items;
  };
  DocumentNode.wrap = function (wrapperNode, firstNode, lastNode, editor) {
    var nextNode,
      documentNode = firstNode;
    firstNode.addBefore(wrapperNode);
    editor.findElemById(wrapperNode.cid).remove();
    do {
      nextNode = documentNode.get('after');
      wrapperNode.appendChild(documentNode);
      if (documentNode != firstNode) {
        editor.findElemById(documentNode.cid).remove();
      }
      if (documentNode == lastNode) {
        break;
      }
      documentNode = nextNode;
    } while (documentNode);
    editor.findElemById(firstNode.cid).replaceWith(wrapperNode.toHTML());
  };
}
