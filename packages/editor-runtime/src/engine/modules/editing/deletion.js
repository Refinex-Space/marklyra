// editing/deletion.
// SystemJS module 57. Dependencies: 11, 13, 1b, 58, 2d, 55, 56.
$__System.registerDynamic(
  '57',
  ['11', '13', '1b', '58', '2d', '55', '56'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self, requireModule('11');
    var documentModel = requireModule('13'),
      undoManager = requireModule('1b'),
      SnapFlag = undoManager.SnapFlag,
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      tableEditor = (documentModel.NodeCollectionUtils, requireModule('58')),
      formatting = requireModule('2d'),
      listIndent = requireModule('55'),
      characterPairs = requireModule('56'),
      skipCommand = 'skipCommand',
      contentElement = $('content'),
      f = function (editor, inputDocumentNode) {
        var currentDocumentNode = inputDocumentNode.get('parent'),
          documentNode = currentDocumentNode && currentDocumentNode.get('parent');
        if (
          documentNode &&
          documentNode.get('style') == DocumentNode.ListType.task &&
          !currentDocumentNode.get('before') &&
          DocumentNode.isType(currentDocumentNode, NodeType.paragraph)
        ) {
          var styleCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
          return (
            styleCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
            documentNode.unset('style'),
            documentNode.unset('checked'),
            editor.findElemById(documentNode.cid).replaceWith(documentNode.toHTML()),
            styleCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
            editor.undo.exeCommand(styleCommand.undo[0]),
            styleCommand.redo.push(editor.selection.buildUndo()),
            styleCommand
          );
        }
      },
      m = function (editor, documentNode, forceOutdent) {
        editor.undo.endSnap(!0);
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
          return (
            editor.findElemById(outdentResult.oldCid).replaceWith(outdentResult.newHtml),
            editor.undo.exeCommand(outdentCommand.undo[0]),
            outdentCommand.redo.push(editor.selection.buildUndo()),
            outdentCommand
          );
        }
      },
      g = function (editor, documentNode, clearText, skipCursorEvent) {
        editor.undo.endSnap(!0);
        var paragraphCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
        return (
          paragraphCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
          documentNode.set('type', NodeType.paragraph),
          documentNode.clearChildren(),
          clearText
            ? documentNode.set('text', '')
            : documentNode.set('text', documentNode.get('text').replace(/\u200B|(\r?\n)/g, '')),
          paragraphCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
          editor.findElemById(documentNode.id).replaceWith(documentNode.toHTML()),
          editor.selection.jumpIntoElemBegin(editor.findElemById(documentNode.id)),
          paragraphCommand.redo.push(editor.selection.buildUndo()),
          !skipCursorEvent && $(editor.sessionStr).trigger('cursorChange'),
          paragraphCommand
        );
      },
      v = function (editor, element, event, deferRegistration) {
        if ((editor.undo.endSnap(!0), element && element.length)) {
          event && event.preventDefault();
          var targetNode = editor.findNodeByElem(element),
            deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
          return (
            targetNode
              ? (targetNode.set('text', ''),
                (deleteCommand = undoManager.append(deleteCommand, g(editor, targetNode))))
              : ((targetNode = editor.findNodeByElem(element.closest('[mdtype]'))),
                deleteCommand.undo.push(undoManager.buildReplaceUndo(targetNode)),
                editor.selection.moveLeftOrRight(!0, event),
                element.remove(),
                editor.store(targetNode.id),
                deleteCommand.redo.push(undoManager.buildReplaceUndo(targetNode)),
                deleteCommand.redo.push(editor.selection.buildUndo())),
            !deferRegistration && editor.undo.register(deleteCommand),
            deleteCommand
          );
        }
      },
      y = function (editor, keyboardEvent, deleteMode, deferRegistration, allowNativeDeletion) {
        editor.needRemoveMathAfterSym &&
          ((editor.needRemoveMathAfterSym = !1),
          $('.math-jax-postprocess>.md-math-after-sym').text(''));
        var currentDocumentNode,
          documentNode,
          deleteCommand,
          selectionBookmark,
          metadataRange = editor.selection.includeTrailMeta(editor.selection.getRangy()),
          range = metadataRange && editor.selection.deRange(metadataRange.cloneRange()),
          activeElement = document.activeElement,
          selectionExtended = !1,
          historyRange = metadataRange;
        function A(inputDocumentNode, stopAncestor, siblingDirection) {
          var siblingNode,
            localDocumentNode = inputDocumentNode;
          if (inputDocumentNode == stopAncestor) return null;
          for (siblingNode = inputDocumentNode.get(siblingDirection); siblingNode; )
            $("[cid='" + siblingNode.id + "']").remove(),
              siblingNode.remove(),
              (siblingNode = inputDocumentNode.get(siblingDirection));
          return (
            A(inputDocumentNode.get('parent'), stopAncestor, siblingDirection), localDocumentNode
          );
        }
        function M(editor, selectionRange, boundaryNode, deleteCommand, withinTable) {
          var removedContents,
            startRemainder,
            retainedAncestor,
            currentRange = selectionRange.cloneRange(),
            nodeElement = editor.findElemById(boundaryNode.id);
          return nodeElement.length
            ? (currentRange.setEndAfter(nodeElement[0]),
              editor.selection.deRange(currentRange),
              (startRemainder = editor.findNodeByElem(
                editor.getMarkElem(currentRange.startContainer),
              )),
              !withinTable && $(currentRange.startContainer).closest('table').length
                ? (undoManager.append(deleteCommand, I(editor, currentRange, !0)),
                  (startRemainder = editor.findNodeByElem(
                    $(currentRange.startContainer).closest("[mdtype='table']"),
                  )),
                  boundaryNode.contains(startRemainder) &&
                  (A(startRemainder, boundaryNode, 'after'), 0 === startRemainder.getText().length)
                    ? (undoManager.append(deleteCommand, g(editor, startRemainder)),
                      'abortAndSkipCursor')
                    : 'abort')
                : (deleteCommand.undo.push(undoManager.buildReplaceUndo(boundaryNode)),
                  (removedContents = $(currentRange.extractContents())),
                  DocumentNode.isType.apply(
                    null,
                    [boundaryNode].concat(formatting.CONST.Selectable),
                  ) && undoManager.append(deleteCommand, g(editor, boundaryNode, !0, !0)),
                  editor.store(startRemainder, !0),
                  editor.findElemById(startRemainder.cid).replaceWith(startRemainder.toHTML()),
                  (retainedAncestor = A(startRemainder, boundaryNode, 'after')),
                  !!(
                    removedContents.text().length ||
                    removedContents.find('img').length ||
                    retainedAncestor
                  ) &&
                    (deleteCommand.redo.push(undoManager.buildReplaceUndo(boundaryNode)),
                    startRemainder)))
            : 'abort';
        }
        function L(editor, selectionRange, boundaryNode, deleteCommand, withinTable) {
          var removedContents,
            endRemainder,
            retainedAncestor,
            currentRange = selectionRange.cloneRange(),
            nodeElement = editor.findElemById(boundaryNode.id);
          if (
            (currentRange.setStartBefore(nodeElement[0]),
            editor.selection.deRange(currentRange),
            !withinTable && $(currentRange.endContainer).closest('table').length)
          )
            return (
              undoManager.append(deleteCommand, I(editor, currentRange, !0)),
              (endRemainder = editor.findNodeByElem(
                $(currentRange.endContainer).closest("[mdtype='table']"),
              )),
              'abort'
            );
          deleteCommand.undo.push(undoManager.buildReplaceUndo(boundaryNode)),
            (endRemainder = editor.findNodeByElem(
              editor.getMarkElem(editor.selection.getEndNode(currentRange)),
            )),
            (removedContents = $(currentRange.extractContents())),
            editor.store(endRemainder, !0);
          var currentNodeElement = editor.findElemById(endRemainder.cid);
          if (
            ((retainedAncestor = A(endRemainder, boundaryNode, 'before')),
            removedContents.text().length || removedContents.find('img').length || retainedAncestor)
          ) {
            for (
              deleteCommand.redo.push(undoManager.buildReplaceUndo(boundaryNode));
              currentNodeElement.parent().closest('.md-task-list-item').length;
            )
              currentNodeElement = currentNodeElement.parent().closest('.md-task-list-item');
            return (
              currentNodeElement.hasClass('md-task-list-item')
                ? currentNodeElement.replaceWith(editor.findNodeByElem(currentNodeElement).toHTML())
                : currentNodeElement.replaceWith(endRemainder.toHTML()),
              endRemainder
            );
          }
          return currentNodeElement.replaceWith(endRemainder.toHTML()), !1;
        }
        function N(
          editor,
          callbackDocumentNode,
          endNode,
          startBlock,
          inputDocumentNode,
          deleteCommand,
          retainedStart,
        ) {
          var text, start, element, removedAncestor;
          function f(node, stopNode) {
            return node == stopNode || node.get('before') || node.get('after')
              ? node
              : f(node.get('parent'), stopNode);
          }
          console.debug('spliceStartAndEnd');
          var localDocumentNode,
            startEmpty = DocumentNode.isEmptyBlock(startBlock);
          if (
            !startEmpty ||
            startBlock == inputDocumentNode ||
            (DocumentNode.isEmptyBlock(inputDocumentNode) && !retainedStart)
          )
            if (startEmpty && startBlock == inputDocumentNode && inputDocumentNode.isBlock())
              inputDocumentNode.set('type', NodeType.paragraph),
                inputDocumentNode.set('text', ''),
                inputDocumentNode.clearChildren(),
                editor.findElemById(inputDocumentNode.id).replaceWith(inputDocumentNode.toHTML()),
                editor.selection.jumpIntoElemBegin(editor.findElemById(inputDocumentNode.id)),
                deleteCommand.redo.push(editor.selection.buildUndo());
            else {
              if (
                (console.assert(callbackDocumentNode != endNode, 'Error on spliceStartAndEnd'),
                callbackDocumentNode != endNode)
              ) {
                if (
                  ((text = endNode.safeGetStrAttr('text')),
                  (removedAncestor = f(endNode, inputDocumentNode)),
                  undoManager.addUndoForRemove(deleteCommand, removedAncestor),
                  editor.findElemById(removedAncestor.id).remove(),
                  removedAncestor.remove(),
                  (localDocumentNode = callbackDocumentNode),
                  (start = DocumentNode.isType(
                    localDocumentNode,
                    NodeType.math_block,
                    NodeType.fences,
                    NodeType.html_block,
                  )
                    ? localDocumentNode.get('text').length
                    : $(localDocumentNode.toHTML()).rawText().length),
                  deleteCommand.undo.push(undoManager.buildReplaceUndo(startBlock)),
                  DocumentNode.isType(callbackDocumentNode, NodeType.def_link))
                )
                  if (callbackDocumentNode.safeGetStrAttr('title').length)
                    callbackDocumentNode.set('title', callbackDocumentNode.get('title') + text);
                  else {
                    var match = /["']([^"]*)["']\s*$/g.exec(text);
                    (text = text.replace(/"([^"])*"\s*$/, '')),
                      match && callbackDocumentNode.set('title', match[1]),
                      callbackDocumentNode.set('href', callbackDocumentNode.get('href') + text);
                  }
                else
                  callbackDocumentNode.set(
                    'text',
                    callbackDocumentNode.safeGetStrAttr('text') + text,
                  );
                if (
                  removedAncestor != inputDocumentNode &&
                  inputDocumentNode !== endNode &&
                  inputDocumentNode.get('before') == startBlock &&
                  DocumentNode.isType(startBlock, NodeType.list_item)
                ) {
                  var firstChild = inputDocumentNode.getFirstChild();
                  undoManager.addUndoForRemove(deleteCommand, inputDocumentNode),
                    startBlock.appendChildrenTillEnd(firstChild),
                    editor.findElemById(inputDocumentNode.id).remove(),
                    inputDocumentNode.remove();
                }
                deleteCommand.redo.push(undoManager.buildReplaceUndo(startBlock)),
                  editor.findElemById(startBlock.id).replaceWith(startBlock.toHTML()),
                  (element = editor.findElemById(callbackDocumentNode.id));
              }
              ((element = editor.findElemById(callbackDocumentNode.id)).hasClass('md-def-link') ||
                element.hasClass('md-def-footnote')) &&
                element.attr('contenteditable', 'true'),
                editor.undo.exeCommand({
                  type: 'cursor',
                  id: callbackDocumentNode.id,
                  start: start,
                  end: start,
                }),
                deleteCommand.redo.push(editor.selection.buildUndo());
            }
          else {
            editor.findElemById(startBlock.id).remove(),
              undoManager.addUndoForRemove(deleteCommand, startBlock),
              startBlock.remove();
            var survivingAncestor = f(endNode, inputDocumentNode);
            editor.findElemById(survivingAncestor.id).replaceWith(survivingAncestor.toHTML()),
              editor.selection.jumpIntoElemBegin(editor.findElemById(survivingAncestor.id));
          }
        }
        function D(editor, inputDocumentNode) {
          var localDocumentNode = inputDocumentNode.get('before');
          function i(removedNode) {
            var deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo());
            return (
              undoManager.addUndoForRemove(deleteCommand, removedNode),
              editor.findElemById(removedNode.id).remove(),
              removedNode.remove(),
              deleteCommand.redo.push(editor.selection.buildUndo()),
              deleteCommand
            );
          }
          return DocumentNode.isType(localDocumentNode, NodeType.hr)
            ? i(localDocumentNode)
            : localDocumentNode &&
                !DocumentNode.isEmptyBlock(inputDocumentNode) &&
                DocumentNode.isEmptyBlock(localDocumentNode)
              ? i(localDocumentNode)
              : !localDocumentNode &&
                  DocumentNode.isType(inputDocumentNode.get('parent'), NodeType.list_item) &&
                  (localDocumentNode = inputDocumentNode.get('parent').get('before')) &&
                  1 == localDocumentNode.get('children').length &&
                  DocumentNode.isEmptyBlock(localDocumentNode.get('children').at(0))
                ? i(localDocumentNode)
                : void 0;
        }
        function R(editor, inputDocumentNode) {
          if (DocumentNode.isType(inputDocumentNode, NodeType.table_cell)) {
            var parentNode = inputDocumentNode.get('parent').get('parent');
            if (
              keyboardEvent &&
              !deleteMode &&
              !inputDocumentNode.get('before') &&
              !inputDocumentNode.get('parent').get('before') &&
              editor.tableEdit.isTableEmpty(parentNode)
            )
              return editor.tableEdit.deleteTable(editor.findElemById(parentNode.cid), !0);
            var previousCell = tableEditor.getSibling(inputDocumentNode, 'before');
            return (
              previousCell &&
                ((deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo())),
                editor.selection.jumpIntoElemEnd(editor.findElemById(previousCell.id)),
                deleteCommand.redo.push(editor.selection.buildUndo())),
              deleteCommand
            );
          }
        }
        function B(editor, targetNode) {
          if (DocumentNode.isType(targetNode, DocumentNode.backToParagraphBeforeDelete))
            return editor.stylize.changeBlock(NodeType.paragraph, targetNode), skipCommand;
        }
        function P(editor, inputDocumentNode, callbackDocumentNode, previousLeaf, previousSibling) {
          for (
            var deleteHandlers = [R, D, f, m, listIndent.tryConvertListItemToUpperParagraph, B],
              handledCommand = null,
              itemIndex = 0;
            itemIndex < deleteHandlers.length;
            itemIndex++
          )
            if ((handledCommand = deleteHandlers[itemIndex](editor, inputDocumentNode)))
              return handledCommand;
          if (
            ((callbackDocumentNode = callbackDocumentNode || inputDocumentNode),
            (previousSibling = previousSibling || callbackDocumentNode.get('before')),
            (previousLeaf = previousLeaf || (previousSibling && previousSibling.getVeryFirst(!0))),
            !handledCommand &&
              previousLeaf &&
              N(
                editor,
                previousLeaf,
                inputDocumentNode,
                previousSibling,
                callbackDocumentNode,
                (handledCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo())),
              ),
            !handledCommand &&
              !previousLeaf &&
              DocumentNode.isType(inputDocumentNode, NodeType.paragraph) &&
              DocumentNode.isEmptyBlock(inputDocumentNode) &&
              inputDocumentNode.get('after'))
          ) {
            console.debug('delete empty node and promise after node'),
              (handledCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo()));
            var nodeId = inputDocumentNode.get('after').cid;
            undoManager.addUndoForRemove(handledCommand, inputDocumentNode),
              inputDocumentNode.remove(),
              editor.findElemById(inputDocumentNode.cid).remove(),
              editor.selection.jumpIntoElemBegin(editor.findElemById(nodeId)),
              handledCommand.redo.push(editor.selection.buildUndo());
          }
          return handledCommand;
        }
        function I(editor, inputRange, skipCursorSnapshot) {
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
          if (
            (skipCursorSnapshot ||
              ((cursorSnapshot = inputRange.cloneRange()).collapse(!0),
              (cursorSnapshot = editor.selection.buildUndo(cursorSnapshot))),
            inputRange.setStart(startPosition[0], startPosition[1]),
            inputRange.setEnd(endPosition[0], endPosition[1]),
            startCell == endCell)
          )
            return (
              inputRange.collapsed ||
                !DocumentNode.isType(startCell, NodeType.table_cell) ||
                (startElement[0] != inputRange.commonAncestorContainer &&
                  !startElement[0].contains(inputRange.commonAncestorContainer)) ||
                (deleteCommand.undo.push(undoManager.buildReplaceUndo(startCell)),
                inputRange.extractContents(),
                editor.store(startCell, !0),
                deleteCommand.redo.push(undoManager.buildReplaceUndo(startCell)),
                deleteCommand.redo.push(editor.selection.buildUndo(inputRange))),
              deleteCommand
            );
          deleteCommand.undo.push(undoManager.buildReplaceUndo(tableNode));
          var middleCell,
            clearedMiddle,
            startRemainder = M(editor, inputRange, startCell, deleteCommand, !0),
            endRemainder = L(editor, inputRange, endCell, deleteCommand, !0);
          for (
            startRemainder &&
              (startRemainder.unset('marginLeft'), startRemainder.unset('marginRight')),
              endRemainder && (endRemainder.unset('marginLeft'), endRemainder.unset('marginRight')),
              middleCell = tableNode.contains(startCell)
                ? editor.tableEdit.getSibling(startCell, 'after')
                : tableNode.getVeryFirst();
            middleCell && middleCell != endCell;
          )
            middleCell.set('text', ''),
              middleCell.unset('marginLeft'),
              middleCell.unset('marginRight'),
              (clearedMiddle = !0),
              (middleCell = editor.tableEdit.getSibling(middleCell, 'after'));
          return (
            startRemainder || endRemainder || clearedMiddle
              ? (editor.findElemById(tableNode.id).replaceWith(tableNode.toHTML()),
                deleteCommand.redo.push(undoManager.buildReplaceUndo(tableNode)))
              : deleteCommand.undo.pop(),
            skipCursorSnapshot ||
              (deleteCommand.redo.push(cursorSnapshot), editor.undo.exeCommand(cursorSnapshot)),
            deleteCommand
          );
        }
        function O(inputRange) {
          return (
            editor.selection.deRange(inputRange),
            (currentDocumentNode = editor.getMarkElem(inputRange.commonAncestorContainer)),
            (documentNode = editor.nodeMap.allNodes.get(currentDocumentNode.attr('cid'))),
            (selectionBookmark = inputRange.getBookmark(currentDocumentNode[0])),
            currentDocumentNode.length &&
              documentNode &&
              !documentNode.get('children').length &&
              0 == selectionBookmark.start &&
              !deleteMode
          );
        }
        function H() {
          var selectablePrevious = null;
          if (
            (DocumentNode.isType(
              documentNode.get('before'),
              DocumentNode.TYPE.hr,
              DocumentNode.TYPE.toc,
            ) && (selectablePrevious = documentNode.get('before')),
            keyboardEvent && keyboardEvent.preventDefault(),
            $('.md-tooltip-remove').remove(),
            currentDocumentNode.prev('[cid]').addClass('md-expand'),
            (deleteCommand = P(editor, documentNode)) === skipCommand)
          );
          else if (!deferRegistration)
            return (
              selectablePrevious &&
                (editor.selection.selectNode(selectablePrevious),
                deleteCommand.redo.push(editor.selection.buildUndo())),
              editor.undo.register(deleteCommand),
              editor.refresh(),
              selectablePrevious || editor.findElemById(documentNode.cid).trigger('refocus'),
              editor.refocus(),
              editor.selection.scrollAdjust(),
              deleteCommand
            );
        }
        var currentElement = $(document.activeElement).closest('.CodeMirror');
        if (currentElement.length) {
          var CodeMirror = currentElement[0].CodeMirror;
          return CodeMirror.getValue()
            ? void CodeMirror.execCommand('delCharBefore')
            : x(editor, deferRegistration);
        }
        if (
          DocumentNode.isType(
            activeElement.getAttribute('mdtype'),
            DocumentNode.TYPE.hr,
            DocumentNode.TYPE.toc,
          )
        ) {
          var localElement = $(activeElement).closest('[mdtype]');
          return v(editor, localElement, keyboardEvent, deferRegistration);
        }
        if (activeElement.getAttribute('mdtype') == NodeType.math_block)
          return (
            keyboardEvent && keyboardEvent.preventDefault(),
            editor.mathBlock.remove(activeElement.getAttribute('cid')),
            deleteCommand
          );
        if (
          (deleteMode && 'Backspace' != deleteMode
            ? !0 === deleteMode && (deleteMode = 'Delete')
            : (deleteMode = !1),
          range)
        ) {
          if (
            $(range.commonAncestorContainer).closest("[mdtype='table_row']").length &&
            keyboardEvent &&
            keyboardEvent.shiftKey &&
            (File.isMac ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)
          )
            return keyboardEvent.preventDefault(), editor.tableEdit.deleteRow(), skipCommand;
          if (range.collapsed) {
            if (deleteMode) {
              if (
                'Delete' == deleteMode &&
                (function (inputRange) {
                  if (
                    (editor.selection.deRange(inputRange),
                    (currentDocumentNode = editor.getMarkElem(inputRange.commonAncestorContainer)),
                    (documentNode = editor.nodeMap.allNodes.get(currentDocumentNode.attr('cid'))),
                    (selectionBookmark = inputRange.getBookmark(currentDocumentNode[0])),
                    'Delete' == deleteMode && !documentNode.get('children').length)
                  ) {
                    if (
                      DocumentNode.isType(
                        currentDocumentNode.attr('mdtype'),
                        NodeType.paragraph,
                        NodeType.heading,
                      )
                    )
                      return 0 == currentDocumentNode.text().length;
                    if (
                      DocumentNode.isType(
                        currentDocumentNode.attr('mdtype'),
                        NodeType.def_footnote,
                        NodeType.def_link,
                      )
                    )
                      return 0 == currentDocumentNode.text().replace(/[\u200b\u00a0]/g, '').length;
                  }
                })(range) &&
                (deleteCommand = (function () {
                  return documentNode.get('after')
                    ? ((localDocumentNode = documentNode),
                      (nodeId = documentNode.get('after').getVeryFirst().cid),
                      (deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo())),
                      editor.findElemById(localDocumentNode.cid).remove(),
                      undoManager.addUndoForRemove(deleteCommand, localDocumentNode),
                      localDocumentNode.remove(),
                      editor.selection.jumpIntoElemBegin(editor.findElemById(nodeId)),
                      deleteCommand.redo.push(editor.selection.buildUndo()),
                      deleteCommand)
                    : DocumentNode.isType(documentNode, NodeType.paragraph)
                      ? null
                      : g(editor, documentNode, !0, !0);
                  var localDocumentNode, nodeId, deleteCommand;
                })())
              )
                return (
                  deferRegistration || (editor.undo.register(deleteCommand), editor.refocus()),
                  keyboardEvent && keyboardEvent.preventDefault(),
                  deleteCommand
                );
            } else if (O(range)) return H();
            if (
              ((wordModifier =
                keyboardEvent && (File.isNodeHtml ? keyboardEvent.ctrlKey : keyboardEvent.altKey)),
              (rangeExtended = !1),
              !0 ===
                (range =
                  'delSelection' == deleteMode
                    ? editor.selection.getRangy()
                    : (wordModifier ||
                        (rangeExtended = editor.selection.extendCharFromCollapse(
                          range,
                          !deleteMode,
                        )),
                      rangeExtended ||
                        ((selectionExtended = !0),
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
                              return deleteWholeLine
                                ? (/\n/.exec(window.getSelection().toString())
                                    ? (range.setStart(range.startContainer, 0),
                                      range.select(range.isBackward))
                                    : (range = editor.selection.getRangy()),
                                  range)
                                : editor.selection.getRangy();
                            })(wordModifier)))),
                      !deleteMode && /^\u200b|\007F$/g.exec(range.toString())
                        ? (editor.selection.extendCharFromCollapse(range, !0), O(range) || range)
                        : range)))
            )
              return H();
            if (
              (!deleteMode &&
                characterPairs.tryRemovePairStart(editor, range) &&
                (allowNativeDeletion = !1),
              'delSelection' == deleteMode && range && range.collapsed)
            )
              return (
                keyboardEvent && keyboardEvent.preventDefault(), undoManager.makeEmptyCommand()
              );
          } else
            !(function (inputRange) {
              if (editor.selection.selectWordTime && File.isMac)
                if (deleteMode)
                  'Delete' == deleteMode &&
                    inputRange.endContainer.nodeType === document.TEXT_NODE &&
                    ((adjacentCharacter = inputRange.endContainer.textContent.charAt(
                      inputRange.endOffset,
                    )),
                    /\s/.exec(adjacentCharacter) &&
                      (inputRange.endOffset++, (historyRange = inputRange.cloneRange())));
                else if (
                  inputRange.startOffset > 0 &&
                  inputRange.startContainer.nodeType === document.TEXT_NODE
                ) {
                  var adjacentCharacter = inputRange.startContainer.textContent.charAt(
                    inputRange.startOffset - 1,
                  );
                  /\s/.exec(adjacentCharacter) &&
                    (inputRange.startOffset--, (historyRange = inputRange.cloneRange()));
                }
            })(range);
          var wordModifier, rangeExtended;
          if (
            ((function (inputRange) {
              inputRange.startContainer.parentElement &&
                inputRange.startContainer.parentElement.classList.contains('md-pants') &&
                0 == inputRange.startOffset &&
                inputRange.setStart(inputRange.startContainer.parentElement, 0);
            })(range),
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
                  )
                    return !1;
                  if (editor.selection.getRangy().endContainer == range.endContainer) return !0;
                }
              })())
          )
            return null;
          if (
            ((editor.selection.selectWordTime = null),
            editor.selection.deRange(range),
            (currentDocumentNode = editor.getMarkElem(range.commonAncestorContainer)),
            (documentNode = editor.nodeMap.allNodes.get(currentDocumentNode.attr('cid'))),
            selectionExtended &&
              (window.getSelection().removeAllRanges(),
              window.getSelection().addRange(metadataRange.nativeRange)),
            !currentDocumentNode.length || documentNode)
          ) {
            if (currentDocumentNode.length && !documentNode.get('children').length) {
              if (currentDocumentNode.get('type') !== NodeType.fences)
                return (function (editor, event, inputRange, inputElement, deferRegistration) {
                  var element,
                    crossesElements = 3 !== inputRange.commonAncestorContainer.nodeType,
                    localDocumentNode = editor.getNode(inputElement.attr('cid'));
                  deferRegistration ||
                    (editor.undo.addSnap(localDocumentNode.cid, SnapFlag.NONE),
                    editor.brush.clearAndPause());
                  var selectionSnapshot = editor.selection.buildUndo(historyRange);
                  if (
                    ((deleteCommand = undoManager.makeEmptyCommand(selectionSnapshot)).undo.push(
                      undoManager.buildReplaceUndo(localDocumentNode),
                    ),
                    !crossesElements &&
                      selectionSnapshot &&
                      selectionSnapshot.startId == selectionSnapshot.endId &&
                      DocumentNode.isType(localDocumentNode, NodeType.line))
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
                    editor.undo.lastSnap &&
                    editor.undo.lastSnap.selection.end == selectionSnapshot.end &&
                    editor.undo.lastSnap.selection.start == selectionSnapshot.start
                      ? ((editor.undo.lastSnap.selection.start -= length),
                        (editor.undo.lastSnap.selection.end -= currentLength))
                      : ((selectionSnapshot.start -= length),
                        (selectionSnapshot.end -= currentLength));
                  }
                  var previousScrollTop = contentElement.scrollTop(),
                    domNode = inputRange.commonAncestorContainer;
                  if (!domNode.contains(document.querySelector('#write'))) {
                    if (domNode.parentElement.getAttribute('md-inline')) {
                      var parentElement = domNode.parentElement;
                      1 == inputElement.children().length &&
                        inputElement.children()[0] == parentElement &&
                        (parentElement.textContent.length != inputRange.toString().length ||
                          parentElement.style.display ||
                          (parentElement.style.display = 'inline-block'));
                    }
                    if (
                      (inputRange.toString(),
                      (element = inputRange.extractContents()),
                      previousScrollTop != contentElement.scrollTop() &&
                        editor.undo.clearEventTimer(),
                      editor.store(localDocumentNode.cid),
                      deleteCommand.redo.push(undoManager.buildReplaceUndo(localDocumentNode)),
                      DocumentNode.isType(
                        localDocumentNode,
                        NodeType.def_link,
                        NodeType.def_footnote,
                      )
                        ? editor.selection.deRange(inputRange, !0)
                        : localDocumentNode.getText().length ||
                          (editor
                            .findElemById(localDocumentNode.cid)
                            .html($(localDocumentNode.toHTML()).html()),
                          (inputRange = editor.selection.getRangy()),
                          editor.selection.deRange(inputRange, !0)),
                      deleteCommand.redo.push(editor.selection.buildUndo()),
                      element.querySelector('img'),
                      inputRange.collapse(!1),
                      crossesElements)
                    ) {
                      var nodeId = inputElement.attr('cid');
                      (crossesElements = editor.selection.saveSelection(inputElement, inputRange)),
                        inputRange.setStart(inputElement[0], 0);
                      var start = 0;
                      inputElement.find('.md-emoji-control-ch').each(function () {
                        let markerOffset = (this.textContent + '').indexOf('​');
                        0 == inputRange.comparePoint(this, markerOffset + 1) &&
                          (start++, (this.textContent = ''));
                      }),
                        start && ((crossesElements.start -= start), (crossesElements.end -= start)),
                        editor.store(nodeId, !0),
                        deferRegistration &&
                          (inputElement.replaceWith(editor.nodeMap.allNodes.get(nodeId).toHTML()),
                          (inputElement = editor.findElemById(nodeId))),
                        editor.selection.restoreSelection(inputElement, crossesElements),
                        (editor.focusCid = null),
                        editor.refocus();
                    }
                    return (
                      editor.brush.addToQueue(inputElement.attr('cid')),
                      !deferRegistration && editor.brush.resume(!0),
                      event && (event.preventDefault(), $('#write').trigger('input')),
                      deferRegistration || null != event || editor.undo.register(deleteCommand),
                      deleteCommand
                    );
                  }
                })(editor, keyboardEvent, range, currentDocumentNode, deferRegistration);
              deleteCommand = v(editor, currentDocumentNode, keyboardEvent, deferRegistration);
            } else
              console.debug('handle block change'),
                keyboardEvent && keyboardEvent.preventDefault(),
                $('.md-tooltip-remove').remove(),
                (deleteCommand = (function (editor, inputRange, forceMerge) {
                  if (
                    !(
                      document.contains(inputRange.startContainer) ||
                      (console.debug('try to delete on nonexist dom'),
                      (inputRange = editor.selection.getRangy()))
                    )
                  )
                    return undoManager.makeEmptyCommand();
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
                  if (!startNode || !endNode) return undoManager.makeEmptyCommand();
                  var treePosition = DocumentNode.getTreePosition(startNode, endNode),
                    localDocumentNode = treePosition[1],
                    lastBlock = treePosition[2],
                    deleteCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo()),
                    cursorSnapshot = inputRange.cloneRange();
                  if (startElement[0] == endElement[0]) return deleteCommand;
                  if (
                    (cursorSnapshot.collapse(!0),
                    (cursorSnapshot = editor.selection.buildUndo(cursorSnapshot)),
                    inputRange.setStart(startPosition[0], startPosition[1]),
                    inputRange.setEnd(endPosition[0], endPosition[1]),
                    $(inputRange.commonAncestorContainer).closest('[mdtype="table"]').length)
                  )
                    return undoManager.append(deleteCommand, I(editor, inputRange));
                  var startRemainder = M(editor, inputRange, localDocumentNode, deleteCommand),
                    endRemainder = L(editor, inputRange, lastBlock, deleteCommand),
                    middleNode = localDocumentNode.get('after'),
                    items = [];
                  for (
                    inputRange = editor.selection.getRangy(),
                      editor.selection.deRange(inputRange, !0);
                    middleNode && middleNode != lastBlock;
                  )
                    items.push(middleNode), (middleNode = middleNode.get('after'));
                  if (
                    (undoManager.addUndoForRemoveArray(
                      deleteCommand,
                      items,
                      localDocumentNode,
                      lastBlock,
                    ),
                    items.map(function (item) {
                      var nodeElement = editor.findElemById(item.id);
                      nodeElement.attr('mdtype') == NodeType.math_block
                        ? editor.mathBlock.beforeDeleteFences(nodeElement[0].getAttribute('cid'))
                        : nodeElement.find("[mdtype='math_block']").each(function () {
                            editor.mathBlock.beforeDeleteFences(this.getAttribute('cid'));
                          }),
                        nodeElement.remove(),
                        item.remove();
                    }),
                    'abort' == startRemainder ||
                      'abort' == endRemainder ||
                      'abortAndSkipCursor' == startRemainder)
                  )
                    console.debug('abort, before/after is table'),
                      'abortAndSkipCursor' != startRemainder &&
                        (inputRange.collapse(!0),
                        deleteCommand.redo.push(cursorSnapshot),
                        editor.undo.exeCommand(cursorSnapshot)),
                      !1 === endRemainder &&
                        0 == endNode.getText().length &&
                        (undoManager.addUndoForRemove(deleteCommand, endNode),
                        editor.findElemById(endNode.id).remove(),
                        endNode.remove());
                  else if (startRemainder || endRemainder || items.length || forceMerge)
                    N(
                      editor,
                      startRemainder || startNode,
                      endRemainder || endNode,
                      localDocumentNode,
                      lastBlock,
                      deleteCommand,
                      startRemainder,
                    );
                  else if (
                    (console.debug('less indent'),
                    (deleteCommand = P(editor, endNode, lastBlock, startNode, localDocumentNode)) ==
                      skipCommand)
                  )
                    return undoManager.makeEmptyCommand();
                  return deleteCommand.redo.push(editor.selection.buildUndo()), deleteCommand;
                })(editor, range, deleteMode)),
                deferRegistration ||
                  undoManager.isEmptyCommand(deleteCommand) ||
                  (editor.undo.register(deleteCommand), editor.refocus(), editor.refresh()),
                editor.selection.scrollAdjust();
            return deleteCommand;
          }
          window.Reporter.reportLogicError(
            'node to delete not exists in nodemap',
            window.Reporter.processDom(currentDocumentNode),
          );
        }
      },
      deleteLineProcessor = {
        "[mdtype='hr']": y,
        "tr[mdtype='table_row']": tableEditor.deleteRow,
        '.md-toc': v,
      },
      w = function (documentNode, deleteCommand) {
        if (!DocumentNode.isType(documentNode, NodeType.list_item)) return [];
        var focusNode,
          focusAtEnd = !1;
        if (
          (documentNode.get('before') ||
            documentNode.get('after') ||
            (documentNode = documentNode.get('parent')),
          !(focusNode =
            focusNode ||
            documentNode.getClosetBlock(!0).getVeryFirstBrotherIncludeTopBlock(!1, !0)))
        ) {
          if (!documentNode.get('before'))
            return (
              undoManager.append(deleteCommand, g(File.editor, documentNode, !0, !0)),
              [documentNode]
            );
          (focusNode = documentNode.get('before').getVeryFirst(!0)), (focusAtEnd = !0);
        }
        return (
          editor.findElemById(documentNode.cid).remove(),
          undoManager.addUndoForRemove(deleteCommand, documentNode),
          documentNode.remove(),
          [focusNode, focusAtEnd]
        );
      },
      x = function (editor, deferRegistration, deleteCommand) {
        editor || File.editor, editor.undo.endSnap(!0);
        var documentNode = editor.getNode(editor.focusCid);
        if (documentNode) {
          var focusNode, focusAtEnd;
          if (
            ((deleteCommand =
              deleteCommand || undoManager.makeEmptyCommand(editor.selection.buildUndo())),
            (documentNode = documentNode.getClosetBlock(!1)),
            DocumentNode.isType(documentNode, NodeType.paragraph) &&
              !documentNode.get('before') &&
              !documentNode.get('after') &&
              documentNode.get('parent') &&
              (documentNode.get('parent').isVirtualBlock()
                ? DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) &&
                  !deferRegistration &&
                  ((documentNode = documentNode.get('parent')),
                  ([focusNode, focusAtEnd] = w(documentNode, deleteCommand)))
                : (documentNode = documentNode.get('parent'))),
            !DocumentNode.isType(documentNode, NodeType.math_block))
          ) {
            if (
              (DocumentNode.isType(documentNode, NodeType.fences)
                ? File.editor.fences.beforeDeleteFences(documentNode.cid)
                : DocumentNode.isType(documentNode, NodeType.math_block) &&
                  File.editor.htmlBlock.beforeDeleteFences(documentNode.cid),
              !focusNode)
            ) {
              if (
                ((focusNode = documentNode
                  .getClosetBlock(!0)
                  .getVeryFirstBrotherIncludeTopBlock(!1)) ||
                  ((focusNode = documentNode
                    .getClosetBlock(!0)
                    .getVeryFirstBrotherIncludeTopBlock(!0)),
                  (focusAtEnd = !0)),
                !focusNode)
              )
                return (
                  undoManager.append(deleteCommand, g(editor, documentNode, !0, !0)),
                  !deferRegistration && editor.undo.register(deleteCommand),
                  deleteCommand
                );
              editor.findElemById(documentNode.cid).remove(),
                undoManager.addUndoForRemove(deleteCommand, documentNode),
                documentNode.remove();
            }
            return (
              focusAtEnd
                ? editor.selection.jumpIntoElemEnd(editor.findElemById(focusNode.cid))
                : editor.selection.jumpIntoElemBegin(editor.findElemById(focusNode.cid)),
              deleteCommand.redo.push(editor.selection.buildUndo()),
              editor.refocus(focusNode.cid),
              !deferRegistration && editor.undo.register(deleteCommand),
              deleteCommand
            );
          }
          File.editor.mathBlock.remove(documentNode.cid);
        }
      };
    (moduleExports.backspaceHandler = y),
      (moduleExports.deleteSelectable = v),
      (moduleExports.deleteLineProcessor = deleteLineProcessor),
      (moduleExports.deleteLine = function (editor) {
        editor.undo.endSnap(!0);
        var element = $(document.activeElement).closest('.CodeMirror');
        if (element.length) element[0].CodeMirror.execCommand('deleteLine');
        else {
          var selector,
            currentElement = editor.getMarkElem();
          if (currentElement && currentElement.length) {
            for (selector in deleteLineProcessor)
              if (currentElement.closest(selector).length)
                return void deleteLineProcessor[selector](editor, currentElement.closest(selector));
            var start = editor.selection.getRangy().getBookmark(currentElement[0]).start,
              targetNode = editor.findNodeByElem(currentElement);
            DocumentNode.isEmptyBlock(targetNode)
              ? x(editor)
              : (function (inputElement, fromSentenceStart) {
                  var wasExpanded = inputElement.hasClass('md-expand');
                  inputElement.addClass('md-expand'),
                    fromSentenceStart &&
                      window.getSelection().modify('move', 'backward', 'sentence'),
                    window.getSelection().modify('extend', 'forward', 'sentence'),
                    wasExpanded && inputElement.removeClass('md-expand'),
                    y(editor, null, 'delSelection');
                })(currentElement, !!start);
          }
        }
      }),
      (moduleExports.deleteBlock = x),
      (moduleExports.backToParagraph = g);
  },
);
