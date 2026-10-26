// editing/list-indent.
export default function initializeEditingListIndent(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(visitNextLeaf, 'name', { value: 'c', configurable: true });
  Object.defineProperty(removeElementWithMathCache, 'name', { value: 'd', configurable: true });
  Object.defineProperty(cacheNodeMath, 'name', { value: 'u', configurable: true });
  Object.defineProperty(findIndentableNode, 'name', { value: 'h', configurable: true });
  Object.defineProperty(closestListItemContent, 'name', { value: 'p', configurable: true });
  Object.defineProperty(closestBlockquoteContent, 'name', { value: 'f', configurable: true });
  Object.defineProperty(canMergeLists, 'name', { value: 'm', configurable: true });
  Object.defineProperty(clearSiblingAttributes, 'name', { value: 'g', configurable: true });
  Object.defineProperty(clearTrailingBlankLines, 'name', { value: 'y', configurable: true });
  Object.defineProperty(splitFollowingContainer, 'name', { value: 'b', configurable: true });
  Object.defineProperty(hasNoChildren, 'name', { value: 'w', configurable: true });

  if (!this) {
    self;
  }
  requireModule('shared/utilities');
  var documentModel = requireModule('model/document-model'),
    undoManager = requireModule('editing/undo-manager'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    nodeCollectionUtilities = documentModel.NodeCollectionUtils,
    findAncestor =
      (requireModule('libraries/rangy'),
      function (documentNode, predicate) {
        if (!documentNode) {
          return null;
        }
        if (predicate(documentNode)) {
          return documentNode;
        }
        var parentNode = documentNode.get('parent');
        if (parentNode) {
          return findAncestor(parentNode, predicate);
        } else {
          return null;
        }
      });
  function visitNextLeaf(documentNode, visitNext) {
    if (documentNode) {
      if (documentNode.get('after')) {
        return visitNext(documentNode.get('after').getVeryFirst());
      } else {
        return visitNextLeaf(documentNode.get('parent'), visitNext);
      }
    } else {
      return null;
    }
  }
  function removeElementWithMathCache(nodeElement) {
    File.editor.mathBlock.cacheUnder(nodeElement);
    nodeElement.remove();
  }
  function cacheNodeMath(nodeId) {
    File.editor.mathBlock.cacheUnder(File.editor.findElemById(nodeId)[0]);
  }
  function findIndentableNode(documentNode, boundaryNode, allowTopLevel) {
    var indentableNode, currentDocumentNode;
    if (!documentNode) {
      return documentNode;
    }
    if (!allowTopLevel && !documentNode.get('parent')) {
      return null;
    }
    if (DocumentNode.isType(documentNode.get('before'), NodeType.list)) {
      return documentNode;
    }
    if (
      !(indentableNode = findAncestor(documentNode, function (inputDocumentNode) {
        return DocumentNode.isType(inputDocumentNode.get('parent'), NodeType.list_item);
      })) &&
      boundaryNode
    ) {
      for (currentDocumentNode = boundaryNode; currentDocumentNode; ) {
        if (currentDocumentNode == documentNode || currentDocumentNode.contains(documentNode)) {
          return currentDocumentNode;
        }
        currentDocumentNode = currentDocumentNode.get('after');
      }
    }
    return indentableNode;
  }
  function closestListItemContent(node) {
    if (node) {
      return findAncestor(node, function (documentNode) {
        return DocumentNode.isType(documentNode.get('parent'), NodeType.list_item);
      });
    } else {
      return node;
    }
  }
  function closestBlockquoteContent(node) {
    return findAncestor(node, function (documentNode) {
      return DocumentNode.isType(documentNode.get('parent'), NodeType.blockquote);
    });
  }
  function canMergeLists(leftList, rightList, skipStyleCheck) {
    return (
      DocumentNode.isType(leftList, NodeType.list) &&
      DocumentNode.isType(rightList, NodeType.list) &&
      (skipStyleCheck || leftList.get('style') == leftList.get('style'))
    );
  }
  function clearSiblingAttributes(firstNode, historyEntry, ...attributeNames) {
    for (var documentNode = firstNode; documentNode; ) {
      var nextNode = documentNode.get('after');
      for (var attributeName of attributeNames) {
        if (historyEntry) {
          historyEntry.undo.push(undoManager.buildAttrUndo(documentNode, attributeName));
        }
        documentNode.unset(attributeName);
        if (historyEntry) {
          historyEntry.redo.push(undoManager.buildAttrUndo(documentNode, attributeName));
        }
      }
      documentNode = nextNode;
    }
  }
  var indentNodeRange = Object.defineProperty(
    function (firstNode, lastNode, historyEntry) {
      Object.defineProperty(findNodeElement, 'name', { value: 'l', configurable: true });
      Object.defineProperty(indentNodeIntoPreviousList, 'name', { value: 'p', configurable: true });

      var items = [];
      function findNodeElement(node) {
        return document.querySelector(`[cid="${node.cid}"]`);
      }
      function indentNodeIntoPreviousList(callbackDocumentNode, selectedIndex) {
        var currentDocumentNode;
        if (!callbackDocumentNode.isDeleted()) {
          if (DocumentNode.isType(callbackDocumentNode.get('before'), NodeType.list)) {
            currentDocumentNode = callbackDocumentNode.get('before');
            undoManager.addUndoForRemove(historyEntry, callbackDocumentNode);
            let lastChild = callbackDocumentNode.get('before').getLastChild();
            findNodeElement(lastChild).append(findNodeElement(callbackDocumentNode));
            lastChild.appendChild(callbackDocumentNode);
            undoManager.addUndoForInsert(historyEntry, callbackDocumentNode);
            if (DocumentNode.isType(currentDocumentNode.get('after'), NodeType.list)) {
              var localDocumentNode = currentDocumentNode.get('after');
              undoManager.addUndoForRemove(historyEntry, localDocumentNode);
              var childNodes = DocumentNode.genArrFrom(localDocumentNode.getFirstChild());
              currentDocumentNode.appendChildrenTillEnd(childNodes[0]);
              removeElementWithMathCache(findNodeElement(localDocumentNode));
              localDocumentNode.remove();
              undoManager.addUndoForInsertArray(historyEntry, childNodes);
              $(findNodeElement(childNodes[0].get('before'))).after(
                nodeCollectionUtilities.toHTML(childNodes),
              );
              File.editor.mathBlock.clearCache();
            }
          } else {
            var parentNode = callbackDocumentNode.get('parent'),
              documentNode = parentNode.get('before');
            if (DocumentNode.isType(parentNode, NodeType.list_item)) {
              if (documentNode) {
                undoManager.addUndoForRemove(historyEntry, parentNode);
                removeElementWithMathCache(findNodeElement(parentNode));
                (currentDocumentNode = parentNode.get('parent').clone()).unset('start');
                parentNode.unset('prespace');
                parentNode.unset('userIndent');
                currentDocumentNode.appendChild(parentNode);
                var nextSibling = callbackDocumentNode.get('after');
                if (DocumentNode.isType(nextSibling, NodeType.list)) {
                  var currentItems = DocumentNode.genArrFrom(nextSibling.getFirstChild());
                  currentDocumentNode.appendChildrenTillEnd(currentItems[0]);
                  parentNode.copyContentFrom(currentItems[0], [
                    'pattern',
                    'subindent',
                    'prespace',
                    'markindent',
                    'ahead',
                    'tail',
                  ]);
                  callbackDocumentNode.copyContentFrom(currentItems[0].getLastChild(), ['tail']);
                  clearSiblingAttributes(parentNode, null, 'userIndent');
                  currentDocumentNode.addAfterTillEnd(nextSibling.get('after'));
                  if (hasNoChildren(nextSibling)) {
                    nextSibling.remove();
                    var nextListIndex = items.indexOf(nextSibling);
                    nextSibling = null;
                    if (nextListIndex > selectedIndex) {
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
                }
                documentNode.appendChildrenTillEnd(currentDocumentNode);
                if (nextSibling && !DocumentNode.isType(nextSibling, NodeType.list)) {
                  documentNode.appendChildrenTillEnd(nextSibling);
                }
                var affectedNodes = DocumentNode.genArrFrom(currentDocumentNode);
                undoManager.addUndoForInsertArray(historyEntry, affectedNodes);
                if (canMergeLists(currentDocumentNode.get('before'), currentDocumentNode, true)) {
                  undoManager.addUndoForRemove(historyEntry, currentDocumentNode);
                  affectedNodes = DocumentNode.genArrFrom(currentDocumentNode.getFirstChild());
                  let previousList = currentDocumentNode.get('before');
                  previousList.appendChildrenTillEnd(currentDocumentNode.getFirstChild());
                  currentDocumentNode.remove();
                  clearSiblingAttributes(
                    previousList.getFirstChild(),
                    null,
                    'userIndent',
                    'prespace',
                    'markindent',
                  );
                  undoManager.addUndoForInsertArray(historyEntry, affectedNodes);
                }
                clearSiblingAttributes(documentNode.get('after'), historyEntry, 'userIndent');
                cacheNodeMath(documentNode.cid);
                $(findNodeElement(documentNode)).replaceWith(documentNode.toHTML());
                return void File.editor.mathBlock.clearCache();
              }
              var grandparentNode = parentNode.get('parent'),
                previousContainer = grandparentNode && grandparentNode.get('before');
              if (DocumentNode.isType(previousContainer, NodeType.list)) {
                documentNode = previousContainer.getLastChild();
                undoManager.addUndoForRemove(historyEntry, parentNode);
                removeElementWithMathCache(findNodeElement(parentNode));
                var clonedList = grandparentNode.clone();
                clonedList.appendChild(parentNode);
                documentNode.appendChild(clonedList);
                undoManager.addUndoForInsert(historyEntry, clonedList);
                cacheNodeMath(documentNode.cid);
                $(findNodeElement(documentNode)).replaceWith(documentNode.toHTML());
                File.editor.mathBlock.clearCache();
                if (hasNoChildren(grandparentNode)) {
                  undoManager.addUndoForRemove(historyEntry, grandparentNode);
                  grandparentNode.remove();
                  findNodeElement(grandparentNode).remove();
                }
              }
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
          if (DocumentNode.isType(documentNode, NodeType.list) && documentNode.contains(lastNode)) {
            documentNode = documentNode.getFirstChild().getFirstChild();
            consecutiveSibling = true;
          }
          if (
            DocumentNode.isType(documentNode.get('before'), NodeType.list) ||
            consecutiveSibling
          ) {
            currentItems.push(documentNode);
            currentDocumentNode = documentNode;
            nextNode =
              documentNode.get('after') ||
              visitNextLeaf(documentNode.get('parent'), findIndentableNode);
          } else {
            if (DocumentNode.isType(documentNode.get('parent'), NodeType.list_item)) {
              currentDocumentNode = null;
              if (documentNode.get('parent').get('before')) {
                if (!documentNode.get('before')) {
                  currentItems.push(documentNode);
                  if (DocumentNode.isType(documentNode.get('after'), NodeType.list)) {
                    nextNode = documentNode.get('after');
                    currentDocumentNode = documentNode;
                  } else {
                    nextNode = visitNextLeaf(documentNode.get('parent'), findIndentableNode);
                  }
                }
              } else {
                if (
                  !DocumentNode.isType(
                    documentNode.closest(NodeType.list).get('before'),
                    NodeType.list,
                  ) &&
                  !consecutiveSibling
                ) {
                  break;
                }
                currentItems.push(documentNode);
                nextNode = visitNextLeaf(documentNode.get('parent'), findIndentableNode);
              }
            }
          }
          if (documentNode == lastNode || documentNode.contains(lastNode)) {
            break;
          }
          documentNode = nextNode;
        }
        console.debug('findNodesForMoreIndent', currentItems);
        return currentItems;
      })(firstNode, lastNode);
      for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
        indentNodeIntoPreviousList(items[itemIndex], itemIndex);
      }
      return historyEntry;
    },
    'name',
    { value: 'v', configurable: true },
  );
  function clearTrailingBlankLines(lastChild, depthLimit) {
    for (depthLimit = depthLimit || 1; depthLimit > 0 && lastChild; ) {
      lastChild.unset('tail');
      lastChild = lastChild.getLastChild();
      depthLimit--;
    }
  }
  function splitFollowingContainer(documentNode) {
    var parentNode = documentNode.get('parent'),
      trailingContainer = parentNode.clone();
    clearTrailingBlankLines(trailingContainer, 2);
    var nextNode = documentNode.get('after');
    if (nextNode) {
      !(function (firstNode) {
        if (firstNode) {
          var items = DocumentNode.genArrFrom(firstNode),
            userIndent = items[0].get('userIndent');
          if (userIndent && !/^\s*1\./.exec(userIndent)) {
            items.forEach(function (item) {
              item.unset('userIndent');
            });
          }
        }
      })(nextNode);
      trailingContainer.appendChildrenTillEnd(nextNode);
    }
    parentNode.addAfter(documentNode);
    clearTrailingBlankLines(documentNode, 2);
    documentNode.addAfter(trailingContainer);
    return [parentNode, trailingContainer];
  }
  function hasNoChildren(documentNode) {
    return 0 == documentNode.get('children').length;
  }
  DocumentNode.upStream = function (documentNode, command) {
    command = command || undoManager.makeEmptyCommand();
    var replacement,
      currentDocumentNode = documentNode.get('parent');
    if (DocumentNode.isType(currentDocumentNode, NodeType.list_item)) {
      if (documentNode.get('before')) {
        if (
          !documentNode.get('after') &&
          DocumentNode.isType(documentNode, NodeType.paragraph, NodeType.heading) &&
          DocumentNode.isEmptyBlock(documentNode)
        ) {
          undoManager.addUndoForRemove(command, documentNode);
          var clonedItem = currentDocumentNode.clone();
          clonedItem.appendChildrenTillEnd(documentNode);
          currentDocumentNode.addAfter(clonedItem);
          undoManager.addUndoForInsert(command, clonedItem);
          var parentNode = currentDocumentNode.get('parent');
          cacheNodeMath(parentNode.cid);
          replacement = { oldCid: parentNode.cid, html: parentNode.toHTML() };
          File.editor.mathBlock.clearCache();
        }
      } else {
        var items = [];
        undoManager.addUndoForRemoveArray(command, DocumentNode.genArrFrom(currentDocumentNode));
        var [leadingContainer, trailingContainer] = splitFollowingContainer(currentDocumentNode);
        replacement = { oldCid: leadingContainer.cid };
        cacheNodeMath(leadingContainer.cid);
        items = currentDocumentNode.unwrap();
        if (hasNoChildren(trailingContainer)) {
          trailingContainer.remove();
        } else {
          items.push(trailingContainer);
        }
        undoManager.addUndoForInsertArray(command, items);
        if (hasNoChildren(leadingContainer)) {
          undoManager.addUndoForRemove(command, leadingContainer);
          leadingContainer.remove();
        } else {
          leadingContainer.getLastChild().unset('tail');
          items.unshift(leadingContainer);
        }
        replacement.html = nodeCollectionUtilities.toHTML(items, { mathCount: 0 });
        File.editor.mathBlock.clearCache();
      }
    }
    if (DocumentNode.isType(currentDocumentNode, NodeType.blockquote)) {
      replacement = (outdentListRange(documentNode, documentNode, command) || [])[0];
    }
    if (replacement) {
      return { oldCid: replacement.oldCid, newHtml: replacement.html, command: command };
    }
  };
  var outdentListRange = Object.defineProperty(
      function (firstNode, lastNode, historyEntry, items) {
        items = items || [];
        (function (firstNode, lastNode) {
          for (
            var documentNode = firstNode, currentItems = [];
            documentNode &&
            DocumentNode.isType(documentNode.get('parent'), NodeType.blockquote) &&
            (currentItems.push(documentNode), documentNode != lastNode);
          ) {
            documentNode = visitNextLeaf(documentNode, closestBlockquoteContent);
          }
          console.debug('findNodesForLessIndent', currentItems);
          return currentItems;
        })(firstNode, lastNode).forEach(function (item) {
          if (item.isDeleted()) {
            return;
          }
          var replacement = {};
          undoManager.addUndoForRemoveArray(historyEntry, DocumentNode.genArrFrom(item));
          const [leadingContainer, trailingContainer] = splitFollowingContainer(item);
          var currentItems = [];
          replacement.oldCid = leadingContainer.cid;
          cacheNodeMath(replacement.oldCid);
          currentItems.push(item);
          leadingContainer.addAfter(item);
          item.addAfter(trailingContainer);
          if (hasNoChildren(trailingContainer)) {
            trailingContainer.remove();
          } else {
            currentItems.push(trailingContainer);
          }
          undoManager.addUndoForInsertArray(historyEntry, currentItems);
          if (hasNoChildren(leadingContainer)) {
            undoManager.addUndoForRemove(historyEntry, leadingContainer);
            leadingContainer.remove();
          } else {
            currentItems.unshift(leadingContainer);
          }
          replacement.html = nodeCollectionUtilities.toHTML(currentItems, { mathCount: 0 });
          items.push(replacement);
          File.editor.mathBlock.clearCache();
        });
        return items;
      },
      'name',
      { value: 'x', configurable: true },
    ),
    outdentBlockquoteRange = Object.defineProperty(
      function (firstNode, lastNode, historyEntry, items) {
        Object.defineProperty(splitOutdentedContainer, 'name', { value: 'l', configurable: true });

        function splitOutdentedContainer(node) {
          return splitFollowingContainer(node);
        }
        items = items || [];
        (function (firstNode, lastNode) {
          for (
            var documentNode = firstNode, currentItems = [];
            documentNode &&
            DocumentNode.isType(documentNode.get('parent'), NodeType.list_item) &&
            (currentItems.push(documentNode), !documentNode.get('parent').contains(lastNode));
          ) {
            documentNode = visitNextLeaf(documentNode.get('parent'), findIndentableNode);
          }
          console.debug('findNodesForLessIndent', currentItems);
          return currentItems;
        })(firstNode, lastNode).forEach(function (inputDocumentNode) {
          if (!inputDocumentNode.isDeleted()) {
            var temporaryCommand,
              replacement = {},
              localDocumentNode = inputDocumentNode.get('parent'),
              documentNode = localDocumentNode.get('parent'),
              currentItems = [];
            if (inputDocumentNode.get('before')) {
              console.debug('lessIndent Pattern 3');
              historyEntry.undo.push(undoManager.buildReplaceUndo(localDocumentNode));
              if (localDocumentNode.get('after')) {
                temporaryCommand = undoManager.addUndoForInsertArray(
                  { undo: [], redo: [] },
                  DocumentNode.genArrFrom(localDocumentNode.get('after')),
                );
                historyEntry.undo.push(temporaryCommand.redo[0]);
                historyEntry.redo.push(temporaryCommand.undo[0]);
              }
              var clonedItem = localDocumentNode.clone();
              clonedItem.appendChildrenTillEnd(inputDocumentNode);
              localDocumentNode.addAfter(clonedItem);
              replacement.oldCid = documentNode.cid;
              let [leadingContainer, currentDocumentNode] = splitOutdentedContainer(clonedItem);
              currentItems = clonedItem.unwrap();
              temporaryCommand = undoManager.addUndoForInsertArray(
                { undo: [], redo: [] },
                currentItems,
              );
              historyEntry.redo.push(temporaryCommand.undo[0]);
              if (hasNoChildren(currentDocumentNode)) {
                currentDocumentNode.remove();
              } else {
                if (canMergeLists(currentDocumentNode, currentItems.last())) {
                  currentItems.last().appendChildrenTillEnd(currentDocumentNode.getFirstChild());
                  currentDocumentNode.remove();
                } else {
                  currentItems.push(currentDocumentNode);
                }
              }
              temporaryCommand = undoManager.addUndoForInsertArray(
                { undo: [], redo: [] },
                currentItems,
              );
              historyEntry.redo.push(temporaryCommand.redo[0]);
              historyEntry.undo.push(temporaryCommand.undo[0]);
              currentItems.unshift(leadingContainer);
            } else {
              if (DocumentNode.isType(documentNode.get('parent'), NodeType.list_item)) {
                console.debug('lessIndent Pattern 1');
                historyEntry.undo.push(undoManager.buildReplaceUndo(documentNode.get('parent')));
                if (documentNode.get('after') && !localDocumentNode.get('after')) {
                  historyEntry.redo.push({
                    type: 'remove',
                    idArray: DocumentNode.genArrFrom(documentNode.get('after')).map(
                      (item) => item.cid,
                    ),
                  });
                  documentNode.getLastChild().appendChildrenTillEnd(documentNode.get('after'));
                }
                let [leadingContainer, trailingContainer] =
                  splitOutdentedContainer(localDocumentNode);
                if (hasNoChildren(trailingContainer)) {
                  trailingContainer.remove();
                } else {
                  localDocumentNode.appendChildrenTillEnd(trailingContainer);
                }
                var parentNode = localDocumentNode.get('parent');
                parentNode.addAfter(localDocumentNode);
                temporaryCommand = undoManager.addUndoForInsert(
                  { undo: [], redo: [] },
                  localDocumentNode,
                );
                historyEntry.redo.push(temporaryCommand.undo[0]);
                historyEntry.redo.push(temporaryCommand.redo[0]);
                historyEntry.undo.push(temporaryCommand.undo[0]);
                replacement.oldCid = parentNode.cid;
                if (hasNoChildren(leadingContainer)) {
                  undoManager.addUndoForRemove(historyEntry, leadingContainer);
                  leadingContainer.remove();
                }
                if (hasNoChildren(parentNode)) {
                  undoManager.addUndoForRemove(historyEntry, parentNode);
                  parentNode.remove();
                } else {
                  currentItems.push(parentNode);
                }
                clearSiblingAttributes(
                  localDocumentNode.getFirstBrother(),
                  historyEntry,
                  'userIndent',
                  'prespace',
                  'markindent',
                );
                currentItems.push(localDocumentNode);
              } else {
                console.debug('lessIndent Pattern 2');
                historyEntry.undo.push(undoManager.buildReplaceUndo(documentNode));
                temporaryCommand = undoManager.addUndoForInsertArray(
                  { undo: [], redo: [] },
                  DocumentNode.genArrFrom(localDocumentNode),
                );
                historyEntry.redo.push(temporaryCommand.undo[0]);
                replacement.oldCid = documentNode.cid;
                let [leadingContainer, trailingContainer] =
                  splitOutdentedContainer(localDocumentNode);
                currentItems = localDocumentNode.unwrap();
                if (hasNoChildren(trailingContainer)) {
                  trailingContainer.remove();
                } else {
                  currentItems.push(trailingContainer);
                }
                temporaryCommand = undoManager.addUndoForInsertArray(
                  { undo: [], redo: [] },
                  currentItems,
                );
                historyEntry.redo.push(temporaryCommand.redo[0]);
                historyEntry.undo.push(temporaryCommand.undo[0]);
                if (hasNoChildren(leadingContainer)) {
                  undoManager.addUndoForRemove(historyEntry, leadingContainer);
                  leadingContainer.remove();
                } else {
                  currentItems.unshift(leadingContainer);
                }
              }
            }
            cacheNodeMath(replacement.oldCid);
            replacement.html = nodeCollectionUtilities.toHTML(currentItems, { mathCount: 0 });
            items.push(replacement);
            File.editor.mathBlock.clearCache();
          }
        });
        return items;
      },
      'name',
      { value: 'C', configurable: true },
    );
  moduleExports.moreIndent = function (editor) {
    var range = editor.selection.getRangy();
    if (!range || File.isLocked) {
      return true;
    }
    if (DocumentNode.isType(isInputComponent(document.activeElement))) {
      var codeMirrorElement = $(document.activeElement).closest('.CodeMirror')[0];
      if (codeMirrorElement) {
        codeMirrorElement.CodeMirror.execCommand('indentMore');
      }
      return true;
    }
    var startElement = editor.getMarkElem(range.startContainer),
      element = findIndentableNode(editor.findNodeByElem(startElement)),
      endElement = editor.getMarkElem(range.endContainer),
      lastNode = findIndentableNode(editor.findNodeByElem(endElement), element);
    editor.undo.endSnap(true);
    editor.brush.pause();
    if (element && !lastNode) {
      lastNode = element.closest(NodeType.list).getLastChild().getFirstChild();
    }
    if (element && lastNode) {
      var selectionSnapshot = editor.selection.buildUndo(),
        indentCommand = undoManager.makeEmptyCommand(selectionSnapshot);
      return (
        (element != lastNode || !DocumentNode.isType(element, NodeType.table)) &&
        (indentNodeRange(element, lastNode, indentCommand),
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
    editor.brush.resume();
    return false;
  };
  moduleExports.lessIndent = function (editor) {
    Object.defineProperty(beginIndentCommand, 'name', { value: 'i', configurable: true });

    var range = editor.selection.getRangy();
    if (!range || File.isLocked) {
      return true;
    }
    if (isInputComponent(document.activeElement)) {
      var codeMirrorElement = $(range.startContainer).closest('.CodeMirror')[0];
      if (codeMirrorElement) {
        codeMirrorElement.CodeMirror.execCommand('indentLess');
      }
      return true;
    }
    function beginIndentCommand() {
      editor.brush.pause();
      editor.undo.endSnap(true);
      selectionSnapshot = editor.selection.buildUndo(range);
      indentCommand = undoManager.makeEmptyCommand(selectionSnapshot);
    }
    range = editor.selection.deRange(range);
    var selectionSnapshot,
      indentCommand,
      startElement = editor.getMarkElem(range.startContainer),
      element = closestListItemContent(editor.findNodeByElem(startElement)),
      endElement = editor.getMarkElem(range.endContainer),
      lastNode = closestListItemContent(editor.findNodeByElem(endElement));
    if (element && !lastNode) {
      lastNode = element.closest(NodeType.list).getLastChild().getFirstChild();
    }
    var items = false;
    if (element && lastNode) {
      if (element == lastNode && DocumentNode.isType(element, NodeType.table)) {
        return false;
      }
      beginIndentCommand();
      items = outdentBlockquoteRange(element, lastNode, indentCommand);
    }
    if (!items) {
      element = closestBlockquoteContent(editor.findNodeByElem(startElement));
      lastNode = closestBlockquoteContent(editor.findNodeByElem(endElement));
      if (
        DocumentNode.isType(
          element,
          NodeType.paragraph,
          NodeType.def_footnote,
          NodeType.def_link,
          NodeType.heading,
        )
      ) {
        beginIndentCommand();
        items = outdentListRange(element, lastNode, indentCommand);
      }
    }
    if (!items) {
      element = editor.findNodeByElem(startElement);
      lastNode = editor.findNodeByElem(endElement);
      selectionSnapshot = editor.selection.buildUndo(range);
      indentCommand = undoManager.makeEmptyCommand(Object.clone(selectionSnapshot));
      items = [];
      Object.defineProperty(
        function visitSelectedNodes(documentNode, lastNode, visitNode) {
          if (documentNode) {
            visitNode(documentNode);
          }
          if (
            documentNode &&
            documentNode !== lastNode &&
            !documentNode.contains(lastNode) &&
            !lastNode.contains(documentNode)
          ) {
            for (
              var nextNode = documentNode.get('after'), currentDocumentNode = documentNode;
              !nextNode;
            ) {
              nextNode = (currentDocumentNode = currentDocumentNode.get('parent')).get('after');
            }
            visitSelectedNodes(
              (nextNode = nextNode && nextNode.getVeryFirst()),
              lastNode,
              visitNode,
            );
          }
        },
        'name',
        { value: 'e', configurable: true },
      )(element, lastNode, function (node) {
        if (
          (function (documentNode, historyEntry, selectionSnapshot) {
            if (DocumentNode.isType(documentNode, NodeType.paragraph, NodeType.heading)) {
              var text = documentNode.get('text'),
                removedIndent = (/^\u200b*(\t|( {1,2}))/.exec(text) || [])[0];
              if (!removedIndent) {
                return;
              }
              var textSlice = text.substr(removedIndent.length);
              historyEntry.undo.push(undoManager.buildReplaceUndo(documentNode));
              documentNode.set('text', textSlice);
              if (documentNode.id === (selectionSnapshot.startId || selectionSnapshot.id)) {
                selectionSnapshot.start -= removedIndent.length;
              }
              if (documentNode.id === (selectionSnapshot.endId || selectionSnapshot.id)) {
                selectionSnapshot.end -= removedIndent.length;
              }
              historyEntry.redo.push(undoManager.buildReplaceUndo(documentNode));
              return true;
            }
          })(node, indentCommand, selectionSnapshot)
        ) {
          items.push({ oldCid: node.id, html: node.toHTML() });
        }
      });
      if (0 == items.length) {
        items = false;
      }
    }
    return (function (replacements) {
      if (replacements) {
        for (var itemIndex = 0; itemIndex < replacements.length; itemIndex++) {
          editor
            .findElemById(replacements[itemIndex].oldCid)
            .replaceWith(replacements[itemIndex].html);
          var updatedElement = editor.findElemById(replacements[itemIndex].oldCid)[0];
          if (updatedElement) {
            editor.refreshUnder(updatedElement, false, false);
          }
        }
        editor.undo.exeCommand(selectionSnapshot);
        indentCommand.redo.push(selectionSnapshot);
        editor.undo.register(indentCommand);
        window.Reporter.fullValidate();
      }
      editor.brush.resume();
      editor.mathBlock.clearCache();
      return replacements && element != lastNode;
    })(items);
  };
  moduleExports.tryConvertListItemToUpperParagraph = function (editor, inputDocumentNode) {
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
      undoManager.addUndoForRemove(indentCommand, currentDocumentNode);
      previousNode.appendChildrenTillEnd(inputDocumentNode);
      undoManager.addUndoForInsertArray(indentCommand, movedNodes);
      currentDocumentNode.remove();
      editor.findElemById(currentDocumentNode.id).remove();
      editor
        .findElemById(lastChild.id)
        .after(nodeCollectionUtilities.toHTML(movedNodes, { mathCount: 0 }));
      editor.selection.jumpIntoElemBegin(editor.findElemById(inputDocumentNode.id));
      for (var documentNode = inputDocumentNode.closest(NodeType.list); documentNode; ) {
        clearSiblingAttributes(documentNode.getFirstChild(), indentCommand, 'tail');
        if ((documentNode = documentNode.get('parent'))) {
          documentNode = documentNode.closest(NodeType.list);
        }
      }
      indentCommand.redo.push(editor.selection.buildUndo());
      return indentCommand;
    }
  };
}
