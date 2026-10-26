// editing/user-operations.
export default function initializeEditingUserOperations(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  'use strict';
  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    undoManager = requireModule('editing/undo-manager'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    markdownParser =
      (documentModel.NodeCollectionUtils,
      requireModule('libraries/rangy'),
      requireModule('model/markdown-parser')),
    fileIntegration =
      (requireModule('editing/table-editor'), requireModule('host/file-integration')),
    deletion = (requireModule('model/html-parser'), requireModule('editing/deletion')),
    listIndent = requireModule('editing/list-indent'),
    characterPairs = requireModule('editing/character-pairs'),
    smartQuotes = requireModule('editing/smart-quotes'),
    tableRowMove = requireModule('editing/table-row-move'),
    clipboard = requireModule('editing/clipboard'),
    findEditableSibling = Object.defineProperty(
      function (documentNode, stopAncestor, siblingDirection, decorateSibling) {
        var nextSibling,
          currentDocumentNode = documentNode;
        if (documentNode == stopAncestor) {
          return null;
        }
        for (nextSibling = documentNode.get(siblingDirection); nextSibling; ) {
          decorateSibling(nextSibling, currentDocumentNode);
          nextSibling = (currentDocumentNode = nextSibling).get(siblingDirection);
        }
        findEditableSibling(
          documentNode.get('parent'),
          stopAncestor,
          siblingDirection,
          decorateSibling,
        );
        return currentDocumentNode;
      },
      'name',
      { value: 'g', configurable: true },
    );
  moduleExports.getDisplayText = function (sourceElements) {
    var displayElements = sourceElements.clone();
    displayElements.find('.md-meta, .md-blockmeta, .md-content, sub, sup').remove();
    return displayElements.text().replace(/\u00A0/g, ' ');
  };
  moduleExports.decorateOneSide = findEditableSibling;
  moduleExports.simpleExpand = function (editor, nodeId) {
    if (File.isLocked) {
      return false;
    }
    var trimmedText,
      start,
      replacementHtml,
      documentNode = editor.getNode(nodeId),
      selectionUndo = editor.selection.buildUndo();
    if (!selectionUndo) {
      return false;
    }
    if (
      !DocumentNode.isType(
        documentNode,
        NodeType.heading,
        NodeType.def_footnote,
        NodeType.def_link,
      ) ||
      (selectionUndo.startId && selectionUndo.startId != selectionUndo.endId)
    ) {
      return false;
    }
    if ((trimmedText = documentNode.toMark().trim()).match(/\n/)) {
      return false;
    }
    editor.undo.endSnap(true);
    var expandCommand = undoManager.makeEmptyCommand(editor.lastCursor);
    if (
      !expandCommand.undo.length ||
      (!expandCommand.undo[0].id && expandCommand.undo[0].startId != expandCommand.undo[0].endId)
    ) {
      return false;
    }
    expandCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
    if (DocumentNode.isType(documentNode, NodeType.heading)) {
      start =
        (documentNode.get('pattern') && documentNode.get('pattern').replace('{0}', '').length) ||
        documentNode.get('depth') + 1;
    }
    if (DocumentNode.isType(documentNode, NodeType.def_link, NodeType.def_footnote)) {
      var currentElement,
        range = editor.selection.getRangy(),
        element = editor.getJQueryElem(range.startContainer);
      currentElement = element.closest('.md-def-content');
      start = DocumentNode.isType(documentNode, NodeType.def_link) ? 1 : 2;
      if (currentElement.length) {
        start += 3;
      }
      if ((currentElement = element.closest('.md-def-title')).length && element.text().length) {
        start += 5;
      }
    }
    documentNode.set('text', trimmedText);
    documentNode.set('type', NodeType.paragraph);
    expandCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
    (selectionUndo = editor.selection.buildUndo()).start += start;
    selectionUndo.end += start;
    selectionUndo.id = documentNode.cid;
    selectionUndo.startId = selectionUndo.endId = void 0;
    expandCommand.redo.push(selectionUndo);
    replacementHtml = markdownParser.renderHtmlWithBlockMeta(documentNode, editor.brush);
    editor.findElemById(documentNode.cid).replaceWith(replacementHtml);
    editor.undo.exeCommand(selectionUndo, []);
    expandCommand.incomplete = true;
    editor.undo.register(expandCommand);
    return documentNode.cid;
  };
  moduleExports.insertFileLink = function (editor, textSlice) {
    if (utilities.isFullUrl(textSlice)) {
      var range = editor.selection.getRangy();
      if (
        range &&
        range.commonAncestorContainer &&
        $(range.commonAncestorContainer).closest('.md-link').length
      ) {
        clipboard.pasteHandler(editor, textSlice, true, true);
      } else {
        clipboard.pasteHandler(editor, ' ' + textSlice + ' ', true, true);
      }
    } else {
      var linkLabel = fileIntegration.getFileNameFromPath(textSlice);
      if (File.isTextBundle()) {
        if (0 === textSlice.indexOf(File.bundle.filePath)) {
          textSlice = textSlice.substring(File.bundle.filePath.length + 1);
        }
      } else {
        textSlice = utilities.getRelativePath(
          fileIntegration.getCurrentFileFolderPath(),
          textSlice,
        );
      }
      clipboard.pasteHandler(editor, ' [' + linkLabel + '](' + textSlice + ') ', true, true);
    }
  };
  moduleExports.backspaceHandler = deletion.backspaceHandler;
  moduleExports.deleteSelectable = deletion.deleteSelectable;
  moduleExports.deleteLineProcessor = deletion.deleteLineProcessor;
  moduleExports.deleteLine = deletion.deleteLine;
  moduleExports.deleteBlock = deletion.deleteBlock;
  moduleExports.backToParagraph = deletion.backToParagraph;
  moduleExports.getMarkdownSourceFrom = clipboard.getMarkdownSourceFrom;
  moduleExports.nativeCopyText = clipboard.nativeCopyText;
  moduleExports.copyAsMarkdown = clipboard.copyAsMarkdown;
  moduleExports.copyAsSemanticHTML = clipboard.copyAsSemanticHTML;
  moduleExports.copyAsHTMLSource = clipboard.copyAsHTMLSource;
  moduleExports.copyAsPlainText = clipboard.copyAsPlainText;
  moduleExports.copyHandler = clipboard.copyHandler;
  moduleExports.getSpeechText = clipboard.getSpeechText;
  moduleExports.insertInlineText = clipboard.insertInlineText;
  moduleExports.insertUrlWithTitle = function (editor, linkUrl, linkTitle) {
    linkTitle = linkTitle || linkUrl;
    clipboard.pasteHandler(
      editor,
      ' [' + linkTitle + '](' + linkUrl + ') ',
      true,
      function (startNodeId, startOffset, endNodeId, unusedParameter4, pasteCommand) {
        if (pasteCommand && startNodeId === endNodeId) {
          editor.undo.exeCommand({
            type: 'cursor',
            id: startNodeId,
            start: startOffset + 2,
            end: startOffset + 2 + linkTitle.length,
          });
          editor.brush.clearAndPause();
          pasteCommand.redo.push(editor.selection.buildUndo());
          editor.brush.restart();
        }
      },
    );
  };
  moduleExports.pasteHandler = clipboard.pasteHandler;
  moduleExports.setClipboard = clipboard.setClipboard;
  moduleExports.insertDom = clipboard.insertDom;
  moduleExports.prepMarkHtml = clipboard.prepMarkHtml;
  moduleExports.insertParagraph = clipboard.insertParagraph;
  moduleExports.processClipboardHTML = clipboard.processClipboardHTML;
  moduleExports.beforeCopyStart = clipboard.beforeCopyStart;
  moduleExports.pasteBlocksAt = clipboard.pasteBlocksAt;
  moduleExports.moreIndent = listIndent.moreIndent;
  moduleExports.lessIndent = listIndent.lessIndent;
  moduleExports.handlePair = characterPairs.handlePair;
  moduleExports.surroundPair = characterPairs.surroundPair;
  moduleExports.PunctuationOp = smartQuotes;
  moduleExports.moveRowUpOrDown = tableRowMove.moveRowUpOrDown;
}
