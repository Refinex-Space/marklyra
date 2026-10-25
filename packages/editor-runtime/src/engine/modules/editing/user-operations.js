// editing/user-operations.
// SystemJS module 30. Dependencies: 11, 13, 1b, 1d, 19, 58, 33, 3f, 57, 55, 56, 1e, 54, 59.
$__System.registerDynamic(
  '30',
  ['11', '13', '1b', '1d', '19', '58', '33', '3f', '57', '55', '56', '1e', '54', '59'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var utilities = requireModule('11'),
      documentModel = requireModule('13'),
      undoManager = requireModule('1b'),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      markdownParser =
        (documentModel.NodeCollectionUtils, requireModule('1d'), requireModule('19')),
      fileIntegration = (requireModule('58'), requireModule('33')),
      deletion = (requireModule('3f'), requireModule('57')),
      listIndent = requireModule('55'),
      characterPairs = requireModule('56'),
      smartQuotes = requireModule('1e'),
      tableRowMove = requireModule('54'),
      clipboard = requireModule('59'),
      g = function (documentNode, stopAncestor, siblingDirection, decorateSibling) {
        var nextSibling,
          currentDocumentNode = documentNode;
        if (documentNode == stopAncestor) return null;
        for (nextSibling = documentNode.get(siblingDirection); nextSibling; )
          decorateSibling(nextSibling, currentDocumentNode),
            (nextSibling = (currentDocumentNode = nextSibling).get(siblingDirection));
        return (
          g(documentNode.get('parent'), stopAncestor, siblingDirection, decorateSibling),
          currentDocumentNode
        );
      };
    (moduleExports.getDisplayText = function (sourceElements) {
      var displayElements = sourceElements.clone();
      return (
        displayElements.find('.md-meta, .md-blockmeta, .md-content, sub, sup').remove(),
        displayElements.text().replace(/\u00A0/g, ' ')
      );
    }),
      (moduleExports.decorateOneSide = g),
      (moduleExports.simpleExpand = function (editor, nodeId) {
        if (File.isLocked) return !1;
        var trimmedText,
          start,
          replacementHtml,
          documentNode = editor.getNode(nodeId),
          selectionUndo = editor.selection.buildUndo();
        if (!selectionUndo) return !1;
        if (
          !DocumentNode.isType(
            documentNode,
            NodeType.heading,
            NodeType.def_footnote,
            NodeType.def_link,
          ) ||
          (selectionUndo.startId && selectionUndo.startId != selectionUndo.endId)
        )
          return !1;
        if ((trimmedText = documentNode.toMark().trim()).match(/\n/)) return !1;
        editor.undo.endSnap(!0);
        var expandCommand = undoManager.makeEmptyCommand(editor.lastCursor);
        if (
          !expandCommand.undo.length ||
          (!expandCommand.undo[0].id &&
            expandCommand.undo[0].startId != expandCommand.undo[0].endId)
        )
          return !1;
        if (
          (expandCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
          DocumentNode.isType(documentNode, NodeType.heading) &&
            (start =
              (documentNode.get('pattern') &&
                documentNode.get('pattern').replace('{0}', '').length) ||
              documentNode.get('depth') + 1),
          DocumentNode.isType(documentNode, NodeType.def_link, NodeType.def_footnote))
        ) {
          var currentElement,
            range = editor.selection.getRangy(),
            element = editor.getJQueryElem(range.startContainer);
          (currentElement = element.closest('.md-def-content')),
            (start = DocumentNode.isType(documentNode, NodeType.def_link) ? 1 : 2),
            currentElement.length && (start += 3),
            (currentElement = element.closest('.md-def-title')).length &&
              element.text().length &&
              (start += 5);
        }
        return (
          documentNode.set('text', trimmedText),
          documentNode.set('type', NodeType.paragraph),
          expandCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
          ((selectionUndo = editor.selection.buildUndo()).start += start),
          (selectionUndo.end += start),
          (selectionUndo.id = documentNode.cid),
          (selectionUndo.startId = selectionUndo.endId = void 0),
          expandCommand.redo.push(selectionUndo),
          (replacementHtml = markdownParser.renderHtmlWithBlockMeta(documentNode, editor.brush)),
          editor.findElemById(documentNode.cid).replaceWith(replacementHtml),
          editor.undo.exeCommand(selectionUndo, []),
          (expandCommand.incomplete = !0),
          editor.undo.register(expandCommand),
          documentNode.cid
        );
      }),
      (moduleExports.insertFileLink = function (editor, textSlice) {
        if (utilities.isFullUrl(textSlice)) {
          var range = editor.selection.getRangy();
          range &&
          range.commonAncestorContainer &&
          $(range.commonAncestorContainer).closest('.md-link').length
            ? clipboard.pasteHandler(editor, textSlice, !0, !0)
            : clipboard.pasteHandler(editor, ' ' + textSlice + ' ', !0, !0);
        } else {
          var linkLabel = fileIntegration.getFileNameFromPath(textSlice);
          File.isTextBundle()
            ? 0 === textSlice.indexOf(File.bundle.filePath) &&
              (textSlice = textSlice.substring(File.bundle.filePath.length + 1))
            : (textSlice = utilities.getRelativePath(
                fileIntegration.getCurrentFileFolderPath(),
                textSlice,
              )),
            clipboard.pasteHandler(editor, ' [' + linkLabel + '](' + textSlice + ') ', !0, !0);
        }
      }),
      (moduleExports.backspaceHandler = deletion.backspaceHandler),
      (moduleExports.deleteSelectable = deletion.deleteSelectable),
      (moduleExports.deleteLineProcessor = deletion.deleteLineProcessor),
      (moduleExports.deleteLine = deletion.deleteLine),
      (moduleExports.deleteBlock = deletion.deleteBlock),
      (moduleExports.backToParagraph = deletion.backToParagraph),
      (moduleExports.getMarkdownSourceFrom = clipboard.getMarkdownSourceFrom),
      (moduleExports.nativeCopyText = clipboard.nativeCopyText),
      (moduleExports.copyAsMarkdown = clipboard.copyAsMarkdown),
      (moduleExports.copyAsSemanticHTML = clipboard.copyAsSemanticHTML),
      (moduleExports.copyAsHTMLSource = clipboard.copyAsHTMLSource),
      (moduleExports.copyAsPlainText = clipboard.copyAsPlainText),
      (moduleExports.copyHandler = clipboard.copyHandler),
      (moduleExports.getSpeechText = clipboard.getSpeechText),
      (moduleExports.insertInlineText = clipboard.insertInlineText),
      (moduleExports.insertUrlWithTitle = function (editor, linkUrl, linkTitle) {
        (linkTitle = linkTitle || linkUrl),
          clipboard.pasteHandler(
            editor,
            ' [' + linkTitle + '](' + linkUrl + ') ',
            !0,
            function (startNodeId, startOffset, endNodeId, unusedParameter4, pasteCommand) {
              pasteCommand &&
                startNodeId === endNodeId &&
                (editor.undo.exeCommand({
                  type: 'cursor',
                  id: startNodeId,
                  start: startOffset + 2,
                  end: startOffset + 2 + linkTitle.length,
                }),
                editor.brush.clearAndPause(),
                pasteCommand.redo.push(editor.selection.buildUndo()),
                editor.brush.restart());
            },
          );
      }),
      (moduleExports.pasteHandler = clipboard.pasteHandler),
      (moduleExports.setClipboard = clipboard.setClipboard),
      (moduleExports.insertDom = clipboard.insertDom),
      (moduleExports.prepMarkHtml = clipboard.prepMarkHtml),
      (moduleExports.insertParagraph = clipboard.insertParagraph),
      (moduleExports.processClipboardHTML = clipboard.processClipboardHTML),
      (moduleExports.beforeCopyStart = clipboard.beforeCopyStart),
      (moduleExports.pasteBlocksAt = clipboard.pasteBlocksAt),
      (moduleExports.moreIndent = listIndent.moreIndent),
      (moduleExports.lessIndent = listIndent.lessIndent),
      (moduleExports.handlePair = characterPairs.handlePair),
      (moduleExports.surroundPair = characterPairs.surroundPair),
      (moduleExports.PunctuationOp = smartQuotes),
      (moduleExports.moveRowUpOrDown = tableRowMove.moveRowUpOrDown);
  },
);
