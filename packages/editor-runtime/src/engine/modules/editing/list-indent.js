// editing/list-indent.
// SystemJS module 55. Dependencies: 11, 13, 1b, 1d.
$__System.registerDynamic(
  '55',
  ['11', '13', '1b', '1d'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self, requireModule('11');
    var documentModel = requireModule('13'),
      undoManager = requireModule('1b'),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      nodeCollectionUtilities = documentModel.NodeCollectionUtils,
      findAncestor =
        (requireModule('1d'),
        function (documentNode, predicate) {
          if (!documentNode) return null;
          if (predicate(documentNode)) return documentNode;
          var parentNode = documentNode.get('parent');
          return parentNode ? findAncestor(parentNode, predicate) : null;
        });
    function c(documentNode, visitNext) {
      return documentNode
        ? documentNode.get('after')
          ? visitNext(documentNode.get('after').getVeryFirst())
          : c(documentNode.get('parent'), visitNext)
        : null;
    }
    function d(nodeElement) {
      File.editor.mathBlock.cacheUnder(nodeElement), nodeElement.remove();
    }
    function u(nodeId) {
      File.editor.mathBlock.cacheUnder(File.editor.findElemById(nodeId)[0]);
    }
    function h(documentNode, boundaryNode, allowTopLevel) {
      var indentableNode, currentDocumentNode;
      if (!documentNode) return documentNode;
      if (!allowTopLevel && !documentNode.get('parent')) return null;
      if (DocumentNode.isType(documentNode.get('before'), NodeType.list)) return documentNode;
      if (
        !(indentableNode = findAncestor(documentNode, function (inputDocumentNode) {
          return DocumentNode.isType(inputDocumentNode.get('parent'), NodeType.list_item);
        })) &&
        boundaryNode
      )
        for (currentDocumentNode = boundaryNode; currentDocumentNode; ) {
          if (currentDocumentNode == documentNode || currentDocumentNode.contains(documentNode))
            return currentDocumentNode;
          currentDocumentNode = currentDocumentNode.get('after');
        }
      return indentableNode;
    }
    function p(node) {
      return node
        ? findAncestor(node, function (documentNode) {
            return DocumentNode.isType(documentNode.get('parent'), NodeType.list_item);
          })
        : node;
    }
    function f(node) {
      return findAncestor(node, function (documentNode) {
        return DocumentNode.isType(documentNode.get('parent'), NodeType.blockquote);
      });
    }
    function m(leftList, rightList, skipStyleCheck) {
      return (
        DocumentNode.isType(leftList, NodeType.list) &&
        DocumentNode.isType(rightList, NodeType.list) &&
        (skipStyleCheck || leftList.get('style') == leftList.get('style'))
      );
    }
    function g(firstNode, historyEntry, ...attributeNames) {
      for (var documentNode = firstNode; documentNode; ) {
        var nextNode = documentNode.get('after');
        for (var attributeName of attributeNames)
          historyEntry &&
            historyEntry.undo.push(undoManager.buildAttrUndo(documentNode, attributeName)),
            documentNode.unset(attributeName),
            historyEntry &&
              historyEntry.redo.push(undoManager.buildAttrUndo(documentNode, attributeName));
        documentNode = nextNode;
      }
    }
    var v = function (firstNode, lastNode, historyEntry) {
      var items = [];
      function l(node) {
        return document.querySelector(`[cid="${node.cid}"]`);
      }
      function p(callbackDocumentNode, selectedIndex) {
        var currentDocumentNode;
        if (!callbackDocumentNode.isDeleted())
          if (DocumentNode.isType(callbackDocumentNode.get('before'), NodeType.list)) {
            (currentDocumentNode = callbackDocumentNode.get('before')),
              undoManager.addUndoForRemove(historyEntry, callbackDocumentNode);
            let lastChild = callbackDocumentNode.get('before').getLastChild();
            if (
              (l(lastChild).append(l(callbackDocumentNode)),
              lastChild.appendChild(callbackDocumentNode),
              undoManager.addUndoForInsert(historyEntry, callbackDocumentNode),
              DocumentNode.isType(currentDocumentNode.get('after'), NodeType.list))
            ) {
              var localDocumentNode = currentDocumentNode.get('after');
              undoManager.addUndoForRemove(historyEntry, localDocumentNode);
              var childNodes = DocumentNode.genArrFrom(localDocumentNode.getFirstChild());
              currentDocumentNode.appendChildrenTillEnd(childNodes[0]),
                d(l(localDocumentNode)),
                localDocumentNode.remove(),
                undoManager.addUndoForInsertArray(historyEntry, childNodes),
                $(l(childNodes[0].get('before'))).after(nodeCollectionUtilities.toHTML(childNodes)),
                File.editor.mathBlock.clearCache();
            }
          } else {
            var parentNode = callbackDocumentNode.get('parent'),
              documentNode = parentNode.get('before');
            if (DocumentNode.isType(parentNode, NodeType.list_item)) {
              if (documentNode) {
                undoManager.addUndoForRemove(historyEntry, parentNode),
                  d(l(parentNode)),
                  (currentDocumentNode = parentNode.get('parent').clone()).unset('start'),
                  parentNode.unset('prespace'),
                  parentNode.unset('userIndent'),
                  currentDocumentNode.appendChild(parentNode);
                var nextSibling = callbackDocumentNode.get('after');
                if (DocumentNode.isType(nextSibling, NodeType.list)) {
                  var currentItems = DocumentNode.genArrFrom(nextSibling.getFirstChild());
                  if (
                    (currentDocumentNode.appendChildrenTillEnd(currentItems[0]),
                    parentNode.copyContentFrom(currentItems[0], [
                      'pattern',
                      'subindent',
                      'prespace',
                      'markindent',
                      'ahead',
                      'tail',
                    ]),
                    callbackDocumentNode.copyContentFrom(currentItems[0].getLastChild(), ['tail']),
                    g(parentNode, null, 'userIndent'),
                    currentDocumentNode.addAfterTillEnd(nextSibling.get('after')),
                    w(nextSibling))
                  ) {
                    nextSibling.remove();
                    var nextListIndex = items.indexOf(nextSibling);
                    (nextSibling = null),
                      nextListIndex > selectedIndex &&
                        items.splice.apply(
                          items,
                          [nextListIndex, 1].concat(
                            currentItems.map((inputDocumentNode) =>
                              inputDocumentNode.getFirstChild(),
                            ),
                          ),
                        );
                  }
                }
                documentNode.appendChildrenTillEnd(currentDocumentNode),
                  nextSibling &&
                    !DocumentNode.isType(nextSibling, NodeType.list) &&
                    documentNode.appendChildrenTillEnd(nextSibling);
                var affectedNodes = DocumentNode.genArrFrom(currentDocumentNode);
                if (
                  (undoManager.addUndoForInsertArray(historyEntry, affectedNodes),
                  m(currentDocumentNode.get('before'), currentDocumentNode, !0))
                ) {
                  undoManager.addUndoForRemove(historyEntry, currentDocumentNode),
                    (affectedNodes = DocumentNode.genArrFrom(currentDocumentNode.getFirstChild()));
                  let previousList = currentDocumentNode.get('before');
                  previousList.appendChildrenTillEnd(currentDocumentNode.getFirstChild()),
                    currentDocumentNode.remove(),
                    g(previousList.getFirstChild(), null, 'userIndent', 'prespace', 'markindent'),
                    undoManager.addUndoForInsertArray(historyEntry, affectedNodes);
                }
                return (
                  g(documentNode.get('after'), historyEntry, 'userIndent'),
                  u(documentNode.cid),
                  $(l(documentNode)).replaceWith(documentNode.toHTML()),
                  void File.editor.mathBlock.clearCache()
                );
              }
              var grandparentNode = parentNode.get('parent'),
                previousContainer = grandparentNode && grandparentNode.get('before');
              if (DocumentNode.isType(previousContainer, NodeType.list)) {
                (documentNode = previousContainer.getLastChild()),
                  undoManager.addUndoForRemove(historyEntry, parentNode),
                  d(l(parentNode));
                var clonedList = grandparentNode.clone();
                clonedList.appendChild(parentNode),
                  documentNode.appendChild(clonedList),
                  undoManager.addUndoForInsert(historyEntry, clonedList),
                  u(documentNode.cid),
                  $(l(documentNode)).replaceWith(documentNode.toHTML()),
                  File.editor.mathBlock.clearCache(),
                  w(grandparentNode) &&
                    (undoManager.addUndoForRemove(historyEntry, grandparentNode),
                    grandparentNode.remove(),
                    l(grandparentNode).remove());
              }
            }
          }
      }
      items = (function (firstNode, lastNode) {
        for (
          var currentDocumentNode, nextNode, documentNode = firstNode, currentItems = [];
          documentNode && documentNode.get('parent');
        ) {
          nextNode = null;
          var consecutiveSibling =
            currentDocumentNode && documentNode.get('before') == currentDocumentNode;
          if (
            (DocumentNode.isType(documentNode, NodeType.list) &&
              documentNode.contains(lastNode) &&
              ((documentNode = documentNode.getFirstChild().getFirstChild()),
              (consecutiveSibling = !0)),
            DocumentNode.isType(documentNode.get('before'), NodeType.list) || consecutiveSibling)
          )
            currentItems.push(documentNode),
              (currentDocumentNode = documentNode),
              (nextNode = documentNode.get('after') || c(documentNode.get('parent'), h));
          else if (DocumentNode.isType(documentNode.get('parent'), NodeType.list_item))
            if (((currentDocumentNode = null), documentNode.get('parent').get('before')))
              documentNode.get('before') ||
                (currentItems.push(documentNode),
                DocumentNode.isType(documentNode.get('after'), NodeType.list)
                  ? ((nextNode = documentNode.get('after')), (currentDocumentNode = documentNode))
                  : (nextNode = c(documentNode.get('parent'), h)));
            else {
              if (
                !DocumentNode.isType(
                  documentNode.closest(NodeType.list).get('before'),
                  NodeType.list,
                ) &&
                !consecutiveSibling
              )
                break;
              currentItems.push(documentNode), (nextNode = c(documentNode.get('parent'), h));
            }
          if (documentNode == lastNode || documentNode.contains(lastNode)) break;
          documentNode = nextNode;
        }
        return console.debug('findNodesForMoreIndent', currentItems), currentItems;
      })(firstNode, lastNode);
      for (var itemIndex = 0; itemIndex < items.length; itemIndex++) p(items[itemIndex], itemIndex);
      return historyEntry;
    };
    function y(lastChild, depthLimit) {
      for (depthLimit = depthLimit || 1; depthLimit > 0 && lastChild; )
        lastChild.unset('tail'), (lastChild = lastChild.getLastChild()), depthLimit--;
    }
    function b(documentNode) {
      var parentNode = documentNode.get('parent'),
        trailingContainer = parentNode.clone();
      y(trailingContainer, 2);
      var nextNode = documentNode.get('after');
      return (
        nextNode &&
          (!(function (firstNode) {
            if (firstNode) {
              var items = DocumentNode.genArrFrom(firstNode),
                userIndent = items[0].get('userIndent');
              userIndent &&
                !/^\s*1\./.exec(userIndent) &&
                items.forEach(function (item) {
                  item.unset('userIndent');
                });
            }
          })(nextNode),
          trailingContainer.appendChildrenTillEnd(nextNode)),
        parentNode.addAfter(documentNode),
        y(documentNode, 2),
        documentNode.addAfter(trailingContainer),
        [parentNode, trailingContainer]
      );
    }
    function w(documentNode) {
      return 0 == documentNode.get('children').length;
    }
    DocumentNode.upStream = function (documentNode, command) {
      command = command || undoManager.makeEmptyCommand();
      var replacement,
        currentDocumentNode = documentNode.get('parent');
      if (DocumentNode.isType(currentDocumentNode, NodeType.list_item))
        if (documentNode.get('before')) {
          if (
            !documentNode.get('after') &&
            DocumentNode.isType(documentNode, NodeType.paragraph, NodeType.heading) &&
            DocumentNode.isEmptyBlock(documentNode)
          ) {
            undoManager.addUndoForRemove(command, documentNode);
            var clonedItem = currentDocumentNode.clone();
            clonedItem.appendChildrenTillEnd(documentNode),
              currentDocumentNode.addAfter(clonedItem),
              undoManager.addUndoForInsert(command, clonedItem);
            var parentNode = currentDocumentNode.get('parent');
            u(parentNode.cid),
              (replacement = { oldCid: parentNode.cid, html: parentNode.toHTML() }),
              File.editor.mathBlock.clearCache();
          }
        } else {
          var items = [];
          undoManager.addUndoForRemoveArray(command, DocumentNode.genArrFrom(currentDocumentNode));
          var [leadingContainer, trailingContainer] = b(currentDocumentNode);
          (replacement = { oldCid: leadingContainer.cid }),
            u(leadingContainer.cid),
            (items = currentDocumentNode.unwrap()),
            w(trailingContainer) ? trailingContainer.remove() : items.push(trailingContainer),
            undoManager.addUndoForInsertArray(command, items),
            w(leadingContainer)
              ? (undoManager.addUndoForRemove(command, leadingContainer), leadingContainer.remove())
              : (leadingContainer.getLastChild().unset('tail'), items.unshift(leadingContainer)),
            (replacement.html = nodeCollectionUtilities.toHTML(items, { mathCount: 0 })),
            File.editor.mathBlock.clearCache();
        }
      if (
        (DocumentNode.isType(currentDocumentNode, NodeType.blockquote) &&
          (replacement = (x(documentNode, documentNode, command) || [])[0]),
        replacement)
      )
        return { oldCid: replacement.oldCid, newHtml: replacement.html, command: command };
    };
    var x = function (firstNode, lastNode, historyEntry, items) {
        return (
          (items = items || []),
          (function (firstNode, lastNode) {
            for (
              var documentNode = firstNode, currentItems = [];
              documentNode &&
              DocumentNode.isType(documentNode.get('parent'), NodeType.blockquote) &&
              (currentItems.push(documentNode), documentNode != lastNode);
            )
              documentNode = c(documentNode, f);
            return console.debug('findNodesForLessIndent', currentItems), currentItems;
          })(firstNode, lastNode).forEach(function (item) {
            if (item.isDeleted()) return;
            var replacement = {};
            undoManager.addUndoForRemoveArray(historyEntry, DocumentNode.genArrFrom(item));
            const [leadingContainer, trailingContainer] = b(item);
            var currentItems = [];
            (replacement.oldCid = leadingContainer.cid),
              u(replacement.oldCid),
              currentItems.push(item),
              leadingContainer.addAfter(item),
              item.addAfter(trailingContainer),
              w(trailingContainer)
                ? trailingContainer.remove()
                : currentItems.push(trailingContainer),
              undoManager.addUndoForInsertArray(historyEntry, currentItems),
              w(leadingContainer)
                ? (undoManager.addUndoForRemove(historyEntry, leadingContainer),
                  leadingContainer.remove())
                : currentItems.unshift(leadingContainer),
              (replacement.html = nodeCollectionUtilities.toHTML(currentItems, { mathCount: 0 })),
              items.push(replacement),
              File.editor.mathBlock.clearCache();
          }),
          items
        );
      },
      C = function (firstNode, lastNode, historyEntry, items) {
        function l(node) {
          return b(node);
        }
        return (
          (items = items || []),
          (function (firstNode, lastNode) {
            for (
              var documentNode = firstNode, currentItems = [];
              documentNode &&
              DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) &&
              (currentItems.push(documentNode), !documentNode.get('parent').contains(lastNode));
            )
              documentNode = c(documentNode.get('parent'), h);
            return console.debug('findNodesForLessIndent', currentItems), currentItems;
          })(firstNode, lastNode).forEach(function (inputDocumentNode) {
            if (!inputDocumentNode.isDeleted()) {
              var temporaryCommand,
                replacement = {},
                localDocumentNode = inputDocumentNode.get('parent'),
                documentNode = localDocumentNode.get('parent'),
                currentItems = [];
              if (inputDocumentNode.get('before')) {
                console.debug('lessIndent Pattern 3'),
                  historyEntry.undo.push(undoManager.buildReplaceUndo(localDocumentNode)),
                  localDocumentNode.get('after') &&
                    ((temporaryCommand = undoManager.addUndoForInsertArray(
                      { undo: [], redo: [] },
                      DocumentNode.genArrFrom(localDocumentNode.get('after')),
                    )),
                    historyEntry.undo.push(temporaryCommand.redo[0]),
                    historyEntry.redo.push(temporaryCommand.undo[0]));
                var clonedItem = localDocumentNode.clone();
                clonedItem.appendChildrenTillEnd(inputDocumentNode),
                  localDocumentNode.addAfter(clonedItem),
                  (replacement.oldCid = documentNode.cid);
                let [leadingContainer, currentDocumentNode] = l(clonedItem);
                (currentItems = clonedItem.unwrap()),
                  (temporaryCommand = undoManager.addUndoForInsertArray(
                    { undo: [], redo: [] },
                    currentItems,
                  )),
                  historyEntry.redo.push(temporaryCommand.undo[0]),
                  w(currentDocumentNode)
                    ? currentDocumentNode.remove()
                    : m(currentDocumentNode, currentItems.last())
                      ? (currentItems
                          .last()
                          .appendChildrenTillEnd(currentDocumentNode.getFirstChild()),
                        currentDocumentNode.remove())
                      : currentItems.push(currentDocumentNode),
                  (temporaryCommand = undoManager.addUndoForInsertArray(
                    { undo: [], redo: [] },
                    currentItems,
                  )),
                  historyEntry.redo.push(temporaryCommand.redo[0]),
                  historyEntry.undo.push(temporaryCommand.undo[0]),
                  currentItems.unshift(leadingContainer);
              } else if (DocumentNode.isType(documentNode.get('parent'), NodeType.list_item)) {
                console.debug('lessIndent Pattern 1'),
                  historyEntry.undo.push(undoManager.buildReplaceUndo(documentNode.get('parent'))),
                  documentNode.get('after') &&
                    !localDocumentNode.get('after') &&
                    (historyEntry.redo.push({
                      type: 'remove',
                      idArray: DocumentNode.genArrFrom(documentNode.get('after')).map(
                        (item) => item.cid,
                      ),
                    }),
                    documentNode.getLastChild().appendChildrenTillEnd(documentNode.get('after')));
                let [leadingContainer, trailingContainer] = l(localDocumentNode);
                w(trailingContainer)
                  ? trailingContainer.remove()
                  : localDocumentNode.appendChildrenTillEnd(trailingContainer);
                var parentNode = localDocumentNode.get('parent');
                parentNode.addAfter(localDocumentNode),
                  (temporaryCommand = undoManager.addUndoForInsert(
                    { undo: [], redo: [] },
                    localDocumentNode,
                  )),
                  historyEntry.redo.push(temporaryCommand.undo[0]),
                  historyEntry.redo.push(temporaryCommand.redo[0]),
                  historyEntry.undo.push(temporaryCommand.undo[0]),
                  (replacement.oldCid = parentNode.cid),
                  w(leadingContainer) &&
                    (undoManager.addUndoForRemove(historyEntry, leadingContainer),
                    leadingContainer.remove()),
                  w(parentNode)
                    ? (undoManager.addUndoForRemove(historyEntry, parentNode), parentNode.remove())
                    : currentItems.push(parentNode),
                  g(
                    localDocumentNode.getFirstBrother(),
                    historyEntry,
                    'userIndent',
                    'prespace',
                    'markindent',
                  ),
                  currentItems.push(localDocumentNode);
              } else {
                console.debug('lessIndent Pattern 2'),
                  historyEntry.undo.push(undoManager.buildReplaceUndo(documentNode)),
                  (temporaryCommand = undoManager.addUndoForInsertArray(
                    { undo: [], redo: [] },
                    DocumentNode.genArrFrom(localDocumentNode),
                  )),
                  historyEntry.redo.push(temporaryCommand.undo[0]),
                  (replacement.oldCid = documentNode.cid);
                let [leadingContainer, trailingContainer] = l(localDocumentNode);
                (currentItems = localDocumentNode.unwrap()),
                  w(trailingContainer)
                    ? trailingContainer.remove()
                    : currentItems.push(trailingContainer),
                  (temporaryCommand = undoManager.addUndoForInsertArray(
                    { undo: [], redo: [] },
                    currentItems,
                  )),
                  historyEntry.redo.push(temporaryCommand.redo[0]),
                  historyEntry.undo.push(temporaryCommand.undo[0]),
                  w(leadingContainer)
                    ? (undoManager.addUndoForRemove(historyEntry, leadingContainer),
                      leadingContainer.remove())
                    : currentItems.unshift(leadingContainer);
              }
              u(replacement.oldCid),
                (replacement.html = nodeCollectionUtilities.toHTML(currentItems, { mathCount: 0 })),
                items.push(replacement),
                File.editor.mathBlock.clearCache();
            }
          }),
          items
        );
      };
    (moduleExports.moreIndent = function (editor) {
      var range = editor.selection.getRangy();
      if (!range || File.isLocked) return !0;
      if (DocumentNode.isType(isInputComponent(document.activeElement))) {
        var codeMirrorElement = $(document.activeElement).closest('.CodeMirror')[0];
        return codeMirrorElement && codeMirrorElement.CodeMirror.execCommand('indentMore'), !0;
      }
      var startElement = editor.getMarkElem(range.startContainer),
        element = h(editor.findNodeByElem(startElement)),
        endElement = editor.getMarkElem(range.endContainer),
        lastNode = h(editor.findNodeByElem(endElement), element);
      if (
        (editor.undo.endSnap(!0),
        editor.brush.pause(),
        element &&
          !lastNode &&
          (lastNode = element.closest(NodeType.list).getLastChild().getFirstChild()),
        element && lastNode)
      ) {
        var selectionSnapshot = editor.selection.buildUndo(),
          indentCommand = undoManager.makeEmptyCommand(selectionSnapshot);
        return (
          (element != lastNode || !DocumentNode.isType(element, NodeType.table)) &&
          (v(element, lastNode, indentCommand),
          indentCommand.redo.length &&
            (indentCommand.redo.push(selectionSnapshot),
            editor.undo.exeCommand(selectionSnapshot),
            editor.undo.register(indentCommand),
            editor.refresh(),
            editor.selection.scrollAdjust()),
          window.Reporter.fullValidate(),
          editor.brush.resume(),
          indentCommand.redo.length)
        );
      }
      return editor.brush.resume(), !1;
    }),
      (moduleExports.lessIndent = function (editor) {
        var range = editor.selection.getRangy();
        if (!range || File.isLocked) return !0;
        if (isInputComponent(document.activeElement)) {
          var codeMirrorElement = $(range.startContainer).closest('.CodeMirror')[0];
          return codeMirrorElement && codeMirrorElement.CodeMirror.execCommand('indentLess'), !0;
        }
        function i() {
          editor.brush.pause(),
            editor.undo.endSnap(!0),
            (selectionSnapshot = editor.selection.buildUndo(range)),
            (indentCommand = undoManager.makeEmptyCommand(selectionSnapshot));
        }
        range = editor.selection.deRange(range);
        var selectionSnapshot,
          indentCommand,
          startElement = editor.getMarkElem(range.startContainer),
          element = p(editor.findNodeByElem(startElement)),
          endElement = editor.getMarkElem(range.endContainer),
          lastNode = p(editor.findNodeByElem(endElement));
        element &&
          !lastNode &&
          (lastNode = element.closest(NodeType.list).getLastChild().getFirstChild());
        var items = !1;
        if (element && lastNode) {
          if (element == lastNode && DocumentNode.isType(element, NodeType.table)) return !1;
          i(), (items = C(element, lastNode, indentCommand));
        }
        return (
          items ||
            ((element = f(editor.findNodeByElem(startElement))),
            (lastNode = f(editor.findNodeByElem(endElement))),
            DocumentNode.isType(
              element,
              NodeType.paragraph,
              NodeType.def_footnote,
              NodeType.def_link,
              NodeType.heading,
            ) && (i(), (items = x(element, lastNode, indentCommand)))),
          items ||
            ((element = editor.findNodeByElem(startElement)),
            (lastNode = editor.findNodeByElem(endElement)),
            (selectionSnapshot = editor.selection.buildUndo(range)),
            (indentCommand = undoManager.makeEmptyCommand(Object.clone(selectionSnapshot))),
            (items = []),
            (function e(documentNode, lastNode, visitNode) {
              if (
                (documentNode && visitNode(documentNode),
                documentNode &&
                  documentNode !== lastNode &&
                  !documentNode.contains(lastNode) &&
                  !lastNode.contains(documentNode))
              ) {
                for (
                  var nextNode = documentNode.get('after'), currentDocumentNode = documentNode;
                  !nextNode;
                )
                  nextNode = (currentDocumentNode = currentDocumentNode.get('parent')).get('after');
                e((nextNode = nextNode && nextNode.getVeryFirst()), lastNode, visitNode);
              }
            })(element, lastNode, function (node) {
              (function (documentNode, historyEntry, selectionSnapshot) {
                if (DocumentNode.isType(documentNode, NodeType.paragraph, NodeType.heading)) {
                  var text = documentNode.get('text'),
                    removedIndent = (/^\u200b*(\t|( {1,2}))/.exec(text) || [])[0];
                  if (!removedIndent) return;
                  var textSlice = text.substr(removedIndent.length);
                  return (
                    historyEntry.undo.push(undoManager.buildReplaceUndo(documentNode)),
                    documentNode.set('text', textSlice),
                    documentNode.id === (selectionSnapshot.startId || selectionSnapshot.id) &&
                      (selectionSnapshot.start -= removedIndent.length),
                    documentNode.id === (selectionSnapshot.endId || selectionSnapshot.id) &&
                      (selectionSnapshot.end -= removedIndent.length),
                    historyEntry.redo.push(undoManager.buildReplaceUndo(documentNode)),
                    !0
                  );
                }
              })(node, indentCommand, selectionSnapshot) &&
                items.push({ oldCid: node.id, html: node.toHTML() });
            }),
            0 == items.length && (items = !1)),
          (function (replacements) {
            if (replacements) {
              for (var itemIndex = 0; itemIndex < replacements.length; itemIndex++) {
                editor
                  .findElemById(replacements[itemIndex].oldCid)
                  .replaceWith(replacements[itemIndex].html);
                var updatedElement = editor.findElemById(replacements[itemIndex].oldCid)[0];
                updatedElement && editor.refreshUnder(updatedElement, !1, !1);
              }
              editor.undo.exeCommand(selectionSnapshot),
                indentCommand.redo.push(selectionSnapshot),
                editor.undo.register(indentCommand),
                window.Reporter.fullValidate();
            }
            return (
              editor.brush.resume(),
              editor.mathBlock.clearCache(),
              replacements && element != lastNode
            );
          })(items)
        );
      }),
      (moduleExports.tryConvertListItemToUpperParagraph = function (editor, inputDocumentNode) {
        if (
          DocumentNode.isType(inputDocumentNode.get('parent'), NodeType.list_item) &&
          inputDocumentNode.get('parent').get('before') &&
          !inputDocumentNode.get('before')
        ) {
          var indentCommand = undoManager.makeEmptyCommand(editor.selection.buildUndo()),
            currentDocumentNode = inputDocumentNode.get('parent'),
            previousNode = currentDocumentNode.get('before'),
            lastChild = previousNode.getLastChild(),
            movedNodes = DocumentNode.genArrFrom(inputDocumentNode);
          undoManager.addUndoForRemove(indentCommand, currentDocumentNode),
            previousNode.appendChildrenTillEnd(inputDocumentNode),
            undoManager.addUndoForInsertArray(indentCommand, movedNodes),
            currentDocumentNode.remove(),
            editor.findElemById(currentDocumentNode.id).remove(),
            editor
              .findElemById(lastChild.id)
              .after(nodeCollectionUtilities.toHTML(movedNodes, { mathCount: 0 })),
            editor.selection.jumpIntoElemBegin(editor.findElemById(inputDocumentNode.id));
          for (var documentNode = inputDocumentNode.closest(NodeType.list); documentNode; )
            g(documentNode.getFirstChild(), indentCommand, 'tail'),
              (documentNode = documentNode.get('parent')) &&
                (documentNode = documentNode.closest(NodeType.list));
          return indentCommand.redo.push(editor.selection.buildUndo()), indentCommand;
        }
      });
  },
);
