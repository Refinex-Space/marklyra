// document/file-snapshot.
export default function initializeDocumentFileSnapshot(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery'),
    utilities = requireModule('shared/utilities'),
    dialogs = (requireModule('host/environment'), requireModule('ui/dialogs')),
    fileIntegration = requireModule('host/file-integration'),
    assetStorage = requireModule('media/asset-storage'),
    textBundle = requireModule('document/text-bundle'),
    recovery = requireModule('document/recovery'),
    fileWriter =
      ((fileIntegration = requireModule('host/file-integration')),
      requireModule('document/file-writer')),
    Reporter = requireModule('host/local-diagnostics').Reporter,
    swapItems = Object.defineProperty(
      function (items, leftIndex, rightIndex) {
        var leftItem = items[leftIndex];
        items[leftIndex] = items[rightIndex];
        items[rightIndex] = leftItem;
      },
      'name',
      { value: 'h', configurable: true },
    ),
    buildSaveDialogOptions = Object.defineProperty(
      function (preferAllFiles, defaultPath, dialogOptions) {
        dialogOptions = dialogOptions || {};
        var filters = [
          {
            name: jquery.localize.getString('Markdown File', 'Panel'),
            extensions: ['md', 'markdown', 'mmd', 'mdwn', 'mdown'],
          },
          { name: jquery.localize.getString('TextBundle', 'Panel'), extensions: ['textbundle'] },
          {
            name: jquery.localize.getString('Plain Text File', 'Panel'),
            extensions: ['txt', 'text', ''],
          },
        ];
        if (preferAllFiles) {
          filters.push({
            name: jquery.localize.getString('All Files', 'Panel'),
            extensions: ['*'],
          });
        }
        if (/\.textbundle$/i.exec(defaultPath)) {
          swapItems(filters, 0, 1);
        } else {
          if (/\.(txt|text)$/i.exec(defaultPath)) {
            swapItems(filters, 0, 2);
          } else {
            if (/[\\\/][^\\\/\.]+$/i.exec(defaultPath)) {
              swapItems(filters, 0, 2);
            } else {
              if (!/\.(md|markdown|mmd|mdwn|mdown)$/i.exec(defaultPath)) {
                if (!preferAllFiles) {
                  filters.push({
                    name: jquery.localize.getString('All Files', 'Panel'),
                    extensions: ['*'],
                  });
                }
                swapItems(filters, 0, 3);
              }
            }
          }
        }
        return JSBridge.invoke(
          'dialog.showSaveDialog',
          Object.assign(
            {
              properties: ['saveFile', 'showOverwriteConfirmation'],
              title: jquery.localize.getString('Save', 'Menu'),
            },
            dialogOptions,
            { defaultPath: defaultPath, filters: filters },
          ),
        );
      },
      'name',
      { value: 'p', configurable: true },
    ),
    showSaveDialog = Object.defineProperty(
      function (onSaved, onCancelled, onSaveError, forceRename) {
        var text = File.bundle.filePath || File.bundle.originalPath;
        if (!(text || File.isLinuxSnap)) {
          text = fileIntegration.getDefaultPathOrName();
        }
        if (/\.textbundle$/i.exec(text) && File.bundle.filePath) {
          text = text.replace(/\.textbundle$/i, '-2.textbundle');
        }
        buildSaveDialogOptions(true, text).then(
          async ({ filePath: selectedPath }) => {
            if (selectedPath) {
              var saveError = await fileSnapshot.saveAsUseNode(selectedPath, forceRename);
              if (saveError) {
                if (onSaveError) {
                  onSaveError(saveError);
                }
              } else {
                if (onSaved) {
                  onSaved(selectedPath);
                }
              }
            } else {
              if (onCancelled) {
                onCancelled();
              }
            }
          },
          (result) => {
            if (onSaveError) {
              onSaveError(result);
            }
          },
        );
      },
      'name',
      { value: 'f', configurable: true },
    ),
    fileSnapshot = {
      doShowSaveDialog: buildSaveDialogOptions,
      makeEmptyFileByNode: async function (filePath) {
        var normalizedPath,
          textPath = filePath;
        if (assetStorage.isTextBundle(filePath)) {
          await assetStorage.makeTextBundleSkeleton(filePath);
          textPath += '/text.md';
        } else {
          if (assetStorage.isTextPack(filePath)) {
            var temporaryBundleName = new Date() - 0 + '-' + Math.random() + '.textbundle';
            normalizedPath = reqnode('path').normalize(
              File.option.tempPath + '/' + temporaryBundleName,
            );
            await assetStorage.makeTextBundleSkeleton(normalizedPath);
            textPath = normalizedPath + '/text.md';
          }
        }
        var fileSystem = reqnode('fs');
        filePath = reqnode('path').resolve(textPath);
        var fileDescriptor = fileSystem.openSync(filePath, 'wx');
        fileSystem.close(fileDescriptor, function () {});
        if (assetStorage.isTextPack(filePath)) {
          textBundle.zipFolder(normalizedPath, filePath);
        }
      },
      saveAsUseNode: async function (inputFilePath, forceRename) {
        var currentFilePath = File.bundle.filePath,
          originalPath = File.bundle.originalPath,
          imageStorageFolder = File.editor.imgEdit.getTargetImageStorageFolder();
        const pathSeparator = File.isWin ? '\\' : '/';
        File.option.lastSaveLocation = reqnode('path').dirname(inputFilePath);
        JSBridge.invoke('app.sendEvent', 'willSave', inputFilePath);
        File.editor.imgEdit.buildImageMap(null, null, true);
        var markdown = File.editor.getMarkdown();
        File.bundle.filePath = inputFilePath;
        var copiedBundle = false;
        if (assetStorage.isTextBundle(inputFilePath)) {
          if (File.isTextBundle() && currentFilePath && currentFilePath != inputFilePath) {
            try {
              await File.fs.copy(currentFilePath, inputFilePath);
              copiedBundle = true;
            } catch (error) {}
          }
          File.bundle.type = File.FileType.TextBundle;
          if (!copiedBundle) {
            File.bundle.textFile = File.bundle.textFile || 'text.md';
            await assetStorage.makeTextBundleSkeleton(inputFilePath);
          }
          if (copiedBundle) {
            await assetStorage.removeUnusedAssets();
          } else {
            await File.editor.imgEdit._copyAllImages(
              inputFilePath + pathSeparator + 'assets',
              false,
              null,
              true,
              true,
              true,
            );
            markdown = File.editor.getMarkdown();
          }
        } else {
          if (File.isTextBundle()) {
            File.bundle.type = File.FileType.Markdown;
            let assetsPath =
              utilities.pathByDeleteLastComponent(inputFilePath) +
              pathSeparator +
              utilities.getFileName(inputFilePath).replace(/\.[^.\/\\]+$/, '') +
              '.assets';
            await File.editor.imgEdit._copyAllImages(assetsPath, false, null, true, true, false);
            markdown = File.editor.getMarkdown();
          }
        }
        File.bundle.originalPath = '';
        File.bundle.assetsChanges = null;
        try {
          File.fs.writeFileSync(
            (function (targetPath) {
              if (assetStorage.isTextBundle(targetPath)) {
                var textFileName = File.bundle.textFile || 'text.md';
                return targetPath + (File.isWin ? '\\' : '/') + textFileName;
              }
              return targetPath;
            })(inputFilePath),
            markdown,
            'utf8',
          );
          File.updateChangeCount(File.ChangeType.NSChangeAutoSaved);
          try {
            File.bundle.modifiedDate = File.fs.statSync(inputFilePath).mtimeMs;
          } catch (currentError) {
            console.error(currentError);
            File.bundle.modifiedDate = new Date();
          }
        } catch (localError) {
          console.sendError(localError);
          alert(jquery.localize.getString('Save File Failed', 'Panel') + '\n' + localError.stack);
          File.inSavingProcess = false;
          File._onFileSwitching = false;
          return localError;
        }
        File.inSavingProcess = false;
        File._onFileSwitching = false;
        var shouldRename = forceRename || (currentFilePath || originalPath) != inputFilePath;
        if (shouldRename) {
          if ((shouldRename = await JSBridge.invoke('document.checkIfMoveOnSave', inputFilePath))) {
            JSBridge.invoke('app.sendEvent', 'didRename', {
              oldPath: currentFilePath,
              newPath: inputFilePath,
            });
            recovery.onFilePathUpdated(void 0, currentFilePath, imageStorageFolder);
          }
        } else {
          File.FileInfoPanel.onFilePathUpdated();
        }
        File.needsUpdateSnap();
        File.bundle.savedContent = markdown;
        JSBridge.invoke('app.sendEvent', 'didSave', {
          path: inputFilePath,
          summary: markdown.substr(0, 200),
          lastModifiedDate: File.bundle.modifiedDate,
        });
        if (currentFilePath != inputFilePath && forceRename && currentFilePath) {
          JSBridge.invoke('shell.trashItem', currentFilePath);
        }
        JSBridge.invoke('document.setLastSync', File.bundle.modifiedDate);
        Analytics.record('saveFile');
        console.debug('saved');
      },
      saveUseNode: async function (saveAs, automatic) {
        Object.defineProperty(switchToUtf8, 'name', { value: 'b', configurable: true });
        Object.defineProperty(showSaveFailure, 'name', { value: 'w', configurable: true });
        Object.defineProperty(handleSaveError, 'name', { value: 'x', configurable: true });

        if (File.isActiveWindow() && !File.bundle.unsupported && !File.isFileLoading()) {
          var currentSavedContent = File.sync();
          if (void 0 !== currentSavedContent) {
            if (false === File.validateContentForSave()) {
              Reporter.record(
                `saveUseNode to ${utilities.hashCode(File.bundle.filePath)} saveAs: ${saveAs}`,
              );
              File.showDataLostError();
              return false;
            }
            var encodedBytes,
              currentFilePath = File.bundle.filePath,
              localFilePath = currentFilePath,
              text = File.bundle.fileEncode || 'utf8',
              addBOM = false;
            if (/-bom$/.exec(text)) {
              addBOM = true;
              text = text.replace('-bom', '');
            }
            if (File.bundle.fileMissingWhenOpen && !currentFilePath) {
              currentFilePath = File.bundle.originalPath;
            }
            if (!saveAs && File.isTextBundle()) {
              let isDirectory = false;
              try {
                isDirectory = (await File.fs.stat(currentFilePath)).isDirectory();
              } catch (error) {}
              if (!isDirectory && currentFilePath) {
                await recovery.saveFileToRecover(true);
                return void (await fileSnapshot.saveAsUseNode(currentFilePath));
              }
            }
            if ((currentFilePath || !automatic) && File.isNode) {
              return new Promise(async (resolvePromise) => {
                var encodingCodec = reqnode('iconv-lite');
                try {
                  if ('utf8' != text || addBOM) {
                    var roundTripText,
                      savedContent = currentSavedContent;
                    encodedBytes = encodingCodec.encode(currentSavedContent, text, {
                      addBOM: addBOM,
                    });
                    if (text && -1 == text.indexOf('utf')) {
                      try {
                        roundTripText = encodingCodec.decode(encodedBytes, text);
                      } catch (currentError) {}
                      if (savedContent != roundTripText) {
                        console.error(
                          `Failed to save in ${text} due to untransliteral char, saving in utf8`,
                        );
                        throw new Error('iconv-lite transliteration error');
                      }
                    }
                  } else {
                    encodedBytes = Buffer.from(currentSavedContent, 'utf-8');
                  }
                } catch (localError) {
                  switchToUtf8();
                }
                if (
                  '' != currentSavedContent &&
                  (0 == encodedBytes.length ||
                    (encodedBytes.length > 1 && 0 == encodedBytes[0] && 0 == encodedBytes[1]))
                ) {
                  switchToUtf8();
                }
                if (currentFilePath && !saveAs) {
                  File.markSaved();
                  File.bundle.assetsChanges = null;
                  let targetTextPath = assetStorage.getTextFile() || currentFilePath;
                  File.inSavingProcess = File.inSavingProcess || !saveAs;
                  JSBridge.invoke('app.sendEvent', 'willSave', currentFilePath);
                  File.bundle.savedContent = currentSavedContent;
                  File.bundle.modifiedDate = new Date();
                  await recovery.saveFileToRecover();
                  if (File.isTextPack()) {
                    await textBundle.saveFile(currentFilePath, currentSavedContent);
                    File.inSavingProcess = false;
                    setTimeout(() => {
                      fileIntegration.refreshTitlebarText();
                    });
                  } else {
                    var err, watchFile;
                    try {
                      var writeResult = await new Promise((inputResolvePromise) => {
                        fileWriter.writeFile(
                          targetTextPath,
                          encodedBytes,
                          async function (inputError, fileContent) {
                            inputResolvePromise({ err: inputError, watchFile: fileContent });
                          },
                        );
                      });
                      err = writeResult.err;
                      watchFile = writeResult.watchFile;
                    } catch (writeError) {
                      err = writeError;
                    }
                    if (err) {
                      resolvePromise(false);
                      Reporter.error(err, { fingerprint: ['steno2', 'writeFile'] });
                      return void handleSaveError(err.stack, err.code);
                    }
                    if (watchFile) {
                      recovery.watchFileChange(currentFilePath);
                    }
                    if (!File.bundle.filePath) {
                      File.bundle.filePath = currentFilePath;
                    }
                    File.bundle.fileMissingWhenOpen = false;
                    File.bundle.savedContent = currentSavedContent;
                    try {
                      var savedFileInfo = null;
                      savedFileInfo = automatic
                        ? await File.fs.stat(targetTextPath)
                        : File.fs.statSync(targetTextPath);
                      if (encodedBytes.length && 0 == Number(savedFileInfo.size)) {
                        resolvePromise(false);
                        handleSaveError('Failed to write file');
                        return void Reporter.error(
                          'Failed to write file: File size is 0 but data is not',
                          {
                            fingerprint: ['steno2', 'afterWriteFile'],
                          },
                        );
                      }
                      File.bundle.modifiedDate = savedFileInfo.mtimeMs;
                    } catch (saveError) {
                      resolvePromise(false);
                      return void handleSaveError(saveError.stack, saveError.code);
                    }
                    resolvePromise(true);
                    JSBridge.invoke('document.setLastSync', File.bundle.modifiedDate);
                  }
                  assetStorage.removeUnusedAssets();
                  File.updateChangeCount(File.ChangeType.NSChangeAutoSaved);
                  File.inSavingProcess = false;
                  fileIntegration.refreshTitlebarText();
                  if (!(File.option.enableAutoSave && !saveAs)) {
                    await File.backupWindow();
                  }
                  console.debug('file written');
                  JSBridge.invoke('app.sendEvent', 'didSave', {
                    path: currentFilePath,
                    summary: currentSavedContent.substr(0, 200),
                    lastModifiedDate: File.bundle.modifiedDate,
                  });
                } else {
                  if (!automatic) {
                    var releaseSaveState = Object.defineProperty(
                      () => {
                        File.inSavingProcess = false;
                        File._onFileSwitching = false;
                      },
                      'name',
                      { value: 'S', configurable: true },
                    );
                    showSaveDialog(
                      async (unusedParameter1) => {
                        resolvePromise(true);
                        releaseSaveState();
                      },
                      () => {
                        resolvePromise(void 0);
                        releaseSaveState();
                      },
                      () => {
                        resolvePromise(false);
                        releaseSaveState();
                      },
                    );
                    Analytics.record('saveFile');
                  }
                }
                File.editor.nodeMap.toc.updateHTML();
              });
            }
          }
        }
        function switchToUtf8() {
          console.log('switch to utf8 encode');
          encodedBytes = Buffer.from(currentSavedContent);
          File.bundle.fileEncode = 'utf8';
          fileIntegration.removeItemInDB('[encode]' + currentFilePath);
          File.needsUpdateSnap();
        }
        function showSaveFailure(message) {
          var buttons =
            saveAs && localFilePath
              ? [
                  jquery.localize.getString('Save As', 'Menu'),
                  jquery.localize.getString('Open File Location', 'Menu'),
                  jquery.localize.getString('Cancel'),
                ]
              : [jquery.localize.getString('Save As', 'Menu'), jquery.localize.getString('Cancel')];
          dialogs.showDialog({
            title: jquery.localize.getString('Save File Failed'),
            message: message,
            buttons: buttons,
            type: 'error',
            callback: function (buttonIndex) {
              if (0 == buttonIndex) {
                ClientCommand.saveAs();
              } else {
                if (buttonIndex == buttons.length - 2) {
                  ClientCommand.openFileLocation();
                }
              }
            },
          });
        }
        function handleSaveError(errorMessage, errorCode) {
          Reporter.record(`onSaveError ${errorCode || ''}`);
          if (!automatic) {
            showSaveFailure(
              'EPERM' == errorCode
                ? jquery.localize.getString(
                    'The file is read-only, or you do not have right permissions to modify the file.',
                  )
                : errorMessage,
            );
            console.sendError('fs write failed', false, errorCode || errorMessage);
            File.saveAndBackup();
          }
          File.inSavingProcess = false;
          File._onFileSwitching = false;
          File.updateChangeCount(File.ChangeType.NodeSaveFailed);
        }
      },
      moveTo: async function () {
        return new Promise(function (resolvePromise) {
          var cancelPendingSave = Object.defineProperty(
            () => {
              resolvePromise(false);
              File.inSavingProcess = false;
              File._onFileSwitching = false;
            },
            'name',
            { value: 't', configurable: true },
          );
          showSaveDialog(
            () => {
              resolvePromise(true);
              File.inSavingProcess = false;
              File._onFileSwitching = false;
            },
            cancelPendingSave,
            cancelPendingSave,
            true,
          );
        });
      },
      markSaved: function () {
        var lastHistoryEntry = File.editor && File.editor.undo.lastRegisteredOperationCommand();
        if (lastHistoryEntry) {
          lastHistoryEntry.date = void 0;
        }
      },
    };
  moduleRecord.exports = fileSnapshot;
}
