// editing/deletion.
export default function initializeEditingDeletion(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  requireModule('shared/utilities');
  var documentModel = requireModule('model/document-model'),
    undoManager = requireModule('editing/undo-manager'),
    SnapFlag = undoManager.SnapFlag,
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    tableEditor = (documentModel.NodeCollectionUtils, requireModule('editing/table-editor')),
    formatting = requireModule('editing/formatting'),
    listIndent = requireModule('editing/list-indent'),
    characterPairs = requireModule('editing/character-pairs'),
    skipCommand = 'skipCommand',
    contentElement = $('content'),
    clearTaskItemMarker = function (editor, inputDocumentNode) {
      var currentDocumentNode = inputDocumentNode.get('parent'),
        documentNode = currentDocumentNode && currentDocumentNode.get('parent');
      if (
        documentNode &&
        documentNode.get('style') == DocumentNode.ListType.task &&
        !currentDocumentNode.get('before') &&
        DocumentNode.isType(currentDocumentNode, NodeType.paragraph)
      ) {
        var styleCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
        styleCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
        documentNode.unset('style');
        documentNode.unset('checked');
        editor.findElemById(documentNode.cid).replaceWith(documentNode.toHTML());
        styleCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
        editor.undo.exeCommand(styleCommand.undo[0]);
        styleCommand.redo.push(editor.selection.buildUndo());
        return styleCommand;
      }
    },
    outdentAtBlockStart = function (editor, documentNode, forceOutdent) {
      editor.undo.endSnap(true);
      var inBlockquote =
          DocumentNode.isType(documentNode.get('parent'), NodeType.blockquote) &&
          (forceOutdent || !documentNode.get('before')),
        inListItem =
          DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) &&
          (forceOutdent ||
            (!documentNode.get('parent').get('before') && !documentNode.get('before')));
      if (inBlockquote || inListItem) {
        var outdentCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo()),
          outdentResult = DocumentNode.upStream(documentNode, outdentCommand);
        editor.findElemById(outdentResult.oldCid).replaceWith(outdentResult.newHtml);
        editor.undo.exeCommand(outdentCommand.undo[0]);
        outdentCommand.redo.push(editor.selection.buildUndo());
        return outdentCommand;
      }
    },
    convertToParagraph = function (editor, documentNode, clearText, skipCursorEvent) {
      editor.undo.endSnap(true);
      var paragraphCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
      paragraphCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
      documentNode.set('type', NodeType.paragraph);
      documentNode.clearChildren();
      if (clearText) {
        documentNode.set('text', '');
      } else {
        documentNode.set('text', documentNode.get('text').replace(/\u200B|(\r?\n)/g, ''));
      }
      paragraphCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
      editor.findElemById(documentNode.id).replaceWith(documentNode.toHTML());
      editor.selection.jumpIntoElemBegin(editor.findElemById(documentNode.id));
      paragraphCommand.redo.push(editor.selection.buildUndo());
      if (!skipCursorEvent) {
        $(editor.sessionStr).trigger('cursorChange');
      }
      return paragraphCommand;
    },
    deleteNodeElement = function (editor, element, event, deferRegistration) {
      editor.undo.endSnap(true);
      if (element && element.length) {
        if (event) {
          event.preventDefault();
        }
        var targetNode = editor.findNodeByElem(element),
          deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
        if (targetNode) {
          targetNode.set('text', '');
          deleteCommand = undoManager.append(deleteCommand, convertToParagraph(editor, targetNode));
        } else {
          targetNode = editor.findNodeByElem(element.closest('[mdtype]'));
          deleteCommand.undo.push(undoManager.buildReplaceUndo(targetNode));
          editor.selection.moveLeftOrRight(true, event);
          element.remove();
          editor.store(targetNode.id);
          deleteCommand.redo.push(undoManager.buildReplaceUndo(targetNode));
          deleteCommand.redo.push(editor.selection.buildUndo());
        }
        if (!deferRegistration) {
          editor.undo.register(deleteCommand);
        }
        return deleteCommand;
      }
    },
    handleBackspace = function (
      editor,
      keyboardEvent,
      deleteMode,
      deferRegistration,
      allowNativeDeletion,
    ) {
      if (editor.needRemoveMathAfterSym) {
        editor.needRemoveMathAfterSym = false;
        $('.math-jax-postprocess>.md-math-after-sym').text('');
      }
      var currentDocumentNode,
        documentNode,
        deleteCommand,
        selectionBookmark,
        metadataRange = editor.selection.includeTrailMeta(editor.selection.getRangy()),
        range = metadataRange && editor.selection.deRange(metadataRange.cloneRange()),
        activeElement = document.activeElement,
        selectionExtended = false,
        historyRange = metadataRange;
      function findVisibleSibling(inputDocumentNode, stopAncestor, siblingDirection) {
        var siblingNode,
          localDocumentNode = inputDocumentNode;
        if (inputDocumentNode == stopAncestor) {
          return null;
        }
        for (siblingNode = inputDocumentNode.get(siblingDirection); siblingNode; ) {
          $("[cid='" + siblingNode.id + "']").remove();
          siblingNode.remove();
          siblingNode = inputDocumentNode.get(siblingDirection);
        }
        findVisibleSibling(inputDocumentNode.get('parent'), stopAncestor, siblingDirection);
        return localDocumentNode;
      }
      function deleteRangeStart(editor, selectionRange, boundaryNode, deleteCommand, withinTable) {
        var removedContents,
          startRemainder,
          retainedAncestor,
          currentRange = selectionRange.cloneRange(),
          nodeElement = editor.findElemById(boundaryNode.id);
        if (nodeElement.length) {
          currentRange.setEndAfter(nodeElement[0]);
          editor.selection.deRange(currentRange);
          startRemainder = editor.findNodeByElem(editor.getMarkElem(currentRange.startContainer));
          if (!withinTable && $(currentRange.startContainer).closest('table').length) {
            undoManager.append(deleteCommand, deleteTableSelection(editor, currentRange, true));
            startRemainder = editor.findNodeByElem(
              $(currentRange.startContainer).closest("[mdtype='table']"),
            );
            if (
              boundaryNode.contains(startRemainder) &&
              (findVisibleSibling(startRemainder, boundaryNode, 'after'),
              0 === startRemainder.getText().length)
            ) {
              undoManager.append(deleteCommand, convertToParagraph(editor, startRemainder));
              return 'abortAndSkipCursor';
            } else {
              return 'abort';
            }
          } else {
            deleteCommand.undo.push(undoManager.buildReplaceUndo(boundaryNode));
            removedContents = $(currentRange.extractContents());
            if (
              DocumentNode.isType.apply(null, [boundaryNode].concat(formatting.CONST.Selectable))
            ) {
              undoManager.append(
                deleteCommand,
                convertToParagraph(editor, boundaryNode, true, true),
              );
            }
            editor.store(startRemainder, true);
            editor.findElemById(startRemainder.cid).replaceWith(startRemainder.toHTML());
            retainedAncestor = findVisibleSibling(startRemainder, boundaryNode, 'after');
            return (
              !!(
                removedContents.text().length ||
                removedContents.find('img').length ||
                retainedAncestor
              ) &&
              (deleteCommand.redo.push(undoManager.buildReplaceUndo(boundaryNode)), startRemainder)
            );
          }
        } else {
          return 'abort';
        }
      }
      function deleteRangeEnd(editor, selectionRange, boundaryNode, deleteCommand, withinTable) {
        var removedContents,
          endRemainder,
          retainedAncestor,
          currentRange = selectionRange.cloneRange(),
          nodeElement = editor.findElemById(boundaryNode.id);
        currentRange.setStartBefore(nodeElement[0]);
        editor.selection.deRange(currentRange);
        if (!withinTable && $(currentRange.endContainer).closest('table').length) {
          undoManager.append(deleteCommand, deleteTableSelection(editor, currentRange, true));
          endRemainder = editor.findNodeByElem(
            $(currentRange.endContainer).closest("[mdtype='table']"),
          );
          return 'abort';
        }
        deleteCommand.undo.push(undoManager.buildReplaceUndo(boundaryNode));
        endRemainder = editor.findNodeByElem(
          editor.getMarkElem(editor.selection.getEndNode(currentRange)),
        );
        removedContents = $(currentRange.extractContents());
        editor.store(endRemainder, true);
        var currentNodeElement = editor.findElemById(endRemainder.cid);
        retainedAncestor = findVisibleSibling(endRemainder, boundaryNode, 'before');
        if (
          removedContents.text().length ||
          removedContents.find('img').length ||
          retainedAncestor
        ) {
          for (
            deleteCommand.redo.push(undoManager.buildReplaceUndo(boundaryNode));
            currentNodeElement.parent().closest('.md-task-list-item').length;
          ) {
            currentNodeElement = currentNodeElement.parent().closest('.md-task-list-item');
          }
          if (currentNodeElement.hasClass('md-task-list-item')) {
            currentNodeElement.replaceWith(editor.findNodeByElem(currentNodeElement).toHTML());
          } else {
            currentNodeElement.replaceWith(endRemainder.toHTML());
          }
          return endRemainder;
        }
        currentNodeElement.replaceWith(endRemainder.toHTML());
        return false;
      }
      function deleteRangeBetweenNodes(
        editor,
        callbackDocumentNode,
        endNode,
        startBlock,
        inputDocumentNode,
        deleteCommand,
        retainedStart,
      ) {
        var text, start, element, removedAncestor;
        function findRetainedAncestor(node, stopNode) {
          if (node == stopNode || node.get('before') || node.get('after')) {
            return node;
          } else {
            return findRetainedAncestor(node.get('parent'), stopNode);
          }
        }
        console.debug('spliceStartAndEnd');
        var localDocumentNode,
          startEmpty = DocumentNode.isEmptyBlock(startBlock);
        if (
          !startEmpty ||
          startBlock == inputDocumentNode ||
          (DocumentNode.isEmptyBlock(inputDocumentNode) && !retainedStart)
        ) {
          if (startEmpty && startBlock == inputDocumentNode && inputDocumentNode.isBlock()) {
            inputDocumentNode.set('type', NodeType.paragraph);
            inputDocumentNode.set('text', '');
            inputDocumentNode.clearChildren();
            editor.findElemById(inputDocumentNode.id).replaceWith(inputDocumentNode.toHTML());
            editor.selection.jumpIntoElemBegin(editor.findElemById(inputDocumentNode.id));
            deleteCommand.redo.push(editor.selection.buildUndo());
          } else {
            console.assert(callbackDocumentNode != endNode, 'Error on spliceStartAndEnd');
            if (callbackDocumentNode != endNode) {
              text = endNode.safeGetStrAttr('text');
              removedAncestor = findRetainedAncestor(endNode, inputDocumentNode);
              undoManager.addUndoForRemove(deleteCommand, removedAncestor);
              editor.findElemById(removedAncestor.id).remove();
              removedAncestor.remove();
              localDocumentNode = callbackDocumentNode;
              start = DocumentNode.isType(
                localDocumentNode,
                NodeType.math_block,
                NodeType.fences,
                NodeType.html_block,
              )
                ? localDocumentNode.get('text').length
                : $(localDocumentNode.toHTML()).rawText().length;
              deleteCommand.undo.push(undoManager.buildReplaceUndo(startBlock));
              if (DocumentNode.isType(callbackDocumentNode, NodeType.def_link)) {
                if (callbackDocumentNode.safeGetStrAttr('title').length) {
                  callbackDocumentNode.set('title', callbackDocumentNode.get('title') + text);
                } else {
                  var match = /["']([^"]*)["']\s*$/g.exec(text);
                  text = text.replace(/"([^"])*"\s*$/, '');
                  if (match) {
                    callbackDocumentNode.set('title', match[1]);
                  }
                  callbackDocumentNode.set('href', callbackDocumentNode.get('href') + text);
                }
              } else {
                callbackDocumentNode.set(
                  'text',
                  callbackDocumentNode.safeGetStrAttr('text') + text,
                );
              }
              if (
                removedAncestor != inputDocumentNode &&
                inputDocumentNode !== endNode &&
                inputDocumentNode.get('before') == startBlock &&
                DocumentNode.isType(startBlock, NodeType.list_item)
              ) {
                var firstChild = inputDocumentNode.getFirstChild();
                undoManager.addUndoForRemove(deleteCommand, inputDocumentNode);
                startBlock.appendChildrenTillEnd(firstChild);
                editor.findElemById(inputDocumentNode.id).remove();
                inputDocumentNode.remove();
              }
              deleteCommand.redo.push(undoManager.buildReplaceUndo(startBlock));
              editor.findElemById(startBlock.id).replaceWith(startBlock.toHTML());
              element = editor.findElemById(callbackDocumentNode.id);
            }
            if (
              (element = editor.findElemById(callbackDocumentNode.id)).hasClass('md-def-link') ||
              element.hasClass('md-def-footnote')
            ) {
              element.attr('contenteditable', 'true');
            }
            editor.undo.exeCommand({
              type: 'cursor',
              id: callbackDocumentNode.id,
              start: start,
              end: start,
            });
            deleteCommand.redo.push(editor.selection.buildUndo());
          }
        } else {
          editor.findElemById(startBlock.id).remove();
          undoManager.addUndoForRemove(deleteCommand, startBlock);
          startBlock.remove();
          var survivingAncestor = findRetainedAncestor(endNode, inputDocumentNode);
          editor.findElemById(survivingAncestor.id).replaceWith(survivingAncestor.toHTML());
          editor.selection.jumpIntoElemBegin(editor.findElemById(survivingAncestor.id));
        }
      }
      function deletePreviousBlock(editor, inputDocumentNode) {
        var localDocumentNode = inputDocumentNode.get('before');
        function removeBlockWithUndo(removedNode) {
          var deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
          undoManager.addUndoForRemove(deleteCommand, removedNode);
          editor.findElemById(removedNode.id).remove();
          removedNode.remove();
          deleteCommand.redo.push(editor.selection.buildUndo());
          return deleteCommand;
        }
        if (DocumentNode.isType(localDocumentNode, NodeType.hr)) {
          return removeBlockWithUndo(localDocumentNode);
        } else {
          if (
            localDocumentNode &&
            !DocumentNode.isEmptyBlock(inputDocumentNode) &&
            DocumentNode.isEmptyBlock(localDocumentNode)
          ) {
            return removeBlockWithUndo(localDocumentNode);
          } else {
            if (
              !localDocumentNode &&
              DocumentNode.isType(inputDocumentNode.get('parent'), NodeType.list_item) &&
              (localDocumentNode = inputDocumentNode.get('parent').get('before')) &&
              1 == localDocumentNode.get('children').length &&
              DocumentNode.isEmptyBlock(localDocumentNode.get('children').at(0))
            ) {
              return removeBlockWithUndo(localDocumentNode);
            } else {
              return void 0;
            }
          }
        }
      }
      function handleTableBoundary(editor, inputDocumentNode) {
        if (DocumentNode.isType(inputDocumentNode, NodeType.table_cell)) {
          var parentNode = inputDocumentNode.get('parent').get('parent');
          if (
            keyboardEvent &&
            !deleteMode &&
            !inputDocumentNode.get('before') &&
            !inputDocumentNode.get('parent').get('before') &&
            editor.tableEdit.isTableEmpty(parentNode)
          ) {
            return editor.tableEdit.deleteTable(editor.findElemById(parentNode.cid), true);
          }
          var previousCell = tableEditor.getSibling(inputDocumentNode, 'before');
          if (previousCell) {
            deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
            editor.selection.jumpIntoElemEnd(editor.findElemById(previousCell.id));
            deleteCommand.redo.push(editor.selection.buildUndo());
          }
          return deleteCommand;
        }
      }
      function restoreParagraphBeforeDeletion(editor, targetNode) {
        if (DocumentNode.isType(targetNode, DocumentNode.backToParagraphBeforeDelete)) {
          editor.stylize.changeBlock(NodeType.paragraph, targetNode);
          return skipCommand;
        }
      }
      function handleBlockStartDeletion(
        editor,
        inputDocumentNode,
        callbackDocumentNode,
        previousLeaf,
        previousSibling,
      ) {
        for (
          var deleteHandlers = [
              handleTableBoundary,
              deletePreviousBlock,
              clearTaskItemMarker,
              outdentAtBlockStart,
              listIndent.tryConvertListItemToUpperParagraph,
              restoreParagraphBeforeDeletion,
            ],
            handledCommand = null,
            itemIndex = 0;
          itemIndex < deleteHandlers.length;
          itemIndex++
        ) {
          if ((handledCommand = deleteHandlers[itemIndex](editor, inputDocumentNode))) {
            return handledCommand;
          }
        }
        callbackDocumentNode = callbackDocumentNode || inputDocumentNode;
        previousSibling = previousSibling || callbackDocumentNode.get('before');
        previousLeaf = previousLeaf || (previousSibling && previousSibling.getVeryFirst(true));
        if (!handledCommand && previousLeaf) {
          deleteRangeBetweenNodes(
            editor,
            previousLeaf,
            inputDocumentNode,
            previousSibling,
            callbackDocumentNode,
            (handledCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo())),
          );
        }
        if (
          !handledCommand &&
          !previousLeaf &&
          DocumentNode.isType(inputDocumentNode, NodeType.paragraph) &&
          DocumentNode.isEmptyBlock(inputDocumentNode) &&
          inputDocumentNode.get('after')
        ) {
          console.debug('delete empty node and promise after node');
          handledCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
          var nodeId = inputDocumentNode.get('after').cid;
          undoManager.addUndoForRemove(handledCommand, inputDocumentNode);
          inputDocumentNode.remove();
          editor.findElemById(inputDocumentNode.cid).remove();
          editor.selection.jumpIntoElemBegin(editor.findElemById(nodeId));
          handledCommand.redo.push(editor.selection.buildUndo());
        }
        return handledCommand;
      }
      function deleteTableSelection(editor, inputRange, skipCursorSnapshot) {
        console.debug('backspaceOnTableHandler');
        var cursorSnapshot,
          startPosition = editor.selection.getDetailPos(
            inputRange.startContainer,
            inputRange.startOffset,
          ),
          endPosition = editor.selection.getDetailPos(
            inputRange.endContainer,
            inputRange.endOffset,
          ),
          deleteCommand = undoManager.makeEmptyCommand(),
          startElement = editor.getMarkElem(startPosition[0]),
          endElement = editor.getMarkElem(endPosition[0]),
          element = endElement.closest('[mdtype="table"]'),
          tableNode = editor.findNodeByElem(element),
          startCell = editor.findNodeByElem(startElement),
          endCell = editor.findNodeByElem(endElement);
        if (!skipCursorSnapshot) {
          (cursorSnapshot = inputRange.cloneRange()).collapse(true);
          cursorSnapshot = editor.selection.buildUndo(cursorSnapshot);
        }
        inputRange.setStart(startPosition[0], startPosition[1]);
        inputRange.setEnd(endPosition[0], endPosition[1]);
        if (startCell == endCell) {
          if (
            !(
              inputRange.collapsed ||
              !DocumentNode.isType(startCell, NodeType.table_cell) ||
              (startElement[0] != inputRange.commonAncestorContainer &&
                !startElement[0].contains(inputRange.commonAncestorContainer))
            )
          ) {
            deleteCommand.undo.push(undoManager.buildReplaceUndo(startCell));
            inputRange.extractContents();
            editor.store(startCell, true);
            deleteCommand.redo.push(undoManager.buildReplaceUndo(startCell));
            deleteCommand.redo.push(editor.selection.buildUndo(inputRange));
          }
          return deleteCommand;
        }
        deleteCommand.undo.push(undoManager.buildReplaceUndo(tableNode));
        var middleCell,
          clearedMiddle,
          startRemainder = deleteRangeStart(editor, inputRange, startCell, deleteCommand, true),
          endRemainder = deleteRangeEnd(editor, inputRange, endCell, deleteCommand, true);
        for (
          startRemainder &&
            (startRemainder.unset('marginLeft'), startRemainder.unset('marginRight')),
            endRemainder && (endRemainder.unset('marginLeft'), endRemainder.unset('marginRight')),
            middleCell = tableNode.contains(startCell)
              ? editor.tableEdit.getSibling(startCell, 'after')
              : tableNode.getVeryFirst();
          middleCell && middleCell != endCell;
        ) {
          middleCell.set('text', '');
          middleCell.unset('marginLeft');
          middleCell.unset('marginRight');
          clearedMiddle = true;
          middleCell = editor.tableEdit.getSibling(middleCell, 'after');
        }
        if (startRemainder || endRemainder || clearedMiddle) {
          editor.findElemById(tableNode.id).replaceWith(tableNode.toHTML());
          deleteCommand.redo.push(undoManager.buildReplaceUndo(tableNode));
        } else {
          deleteCommand.undo.pop();
        }
        if (!skipCursorSnapshot) {
          deleteCommand.redo.push(cursorSnapshot);
          editor.undo.exeCommand(cursorSnapshot);
        }
        return deleteCommand;
      }
      function readDeletionSelection(inputRange) {
        editor.selection.deRange(inputRange);
        currentDocumentNode = editor.getMarkElem(inputRange.commonAncestorContainer);
        documentNode = editor.nodeMap.allNodes.get(currentDocumentNode.attr('cid'));
        selectionBookmark = inputRange.getBookmark(currentDocumentNode[0]);
        return (
          currentDocumentNode.length &&
          documentNode &&
          !documentNode.get('children').length &&
          0 == selectionBookmark.start &&
          !deleteMode
        );
      }
      function selectPreviousUnholdableBlock() {
        var selectablePrevious = null;
        if (
          DocumentNode.isType(
            documentNode.get('before'),
            DocumentNode.TYPE.hr,
            DocumentNode.TYPE.toc,
          )
        ) {
          selectablePrevious = documentNode.get('before');
        }
        if (keyboardEvent) {
          keyboardEvent.preventDefault();
        }
        $('.md-tooltip-remove').remove();
        currentDocumentNode.prev('[cid]').addClass('md-expand');
        if ((deleteCommand = handleBlockStartDeletion(editor, documentNode)) === skipCommand) {
        } else {
          if (!deferRegistration) {
            if (selectablePrevious) {
              editor.selection.selectNode(selectablePrevious);
              deleteCommand.redo.push(editor.selection.buildUndo());
            }
            editor.undo.register(deleteCommand);
            editor.refresh();
            if (!selectablePrevious) {
              editor.findElemById(documentNode.cid).trigger('refocus');
            }
            editor.refocus();
            editor.selection.scrollAdjust();
            return deleteCommand;
          }
        }
      }
      var currentElement = $(document.activeElement).closest('.CodeMirror');
      if (currentElement.length) {
        var CodeMirror = currentElement[0].CodeMirror;
        if (CodeMirror.getValue()) {
          return void CodeMirror.execCommand('delCharBefore');
        } else {
          return removeFocusedBlock(editor, deferRegistration);
        }
      }
      if (
        DocumentNode.isType(
          activeElement.getAttribute('mdtype'),
          DocumentNode.TYPE.hr,
          DocumentNode.TYPE.toc,
        )
      ) {
        var localElement = $(activeElement).closest('[mdtype]');
        return deleteNodeElement(editor, localElement, keyboardEvent, deferRegistration);
      }
      if (activeElement.getAttribute('mdtype') == NodeType.math_block) {
        if (keyboardEvent) {
          keyboardEvent.preventDefault();
        }
        editor.mathBlock.remove(activeElement.getAttribute('cid'));
        return deleteCommand;
      }
      if (deleteMode && 'Backspace' != deleteMode) {
        if (true === deleteMode) {
          deleteMode = 'Delete';
        }
      } else {
        deleteMode = false;
      }
      if (range) {
        if (
          $(range.commonAncestorContainer).closest("[mdtype='table_row']").length &&
          keyboardEvent &&
          keyboardEvent.shiftKey &&
          (File.isMac ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)
        ) {
          keyboardEvent.preventDefault();
          editor.tableEdit.deleteRow();
          return skipCommand;
        }
        if (range.collapsed) {
          if (deleteMode) {
            if (
              'Delete' == deleteMode &&
              (function (inputRange) {
                editor.selection.deRange(inputRange);
                currentDocumentNode = editor.getMarkElem(inputRange.commonAncestorContainer);
                documentNode = editor.nodeMap.allNodes.get(currentDocumentNode.attr('cid'));
                selectionBookmark = inputRange.getBookmark(currentDocumentNode[0]);
                if ('Delete' == deleteMode && !documentNode.get('children').length) {
                  if (
                    DocumentNode.isType(
                      currentDocumentNode.attr('mdtype'),
                      NodeType.paragraph,
                      NodeType.heading,
                    )
                  ) {
                    return 0 == currentDocumentNode.text().length;
                  }
                  if (
                    DocumentNode.isType(
                      currentDocumentNode.attr('mdtype'),
                      NodeType.def_footnote,
                      NodeType.def_link,
                    )
                  ) {
                    return 0 == currentDocumentNode.text().replace(/[\u200b\u00a0]/g, '').length;
                  }
                }
              })(range) &&
              (deleteCommand = (function () {
                if (documentNode.get('after')) {
                  localDocumentNode = documentNode;
                  nodeId = documentNode.get('after').getVeryFirst().cid;
                  deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
                  editor.findElemById(localDocumentNode.cid).remove();
                  undoManager.addUndoForRemove(deleteCommand, localDocumentNode);
                  localDocumentNode.remove();
                  editor.selection.jumpIntoElemBegin(editor.findElemById(nodeId));
                  deleteCommand.redo.push(editor.selection.buildUndo());
                  return deleteCommand;
                } else {
                  if (DocumentNode.isType(documentNode, NodeType.paragraph)) {
                    return null;
                  } else {
                    return convertToParagraph(editor, documentNode, true, true);
                  }
                }
                var localDocumentNode, nodeId, deleteCommand;
              })())
            ) {
              if (!deferRegistration) {
                editor.undo.register(deleteCommand);
                editor.refocus();
              }
              if (keyboardEvent) {
                keyboardEvent.preventDefault();
              }
              return deleteCommand;
            }
          } else {
            if (readDeletionSelection(range)) {
              return selectPreviousUnholdableBlock();
            }
          }
          wordModifier =
            keyboardEvent && (File.isNodeHtml ? keyboardEvent.ctrlKey : keyboardEvent.altKey);
          rangeExtended = false;
          if (
            true ===
            (range =
              'delSelection' == deleteMode
                ? editor.selection.getRangy()
                : (wordModifier ||
                    (rangeExtended = editor.selection.extendCharFromCollapse(range, !deleteMode)),
                  rangeExtended ||
                    ((selectionExtended = true),
                    File.inBusyMode &&
                      setAttributeOnlyNeeded(editor.writingArea, 'contenteditable', 'true'),
                    deleteMode
                      ? (window
                          .getSelection()
                          .modify('extend', 'forward', wordModifier ? 'word' : 'character'),
                        (range = editor.selection.getRangy()))
                      : (window
                          .getSelection()
                          .modify('extend', 'backward', wordModifier ? 'word' : 'character'),
                        (range = (function (deleteWholeLine) {
                          if (deleteWholeLine) {
                            if (/\n/.exec(window.getSelection().toString())) {
                              range.setStart(range.startContainer, 0);
                              range.select(range.isBackward);
                            } else {
                              range = editor.selection.getRangy();
                            }
                            return range;
                          } else {
                            return editor.selection.getRangy();
                          }
                        })(wordModifier)))),
                  !deleteMode && /^\u200b|\007F$/g.exec(range.toString())
                    ? (editor.selection.extendCharFromCollapse(range, true),
                      readDeletionSelection(range) || range)
                    : range))
          ) {
            return selectPreviousUnholdableBlock();
          }
          if (!deleteMode && characterPairs.tryRemovePairStart(editor, range)) {
            allowNativeDeletion = false;
          }
          if ('delSelection' == deleteMode && range && range.collapsed) {
            if (keyboardEvent) {
              keyboardEvent.preventDefault();
            }
            return undoManager.makeEmptyCommand();
          }
        } else {
          !(function (inputRange) {
            if (editor.selection.selectWordTime && File.isMac) {
              if (deleteMode) {
                if (
                  'Delete' == deleteMode &&
                  inputRange.endContainer.nodeType === document.TEXT_NODE
                ) {
                  adjacentCharacter = inputRange.endContainer.textContent.charAt(
                    inputRange.endOffset,
                  );
                  if (/\s/.exec(adjacentCharacter)) {
                    inputRange.endOffset++;
                    historyRange = inputRange.cloneRange();
                  }
                }
              } else {
                if (
                  inputRange.startOffset > 0 &&
                  inputRange.startContainer.nodeType === document.TEXT_NODE
                ) {
                  var adjacentCharacter = inputRange.startContainer.textContent.charAt(
                    inputRange.startOffset - 1,
                  );
                  if (/\s/.exec(adjacentCharacter)) {
                    inputRange.startOffset--;
                    historyRange = inputRange.cloneRange();
                  }
                }
              }
            }
          })(range);
        }
        var wordModifier, rangeExtended;
        (function (inputRange) {
          if (
            inputRange.startContainer.parentElement &&
            inputRange.startContainer.parentElement.classList.contains('md-pants') &&
            0 == inputRange.startOffset
          ) {
            inputRange.setStart(inputRange.startContainer.parentElement, 0);
          }
        })(range);
        if (
          allowNativeDeletion &&
          (function () {
            if (
              !(
                range.commonAncestorContainer.nodeType != document.TEXT_NODE ||
                (0 == deleteMode && range.startOffset <= 1) ||
                ('Delete' == deleteMode &&
                  range.endOffset >= range.commonAncestorContainer.textContent.length - 1)
              )
            ) {
              if (
                File.isNodeHtml &&
                keyboardEvent &&
                keyboardEvent.ctrlKey &&
                !keyboardEvent.shiftKey
              ) {
                return false;
              }
              if (editor.selection.getRangy().endContainer == range.endContainer) {
                return true;
              }
            }
          })()
        ) {
          return null;
        }
        editor.selection.selectWordTime = null;
        editor.selection.deRange(range);
        currentDocumentNode = editor.getMarkElem(range.commonAncestorContainer);
        documentNode = editor.nodeMap.allNodes.get(currentDocumentNode.attr('cid'));
        if (selectionExtended) {
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(metadataRange.nativeRange);
        }
        if (!currentDocumentNode.length || documentNode) {
          if (currentDocumentNode.length && !documentNode.get('children').length) {
            if (currentDocumentNode.get('type') !== NodeType.fences) {
              return (function (editor, event, inputRange, inputElement, deferRegistration) {
                var element,
                  crossesElements = 3 !== inputRange.commonAncestorContainer.nodeType,
                  localDocumentNode = editor.getNode(inputElement.attr('cid'));
                if (!deferRegistration) {
                  editor.undo.addSnap(localDocumentNode.cid, SnapFlag.NONE);
                  editor.brush.clearAndPause();
                }
                var selectionSnapshot = editor.selection.buildUndo(historyRange);
                (deleteCommand = undoManager.makeEmptyCommand(selectionSnapshot)).undo.push(
                  undoManager.buildReplaceUndo(localDocumentNode),
                );
                if (
                  !crossesElements &&
                  selectionSnapshot &&
                  selectionSnapshot.startId == selectionSnapshot.endId &&
                  DocumentNode.isType(localDocumentNode, NodeType.line)
                ) {
                  var length = (
                      inputElement
                        .text()
                        .substring(0, selectionSnapshot.start)
                        .match(/\u200b/g) || []
                    ).length,
                    currentLength = (
                      inputElement
                        .text()
                        .substring(0, selectionSnapshot.end)
                        .match(/\u200b/g) || []
                    ).length;
                  if (
                    editor.undo.lastSnap &&
                    editor.undo.lastSnap.selection.end == selectionSnapshot.end &&
                    editor.undo.lastSnap.selection.start == selectionSnapshot.start
                  ) {
                    editor.undo.lastSnap.selection.start -= length;
                    editor.undo.lastSnap.selection.end -= currentLength;
                  } else {
                    selectionSnapshot.start -= length;
                    selectionSnapshot.end -= currentLength;
                  }
                }
                var previousScrollTop = contentElement.scrollTop(),
                  domNode = inputRange.commonAncestorContainer;
                if (!domNode.contains(document.querySelector('#write'))) {
                  if (domNode.parentElement.getAttribute('md-inline')) {
                    var parentElement = domNode.parentElement;
                    if (
                      1 == inputElement.children().length &&
                      inputElement.children()[0] == parentElement
                    ) {
                      if (
                        !(
                          parentElement.textContent.length != inputRange.toString().length ||
                          parentElement.style.display
                        )
                      ) {
                        parentElement.style.display = 'inline-block';
                      }
                    }
                  }
                  inputRange.toString();
                  element = inputRange.extractContents();
                  if (previousScrollTop != contentElement.scrollTop()) {
                    editor.undo.clearEventTimer();
                  }
                  editor.store(localDocumentNode.cid);
                  deleteCommand.redo.push(undoManager.buildReplaceUndo(localDocumentNode));
                  if (
                    DocumentNode.isType(localDocumentNode, NodeType.def_link, NodeType.def_footnote)
                  ) {
                    editor.selection.deRange(inputRange, true);
                  } else {
                    if (!localDocumentNode.getText().length) {
                      editor
                        .findElemById(localDocumentNode.cid)
                        .html($(localDocumentNode.toHTML()).html());
                      inputRange = editor.selection.getRangy();
                      editor.selection.deRange(inputRange, true);
                    }
                  }
                  deleteCommand.redo.push(editor.selection.buildUndo());
                  element.querySelector('img');
                  inputRange.collapse(false);
                  if (crossesElements) {
                    var nodeId = inputElement.attr('cid');
                    crossesElements = editor.selection.saveSelection(inputElement, inputRange);
                    inputRange.setStart(inputElement[0], 0);
                    var start = 0;
                    inputElement.find('.md-emoji-control-ch').each(function () {
                      let markerOffset = (this.textContent + '').indexOf('​');
                      if (0 == inputRange.comparePoint(this, markerOffset + 1)) {
                        start++;
                        this.textContent = '';
                      }
                    });
                    if (start) {
                      crossesElements.start -= start;
                      crossesElements.end -= start;
                    }
                    editor.store(nodeId, true);
                    if (deferRegistration) {
                      inputElement.replaceWith(editor.nodeMap.allNodes.get(nodeId).toHTML());
                      inputElement = editor.findElemById(nodeId);
                    }
                    editor.selection.restoreSelection(inputElement, crossesElements);
                    editor.focusCid = null;
                    editor.refocus();
                  }
                  editor.brush.addToQueue(inputElement.attr('cid'));
                  if (!deferRegistration) {
                    editor.brush.resume(true);
                  }
                  if (event) {
                    event.preventDefault();
                    $('#write').trigger('input');
                  }
                  if (!(deferRegistration || null != event)) {
                    editor.undo.register(deleteCommand);
                  }
                  return deleteCommand;
                }
              })(editor, keyboardEvent, range, currentDocumentNode, deferRegistration);
            }
            deleteCommand = deleteNodeElement(
              editor,
              currentDocumentNode,
              keyboardEvent,
              deferRegistration,
            );
          } else {
            console.debug('handle block change');
            if (keyboardEvent) {
              keyboardEvent.preventDefault();
            }
            $('.md-tooltip-remove').remove();
            deleteCommand = (function (editor, inputRange, forceMerge) {
              if (
                !(
                  document.contains(inputRange.startContainer) ||
                  (console.debug('try to delete on nonexist dom'),
                  (inputRange = editor.selection.getRangy()))
                )
              ) {
                return undoManager.makeEmptyCommand();
              }
              var startPosition = editor.selection.getDetailPos(
                  inputRange.startContainer,
                  inputRange.startOffset,
                ),
                endPosition = editor.selection.getDetailPos(
                  inputRange.endContainer,
                  inputRange.endOffset,
                ),
                startElement = editor.getMarkElem(startPosition[0]),
                endElement = editor.getMarkElem(endPosition[0]),
                startNode = editor.findNodeByElem(startElement),
                endNode = editor.findNodeByElem(endElement);
              if (!startNode || !endNode) {
                return undoManager.makeEmptyCommand();
              }
              var treePosition = DocumentNode.getTreePosition(startNode, endNode),
                localDocumentNode = treePosition[1],
                lastBlock = treePosition[2],
                deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo()),
                cursorSnapshot = inputRange.cloneRange();
              if (startElement[0] == endElement[0]) {
                return deleteCommand;
              }
              cursorSnapshot.collapse(true);
              cursorSnapshot = editor.selection.buildUndo(cursorSnapshot);
              inputRange.setStart(startPosition[0], startPosition[1]);
              inputRange.setEnd(endPosition[0], endPosition[1]);
              if ($(inputRange.commonAncestorContainer).closest('[mdtype="table"]').length) {
                return undoManager.append(deleteCommand, deleteTableSelection(editor, inputRange));
              }
              var startRemainder = deleteRangeStart(
                  editor,
                  inputRange,
                  localDocumentNode,
                  deleteCommand,
                ),
                endRemainder = deleteRangeEnd(editor, inputRange, lastBlock, deleteCommand),
                middleNode = localDocumentNode.get('after'),
                items = [];
              for (
                inputRange = editor.selection.getRangy(),
                  editor.selection.deRange(inputRange, true);
                middleNode && middleNode != lastBlock;
              ) {
                items.push(middleNode);
                middleNode = middleNode.get('after');
              }
              undoManager.addUndoForRemoveArray(deleteCommand, items, localDocumentNode, lastBlock);
              items.map(function (item) {
                var nodeElement = editor.findElemById(item.id);
                if (nodeElement.attr('mdtype') == NodeType.math_block) {
                  editor.mathBlock.beforeDeleteFences(nodeElement[0].getAttribute('cid'));
                } else {
                  nodeElement.find("[mdtype='math_block']").each(function () {
                    editor.mathBlock.beforeDeleteFences(this.getAttribute('cid'));
                  });
                }
                nodeElement.remove();
                item.remove();
              });
              if (
                'abort' == startRemainder ||
                'abort' == endRemainder ||
                'abortAndSkipCursor' == startRemainder
              ) {
                console.debug('abort, before/after is table');
                if ('abortAndSkipCursor' != startRemainder) {
                  inputRange.collapse(true);
                  deleteCommand.redo.push(cursorSnapshot);
                  editor.undo.exeCommand(cursorSnapshot);
                }
                if (false === endRemainder && 0 == endNode.getText().length) {
                  undoManager.addUndoForRemove(deleteCommand, endNode);
                  editor.findElemById(endNode.id).remove();
                  endNode.remove();
                }
              } else {
                if (startRemainder || endRemainder || items.length || forceMerge) {
                  deleteRangeBetweenNodes(
                    editor,
                    startRemainder || startNode,
                    endRemainder || endNode,
                    localDocumentNode,
                    lastBlock,
                    deleteCommand,
                    startRemainder,
                  );
                } else {
                  console.debug('less indent');
                  if (
                    (deleteCommand = handleBlockStartDeletion(
                      editor,
                      endNode,
                      lastBlock,
                      startNode,
                      localDocumentNode,
                    )) == skipCommand
                  ) {
                    return undoManager.makeEmptyCommand();
                  }
                }
              }
              deleteCommand.redo.push(editor.selection.buildUndo());
              return deleteCommand;
            })(editor, range, deleteMode);
            if (!(deferRegistration || undoManager.isEmptyCommand(deleteCommand))) {
              editor.undo.register(deleteCommand);
              editor.refocus();
              editor.refresh();
            }
            editor.selection.scrollAdjust();
          }
          return deleteCommand;
        }
        window.Reporter.reportLogicError(
          'node to delete not exists in nodemap',
          window.Reporter.processDom(currentDocumentNode),
        );
      }
    },
    deleteLineProcessor = {
      "[mdtype='hr']": handleBackspace,
      "tr[mdtype='table_row']": tableEditor.deleteRow,
      '.md-toc': deleteNodeElement,
    },
    removeListItem = function (documentNode, deleteCommand) {
      if (!DocumentNode.isType(documentNode, NodeType.list_item)) {
        return [];
      }
      var focusNode,
        focusAtEnd = false;
      if (!(documentNode.get('before') || documentNode.get('after'))) {
        documentNode = documentNode.get('parent');
      }
      if (
        !(focusNode =
          focusNode ||
          documentNode.getClosetBlock(true).getVeryFirstBrotherIncludeTopBlock(false, true))
      ) {
        if (!documentNode.get('before')) {
          undoManager.append(
            deleteCommand,
            convertToParagraph(File.editor, documentNode, true, true),
          );
          return [documentNode];
        }
        focusNode = documentNode.get('before').getVeryFirst(true);
        focusAtEnd = true;
      }
      editor.findElemById(documentNode.cid).remove();
      undoManager.addUndoForRemove(deleteCommand, documentNode);
      documentNode.remove();
      return [focusNode, focusAtEnd];
    },
    removeFocusedBlock = function (editor, deferRegistration, deleteCommand) {
      if (!editor) {
        File.editor;
      }
      editor.undo.endSnap(true);
      var documentNode = editor.getNode(editor.focusCid);
      if (documentNode) {
        var focusNode, focusAtEnd;
        deleteCommand = deleteCommand || undoManager.makeEmptyCommand(editor.selection.buildUndo());
        documentNode = documentNode.getClosetBlock(false);
        if (
          DocumentNode.isType(documentNode, NodeType.paragraph) &&
          !documentNode.get('before') &&
          !documentNode.get('after') &&
          documentNode.get('parent')
        ) {
          if (documentNode.get('parent').isVirtualBlock()) {
            if (
              DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) &&
              !deferRegistration
            ) {
              documentNode = documentNode.get('parent');
              [focusNode, focusAtEnd] = removeListItem(documentNode, deleteCommand);
            }
          } else {
            documentNode = documentNode.get('parent');
          }
        }
        if (!DocumentNode.isType(documentNode, NodeType.math_block)) {
          if (DocumentNode.isType(documentNode, NodeType.fences)) {
            File.editor.fences.beforeDeleteFences(documentNode.cid);
          } else {
            if (DocumentNode.isType(documentNode, NodeType.math_block)) {
              File.editor.htmlBlock.beforeDeleteFences(documentNode.cid);
            }
          }
          if (!focusNode) {
            if (
              !(focusNode = documentNode
                .getClosetBlock(true)
                .getVeryFirstBrotherIncludeTopBlock(false))
            ) {
              focusNode = documentNode
                .getClosetBlock(true)
                .getVeryFirstBrotherIncludeTopBlock(true);
              focusAtEnd = true;
            }
            if (!focusNode) {
              undoManager.append(
                deleteCommand,
                convertToParagraph(editor, documentNode, true, true),
              );
              if (!deferRegistration) {
                editor.undo.register(deleteCommand);
              }
              return deleteCommand;
            }
            editor.findElemById(documentNode.cid).remove();
            undoManager.addUndoForRemove(deleteCommand, documentNode);
            documentNode.remove();
          }
          if (focusAtEnd) {
            editor.selection.jumpIntoElemEnd(editor.findElemById(focusNode.cid));
          } else {
            editor.selection.jumpIntoElemBegin(editor.findElemById(focusNode.cid));
          }
          deleteCommand.redo.push(editor.selection.buildUndo());
          editor.refocus(focusNode.cid);
          if (!deferRegistration) {
            editor.undo.register(deleteCommand);
          }
          return deleteCommand;
        }
        File.editor.mathBlock.remove(documentNode.cid);
      }
    };
  moduleExports.backspaceHandler = handleBackspace;
  moduleExports.deleteSelectable = deleteNodeElement;
  moduleExports.deleteLineProcessor = deleteLineProcessor;
  moduleExports.deleteLine = function (editor) {
    editor.undo.endSnap(true);
    var element = $(document.activeElement).closest('.CodeMirror');
    if (element.length) {
      element[0].CodeMirror.execCommand('deleteLine');
    } else {
      var selector,
        currentElement = editor.getMarkElem();
      if (currentElement && currentElement.length) {
        for (selector in deleteLineProcessor) {
          if (currentElement.closest(selector).length) {
            return void deleteLineProcessor[selector](editor, currentElement.closest(selector));
          }
        }
        var start = editor.selection.getRangy().getBookmark(currentElement[0]).start,
          targetNode = editor.findNodeByElem(currentElement);
        if (DocumentNode.isEmptyBlock(targetNode)) {
          removeFocusedBlock(editor);
        } else {
          (function (inputElement, fromSentenceStart) {
            var wasExpanded = inputElement.hasClass('md-expand');
            inputElement.addClass('md-expand');
            if (fromSentenceStart) {
              window.getSelection().modify('move', 'backward', 'sentence');
            }
            window.getSelection().modify('extend', 'forward', 'sentence');
            if (wasExpanded) {
              inputElement.removeClass('md-expand');
            }
            handleBackspace(editor, null, 'delSelection');
          })(currentElement, !!start);
        }
      }
    }
  };
  moduleExports.deleteBlock = removeFocusedBlock;
  moduleExports.backToParagraph = convertToParagraph;
}
