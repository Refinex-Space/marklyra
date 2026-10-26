// editing/undo-manager.
export default function initializeEditingUndoManager(requireModule, moduleExports, moduleRecord) {
  'use strict';

  var hostGlobal = this || self,
    documentModel = (requireModule('shared/utilities'), requireModule('model/document-model')),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    SnapshotAction = { NONE: 0, ADD: 1, REPLACE: 2, DELETE: -1 };
  class UndoManager {
    constructor(editor) {
      this.commandStack = [];
      this.index = -1;
      this.editor = editor;
      this.UndoManager = UndoManager;
      this.undoManagerContext = false;
    }
    reset() {
      this.commandStack = [];
      this.index = -1;
      console.sendLog('[UndoManager] reset commandStack');
    }
    setIndex(historyIndex) {
      this.index = historyIndex;
    }
    restoreFromJson(snapshot) {
      this.setIndex(snapshot.index);
      this.commandStack = JSON.parse(snapshot.commandStackJson);
      console.sendLog(
        `[UndoManager] restoreFromJson all: ${this.commandStack.length} at: ${snapshot.index}`,
      );
    }
    storeToJson() {
      var commandStackJson;
      try {
        commandStackJson = JSON.stringify(this.commandStack);
      } catch (error) {
        console.sendError(error);
        this.resize(20);
        commandStackJson = JSON.stringify(this.commandStack);
      }
      return { index: this.index, commandStackJson: commandStackJson };
    }
    callCommand(historyEntry, undo) {
      var changed, commandChanged;
      this.lastUndo = null;
      if (undo) {
        for (var itemIndex = (historyEntry.undo || []).length - 1; itemIndex > -1; itemIndex--) {
          commandChanged = this.exeCommand(historyEntry.undo[itemIndex], historyEntry.redo);
          if (!changed) {
            changed = void 0 === changed ? commandChanged : !!commandChanged;
          }
        }
      } else {
        for (itemIndex = 0; itemIndex < (historyEntry.redo || []).length; itemIndex++) {
          commandChanged = this.exeCommand(historyEntry.redo[itemIndex], historyEntry.undo);
          if (!changed) {
            changed = void 0 === changed ? commandChanged : !!commandChanged;
          }
        }
      }
      return changed;
    }
  }

  function hasNativeInputFocus() {
    return (
      ('INPUT' == document.activeElement.tagName &&
        'checkbox' != document.activeElement.getAttribute('type')) ||
      ('IFRAME' == (document.activeElement.tagName || '').toUpperCase() &&
        'BODY' != document.activeElement.ownerDocument.activeElement.tagName)
    );
  }
  function clearRootBoundarySelection(editor) {
    var selection = window.getSelection();
    if (
      selection &&
      selection.isCollapsed &&
      !selection.anchorOffset &&
      selection.anchorNode == editor.writingArea
    ) {
      selection.removeAllRanges();
    }
  }
  UndoManager.prototype.register = function (
    historyEntry,
    suppressChangeCount,
    origin,
    preserveStack,
  ) {
    if (!this.undoManagerContext && historyEntry) {
      if (window.debugMode) {
        try {
          JSON.stringify(historyEntry);
        } catch (error) {
          alert('found error: ' + error);
          console.error(error);
        }
      }
      if (
        !(
          !historyEntry.cursorOnly &&
          this.index != this.commandStack.length - 1 &&
          historyEntry.undo.length <= 1 &&
          historyEntry.redo.length <= 1 &&
          DocumentNode.isType(
            (historyEntry.undo[0] || { type: 'cursor' }).type,
            'cursor',
            'fences-pos',
          ) &&
          DocumentNode.isType(
            (historyEntry.redo[0] || { type: 'cursor' }).type,
            'cursor',
            'fences-pos',
          )
        )
      ) {
        if (!('sync' === origin || preserveStack)) {
          this.commandStack.splice(this.index + 1);
          this.resizeIfNeeded();
          if (preserveStack) {
            completeHistoryEntry(this.commandStack[0]);
            this.commandStack.unshift(historyEntry);
          } else {
            completeHistoryEntry(this.commandStack.last());
            this.commandStack.push(historyEntry);
          }
          this.setIndex(this.commandStack.length - 1);
        }
        if (!(suppressChangeCount || historyEntry.cursorOnly)) {
          if ('sync' !== origin && 'restore' !== origin) {
            File.updateChangeCount(File.ChangeType.NSChangeDone);
          }
        }
        if ('undo' !== origin && 'input' !== origin) {
          this.editor.syncChange(historyEntry.redo);
        }
      }
    }
  };
  UndoManager.prototype.resizeIfNeeded = function () {
    var weightedHistorySize = 0,
      reloadWeight = File.inBusyMode ? 10 : 5;
    this.commandStack.forEach((item) => {
      weightedHistorySize += 'reload' == item.tag ? reloadWeight : 1;
    });
    if (weightedHistorySize > 160) {
      console.debug('[UndoManager] undo oversize');
      var retainedEntries = Math.floor(Math.min(160, this.commandStack.length) / 2);
      this.resize(retainedEntries);
      return true;
    }
    return false;
  };
  UndoManager.prototype.resize = function (retainedEntries) {
    console.debug(
      `[UndoManager] before resize undo stack to ${retainedEntries}, all: ${this.commandStack.length} at ${index}`,
    );
    if (!retainedEntries) {
      retainedEntries = Math.floor(80);
    }
    var index = this.index;
    retainedEntries += Math.max(0, this.commandStack.length - index);
    var removedEntries = Math.max(this.commandStack.length - retainedEntries, 0);
    if (this.commandStack.length > retainedEntries) {
      this.commandStack.splice(0, removedEntries);
      this.setIndex(index - removedEntries);
    }
    console.debug(
      `[UndoManager] after resize undo stack. all: ${this.commandStack.length} at ${this.index}`,
    );
  };
  UndoManager.prototype.lastRegisteredOperationCommand = function () {
    if (this.commandStack.length == this.index + 1) {
      return this.commandStack[this.index];
    } else {
      return null;
    }
  };
  UndoManager.prototype.removeLastRegisteredOperationCommand = function () {
    if (this.commandStack.length == this.index + 1) {
      this.commandStack.pop();
      this.setIndex(this.index - 1);
    }
  };
  UndoManager.prototype.undoLastDiscardable = function () {
    if (!this.editor.sourceView.inSourceMode && !File.isLocked) {
      this.endSnap(true);
      if (
        'INPUT' == document.activeElement.tagName &&
        'checkbox' != document.activeElement.getAttribute('type')
      ) {
        return true;
      }
      var historyEntry = this.commandStack[this.index];
      if (historyEntry && historyEntry.discardable) {
        this.undo();
      }
    }
  };
  UndoManager.prototype.undo = function (event) {
    if (!File.isFileLoading()) {
      this.editor.selection.clearGlobalColumn();
      if (this.editor.sourceView.inSourceMode) {
        this.editor.sourceView.cm.undo();
        this.editor.sourceView.cm.scrollIntoView();
        return event && event.preventDefault();
      }
      this.endSnap(true);
      if (hasNativeInputFocus()) {
        if (File.isNode) {
          JSBridge.invoke('webContents.undo');
          if (event) {
            event.preventDefault();
          }
          return false;
        }
      } else {
        if (this.editor.mathBlock.currentCm) {
          this.editor.mathBlock.tryAddTagUndo(void 0, $(document.activeElement));
        } else {
          if (document.activeElement.classList.contains('marklyra-cm-lang-input')) {
            this.editor.fences.tryAddLangUndo();
          }
        }
      }
      if (event) {
        event.preventDefault();
      }
      var historyEntry = this.commandStack[this.index];
      if (historyEntry) {
        this.editor.brush.pause();
        var changed = this.callCommand(historyEntry, true);
        this.setIndex(this.index - 1);
        if (!historyEntry.cursorOnly) {
          File.updateChangeCount(File.ChangeType.NSChangeUndone);
        }
        if (void 0 === changed) {
          this.undo();
          return void this.editor.brush.resume();
        }
        if (changed) {
          this.editor.wordCount.quickUpdate(null, true, true);
        }
        this.editor.refocus(void 0, null, null, true, true);
        this.editor.syncChange(historyEntry.undo.clone().reverse());
        if (changed) {
          this.editor.brush.clearAndPause();
          this.editor.quickRefresh();
          clearRootBoundarySelection(this.editor);
          $(this.editor.sessionStr).trigger('cursorChange');
        }
        this.editor.selection.scrollAdjust();
        this.editor.brush.resume(true);
        window.Reporter.fullValidate();
      }
    }
  };
  UndoManager.prototype.redo = function (event) {
    if (!File.isFileLoading()) {
      this.editor.selection.clearGlobalColumn();
      if (this.editor.sourceView.inSourceMode) {
        this.editor.sourceView.cm.redo();
        this.editor.sourceView.cm.scrollIntoView();
        return event && event.preventDefault();
      }
      if (hasNativeInputFocus()) {
        if (File.isNode) {
          JSBridge.invoke('webContents.redo');
          if (event) {
            event.preventDefault();
          }
          return false;
        }
      } else {
        if (this.editor.mathBlock.currentCm) {
          if (this.editor.mathBlock.tryAddTagUndo(void 0, $(document.activeElement))) {
            return false;
          }
        } else {
          if (
            document.activeElement.classList.contains('marklyra-cm-lang-input') &&
            this.editor.fences.tryAddLangUndo(void 0, document.activeElement)
          ) {
            return false;
          }
        }
      }
      if (event) {
        event.preventDefault();
      }
      var historyEntry = this.commandStack[this.index + 1];
      if (historyEntry) {
        this.editor.brush.pause();
        var changed = this.callCommand(historyEntry, false);
        this.setIndex(this.index + 1);
        if (!historyEntry.cursorOnly) {
          File.updateChangeCount(File.ChangeType.NSChangeRedone);
        }
        if (void 0 === changed) {
          this.redo();
          return void this.editor.brush.resume();
        }
        if (changed) {
          this.editor.wordCount.quickUpdate(null, true, true);
        }
        this.editor.refocus(void 0, null, null, true, true);
        this.editor.syncChange(historyEntry.redo);
        if (changed) {
          this.editor.brush.clearAndPause();
          this.editor.quickRefresh();
          clearRootBoundarySelection(this.editor);
          $(this.editor.sessionStr).trigger('cursorChange');
        }
        this.editor.selection.scrollAdjust();
        this.editor.brush.resume(true);
        window.Reporter.fullValidate();
      }
    }
  };
  UndoManager.prototype.hasUndo = function () {
    return -1 !== this.index;
  };
  UndoManager.prototype.hasRedo = function () {
    return this.index < this.commandStack.length - 1;
  };
  UndoManager.prototype.exeCommand = function (command, relatedCommands, deferRefresh) {
    var element,
      codeMirror,
      documentNode,
      editor = this.editor,
      needsRefresh = false,
      inSourceMode = editor.sourceView.inSourceMode;
    function restoreInsertedNodes(insertedNodes, items) {
      items = items || [];
      insertedNodes = insertedNodes || editor.nodeMap;
      command.json.map(function (item) {
        items.push(DocumentNode.readFromJson(item, insertedNodes, true));
      });
      command.json.map(function (item) {
        var currentDocumentNode = editor.getNode(item.id);
        currentDocumentNode.set('before', editor.getNode(item.relation.before_id));
        currentDocumentNode.set('after', editor.getNode(item.relation.after_id));
        currentDocumentNode.set('parent', editor.getNode(item.relation.parent_id));
      });
    }
    if (!command) {
      return false;
    }
    switch (command.type) {
      case 'initSrc':
        if (inSourceMode) {
          return false;
        }
        editor.brush.queue = [];
        needsRefresh = false;
        File.reloadContent(command.src, {
          skipUndo: true,
          delayRefresh: true,
          fromDiskChange: true,
          skipChangeCount: true,
          onInit: true,
        });
        break;
      case 'reload':
        if (inSourceMode) {
          return false;
        }
        editor.nodeMap.reset(editor);
        restoreInsertedNodes();
        editor.brush.queue = [];
        needsRefresh = true;
        $(editor.sessionStr).html(documentModel.NodeCollectionUtils.toHTML(editor.nodeMap.blocks));
        editor.focusCid = null;
        editor.lastCursor = null;
        window.getSelection().removeAllRanges();
        File.bundle.fileEncode = command.encode;
        break;
      case 'replace':
        if (inSourceMode) {
          return false;
        }
        if (!(documentNode = editor.getNode(command.id))) {
          return console.error(command.id + ' not found in  replace');
        }
        if (documentNode.get('type') == NodeType.fences) {
          editor.fences.beforeDeleteFences(documentNode, relatedCommands);
        }
        if (documentNode.get('type') == NodeType.math_block) {
          editor.mathBlock.beforeDeleteFences(documentNode);
        }
        if (documentNode.get('type') == NodeType.html_block) {
          editor.htmlBlock.beforeDeleteFences(documentNode);
        }
        if (command.id != command.json.id) {
          editor.getNode(command.id).remove();
          documentNode = DocumentNode.readFromJson(command.json, editor.nodeMap);
        } else {
          documentNode.readFromJson(command.json, editor.nodeMap);
        }
        editor
          .findElemById(command.id)
          .replaceWith(editor.MarkParser.renderHtmlWithBlockMeta(documentNode, editor.brush));
        if (!File.inBusyMode) {
          editor.writingArea.setAttribute('contenteditable', 'true');
        }
        needsRefresh = true;
        editor.brush.restart();
        if (!deferRefresh) {
          editor.brush.addToQueue(documentNode.id, true);
          editor.wordCount.quickUpdate(documentNode, false, true);
        }
        break;
      case 'insert':
        if (inSourceMode) {
          return false;
        }
        var documentMap = editor.nodeMap,
          currentInsertedNodes = new Array(),
          anchorElement = [];
        restoreInsertedNodes(documentMap, currentInsertedNodes);
        if (command.after) {
          (anchorElement = editor.findElemById(command.after)).before(
            documentModel.NodeCollectionUtils.toHTML(currentInsertedNodes, { mathCount: 0 }),
          );
        }
        if (!anchorElement.length && command.before) {
          (anchorElement = editor.findElemById(command.before)).after(
            documentModel.NodeCollectionUtils.toHTML(currentInsertedNodes, { mathCount: 0 }),
          );
        }
        if (!anchorElement.length) {
          var parentNode = currentInsertedNodes[0].get('parent');
          if (parentNode) {
            editor.findElemById(parentNode.id).replaceWith(parentNode.toHTML());
          } else {
            if (0 === $(editor.sessionStr).children().length) {
              $(editor.sessionStr).html(
                documentModel.NodeCollectionUtils.toHTML(currentInsertedNodes, {
                  mathCount: 0,
                }),
              );
              editor.focusCid = null;
              editor.lastCursor = null;
            }
          }
        }
        needsRefresh = true;
        break;
      case 'remove':
        if (inSourceMode) {
          return false;
        }
        command.idArray.map(function (nodeId) {
          var currentDocumentNode = editor.getNode(nodeId);
          if (DocumentNode.isType(currentDocumentNode, NodeType.fences)) {
            editor.fences.beforeDeleteFences(currentDocumentNode, relatedCommands);
          }
          if (DocumentNode.isType(currentDocumentNode, NodeType.math_block)) {
            editor.mathBlock.beforeDeleteFences(currentDocumentNode);
          }
          if (DocumentNode.isType(currentDocumentNode, NodeType.html_block)) {
            editor.htmlBlock.beforeDeleteFences(currentDocumentNode);
          }
          var listItemElement = (element = editor.findElemById(nodeId)).parent('li');
          if (listItemElement.length) {
            listItemElement.css('margin', '0.1px');
          }
          element.remove();
          if (listItemElement.length) {
            listItemElement.css('margin', '');
          }
          if (currentDocumentNode) {
            currentDocumentNode.remove();
          }
        });
        needsRefresh = true;
        break;
      case 'text':
        if (inSourceMode) {
          return false;
        }
        element = editor.findElemById(command.id);
        editor.getNode(command.id).set('text', command.text);
        if (command.html) {
          element.html(command.html);
        }
        needsRefresh = false;
        if (!('def-footnote' != element.attr('mdtype') && 'def-link' != element.attr('mdtype'))) {
          needsRefresh = true;
        }
        if (!deferRefresh) {
          editor.brush.addToQueue(command.id, true);
        }
        break;
      case 'deleteMedia':
        editor.imgEdit.deleteMedia(command.from, false);
        break;
      case 'restoreMedia':
        editor.imgEdit.restoreMedia(command.from, command.to);
        break;
      case 'cursor':
        if (deferRefresh) {
          return false;
        }
        try {
          if (inSourceMode) {
            return void (command.inSourceMode && editor.sourceView.cm.setCursor(command.pos));
          }
          if (command.inSourceMode) {
            return;
          }
          if (void 0 == command.end) {
            command.end = command.start;
          }
          if (void 0 == command.startId && void 0 == command.id) {
            command.id = command.cid;
          }
          if (command.focus) {
            setTimeout(function () {
              editor.findElemById(command.id).children('[tabindex]').addBack('[tabindex]').focus();
            }, 100);
            editor.findElemById(command.id).children('[tabindex]').addBack('[tabindex]').focus();
            return false;
          }
          if (command.id || command.startId == command.endId) {
            command.id = command.id || command.startId;
            (element = editor.findElemById(command.id)).addClass('md-focus');
            if (
              DocumentNode.isType(
                element.attr('mdtype'),
                NodeType.fences,
                NodeType.math_block,
                NodeType.html_block,
              )
            ) {
              var fenceCodeMirror;
              if (element.attr('mdtype') == NodeType.fences) {
                editor.fences.refreshEditor();
                (fenceCodeMirror = editor.fences.getCm(command.id)).focus();
              } else {
                if (element.attr('mdtype') == NodeType.math_block) {
                  fenceCodeMirror = editor.mathBlock.startEditing(element);
                } else {
                  if (element.attr('mdtype') == NodeType.html_block) {
                    fenceCodeMirror = editor.htmlBlock.startEditing(element);
                  }
                }
              }
              if (!fenceCodeMirror) {
                return;
              }
              if (command.selections && command.selections.length) {
                fenceCodeMirror.setSelection(
                  command.selections[0].head,
                  command.selections[0].anchor,
                );
              } else {
                if (command.pos) {
                  fenceCodeMirror.setCursor(command.pos);
                  if (command.selections) {
                    fenceCodeMirror.setSelections(command.selections);
                  }
                } else {
                  if (command.start > -1) {
                    fenceCodeMirror.setCursor(fenceCodeMirror.posFromIndex(command.start));
                    if (command.end > -1) {
                      fenceCodeMirror.setSelection(
                        fenceCodeMirror.posFromIndex(command.start),
                        fenceCodeMirror.posFromIndex(command.end),
                      );
                    }
                  } else {
                    editor.selection.jumpIntoElemEnd(element);
                  }
                }
              }
            } else {
              if (element.length && void 0 !== command.end) {
                var length = element.text().length;
                if (command.start > length) {
                  command.start = length;
                }
                if (command.end > length) {
                  command.end = length;
                }
                editor.selection.restoreSelection(element[0], {
                  start: command.start,
                  end: command.end,
                });
              } else {
                window.getSelection().removeAllRanges();
              }
            }
            if (!relatedCommands) {
              editor.refocus(command.id);
            }
          } else {
            if (command.startId) {
              if (File.inBusyMode && !File.isLocked) {
                editor.writingArea.setAttribute('contenteditable', 'true');
              }
              try {
                var selectionRange = editor.selection.restoreEdge(
                  editor.findElemById(command.startId),
                  command.start,
                );
                selectionRange = editor.selection.restoreEdge(
                  editor.findElemById(command.endId),
                  command.end,
                  true,
                  selectionRange,
                );
                editor.selection.fixSafariRange(selectionRange);
                editor.selection.setRange(selectionRange);
                editor.refocus();
              } catch (error) {
                console.log(error.stack);
              }
            }
          }
          if (File.isTypeWriterMode) {
            editor.selection.scrollAdjust();
          }
          needsRefresh = false;
        } catch (currentError) {
          console.warn(currentError.stack);
        }
        break;
      case 'fences':
        if (inSourceMode) {
          return false;
        }
        documentNode = editor.getNode(command.id);
        if (DocumentNode.isType(documentNode, NodeType.math_block)) {
          editor.mathBlock.startEditing(command.id);
          codeMirror = editor.mathBlock.currentCm;
        } else {
          if (DocumentNode.isType(documentNode, NodeType.html_block)) {
            editor.htmlBlock.startEditing(command.id);
            codeMirror = editor.htmlBlock.currentCm;
          } else {
            codeMirror = editor.fences.getCm(command.id);
          }
        }
        if (codeMirror) {
          codeMirror.focus();
          if (command.change) {
            editor.searchPanel.closePanel(true);
            codeMirror.doc.makeChange(command.change);
          }
        } else {
          if (hostGlobal.debugMode) {
            console.error('cm is null');
            window.alert('error');
          }
        }
        needsRefresh = false;
        break;
      case 'fences-pos':
        if (inSourceMode || deferRefresh) {
          return false;
        }
        documentNode = editor.getNode(command.id);
        if (DocumentNode.isType(documentNode, NodeType.math_block)) {
          editor.mathBlock.startEditing(command.id);
          codeMirror = editor.mathBlock.currentCm;
        } else {
          if (DocumentNode.isType(documentNode, NodeType.html_block)) {
            editor.htmlBlock.startEditing(command.id);
            codeMirror = editor.htmlBlock.currentCm;
          } else {
            editor.fences.refreshEditor();
            codeMirror = editor.fences.getCm(command.id);
          }
        }
        if (codeMirror) {
          codeMirror.focus();
          codeMirror.setCursor(command.pos);
          needsRefresh = false;
        }
        break;
      case 'attr':
        if (inSourceMode) {
          return false;
        }
        command.value = command.value;
        (documentNode = this.editor.getNode(command.id)).attr(
          command.key,
          command.value,
          this.editor,
          true,
        );
        if (!deferRefresh) {
          editor.brush.addToQueue(command.id, true);
        }
        break;
      case 'wrap':
        if (inSourceMode) {
          return false;
        }
        var insertCommand = { type: 'insert' };
        insertCommand.json = [command.json];
        command.json.children.map(function (item, itemIndex) {
          var currentDocumentNode = editor.getNode(item.id);
          if (0 === itemIndex) {
            insertCommand.before = currentDocumentNode.get('before')
              ? currentDocumentNode.get('before').id
              : null;
          } else {
            if (itemIndex === command.json.children.length - 1) {
              insertCommand.after = currentDocumentNode.get('after')
                ? currentDocumentNode.get('after').id
                : null;
            }
          }
          if (currentDocumentNode) {
            if (currentDocumentNode.get('type') == NodeType.fences) {
              needsRefresh = true;
              editor.fences.beforeDeleteFences(currentDocumentNode, relatedCommands);
            }
            if (currentDocumentNode.get('type') == NodeType.math_block) {
              needsRefresh = true;
              editor.mathBlock.beforeDeleteFences(currentDocumentNode);
            }
            currentDocumentNode.remove();
            editor.findElemById(item.id).remove();
          }
        });
        this.exeCommand(insertCommand, relatedCommands);
        break;
      case 'unwrap':
        if (inSourceMode) {
          return false;
        }
        var unwrappedNodes = (documentNode = editor.getNode(command.id)).unwrap();
        if (!command.skipHTML) {
          editor
            .findElemById(command.id)
            .replaceWith(
              documentModel.NodeCollectionUtils.toHTML(unwrappedNodes, { mathCount: 0 }),
            );
        }
        needsRefresh = true;
        break;
      case 'scroll':
        if (inSourceMode || deferRefresh) {
          return false;
        }
        editor.selection.scrollAdjust(
          command.id ? editor.findElemById(command.id) : void 0,
          command.marginTop,
        );
        break;
      case 'sync':
        if (!deferRefresh) {
          return false;
        }
        if (void 0 !== command.html) {
          editor
            .findElemById(command.id)
            .html(command.html)
            .find('.md-expand, .md-focus')
            .removeClass('md-expand md-focus');
        } else {
          if (void 0 !== command.allHtml) {
            editor.nodeMap.reset();
            restoreInsertedNodes();
            $('#write').html(command.allHtml);
          } else {
            if (void 0 !== command.cmChanges) {
              codeMirror = editor.fences.getCm(command.id);
              command.cmChanges.forEach(function (item) {
                codeMirror.replaceRange(item.text, item.from, item.to);
              });
            } else {
              if (void 0 !== command.tex) {
                (documentNode = editor.getNode(command.id)).set('text', command.tex);
                editor.findElemById(command.id).replaceWith(documentNode.toHTML());
                return true;
              }
              if (void 0 !== command.srcChanges) {
                if (inSourceMode) {
                  command.srcChanges.forEach(function (item) {
                    editor.sourceView.cm.replaceRange(item.text, item.from, item.to);
                  });
                }
              } else {
                if (void 0 !== command.content) {
                  if (inSourceMode && !command.fromSourceMode) {
                    var top = editor.sourceView.cm.getScrollInfo().top;
                    editor.sourceView.cm.setValue(command.content, 'sync');
                    editor.sourceView.cm.scrollTo(0, top);
                  }
                  if (!inSourceMode && command.fromSourceMode) {
                    editor.nodeMap.reset();
                    editor.reset(command.content);
                  }
                }
              }
            }
          }
        }
      case 'option':
        if ('finalNewline' == command.option) {
          File.finalNewline = command.value;
          File.freshMenuWithDelay();
        }
      default:
        return false;
    }
    return needsRefresh;
  };
  var timerId = null;
  UndoManager.prototype.clearEventTimer = function () {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = null;
  };
  UndoManager.prototype.buildSnap = function (nodeId, snapshotAction, contentOverrideMarker) {
    var selectionSnapshot = this.editor.selection.buildUndo(void 0, void 0, true),
      documentNode = this.editor.getNode(nodeId);
    if (documentNode) {
      if (void 0 !== contentOverrideMarker && null !== contentOverrideMarker) {
        documentNode.set('text', content);
      } else {
        if (snapshotAction) {
          this.editor.store(nodeId, true);
        }
      }
      return new (function (nodeId, snapshotAction, inputContent, selection, snapshotDate) {
        this.id = nodeId;
        this.type = snapshotAction || 0;
        this.content = inputContent;
        this.selection = selection;
        this.snapDate = snapshotDate || new Date();
      })(nodeId, snapshotAction, documentNode.storeToJson(), selectionSnapshot);
    } else {
      return null;
    }
  };
  var pendingCursorCommand,
    snapshotToCommands = function (snapshot, reverseOrder) {
      if (!snapshot) {
        return [];
      }
      var snapshotCommands = [
        { type: 'replace', id: snapshot.id, json: snapshot.content },
        snapshot.selection,
      ];
      if (reverseOrder) {
        snapshotCommands.reverse();
      }
      return snapshotCommands;
    };
  UndoManager.prototype.prepCursorSnap = function (selectionRange) {
    (pendingCursorCommand = UndoManager.makeEmptyCommand()).undo.push(
      this.editor.selection.buildUndo(selectionRange),
    );
  };
  var completeHistoryEntry = function (historyEntry) {
    if (historyEntry) {
      historyEntry.incomplete = null;
      historyEntry.date = null;
      historyEntry.source = null;
    }
  };
  UndoManager.prototype.endSnap = function (discardPendingCursor) {
    if (discardPendingCursor) {
      pendingCursorCommand = null;
    }
    if (pendingCursorCommand) {
      pendingCursorCommand.redo.push(this.editor.selection.buildUndo());
      this.register(pendingCursorCommand);
      return void (pendingCursorCommand = null);
    }
    completeHistoryEntry(this.lastRegisteredOperationCommand());
  };
  UndoManager.prototype.addSnap = function (nodeId, snapshotAction) {
    var previousEntry = this.lastRegisteredOperationCommand();
    if (
      previousEntry &&
      snapshotAction != SnapshotAction.REPLACE &&
      previousEntry.source === nodeId + '#' + snapshotAction &&
      new Date() - previousEntry.date < 3e3
    ) {
      this.lastUndo = this.buildSnap(nodeId, snapshotAction);
      if (
        this.lastUndo &&
        (function (undoCommands, nodeId) {
          return !(
            undoCommands &&
            0 != undoCommands.length &&
            (2 != undoCommands.length ||
              !undoCommands[0] ||
              'replace' != undoCommands[0].type ||
              undoCommands[0].id != nodeId ||
              (undoCommands[1] && 'cursor' != undoCommands[1].type))
          );
        })(previousEntry.redo, nodeId)
      ) {
        return void (previousEntry.redo = snapshotToCommands(this.lastUndo));
      }
      previousEntry.date = 0;
    }
    if (0 != snapshotAction) {
      var snapshotCommand = UndoManager.makeEmptyCommand();
      if (this.lastUndo) {
        snapshotCommand.undo = snapshotToCommands(this.lastUndo, true);
      } else {
        snapshotCommand.undo.push(this.editor.selection.buildUndo());
        var previousNodeSnapshot = UndoManager.buildReplaceUndo(
          this.editor.getNode(nodeId),
          null,
          true,
        );
        if (previousNodeSnapshot) {
          snapshotCommand.undo.push(previousNodeSnapshot);
        }
      }
      this.lastUndo = this.buildSnap(nodeId, snapshotAction);
      if (this.lastUndo) {
        snapshotCommand.redo = snapshotToCommands(this.lastUndo);
        snapshotCommand.source = nodeId + '#' + snapshotAction;
        snapshotCommand.date = this.lastUndo.snapDate;
      }
      this.register(snapshotCommand);
    } else {
      this.lastUndo = this.buildSnap(nodeId, snapshotAction);
    }
  };
  UndoManager.prototype.buildReplaceUndo = function (node) {
    return UndoManager.buildReplaceUndo(node);
  };
  UndoManager.buildReplaceUndo = function (node, idOverride, allowMissing) {
    if (node) {
      return { type: 'replace', id: idOverride || node.id, json: node.storeToJson() };
    }
    if (!allowMissing) {
      throw new Error('empty node');
    }
  };
  UndoManager.buildAttrUndo = function (node, key) {
    return { type: 'attr', id: node.id, key: key, value: node.get(key) };
  };
  UndoManager.addUndoForInsert = function (
    historyEntry,
    documentNode,
    previousSibling,
    nextSibling,
  ) {
    if (documentNode) {
      historyEntry.redo.push({
        type: 'insert',
        after: nextSibling
          ? nextSibling.id
          : documentNode.get('after')
            ? documentNode.get('after').id
            : null,
        before: previousSibling
          ? previousSibling.id
          : documentNode.get('before')
            ? documentNode.get('before').id
            : null,
        json: [documentNode.storeToJson()],
      });
      historyEntry.undo.push({ type: 'remove', idArray: [documentNode.id] });
      return historyEntry;
    } else {
      return historyEntry;
    }
  };
  UndoManager.addUndoForWrap = function (historyEntry, wrapperNode, skipHTML) {
    if (wrapperNode) {
      historyEntry.redo.push({
        type: 'wrap',
        json: wrapperNode.storeToJson(),
        skipHTML: skipHTML,
      });
      historyEntry.undo.push({ type: 'unwrap', id: wrapperNode.id, skipHTML: skipHTML });
    }
  };
  UndoManager.addUndoForUnwrap = function (historyEntry, wrapperNode) {
    if (wrapperNode) {
      historyEntry.undo.push({ type: 'wrap', json: wrapperNode.storeToJson() });
      historyEntry.redo.push({ type: 'unwrap', id: wrapperNode.id });
    }
  };
  UndoManager.buildAllDoc = function (documentMap, reloadFromDisk) {
    var documentNode = documentMap.blocks.at(0),
      json = [];
    if (documentNode) {
      for (documentNode = documentNode.getFirstBrother(); documentNode; ) {
        json.push(documentNode.storeToJson());
        documentNode = documentNode.get('after');
      }
    }
    return {
      type: 'reload',
      json: json,
      reloadFromDisk: reloadFromDisk,
      encode: File.bundle.fileEncode,
    };
  };
  UndoManager.addUndoForInsertArray = function (historyEntry, nodes, previousSibling, nextSibling) {
    if (nodes && 0 != nodes.length) {
      historyEntry.redo.push({
        type: 'insert',
        after: nextSibling
          ? nextSibling.id
          : nodes[nodes.length - 1].get('after')
            ? nodes[nodes.length - 1].get('after').id
            : null,
        before: previousSibling
          ? previousSibling.id
          : nodes[0].get('before')
            ? nodes[0].get('before').id
            : null,
        json: nodes.reduce(function (items, node) {
          items.push(node.storeToJson());
          return items;
        }, []),
      });
      historyEntry.undo.push({
        type: 'remove',
        idArray: nodes.reduce(function (items, node) {
          items.push(node.id);
          return items;
        }, []),
      });
      return historyEntry;
    } else {
      return historyEntry;
    }
  };
  UndoManager.addUndoForRemoveArray = function (historyEntry, nodes, previousSibling, nextSibling) {
    if (nodes && 0 != nodes.length) {
      historyEntry.undo.push({
        type: 'insert',
        after: nextSibling
          ? nextSibling.id
          : nodes[nodes.length - 1].get('after')
            ? nodes[nodes.length - 1].get('after').id
            : null,
        before: previousSibling
          ? previousSibling.id
          : nodes[0].get('before')
            ? nodes[0].get('before').id
            : null,
        parent: nodes[0].get('parent') ? nodes[0].get('parent').id : null,
        json: nodes.reduce(function (items, node) {
          items.push(node.storeToJson());
          return items;
        }, []),
      });
      historyEntry.redo.push({
        type: 'remove',
        idArray: nodes.reduce(function (items, node) {
          items.push(node.id);
          return items;
        }, []),
      });
    }
  };
  UndoManager.addUndoForRemove = function (
    historyEntry,
    documentNode,
    previousSibling,
    nextSibling,
  ) {
    historyEntry.undo.push({
      type: 'insert',
      after: nextSibling
        ? nextSibling.id
        : documentNode.get('after')
          ? documentNode.get('after').id
          : null,
      before: previousSibling
        ? previousSibling.id
        : documentNode.get('before')
          ? documentNode.get('before').id
          : null,
      json: [documentNode.storeToJson()],
    });
    historyEntry.redo.push({ type: 'remove', idArray: [documentNode.id] });
  };
  UndoManager.makeEmptyCommand = function (selectionSnapshot) {
    var historyEntry = { undo: [], redo: [] };
    if (selectionSnapshot) {
      historyEntry.undo.push(selectionSnapshot);
    }
    return historyEntry;
  };
  UndoManager.isEmptyCommand = function (historyEntry) {
    return !(
      historyEntry &&
      historyEntry.undo &&
      historyEntry.redo &&
      (historyEntry.undo.length || historyEntry.redo.length)
    );
  };
  UndoManager.isEmptyOrUnchangedCommand = function (historyEntry) {
    return (
      !!UndoManager.isEmptyCommand(historyEntry) ||
      !(
        historyEntry.undo.find((item) => item && 'cursor' != item.type) ||
        historyEntry.redo.find((item) => item && 'cursor' != item.type)
      )
    );
  };
  UndoManager.append = function (destinationEntry, appendedEntry) {
    if (appendedEntry) {
      destinationEntry.undo = destinationEntry.undo.concat(appendedEntry.undo);
      destinationEntry.redo = destinationEntry.redo.concat(appendedEntry.redo);
    }
    return destinationEntry;
  };
  DocumentNode.storeToJson = function (documentNode) {
    var nodeSnapshot = { content: {}, relation: {} };
    nodeSnapshot.children = new Array();
    DocumentNode.property.map(function (item) {
      var attributeValue = documentNode.get(item);
      if (void 0 !== attributeValue && null !== attributeValue) {
        if (attributeValue instanceof Array) {
          nodeSnapshot.content[item] = $.merge([], attributeValue);
        } else {
          if (typeof attributeValue == Object) {
            nodeSnapshot.content[item] = $.extend({}, attributeValue);
          } else {
            nodeSnapshot.content[item] = attributeValue;
          }
        }
      }
    });
    nodeSnapshot.relation.before_id = documentNode.get('before')
      ? documentNode.get('before').id
      : null;
    nodeSnapshot.relation.after_id = documentNode.get('after')
      ? documentNode.get('after').id
      : null;
    nodeSnapshot.relation.parent_id = documentNode.get('parent')
      ? documentNode.get('parent').id
      : null;
    nodeSnapshot.is_top = !!documentNode.get('attachTo');
    documentNode.get('children').sortedForEach(function (childNode) {
      var childSnapshot = DocumentNode.storeToJson(childNode);
      nodeSnapshot.children.push(childSnapshot);
    });
    nodeSnapshot.id = documentNode.id;
    return nodeSnapshot;
  };
  DocumentNode.readFromJson = function (nodeSnapshot, documentMap, deferRelations) {
    var restoredNode =
      (function (nodeId) {
        var existingNode = documentMap.allNodes.get(nodeId);
        if (existingNode && !existingNode.attributes) {
          console.assert(null, 'node deleted');
          existingNode.attributes = {};
        }
        return existingNode;
      })(nodeSnapshot.id) || new DocumentNode({ id: nodeSnapshot.id });
    restoredNode.set('in', documentMap);
    if (nodeSnapshot.is_top) {
      restoredNode.set('attachTo', documentMap);
    }
    DocumentNode.property.map(function (item) {
      restoredNode.attributes[item] = void 0;
    });
    restoredNode.set(nodeSnapshot.content);
    restoredNode.clearChildren(true);
    if (!nodeSnapshot.relation.parent_id) {
      restoredNode.set('attachTo', documentMap);
    }
    nodeSnapshot.children.map(function (item) {
      DocumentNode.readFromJson(item, documentMap, true);
    });
    nodeSnapshot.children.map(function (item) {
      var childNode = documentMap.allNodes.get(item.id);
      childNode.set('before', documentMap.allNodes.get(item.relation.before_id));
      childNode.set('after', documentMap.allNodes.get(item.relation.after_id));
      childNode.set('parent', restoredNode);
    });
    if (!deferRelations) {
      restoredNode.set('before', documentMap.allNodes.get(nodeSnapshot.relation.before_id));
      restoredNode.set('after', documentMap.allNodes.get(nodeSnapshot.relation.after_id));
      restoredNode.set('parent', documentMap.allNodes.get(nodeSnapshot.relation.parent_id));
    }
    return restoredNode;
  };
  DocumentNode.prototype.storeToJson = function () {
    return DocumentNode.storeToJson(this);
  };
  DocumentNode.prototype.readFromJson = function (nodeSnapshot, documentMap) {
    this.clearChildren();
    var restoredNode = DocumentNode.readFromJson(nodeSnapshot, documentMap || this.get('in'));
    this.replaceWith(restoredNode);
  };
  UndoManager.SnapFlag = SnapshotAction;
  moduleRecord.exports = UndoManager;
}
