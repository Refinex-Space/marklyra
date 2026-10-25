// document/recovery.
// SystemJS module 35. Dependencies: 11, 33, 29.
$__System.registerDynamic(
  '35',
  ['11', '33', '29'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var recoveryFileName,
      timerId,
      utilities = requireModule('11'),
      fileIntegration = requireModule('33'),
      dialogs = requireModule('29'),
      fileWatcher = null,
      polledPath = null,
      d = function (documentName) {
        var dateInstance = new Date();
        return (recoveryFileName =
          utilities.formateDateOnly(new Date()) +
          ' ' +
          (documentName || 'untitled').replace(/\.[^.]*$/, '') +
          ' ' +
          utilities.formateTimeOnly(dateInstance, !0).replace(/:/g, '') +
          '.md');
      };
    function u(filePath) {
      var currentTimerId;
      try {
        var fileSystem = reqnode('fs');
        polledPath &&
          (fileSystem.unwatchFile(polledPath), console.debug(`fs.unwatchFile(${polledPath})`)),
          (polledPath = filePath),
          console.debug(`fs.watchFile(${filePath})`),
          fileSystem.watchFile(filePath, function (currentStats, previousStats) {
            new Date() - File.bundle.modifiedDate < 900 ||
              (currentStats && currentStats.mtime == previousStats.mtime) ||
              (currentTimerId && clearTimeout(currentTimerId),
              (currentTimerId = setTimeout(function () {
                currentStats ? File.presentedItemChanged(void 0, currentStats, filePath) : f(),
                  (currentTimerId = null);
              }, 200)));
          });
      } catch (error) {
        console.log(error);
      }
    }
    function h(changedPath, restartWatcher) {
      var fileSystem = reqnode('fs');
      File.editor.library.isSuppressOnChange() ||
        (fileSystem.stat(changedPath, function (error, fileInfo) {
          if (File.isTextBundle()) {
            if (
              0 != changedPath.indexOf(File.bundle.filePath || ':') &&
              changedPath.indexOf(File.bundle.originalPath || ':')
            )
              return;
          } else if (
            changedPath !== File.bundle.filePath &&
            changedPath !== File.bundle.originalPath
          )
            return;
          error || !fileInfo
            ? (p(null), window.clientHandlerOnPresentationMoved())
            : (File.presentedItemChanged(void 0, fileInfo, changedPath),
              restartWatcher && p(changedPath));
        }),
        (timerId = null));
    }
    function p(filePath) {
      if (reqnode && !File.isTextPack()) {
        var fileSystem = reqnode('fs');
        if (
          (fileWatcher &&
            (fileWatcher.removeAllListeners(),
            fileWatcher.close(),
            (fileWatcher._handle = null),
            (fileWatcher = null),
            console.debug('fsWatcher.close')),
          timerId && clearTimeout(timerId),
          (timerId = null),
          polledPath &&
            (fileSystem.unwatchFile(polledPath),
            console.debug(`fsWatcher.unwatchFile(${polledPath})`)),
          filePath)
        )
          try {
            console.debug(`fsWatcher.watch(${filePath})`),
              ((fileWatcher = fileSystem.watch(filePath, { persistent: !1 }))._start = new Date()),
              fileWatcher.on('change', function (eventType, changedName) {
                if (!(new Date() - fileWatcher._start < 100))
                  if (
                    (console.debug(`fsWatcher ${eventType} ${changedName}`), 'rename' != eventType)
                  )
                    console.debug('fsWatcher file ' + eventType + 'd, filename: ' + changedName),
                      new Date() - File.bundle.modifiedDate < 900 ||
                        (timerId && clearTimeout(timerId),
                        (timerId = setTimeout(function () {
                          h(filePath);
                        }, 500)));
                  else if (File.inSavingProcess) p(filePath);
                  else {
                    var pathUtilities = reqnode('path');
                    pathUtilities.join(pathUtilities.dirname(filePath), changedName) == filePath &&
                      h(filePath, !0);
                  }
              }),
              fileWatcher.on('error', function (watchError) {
                fileWatcher.close(),
                  (fileWatcher._handle = null),
                  (fileWatcher = null),
                  u(filePath),
                  console.debug(watchError);
              });
          } catch (error) {
            if (fileWatcher && 'ENOENT' == error.code)
              return fileWatcher.close(), (fileWatcher._handle = null), void (fileWatcher = null);
            console.debug(error), u(filePath);
          }
      }
    }
    var f = function () {
      JSBridge.invoke('document.switchToUntitled', File.bundle.filePath),
        Reporter.record('current file is moved/deleted');
    };
    window.clientHandlerOnPresentationMoved = function () {
      File.isNode &&
        File.isActiveWindow() &&
        File.updateChangeCount(File.ChangeType.NSChangeReadOtherContents),
        y();
    };
    var m = function (recoveryError) {
        recoveryError && window.debugMode && console.warn(recoveryError);
      },
      g = async function (documentName, bundleDirectoryName) {
        if (recoveryFileName && documentName) {
          var recoveryDirectory = await C(!0);
          bundleDirectoryName &&
            (recoveryDirectory =
              recoveryDirectory + (File.isWin ? '\\' : '/') + bundleDirectoryName);
          try {
            var fileSystem = reqnode('fs'),
              pathUtilities = reqnode('path'),
              pathSeparator = File.isWin ? '\\' : '/',
              previousRecoveryPath = pathUtilities.resolve(recoveryDirectory, recoveryFileName);
            if (bundleDirectoryName)
              return (
                File.draftsRecoverList.push(recoveryDirectory + pathSeparator + recoveryFileName),
                void v()
              );
            fileSystem.stat(previousRecoveryPath, function (inputError, unusedParameter2) {
              if (!inputError) {
                var renamedRecoveryPath = pathUtilities.resolve(recoveryDirectory, d(documentName));
                fileSystem.rename(previousRecoveryPath, renamedRecoveryPath, m),
                  File.draftsRecoverList.push(renamedRecoveryPath),
                  v();
              }
            });
          } catch (error) {
            console.sendError(error);
          }
        }
      },
      v = function () {
        if (File.draftsRecoverList.length < (File.isTextBundle() ? 6 : 10)) return;
        const retentionInterval = File.draftsRecoverList.length > 20 ? 1e3 : 500;
        for (
          var currentItems = [],
            localItems = [File.draftsRecoverList[0]],
            timestampPattern = /(\d+)\.md$/,
            previousTimestamp = timestampPattern.exec(File.draftsRecoverList[0])[1] - 0,
            currentItemIndex = 2;
          currentItemIndex < File.draftsRecoverList.length;
          currentItemIndex++
        ) {
          var backupPath = File.draftsRecoverList[currentItemIndex],
            backupTimestamp =
              timestampPattern.exec(File.draftsRecoverList[currentItemIndex])[1] - 0;
          backupTimestamp - previousTimestamp > 0 &&
          backupTimestamp - previousTimestamp < retentionInterval
            ? currentItems.push(backupPath)
            : (localItems.push(backupPath), (previousTimestamp = backupTimestamp));
        }
        var items = localItems;
        localItems.length > 40 &&
          ((items = []),
          localItems.forEach((item, itemIndex) => {
            itemIndex % 2 == 0 || itemIndex == localItems.length - 1
              ? items.push(item)
              : currentItems.push(item);
          })),
          (File.draftsRecoverList = items);
        var fileSystem = reqnode('fs');
        currentItems.forEach((item) => {
          fileSystem.unlink(item, (unlinkError) => {
            unlinkError && console.debug(unlinkError);
          });
        });
      },
      y = function (unusedParameter1) {
        console.log('onFilePathRemoved'),
          File.bundle.filePath &&
            ((File.bundle.originalPath = File.bundle.filePath),
            (File.bundle.filePath = ''),
            b(File.bundle.fileName));
      },
      b = function (fileName, previousFilePath, previousImageStorage) {
        var filePath = File.bundle.filePath;
        /bundle\//.exec(filePath),
          (fileName =
            fileName || fileIntegration.getFileNameFromPath(filePath || File.bundle.originalPath)),
          (File.bundle.fileName = fileName);
        var menuPatch = {
          'File→Open File Location': { enabled: !!filePath },
          'File→Reveal in Sidebar': { enabled: !!filePath },
          'File→Delete…': { enabled: !!filePath },
        };
        File.isNode &&
          !File.isMacNode &&
          (menuPatch['File→Reopen with Encoding'] = { hidden: !filePath }),
          File.isWin
            ? (menuPatch['File→Properties'] = { enabled: !!filePath })
            : File.isMac && (menuPatch['File→Get Info'] = { enabled: !!filePath }),
          JSBridge.menu.update(menuPatch),
          console.log(`onFilePathUpdated ${filePath}`),
          window.Reporter.record(`File.bundle.filePath = ${utilities.hashCode(filePath)}`),
          (File.bundle.assetsChanges = null);
        const imageEditor = File.editor && File.editor.imgEdit,
          fileLibrary = File.editor && File.editor.library;
        if (
          (imageEditor && (imageEditor.cachedFileImageStorage = void 0),
          File.setDefaultImageStorage(File.option.defaultImageStorage),
          File.onMetaDataChanged(),
          fileLibrary && File.editor.library.markCurrentFile(),
          previousFilePath &&
            (function (previousFilePath, previousImageStorage) {
              File.isTextBundle() ||
                File.editor.imgEdit.onFileMoved(previousFilePath, previousImageStorage);
            })(previousFilePath, previousImageStorage),
          File.isNode)
        ) {
          previousFilePath &&
            File.isTextBundle() &&
            (async function (previousFilePath) {
              var pathSeparator = File.isWin ? '\\' : '/',
                recoveryRoot = C(!0),
                previousBundleName = w(previousFilePath),
                currentBundleName = w();
              try {
                await reqnode('fs-extra').move(
                  recoveryRoot + pathSeparator + previousBundleName,
                  recoveryRoot + pathSeparator + currentBundleName,
                );
              } catch (error) {
                console.info(error);
              }
            })(previousFilePath || '');
          var titleElement = $('#title-text');
          if (filePath) {
            if (
              (JSBridge.invoke('document.hasDuplicateName', fileName).then((result) => {
                result
                  ? (titleElement.text(filePath),
                    JSBridge.invoke('window.setTitle', filePath + ' - MarkLyra'))
                  : (titleElement.text(fileName),
                    JSBridge.invoke('window.setTitle', fileName + ' - MarkLyra')),
                  fileIntegration.refreshTitlebarText();
              }),
              g(fileName),
              File.editor.library)
            ) {
              File.editor.library.markCurrentFile();
              var outsideMountFolder = !File.mountFolder_;
              if (!outsideMountFolder) {
                const normalize = reqnode('path').normalize;
                outsideMountFolder =
                  -1 ==
                  normalize(filePath).indexOf(
                    normalize(File.mountFolder_.replace(/[\/\\]$/, '') + (File.isWin ? '\\' : '/')),
                  );
              }
              outsideMountFolder &&
                (File.setMountFolder(reqnode('path').dirname(filePath)),
                File.editor.library.onRootChanged(File.mountFolder_, !0));
            }
          } else
            fileName
              ? (titleElement.text(fileName),
                JSBridge.invoke('window.setTitle', fileName + '• - MarkLyra'))
              : (titleElement.text($.localize.getString('Untitled')),
                JSBridge.invoke(
                  'window.setTitle',
                  $.localize.getString('Untitled') +
                    (File.changeCounter && !File.changeCounter.curState
                      ? '• - MarkLyra'
                      : ' - MarkLyra'),
                ));
          p(File.getTextFile() || null),
            /draftsRecover/.exec(File.bundle.filePath || '') &&
              (function () {
                const pathUtilities = reqnode('path'),
                  recoveryRoot = pathUtilities.join(File.option.userDataPath, 'draftsRecover');
                0 ==
                  pathUtilities
                    .normalize(File.bundle.filePath)
                    .indexOf(recoveryRoot + pathUtilities.sep) &&
                  dialogs.showHintOrWarning({
                    key: '',
                    title:
                      '<strong>' +
                      $.localize.getString(
                        'You are not supposed to edit or save this file.',
                        'Front',
                      ) +
                      '</strong>',
                    body: $.localize
                      .getString(
                        'Files in this location (%@) are managed by MarkLyra, and may be deleted automatically.<br/>Please copy content to a new file for further editing.',
                        'Front',
                      )
                      .replace('%@', 'draftsRecover'),
                  });
              })();
        }
      };
    var w = function (pathOverride) {
        if (!File.isTextBundle() && !File.isTextPack()) return null;
        if (File.bundle.unzipFolder) return utilities.getFileName(File.bundle.unzipFolder);
        var documentPath =
            void 0 !== pathOverride
              ? pathOverride
              : File.bundle.filePath || File.bundle.originalPath,
          pathHash = documentPath
            ? (function (text) {
                let hashValue = 0;
                for (
                  let characterIndex = 0, textLength = text.length;
                  characterIndex < textLength;
                  characterIndex++
                )
                  (hashValue = (hashValue << 5) - hashValue + text.charCodeAt(characterIndex)),
                    (hashValue |= 0);
                return hashValue;
              })(documentPath)
            : File.bundle.untitledId;
        return (
          (documentPath =
            documentPath + (File.isWin ? '\\' : '/') + (File.bundle.bundleFile || 'untitled')),
          (fileIntegration.getFileNameFromPath(documentPath) || 'untitled').replace(
            /\.textbundle$/,
            '',
          ) +
            '-' +
            pathHash
        );
      },
      x = async function (markdownText, assetCopyMode) {
        var filePath = File.isWin ? '\\' : '/',
          bundleDirectoryName = w(),
          searchValue = await C(!0);
        if (0 != (File.bundle.filePath || '').indexOf(searchValue)) {
          var bundleRecoveryPath = searchValue + filePath + bundleDirectoryName,
            fileSystemExtra = reqnode('fs-extra');
          await fileSystemExtra.ensureDir(bundleRecoveryPath), d('text');
          try {
            await fileSystemExtra.writeFile(
              bundleRecoveryPath + filePath + recoveryFileName,
              markdownText,
            ),
              g(recoveryFileName, bundleDirectoryName);
          } catch (error) {
            console.sendError(error, 'skip');
          }
          if ('skip' !== assetCopyMode)
            try {
              await fileSystemExtra.copy(
                File.bundle.filePath + filePath + 'assets',
                bundleRecoveryPath + filePath + 'assets',
                {
                  overwrite: 'overwrite' === assetCopyMode,
                },
              );
            } catch (currentError) {
              'ENOENT' == !currentError.code && console.sendError(currentError, 'skip');
            }
        }
      },
      C = function (pathOnly) {
        var recoveryRoot =
          window._options.userDataPath + (File.isWin ? '\\' : '/') + 'draftsRecover';
        return pathOnly
          ? recoveryRoot
          : new Promise((resolvePromise) => {
              reqnode('fs-extra')
                .ensureDir(recoveryRoot)
                .then(
                  () => {
                    resolvePromise(recoveryRoot);
                  },
                  () => {
                    resolvePromise('');
                  },
                );
            });
      };
    (moduleExports.textBundleDraftFolder = async function () {
      if (File.bundle.unzipFolder) return File.bundle.unzipFolder;
      var unzipFolder = await C();
      if (unzipFolder) {
        var pathSeparator = File.isWin ? '\\' : '/';
        if (0 != (File.bundle.filePath || '').indexOf(unzipFolder))
          return (
            (unzipFolder = unzipFolder + pathSeparator + w()),
            (File.bundle.unzipFolder = unzipFolder),
            unzipFolder
          );
      }
    }),
      (moduleExports.saveFileToRecover = async function (copyEntireBundle) {
        if (File.bundle.filePath) {
          var searchValue = await C();
          if (searchValue) {
            var pathSeparator = File.isWin ? '\\' : '/';
            if (0 != (File.bundle.filePath || '').indexOf(searchValue)) {
              if (File.isTextBundle()) {
                if (
                  (d('text'), (searchValue = searchValue + pathSeparator + w()), copyEntireBundle)
                )
                  try {
                    return void (await reqnode('fs-extra').copy(File.bundle.fileName, searchValue, {
                      overwrite: !1,
                    }));
                  } catch (error) {
                    console.sendError(error, 'skip');
                  }
              } else d(File.getFileName());
              try {
                await reqnode('fs-extra').copy(
                  File.getTextFile(),
                  searchValue + (File.isWin ? '\\' : '/') + recoveryFileName,
                ),
                  g(File.getFileName(!0), w());
              } catch (currentError) {
                console.sendError(currentError, 'skip');
              }
            }
          }
        }
      }),
      (moduleExports.backupAssets = async function (assetNames, moveAssets) {
        if (!File.bundle.filePath) return;
        const fileSystemExtra = reqnode('fs-extra'),
          bundleRecoveryPath = await x(),
          filePath = File.isWin ? '\\' : '/',
          assetsBackupPath =
            bundleRecoveryPath + filePath + File.getFileName() + filePath + 'assets';
        await fileSystemExtra.ensureDir(assetsBackupPath);
        var items = [];
        for (var assetName of assetNames) {
          let sourcePath = File.bundle.filePath + filePath + 'assets' + filePath + assetName;
          moveAssets
            ? items.push(
                fileSystemExtra.move(sourcePath, assetsBackupPath + filePath + assetName, {
                  overwrite: !1,
                }),
              )
            : items.push(
                fileSystemExtra.copy(sourcePath, assetsBackupPath + filePath + assetName, {
                  overwrite: !1,
                  errorOnExist: !1,
                }),
              );
        }
        return await Promise.all(items);
      }),
      (moduleExports.watchFileChange = p),
      (moduleExports.onPresentationMoved = f),
      (moduleExports.onFilePathUpdated = b),
      (moduleExports.onFilePathRemoved = y),
      (moduleExports.saveToRecover = async function (text, assetCopyMode) {
        if (text && ('string' != typeof text || text.trim().length)) {
          var recoveryRoot = await C();
          recoveryRoot &&
            (File.isTextBundle()
              ? await x(text, assetCopyMode)
              : (function (markdownText, recoveryDirectory) {
                  try {
                    d(File.getFileName()),
                      reqnode('fs').writeFile(
                        recoveryDirectory + '/' + recoveryFileName,
                        markdownText,
                        function (inputError) {
                          inputError ? m(inputError) : g(File.getFileName(!0));
                        },
                      );
                  } catch (error) {
                    console.sendError(error, 'skip');
                  }
                })(text, recoveryRoot));
        }
      }),
      (moduleExports.prepareInfoPanel = function () {
        function e(tabName) {
          $('.info-panel-tab.active').removeClass('active'),
            'file' == tabName
              ? File.editor.library.switch('files', !0)
              : File.editor.library.switch('outline');
        }
        (document.querySelector('#file-library').style.display = ''),
          (document.querySelector('#file-info-content').style.display = 'none'),
          $('#info-panel-tab-file').on('click', function () {
            e('file');
          }),
          $('#info-panel-tab-outline').on('click', function () {
            e('outline');
          });
      }),
      (moduleExports.assetsParentForUntitled = function () {
        var pathSeparator = File.isWin ? '\\' : '/',
          bundleDirectoryName = w();
        return C(!0) + pathSeparator + bundleDirectoryName;
      });
  },
);
