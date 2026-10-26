// document/recovery.
export default function initializeDocumentRecovery(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  var recoveryFileName,
    timerId,
    utilities = requireModule('shared/utilities'),
    fileIntegration = requireModule('host/file-integration'),
    dialogs = requireModule('ui/dialogs'),
    fileWatcher = null,
    polledPath = null,
    createRecoveryFileName = function (documentName) {
      var dateInstance = new Date();
      return (recoveryFileName =
        utilities.formateDateOnly(new Date()) +
        ' ' +
        (documentName || 'untitled').replace(/\.[^.]*$/, '') +
        ' ' +
        utilities.formateTimeOnly(dateInstance, true).replace(/:/g, '') +
        '.md');
    };
  function watchFileByPolling(filePath) {
    var currentTimerId;
    try {
      var fileSystem = reqnode('fs');
      if (polledPath) {
        fileSystem.unwatchFile(polledPath);
        console.debug(`fs.unwatchFile(${polledPath})`);
      }
      polledPath = filePath;
      console.debug(`fs.watchFile(${filePath})`);
      fileSystem.watchFile(filePath, function (currentStats, previousStats) {
        if (
          !(
            new Date() - File.bundle.modifiedDate < 900 ||
            (currentStats && currentStats.mtime == previousStats.mtime)
          )
        ) {
          if (currentTimerId) {
            clearTimeout(currentTimerId);
          }
          currentTimerId = setTimeout(function () {
            if (currentStats) {
              File.presentedItemChanged(void 0, currentStats, filePath);
            } else {
              switchDeletedFileToUntitled();
            }
            currentTimerId = null;
          }, 200);
        }
      });
    } catch (error) {
      console.log(error);
    }
  }
  function handleWatchedFileChange(changedPath, restartWatcher) {
    var fileSystem = reqnode('fs');
    if (!File.editor.library.isSuppressOnChange()) {
      fileSystem.stat(changedPath, function (error, fileInfo) {
        if (File.isTextBundle()) {
          if (
            0 != changedPath.indexOf(File.bundle.filePath || ':') &&
            changedPath.indexOf(File.bundle.originalPath || ':')
          ) {
            return;
          }
        } else {
          if (changedPath !== File.bundle.filePath && changedPath !== File.bundle.originalPath) {
            return;
          }
        }
        if (error || !fileInfo) {
          watchFile(null);
          window.clientHandlerOnPresentationMoved();
        } else {
          File.presentedItemChanged(void 0, fileInfo, changedPath);
          if (restartWatcher) {
            watchFile(changedPath);
          }
        }
      });
      timerId = null;
    }
  }
  function watchFile(filePath) {
    if (reqnode && !File.isTextPack()) {
      var fileSystem = reqnode('fs');
      if (fileWatcher) {
        fileWatcher.removeAllListeners();
        fileWatcher.close();
        fileWatcher._handle = null;
        fileWatcher = null;
        console.debug('fsWatcher.close');
      }
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = null;
      if (polledPath) {
        fileSystem.unwatchFile(polledPath);
        console.debug(`fsWatcher.unwatchFile(${polledPath})`);
      }
      if (filePath) {
        try {
          console.debug(`fsWatcher.watch(${filePath})`);
          (fileWatcher = fileSystem.watch(filePath, { persistent: false }))._start = new Date();
          fileWatcher.on('change', function (eventType, changedName) {
            if (!(new Date() - fileWatcher._start < 100)) {
              console.debug(`fsWatcher ${eventType} ${changedName}`);
              if ('rename' != eventType) {
                console.debug('fsWatcher file ' + eventType + 'd, filename: ' + changedName);
                if (!(new Date() - File.bundle.modifiedDate < 900)) {
                  if (timerId) {
                    clearTimeout(timerId);
                  }
                  timerId = setTimeout(function () {
                    handleWatchedFileChange(filePath);
                  }, 500);
                }
              } else {
                if (File.inSavingProcess) {
                  watchFile(filePath);
                } else {
                  var pathUtilities = reqnode('path');
                  if (
                    pathUtilities.join(pathUtilities.dirname(filePath), changedName) == filePath
                  ) {
                    handleWatchedFileChange(filePath, true);
                  }
                }
              }
            }
          });
          fileWatcher.on('error', function (watchError) {
            fileWatcher.close();
            fileWatcher._handle = null;
            fileWatcher = null;
            watchFileByPolling(filePath);
            console.debug(watchError);
          });
        } catch (error) {
          if (fileWatcher && 'ENOENT' == error.code) {
            fileWatcher.close();
            fileWatcher._handle = null;
            return void (fileWatcher = null);
          }
          console.debug(error);
          watchFileByPolling(filePath);
        }
      }
    }
  }
  var switchDeletedFileToUntitled = function () {
    JSBridge.invoke('document.switchToUntitled', File.bundle.filePath);
    Reporter.record('current file is moved/deleted');
  };
  window.clientHandlerOnPresentationMoved = function () {
    if (File.isNode && File.isActiveWindow()) {
      File.updateChangeCount(File.ChangeType.NSChangeReadOtherContents);
    }
    handleFilePathRemoved();
  };
  var reportRecoveryError = function (recoveryError) {
      if (recoveryError && window.debugMode) {
        console.warn(recoveryError);
      }
    },
    renameRecoveryDraft = async function (documentName, bundleDirectoryName) {
      if (recoveryFileName && documentName) {
        var recoveryDirectory = await getRecoveryDirectory(true);
        if (bundleDirectoryName) {
          recoveryDirectory = recoveryDirectory + (File.isWin ? '\\' : '/') + bundleDirectoryName;
        }
        try {
          var fileSystem = reqnode('fs'),
            pathUtilities = reqnode('path'),
            pathSeparator = File.isWin ? '\\' : '/',
            previousRecoveryPath = pathUtilities.resolve(recoveryDirectory, recoveryFileName);
          if (bundleDirectoryName) {
            File.draftsRecoverList.push(recoveryDirectory + pathSeparator + recoveryFileName);
            return void pruneRecoveryDrafts();
          }
          fileSystem.stat(previousRecoveryPath, function (inputError, unusedParameter2) {
            if (!inputError) {
              var renamedRecoveryPath = pathUtilities.resolve(
                recoveryDirectory,
                createRecoveryFileName(documentName),
              );
              fileSystem.rename(previousRecoveryPath, renamedRecoveryPath, reportRecoveryError);
              File.draftsRecoverList.push(renamedRecoveryPath);
              pruneRecoveryDrafts();
            }
          });
        } catch (error) {
          console.sendError(error);
        }
      }
    },
    pruneRecoveryDrafts = function () {
      if (File.draftsRecoverList.length < (File.isTextBundle() ? 6 : 10)) {
        return;
      }
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
          backupTimestamp = timestampPattern.exec(File.draftsRecoverList[currentItemIndex])[1] - 0;
        if (
          backupTimestamp - previousTimestamp > 0 &&
          backupTimestamp - previousTimestamp < retentionInterval
        ) {
          currentItems.push(backupPath);
        } else {
          localItems.push(backupPath);
          previousTimestamp = backupTimestamp;
        }
      }
      var items = localItems;
      if (localItems.length > 40) {
        items = [];
        localItems.forEach((item, itemIndex) => {
          if (itemIndex % 2 == 0 || itemIndex == localItems.length - 1) {
            items.push(item);
          } else {
            currentItems.push(item);
          }
        });
      }
      File.draftsRecoverList = items;
      var fileSystem = reqnode('fs');
      currentItems.forEach((item) => {
        fileSystem.unlink(item, (unlinkError) => {
          if (unlinkError) {
            console.debug(unlinkError);
          }
        });
      });
    },
    handleFilePathRemoved = function (unusedParameter1) {
      console.log('onFilePathRemoved');
      if (File.bundle.filePath) {
        File.bundle.originalPath = File.bundle.filePath;
        File.bundle.filePath = '';
        updateRecoveryFileIdentity(File.bundle.fileName);
      }
    },
    updateRecoveryFileIdentity = function (fileName, previousFilePath, previousImageStorage) {
      var filePath = File.bundle.filePath;
      /bundle\//.exec(filePath);
      fileName =
        fileName || fileIntegration.getFileNameFromPath(filePath || File.bundle.originalPath);
      File.bundle.fileName = fileName;
      var menuPatch = {
        'File→Open File Location': { enabled: !!filePath },
        'File→Reveal in Sidebar': { enabled: !!filePath },
        'File→Delete…': { enabled: !!filePath },
      };
      if (File.isNode && !File.isMacNode) {
        menuPatch['File→Reopen with Encoding'] = { hidden: !filePath };
      }
      if (File.isWin) {
        menuPatch['File→Properties'] = { enabled: !!filePath };
      } else {
        if (File.isMac) {
          menuPatch['File→Get Info'] = { enabled: !!filePath };
        }
      }
      JSBridge.menu.update(menuPatch);
      console.log(`onFilePathUpdated ${filePath}`);
      window.Reporter.record(`File.bundle.filePath = ${utilities.hashCode(filePath)}`);
      File.bundle.assetsChanges = null;
      const imageEditor = File.editor && File.editor.imgEdit,
        fileLibrary = File.editor && File.editor.library;
      if (imageEditor) {
        imageEditor.cachedFileImageStorage = void 0;
      }
      File.setDefaultImageStorage(File.option.defaultImageStorage);
      File.onMetaDataChanged();
      if (fileLibrary) {
        File.editor.library.markCurrentFile();
      }
      if (previousFilePath) {
        (function (previousFilePath, previousImageStorage) {
          if (!File.isTextBundle()) {
            File.editor.imgEdit.onFileMoved(previousFilePath, previousImageStorage);
          }
        })(previousFilePath, previousImageStorage);
      }
      if (File.isNode) {
        if (previousFilePath && File.isTextBundle()) {
          (async function (previousFilePath) {
            var pathSeparator = File.isWin ? '\\' : '/',
              recoveryRoot = getRecoveryDirectory(true),
              previousBundleName = getRecoveryBundleName(previousFilePath),
              currentBundleName = getRecoveryBundleName();
            try {
              await reqnode('fs-extra').move(
                recoveryRoot + pathSeparator + previousBundleName,
                recoveryRoot + pathSeparator + currentBundleName,
              );
            } catch (error) {
              console.info(error);
            }
          })(previousFilePath || '');
        }
        var titleElement = $('#title-text');
        if (filePath) {
          JSBridge.invoke('document.hasDuplicateName', fileName).then((result) => {
            if (result) {
              titleElement.text(filePath);
              JSBridge.invoke('window.setTitle', filePath + ' - MarkLyra');
            } else {
              titleElement.text(fileName);
              JSBridge.invoke('window.setTitle', fileName + ' - MarkLyra');
            }
            fileIntegration.refreshTitlebarText();
          });
          renameRecoveryDraft(fileName);
          if (File.editor.library) {
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
            if (outsideMountFolder) {
              File.setMountFolder(reqnode('path').dirname(filePath));
              File.editor.library.onRootChanged(File.mountFolder_, true);
            }
          }
        } else {
          if (fileName) {
            titleElement.text(fileName);
            JSBridge.invoke('window.setTitle', fileName + '• - MarkLyra');
          } else {
            titleElement.text($.localize.getString('Untitled'));
            JSBridge.invoke(
              'window.setTitle',
              $.localize.getString('Untitled') +
                (File.changeCounter && !File.changeCounter.curState
                  ? '• - MarkLyra'
                  : ' - MarkLyra'),
            );
          }
        }
        watchFile(File.getTextFile() || null);
        if (/draftsRecover/.exec(File.bundle.filePath || '')) {
          (function () {
            const pathUtilities = reqnode('path'),
              recoveryRoot = pathUtilities.join(File.option.userDataPath, 'draftsRecover');
            if (
              0 ==
              pathUtilities
                .normalize(File.bundle.filePath)
                .indexOf(recoveryRoot + pathUtilities.sep)
            ) {
              dialogs.showHintOrWarning({
                key: '',
                title:
                  '<strong>' +
                  $.localize.getString('You are not supposed to edit or save this file.', 'Front') +
                  '</strong>',
                body: $.localize
                  .getString(
                    'Files in this location (%@) are managed by MarkLyra, and may be deleted automatically.<br/>Please copy content to a new file for further editing.',
                    'Front',
                  )
                  .replace('%@', 'draftsRecover'),
              });
            }
          })();
        }
      }
    };
  var getRecoveryBundleName = function (pathOverride) {
      if (!File.isTextBundle() && !File.isTextPack()) {
        return null;
      }
      if (File.bundle.unzipFolder) {
        return utilities.getFileName(File.bundle.unzipFolder);
      }
      var documentPath =
          void 0 !== pathOverride ? pathOverride : File.bundle.filePath || File.bundle.originalPath,
        pathHash = documentPath
          ? (function (text) {
              let hashValue = 0;
              for (
                let characterIndex = 0, textLength = text.length;
                characterIndex < textLength;
                characterIndex++
              ) {
                hashValue = (hashValue << 5) - hashValue + text.charCodeAt(characterIndex);
                hashValue |= 0;
              }
              return hashValue;
            })(documentPath)
          : File.bundle.untitledId;
      documentPath =
        documentPath + (File.isWin ? '\\' : '/') + (File.bundle.bundleFile || 'untitled');
      return (
        (fileIntegration.getFileNameFromPath(documentPath) || 'untitled').replace(
          /\.textbundle$/,
          '',
        ) +
        '-' +
        pathHash
      );
    },
    saveRecoveryContent = async function (markdownText, assetCopyMode) {
      var filePath = File.isWin ? '\\' : '/',
        bundleDirectoryName = getRecoveryBundleName(),
        searchValue = await getRecoveryDirectory(true);
      if (0 != (File.bundle.filePath || '').indexOf(searchValue)) {
        var bundleRecoveryPath = searchValue + filePath + bundleDirectoryName,
          fileSystemExtra = reqnode('fs-extra');
        await fileSystemExtra.ensureDir(bundleRecoveryPath);
        createRecoveryFileName('text');
        try {
          await fileSystemExtra.writeFile(
            bundleRecoveryPath + filePath + recoveryFileName,
            markdownText,
          );
          renameRecoveryDraft(recoveryFileName, bundleDirectoryName);
        } catch (error) {
          console.sendError(error, 'skip');
        }
        if ('skip' !== assetCopyMode) {
          try {
            await fileSystemExtra.copy(
              File.bundle.filePath + filePath + 'assets',
              bundleRecoveryPath + filePath + 'assets',
              {
                overwrite: 'overwrite' === assetCopyMode,
              },
            );
          } catch (currentError) {
            if ('ENOENT' == !currentError.code) {
              console.sendError(currentError, 'skip');
            }
          }
        }
      }
    },
    getRecoveryDirectory = function (pathOnly) {
      var recoveryRoot = window._options.userDataPath + (File.isWin ? '\\' : '/') + 'draftsRecover';
      if (pathOnly) {
        return recoveryRoot;
      } else {
        return new Promise((resolvePromise) => {
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
      }
    };
  moduleExports.textBundleDraftFolder = async function () {
    if (File.bundle.unzipFolder) {
      return File.bundle.unzipFolder;
    }
    var unzipFolder = await getRecoveryDirectory();
    if (unzipFolder) {
      var pathSeparator = File.isWin ? '\\' : '/';
      if (0 != (File.bundle.filePath || '').indexOf(unzipFolder)) {
        unzipFolder = unzipFolder + pathSeparator + getRecoveryBundleName();
        File.bundle.unzipFolder = unzipFolder;
        return unzipFolder;
      }
    }
  };
  moduleExports.saveFileToRecover = async function (copyEntireBundle) {
    if (File.bundle.filePath) {
      var searchValue = await getRecoveryDirectory();
      if (searchValue) {
        var pathSeparator = File.isWin ? '\\' : '/';
        if (0 != (File.bundle.filePath || '').indexOf(searchValue)) {
          if (File.isTextBundle()) {
            createRecoveryFileName('text');
            searchValue = searchValue + pathSeparator + getRecoveryBundleName();
            if (copyEntireBundle) {
              try {
                return void (await reqnode('fs-extra').copy(File.bundle.fileName, searchValue, {
                  overwrite: false,
                }));
              } catch (error) {
                console.sendError(error, 'skip');
              }
            }
          } else {
            createRecoveryFileName(File.getFileName());
          }
          try {
            await reqnode('fs-extra').copy(
              File.getTextFile(),
              searchValue + (File.isWin ? '\\' : '/') + recoveryFileName,
            );
            renameRecoveryDraft(File.getFileName(true), getRecoveryBundleName());
          } catch (currentError) {
            console.sendError(currentError, 'skip');
          }
        }
      }
    }
  };
  moduleExports.backupAssets = async function (assetNames, moveAssets) {
    if (!File.bundle.filePath) {
      return;
    }
    const fileSystemExtra = reqnode('fs-extra'),
      bundleRecoveryPath = await saveRecoveryContent(),
      filePath = File.isWin ? '\\' : '/',
      assetsBackupPath = bundleRecoveryPath + filePath + File.getFileName() + filePath + 'assets';
    await fileSystemExtra.ensureDir(assetsBackupPath);
    var items = [];
    for (var assetName of assetNames) {
      let sourcePath = File.bundle.filePath + filePath + 'assets' + filePath + assetName;
      if (moveAssets) {
        items.push(
          fileSystemExtra.move(sourcePath, assetsBackupPath + filePath + assetName, {
            overwrite: false,
          }),
        );
      } else {
        items.push(
          fileSystemExtra.copy(sourcePath, assetsBackupPath + filePath + assetName, {
            overwrite: false,
            errorOnExist: false,
          }),
        );
      }
    }
    return await Promise.all(items);
  };
  moduleExports.watchFileChange = watchFile;
  moduleExports.onPresentationMoved = switchDeletedFileToUntitled;
  moduleExports.onFilePathUpdated = updateRecoveryFileIdentity;
  moduleExports.onFilePathRemoved = handleFilePathRemoved;
  moduleExports.saveToRecover = async function (text, assetCopyMode) {
    if (text && ('string' != typeof text || text.trim().length)) {
      var recoveryRoot = await getRecoveryDirectory();
      if (recoveryRoot) {
        if (File.isTextBundle()) {
          await saveRecoveryContent(text, assetCopyMode);
        } else {
          (function (markdownText, recoveryDirectory) {
            try {
              createRecoveryFileName(File.getFileName());
              reqnode('fs').writeFile(
                recoveryDirectory + '/' + recoveryFileName,
                markdownText,
                function (inputError) {
                  if (inputError) {
                    reportRecoveryError(inputError);
                  } else {
                    renameRecoveryDraft(File.getFileName(true));
                  }
                },
              );
            } catch (error) {
              console.sendError(error, 'skip');
            }
          })(text, recoveryRoot);
        }
      }
    }
  };
  moduleExports.prepareInfoPanel = function () {
    function switchInfoPanelTab(tabName) {
      $('.info-panel-tab.active').removeClass('active');
      if ('file' == tabName) {
        File.editor.library.switch('files', true);
      } else {
        File.editor.library.switch('outline');
      }
    }
    document.querySelector('#file-library').style.display = '';
    document.querySelector('#file-info-content').style.display = 'none';
    $('#info-panel-tab-file').on('click', function () {
      switchInfoPanelTab('file');
    });
    $('#info-panel-tab-outline').on('click', function () {
      switchInfoPanelTab('outline');
    });
  };
  moduleExports.assetsParentForUntitled = function () {
    var pathSeparator = File.isWin ? '\\' : '/',
      bundleDirectoryName = getRecoveryBundleName();
    return getRecoveryDirectory(true) + pathSeparator + bundleDirectoryName;
  };
}
