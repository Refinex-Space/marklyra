// editing/undo-manager.
// SystemJS module 1b. Dependencies: 11, 13.
$__System.registerDynamic(
  '1b',
  ['11', '13'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    var hostGlobal = this || self,
      documentModel = (requireModule('11'), requireModule('13')),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      SnapshotAction = { NONE: 0, ADD: 1, REPLACE: 2, DELETE: -1 };
    class l {
      constructor(editor) {
        (this.commandStack = []),
          (this.index = -1),
          (this.editor = editor),
          (this.UndoManager = l),
          (this.undoManagerContext = !1);
      }
      reset() {
        (this.commandStack = []),
          (this.index = -1),
          console.sendLog('[UndoManager] reset commandStack');
      }
      setIndex(historyIndex) {
        this.index = historyIndex;
      }
      restoreFromJson(snapshot) {
        this.setIndex(snapshot.index),
          (this.commandStack = JSON.parse(snapshot.commandStackJson)),
          console.sendLog(
            `[UndoManager] restoreFromJson all: ${this.commandStack.length} at: ${snapshot.index}`,
          );
      }
      storeToJson() {
        var commandStackJson;
        try {
          commandStackJson = JSON.stringify(this.commandStack);
        } catch (error) {
          console.sendError(error),
            this.resize(20),
            (commandStackJson = JSON.stringify(this.commandStack));
        }
        return { index: this.index, commandStackJson: commandStackJson };
      }
      callCommand(historyEntry, undo) {
        var changed, commandChanged;
        if (((this.lastUndo = null), undo))
          for (var itemIndex = (historyEntry.undo || []).length - 1; itemIndex > -1; itemIndex--)
            (commandChanged = this.exeCommand(historyEntry.undo[itemIndex], historyEntry.redo)),
              changed || (changed = void 0 === changed ? commandChanged : !!commandChanged);
        else
          for (itemIndex = 0; itemIndex < (historyEntry.redo || []).length; itemIndex++)
            (commandChanged = this.exeCommand(historyEntry.redo[itemIndex], historyEntry.undo)),
              changed || (changed = void 0 === changed ? commandChanged : !!commandChanged);
        return changed;
      }
    }
    function c() {
      return (
        ('INPUT' == document.activeElement.tagName &&
          'checkbox' != document.activeElement.getAttribute('type')) ||
        ('IFRAME' == (document.activeElement.tagName || '').toUpperCase() &&
          'BODY' != document.activeElement.ownerDocument.activeElement.tagName)
      );
    }
    function d(editor) {
      var selection = window.getSelection();
      selection &&
        selection.isCollapsed &&
        !selection.anchorOffset &&
        selection.anchorNode == editor.writingArea &&
        selection.removeAllRanges();
    }
    (l.prototype.register = function (historyEntry, suppressChangeCount, origin, preserveStack) {
      if (!this.undoManagerContext && historyEntry) {
        if (window.debugMode)
          try {
            JSON.stringify(historyEntry);
          } catch (error) {
            alert('found error: ' + error), console.error(error);
          }
        (!historyEntry.cursorOnly &&
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
          )) ||
          ('sync' === origin ||
            preserveStack ||
            (this.commandStack.splice(this.index + 1),
            this.resizeIfNeeded(),
            preserveStack
              ? (f(this.commandStack[0]), this.commandStack.unshift(historyEntry))
              : (f(this.commandStack.last()), this.commandStack.push(historyEntry)),
            this.setIndex(this.commandStack.length - 1)),
          suppressChangeCount ||
            historyEntry.cursorOnly ||
            ('sync' !== origin &&
              'restore' !== origin &&
              File.updateChangeCount(File.ChangeType.NSChangeDone)),
          'undo' !== origin && 'input' !== origin && this.editor.syncChange(historyEntry.redo));
      }
    }),
      (l.prototype.resizeIfNeeded = function () {
        var weightedHistorySize = 0,
          reloadWeight = File.inBusyMode ? 10 : 5;
        if (
          (this.commandStack.forEach((item) => {
            weightedHistorySize += 'reload' == item.tag ? reloadWeight : 1;
          }),
          weightedHistorySize > 160)
        ) {
          console.debug('[UndoManager] undo oversize');
          var retainedEntries = Math.floor(Math.min(160, this.commandStack.length) / 2);
          return this.resize(retainedEntries), !0;
        }
        return !1;
      }),
      (l.prototype.resize = function (retainedEntries) {
        console.debug(
          `[UndoManager] before resize undo stack to ${retainedEntries}, all: ${this.commandStack.length} at ${index}`,
        ),
          retainedEntries || (retainedEntries = Math.floor(80));
        var index = this.index;
        retainedEntries += Math.max(0, this.commandStack.length - index);
        var removedEntries = Math.max(this.commandStack.length - retainedEntries, 0);
        this.commandStack.length > retainedEntries &&
          (this.commandStack.splice(0, removedEntries), this.setIndex(index - removedEntries)),
          console.debug(
            `[UndoManager] after resize undo stack. all: ${this.commandStack.length} at ${this.index}`,
          );
      }),
      (l.prototype.lastRegisteredOperationCommand = function () {
        return this.commandStack.length == this.index + 1 ? this.commandStack[this.index] : null;
      }),
      (l.prototype.removeLastRegisteredOperationCommand = function () {
        this.commandStack.length == this.index + 1 &&
          (this.commandStack.pop(), this.setIndex(this.index - 1));
      }),
      (l.prototype.undoLastDiscardable = function () {
        if (!this.editor.sourceView.inSourceMode && !File.isLocked) {
          if (
            (this.endSnap(!0),
            'INPUT' == document.activeElement.tagName &&
              'checkbox' != document.activeElement.getAttribute('type'))
          )
            return !0;
          var historyEntry = this.commandStack[this.index];
          historyEntry && historyEntry.discardable && this.undo();
        }
      }),
      (l.prototype.undo = function (event) {
        if (!File.isFileLoading()) {
          if ((this.editor.selection.clearGlobalColumn(), this.editor.sourceView.inSourceMode))
            return (
              this.editor.sourceView.cm.undo(),
              this.editor.sourceView.cm.scrollIntoView(),
              event && event.preventDefault()
            );
          if ((this.endSnap(!0), c())) {
            if (File.isNode)
              return JSBridge.invoke('webContents.undo'), event && event.preventDefault(), !1;
          } else
            this.editor.mathBlock.currentCm
              ? this.editor.mathBlock.tryAddTagUndo(void 0, $(document.activeElement))
              : document.activeElement.classList.contains('marklyra-cm-lang-input') &&
                this.editor.fences.tryAddLangUndo();
          event && event.preventDefault();
          var historyEntry = this.commandStack[this.index];
          if (historyEntry) {
            this.editor.brush.pause();
            var changed = this.callCommand(historyEntry, !0);
            if (
              (this.setIndex(this.index - 1),
              historyEntry.cursorOnly || File.updateChangeCount(File.ChangeType.NSChangeUndone),
              void 0 === changed)
            )
              return this.undo(), void this.editor.brush.resume();
            changed && this.editor.wordCount.quickUpdate(null, !0, !0),
              this.editor.refocus(void 0, null, null, !0, !0),
              this.editor.syncChange(historyEntry.undo.clone().reverse()),
              changed &&
                (this.editor.brush.clearAndPause(),
                this.editor.quickRefresh(),
                d(this.editor),
                $(this.editor.sessionStr).trigger('cursorChange')),
              this.editor.selection.scrollAdjust(),
              this.editor.brush.resume(!0),
              window.Reporter.fullValidate();
          }
        }
      }),
      (l.prototype.redo = function (event) {
        if (!File.isFileLoading()) {
          if ((this.editor.selection.clearGlobalColumn(), this.editor.sourceView.inSourceMode))
            return (
              this.editor.sourceView.cm.redo(),
              this.editor.sourceView.cm.scrollIntoView(),
              event && event.preventDefault()
            );
          if (c()) {
            if (File.isNode)
              return JSBridge.invoke('webContents.redo'), event && event.preventDefault(), !1;
          } else if (this.editor.mathBlock.currentCm) {
            if (this.editor.mathBlock.tryAddTagUndo(void 0, $(document.activeElement))) return !1;
          } else if (
            document.activeElement.classList.contains('marklyra-cm-lang-input') &&
            this.editor.fences.tryAddLangUndo(void 0, document.activeElement)
          )
            return !1;
          event && event.preventDefault();
          var historyEntry = this.commandStack[this.index + 1];
          if (historyEntry) {
            this.editor.brush.pause();
            var changed = this.callCommand(historyEntry, !1);
            if (
              (this.setIndex(this.index + 1),
              historyEntry.cursorOnly || File.updateChangeCount(File.ChangeType.NSChangeRedone),
              void 0 === changed)
            )
              return this.redo(), void this.editor.brush.resume();
            changed && this.editor.wordCount.quickUpdate(null, !0, !0),
              this.editor.refocus(void 0, null, null, !0, !0),
              this.editor.syncChange(historyEntry.redo),
              changed &&
                (this.editor.brush.clearAndPause(),
                this.editor.quickRefresh(),
                d(this.editor),
                $(this.editor.sessionStr).trigger('cursorChange')),
              this.editor.selection.scrollAdjust(),
              this.editor.brush.resume(!0),
              window.Reporter.fullValidate();
          }
        }
      }),
      (l.prototype.hasUndo = function () {
        return -1 !== this.index;
      }),
      (l.prototype.hasRedo = function () {
        return this.index < this.commandStack.length - 1;
      }),
      (l.prototype.exeCommand = function (command, relatedCommands, deferRefresh) {
        var element,
          codeMirror,
          documentNode,
          editor = this.editor,
          needsRefresh = !1,
          inSourceMode = editor.sourceView.inSourceMode;
        function p(insertedNodes, items) {
          (items = items || []),
            (insertedNodes = insertedNodes || editor.nodeMap),
            command.json.map(function (item) {
              items.push(DocumentNode.readFromJson(item, insertedNodes, !0));
            }),
            command.json.map(function (item) {
              var currentDocumentNode = editor.getNode(item.id);
              currentDocumentNode.set('before', editor.getNode(item.relation.before_id)),
                currentDocumentNode.set('after', editor.getNode(item.relation.after_id)),
                currentDocumentNode.set('parent', editor.getNode(item.relation.parent_id));
            });
        }
        if (!command) return !1;
        switch (command.type) {
          case 'initSrc':
            if (inSourceMode) return !1;
            (editor.brush.queue = []),
              (needsRefresh = !1),
              File.reloadContent(command.src, {
                skipUndo: !0,
                delayRefresh: !0,
                fromDiskChange: !0,
                skipChangeCount: !0,
                onInit: !0,
              });
            break;
          case 'reload':
            if (inSourceMode) return !1;
            editor.nodeMap.reset(editor),
              p(),
              (editor.brush.queue = []),
              (needsRefresh = !0),
              $(editor.sessionStr).html(
                documentModel.NodeCollectionUtils.toHTML(editor.nodeMap.blocks),
              ),
              (editor.focusCid = null),
              (editor.lastCursor = null),
              window.getSelection().removeAllRanges(),
              (File.bundle.fileEncode = command.encode);
            break;
          case 'replace':
            if (inSourceMode) return !1;
            if (!(documentNode = editor.getNode(command.id)))
              return console.error(command.id + ' not found in  replace');
            documentNode.get('type') == NodeType.fences &&
              editor.fences.beforeDeleteFences(documentNode, relatedCommands),
              documentNode.get('type') == NodeType.math_block &&
                editor.mathBlock.beforeDeleteFences(documentNode),
              documentNode.get('type') == NodeType.html_block &&
                editor.htmlBlock.beforeDeleteFences(documentNode),
              command.id != command.json.id
                ? (editor.getNode(command.id).remove(),
                  (documentNode = DocumentNode.readFromJson(command.json, editor.nodeMap)))
                : documentNode.readFromJson(command.json, editor.nodeMap),
              editor
                .findElemById(command.id)
                .replaceWith(editor.MarkParser.renderHtmlWithBlockMeta(documentNode, editor.brush)),
              File.inBusyMode || editor.writingArea.setAttribute('contenteditable', 'true'),
              (needsRefresh = !0),
              editor.brush.restart(),
              deferRefresh ||
                (editor.brush.addToQueue(documentNode.id, !0),
                editor.wordCount.quickUpdate(documentNode, !1, !0));
            break;
          case 'insert':
            if (inSourceMode) return !1;
            var documentMap = editor.nodeMap,
              currentInsertedNodes = new Array(),
              anchorElement = [];
            if (
              (p(documentMap, currentInsertedNodes),
              command.after &&
                (anchorElement = editor.findElemById(command.after)).before(
                  documentModel.NodeCollectionUtils.toHTML(currentInsertedNodes, { mathCount: 0 }),
                ),
              !anchorElement.length &&
                command.before &&
                (anchorElement = editor.findElemById(command.before)).after(
                  documentModel.NodeCollectionUtils.toHTML(currentInsertedNodes, { mathCount: 0 }),
                ),
              !anchorElement.length)
            ) {
              var parentNode = currentInsertedNodes[0].get('parent');
              parentNode
                ? editor.findElemById(parentNode.id).replaceWith(parentNode.toHTML())
                : 0 === $(editor.sessionStr).children().length &&
                  ($(editor.sessionStr).html(
                    documentModel.NodeCollectionUtils.toHTML(currentInsertedNodes, {
                      mathCount: 0,
                    }),
                  ),
                  (editor.focusCid = null),
                  (editor.lastCursor = null));
            }
            needsRefresh = !0;
            break;
          case 'remove':
            if (inSourceMode) return !1;
            command.idArray.map(function (nodeId) {
              var currentDocumentNode = editor.getNode(nodeId);
              DocumentNode.isType(currentDocumentNode, NodeType.fences) &&
                editor.fences.beforeDeleteFences(currentDocumentNode, relatedCommands),
                DocumentNode.isType(currentDocumentNode, NodeType.math_block) &&
                  editor.mathBlock.beforeDeleteFences(currentDocumentNode),
                DocumentNode.isType(currentDocumentNode, NodeType.html_block) &&
                  editor.htmlBlock.beforeDeleteFences(currentDocumentNode);
              var listItemElement = (element = editor.findElemById(nodeId)).parent('li');
              listItemElement.length && listItemElement.css('margin', '0.1px'),
                element.remove(),
                listItemElement.length && listItemElement.css('margin', ''),
                currentDocumentNode && currentDocumentNode.remove();
            }),
              (needsRefresh = !0);
            break;
          case 'text':
            if (inSourceMode) return !1;
            (element = editor.findElemById(command.id)),
              editor.getNode(command.id).set('text', command.text),
              command.html && element.html(command.html),
              (needsRefresh = !1),
              ('def-footnote' != element.attr('mdtype') && 'def-link' != element.attr('mdtype')) ||
                (needsRefresh = !0),
              !deferRefresh && editor.brush.addToQueue(command.id, !0);
            break;
          case 'deleteMedia':
            editor.imgEdit.deleteMedia(command.from, !1);
            break;
          case 'restoreMedia':
            editor.imgEdit.restoreMedia(command.from, command.to);
            break;
          case 'cursor':
            if (deferRefresh) return !1;
            try {
              if (inSourceMode)
                return void (command.inSourceMode && editor.sourceView.cm.setCursor(command.pos));
              if (command.inSourceMode) return;
              if (
                (void 0 == command.end && (command.end = command.start),
                void 0 == command.startId && void 0 == command.id && (command.id = command.cid),
                command.focus)
              )
                return (
                  setTimeout(function () {
                    editor
                      .findElemById(command.id)
                      .children('[tabindex]')
                      .addBack('[tabindex]')
                      .focus();
                  }, 100),
                  editor
                    .findElemById(command.id)
                    .children('[tabindex]')
                    .addBack('[tabindex]')
                    .focus(),
                  !1
                );
              if (command.id || command.startId == command.endId) {
                if (
                  ((command.id = command.id || command.startId),
                  (element = editor.findElemById(command.id)).addClass('md-focus'),
                  DocumentNode.isType(
                    element.attr('mdtype'),
                    NodeType.fences,
                    NodeType.math_block,
                    NodeType.html_block,
                  ))
                ) {
                  var fenceCodeMirror;
                  if (
                    (element.attr('mdtype') == NodeType.fences
                      ? (editor.fences.refreshEditor(),
                        (fenceCodeMirror = editor.fences.getCm(command.id)).focus())
                      : element.attr('mdtype') == NodeType.math_block
                        ? (fenceCodeMirror = editor.mathBlock.startEditing(element))
                        : element.attr('mdtype') == NodeType.html_block &&
                          (fenceCodeMirror = editor.htmlBlock.startEditing(element)),
                    !fenceCodeMirror)
                  )
                    return;
                  command.selections && command.selections.length
                    ? fenceCodeMirror.setSelection(
                        command.selections[0].head,
                        command.selections[0].anchor,
                      )
                    : command.pos
                      ? (fenceCodeMirror.setCursor(command.pos),
                        command.selections && fenceCodeMirror.setSelections(command.selections))
                      : command.start > -1
                        ? (fenceCodeMirror.setCursor(fenceCodeMirror.posFromIndex(command.start)),
                          command.end > -1 &&
                            fenceCodeMirror.setSelection(
                              fenceCodeMirror.posFromIndex(command.start),
                              fenceCodeMirror.posFromIndex(command.end),
                            ))
                        : editor.selection.jumpIntoElemEnd(element);
                } else if (element.length && void 0 !== command.end) {
                  var length = element.text().length;
                  command.start > length && (command.start = length),
                    command.end > length && (command.end = length),
                    editor.selection.restoreSelection(element[0], {
                      start: command.start,
                      end: command.end,
                    });
                } else window.getSelection().removeAllRanges();
                relatedCommands || editor.refocus(command.id);
              } else if (command.startId) {
                File.inBusyMode &&
                  !File.isLocked &&
                  editor.writingArea.setAttribute('contenteditable', 'true');
                try {
                  var selectionRange = editor.selection.restoreEdge(
                    editor.findElemById(command.startId),
                    command.start,
                  );
                  (selectionRange = editor.selection.restoreEdge(
                    editor.findElemById(command.endId),
                    command.end,
                    !0,
                    selectionRange,
                  )),
                    editor.selection.fixSafariRange(selectionRange),
                    editor.selection.setRange(selectionRange),
                    editor.refocus();
                } catch (error) {
                  console.log(error.stack);
                }
              }
              File.isTypeWriterMode && editor.selection.scrollAdjust(), (needsRefresh = !1);
            } catch (currentError) {
              console.warn(currentError.stack);
            }
            break;
          case 'fences':
            if (inSourceMode) return !1;
            (documentNode = editor.getNode(command.id)),
              DocumentNode.isType(documentNode, NodeType.math_block)
                ? (editor.mathBlock.startEditing(command.id),
                  (codeMirror = editor.mathBlock.currentCm))
                : DocumentNode.isType(documentNode, NodeType.html_block)
                  ? (editor.htmlBlock.startEditing(command.id),
                    (codeMirror = editor.htmlBlock.currentCm))
                  : (codeMirror = editor.fences.getCm(command.id)),
              codeMirror
                ? (codeMirror.focus(),
                  command.change &&
                    (editor.searchPanel.closePanel(!0), codeMirror.doc.makeChange(command.change)))
                : hostGlobal.debugMode && (console.error('cm is null'), window.alert('error')),
              (needsRefresh = !1);
            break;
          case 'fences-pos':
            if (inSourceMode || deferRefresh) return !1;
            (documentNode = editor.getNode(command.id)),
              DocumentNode.isType(documentNode, NodeType.math_block)
                ? (editor.mathBlock.startEditing(command.id),
                  (codeMirror = editor.mathBlock.currentCm))
                : DocumentNode.isType(documentNode, NodeType.html_block)
                  ? (editor.htmlBlock.startEditing(command.id),
                    (codeMirror = editor.htmlBlock.currentCm))
                  : (editor.fences.refreshEditor(), (codeMirror = editor.fences.getCm(command.id))),
              codeMirror &&
                (codeMirror.focus(), codeMirror.setCursor(command.pos), (needsRefresh = !1));
            break;
          case 'attr':
            if (inSourceMode) return !1;
            (command.value = command.value),
              (documentNode = this.editor.getNode(command.id)).attr(
                command.key,
                command.value,
                this.editor,
                !0,
              ),
              !deferRefresh && editor.brush.addToQueue(command.id, !0);
            break;
          case 'wrap':
            if (inSourceMode) return !1;
            var insertCommand = { type: 'insert' };
            (insertCommand.json = [command.json]),
              command.json.children.map(function (item, itemIndex) {
                var currentDocumentNode = editor.getNode(item.id);
                0 === itemIndex
                  ? (insertCommand.before = currentDocumentNode.get('before')
                      ? currentDocumentNode.get('before').id
                      : null)
                  : itemIndex === command.json.children.length - 1 &&
                    (insertCommand.after = currentDocumentNode.get('after')
                      ? currentDocumentNode.get('after').id
                      : null),
                  currentDocumentNode &&
                    (currentDocumentNode.get('type') == NodeType.fences &&
                      ((needsRefresh = !0),
                      editor.fences.beforeDeleteFences(currentDocumentNode, relatedCommands)),
                    currentDocumentNode.get('type') == NodeType.math_block &&
                      ((needsRefresh = !0),
                      editor.mathBlock.beforeDeleteFences(currentDocumentNode)),
                    currentDocumentNode.remove(),
                    editor.findElemById(item.id).remove());
              }),
              this.exeCommand(insertCommand, relatedCommands);
            break;
          case 'unwrap':
            if (inSourceMode) return !1;
            var unwrappedNodes = (documentNode = editor.getNode(command.id)).unwrap();
            !command.skipHTML &&
              editor
                .findElemById(command.id)
                .replaceWith(
                  documentModel.NodeCollectionUtils.toHTML(unwrappedNodes, { mathCount: 0 }),
                ),
              (needsRefresh = !0);
            break;
          case 'scroll':
            if (inSourceMode || deferRefresh) return !1;
            editor.selection.scrollAdjust(
              command.id ? editor.findElemById(command.id) : void 0,
              command.marginTop,
            );
            break;
          case 'sync':
            if (!deferRefresh) return !1;
            if (void 0 !== command.html)
              editor
                .findElemById(command.id)
                .html(command.html)
                .find('.md-expand, .md-focus')
                .removeClass('md-expand md-focus');
            else if (void 0 !== command.allHtml)
              editor.nodeMap.reset(), p(), $('#write').html(command.allHtml);
            else if (void 0 !== command.cmChanges)
              (codeMirror = editor.fences.getCm(command.id)),
                command.cmChanges.forEach(function (item) {
                  codeMirror.replaceRange(item.text, item.from, item.to);
                });
            else {
              if (void 0 !== command.tex)
                return (
                  (documentNode = editor.getNode(command.id)).set('text', command.tex),
                  editor.findElemById(command.id).replaceWith(documentNode.toHTML()),
                  !0
                );
              if (void 0 !== command.srcChanges)
                inSourceMode &&
                  command.srcChanges.forEach(function (item) {
                    editor.sourceView.cm.replaceRange(item.text, item.from, item.to);
                  });
              else if (void 0 !== command.content) {
                if (inSourceMode && !command.fromSourceMode) {
                  var top = editor.sourceView.cm.getScrollInfo().top;
                  editor.sourceView.cm.setValue(command.content, 'sync'),
                    editor.sourceView.cm.scrollTo(0, top);
                }
                !inSourceMode &&
                  command.fromSourceMode &&
                  (editor.nodeMap.reset(), editor.reset(command.content));
              }
            }
          case 'option':
            'finalNewline' == command.option &&
              ((File.finalNewline = command.value), File.freshMenuWithDelay());
          default:
            return !1;
        }
        return needsRefresh;
      });
    var timerId = null;
    l.prototype.clearEventTimer = function () {
      timerId && clearTimeout(timerId), (timerId = null);
    };
    l.prototype.buildSnap = function (nodeId, snapshotAction, contentOverrideMarker) {
      var selectionSnapshot = this.editor.selection.buildUndo(void 0, void 0, !0),
        documentNode = this.editor.getNode(nodeId);
      return documentNode
        ? (void 0 !== contentOverrideMarker && null !== contentOverrideMarker
            ? documentNode.set('text', content)
            : snapshotAction && this.editor.store(nodeId, !0),
          new (function (nodeId, snapshotAction, inputContent, selection, snapshotDate) {
            (this.id = nodeId),
              (this.type = snapshotAction || 0),
              (this.content = inputContent),
              (this.selection = selection),
              (this.snapDate = snapshotDate || new Date());
          })(nodeId, snapshotAction, documentNode.storeToJson(), selectionSnapshot))
        : null;
    };
    var pendingCursorCommand,
      p = function (snapshot, reverseOrder) {
        if (!snapshot) return [];
        var snapshotCommands = [
          { type: 'replace', id: snapshot.id, json: snapshot.content },
          snapshot.selection,
        ];
        return reverseOrder && snapshotCommands.reverse(), snapshotCommands;
      };
    l.prototype.prepCursorSnap = function (selectionRange) {
      (pendingCursorCommand = l.makeEmptyCommand()).undo.push(
        this.editor.selection.buildUndo(selectionRange),
      );
    };
    var f = function (historyEntry) {
      historyEntry &&
        ((historyEntry.incomplete = null),
        (historyEntry.date = null),
        (historyEntry.source = null));
    };
    (l.prototype.endSnap = function (discardPendingCursor) {
      if ((discardPendingCursor && (pendingCursorCommand = null), pendingCursorCommand))
        return (
          pendingCursorCommand.redo.push(this.editor.selection.buildUndo()),
          this.register(pendingCursorCommand),
          void (pendingCursorCommand = null)
        );
      f(this.lastRegisteredOperationCommand());
    }),
      (l.prototype.addSnap = function (nodeId, snapshotAction) {
        var previousEntry = this.lastRegisteredOperationCommand();
        if (
          previousEntry &&
          snapshotAction != SnapshotAction.REPLACE &&
          previousEntry.source === nodeId + '#' + snapshotAction &&
          new Date() - previousEntry.date < 3e3
        ) {
          if (
            ((this.lastUndo = this.buildSnap(nodeId, snapshotAction)),
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
              })(previousEntry.redo, nodeId))
          )
            return void (previousEntry.redo = p(this.lastUndo));
          previousEntry.date = 0;
        }
        if (0 != snapshotAction) {
          var snapshotCommand = l.makeEmptyCommand();
          if (this.lastUndo) snapshotCommand.undo = p(this.lastUndo, !0);
          else {
            snapshotCommand.undo.push(this.editor.selection.buildUndo());
            var previousNodeSnapshot = l.buildReplaceUndo(this.editor.getNode(nodeId), null, !0);
            previousNodeSnapshot && snapshotCommand.undo.push(previousNodeSnapshot);
          }
          (this.lastUndo = this.buildSnap(nodeId, snapshotAction)),
            this.lastUndo &&
              ((snapshotCommand.redo = p(this.lastUndo)),
              (snapshotCommand.source = nodeId + '#' + snapshotAction),
              (snapshotCommand.date = this.lastUndo.snapDate)),
            this.register(snapshotCommand);
        } else this.lastUndo = this.buildSnap(nodeId, snapshotAction);
      }),
      (l.prototype.buildReplaceUndo = function (node) {
        return l.buildReplaceUndo(node);
      }),
      (l.buildReplaceUndo = function (node, idOverride, allowMissing) {
        if (node) return { type: 'replace', id: idOverride || node.id, json: node.storeToJson() };
        if (!allowMissing) throw new Error('empty node');
      }),
      (l.buildAttrUndo = function (node, key) {
        return { type: 'attr', id: node.id, key: key, value: node.get(key) };
      }),
      (l.addUndoForInsert = function (historyEntry, documentNode, previousSibling, nextSibling) {
        return documentNode
          ? (historyEntry.redo.push({
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
            }),
            historyEntry.undo.push({ type: 'remove', idArray: [documentNode.id] }),
            historyEntry)
          : historyEntry;
      }),
      (l.addUndoForWrap = function (historyEntry, wrapperNode, skipHTML) {
        wrapperNode &&
          (historyEntry.redo.push({
            type: 'wrap',
            json: wrapperNode.storeToJson(),
            skipHTML: skipHTML,
          }),
          historyEntry.undo.push({ type: 'unwrap', id: wrapperNode.id, skipHTML: skipHTML }));
      }),
      (l.addUndoForUnwrap = function (historyEntry, wrapperNode) {
        wrapperNode &&
          (historyEntry.undo.push({ type: 'wrap', json: wrapperNode.storeToJson() }),
          historyEntry.redo.push({ type: 'unwrap', id: wrapperNode.id }));
      }),
      (l.buildAllDoc = function (documentMap, reloadFromDisk) {
        var documentNode = documentMap.blocks.at(0),
          json = [];
        if (documentNode)
          for (documentNode = documentNode.getFirstBrother(); documentNode; )
            json.push(documentNode.storeToJson()), (documentNode = documentNode.get('after'));
        return {
          type: 'reload',
          json: json,
          reloadFromDisk: reloadFromDisk,
          encode: File.bundle.fileEncode,
        };
      }),
      (l.addUndoForInsertArray = function (historyEntry, nodes, previousSibling, nextSibling) {
        return nodes && 0 != nodes.length
          ? (historyEntry.redo.push({
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
                return items.push(node.storeToJson()), items;
              }, []),
            }),
            historyEntry.undo.push({
              type: 'remove',
              idArray: nodes.reduce(function (items, node) {
                return items.push(node.id), items;
              }, []),
            }),
            historyEntry)
          : historyEntry;
      }),
      (l.addUndoForRemoveArray = function (historyEntry, nodes, previousSibling, nextSibling) {
        nodes &&
          0 != nodes.length &&
          (historyEntry.undo.push({
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
              return items.push(node.storeToJson()), items;
            }, []),
          }),
          historyEntry.redo.push({
            type: 'remove',
            idArray: nodes.reduce(function (items, node) {
              return items.push(node.id), items;
            }, []),
          }));
      }),
      (l.addUndoForRemove = function (historyEntry, documentNode, previousSibling, nextSibling) {
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
        }),
          historyEntry.redo.push({ type: 'remove', idArray: [documentNode.id] });
      }),
      (l.makeEmptyCommand = function (selectionSnapshot) {
        var historyEntry = { undo: [], redo: [] };
        return selectionSnapshot && historyEntry.undo.push(selectionSnapshot), historyEntry;
      }),
      (l.isEmptyCommand = function (historyEntry) {
        return !(
          historyEntry &&
          historyEntry.undo &&
          historyEntry.redo &&
          (historyEntry.undo.length || historyEntry.redo.length)
        );
      }),
      (l.isEmptyOrUnchangedCommand = function (historyEntry) {
        return (
          !!l.isEmptyCommand(historyEntry) ||
          !(
            historyEntry.undo.find((item) => item && 'cursor' != item.type) ||
            historyEntry.redo.find((item) => item && 'cursor' != item.type)
          )
        );
      }),
      (l.append = function (destinationEntry, appendedEntry) {
        return (
          appendedEntry &&
            ((destinationEntry.undo = destinationEntry.undo.concat(appendedEntry.undo)),
            (destinationEntry.redo = destinationEntry.redo.concat(appendedEntry.redo))),
          destinationEntry
        );
      }),
      (DocumentNode.storeToJson = function (documentNode) {
        var nodeSnapshot = { content: {}, relation: {} };
        return (
          (nodeSnapshot.children = new Array()),
          DocumentNode.property.map(function (item) {
            var attributeValue = documentNode.get(item);
            void 0 !== attributeValue &&
              null !== attributeValue &&
              (attributeValue instanceof Array
                ? (nodeSnapshot.content[item] = $.merge([], attributeValue))
                : typeof attributeValue == Object
                  ? (nodeSnapshot.content[item] = $.extend({}, attributeValue))
                  : (nodeSnapshot.content[item] = attributeValue));
          }),
          (nodeSnapshot.relation.before_id = documentNode.get('before')
            ? documentNode.get('before').id
            : null),
          (nodeSnapshot.relation.after_id = documentNode.get('after')
            ? documentNode.get('after').id
            : null),
          (nodeSnapshot.relation.parent_id = documentNode.get('parent')
            ? documentNode.get('parent').id
            : null),
          (nodeSnapshot.is_top = !!documentNode.get('attachTo')),
          documentNode.get('children').sortedForEach(function (childNode) {
            var childSnapshot = DocumentNode.storeToJson(childNode);
            nodeSnapshot.children.push(childSnapshot);
          }),
          (nodeSnapshot.id = documentNode.id),
          nodeSnapshot
        );
      }),
      (DocumentNode.readFromJson = function (nodeSnapshot, documentMap, deferRelations) {
        var restoredNode =
          (function (nodeId) {
            var existingNode = documentMap.allNodes.get(nodeId);
            return (
              existingNode &&
                !existingNode.attributes &&
                (console.assert(null, 'node deleted'), (existingNode.attributes = {})),
              existingNode
            );
          })(nodeSnapshot.id) || new DocumentNode({ id: nodeSnapshot.id });
        return (
          restoredNode.set('in', documentMap),
          nodeSnapshot.is_top && restoredNode.set('attachTo', documentMap),
          DocumentNode.property.map(function (item) {
            restoredNode.attributes[item] = void 0;
          }),
          restoredNode.set(nodeSnapshot.content),
          restoredNode.clearChildren(!0),
          nodeSnapshot.relation.parent_id || restoredNode.set('attachTo', documentMap),
          nodeSnapshot.children.map(function (item) {
            DocumentNode.readFromJson(item, documentMap, !0);
          }),
          nodeSnapshot.children.map(function (item) {
            var childNode = documentMap.allNodes.get(item.id);
            childNode.set('before', documentMap.allNodes.get(item.relation.before_id)),
              childNode.set('after', documentMap.allNodes.get(item.relation.after_id)),
              childNode.set('parent', restoredNode);
          }),
          deferRelations ||
            (restoredNode.set('before', documentMap.allNodes.get(nodeSnapshot.relation.before_id)),
            restoredNode.set('after', documentMap.allNodes.get(nodeSnapshot.relation.after_id)),
            restoredNode.set('parent', documentMap.allNodes.get(nodeSnapshot.relation.parent_id))),
          restoredNode
        );
      }),
      (DocumentNode.prototype.storeToJson = function () {
        return DocumentNode.storeToJson(this);
      }),
      (DocumentNode.prototype.readFromJson = function (nodeSnapshot, documentMap) {
        this.clearChildren();
        var restoredNode = DocumentNode.readFromJson(nodeSnapshot, documentMap || this.get('in'));
        this.replaceWith(restoredNode);
      }),
      (l.SnapFlag = SnapshotAction),
      (moduleRecord.exports = l);
  },
);
