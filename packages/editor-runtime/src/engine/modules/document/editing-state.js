// document/editing-state.
// SystemJS module 3e. Dependencies: e, 11, 1b, 13, 2c, 29, 30, 2a, 3f.
$__System.registerDynamic(
  '3e',
  ['e', '11', '1b', '13', '2c', '29', '30', '2a', '3f'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self;
    var jquery = requireModule('e'),
      utilities = requireModule('11'),
      documentModel = (requireModule('1b'), requireModule('13')),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      dialogs = (requireModule('2c'), requireModule('29')),
      mediaActions = (requireModule('30'), requireModule('2a')),
      htmlParser = requireModule('3f'),
      editingActions = {
        copy: function () {
          File.editor.UserOp.copyHandler(File.editor);
        },
        delete: function (targetElement) {
          if (
            ((targetElement = targetElement || document.activeElement),
            isInputComponent(targetElement))
          ) {
            var element = document.activeElement.closest('.CodeMirror');
            element && (element = element.CodeMirror).replaceSelection('', 'start');
          } else File.editor.UserOp.backspaceHandler(File.editor, null, 'Backspace');
        },
        editActive: function (targetElement) {
          var currentEditor = File.editor;
          currentEditor.undo.prepCursorSnap();
          var element = targetElement
            ? jquery(targetElement).closest('[cid]')
            : currentEditor.findElemById(currentEditor.focusCid);
          DocumentNode.isType(element.attr('mdtype'), NodeType.html_block, NodeType.math_block)
            ? element.find('.md-rawblock-container').trigger('startedit')
            : DocumentNode.isType(element.attr('mdtype'), NodeType.fences) &&
              currentEditor.refocus(element.attr('cid'));
        },
        deleteActive: function (targetElement) {
          var markElement = File.editor.getMarkElem(targetElement),
            targetNode = File.editor.findNodeByElem(markElement);
          !targetNode &&
            File.editor.focusCid &&
            (targetNode = File.editor.getNode(File.editor.focusCid));
          var deleteCommand = File.editor.UserOp.backToParagraph(editor, targetNode, !0);
          File.editor.undo.register(deleteCommand);
        },
        cut: function () {
          if (File.isLocked) return !1;
          File.editor.refocus(void 0, !0),
            File.editor.UserOp.copyHandler(editor, null),
            File.editor.UserOp.backspaceHandler(editor, null, 'delSelection');
        },
        pasteAsPlainText: function () {
          jquery(File.editor.sessionStr).trigger('pasteAsPlainText');
        },
        lock: function () {
          (File.isLocked = !0), File.freshLock();
        },
        unlock: function () {
          (File.isLocked = !1), File.freshLock();
        },
        toggleSourceMode: function () {
          File.editor.sourceView.inSourceMode
            ? (File.editor.sourceView.hide(), File.editor.library.recoverSidebar())
            : (File.editor.library.tmpHideSidebar(), File.editor.sourceView.show()),
            File.freshMenuWithDelay();
        },
        freshLock: function (isLocked, skipMenuRefresh) {
          File.editor &&
            (void 0 !== isLocked && (File.isLocked = isLocked),
            jquery('content input, selector').prop('readOnly', File.isLocked || !1),
            jquery('.CodeMirror').each(function () {
              this.CodeMirror && (this.CodeMirror.options.readOnly = File.isLocked || !1);
            }),
            File.isLocked
              ? (File.editor.tableEdit.unfocusAll(),
                jquery('[contenteditable=true]')
                  .attr('locked', 'true')
                  .attr('contenteditable', 'false'),
                jquery(File.editor.sessionStr).blur(),
                jquery('.md-expand').removeClass('md-expand'))
              : jquery("[locked='true']").attr('locked', 'false').attr('contenteditable', 'true'),
            jquery('#md-searchpanel input').prop('readOnly', !1),
            !skipMenuRefresh && File.freshMenu(),
            File.editor &&
              File.editor.sourceView &&
              File.editor.sourceView.inSourceMode &&
              File.editor.sourceView.cm.focus());
        },
        validateContentForSave: function () {
          return (
            !!(function () {
              try {
                if (File.editor.sourceView && File.editor.sourceView.inSourceMode) return !0;
                var firstNode = File.editor.nodeMap.getFirst();
                if (!firstNode) return !1;
                var headMatches = firstNode.cid == jquery('#write [cid]').first().attr('cid');
                if (
                  !(headMatches =
                    headMatches && 1 == jquery("#write [cid='" + firstNode.cid + "']").length)
                )
                  return !1;
                var lastNode = firstNode.getLastBrother(!1, !1, !0).getVeryFirst(!0);
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
            !1)
          );
        },
        tryRecoveryFromDom: function () {
          var currentHtml = jquery('#write').html(),
            setClipboard = File.editor.UserOp.setClipboard;
          setClipboard(currentHtml, void 0, void 0, !0);
          var recoveredHtml = htmlParser
            .getMarkElemFromCurrentHtml(currentHtml, File.editor)
            .html();
          File.editor.nodeMap.reset();
          var scrollOffset = jquery('content').scrollTop(),
            parsedBlocks = htmlParser.getBlocksFromMarkHtml(recoveredHtml, void 0, void 0, !0),
            recoveredMarkdown =
              'string' == typeof parsedBlocks
                ? parsedBlocks
                : DocumentNode.markFromArr(parsedBlocks);
          File.editor.reset(recoveredMarkdown),
            setClipboard(void 0, void 0, recoveredMarkdown),
            File.editor.writingArea.focus(),
            File.editor.undo.reset(),
            File.changeCounter && File.changeCounter.reset(),
            File.updateChangeCount(File.ChangeType.NSChangeReadOtherContents),
            jquery('content').scrollTop(scrollOffset),
            (File._needsUpdateSnap = new Date()),
            File.backupDocumentSnap(),
            (File.needSaveState = !0),
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
              1 == buttonIndex &&
                JSBridge.showInBrowser(`https://support.${supportDomain}/Version-Control/`);
            },
          }),
            File.saveAndBackup(),
            File.tryRecoveryFromDom();
        },
        isKeyWindow: function () {
          return !!File.isActiveWindow() && (File.isMac ? !File.bundle.isLocked : !File.isLocked);
        },
        doImportFile: async function (importPath) {
          var ClientCommand = window.ClientCommand;
          (await ClientCommand.validatePandocInstall()) &&
            (File.changeCounter.isDiscardableUntitled()
              ? (window.getSelection().removeAllRanges(), ClientCommand.doImport(importPath))
              : JSBridge.invoke('app.openFile').then(({ winId: windowId }) => {
                  JSBridge.invoke(
                    'executeJavaScript',
                    windowId,
                    'setTimeout(function(){window.getSelection().removeAllRanges();ClientCommand.doImport("' +
                      utilities.escapeInQuote(importPath) +
                      '")}, 200)',
                  );
                }));
        },
        onDropFile: async function (droppedPaths, dataTransfer, prepareDropSelection) {
          var isInternalUrl = dataTransfer.types.indexOf('marklyra.url') > -1,
            hasNativeEntries =
              File.isNode && dataTransfer.items.length == dataTransfer.files.length,
            currentEditor = File.editor,
            firstPath = droppedPaths[0];
          if (!firstPath) return;
          function s(linkPath) {
            if (File.isMac) {
              if (File.bundle.isLocked) return;
            } else if (File.isLocked) return !1;
            File.editor.sourceView.inSourceMode || mediaActions.insertURL(linkPath);
          }
          function l() {
            File.isNode
              ? JSBridge.invoke('app.openFile', firstPath, { curWindow: !0 })
              : bridge.callHandler('controller.openInMarkLyra', firstPath);
          }
          if (
            await (function (candidatePath, itemIndex) {
              if (/^[a-z-]:/g.exec(candidatePath)) return Promise.resolve(!1);
              if (hasNativeEntries) {
                var entry = dataTransfer.items[itemIndex].webkitGetAsEntry();
                if (entry) return Promise.resolve(entry.isDirectory);
              }
              return new Promise(function (resolvePromise, rejectPromise) {
                if (File.isNode)
                  return reqnode('fs').lstat(candidatePath, function (error, fileInfo) {
                    resolvePromise(!error && fileInfo.isDirectory());
                  });
                File.isMac &&
                  bridge.callHandler('path.isDirectory', candidatePath, function (isDirectory) {
                    resolvePromise(isDirectory);
                  });
              });
            })(firstPath, 0)
          )
            File.option.supportTextBundle && /\.textbundle$/i.exec(firstPath)
              ? 'link' === File.option.actionWhenDropFile
                ? s(firstPath)
                : l()
              : 'link' === File.option.actionWhenDropFolder
                ? s(firstPath)
                : File.bundle.filePath || File.getMountFolder()
                  ? File.isNode
                    ? JSBridge.invoke('app.openFolder', firstPath)
                    : File.isMac && bridge.callHandler('controller.openFolder', firstPath)
                  : JSBridge.invoke('controller.switchFolder', firstPath);
          else {
            var match = firstPath.match(/(?:^|\.)([^.]+)$/);
            if (
              ((match = (match[1] || '').toLowerCase()),
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
              ].indexOf(match))
            )
              return (
                'link' === File.option.actionWhenDropImport
                  ? s(firstPath)
                  : File.isNode
                    ? editingActions.doImportFile(firstPath)
                    : bridge.callHandler('controller.openInMarkLyra', firstPath),
                !1
              );
            if (~File.SupportedFiles.indexOf(match))
              return (
                isInternalUrl
                  ? s(firstPath)
                  : 'link' === File.option.actionWhenDropFile
                    ? s(firstPath)
                    : l(),
                !1
              );
            if (!editingActions.isKeyWindow()) return !1;
            for (var itemIndex = 0; itemIndex < droppedPaths.length; itemIndex++)
              itemIndex > 0
                ? currentEditor.UserOp.insertParagraph(!1, currentEditor)
                : prepareDropSelection(),
                s(droppedPaths[itemIndex]);
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
            suppressFutureWarnings &&
              (JSBridge.execForAll(
                'window.File && File.option && (File.option.noFileNonExistWarning = true)',
              ),
              JSBridge.putSetting('noFileNonExistWarning', !0));
          }
        },
      };
    moduleRecord.exports = editingActions;
  },
);
