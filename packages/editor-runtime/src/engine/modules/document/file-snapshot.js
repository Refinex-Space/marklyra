// document/file-snapshot.
// SystemJS module 39. Dependencies: e, 11, 2c, 29, 33, 34, 3a, 35, 3b, 38.
$__System.registerDynamic(
  '39',
  ['e', '11', '2c', '29', '33', '34', '3a', '35', '3b', '38'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var jquery = requireModule('e'),
      utilities = requireModule('11'),
      dialogs = (requireModule('2c'), requireModule('29')),
      fileIntegration = requireModule('33'),
      assetStorage = requireModule('34'),
      textBundle = requireModule('3a'),
      recovery = requireModule('35'),
      fileWriter = ((fileIntegration = requireModule('33')), requireModule('3b')),
      Reporter = requireModule('38').Reporter,
      h = function (items, leftIndex, rightIndex) {
        var leftItem = items[leftIndex];
        (items[leftIndex] = items[rightIndex]), (items[rightIndex] = leftItem);
      },
      p = function (preferAllFiles, defaultPath, dialogOptions) {
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
        return (
          preferAllFiles &&
            filters.push({
              name: jquery.localize.getString('All Files', 'Panel'),
              extensions: ['*'],
            }),
          /\.textbundle$/i.exec(defaultPath)
            ? h(filters, 0, 1)
            : /\.(txt|text)$/i.exec(defaultPath)
              ? h(filters, 0, 2)
              : /[\\\/][^\\\/\.]+$/i.exec(defaultPath)
                ? h(filters, 0, 2)
                : /\.(md|markdown|mmd|mdwn|mdown)$/i.exec(defaultPath) ||
                  (preferAllFiles ||
                    filters.push({
                      name: jquery.localize.getString('All Files', 'Panel'),
                      extensions: ['*'],
                    }),
                  h(filters, 0, 3)),
          JSBridge.invoke(
            'dialog.showSaveDialog',
            Object.assign(
              {
                properties: ['saveFile', 'showOverwriteConfirmation'],
                title: jquery.localize.getString('Save', 'Menu'),
              },
              dialogOptions,
              { defaultPath: defaultPath, filters: filters },
            ),
          )
        );
      },
      f = function (onSaved, onCancelled, onSaveError, forceRename) {
        var text = File.bundle.filePath || File.bundle.originalPath;
        text || File.isLinuxSnap || (text = fileIntegration.getDefaultPathOrName()),
          /\.textbundle$/i.exec(text) &&
            File.bundle.filePath &&
            (text = text.replace(/\.textbundle$/i, '-2.textbundle')),
          p(!0, text).then(
            async ({ filePath: selectedPath }) => {
              if (selectedPath) {
                var saveError = await fileSnapshot.saveAsUseNode(selectedPath, forceRename);
                saveError
                  ? onSaveError && onSaveError(saveError)
                  : onSaved && onSaved(selectedPath);
              } else onCancelled && onCancelled();
            },
            (result) => {
              onSaveError && onSaveError(result);
            },
          );
      },
      fileSnapshot = {
        doShowSaveDialog: p,
        makeEmptyFileByNode: async function (filePath) {
          var normalizedPath,
            textPath = filePath;
          if (assetStorage.isTextBundle(filePath))
            await assetStorage.makeTextBundleSkeleton(filePath), (textPath += '/text.md');
          else if (assetStorage.isTextPack(filePath)) {
            var temporaryBundleName = new Date() - 0 + '-' + Math.random() + '.textbundle';
            (normalizedPath = reqnode('path').normalize(
              File.option.tempPath + '/' + temporaryBundleName,
            )),
              await assetStorage.makeTextBundleSkeleton(normalizedPath),
              (textPath = normalizedPath + '/text.md');
          }
          var fileSystem = reqnode('fs');
          filePath = reqnode('path').resolve(textPath);
          var fileDescriptor = fileSystem.openSync(filePath, 'wx');
          fileSystem.close(fileDescriptor, function () {}),
            assetStorage.isTextPack(filePath) && textBundle.zipFolder(normalizedPath, filePath);
        },
        saveAsUseNode: async function (inputFilePath, forceRename) {
          var currentFilePath = File.bundle.filePath,
            originalPath = File.bundle.originalPath,
            imageStorageFolder = File.editor.imgEdit.getTargetImageStorageFolder();
          const pathSeparator = File.isWin ? '\\' : '/';
          (File.option.lastSaveLocation = reqnode('path').dirname(inputFilePath)),
            JSBridge.invoke('app.sendEvent', 'willSave', inputFilePath),
            File.editor.imgEdit.buildImageMap(null, null, !0);
          var markdown = File.editor.getMarkdown();
          File.bundle.filePath = inputFilePath;
          var copiedBundle = !1;
          if (assetStorage.isTextBundle(inputFilePath)) {
            if (File.isTextBundle() && currentFilePath && currentFilePath != inputFilePath)
              try {
                await File.fs.copy(currentFilePath, inputFilePath), (copiedBundle = !0);
              } catch (error) {}
            (File.bundle.type = File.FileType.TextBundle),
              copiedBundle ||
                ((File.bundle.textFile = File.bundle.textFile || 'text.md'),
                await assetStorage.makeTextBundleSkeleton(inputFilePath)),
              copiedBundle
                ? await assetStorage.removeUnusedAssets()
                : (await File.editor.imgEdit._copyAllImages(
                    inputFilePath + pathSeparator + 'assets',
                    !1,
                    null,
                    !0,
                    !0,
                    !0,
                  ),
                  (markdown = File.editor.getMarkdown()));
          } else if (File.isTextBundle()) {
            File.bundle.type = File.FileType.Markdown;
            let assetsPath =
              utilities.pathByDeleteLastComponent(inputFilePath) +
              pathSeparator +
              utilities.getFileName(inputFilePath).replace(/\.[^.\/\\]+$/, '') +
              '.assets';
            await File.editor.imgEdit._copyAllImages(assetsPath, !1, null, !0, !0, !1),
              (markdown = File.editor.getMarkdown());
          }
          (File.bundle.originalPath = ''), (File.bundle.assetsChanges = null);
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
            ),
              File.updateChangeCount(File.ChangeType.NSChangeAutoSaved);
            try {
              File.bundle.modifiedDate = File.fs.statSync(inputFilePath).mtimeMs;
            } catch (currentError) {
              console.error(currentError), (File.bundle.modifiedDate = new Date());
            }
          } catch (localError) {
            return (
              console.sendError(localError),
              alert(
                jquery.localize.getString('Save File Failed', 'Panel') + '\n' + localError.stack,
              ),
              (File.inSavingProcess = !1),
              (File._onFileSwitching = !1),
              localError
            );
          }
          (File.inSavingProcess = !1), (File._onFileSwitching = !1);
          var shouldRename = forceRename || (currentFilePath || originalPath) != inputFilePath;
          shouldRename
            ? (shouldRename = await JSBridge.invoke('document.checkIfMoveOnSave', inputFilePath)) &&
              (JSBridge.invoke('app.sendEvent', 'didRename', {
                oldPath: currentFilePath,
                newPath: inputFilePath,
              }),
              recovery.onFilePathUpdated(void 0, currentFilePath, imageStorageFolder))
            : File.FileInfoPanel.onFilePathUpdated(),
            File.needsUpdateSnap(),
            (File.bundle.savedContent = markdown),
            JSBridge.invoke('app.sendEvent', 'didSave', {
              path: inputFilePath,
              summary: markdown.substr(0, 200),
              lastModifiedDate: File.bundle.modifiedDate,
            }),
            currentFilePath != inputFilePath &&
              forceRename &&
              currentFilePath &&
              JSBridge.invoke('shell.trashItem', currentFilePath),
            JSBridge.invoke('document.setLastSync', File.bundle.modifiedDate),
            Analytics.record('saveFile'),
            console.debug('saved');
        },
        saveUseNode: async function (saveAs, automatic) {
          if (File.isActiveWindow() && !File.bundle.unsupported && !File.isFileLoading()) {
            var currentSavedContent = File.sync();
            if (void 0 !== currentSavedContent) {
              if (!1 === File.validateContentForSave())
                return (
                  Reporter.record(
                    `saveUseNode to ${utilities.hashCode(File.bundle.filePath)} saveAs: ${saveAs}`,
                  ),
                  File.showDataLostError(),
                  !1
                );
              var encodedBytes,
                currentFilePath = File.bundle.filePath,
                localFilePath = currentFilePath,
                text = File.bundle.fileEncode || 'utf8',
                addBOM = !1;
              if (
                (/-bom$/.exec(text) && ((addBOM = !0), (text = text.replace('-bom', ''))),
                File.bundle.fileMissingWhenOpen &&
                  !currentFilePath &&
                  (currentFilePath = File.bundle.originalPath),
                !saveAs && File.isTextBundle())
              ) {
                let isDirectory = !1;
                try {
                  isDirectory = (await File.fs.stat(currentFilePath)).isDirectory();
                } catch (error) {}
                if (!isDirectory && currentFilePath)
                  return (
                    await recovery.saveFileToRecover(!0),
                    void (await fileSnapshot.saveAsUseNode(currentFilePath))
                  );
              }
              if ((currentFilePath || !automatic) && File.isNode)
                return new Promise(async (resolvePromise) => {
                  var encodingCodec = reqnode('iconv-lite');
                  try {
                    if ('utf8' != text || addBOM) {
                      var roundTripText,
                        savedContent = currentSavedContent;
                      if (
                        ((encodedBytes = encodingCodec.encode(currentSavedContent, text, {
                          addBOM: addBOM,
                        })),
                        text && -1 == text.indexOf('utf'))
                      ) {
                        try {
                          roundTripText = encodingCodec.decode(encodedBytes, text);
                        } catch (currentError) {}
                        if (savedContent != roundTripText)
                          throw (
                            (console.error(
                              `Failed to save in ${text} due to untransliteral char, saving in utf8`,
                            ),
                            new Error('iconv-lite transliteration error'))
                          );
                      }
                    } else encodedBytes = Buffer.from(currentSavedContent, 'utf-8');
                  } catch (localError) {
                    b();
                  }
                  if (
                    ('' != currentSavedContent &&
                      (0 == encodedBytes.length ||
                        (encodedBytes.length > 1 &&
                          0 == encodedBytes[0] &&
                          0 == encodedBytes[1])) &&
                      b(),
                    currentFilePath && !saveAs)
                  ) {
                    File.markSaved(), (File.bundle.assetsChanges = null);
                    let targetTextPath = assetStorage.getTextFile() || currentFilePath;
                    if (
                      ((File.inSavingProcess = File.inSavingProcess || !saveAs),
                      JSBridge.invoke('app.sendEvent', 'willSave', currentFilePath),
                      (File.bundle.savedContent = currentSavedContent),
                      (File.bundle.modifiedDate = new Date()),
                      await recovery.saveFileToRecover(),
                      File.isTextPack())
                    )
                      await textBundle.saveFile(currentFilePath, currentSavedContent),
                        (File.inSavingProcess = !1),
                        setTimeout(() => {
                          fileIntegration.refreshTitlebarText();
                        });
                    else {
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
                        (err = writeResult.err), (watchFile = writeResult.watchFile);
                      } catch (writeError) {
                        err = writeError;
                      }
                      if (err)
                        return (
                          resolvePromise(!1),
                          Reporter.error(err, { fingerprint: ['steno2', 'writeFile'] }),
                          void x(err.stack, err.code)
                        );
                      watchFile && recovery.watchFileChange(currentFilePath),
                        File.bundle.filePath || (File.bundle.filePath = currentFilePath),
                        (File.bundle.fileMissingWhenOpen = !1),
                        (File.bundle.savedContent = currentSavedContent);
                      try {
                        var savedFileInfo = null;
                        if (
                          ((savedFileInfo = automatic
                            ? await File.fs.stat(targetTextPath)
                            : File.fs.statSync(targetTextPath)),
                          encodedBytes.length && 0 == Number(savedFileInfo.size))
                        )
                          return (
                            resolvePromise(!1),
                            x('Failed to write file'),
                            void Reporter.error(
                              'Failed to write file: File size is 0 but data is not',
                              {
                                fingerprint: ['steno2', 'afterWriteFile'],
                              },
                            )
                          );
                        File.bundle.modifiedDate = savedFileInfo.mtimeMs;
                      } catch (saveError) {
                        return resolvePromise(!1), void x(saveError.stack, saveError.code);
                      }
                      resolvePromise(!0),
                        JSBridge.invoke('document.setLastSync', File.bundle.modifiedDate);
                    }
                    assetStorage.removeUnusedAssets(),
                      File.updateChangeCount(File.ChangeType.NSChangeAutoSaved),
                      (File.inSavingProcess = !1),
                      fileIntegration.refreshTitlebarText(),
                      (File.option.enableAutoSave && !saveAs) || (await File.backupWindow()),
                      console.debug('file written'),
                      JSBridge.invoke('app.sendEvent', 'didSave', {
                        path: currentFilePath,
                        summary: currentSavedContent.substr(0, 200),
                        lastModifiedDate: File.bundle.modifiedDate,
                      });
                  } else if (!automatic) {
                    var S = () => {
                      (File.inSavingProcess = !1), (File._onFileSwitching = !1);
                    };
                    f(
                      async (unusedParameter1) => {
                        resolvePromise(!0), S();
                      },
                      () => {
                        resolvePromise(void 0), S();
                      },
                      () => {
                        resolvePromise(!1), S();
                      },
                    ),
                      Analytics.record('saveFile');
                  }
                  File.editor.nodeMap.toc.updateHTML();
                });
            }
          }
          function b() {
            console.log('switch to utf8 encode'),
              (encodedBytes = Buffer.from(currentSavedContent)),
              (File.bundle.fileEncode = 'utf8'),
              fileIntegration.removeItemInDB('[encode]' + currentFilePath),
              File.needsUpdateSnap();
          }
          function w(message) {
            var buttons =
              saveAs && localFilePath
                ? [
                    jquery.localize.getString('Save As', 'Menu'),
                    jquery.localize.getString('Open File Location', 'Menu'),
                    jquery.localize.getString('Cancel'),
                  ]
                : [
                    jquery.localize.getString('Save As', 'Menu'),
                    jquery.localize.getString('Cancel'),
                  ];
            dialogs.showDialog({
              title: jquery.localize.getString('Save File Failed'),
              message: message,
              buttons: buttons,
              type: 'error',
              callback: function (buttonIndex) {
                0 == buttonIndex
                  ? ClientCommand.saveAs()
                  : buttonIndex == buttons.length - 2 && ClientCommand.openFileLocation();
              },
            });
          }
          function x(errorMessage, errorCode) {
            Reporter.record(`onSaveError ${errorCode || ''}`),
              automatic ||
                (w(
                  'EPERM' == errorCode
                    ? jquery.localize.getString(
                        'The file is read-only, or you do not have right permissions to modify the file.',
                      )
                    : errorMessage,
                ),
                console.sendError('fs write failed', !1, errorCode || errorMessage),
                File.saveAndBackup()),
              (File.inSavingProcess = !1),
              (File._onFileSwitching = !1),
              File.updateChangeCount(File.ChangeType.NodeSaveFailed);
          }
        },
        moveTo: async function () {
          return new Promise(function (resolvePromise) {
            var t = () => {
              resolvePromise(!1), (File.inSavingProcess = !1), (File._onFileSwitching = !1);
            };
            f(
              () => {
                resolvePromise(!0), (File.inSavingProcess = !1), (File._onFileSwitching = !1);
              },
              t,
              t,
              !0,
            );
          });
        },
        markSaved: function () {
          var lastHistoryEntry = File.editor && File.editor.undo.lastRegisteredOperationCommand();
          lastHistoryEntry && (lastHistoryEntry.date = void 0);
        },
      };
    moduleRecord.exports = fileSnapshot;
  },
);
