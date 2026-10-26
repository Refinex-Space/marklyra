// editing/table-row-move.
export default function initializeEditingTableRowMove(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery'),
    documentModel = requireModule('model/document-model'),
    NodeType = documentModel.TYPE,
    DocumentNode = documentModel.Node,
    undoManager = requireModule('editing/undo-manager');
  requireModule('host/environment');
  requireModule('ui/document-menu');
  requireModule('editing/keyboard-shortcuts').map;
  moduleExports.moveRowUpOrDown = function moveTableRow(moveUp, documentNode, inputDocumentNode) {
    var editor = File.editor,
      element = jquery(document.activeElement).closest('.CodeMirror');
    if (element.length) {
      cm = element[0].CodeMirror;
      return void (moveUp
        ? editor.sourceView.cm.execCommand('moveLineUp')
        : editor.sourceView.cm.execCommand('moveLineDown'));
    }
    var range = editor.selection.getRangy();
    if (range && !File.isLocked) {
      if (
        jquery(range.commonAncestorContainer).closest("[mdtype='table_row']").closest('tr').length
      ) {
        editor.tableEdit.moveRowUpOrDown(moveUp);
        return true;
      }
      if (!documentNode) {
        var currentElement = editor.getMarkElem(range.startContainer),
          localElement = editor.getMarkElem(range.endContainer);
        documentNode = editor.getNode(currentElement.attr('cid'));
        inputDocumentNode = editor.getNode(localElement.attr('cid'));
        var treePosition = DocumentNode.getTreePosition(documentNode, inputDocumentNode);
        documentNode = treePosition[1];
        inputDocumentNode = treePosition[2];
      }
      var rangeEndExclusive = inputDocumentNode && inputDocumentNode.get('after');
      if (documentNode) {
        var adjacentBlock = moveUp ? documentNode.get('before') : inputDocumentNode.get('after');
        if (!adjacentBlock) {
          inputDocumentNode = documentNode = documentNode.get('parent');
          if (documentNode) {
            return moveTableRow(moveUp, documentNode, inputDocumentNode);
          } else {
            return void 0;
          }
        }
        editor.undo.endSnap(true);
        for (
          var selectionUndo = editor.selection.buildUndo(),
            moveCommand = undoManager.makeEmptyCommand(selectionUndo),
            currentDocumentNode = documentNode;
          currentDocumentNode && currentDocumentNode != rangeEndExclusive;
        ) {
          editor.findElemById(currentDocumentNode.id).remove();
          currentDocumentNode = currentDocumentNode.get('after');
        }
        var items = (function (firstBlock, endExclusive) {
            for (
              var currentItems = [], localDocumentNode = firstBlock;
              localDocumentNode && localDocumentNode != endExclusive;
            ) {
              currentItems.push(localDocumentNode);
              localDocumentNode = localDocumentNode.get('after');
            }
            return currentItems;
          })(documentNode, rangeEndExclusive),
          movedHtml = items
            .map(function (item) {
              return item.toHTML();
            })
            .join('\n');
        undoManager.addUndoForRemoveArray(moveCommand, items);
        if (moveUp) {
          adjacentBlock.addBeforeTillEnd(documentNode, inputDocumentNode);
          editor.findElemById(adjacentBlock.id).before(movedHtml);
        } else {
          adjacentBlock.addAfterTillEnd(documentNode, inputDocumentNode);
          editor.findElemById(adjacentBlock.id).after(movedHtml);
        }
        undoManager.addUndoForInsertArray(moveCommand, items);
        moveCommand.redo.push(selectionUndo);
        editor.undo.exeCommand(selectionUndo);
        editor.undo.register(moveCommand);
        if (DocumentNode.isType(documentNode.get('parent'), NodeType.blockquote)) {
          editor.brush.brushNode(documentNode.id);
          editor.brush.brushNode(documentNode.get('parent').getFirstChild().id);
          editor.undo.exeCommand(selectionUndo);
        }
      }
    }
  };
}
