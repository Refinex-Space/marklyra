// editing/table-row-move.
// SystemJS module 54. Dependencies: e, 13, 1b, 2c, 37, 27.
$__System.registerDynamic(
  '54',
  ['e', '13', '1b', '2c', '37', '27'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self;
    var jquery = requireModule('e'),
      documentModel = requireModule('13'),
      NodeType = documentModel.TYPE,
      DocumentNode = documentModel.Node,
      undoManager = requireModule('1b');
    requireModule('2c'), requireModule('37'), requireModule('27').map;
    moduleExports.moveRowUpOrDown = function e(moveUp, documentNode, inputDocumentNode) {
      var editor = File.editor,
        element = jquery(document.activeElement).closest('.CodeMirror');
      if (element.length)
        return (
          (cm = element[0].CodeMirror),
          void (moveUp
            ? editor.sourceView.cm.execCommand('moveLineUp')
            : editor.sourceView.cm.execCommand('moveLineDown'))
        );
      var range = editor.selection.getRangy();
      if (range && !File.isLocked) {
        if (
          jquery(range.commonAncestorContainer).closest("[mdtype='table_row']").closest('tr').length
        )
          return editor.tableEdit.moveRowUpOrDown(moveUp), !0;
        if (!documentNode) {
          var currentElement = editor.getMarkElem(range.startContainer),
            localElement = editor.getMarkElem(range.endContainer);
          (documentNode = editor.getNode(currentElement.attr('cid'))),
            (inputDocumentNode = editor.getNode(localElement.attr('cid')));
          var treePosition = DocumentNode.getTreePosition(documentNode, inputDocumentNode);
          (documentNode = treePosition[1]), (inputDocumentNode = treePosition[2]);
        }
        var rangeEndExclusive = inputDocumentNode && inputDocumentNode.get('after');
        if (documentNode) {
          var adjacentBlock = moveUp ? documentNode.get('before') : inputDocumentNode.get('after');
          if (!adjacentBlock)
            return (
              (inputDocumentNode = documentNode = documentNode.get('parent')),
              documentNode ? e(moveUp, documentNode, inputDocumentNode) : void 0
            );
          editor.undo.endSnap(!0);
          for (
            var selectionUndo = editor.selection.buildUndo(),
              moveCommand = undoManager.makeEmptyCommand(selectionUndo),
              currentDocumentNode = documentNode;
            currentDocumentNode && currentDocumentNode != rangeEndExclusive;
          )
            editor.findElemById(currentDocumentNode.id).remove(),
              (currentDocumentNode = currentDocumentNode.get('after'));
          var items = (function (firstBlock, endExclusive) {
              for (
                var currentItems = [], localDocumentNode = firstBlock;
                localDocumentNode && localDocumentNode != endExclusive;
              )
                currentItems.push(localDocumentNode),
                  (localDocumentNode = localDocumentNode.get('after'));
              return currentItems;
            })(documentNode, rangeEndExclusive),
            movedHtml = items
              .map(function (item) {
                return item.toHTML();
              })
              .join('\n');
          undoManager.addUndoForRemoveArray(moveCommand, items),
            moveUp
              ? (adjacentBlock.addBeforeTillEnd(documentNode, inputDocumentNode),
                editor.findElemById(adjacentBlock.id).before(movedHtml))
              : (adjacentBlock.addAfterTillEnd(documentNode, inputDocumentNode),
                editor.findElemById(adjacentBlock.id).after(movedHtml)),
            undoManager.addUndoForInsertArray(moveCommand, items),
            moveCommand.redo.push(selectionUndo),
            editor.undo.exeCommand(selectionUndo),
            editor.undo.register(moveCommand),
            DocumentNode.isType(documentNode.get('parent'), NodeType.blockquote) &&
              (editor.brush.brushNode(documentNode.id),
              editor.brush.brushNode(documentNode.get('parent').getFirstChild().id),
              editor.undo.exeCommand(selectionUndo));
        }
      }
    };
  },
);
