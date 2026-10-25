// document/file-controller.
// SystemJS module 3d. Dependencies: e, 11, 1b, 13, 2c, 29, 33, 36, 3e, 39, 34, 3a, 37, 35, 3f, 3b, 38.
$__System.registerDynamic(
  '3d',
  [
    'e',
    '11',
    '1b',
    '13',
    '2c',
    '29',
    '33',
    '36',
    '3e',
    '39',
    '34',
    '3a',
    '37',
    '35',
    '3f',
    '3b',
    '38',
  ],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var backupSchedule,
      jquery = requireModule('e'),
      utilities = requireModule('11'),
      undoManager = requireModule('1b'),
      documentModel = (undoManager.SnapFlag, requireModule('13')),
      dialogs =
        (documentModel.Node,
        documentModel.TYPE,
        requireModule('2c').safePromise,
        requireModule('29')),
      fileIntegration = requireModule('33'),
      fileOptions = requireModule('36'),
      editingState = requireModule('3e'),
      fileSnapshot = requireModule('39'),
      assetStorage = requireModule('34'),
      textBundle = requireModule('3a'),
      documentMenu = requireModule('37'),
      recovery = requireModule('35'),
      ChangeCounter = (requireModule('3f'), fileIntegration.ChangeCounter),
      Reporter = (fileIntegration.ChangeType, requireModule('3b'), requireModule('38').Reporter),
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
        activeWindow: !0,
        MAX_FILE_SIZE: 2e6,
        option: fileOptions.DEFAULT_OPTIONS,
        needSaveState: !1,
        fileHasModified: !1,
        UNSUPPORTED_REASON: UNSUPPORTED_REASON,
        bundle: {
          filePath: null,
          originalPath: null,
          untitledId: new Date() - 0,
          fileName: null,
          fileEncode: null,
          removed: !1,
          useCRLF: !1,
          unsupported: '',
          hasModified: !1,
          modifiedDate: null,
          lastSnapDate: null,
          savedContent: null,
          isLocked: !1,
          oversize: !1,
          fileMissingWhenOpen: !1,
          bundleFile: null,
          zip: null,
        },
        draftsRecoverList: [],
        setDocumentState: function (bundle) {
          console.debug('File.setDocumentState');
          const { currentFilePath: localFilePath } = bundle;
          fileController.bundle.filePath == localFilePath
            ? Object.assign(fileController.bundle, bundle)
            : ((fileController.bundle = bundle),
              (fileController.bundle.filePath = localFilePath),
              (fileController.isLocked = bundle.isLocked)),
            delete fileController.bundle.currentFilePath,
            fileController.bundle.oversize
              ? ((fileController.bundle.unsupported = UNSUPPORTED_REASON.OVERSIZE),
                fileController.tryEnterOversize(null, !0))
              : fileController.exitOversize(),
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
          (fileController.isLocked = fileController.isMac && fileController.bundle.isLocked),
            (fileController.editor = inputEditor),
            fileController.isMac || (fileController.changeCounter = new ChangeCounter());
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
                !1,
                !0,
              );
            } catch (error) {
              console.sendError(error);
            }
            fileController.needSaveState = !1;
          }
        },
        recoverFromBackup: function (backupData) {
          if (!fileController.isNode) return !1;
          if (!backupData || !backupData.content) return !1;
          if (
            (fileController.setLineEnding(backupData.useCRLF),
            (fileController.bundle.filePath = backupData.path),
            (fileController.bundle.fileEncode = backupData.encode),
            (fileController.bundle.hasModified = !0),
            (fileController.bundle.untitledId = backupData.untitledId),
            (fileController.bundle.type = backupData.type),
            recovery.onFilePathUpdated(),
            fileController.setMountFolder(backupData.mountFolder),
            console.sendLog('recoverFromBackup'),
            fileController.editor.reset(backupData.content),
            fileController.editor.writingArea.focus(),
            fileController.updateChangeCount(fileIntegration.ChangeType.NSChangeDone),
            backupData.path)
          ) {
            fileController.editor.undo.endSnap(!0);
            var recoveryCommand = undoManager.makeEmptyCommand();
            (recoveryCommand.tag = 'reload'),
              recoveryCommand.redo.push(undoManager.buildAllDoc(fileController.editor.nodeMap)),
              fileController.fs.readFile(
                backupData.path,
                backupData.encode || 'utf8',
                function (error, fileContent) {
                  error ||
                    (recoveryCommand.undo.push({ type: 'initSrc', src: fileContent }),
                    fileController.changeCounter.doneStack.unshift(
                      fileIntegration.ChangeType.NSChangeCleared,
                    ),
                    fileController.editor.undo.register(recoveryCommand, !0, void 0, !0));
                },
              );
          }
          return Analytics.record('newWindow', { type: 'recoverBackup' }), !0;
        },
        stillNeedToLoadFromDiskByNode: function (diskContent, snapshot) {
          return !(
            !(
              snapshot &&
              diskContent &&
              snapshot.changeCounter &&
              snapshot.changeCounter.curState
            ) ||
            (diskContent == snapshot.content &&
              (snapshot.fileEncode || 'utf8') == (fileController.bundle.fileEncode || 'utf8'))
          );
        },
        loadFile: async function (inputFilePath, switchDocument, documentData) {
          function i(savedContent) {
            var currentEditor = fileController.editor,
              selection = currentEditor.selection;
            selection && selection.lockNativeScroll(),
              fileController.decideLineEnding(savedContent),
              currentEditor.reset(savedContent),
              (fileController.bundle.savedContent = savedContent),
              currentEditor.writingArea.focus(),
              fileController.option.initAnchor
                ? (currentEditor.tryOpenUrl(fileController.option.initAnchor),
                  (fileController.option.initAnchor = ''))
                : ((fileController._scrollTopTimer = setTimeout(() => {
                    document.querySelector('content').scrollTop = 0;
                  }, 1)),
                  void 0 != savedContent && savedContent.trim().length
                    ? selection &&
                      ((document.querySelector('content').scrollTop = 0),
                      selection.jumpIntoElemEnd(jquery('[cid]').last()),
                      (document.querySelector('content').scrollTop = 0))
                    : (jquery(currentEditor.sessionStr + '>*:first-child').addClass('md-focus'),
                      selection && selection.jumpTop()));
          }
          console.debug('File.loadFile'),
            (fileController.draftsRecoverList = []),
            (fileController.bundle = { filePath: inputFilePath, untitledId: new Date() - 0 }),
            (fileController._onInitParse = !0),
            fileController.editor.brush && fileController.editor.brush.clearAndPause(),
            fileController.editor.library && (fileController.editor.library.stopRename = !0),
            inputFilePath ||
              ('textbundle' === fileController.option.defaultExtension &&
                (fileController.bundle.type = 'textbundle'),
              'textpack' === fileController.option.defaultExtension &&
                (fileController.bundle.type = 'textpack')),
            documentData ||
              (documentData = switchDocument
                ? await JSBridge.invoke('document.switchDocument', inputFilePath)
                : await JSBridge.invoke('document.loadData')),
            fileController.changeCounter && fileController.changeCounter.reset(),
            fileController.editor.undo.reset(),
            fileController.editor.nodeMap.reset(!1, !0),
            editor.fences && editor.fences.onLeaveDocument(),
            editor.mathInline && editor.mathInline.onLeaveDocument(),
            fileController.isNode
              ? await (async function (serializedDocument) {
                  var {
                    snap: snapshot,
                    filePath: localFilePath,
                    backups: backups,
                    shouldReadFromDisk: readFromDisk,
                  } = JSON.parse(serializedDocument);
                  if (!backups || !fileController.recoverFromBackup(backups)) {
                    Analytics.record('newWindow', { type: localFilePath ? 'openFile' : 'newFile' }),
                      console.debug(serializedDocument),
                      window._options.initMountFolder &&
                        (fileController.setMountFolder(window._options.initMountFolder),
                        (window._options.initMountFolder = void 0));
                    var diskContent,
                      fileInfo = null;
                    try {
                      fileInfo =
                        (localFilePath && fileController.fs.statSync(localFilePath)) || null;
                    } catch (error) {
                      (fileInfo = null),
                        'ENOENT' != error.code || switchDocument
                          ? d(error)
                          : (editingState.handleFileNotExist(localFilePath),
                            (fileController.bundle.fileMissingWhenOpen = !0),
                            d(error, !0));
                    }
                    fileInfo
                      ? (fileInfo.isDirectory()
                          ? (diskContent = await assetStorage.loadFile(localFilePath))
                          : fileInfo.isFile() &&
                            (diskContent = /\.textpack$/.exec(localFilePath)
                              ? await textBundle.loadFile(localFilePath)
                              : await (async function () {
                                  var [loaded, savedContent, encoding] =
                                    await fileController.readContentFrom(localFilePath);
                                  if (loaded)
                                    return (
                                      (fileController.bundle.fileEncode = encoding || 'utf8'),
                                      (fileController.bundle.filePath = localFilePath),
                                      (fileController.bundle.savedContent = savedContent),
                                      (fileController.bundle.modifiedDate = new Date()),
                                      savedContent
                                    );
                                  d(savedContent);
                                })()),
                        recovery.onFilePathUpdated())
                      : (diskContent = ''),
                      fileController.stillNeedToLoadFromDiskByNode(diskContent, snapshot) &&
                        (readFromDisk = !0),
                      (snapshot || {}).nodeMap
                        ? fileController.restoreEditStateFromData(
                            snapshot,
                            !1,
                            !0,
                            readFromDisk,
                            diskContent,
                          )
                        : (i(diskContent),
                          JSBridge.invoke(
                            'document.setLastSync',
                            fileController.bundle.modifiedDate,
                          )),
                      fileController.onFileOpened();
                  }
                  function d(loadError, suppressWarning) {
                    if (
                      (console.warn(`onLoadFail ${fileController.bundle.filePath}`),
                      !suppressWarning)
                    ) {
                      if (!fileController.option.silentOpenFailure) {
                        var errorMessage = loadError.message || '';
                        debugMode ||
                          (errorMessage =
                            (errorMessage.splits && errorMessage.splits(/\n/)[0]) || errorMessage),
                          dialogs.showErrorDialog('Failed to load file', errorMessage),
                          fileController.editor &&
                            fileController.editor.library &&
                            fileController.editor.library.isFileTabShown() &&
                            fileController.editor.library.refreshPanelCommand();
                      }
                      fileController.option.silentOpenFailure = !1;
                    }
                    'ENOENT' == loadError.code
                      ? (recovery.onFilePathUpdated(), recovery.onFilePathRemoved())
                      : (fileController.bundle.filePath &&
                          (JSBridge.invoke(
                            'document.switchToUntitled',
                            fileController.bundle.filePath,
                          ),
                          (fileController.bundle.filePath = '')),
                        recovery.onFilePathUpdated());
                  }
                })(documentData)
              : fileController.isMac
                ? await (function (documentData) {
                    const [savedContent, snapshot, documentState] = documentData;
                    fileController.setDocumentState(documentState),
                      recovery.onFilePathUpdated(),
                      (fileController.bundle.savedContent = savedContent),
                      (fileController.bundle.modifiedDate = new Date()),
                      snapshot && snapshot.nodeMap
                        ? (console.debug(snapshot),
                          fileController.restoreEditStateFromData(
                            snapshot,
                            !1,
                            !0,
                            snapshot.isOutDated,
                            savedContent,
                          ))
                        : (console.debug(savedContent.substr(0, 100) + '...'), i(savedContent));
                  })(documentData)
                : (recovery.onFilePathUpdated(), i('')),
            fileController.isTextBundle()
              ? await assetStorage.recordUnusedAssets()
              : await textBundle.recordUnusedAssets(),
            switchDocument &&
              (fileController.bundle.filePath ||
                fileController.editor.undo.hasUndo() ||
                fileController.updateChangeCount(fileIntegration.ChangeType.NSChangeDone),
              fileController.inBusyMode || fileController.recoverPosOrScroll(),
              fileController.option.lastExport &&
                (fileController.option.lastExportNoOverwrite = !0),
              (window._hasSwitchCallback = !1)),
            fileController.editor.brush && fileController.editor.brush.restart(),
            fileController.editor.library && (fileController.editor.library.stopRename = !1),
            fileController.editor.library && fileController.editor.library.markCurrentFile(),
            (fileController._onInitParse = !1),
            fileController.freshMenu();
        },
        readContentFrom: async function (filePath, encodingOverride) {
          if ((console.sendLog(`readContentFrom ${filePath}`), fileController.isMac))
            return await new Promise((resolvePromise) => {
              bridge.callHandler('document.getContent', function (sourceText) {
                (sourceText = fileController.tryEnterOversize(sourceText || '')),
                  resolvePromise([!0, sourceText]);
              });
            });
          if (!fileController.isNode) return [!0, ''];
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
              return (
                (fileController.bundle.modifiedDate = fileInfo.mtimeMs),
                fileBytes.length > fileController.MAX_FILE_SIZE
                  ? ((fileController.bundle.unsupported = UNSUPPORTED_REASON.OVERSIZE),
                    (decodedText = ''),
                    fileController.tryEnterOversize(null, !0))
                  : (fileController.exitOversize(),
                    (encoding =
                      encoding ||
                      fileIntegration.getItemInDB('[encode]' + filePath) ||
                      fileIntegration.detectEncodeByNode(fileBytes)),
                    console.debug('use encode: ' + encoding),
                    (decodedText = fileIntegration.getContentFromBuffer(
                      fileBytes,
                      (encoding || '').replace('-bom', ''),
                      () => {
                        encoding = (encoding || 'utf8').replace('-bom', '') + '-bom';
                      },
                    ))),
                [!0, decodedText, encoding, fileBytes]
              );
            }
            return [!0, ''];
          } catch (error) {
            return [!1, error];
          }
        },
        getContent: async function (pathOverride, encodingOverride) {
          if (!pathOverride && fileController.isTextBundle())
            return await assetStorage.quickGetContent(assetStorage.getTextFile());
          if (!pathOverride && fileController.isTextPack()) throw new Error('not implemented');
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
            if (((contentOrError = ''), !fileController.option.silentOpenFailure)) {
              var errorMessage = loadError.message || '';
              debugMode ||
                (errorMessage =
                  (errorMessage.splits && errorMessage.splits(/\n/)[0]) || errorMessage),
                dialogs.showErrorDialog('Failed to load file', errorMessage),
                fileController.editor &&
                  fileController.editor.library &&
                  fileController.editor.library.isFileTabShown() &&
                  fileController.editor.library.refreshPanelCommand();
            }
            return (
              (fileController.option.silentOpenFailure = !1),
              targetPath && JSBridge.invoke('document.switchToUntitled', targetPath),
              ''
            );
          }
          try {
            recovery.saveToRecover(fileBytes);
          } catch (error) {
            console.sendError(error, 'skip');
          }
          return contentOrError;
        },
        syncContentForSave: function (editedOverride) {
          let content = fileController.sync(!0, !1, !0, editedOverride),
            assets = Array.from(
              fileController.isTextBundle() ? assetStorage.getAllUsedAssets(!0) : [],
            );
          return (
            fileController.markSaved && fileController.markSaved(),
            { content: content, assets: assets }
          );
        },
        setContent: async function (content, isMac) {
          fileController.bundle.unsupported ||
            (console.debug('setContent'),
            (fileController.isMac || isMac) &&
              (console.debug('do setContent'),
              !(await JSBridge.invoke('document.setContent', content)) &&
                fileController.editor.tryEnterBusyMode(content, !0)));
        },
        getMountFolder: function () {
          return fileController.mountFolder_;
        },
        setMountFolder: function (mountFolder_, unusedParameter2) {
          mountFolder_ && (mountFolder_ = mountFolder_.replace(/[\/\\]$/, '')),
            (fileController.mountFolder_ = mountFolder_);
        },
        sync: function (isMac, forceHostSync, skipHostUpdate, editedOverride) {
          if (!fileController.bundle.unsupported && fileController.editor) {
            var sourceText = '';
            if (fileController.editor.sourceView && fileController.editor.sourceView.inSourceMode) {
              if (
                ((sourceText = fileController.editor.sourceView.cm.getValue(
                  fileController.useCRLF ? '\r\n' : '\n',
                )),
                !skipHostUpdate && fileController.setContent(sourceText, forceHostSync),
                fileController.isMac && isMac)
              ) {
                var documentEdited = editedOverride;
                void 0 == documentEdited && (documentEdited = fileController.isDocumentEdited()),
                  documentEdited && fileController.editor.sourceView.onSave();
              }
              return sourceText;
            }
            fileController.editor.store(null, !0),
              isInputComponent(document.activeElement) &&
                jquery(document.activeElement).trigger('change').trigger('inline-change');
            try {
              fileController.editor.autoRemoveUnholdable(!0);
            } catch (error) {
              console.sendError(error, 'warning');
            }
            var markdown = fileController.editor.getMarkdown();
            return !skipHostUpdate && fileController.setContent(markdown, forceHostSync), markdown;
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
          if (!fileController.bundle.unsupported)
            if (
              (changeType != fileController.ChangeType.NodeSaveFailed &&
                changeType != fileController.ChangeType.NSChangeAutoSaved &&
                ((fileController.needSaveState = !0), fileController.scheduleBackupWindow()),
              fileController.editor.sourceView && fileController.editor.sourceView.inSourceMode)
            )
              fileController.isMac
                ? changeType == fileController.ChangeType.NSChangeAutoSaved
                  ? bridge.callHandler('document.updateChangeCount', changeType)
                  : changeType == fileController.ChangeType.NSChangeCleared
                    ? bridge.callHandler('document.updateChangeCount', changeType)
                    : bridge.callHandler(
                        'document.updateChangeCountIfUnedited',
                        fileController.ChangeType.NSChangeDone,
                      )
                : fileController.changeCounter.updateChangeCount(changeType);
            else {
              changeType !== fileController.ChangeType.NSChangeAutoSaved &&
                changeType != fileController.ChangeType.NodeSaveFailed &&
                fileController.needsUpdateSnap();
              var historyMenu = null;
              fileController.isMac
                ? (bridge.callHandler('document.updateChangeCount', changeType),
                  (historyMenu = {
                    'Edit→Undo': { enabled: fileController.editor.undo.hasUndo() },
                    'Edit→Redo': { enabled: fileController.editor.undo.hasRedo() },
                  }))
                : (fileController.changeCounter.updateChangeCount(changeType),
                  (recoveryPending =
                    changeType !== fileController.ChangeType.NSChangeAutoSaved ||
                    changeType == fileController.ChangeType.NodeSaveFailed),
                  fileController.isNode &&
                    (historyMenu = {
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
                    })),
                JSBridge.menu.update(historyMenu);
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
          if (!snapshot || !snapshot.undoRedo || !snapshot.nodeMap) return !0;
          if (snapshot.timeStamp > 0 && snapshot.timeStamp == fileController.bundle.lastSnapDate)
            return !0;
          (fileController.bundle.hasModified = !0),
            fileController.isNode &&
              !fileController.bundle.modifiedDate &&
              (fileController.bundle.modifiedDate = snapshot.lastSync),
            console.sendLog(`do restoreEditStateFromData ${inputOnInit} ${reloadFromDisk}`);
          var previousScrollTop = null,
            currentEditor = fileController.editor,
            inSourceMode = currentEditor.sourceView && currentEditor.sourceView.inSourceMode;
          (fileController.editor.focusCid = null),
            (fileController.editor.lastCursor = null),
            currentEditor.nodeMap.restoreFromJson(JSON.parse(snapshot.nodeMap)),
            currentEditor.undo.restoreFromJson(JSON.parse(snapshot.undoRedo)),
            fileController.setLineEnding(snapshot.useCRLF),
            (fileController.finalNewline = snapshot.finalNewline),
            (fileController.bundle.lastSnapDate = snapshot.timeStamp);
          let bundleSnapshot = JSON.parse(snapshot.bundle || '{}');
          (fileController.bundle.unusedAssets = bundleSnapshot.unusedAssets),
            (fileController.bundle.deletedAssetsMap = bundleSnapshot.deletedAssetsMap),
            (fileController.bundle.assetsChanges = bundleSnapshot.assetsChanges),
            (fileController.bundle.unzipFolder = bundleSnapshot.unzipFolder);
          var cursorSnapshot = JSON.parse(snapshot.cursorPos || '{}');
          function h() {
            if (
              (fileController.editor.tryEnterBusyMode(),
              fileController.editor.writingArea.focus(),
              fileController.onMetaDataChanged(),
              positionRestore)
            ) {
              if ('object' == typeof positionRestore)
                try {
                  currentEditor.undo.exeCommand(positionRestore);
                } catch (error) {}
            } else
              previousScrollTop ||
                ((fileController._scrollTopTimer = setTimeout(() => {
                  document.querySelector('content').scrollTop = 0;
                }, 1)),
                fileController.editor.selection.jumpIntoElemEnd(jquery('[cid]').last()),
                (document.querySelector('content').scrollTop = 0));
          }
          if (
            (fileController.isTextPack() && (reloadFromDisk = !1),
            inSourceMode
              ? (positionRestore &&
                  (previousScrollTop = currentEditor.sourceView.cm.getScrollInfo().top),
                snapshot.srcHist &&
                  (fileController.reloadContent(snapshot.srcContent, {
                    skipUndo: !0,
                    skipChangeCount: !0,
                  }),
                  currentEditor.sourceView.cm.doc.clearHistory(),
                  currentEditor.sourceView.cm.doc.setHistory(JSON.parse(snapshot.srcHist))),
                snapshot.fromSourceMode ||
                  fileController.reloadContent(snapshot.content, {
                    skipChangeCount:
                      inputOnInit || (fileController.isMac && !fileController.isDocumentEdited()),
                  }),
                positionRestore && currentEditor.sourceView.cm.scrollTo(0, previousScrollTop))
              : (positionRestore && (previousScrollTop = jquery('content').scrollTop()),
                snapshot.fromSourceMode
                  ? (fileController.reloadContent(snapshot.srcContent, {
                      skipChangeCount: !0,
                      onInit: inputOnInit,
                    }),
                    setTimeout(function () {
                      null !== previousScrollTop && jquery('content').scrollTop(previousScrollTop);
                    }, 0))
                  : reloadFromDisk ||
                    (!fileController.inBusyMode &&
                      currentEditor.nodeMap.allNodes.length > 1e4 &&
                      currentEditor.tryEnterBusyMode(void 0, void 0, !0),
                    jquery(currentEditor.sessionStr).html(
                      documentModel.NodeCollectionUtils.toHTML(currentEditor.nodeMap.blocks, {
                        focus: cursorSnapshot ? cursorSnapshot.id : void 0,
                      }),
                    ),
                    inputOnInit || (currentEditor.focusCid = void 0),
                    setTimeout(function () {
                      currentEditor.mathBlock && currentEditor.mathBlock.cleanUpAMS(),
                        currentEditor.refresh(),
                        fileController.option.initAnchor
                          ? (currentEditor.tryOpenUrl(fileController.option.initAnchor),
                            (fileController.option.initAnchor = ''))
                          : previousScrollTop && jquery('content').scrollTop(previousScrollTop);
                    }, 200),
                    h())),
            (fileController._needsUpdateSnap = !1),
            fileController.isNode &&
              (fileController.changeCounter.reset(snapshot.changeCounter),
              (fileController.bundle.hasModified = fileController.changeCounter.isDocumentEdited()),
              fileController.editor.spellChecker && fileController.editor.spellChecker.reset(!0)),
            reloadFromDisk)
          )
            (void 0 != diskContentOverride
              ? Promise.resolve(diskContentOverride)
              : fileController.getContent()
            ).then(function (savedContent) {
              (fileController.bundle.savedContent = savedContent),
                (fileController.bundle.modifiedDate = new Date()),
                fileController.reloadContent(savedContent, {
                  fromDiskChange: !0,
                  onInit: inputOnInit,
                }),
                fileController.updateChangeCount(
                  fileController.isMac
                    ? fileController.ChangeType.NSChangeCleared
                    : fileController.ChangeType.NSChangeAutoSaved,
                ),
                (fileController._needsUpdateSnap = new Date()),
                h();
            });
          else {
            var wordCount = fileController.editor.wordCount;
            wordCount && wordCount.update(), fileController.freshMenuWithDelay();
          }
        },
        needsUpdateSnap: function () {
          fileController.isMac && bridge.callHandler('document.needsUpdateSnap'),
            (fileController._needsUpdateSnap = new Date());
        },
        backupDocumentSnap: async function () {
          fileController.editor &&
            ((fileController.editor.lastCursor = fileController.editor.selection.buildUndo()),
            fileController.isMac
              ? await new Promise(function (resolvePromise) {
                  bridge.callHandler('document.requestBuildSnap', resolvePromise);
                })
              : fileController.isNode &&
                (fileController.isFileLoading() ||
                  window._onBackup ||
                  (await fileController.buildDocumentSnapForNode())));
        },
        generateSnap: function (contentOverride) {
          if (!fileController.bundle.unsupported) {
            var snapshotContent =
                void 0 == contentOverride ? fileController.sync(!1, !0) : contentOverride,
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
            return (
              inSourceMode &&
                ((snapshot.fromSourceMode = !0),
                (snapshot.srcHist = JSON.stringify(
                  fileController.editor.sourceView.cm.doc.getHistory(),
                ))),
              fileController.isNode &&
                ((snapshot.fileEncode = fileController.bundle.fileEncode),
                (snapshot.changeCounter = fileController.changeCounter.clone())),
              snapshot
            );
          }
        },
        buildDocumentSnapForNode: async function (reuseMatchingSnapshot) {
          if (fileController.bundle.unsupported || !fileController.isNode) return Promise.resolve();
          if (!fileController._needsUpdateSnap && !fileController.isActiveWindow())
            return Promise.resolve();
          window._onBackup = !0;
          var content = fileController.sync(!1, !0),
            currentSnap = null;
          if (fileController._needsUpdateSnap)
            (currentSnap = fileController.generateSnap(content)),
              await JSBridge.invoke(
                'document.addSnapAndLastSync',
                JSON.stringify({ snap: currentSnap, lastSync: fileController.bundle.modifiedDate }),
              );
          else if (
            reuseMatchingSnapshot &&
            ((currentSnap = JSON.parse((await JSBridge.invoke('document.getSnap', 0)) || 'null')),
            console.debug('update snap cursor'),
            currentSnap && currentSnap.content == content)
          ) {
            var inSourceMode = fileController.editor.sourceView.inSourceMode;
            (currentSnap.cursorPos = JSON.stringify(fileController.editor.selection.storeToJson())),
              (currentSnap.scrollOffset = inSourceMode ? 0 : jquery('content').scrollTop()),
              await JSBridge.invoke('document.addSnap', JSON.stringify(currentSnap || null));
          }
          (fileController._needsUpdateSnap = !1),
            currentSnap && (fileController.bundle.lastSnapDate = currentSnap.timeStamp),
            (window._onBackup = !1);
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
          )
            if (
              (console.sendLog(
                `presentedItemChanged, path is ${utilities.hashCode(changedPath)}`,
                !0,
              ),
              locationChanged && clientHandlerOnPresentationMoved(),
              fileController.isNode)
            ) {
              if (fileController.bundle.filePath) {
                if (fileController.inSavingProcess) return;
                if (
                  fileController.bundle.modifiedDate &&
                  new Date() - fileController.bundle.modifiedDate < 500
                )
                  return void (window.debugMode && console.debug('skip as just saved'));
              } else recovery.onFilePathRemoved();
              if (fileController.bundle.filePath) {
                if (
                  (console.debug('check mtime on disk'),
                  !fileInfo || fileController.bundle.modifiedDate >= fileInfo.mtimeMs)
                )
                  return void console.sendLog('presentedItemChanged ignored', !0);
                fileController.bundle.modifiedDate = fileInfo.mtimeMs;
                if (
                  fileController.bundle.filePath &&
                  (await i()) === fileController.bundle.savedContent
                )
                  return void console.sendLog(
                    'presentedItemChanged ignore because content not changed',
                    !0,
                  );
                console.sendLog('presentedItemChanged did happen'),
                  fileController.changeCounter.isDocumentEdited()
                    ? ((fileController._isAskingForContentReload = !0),
                      dialogs.confirm(
                        jquery.localize.getString(
                          'File content is changed by external applications. Reload content from disk ?',
                        ) +
                          ' ' +
                          jquery.localize.getString(
                            'You could undo this operation later via `Edit` → `Undo`.',
                          ),
                        function () {
                          (fileController._isAskingForContentReload = !1), a(!0);
                        },
                        function () {
                          (fileController._isAskingForContentReload = !1), a(!1);
                        },
                      ))
                    : ((fileController._isAskingForContentReload = !1), a(!0));
              } else console.debug('presentedItemChanged ignored');
            } else
              fileController.isMac &&
                ((fileController.isDocumentEdited() &&
                  !confirm(
                    jquery.localize.getString(
                      'File content is changed by external applications. Reload content from disk ?',
                    ) +
                      ' ' +
                      jquery.localize.getString(
                        'You could undo this operation later via `Edit` → `Undo`.',
                      ),
                  )) ||
                  bridge.callHandler('document.refreshContentFromDisk'));
          function i() {
            return (
              console.sendLog('getDataFromFile'),
              new Promise(function (resolvePromise) {
                fileController.isMac
                  ? bridge.callHandler('document.getDataFromFile', resolvePromise)
                  : fileController.isNode
                    ? fileController.isTextBundle()
                      ? assetStorage
                          .quickGetContent(assetStorage.getTextFile(), !0)
                          .then(resolvePromise)
                      : fileController
                          .getContent(
                            fileController.bundle.filePath,
                            fileController.bundle.fileEncode,
                          )
                          .then(resolvePromise)
                    : resolvePromise('');
              })
            );
          }
          function a(reloadConfirmed) {
            console.sendLog('doHandlerPresentedItemChange');
            var previousScrollTop = jquery('content').scrollTop();
            reloadConfirmed
              ? i().then(function (savedContent) {
                  if (fileController.bundle.unsupported)
                    fileController.isNode &&
                      (console.sendLog('document.enterOversize'),
                      JSBridge.invoke('document.enterOversize'));
                  else {
                    fileController.reloadContent(savedContent, { fromDiskChange: !0 }),
                      fileController.updateChangeCount(fileController.ChangeType.NSChangeAutoSaved);
                    var sourceView = fileController.editor.sourceView;
                    if (sourceView.inSourceMode) {
                      var top = sourceView.cm.getScrollInfo().top,
                        selections = sourceView.cm.listSelections();
                      sourceView.setValue(savedContent),
                        sourceView.cm.setSelections(selections),
                        sourceView.cm.scrollTo(0, top);
                    }
                    setTimeout(function () {
                      fileController.setContent(savedContent),
                        jquery('content').scrollTop(previousScrollTop);
                    }, 0),
                      (fileController.bundle.savedContent = savedContent),
                      (fileController.bundle.modifiedDate = new Date());
                  }
                })
              : fileController.updateChangeCount(
                  fileController.ChangeType.NSChangeReadOtherContents,
                );
          }
        },
        reloadWithEncoding: function (fileEncode) {
          fileController.isTextBundle() ||
            fileController.isTextPack() ||
            (fileController.isNode &&
              fileController.bundle.filePath &&
              fileEncode != fileController.bundle.fileEncode &&
              (fileIntegration.setItemInDB('[encode]' + fileController.bundle.filePath, fileEncode),
              (fileController.bundle.fileEncode = fileEncode),
              fileController
                .getContent(fileController.bundle.filePath, fileEncode)
                .then(function (result) {
                  fileController.reloadContent(result),
                    fileController.updateChangeCount(fileController.ChangeType.NSChangeCleared);
                })));
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
          if (
            (console.sendLog(`File.reloadContent, ${JSON.stringify(reloadOptions)}`),
            (fileController.bundle.assetsChanges = null),
            !fileController.bundle.unsupported &&
              fileController.isMac &&
              fromDiskChange &&
              ((sourceText = fileController.tryEnterOversize(sourceText)),
              fileController.bundle.unsupported &&
                (console.sendLog('document.enterOversize'),
                bridge.callHandler('document.enterOversize'))),
            !fileController.bundle.unsupported)
          ) {
            fromDiskChange && fileController.needsUpdateSnap(),
              fileController.editor.undo.endSnap(!0);
            var parseResult,
              cursorPosition,
              top,
              reloadCommand = undoManager.makeEmptyCommand(),
              inSourceMode =
                fileController.editor.sourceView && fileController.editor.sourceView.inSourceMode;
            if (
              ((reloadCommand.tag = 'reload'),
              fileController.decideLineEnding(sourceText),
              inSourceMode ||
                onInit ||
                skipStore ||
                (fileController.editor.store(),
                reloadCommand.undo.push(fileController.editor.selection.buildUndo())),
              (fileController.editor.focusCid = null),
              (fileController.editor.lastCursor = null),
              reloadCommand.undo.push(
                undoManager.buildAllDoc(fileController.editor.nodeMap, fromDiskChange),
              ),
              inSourceMode &&
                ((top = fileController.editor.sourceView.cm.getScrollInfo().top),
                (cursorPosition = fileController.editor.sourceView.cm.getCursor()),
                fileController.editor.sourceView.setValue(
                  sourceText,
                  !0,
                  fromDiskChange || skipChangeCount ? 'fromDisk' : 'begin',
                )),
              (inSourceMode && fromDiskChange) ||
                (fileController.editor.nodeMap.reset(),
                (parseResult = documentModel.Node.parseFrom(
                  sourceText,
                  fileController.editor.nodeMap,
                  {
                    skips: { old_code: !1 },
                  },
                ))[1].map(function (item) {
                  item.set('attachTo', fileController.editor.nodeMap);
                }),
                reloadCommand.redo.push(
                  undoManager.buildAllDoc(fileController.editor.nodeMap, fromDiskChange),
                ),
                (reloadCommand.date = new Date()),
                fileController.editor.tryEnterBusyMode(sourceText),
                inSourceMode
                  ? ((fileController.editor.sourceView.renderedHTML = parseResult[0]),
                    fileController.editor.undo.register(reloadCommand, skipChangeCount))
                  : fileController.isMac && parseResult[0].length > 1e5
                    ? ((fileController.editor.writingArea.innerHTML = parseResult[0]),
                      console.debug('hotfix for macOS slowness'),
                      setTimeout(() => {
                        (fileController.editor.writingArea.innerHTML = parseResult[0]),
                          fileController.editor.runAllScript(),
                          window.Reporter.fullValidate();
                      }, 0))
                    : ((fileController.editor.writingArea.innerHTML = parseResult[0]),
                      fileController.editor.runAllScript(),
                      window.Reporter.fullValidate())),
              inSourceMode)
            ) {
              var inputField = fileController.editor.sourceView.cm.getInputField();
              return (
                inputField.setSelectionRange && inputField.setSelectionRange(0, 0),
                fileController.editor.sourceView.cm.setCursor(cursorPosition),
                void (
                  fromDiskChange &&
                  void 0 !== top &&
                  fileController.editor.sourceView.cm.scrollTo(0, top)
                )
              );
            }
            if (fromDiskChange) {
              var previousHistoryEntry =
                  fileController.editor.undo.lastRegisteredOperationCommand(),
                previousUndoAction = previousHistoryEntry && previousHistoryEntry.undo.last();
              previousUndoAction &&
                'reload' == previousUndoAction.type &&
                previousUndoAction.reloadFromDisk &&
                previousHistoryEntry.date > new Date() - 1e3 &&
                ((reloadCommand.undo = [previousUndoAction]),
                fileController.editor.undo.removeLastRegisteredOperationCommand());
            }
            skipUndo || fileController.editor.undo.register(reloadCommand, skipChangeCount),
              !1 !== delayRefresh &&
                setTimeout(
                  function () {
                    fileController.editor.mathBlock && fileController.editor.mathBlock.cleanUpAMS(),
                      fileController.editor.refresh();
                  },
                  delayRefresh ? 500 : 0,
                ),
              onInit ||
                (skipUndo
                  ? (fileController.editor.undo.reset(),
                    fileController.updateChangeCount(fileController.ChangeType.NSChangeAutoSaved))
                  : window.getSelection().removeAllRanges(),
                setTimeout(
                  function () {
                    fileController.editor.selection.scrollAdjust();
                  },
                  delayRefresh ? 500 : 0,
                )),
              !1 === delayRefresh &&
                (fileController.editor.mathBlock && fileController.editor.mathBlock.cleanUpAMS(),
                fileController.editor.refresh()),
              onInit &&
                (fileController.option.initAnchor
                  ? (fileController.editor.tryOpenUrl(fileController.option.initAnchor),
                    (fileController.option.initAnchor = ''))
                  : (fileController.editor.selection.jumpIntoElemEnd(jquery('[cid]').last()),
                    (document.querySelector('content').scrollTop = 0)));
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
            )
              return jquery(document.activeElement).closest('[mdtype]').attr('mdtype') || '';
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
          deferRefresh
            ? (timerId && clearTimeout(timerId),
              (timerId = setTimeout(function () {
                documentMenu.doRefreshImageCopyStatus(disableImageActions);
              }, 500)))
            : documentMenu.doRefreshImageCopyStatus(disableImageActions);
        },
        onMetaDataChanged: function (immediate) {
          timerId && clearTimeout(timerId);
          const t = () => {
            fileController.isNode && fileController.refreshImageCopyStatus(!0);
            var localSettingBridge = fileController.editor.localSettingBridge;
            localSettingBridge && localSettingBridge.loadFromFile(), (timerId = null);
          };
          immediate ? t() : (timerId = setTimeout(t, 100));
        },
        isDocumentEdited: function () {
          return fileController.isNode
            ? fileController.changeCounter.isDocumentEdited()
            : fileController.isMac
              ? bridge.callSync('document.isDocumentEdited')
              : void 0;
        },
        trashSelf: function () {
          fileController.bundle.filePath &&
            fileController.editor.library.doDeleteFile(
              fileController.bundle.filePath,
              null,
              (deleted) => {
                deleted &&
                  fileController.isNode &&
                  (fileController.reloadContent(fileController.editor.warpContentWithOption(''), {
                    fromDiskChange: !0,
                  }),
                  recovery.onFilePathRemoved(),
                  fileController.editor.selection.jumpTop());
              },
            );
        },
        backupWindow: async function (syncFirst) {
          if (
            (console.debug('backupWindow start'),
            backupSchedule && (window.cancelSmartSchedule(backupSchedule), (backupSchedule = null)),
            syncFirst && fileController.sync(),
            fileController.isNode)
          )
            if (fileController._onInitParse) fileController.needSaveState = !1;
            else
              try {
                if (
                  !fileController.needSaveState ||
                  !fileController.editor.brush.timerID ||
                  !fileController.isActiveWindow()
                )
                  return;
                var hasUnsaved =
                  fileController.bundle.hasModified &&
                  fileController.changeCounter.isDocumentEdited();
                if (
                  !hasUnsaved &&
                  fileController.changeCounter.isDiscardableUntitled() &&
                  !fileController.mountFolder_
                )
                  return;
                hasUnsaved &&
                  fileController.option.enableAutoSave &&
                  (console.debug('trigger auto save'),
                  await fileController.saveUseNode(null, !0),
                  (hasUnsaved = fileController.changeCounter.isDocumentEdited()),
                  console.debug('hasUnsaved = ', !fileController.changeCounter.curState));
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
                return (
                  hasUnsaved &&
                    (fileController.editor.store(null, !0),
                    (backupData.content = fileController.editor.getMarkdown())),
                  reqnode('electron').ipcRenderer.send('addBackup', JSON.stringify(backupData)),
                  console.debug('addBackup'),
                  (fileController.needSaveState = !1),
                  console.sendLogForDebug('backupWindow sent'),
                  backupData
                );
              } catch (error) {
                console.sendError(error);
              }
        },
        scheduleBackupWindow: function () {
          fileController.isNode &&
            (backupSchedule && window.cancelSmartSchedule(backupSchedule),
            (backupSchedule = window.requestSmartSchedule(
              async () => {
                console.sendLogForDebug('do BackupWindow'), await fileController.backupWindow();
              },
              1e3,
              1e4,
            )));
        },
        decideLineEnding: fileOptions.decideLineEnding,
      },
      timerId = null,
      recoveryPending = !1,
      E = function () {
        recoveryPending &&
          fileController.editor.brush &&
          fileController.editor.brush.timerID &&
          fileController.isActiveWindow() &&
          recoveryPending &&
          ((recoveryPending = !1), recovery.saveToRecover(fileController.editor.getMarkdown()));
      };
    (fileController.ChangeType = fileIntegration.ChangeType),
      (fileController.isMacLegacy = void 0 !== window.app),
      (fileController.isWK = fileController.isWk = window.isWk),
      (fileController.isMac = fileController.isMacLegacy || fileController.isWK),
      (fileController.isNode = void 0 !== window.reqnode),
      (fileController.isMacNode = fileController.isNode && 'darwin' == window.process.platform),
      (fileController.isMacOrMacNode = fileController.isMac || fileController.isMacNode),
      (fileController.isNodeHtml = window.isOnWindowHtml),
      (fileController.isWin = fileController.isNode && 'win32' == window.process.platform),
      (fileController.isLinux = fileController.isNode && 'linux' == window.process.platform),
      (fileController.isLinuxSnap =
        fileController.isNode && 'marklyra' == window.process.env.SNAP_NAME),
      (fileController.isUnixNode = fileController.isLinux || fileController.isMacNode),
      (fileController.FileInfoPanel = recovery),
      (fileController.backupVersionWorker = E),
      (fileController.freshMenu = documentMenu.freshMenu),
      (fileController.freshMenuWithDelay = documentMenu.freshMenuWithDelay),
      (fileController.bindMenu = documentMenu.bindMenu),
      (fileController.MenuHelper = documentMenu);
    var normalizedText = navigator.userAgent.toLowerCase();
    (fileController.isSafari =
      fileController.isMac ||
      (normalizedText.indexOf('safari/') > -1 && -1 == normalizedText.indexOf('chrome'))),
      fileController.isMac && JSBridge.invoke('window.loadFinished'),
      (fileController.startAutoSaveAndBackupService = function () {
        if (fileController.isNode) {
          var autoSaveTimer = fileController.option.autoSaveTimer;
          (autoSaveTimer && !Number.isNaN(autoSaveTimer)) || (autoSaveTimer = 3),
            setInterval(E, 6e5);
        }
      }),
      (fileController.saveAndBackup = function () {
        E();
      }),
      fileController.isNode &&
        ((fileController.fs = reqnode('fs-extra')),
        fileController.startAutoSaveAndBackupService(),
        setInterval(() => {
          fileController.draftsRecoverList = [];
        }, 144e5)),
      (window.onPowerChange = function (powerState) {
        console.sendLog(`[powerMonitor] ${powerState}`), (fileController.draftsRecoverList = []);
      }),
      (moduleRecord.exports = fileController);
  },
);
