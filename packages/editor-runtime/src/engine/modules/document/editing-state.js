// document/editing-state.
export default function initializeDocumentEditingState(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery'),
    utilities = requireModule('shared/utilities'),
    documentModel = (requireModule('editing/undo-manager'), requireModule('model/document-model')),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    dialogs = (requireModule('host/environment'), requireModule('ui/dialogs')),
    mediaActions = (requireModule('editing/user-operations'), requireModule('media/actions')),
    htmlParser = requireModule('model/html-parser'),
    editingActions = {
      copy: function () {
        File.editor.UserOp.copyHandler(File.editor);
      },
      delete: function (targetElement) {
        targetElement = targetElement || document.activeElement;
        if (isInputComponent(targetElement)) {
          var element = document.activeElement.closest('.CodeMirror');
          if (element) {
            (element = element.CodeMirror).replaceSelection('', 'start');
          }
        } else {
          File.editor.UserOp.backspaceHandler(File.editor, null, 'Backspace');
        }
      },
      editActive: function (targetElement) {
        var currentEditor = File.editor;
        currentEditor.undo.prepCursorSnap();
        var element = targetElement
          ? jquery(targetElement).closest('[cid]')
          : currentEditor.findElemById(currentEditor.focusCid);
        if (DocumentNode.isType(element.attr('mdtype'), NodeType.html_block, NodeType.math_block)) {
          element.find('.md-rawblock-container').trigger('startedit');
        } else {
          if (DocumentNode.isType(element.attr('mdtype'), NodeType.fences)) {
            currentEditor.refocus(element.attr('cid'));
          }
        }
      },
      deleteActive: function (targetElement) {
        var markElement = File.editor.getMarkElem(targetElement),
          targetNode = File.editor.findNodeByElem(markElement);
        if (!targetNode && File.editor.focusCid) {
          targetNode = File.editor.getNode(File.editor.focusCid);
        }
        var deleteCommand = File.editor.UserOp.backToParagraph(editor, targetNode, true);
        File.editor.undo.register(deleteCommand);
      },
      cut: function () {
        if (File.isLocked) {
          return false;
        }
        File.editor.refocus(void 0, true);
        File.editor.UserOp.copyHandler(editor, null);
        File.editor.UserOp.backspaceHandler(editor, null, 'delSelection');
      },
      pasteAsPlainText: function () {
        jquery(File.editor.sessionStr).trigger('pasteAsPlainText');
      },
      lock: function () {
        File.isLocked = true;
        File.freshLock();
      },
      unlock: function () {
        File.isLocked = false;
        File.freshLock();
      },
      toggleSourceMode: function () {
        if (File.editor.sourceView.inSourceMode) {
          File.editor.sourceView.hide();
          File.editor.library.recoverSidebar();
        } else {
          File.editor.library.tmpHideSidebar();
          File.editor.sourceView.show();
        }
        File.freshMenuWithDelay();
      },
      freshLock: function (isLocked, skipMenuRefresh) {
        if (File.editor) {
          if (void 0 !== isLocked) {
            File.isLocked = isLocked;
          }
          jquery('content input, selector').prop('readOnly', File.isLocked || false);
          jquery('.CodeMirror').each(function () {
            if (this.CodeMirror) {
              this.CodeMirror.options.readOnly = File.isLocked || false;
            }
          });
          if (File.isLocked) {
            File.editor.tableEdit.unfocusAll();
            jquery('[contenteditable=true]')
              .attr('locked', 'true')
              .attr('contenteditable', 'false');
            jquery(File.editor.sessionStr).blur();
            jquery('.md-expand').removeClass('md-expand');
          } else {
            jquery("[locked='true']").attr('locked', 'false').attr('contenteditable', 'true');
          }
          jquery('#md-searchpanel input').prop('readOnly', false);
          if (!skipMenuRefresh) {
            File.freshMenu();
          }
          if (File.editor && File.editor.sourceView && File.editor.sourceView.inSourceMode) {
            File.editor.sourceView.cm.focus();
          }
        }
      },
      validateContentForSave: function () {
        return (
          !!(function () {
            try {
              if (File.editor.sourceView && File.editor.sourceView.inSourceMode) {
                return true;
              }
              var firstNode = File.editor.nodeMap.getFirst();
              if (!firstNode) {
                return false;
              }
              var headMatches = firstNode.cid == jquery('#write [cid]').first().attr('cid');
              if (
                !(headMatches =
                  headMatches && 1 == jquery("#write [cid='" + firstNode.cid + "']").length)
              ) {
                return false;
              }
              var lastNode = firstNode.getLastBrother(false, false, true).getVeryFirst(true);
              return (
                !!lastNode &&
                lastNode.cid == jquery('#write [cid]').last().attr('cid') &&
                1 == jquery("#write [cid='" + lastNode.cid + "']").length
              );
            } catch (error) {
              console.sendError(error);
            }
          })() ||
          (window.Reporter.record('doValidateContentForSave failed'),
          window.Reporter.buildExtraDebugInfo().then((extra) => {
            console.sendError(`detect data lost (${File.option.appVersion})`, 'error', {
              extra: extra,
            });
          }),
          false)
        );
      },
      tryRecoveryFromDom: function () {
        var currentHtml = jquery('#write').html(),
          setClipboard = File.editor.UserOp.setClipboard;
        setClipboard(currentHtml, void 0, void 0, true);
        var recoveredHtml = htmlParser.getMarkElemFromCurrentHtml(currentHtml, File.editor).html();
        File.editor.nodeMap.reset();
        var scrollOffset = jquery('content').scrollTop(),
          parsedBlocks = htmlParser.getBlocksFromMarkHtml(recoveredHtml, void 0, void 0, true),
          recoveredMarkdown =
            'string' == typeof parsedBlocks ? parsedBlocks : DocumentNode.markFromArr(parsedBlocks);
        File.editor.reset(recoveredMarkdown);
        setClipboard(void 0, void 0, recoveredMarkdown);
        File.editor.writingArea.focus();
        File.editor.undo.reset();
        if (File.changeCounter) {
          File.changeCounter.reset();
        }
        File.updateChangeCount(File.ChangeType.NSChangeReadOtherContents);
        jquery('content').scrollTop(scrollOffset);
        File._needsUpdateSnap = new Date();
        File.backupDocumentSnap();
        File.needSaveState = true;
        File.backupWindow();
      },
      showDataLostError: function () {
        dialogs.showDialog({
          title: jquery.localize.getString('Error'),
          message: jquery.localize.getString(
            'Sorry, some error happened, current writing content has been copied to clipboard. You could report this to <https://github.com/Refinex-Space/marklyra/issues> to help us fix this error.',
            'Panel',
          ),
          buttons: [
            jquery.localize.getString('Try Recovery', 'Panel'),
            jquery.localize.getString('Other Options for Data Recovery', 'Panel'),
          ],
          type: 'error',
          tag: 'content-lost',
          callback: function (buttonIndex) {
            const supportDomain = File.option.useMirrorInCN ? 'marklyraio.cn' : 'marklyra.io';
            if (1 == buttonIndex) {
              JSBridge.showInBrowser(`https://support.${supportDomain}/Version-Control/`);
            }
          },
        });
        File.saveAndBackup();
        File.tryRecoveryFromDom();
      },
      isKeyWindow: function () {
        return !!File.isActiveWindow() && (File.isMac ? !File.bundle.isLocked : !File.isLocked);
      },
      doImportFile: async function (importPath) {
        var ClientCommand = window.ClientCommand;
        if (await ClientCommand.validatePandocInstall()) {
          if (File.changeCounter.isDiscardableUntitled()) {
            window.getSelection().removeAllRanges();
            ClientCommand.doImport(importPath);
          } else {
            JSBridge.invoke('app.openFile').then(({ winId: windowId }) => {
              JSBridge.invoke(
                'executeJavaScript',
                windowId,
                'setTimeout(function(){window.getSelection().removeAllRanges();ClientCommand.doImport("' +
                  utilities.escapeInQuote(importPath) +
                  '")}, 200)',
              );
            });
          }
        }
      },
      onDropFile: async function (droppedPaths, dataTransfer, prepareDropSelection) {
        Object.defineProperty(insertDroppedLink, 'name', { value: 's', configurable: true });
        Object.defineProperty(openDroppedFile, 'name', { value: 'l', configurable: true });

        var isInternalUrl = dataTransfer.types.indexOf('marklyra.url') > -1,
          hasNativeEntries = File.isNode && dataTransfer.items.length == dataTransfer.files.length,
          currentEditor = File.editor,
          firstPath = droppedPaths[0];
        if (!firstPath) {
          return;
        }
        function insertDroppedLink(linkPath) {
          if (File.isMac) {
            if (File.bundle.isLocked) {
              return;
            }
          } else {
            if (File.isLocked) {
              return false;
            }
          }
          if (!File.editor.sourceView.inSourceMode) {
            mediaActions.insertURL(linkPath);
          }
        }
        function openDroppedFile() {
          if (File.isNode) {
            JSBridge.invoke('app.openFile', firstPath, { curWindow: true });
          } else {
            bridge.callHandler('controller.openInMarkLyra', firstPath);
          }
        }
        if (
          await (function (candidatePath, itemIndex) {
            if (/^[a-z-]:/g.exec(candidatePath)) {
              return Promise.resolve(false);
            }
            if (hasNativeEntries) {
              var entry = dataTransfer.items[itemIndex].webkitGetAsEntry();
              if (entry) {
                return Promise.resolve(entry.isDirectory);
              }
            }
            return new Promise(function (resolvePromise, rejectPromise) {
              if (File.isNode) {
                return reqnode('fs').lstat(candidatePath, function (error, fileInfo) {
                  resolvePromise(!error && fileInfo.isDirectory());
                });
              }
              if (File.isMac) {
                bridge.callHandler('path.isDirectory', candidatePath, function (isDirectory) {
                  resolvePromise(isDirectory);
                });
              }
            });
          })(firstPath, 0)
        ) {
          if (File.option.supportTextBundle && /\.textbundle$/i.exec(firstPath)) {
            if ('link' === File.option.actionWhenDropFile) {
              insertDroppedLink(firstPath);
            } else {
              openDroppedFile();
            }
          } else {
            if ('link' === File.option.actionWhenDropFolder) {
              insertDroppedLink(firstPath);
            } else {
              if (File.bundle.filePath || File.getMountFolder()) {
                if (File.isNode) {
                  JSBridge.invoke('app.openFolder', firstPath);
                } else {
                  if (File.isMac) {
                    bridge.callHandler('controller.openFolder', firstPath);
                  }
                }
              } else {
                JSBridge.invoke('controller.switchFolder', firstPath);
              }
            }
          }
        } else {
          var match = firstPath.match(/(?:^|\.)([^.]+)$/);
          match = (match[1] || '').toLowerCase();
          if (
            ~[
              'latex',
              'ltx',
              'tex',
              'wiki',
              'dokuwiki',
              'docx',
              'rst',
              'rest',
              'org',
              'textile',
              'opml',
            ].indexOf(match)
          ) {
            if ('link' === File.option.actionWhenDropImport) {
              insertDroppedLink(firstPath);
            } else {
              if (File.isNode) {
                editingActions.doImportFile(firstPath);
              } else {
                bridge.callHandler('controller.openInMarkLyra', firstPath);
              }
            }
            return false;
          }
          if (~File.SupportedFiles.indexOf(match)) {
            if (isInternalUrl) {
              insertDroppedLink(firstPath);
            } else {
              if ('link' === File.option.actionWhenDropFile) {
                insertDroppedLink(firstPath);
              } else {
                openDroppedFile();
              }
            }
            return false;
          }
          if (!editingActions.isKeyWindow()) {
            return false;
          }
          for (var itemIndex = 0; itemIndex < droppedPaths.length; itemIndex++) {
            if (itemIndex > 0) {
              currentEditor.UserOp.insertParagraph(false, currentEditor);
            } else {
              prepareDropSelection();
            }
            insertDroppedLink(droppedPaths[itemIndex]);
          }
        }
      },
      handleFileNotExist: async function (missingPath) {
        if (!File.option.noFileNonExistWarning && !File.option.silentOpenFailure) {
          let { checkboxChecked: suppressFutureWarnings } = await JSBridge.invoke(
            'dialog.showMessageBox',
            {
              type: 'warning',
              message: jquery.localize
                .getString('File does not exist at path %@.')
                .replace('%@', missingPath),
              defaultId: 0,
              buttons: [jquery.localize.getString('OK')],
              checkboxLabel: jquery.localize.getString('Do not show this again', 'Panel'),
            },
          );
          if (suppressFutureWarnings) {
            JSBridge.execForAll(
              'window.File && File.option && (File.option.noFileNonExistWarning = true)',
            );
            JSBridge.putSetting('noFileNonExistWarning', true);
          }
        }
      },
    };
  moduleRecord.exports = editingActions;
}
