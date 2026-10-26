// document/file-controller.
export default function initializeDocumentFileController(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  'use strict';
  if (!this) {
    self;
  }
  var backupSchedule,
    jquery = requireModule('libraries/jquery'),
    utilities = requireModule('shared/utilities'),
    undoManager = requireModule('editing/undo-manager'),
    documentModel = (undoManager.SnapFlag, requireModule('model/document-model')),
    dialogs =
      (documentModel.Node,
      documentModel.TYPE,
      requireModule('host/environment').safePromise,
      requireModule('ui/dialogs')),
    fileIntegration = requireModule('host/file-integration'),
    fileOptions = requireModule('document/options'),
    editingState = requireModule('document/editing-state'),
    fileSnapshot = requireModule('document/file-snapshot'),
    assetStorage = requireModule('media/asset-storage'),
    textBundle = requireModule('document/text-bundle'),
    documentMenu = requireModule('ui/document-menu'),
    recovery = requireModule('document/recovery'),
    ChangeCounter = (requireModule('model/html-parser'), fileIntegration.ChangeCounter),
    Reporter =
      (fileIntegration.ChangeType,
      requireModule('document/file-writer'),
      requireModule('host/local-diagnostics').Reporter),
    MarkdownFiles = ['md', 'markdown', 'mmd', 'mkd', 'mdwn', 'mdown', 'mdx'],
    FileType = { Markdown: 'markdown', TextBundle: 'textbundle', TextPack: 'textpack' },
    UNSUPPORTED_REASON = {
      OVERSIZE: 'OVERSIZE',
      UNSUPPORTED: 'UNSUPPORTED',
      OTHER_FILE: 'OTHER_FILE',
      READ_FAIL: 'READ_FAIL',
    },
    SupportedTextFiles = [
      'mdtxt',
      'mdtext',
      'apib',
      'rmarkdown',
      'rmd',
      'qmd',
      'txt',
      'text',
    ].concat(MarkdownFiles),
    fileController = {
      FileSave: fileSnapshot,
      FileType: FileType,
      MarkdownFiles: MarkdownFiles,
      SupportedTextFiles: SupportedTextFiles,
      FileOption: fileOptions,
      FileOption: fileOptions,
      TextBundle: assetStorage,
      SupportedFiles: SupportedTextFiles.concat(['']),
      activeWindow: true,
      MAX_FILE_SIZE: 2e6,
      option: fileOptions.DEFAULT_OPTIONS,
      needSaveState: false,
      fileHasModified: false,
      UNSUPPORTED_REASON: UNSUPPORTED_REASON,
      bundle: {
        filePath: null,
        originalPath: null,
        untitledId: new Date() - 0,
        fileName: null,
        fileEncode: null,
        removed: false,
        useCRLF: false,
        unsupported: '',
        hasModified: false,
        modifiedDate: null,
        lastSnapDate: null,
        savedContent: null,
        isLocked: false,
        oversize: false,
        fileMissingWhenOpen: false,
        bundleFile: null,
        zip: null,
      },
      draftsRecoverList: [],
      setDocumentState: function (bundle) {
        console.debug('File.setDocumentState');
        const { currentFilePath: localFilePath } = bundle;
        if (fileController.bundle.filePath == localFilePath) {
          Object.assign(fileController.bundle, bundle);
        } else {
          fileController.bundle = bundle;
          fileController.bundle.filePath = localFilePath;
          fileController.isLocked = bundle.isLocked;
        }
        delete fileController.bundle.currentFilePath;
        if (fileController.bundle.oversize) {
          fileController.bundle.unsupported = UNSUPPORTED_REASON.OVERSIZE;
          fileController.tryEnterOversize(null, true);
        } else {
          fileController.exitOversize();
        }
        Reporter.record(
          `[File] setDocumentState File.filePath = ${utilities.hashCode(fileController.filePath)}`,
        );
      },
      readOption: fileOptions.readOption,
      setConvertSmartOnRender: fileOptions.setConvertSmartOnRender,
      setup: fileOptions.setup,
      shouldRemapPunctuation: fileOptions.shouldRemapPunctuation,
      setFinalNewline: fileOptions.setFinalNewline,
      setIndentFirstLine: fileOptions.setIndentFirstLine,
      setHideBrAndLineBreak: fileOptions.setHideBrAndLineBreak,
      setIgnoreLineBreak: fileOptions.setIgnoreLineBreak,
      setIndentSize: fileOptions.setIndentSize,
      setLineEnding: fileOptions.setLineEnding,
      setDefaultExtension: fileOptions.setDefaultExtension,
      getTextFile: assetStorage.getTextFile,
      setEditor: function (inputEditor) {
        fileController.isLocked = fileController.isMac && fileController.bundle.isLocked;
        fileController.editor = inputEditor;
        if (!fileController.isMac) {
          fileController.changeCounter = new ChangeCounter();
        }
      },
      isTextBundle: function () {
        return fileController.bundle.type === FileType.TextBundle;
      },
      isTextPack: function () {
        return fileController.bundle.type === FileType.TextPack;
      },
      onFileOpened: function () {
        if (fileController.isNode) {
          try {
            reqnode('electron').ipcRenderer.send(
              'addBackup',
              JSON.stringify({
                path: fileController.bundle.filePath,
                type: fileController.bundle.type,
                mountFolder: fileController.mountFolder_,
                encode: fileController.bundle.encode,
              }),
              false,
              true,
            );
          } catch (error) {
            console.sendError(error);
          }
          fileController.needSaveState = false;
        }
      },
      recoverFromBackup: function (backupData) {
        if (!fileController.isNode) {
          return false;
        }
        if (!backupData || !backupData.content) {
          return false;
        }
        fileController.setLineEnding(backupData.useCRLF);
        fileController.bundle.filePath = backupData.path;
        fileController.bundle.fileEncode = backupData.encode;
        fileController.bundle.hasModified = true;
        fileController.bundle.untitledId = backupData.untitledId;
        fileController.bundle.type = backupData.type;
        recovery.onFilePathUpdated();
        fileController.setMountFolder(backupData.mountFolder);
        console.sendLog('recoverFromBackup');
        fileController.editor.reset(backupData.content);
        fileController.editor.writingArea.focus();
        fileController.updateChangeCount(fileIntegration.ChangeType.NSChangeDone);
        if (backupData.path) {
          fileController.editor.undo.endSnap(true);
          var recoveryCommand = undoManager.makeEmptyCommand();
          recoveryCommand.tag = 'reload';
          recoveryCommand.redo.push(undoManager.buildAllDoc(fileController.editor.nodeMap));
          fileController.fs.readFile(
            backupData.path,
            backupData.encode || 'utf8',
            function (error, fileContent) {
              if (!error) {
                recoveryCommand.undo.push({ type: 'initSrc', src: fileContent });
                fileController.changeCounter.doneStack.unshift(
                  fileIntegration.ChangeType.NSChangeCleared,
                );
                fileController.editor.undo.register(recoveryCommand, true, void 0, true);
              }
            },
          );
        }
        Analytics.record('newWindow', { type: 'recoverBackup' });
        return true;
      },
      stillNeedToLoadFromDiskByNode: function (diskContent, snapshot) {
        return !(
          !(snapshot && diskContent && snapshot.changeCounter && snapshot.changeCounter.curState) ||
          (diskContent == snapshot.content &&
            (snapshot.fileEncode || 'utf8') == (fileController.bundle.fileEncode || 'utf8'))
        );
      },
      loadFile: async function (inputFilePath, switchDocument, documentData) {
        function applyLoadedContent(savedContent) {
          var currentEditor = fileController.editor,
            selection = currentEditor.selection;
          if (selection) {
            selection.lockNativeScroll();
          }
          fileController.decideLineEnding(savedContent);
          currentEditor.reset(savedContent);
          fileController.bundle.savedContent = savedContent;
          currentEditor.writingArea.focus();
          if (fileController.option.initAnchor) {
            currentEditor.tryOpenUrl(fileController.option.initAnchor);
            fileController.option.initAnchor = '';
          } else {
            fileController._scrollTopTimer = setTimeout(() => {
              document.querySelector('content').scrollTop = 0;
            }, 1);
            if (void 0 != savedContent && savedContent.trim().length) {
              if (selection) {
                document.querySelector('content').scrollTop = 0;
                selection.jumpIntoElemEnd(jquery('[cid]').last());
                document.querySelector('content').scrollTop = 0;
              }
            } else {
              jquery(currentEditor.sessionStr + '>*:first-child').addClass('md-focus');
              if (selection) {
                selection.jumpTop();
              }
            }
          }
        }
        console.debug('File.loadFile');
        fileController.draftsRecoverList = [];
        fileController.bundle = { filePath: inputFilePath, untitledId: new Date() - 0 };
        fileController._onInitParse = true;
        if (fileController.editor.brush) {
          fileController.editor.brush.clearAndPause();
        }
        if (fileController.editor.library) {
          fileController.editor.library.stopRename = true;
        }
        if (!inputFilePath) {
          if ('textbundle' === fileController.option.defaultExtension) {
            fileController.bundle.type = 'textbundle';
          }
          if ('textpack' === fileController.option.defaultExtension) {
            fileController.bundle.type = 'textpack';
          }
        }
        if (!documentData) {
          documentData = switchDocument
            ? await JSBridge.invoke('document.switchDocument', inputFilePath)
            : await JSBridge.invoke('document.loadData');
        }
        if (fileController.changeCounter) {
          fileController.changeCounter.reset();
        }
        fileController.editor.undo.reset();
        fileController.editor.nodeMap.reset(false, true);
        if (editor.fences) {
          editor.fences.onLeaveDocument();
        }
        if (editor.mathInline) {
          editor.mathInline.onLeaveDocument();
        }
        if (fileController.isNode) {
          await (async function (serializedDocument) {
            var {
              snap: snapshot,
              filePath: localFilePath,
              backups: backups,
              shouldReadFromDisk: readFromDisk,
            } = JSON.parse(serializedDocument);
            if (!backups || !fileController.recoverFromBackup(backups)) {
              Analytics.record('newWindow', { type: localFilePath ? 'openFile' : 'newFile' });
              console.debug(serializedDocument);
              if (window._options.initMountFolder) {
                fileController.setMountFolder(window._options.initMountFolder);
                window._options.initMountFolder = void 0;
              }
              var diskContent,
                fileInfo = null;
              try {
                fileInfo = (localFilePath && fileController.fs.statSync(localFilePath)) || null;
              } catch (error) {
                fileInfo = null;
                if ('ENOENT' != error.code || switchDocument) {
                  handleLoadFailure(error);
                } else {
                  editingState.handleFileNotExist(localFilePath);
                  fileController.bundle.fileMissingWhenOpen = true;
                  handleLoadFailure(error, true);
                }
              }
              if (fileInfo) {
                if (fileInfo.isDirectory()) {
                  diskContent = await assetStorage.loadFile(localFilePath);
                } else {
                  if (fileInfo.isFile()) {
                    diskContent = /\.textpack$/.exec(localFilePath)
                      ? await textBundle.loadFile(localFilePath)
                      : await (async function () {
                          var [loaded, savedContent, encoding] =
                            await fileController.readContentFrom(localFilePath);
                          if (loaded) {
                            fileController.bundle.fileEncode = encoding || 'utf8';
                            fileController.bundle.filePath = localFilePath;
                            fileController.bundle.savedContent = savedContent;
                            fileController.bundle.modifiedDate = new Date();
                            return savedContent;
                          }
                          handleLoadFailure(savedContent);
                        })();
                  }
                }
                recovery.onFilePathUpdated();
              } else {
                diskContent = '';
              }
              if (fileController.stillNeedToLoadFromDiskByNode(diskContent, snapshot)) {
                readFromDisk = true;
              }
              if ((snapshot || {}).nodeMap) {
                fileController.restoreEditStateFromData(
                  snapshot,
                  false,
                  true,
                  readFromDisk,
                  diskContent,
                );
              } else {
                applyLoadedContent(diskContent);
                JSBridge.invoke('document.setLastSync', fileController.bundle.modifiedDate);
              }
              fileController.onFileOpened();
            }
            function handleLoadFailure(loadError, suppressWarning) {
              console.warn(`onLoadFail ${fileController.bundle.filePath}`);
              if (!suppressWarning) {
                if (!fileController.option.silentOpenFailure) {
                  var errorMessage = loadError.message || '';
                  if (!debugMode) {
                    errorMessage =
                      (errorMessage.splits && errorMessage.splits(/\n/)[0]) || errorMessage;
                  }
                  dialogs.showErrorDialog('Failed to load file', errorMessage);
                  if (
                    fileController.editor &&
                    fileController.editor.library &&
                    fileController.editor.library.isFileTabShown()
                  ) {
                    fileController.editor.library.refreshPanelCommand();
                  }
                }
                fileController.option.silentOpenFailure = false;
              }
              if ('ENOENT' == loadError.code) {
                recovery.onFilePathUpdated();
                recovery.onFilePathRemoved();
              } else {
                if (fileController.bundle.filePath) {
                  JSBridge.invoke('document.switchToUntitled', fileController.bundle.filePath);
                  fileController.bundle.filePath = '';
                }
                recovery.onFilePathUpdated();
              }
            }
          })(documentData);
        } else {
          if (fileController.isMac) {
            await (function (documentData) {
              const [savedContent, snapshot, documentState] = documentData;
              fileController.setDocumentState(documentState);
              recovery.onFilePathUpdated();
              fileController.bundle.savedContent = savedContent;
              fileController.bundle.modifiedDate = new Date();
              if (snapshot && snapshot.nodeMap) {
                console.debug(snapshot);
                fileController.restoreEditStateFromData(
                  snapshot,
                  false,
                  true,
                  snapshot.isOutDated,
                  savedContent,
                );
              } else {
                console.debug(savedContent.substr(0, 100) + '...');
                applyLoadedContent(savedContent);
              }
            })(documentData);
          } else {
            recovery.onFilePathUpdated();
            applyLoadedContent('');
          }
        }
        if (fileController.isTextBundle()) {
          await assetStorage.recordUnusedAssets();
        } else {
          await textBundle.recordUnusedAssets();
        }
        if (switchDocument) {
          if (!(fileController.bundle.filePath || fileController.editor.undo.hasUndo())) {
            fileController.updateChangeCount(fileIntegration.ChangeType.NSChangeDone);
          }
          if (!fileController.inBusyMode) {
            fileController.recoverPosOrScroll();
          }
          if (fileController.option.lastExport) {
            fileController.option.lastExportNoOverwrite = true;
          }
          window._hasSwitchCallback = false;
        }
        if (fileController.editor.brush) {
          fileController.editor.brush.restart();
        }
        if (fileController.editor.library) {
          fileController.editor.library.stopRename = false;
        }
        if (fileController.editor.library) {
          fileController.editor.library.markCurrentFile();
        }
        fileController._onInitParse = false;
        fileController.freshMenu();
      },
      readContentFrom: async function (filePath, encodingOverride) {
        console.sendLog(`readContentFrom ${filePath}`);
        if (fileController.isMac) {
          return await new Promise((resolvePromise) => {
            bridge.callHandler('document.getContent', function (sourceText) {
              sourceText = fileController.tryEnterOversize(sourceText || '');
              resolvePromise([true, sourceText]);
            });
          });
        }
        if (!fileController.isNode) {
          return [true, ''];
        }
        var decodedText;
        try {
          if (filePath) {
            var readResult = await Promise.all([
                fileController.fs.readFile(filePath),
                fileController.fs.stat(filePath),
              ]),
              fileBytes = readResult[0],
              fileInfo = readResult[1],
              encoding = encodingOverride;
            fileController.bundle.modifiedDate = fileInfo.mtimeMs;
            if (fileBytes.length > fileController.MAX_FILE_SIZE) {
              fileController.bundle.unsupported = UNSUPPORTED_REASON.OVERSIZE;
              decodedText = '';
              fileController.tryEnterOversize(null, true);
            } else {
              fileController.exitOversize();
              encoding =
                encoding ||
                fileIntegration.getItemInDB('[encode]' + filePath) ||
                fileIntegration.detectEncodeByNode(fileBytes);
              console.debug('use encode: ' + encoding);
              decodedText = fileIntegration.getContentFromBuffer(
                fileBytes,
                (encoding || '').replace('-bom', ''),
                () => {
                  encoding = (encoding || 'utf8').replace('-bom', '') + '-bom';
                },
              );
            }
            return [true, decodedText, encoding, fileBytes];
          }
          return [true, ''];
        } catch (error) {
          return [false, error];
        }
      },
      getContent: async function (pathOverride, encodingOverride) {
        if (!pathOverride && fileController.isTextBundle()) {
          return await assetStorage.quickGetContent(assetStorage.getTextFile());
        }
        if (!pathOverride && fileController.isTextPack()) {
          throw new Error('not implemented');
        }
        var targetPath =
            void 0 == pathOverride || null == pathOverride
              ? fileController.bundle.filePath
              : pathOverride,
          [loaded, contentOrError, unusedValue, fileBytes] = await fileController.readContentFrom(
            targetPath,
            encodingOverride,
          );
        if (!loaded) {
          const loadError = contentOrError;
          contentOrError = '';
          if (!fileController.option.silentOpenFailure) {
            var errorMessage = loadError.message || '';
            if (!debugMode) {
              errorMessage = (errorMessage.splits && errorMessage.splits(/\n/)[0]) || errorMessage;
            }
            dialogs.showErrorDialog('Failed to load file', errorMessage);
            if (
              fileController.editor &&
              fileController.editor.library &&
              fileController.editor.library.isFileTabShown()
            ) {
              fileController.editor.library.refreshPanelCommand();
            }
          }
          fileController.option.silentOpenFailure = false;
          if (targetPath) {
            JSBridge.invoke('document.switchToUntitled', targetPath);
          }
          return '';
        }
        try {
          recovery.saveToRecover(fileBytes);
        } catch (error) {
          console.sendError(error, 'skip');
        }
        return contentOrError;
      },
      syncContentForSave: function (editedOverride) {
        let content = fileController.sync(true, false, true, editedOverride),
          assets = Array.from(
            fileController.isTextBundle() ? assetStorage.getAllUsedAssets(true) : [],
          );
        if (fileController.markSaved) {
          fileController.markSaved();
        }
        return { content: content, assets: assets };
      },
      setContent: async function (content, isMac) {
        if (!fileController.bundle.unsupported) {
          console.debug('setContent');
          if (fileController.isMac || isMac) {
            console.debug('do setContent');
            if (!(await JSBridge.invoke('document.setContent', content))) {
              fileController.editor.tryEnterBusyMode(content, true);
            }
          }
        }
      },
      getMountFolder: function () {
        return fileController.mountFolder_;
      },
      setMountFolder: function (mountFolder_, unusedParameter2) {
        if (mountFolder_) {
          mountFolder_ = mountFolder_.replace(/[\/\\]$/, '');
        }
        fileController.mountFolder_ = mountFolder_;
      },
      sync: function (isMac, forceHostSync, skipHostUpdate, editedOverride) {
        if (!fileController.bundle.unsupported && fileController.editor) {
          var sourceText = '';
          if (fileController.editor.sourceView && fileController.editor.sourceView.inSourceMode) {
            sourceText = fileController.editor.sourceView.cm.getValue(
              fileController.useCRLF ? '\r\n' : '\n',
            );
            if (!skipHostUpdate) {
              fileController.setContent(sourceText, forceHostSync);
            }
            if (fileController.isMac && isMac) {
              var documentEdited = editedOverride;
              if (void 0 == documentEdited) {
                documentEdited = fileController.isDocumentEdited();
              }
              if (documentEdited) {
                fileController.editor.sourceView.onSave();
              }
            }
            return sourceText;
          }
          fileController.editor.store(null, true);
          if (isInputComponent(document.activeElement)) {
            jquery(document.activeElement).trigger('change').trigger('inline-change');
          }
          try {
            fileController.editor.autoRemoveUnholdable(true);
          } catch (error) {
            console.sendError(error, 'warning');
          }
          var markdown = fileController.editor.getMarkdown();
          if (!skipHostUpdate) {
            fileController.setContent(markdown, forceHostSync);
          }
          return markdown;
        }
      },
      isActiveWindow: function () {
        return fileController.activeWindow;
      },
      validateContentForSave: editingState.validateContentForSave,
      tryRecoveryFromDom: editingState.tryRecoveryFromDom,
      showDataLostError: editingState.showDataLostError,
      isFileLoading: function () {
        return (
          fileController._onInitParse ||
          fileController._onFileSwitching ||
          (fileController.editor &&
            fileController.editor.library &&
            fileController.editor.library._onSwitchDocumentTarget)
        );
      },
      saveAsUseNode: fileSnapshot.saveAsUseNode,
      saveUseNode: fileSnapshot.saveUseNode,
      moveTo: fileSnapshot.moveTo,
      markSaved: fileSnapshot.markSaved,
      updateChangeCount: function (changeType) {
        if (!fileController.bundle.unsupported) {
          if (
            changeType != fileController.ChangeType.NodeSaveFailed &&
            changeType != fileController.ChangeType.NSChangeAutoSaved
          ) {
            fileController.needSaveState = true;
            fileController.scheduleBackupWindow();
          }
          if (fileController.editor.sourceView && fileController.editor.sourceView.inSourceMode) {
            if (fileController.isMac) {
              if (changeType == fileController.ChangeType.NSChangeAutoSaved) {
                bridge.callHandler('document.updateChangeCount', changeType);
              } else {
                if (changeType == fileController.ChangeType.NSChangeCleared) {
                  bridge.callHandler('document.updateChangeCount', changeType);
                } else {
                  bridge.callHandler(
                    'document.updateChangeCountIfUnedited',
                    fileController.ChangeType.NSChangeDone,
                  );
                }
              }
            } else {
              fileController.changeCounter.updateChangeCount(changeType);
            }
          } else {
            if (
              changeType !== fileController.ChangeType.NSChangeAutoSaved &&
              changeType != fileController.ChangeType.NodeSaveFailed
            ) {
              fileController.needsUpdateSnap();
            }
            var historyMenu = null;
            if (fileController.isMac) {
              bridge.callHandler('document.updateChangeCount', changeType);
              historyMenu = {
                'Edit→Undo': { enabled: fileController.editor.undo.hasUndo() },
                'Edit→Redo': { enabled: fileController.editor.undo.hasRedo() },
              };
            } else {
              fileController.changeCounter.updateChangeCount(changeType);
              recoveryPending =
                changeType !== fileController.ChangeType.NSChangeAutoSaved ||
                changeType == fileController.ChangeType.NodeSaveFailed;
              if (fileController.isNode) {
                historyMenu = {
                  'Edit→Undo': {
                    enabled:
                      fileController.editor &&
                      fileController.editor.undo &&
                      fileController.editor.undo.hasUndo(),
                  },
                  'Edit→Redo': {
                    enabled:
                      fileController.editor &&
                      fileController.editor.undo &&
                      fileController.editor.undo.hasRedo(),
                  },
                };
              }
            }
            JSBridge.menu.update(historyMenu);
          }
        }
      },
      setDefaultImageStorage: fileOptions.setDefaultImageStorage,
      exitOversize: fileOptions.exitOversize,
      doEnterOversize: fileOptions.doEnterOversize,
      tryEnterOversize: fileOptions.tryEnterOversize,
      recoverPosOrScroll: fileOptions.recoverPosOrScroll,
      restoreEditStateFromData: function (
        snapshot,
        positionRestore,
        inputOnInit,
        reloadFromDisk,
        diskContentOverride,
      ) {
        if (!snapshot || !snapshot.undoRedo || !snapshot.nodeMap) {
          return true;
        }
        if (snapshot.timeStamp > 0 && snapshot.timeStamp == fileController.bundle.lastSnapDate) {
          return true;
        }
        fileController.bundle.hasModified = true;
        if (fileController.isNode && !fileController.bundle.modifiedDate) {
          fileController.bundle.modifiedDate = snapshot.lastSync;
        }
        console.sendLog(`do restoreEditStateFromData ${inputOnInit} ${reloadFromDisk}`);
        var previousScrollTop = null,
          currentEditor = fileController.editor,
          inSourceMode = currentEditor.sourceView && currentEditor.sourceView.inSourceMode;
        fileController.editor.focusCid = null;
        fileController.editor.lastCursor = null;
        currentEditor.nodeMap.restoreFromJson(JSON.parse(snapshot.nodeMap));
        currentEditor.undo.restoreFromJson(JSON.parse(snapshot.undoRedo));
        fileController.setLineEnding(snapshot.useCRLF);
        fileController.finalNewline = snapshot.finalNewline;
        fileController.bundle.lastSnapDate = snapshot.timeStamp;
        let bundleSnapshot = JSON.parse(snapshot.bundle || '{}');
        fileController.bundle.unusedAssets = bundleSnapshot.unusedAssets;
        fileController.bundle.deletedAssetsMap = bundleSnapshot.deletedAssetsMap;
        fileController.bundle.assetsChanges = bundleSnapshot.assetsChanges;
        fileController.bundle.unzipFolder = bundleSnapshot.unzipFolder;
        var cursorSnapshot = JSON.parse(snapshot.cursorPos || '{}');
        function finishDocumentReload() {
          fileController.editor.tryEnterBusyMode();
          fileController.editor.writingArea.focus();
          fileController.onMetaDataChanged();
          if (positionRestore) {
            if ('object' == typeof positionRestore) {
              try {
                currentEditor.undo.exeCommand(positionRestore);
              } catch (error) {}
            }
          } else {
            if (!previousScrollTop) {
              fileController._scrollTopTimer = setTimeout(() => {
                document.querySelector('content').scrollTop = 0;
              }, 1);
              fileController.editor.selection.jumpIntoElemEnd(jquery('[cid]').last());
              document.querySelector('content').scrollTop = 0;
            }
          }
        }
        if (fileController.isTextPack()) {
          reloadFromDisk = false;
        }
        if (inSourceMode) {
          if (positionRestore) {
            previousScrollTop = currentEditor.sourceView.cm.getScrollInfo().top;
          }
          if (snapshot.srcHist) {
            fileController.reloadContent(snapshot.srcContent, {
              skipUndo: true,
              skipChangeCount: true,
            });
            currentEditor.sourceView.cm.doc.clearHistory();
            currentEditor.sourceView.cm.doc.setHistory(JSON.parse(snapshot.srcHist));
          }
          if (!snapshot.fromSourceMode) {
            fileController.reloadContent(snapshot.content, {
              skipChangeCount:
                inputOnInit || (fileController.isMac && !fileController.isDocumentEdited()),
            });
          }
          if (positionRestore) {
            currentEditor.sourceView.cm.scrollTo(0, previousScrollTop);
          }
        } else {
          if (positionRestore) {
            previousScrollTop = jquery('content').scrollTop();
          }
          if (snapshot.fromSourceMode) {
            fileController.reloadContent(snapshot.srcContent, {
              skipChangeCount: true,
              onInit: inputOnInit,
            });
            setTimeout(function () {
              if (null !== previousScrollTop) {
                jquery('content').scrollTop(previousScrollTop);
              }
            }, 0);
          } else {
            if (!reloadFromDisk) {
              if (!fileController.inBusyMode && currentEditor.nodeMap.allNodes.length > 1e4) {
                currentEditor.tryEnterBusyMode(void 0, void 0, true);
              }
              jquery(currentEditor.sessionStr).html(
                documentModel.NodeCollectionUtils.toHTML(currentEditor.nodeMap.blocks, {
                  focus: cursorSnapshot ? cursorSnapshot.id : void 0,
                }),
              );
              if (!inputOnInit) {
                currentEditor.focusCid = void 0;
              }
              setTimeout(function () {
                if (currentEditor.mathBlock) {
                  currentEditor.mathBlock.cleanUpAMS();
                }
                currentEditor.refresh();
                if (fileController.option.initAnchor) {
                  currentEditor.tryOpenUrl(fileController.option.initAnchor);
                  fileController.option.initAnchor = '';
                } else {
                  if (previousScrollTop) {
                    jquery('content').scrollTop(previousScrollTop);
                  }
                }
              }, 200);
              finishDocumentReload();
            }
          }
        }
        fileController._needsUpdateSnap = false;
        if (fileController.isNode) {
          fileController.changeCounter.reset(snapshot.changeCounter);
          fileController.bundle.hasModified = fileController.changeCounter.isDocumentEdited();
          if (fileController.editor.spellChecker) {
            fileController.editor.spellChecker.reset(true);
          }
        }
        if (reloadFromDisk) {
          (void 0 != diskContentOverride
            ? Promise.resolve(diskContentOverride)
            : fileController.getContent()
          ).then(function (savedContent) {
            fileController.bundle.savedContent = savedContent;
            fileController.bundle.modifiedDate = new Date();
            fileController.reloadContent(savedContent, {
              fromDiskChange: true,
              onInit: inputOnInit,
            });
            fileController.updateChangeCount(
              fileController.isMac
                ? fileController.ChangeType.NSChangeCleared
                : fileController.ChangeType.NSChangeAutoSaved,
            );
            fileController._needsUpdateSnap = new Date();
            finishDocumentReload();
          });
        } else {
          var wordCount = fileController.editor.wordCount;
          if (wordCount) {
            wordCount.update();
          }
          fileController.freshMenuWithDelay();
        }
      },
      needsUpdateSnap: function () {
        if (fileController.isMac) {
          bridge.callHandler('document.needsUpdateSnap');
        }
        fileController._needsUpdateSnap = new Date();
      },
      backupDocumentSnap: async function () {
        if (fileController.editor) {
          fileController.editor.lastCursor = fileController.editor.selection.buildUndo();
          if (fileController.isMac) {
            await new Promise(function (resolvePromise) {
              bridge.callHandler('document.requestBuildSnap', resolvePromise);
            });
          } else {
            if (fileController.isNode) {
              if (!(fileController.isFileLoading() || window._onBackup)) {
                await fileController.buildDocumentSnapForNode();
              }
            }
          }
        }
      },
      generateSnap: function (contentOverride) {
        if (!fileController.bundle.unsupported) {
          var snapshotContent =
              void 0 == contentOverride ? fileController.sync(false, true) : contentOverride,
            inSourceMode = fileController.editor.sourceView.inSourceMode,
            bundleSnapshot = Object.assign({}, fileController.bundle || {});
          delete bundleSnapshot.zip;
          var snapshot = {
            nodeMap: JSON.stringify(fileController.editor.nodeMap.storeToJson()),
            undoRedo: JSON.stringify(fileController.editor.undo.storeToJson()),
            timeStamp: (fileController._needsUpdateSnap || new Date()) - 0,
            cursorPos: JSON.stringify(fileController.editor.selection.storeToJson()),
            scrollOffset: inSourceMode ? 0 : jquery('content').scrollTop(),
            useCRLF: fileController.useCRLF,
            finalNewline: fileController.finalNewline,
            content: snapshotContent || '',
            bundle: JSON.stringify(bundleSnapshot),
          };
          if (inSourceMode) {
            snapshot.fromSourceMode = true;
            snapshot.srcHist = JSON.stringify(fileController.editor.sourceView.cm.doc.getHistory());
          }
          if (fileController.isNode) {
            snapshot.fileEncode = fileController.bundle.fileEncode;
            snapshot.changeCounter = fileController.changeCounter.clone();
          }
          return snapshot;
        }
      },
      buildDocumentSnapForNode: async function (reuseMatchingSnapshot) {
        if (fileController.bundle.unsupported || !fileController.isNode) {
          return Promise.resolve();
        }
        if (!fileController._needsUpdateSnap && !fileController.isActiveWindow()) {
          return Promise.resolve();
        }
        window._onBackup = true;
        var content = fileController.sync(false, true),
          currentSnap = null;
        if (fileController._needsUpdateSnap) {
          currentSnap = fileController.generateSnap(content);
          await JSBridge.invoke(
            'document.addSnapAndLastSync',
            JSON.stringify({ snap: currentSnap, lastSync: fileController.bundle.modifiedDate }),
          );
        } else {
          if (
            reuseMatchingSnapshot &&
            ((currentSnap = JSON.parse((await JSBridge.invoke('document.getSnap', 0)) || 'null')),
            console.debug('update snap cursor'),
            currentSnap && currentSnap.content == content)
          ) {
            var inSourceMode = fileController.editor.sourceView.inSourceMode;
            currentSnap.cursorPos = JSON.stringify(fileController.editor.selection.storeToJson());
            currentSnap.scrollOffset = inSourceMode ? 0 : jquery('content').scrollTop();
            await JSBridge.invoke('document.addSnap', JSON.stringify(currentSnap || null));
          }
        }
        fileController._needsUpdateSnap = false;
        if (currentSnap) {
          fileController.bundle.lastSnapDate = currentSnap.timeStamp;
        }
        window._onBackup = false;
      },
      presentedItemChanged: async function (locationChanged, fileInfo, changedPath) {
        if (
          fileController.isActiveWindow() &&
          !fileController.bundle.unsupported &&
          !fileController._isAskingForContentReload &&
          !fileController.isFileLoading() &&
          !(
            (changedPath && changedPath != assetStorage.getTextFile()) ||
            fileController.isTextPack()
          )
        ) {
          console.sendLog(`presentedItemChanged, path is ${utilities.hashCode(changedPath)}`, true);
          if (locationChanged) {
            clientHandlerOnPresentationMoved();
          }
          if (fileController.isNode) {
            if (fileController.bundle.filePath) {
              if (fileController.inSavingProcess) {
                return;
              }
              if (
                fileController.bundle.modifiedDate &&
                new Date() - fileController.bundle.modifiedDate < 500
              ) {
                return void (window.debugMode && console.debug('skip as just saved'));
              }
            } else {
              recovery.onFilePathRemoved();
            }
            if (fileController.bundle.filePath) {
              console.debug('check mtime on disk');
              if (!fileInfo || fileController.bundle.modifiedDate >= fileInfo.mtimeMs) {
                return void console.sendLog('presentedItemChanged ignored', true);
              }
              fileController.bundle.modifiedDate = fileInfo.mtimeMs;
              if (
                fileController.bundle.filePath &&
                (await readCurrentDiskContent()) === fileController.bundle.savedContent
              ) {
                return void console.sendLog(
                  'presentedItemChanged ignore because content not changed',
                  true,
                );
              }
              console.sendLog('presentedItemChanged did happen');
              if (fileController.changeCounter.isDocumentEdited()) {
                fileController._isAskingForContentReload = true;
                dialogs.confirm(
                  jquery.localize.getString(
                    'File content is changed by external applications. Reload content from disk ?',
                  ) +
                    ' ' +
                    jquery.localize.getString(
                      'You could undo this operation later via `Edit` → `Undo`.',
                    ),
                  function () {
                    fileController._isAskingForContentReload = false;
                    handleExternalContentChange(true);
                  },
                  function () {
                    fileController._isAskingForContentReload = false;
                    handleExternalContentChange(false);
                  },
                );
              } else {
                fileController._isAskingForContentReload = false;
                handleExternalContentChange(true);
              }
            } else {
              console.debug('presentedItemChanged ignored');
            }
          } else {
            if (fileController.isMac) {
              if (
                !(
                  fileController.isDocumentEdited() &&
                  !confirm(
                    jquery.localize.getString(
                      'File content is changed by external applications. Reload content from disk ?',
                    ) +
                      ' ' +
                      jquery.localize.getString(
                        'You could undo this operation later via `Edit` → `Undo`.',
                      ),
                  )
                )
              ) {
                bridge.callHandler('document.refreshContentFromDisk');
              }
            }
          }
        }
        function readCurrentDiskContent() {
          console.sendLog('getDataFromFile');
          return new Promise(function (resolvePromise) {
            if (fileController.isMac) {
              bridge.callHandler('document.getDataFromFile', resolvePromise);
            } else {
              if (fileController.isNode) {
                if (fileController.isTextBundle()) {
                  assetStorage
                    .quickGetContent(assetStorage.getTextFile(), true)
                    .then(resolvePromise);
                } else {
                  fileController
                    .getContent(fileController.bundle.filePath, fileController.bundle.fileEncode)
                    .then(resolvePromise);
                }
              } else {
                resolvePromise('');
              }
            }
          });
        }
        function handleExternalContentChange(reloadConfirmed) {
          console.sendLog('doHandlerPresentedItemChange');
          var previousScrollTop = jquery('content').scrollTop();
          if (reloadConfirmed) {
            readCurrentDiskContent().then(function (savedContent) {
              if (fileController.bundle.unsupported) {
                if (fileController.isNode) {
                  console.sendLog('document.enterOversize');
                  JSBridge.invoke('document.enterOversize');
                }
              } else {
                fileController.reloadContent(savedContent, { fromDiskChange: true });
                fileController.updateChangeCount(fileController.ChangeType.NSChangeAutoSaved);
                var sourceView = fileController.editor.sourceView;
                if (sourceView.inSourceMode) {
                  var top = sourceView.cm.getScrollInfo().top,
                    selections = sourceView.cm.listSelections();
                  sourceView.setValue(savedContent);
                  sourceView.cm.setSelections(selections);
                  sourceView.cm.scrollTo(0, top);
                }
                setTimeout(function () {
                  fileController.setContent(savedContent);
                  jquery('content').scrollTop(previousScrollTop);
                }, 0);
                fileController.bundle.savedContent = savedContent;
                fileController.bundle.modifiedDate = new Date();
              }
            });
          } else {
            fileController.updateChangeCount(fileController.ChangeType.NSChangeReadOtherContents);
          }
        }
      },
      reloadWithEncoding: function (fileEncode) {
        if (!(fileController.isTextBundle() || fileController.isTextPack())) {
          if (
            fileController.isNode &&
            fileController.bundle.filePath &&
            fileEncode != fileController.bundle.fileEncode
          ) {
            fileIntegration.setItemInDB('[encode]' + fileController.bundle.filePath, fileEncode);
            fileController.bundle.fileEncode = fileEncode;
            fileController
              .getContent(fileController.bundle.filePath, fileEncode)
              .then(function (result) {
                fileController.reloadContent(result);
                fileController.updateChangeCount(fileController.ChangeType.NSChangeCleared);
              });
          }
        }
      },
      reloadContent: function (sourceText, reloadOptions) {
        var {
          skipUndo: skipUndo,
          delayRefresh: delayRefresh,
          fromDiskChange: fromDiskChange,
          skipChangeCount: skipChangeCount,
          onInit: onInit,
          skipStore: skipStore,
        } = reloadOptions || {};
        console.sendLog(`File.reloadContent, ${JSON.stringify(reloadOptions)}`);
        fileController.bundle.assetsChanges = null;
        if (!fileController.bundle.unsupported && fileController.isMac && fromDiskChange) {
          sourceText = fileController.tryEnterOversize(sourceText);
          if (fileController.bundle.unsupported) {
            console.sendLog('document.enterOversize');
            bridge.callHandler('document.enterOversize');
          }
        }
        if (!fileController.bundle.unsupported) {
          if (fromDiskChange) {
            fileController.needsUpdateSnap();
          }
          fileController.editor.undo.endSnap(true);
          var parseResult,
            cursorPosition,
            top,
            reloadCommand = undoManager.makeEmptyCommand(),
            inSourceMode =
              fileController.editor.sourceView && fileController.editor.sourceView.inSourceMode;
          reloadCommand.tag = 'reload';
          fileController.decideLineEnding(sourceText);
          if (!(inSourceMode || onInit || skipStore)) {
            fileController.editor.store();
            reloadCommand.undo.push(fileController.editor.selection.buildUndo());
          }
          fileController.editor.focusCid = null;
          fileController.editor.lastCursor = null;
          reloadCommand.undo.push(
            undoManager.buildAllDoc(fileController.editor.nodeMap, fromDiskChange),
          );
          if (inSourceMode) {
            top = fileController.editor.sourceView.cm.getScrollInfo().top;
            cursorPosition = fileController.editor.sourceView.cm.getCursor();
            fileController.editor.sourceView.setValue(
              sourceText,
              true,
              fromDiskChange || skipChangeCount ? 'fromDisk' : 'begin',
            );
          }
          if (!(inSourceMode && fromDiskChange)) {
            fileController.editor.nodeMap.reset();
            (parseResult = documentModel.Node.parseFrom(sourceText, fileController.editor.nodeMap, {
              skips: { old_code: false },
            }))[1].map(function (item) {
              item.set('attachTo', fileController.editor.nodeMap);
            });
            reloadCommand.redo.push(
              undoManager.buildAllDoc(fileController.editor.nodeMap, fromDiskChange),
            );
            reloadCommand.date = new Date();
            fileController.editor.tryEnterBusyMode(sourceText);
            if (inSourceMode) {
              fileController.editor.sourceView.renderedHTML = parseResult[0];
              fileController.editor.undo.register(reloadCommand, skipChangeCount);
            } else {
              if (fileController.isMac && parseResult[0].length > 1e5) {
                fileController.editor.writingArea.innerHTML = parseResult[0];
                console.debug('hotfix for macOS slowness');
                setTimeout(() => {
                  fileController.editor.writingArea.innerHTML = parseResult[0];
                  fileController.editor.runAllScript();
                  window.Reporter.fullValidate();
                }, 0);
              } else {
                fileController.editor.writingArea.innerHTML = parseResult[0];
                fileController.editor.runAllScript();
                window.Reporter.fullValidate();
              }
            }
          }
          if (inSourceMode) {
            var inputField = fileController.editor.sourceView.cm.getInputField();
            if (inputField.setSelectionRange) {
              inputField.setSelectionRange(0, 0);
            }
            fileController.editor.sourceView.cm.setCursor(cursorPosition);
            return void (
              fromDiskChange &&
              void 0 !== top &&
              fileController.editor.sourceView.cm.scrollTo(0, top)
            );
          }
          if (fromDiskChange) {
            var previousHistoryEntry = fileController.editor.undo.lastRegisteredOperationCommand(),
              previousUndoAction = previousHistoryEntry && previousHistoryEntry.undo.last();
            if (
              previousUndoAction &&
              'reload' == previousUndoAction.type &&
              previousUndoAction.reloadFromDisk &&
              previousHistoryEntry.date > new Date() - 1e3
            ) {
              reloadCommand.undo = [previousUndoAction];
              fileController.editor.undo.removeLastRegisteredOperationCommand();
            }
          }
          if (!skipUndo) {
            fileController.editor.undo.register(reloadCommand, skipChangeCount);
          }
          if (false !== delayRefresh) {
            setTimeout(
              function () {
                if (fileController.editor.mathBlock) {
                  fileController.editor.mathBlock.cleanUpAMS();
                }
                fileController.editor.refresh();
              },
              delayRefresh ? 500 : 0,
            );
          }
          if (!onInit) {
            if (skipUndo) {
              fileController.editor.undo.reset();
              fileController.updateChangeCount(fileController.ChangeType.NSChangeAutoSaved);
            } else {
              window.getSelection().removeAllRanges();
            }
            setTimeout(
              function () {
                fileController.editor.selection.scrollAdjust();
              },
              delayRefresh ? 500 : 0,
            );
          }
          if (false === delayRefresh) {
            if (fileController.editor.mathBlock) {
              fileController.editor.mathBlock.cleanUpAMS();
            }
            fileController.editor.refresh();
          }
          if (onInit) {
            if (fileController.option.initAnchor) {
              fileController.editor.tryOpenUrl(fileController.option.initAnchor);
              fileController.option.initAnchor = '';
            } else {
              fileController.editor.selection.jumpIntoElemEnd(jquery('[cid]').last());
              document.querySelector('content').scrollTop = 0;
            }
          }
        }
      },
      copy: editingState.copy,
      delete: editingState.delete,
      editActive: editingState.editActive,
      deleteActive: editingState.deleteActive,
      cut: editingState.cut,
      pasteAsPlainText: editingState.pasteAsPlainText,
      lock: editingState.lock,
      unlock: editingState.unlock,
      toggleSourceMode: editingState.toggleSourceMode,
      isFocusedOnWriteDiv: function () {
        return jquery(document.activeElement).closest('#write').length > 0;
      },
      getCurBlockType: function () {
        try {
          if (
            'write' !== document.activeElement.id &&
            document.activeElement.hasAttribute &&
            document.activeElement.hasAttribute('tabindex')
          ) {
            return jquery(document.activeElement).closest('[mdtype]').attr('mdtype') || '';
          }
          if (rangy.getSelection().rangeCount) {
            var range = fileController.editor.selection.getRangy();
            return jquery(range.commonAncestorContainer).closest('[mdtype]').attr('mdtype') || '';
          }
        } catch (error) {}
        return '';
      },
      winShell: fileIntegration.winShell,
      freshLock: editingState.freshLock,
      setTheme: fileOptions.setTheme,
      getFileName: fileOptions.getFileName,
      getSuggestedFileName: fileOptions.getSuggestedFileName,
      setCanCollapsePinnedOutline: fileOptions.setCanCollapsePinnedOutline,
      refreshImageCopyStatus: function (deferRefresh, disableImageActions) {
        if (deferRefresh) {
          if (timerId) {
            clearTimeout(timerId);
          }
          timerId = setTimeout(function () {
            documentMenu.doRefreshImageCopyStatus(disableImageActions);
          }, 500);
        } else {
          documentMenu.doRefreshImageCopyStatus(disableImageActions);
        }
      },
      onMetaDataChanged: function (immediate) {
        if (timerId) {
          clearTimeout(timerId);
        }
        const refreshMetadataDependentState = () => {
          if (fileController.isNode) {
            fileController.refreshImageCopyStatus(true);
          }
          var localSettingBridge = fileController.editor.localSettingBridge;
          if (localSettingBridge) {
            localSettingBridge.loadFromFile();
          }
          timerId = null;
        };
        if (immediate) {
          refreshMetadataDependentState();
        } else {
          timerId = setTimeout(refreshMetadataDependentState, 100);
        }
      },
      isDocumentEdited: function () {
        if (fileController.isNode) {
          return fileController.changeCounter.isDocumentEdited();
        } else {
          if (fileController.isMac) {
            return bridge.callSync('document.isDocumentEdited');
          } else {
            return void 0;
          }
        }
      },
      trashSelf: function () {
        if (fileController.bundle.filePath) {
          fileController.editor.library.doDeleteFile(
            fileController.bundle.filePath,
            null,
            (deleted) => {
              if (deleted && fileController.isNode) {
                fileController.reloadContent(fileController.editor.warpContentWithOption(''), {
                  fromDiskChange: true,
                });
                recovery.onFilePathRemoved();
                fileController.editor.selection.jumpTop();
              }
            },
          );
        }
      },
      backupWindow: async function (syncFirst) {
        console.debug('backupWindow start');
        if (backupSchedule) {
          window.cancelSmartSchedule(backupSchedule);
          backupSchedule = null;
        }
        if (syncFirst) {
          fileController.sync();
        }
        if (fileController.isNode) {
          if (fileController._onInitParse) {
            fileController.needSaveState = false;
          } else {
            try {
              if (
                !fileController.needSaveState ||
                !fileController.editor.brush.timerID ||
                !fileController.isActiveWindow()
              ) {
                return;
              }
              var hasUnsaved =
                fileController.bundle.hasModified &&
                fileController.changeCounter.isDocumentEdited();
              if (
                !hasUnsaved &&
                fileController.changeCounter.isDiscardableUntitled() &&
                !fileController.mountFolder_
              ) {
                return;
              }
              if (hasUnsaved && fileController.option.enableAutoSave) {
                console.debug('trigger auto save');
                await fileController.saveUseNode(null, true);
                hasUnsaved = fileController.changeCounter.isDocumentEdited();
                console.debug('hasUnsaved = ', !fileController.changeCounter.curState);
              }
              var backupData = {
                path: fileController.bundle.filePath,
                untitledId: fileController.bundle.untitledId || 0,
                type: fileController.bundle.type || '',
                encode: fileController.encode,
                hasUnsaved: hasUnsaved,
                scrollPos: jquery('content').scrollTop(),
                useCRLF: fileController.useCRLF,
                finalNewline: fileController.finalNewline,
                syncDate: new Date() - 0,
                mountFolder: fileController.mountFolder_,
                content: null,
              };
              if (hasUnsaved) {
                fileController.editor.store(null, true);
                backupData.content = fileController.editor.getMarkdown();
              }
              reqnode('electron').ipcRenderer.send('addBackup', JSON.stringify(backupData));
              console.debug('addBackup');
              fileController.needSaveState = false;
              console.sendLogForDebug('backupWindow sent');
              return backupData;
            } catch (error) {
              console.sendError(error);
            }
          }
        }
      },
      scheduleBackupWindow: function () {
        if (fileController.isNode) {
          if (backupSchedule) {
            window.cancelSmartSchedule(backupSchedule);
          }
          backupSchedule = window.requestSmartSchedule(
            async () => {
              console.sendLogForDebug('do BackupWindow');
              await fileController.backupWindow();
            },
            1e3,
            1e4,
          );
        }
      },
      decideLineEnding: fileOptions.decideLineEnding,
    },
    timerId = null,
    recoveryPending = false,
    scheduleDraftRecovery = function () {
      if (
        recoveryPending &&
        fileController.editor.brush &&
        fileController.editor.brush.timerID &&
        fileController.isActiveWindow() &&
        recoveryPending
      ) {
        recoveryPending = false;
        recovery.saveToRecover(fileController.editor.getMarkdown());
      }
    };
  fileController.ChangeType = fileIntegration.ChangeType;
  fileController.isMacLegacy = void 0 !== window.app;
  fileController.isWK = fileController.isWk = window.isWk;
  fileController.isMac = fileController.isMacLegacy || fileController.isWK;
  fileController.isNode = void 0 !== window.reqnode;
  fileController.isMacNode = fileController.isNode && 'darwin' == window.process.platform;
  fileController.isMacOrMacNode = fileController.isMac || fileController.isMacNode;
  fileController.isNodeHtml = window.isOnWindowHtml;
  fileController.isWin = fileController.isNode && 'win32' == window.process.platform;
  fileController.isLinux = fileController.isNode && 'linux' == window.process.platform;
  fileController.isLinuxSnap = fileController.isNode && 'marklyra' == window.process.env.SNAP_NAME;
  fileController.isUnixNode = fileController.isLinux || fileController.isMacNode;
  fileController.FileInfoPanel = recovery;
  fileController.backupVersionWorker = scheduleDraftRecovery;
  fileController.freshMenu = documentMenu.freshMenu;
  fileController.freshMenuWithDelay = documentMenu.freshMenuWithDelay;
  fileController.bindMenu = documentMenu.bindMenu;
  fileController.MenuHelper = documentMenu;
  var normalizedText = navigator.userAgent.toLowerCase();
  fileController.isSafari =
    fileController.isMac ||
    (normalizedText.indexOf('safari/') > -1 && -1 == normalizedText.indexOf('chrome'));
  if (fileController.isMac) {
    JSBridge.invoke('window.loadFinished');
  }
  fileController.startAutoSaveAndBackupService = function () {
    if (fileController.isNode) {
      var autoSaveTimer = fileController.option.autoSaveTimer;
      if (!(autoSaveTimer && !Number.isNaN(autoSaveTimer))) {
        autoSaveTimer = 3;
      }
      setInterval(scheduleDraftRecovery, 6e5);
    }
  };
  fileController.saveAndBackup = function () {
    scheduleDraftRecovery();
  };
  if (fileController.isNode) {
    fileController.fs = reqnode('fs-extra');
    fileController.startAutoSaveAndBackupService();
    setInterval(() => {
      fileController.draftsRecoverList = [];
    }, 144e5);
  }
  window.onPowerChange = function (powerState) {
    console.sendLog(`[powerMonitor] ${powerState}`);
    fileController.draftsRecoverList = [];
  };
  moduleRecord.exports = fileController;
}
