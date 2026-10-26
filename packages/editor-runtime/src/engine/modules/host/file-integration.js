// host/file-integration.
export default function initializeHostFileIntegration(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(captureResizeSelection, 'name', { value: 'x', configurable: true });
  Object.defineProperty(restoreResizeSelection, 'name', { value: 'C', configurable: true });

  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    assetStorage = requireModule('media/asset-storage'),
    mediaActions = requireModule('media/actions'),
    dialogs = requireModule('ui/dialogs'),
    ChangeType = {
      NSChangeDone: 0,
      NSChangeUndone: 1,
      NSChangeCleared: 2,
      NSChangeReadOtherContents: 3,
      NSChangeAutoSaved: 4,
      NSChangeRedone: 5,
      NodeSaveFailed: -1,
    },
    DocumentChangeCounter = Object.defineProperty(
      function () {
        this.doneStack = [];
        this.undoneStack = [];
        this.curState = [ChangeType.NSChangeAutoSaved, new Date() - 0];
        this.lastSaved = this.curState[1];
      },
      'name',
      { value: 'l', configurable: true },
    );
  DocumentChangeCounter.prototype.isDocumentEdited = function () {
    return !this.curState;
  };
  DocumentChangeCounter.prototype.withdrawAutoSaved = function () {
    if (this.curState) {
      if (this.curState[0] != ChangeType.NSChangeAutoSaved) {
        return true;
      }
      this.curState = null;
    }
    return false;
  };
  DocumentChangeCounter.prototype.clone = function () {
    return {
      doneStack: this.doneStack.clone(),
      undoneStack: this.undoneStack.clone(),
      curState: this.curState,
      lastSaved: this.lastSaved,
    };
  };
  DocumentChangeCounter.prototype.reset = function (previousCounter) {
    this.doneStack = previousCounter ? previousCounter.doneStack : [];
    this.undoneStack = previousCounter ? previousCounter.undoneStack : [];
    this.curState = previousCounter
      ? previousCounter.curState
      : [ChangeType.NSChangeAutoSaved, new Date() - 0];
    let lastSaved = this.lastSaved;
    this.lastSaved = previousCounter ? previousCounter.lastSaved : this.curState[1];
    if (lastSaved != this.lastSaved) {
      scheduleAutoSave();
    }
  };
  DocumentChangeCounter.prototype.isDiscardableUntitled = function () {
    return !(File.isDocumentEdited() || File.bundle.filePath);
  };
  DocumentChangeCounter.prototype.updateChangeCount = function (changeType) {
    var currentCurState,
      curState = this.curState;
    switch (((File.bundle.hasModified = File.bundle.filePath || true), changeType)) {
      case ChangeType.NSChangeDone:
        if (this.curState && this.curState[0] === ChangeType.NSChangeAutoSaved) {
          this.doneStack.push(this.curState);
          this.curState = null;
        }
        this.doneStack.push([changeType]);
        if (this.doneStack.length > 200) {
          this.doneStack.splice(0, this.doneStack.length - 200);
        }
        this.undoneStack = [];
        break;
      case ChangeType.NSChangeUndone:
        for (
          this.curState &&
            this.curState[0] === ChangeType.NSChangeAutoSaved &&
            (this.undoneStack.push(this.curState), (this.curState = null)),
            this.doneStack.pop(),
            this.undoneStack.push([changeType]);
          (currentCurState = this.doneStack.last()) &&
          currentCurState &&
          currentCurState[0] === ChangeType.NSChangeAutoSaved;
        ) {
          this.doneStack.pop();
          if (this.lastSaved === currentCurState[1]) {
            this.curState = currentCurState;
          }
        }
        break;
      case ChangeType.NSChangeRedone:
        for (
          this.curState &&
            this.curState[0] === ChangeType.NSChangeAutoSaved &&
            (this.doneStack.push(this.curState), (this.curState = null)),
            this.undoneStack.pop(),
            this.doneStack.push([changeType]);
          (currentCurState = this.undoneStack.last()) &&
          currentCurState &&
          currentCurState[0] === ChangeType.NSChangeAutoSaved;
        ) {
          this.undoneStack.pop();
          if (this.lastSaved === currentCurState[1]) {
            this.curState = currentCurState;
          }
        }
        break;
      case ChangeType.NSChangeCleared:
        this.doneStack = [];
        this.undoneStack = [];
        this.curState = [ChangeType.NSChangeAutoSaved, new Date() - 0];
        this.lastSaved = this.curState[1];
        break;
      case ChangeType.NodeSaveFailed:
        if (this.curState) {
          this.lastSaved = null;
          this.curState = null;
        }
        break;
      case ChangeType.NSChangeAutoSaved:
        if (this.curState) {
          return;
        }
        this.curState = [ChangeType.NSChangeAutoSaved, new Date() - 0];
        this.lastSaved = this.curState[1];
        break;
      case ChangeType.NSChangeReadOtherContents:
        for (
          var doneStack = [], undoneStack = [], itemIndex = 0;
          itemIndex < this.doneStack.length;
          itemIndex++
        ) {
          if (this.doneStack[itemIndex][0] !== ChangeType.NSChangeAutoSaved) {
            doneStack.push(this.doneStack[itemIndex]);
          }
        }
        for (itemIndex = 0; itemIndex < this.undoneStack.length; itemIndex++) {
          if (this.undoneStack[itemIndex][0] !== ChangeType.NSChangeAutoSaved) {
            undoneStack.push(this.undoneStack[itemIndex]);
          }
        }
        this.doneStack = doneStack;
        this.undoneStack = undoneStack;
        this.curState = null;
    }
    if (curState !== this.curState && File.isNodeHtml) {
      scheduleAutoSave();
    }
  };
  var scheduleAutoSave = Object.defineProperty(
    function () {
      const restoredUntitled =
        !File.bundle.filePath && (File.bundle.fileName || File.bundle.originalPath);
      if (File.changeCounter) {
        if (restoredUntitled || !File.changeCounter.curState || File.inSavingProcess) {
          if (
            !(File.bundle.filePath && File.option.enableAutoSave && File.changeCounter.lastSaved)
          ) {
            document.querySelector('#title-text').classList.add('title-modified');
            if (File.isNode) {
              JSBridge.invoke('window.setTitle', void 0, true);
            }
            document.querySelector('#m-saved').parentElement.classList.remove('saved');
          }
        } else {
          if ((File.bundle.filePath || File.bundle.fileName) && File.isNode) {
            JSBridge.invoke('window.setTitle', void 0, false);
          }
          document.querySelector('#title-text').classList.remove('title-modified');
          document.querySelector('#m-saved').parentElement.classList.add('saved');
        }
      }
    },
    'name',
    { value: 'c', configurable: true },
  );
  moduleExports.showExportDialog = async function (exportFormat, exportOptions, customFilters) {
    if ((exportOptions = exportOptions || {}).path && exportOptions.overwrite) {
      if (File.option.noWarningForExportOverwrite) {
        return exportOptions.path;
      }
      var confirmation = await dialogs.showWarningDialog(
        $.localize
          .getString(
            '"Export and Overwrite with Previous" will overwrite file at %@, would you continue?',
            'Panel',
          )
          .replace('%@', exportOptions.path),
        true,
      );
      if (0 != confirmation.response) {
        return null;
      } else {
        if (confirmation.checkboxChecked) {
          JSBridge.execForAll(
            'window.File && File.option && (File.option.noWarningForExportOverwrite = true)',
          );
          JSBridge.putSetting('noWarningForExportOverwrite', true);
        }
        return exportOptions.path;
      }
    }
    return await new Promise((resolvePromise) => {
      !(function (format, onSelected, dialogOptions, customFilters) {
        var defaultFileName,
          filters = [];
        if (!(dialogOptions = dialogOptions || {}).selectFolder) {
          filters = customFilters || [
            { name: format.toUpperCase(), extensions: [format] },
            { name: $.localize.getString('All Files', 'Panel'), extensions: ['*'] },
          ];
        }
        var defaultPath = File.isLinuxSnap
          ? ''
          : getDefaultExportPath(format, dialogOptions, (fileName) => {
              defaultFileName = fileName;
            });
        if (File.isNode) {
          JSBridge.invoke(
            dialogOptions.selectFolder ? 'dialog.showOpenDialog' : 'dialog.showSaveDialog',
            {
              properties: dialogOptions.selectFolder
                ? ['saveFile', 'createDirectory']
                : ['openDirectory'],
              title: $.localize.getString('Save', 'Menu'),
              defaultPath: defaultPath,
              filters: filters,
            },
          ).then(({ filePath: selectedPath }) => {
            if (selectedPath) {
              File.option.lastSaveLocation = reqnode('path').dirname(selectedPath);
              Analytics.record('export', { format: format });
            }
            onSelected(selectedPath);
          });
        }
        if (File.isMac) {
          if (dialogOptions.selectFolder) {
            bridge.callHandler(
              'path.selectFolderOrFile',
              { forExport: true, dir: true, defaultPath: defaultPath },
              (selectedPath) => {
                Analytics.record('export', { format: format });
                onSelected(selectedPath);
              },
            );
          } else {
            bridge.callHandler(
              'path.showSaveDialog',
              {
                defaultPath: defaultFileName ? '' : defaultPath,
                filters: filters ? filters[0].extensions : null,
              },
              (selectedPath) => {
                Analytics.record('export', { format: format });
                onSelected(selectedPath);
              },
            );
          }
        }
      })(exportFormat, resolvePromise, exportOptions, customFilters);
    });
  };
  var getDefaultExportPath = Object.defineProperty(
      function (extension, exportOptions, onDefaultFileName) {
        var lastSaveLocation = File.isWin ? '\\' : '/',
          suggestedFileName = (extension =
            null === extension || void 0 === extension
              ? File.FileOption.getDefaultExtension()
              : extension)
            ? File.getSuggestedFileName() + '.' + extension
            : File.getSuggestedFileName();
        if ((exportOptions = exportOptions || {}).path) {
          if (!File.option.lastExport || File.option.lastExportNoOverwrite) {
            return (
              utilities.pathByDeleteLastComponent(exportOptions.path) +
              lastSaveLocation +
              suggestedFileName
            );
          } else {
            return exportOptions.path;
          }
        } else {
          if (File.option.lastSaveLocation) {
            return File.option.lastSaveLocation + lastSaveLocation + suggestedFileName;
          } else {
            if ('same' === exportOptions.exportFolder) {
              return getCurrentFileFolderPath() + lastSaveLocation + suggestedFileName;
            } else {
              if ('custom' === exportOptions.exportFolder) {
                exportOptions.customExportPath =
                  exportOptions.customExportPath || window._options.documentsPath;
                return exportOptions.customExportPath + lastSaveLocation + suggestedFileName;
              } else {
                if (File.mountFolder_) {
                  return File.mountFolder_ + lastSaveLocation + suggestedFileName;
                } else {
                  if (onDefaultFileName) {
                    onDefaultFileName(suggestedFileName);
                  }
                  return suggestedFileName;
                }
              }
            }
          }
        }
      },
      'name',
      { value: 'd', configurable: true },
    ),
    getCurrentFileFolderPath = Object.defineProperty(
      function () {
        if (File.isMac) {
          return File.bundle.currentFolderPath;
        } else {
          if (File.isNode && File.bundle.filePath) {
            return reqnode('path').dirname(File.bundle.filePath || File.bundle.originalPath);
          } else {
            return '';
          }
        }
      },
      'name',
      { value: 'u', configurable: true },
    ),
    getCurrentFilePath = Object.defineProperty(
      function () {
        return File.bundle.filePath || '';
      },
      'name',
      { value: 'h', configurable: true },
    );
  var saveBeforeClosing = Object.defineProperty(
    async (allowAutoSave, retryCount) => {
      if (File._onInitParse) {
        return Promise.reject('init parse');
      }
      File.editor.searchPanel.closePanel(true, true);
      if (File.inSavingProcess) {
        retryCount = retryCount || 1;
        await ((delay) =>
          new Promise((resolvePromise) => {
            setTimeout(resolvePromise, delay);
          }))(100 * retryCount);
        if (File.inSavingProcess) {
          if (retryCount > 5) {
            File.inSavingProcess = false;
            File.updateChangeCount(File.ChangeType.NodeSaveFailed);
            return Promise.reject('save parse');
          } else {
            return await saveBeforeClosing(allowAutoSave, retryCount + 1);
          }
        } else {
          return await saveBeforeClosing(allowAutoSave);
        }
      }
      if (
        !File.bundle.unsupported &&
        (File.bundle.hasModified ||
          1 != File.draftsRecoverList.length ||
          reqnode('fs').unlink(File.draftsRecoverList[0], () => {}),
        File.bundle.hasModified &&
          File.changeCounter.isDocumentEdited() &&
          (await JSBridge.invoke('document.noOtherWindow')))
      ) {
        if (
          allowAutoSave &&
          (File.option.enableAutoSave || File.option.saveFileOnSwitch) &&
          File.bundle.filePath &&
          reqnode('fs').existsSync(File.bundle.filePath)
        ) {
          if (false === (await File.saveUseNode(false, false, true))) {
            throw new Error('save failed');
          }
          return;
        }
        await File.backupWindow(true);
        return new Promise((resolvePromise, rejectPromise) => {
          dialogs.showDialog({
            title: $.localize.getString('Save', 'Menu'),
            html: $.localize.getString(
              "Do you want to save the changes made to this document ?<br> Your changes will be lost if you don't save them.",
              'Panel',
            ),
            buttons: [
              $.localize.getString('Save', 'Menu'),
              $.localize.getString(File.bundle.filePath ? 'Discard Changes' : 'Discard', 'Panel'),
              $.localize.getString('Cancel'),
            ],
            backdrop: false,
            keyboard: true,
            callback: async function (buttonIndex) {
              if (0 == buttonIndex) {
                File._needsUpdateSnap = new Date();
                var saved = await File.saveUseNode(false, false, true);
                if (saved) {
                  try {
                    File.updateChangeCount(File.ChangeType.NSChangeAutoSaved);
                    await File.buildDocumentSnapForNode(true);
                  } catch (error) {
                    console.sendError(error);
                    File.updateChangeCount(File.ChangeType.NodeSaveFailed);
                    saved = false;
                  }
                }
                if (saved) {
                  resolvePromise();
                } else {
                  rejectPromise(null);
                }
              } else {
                if (1 == buttonIndex) {
                  File.buildDocumentSnapForNode();
                  JSBridge.invoke('document.setLastSync', -1);
                  await mediaActions.onSaveDiscard();
                  resolvePromise();
                  File._needsUpdateSnap = false;
                } else {
                  JSBridge.invoke('app.cancelQuit');
                  File._onFileSwitching = false;
                  rejectPromise(null);
                }
              }
            },
          });
        });
      }
    },
    'name',
    { value: 'p', configurable: true },
  );
  moduleExports.tryLeaveDocument = function (onComplete, allowAutoSave) {
    saveBeforeClosing(allowAutoSave)
      .then(onComplete)
      .catch((error) => {
        if (null != error) {
          onComplete(error.message || error);
        }
      });
  };
  var isSupportedFile = Object.defineProperty(
      function (fileName, requireExtension) {
        if (fileName && '.' != fileName[0]) {
          var normalizedText = getFileExtension(fileName).toLowerCase();
          if (normalizedText) {
            return ~File.SupportedFiles.indexOf(normalizedText);
          } else {
            return !requireExtension;
          }
        }
        return false;
      },
      'name',
      { value: 'f', configurable: true },
    ),
    getFileExtension = Object.defineProperty(
      function (text) {
        return (
          (text
            .split(/[\/\\]/)
            .last()
            .match(/\.([^.]+)$/) || [])[1] || ''
        );
      },
      'name',
      { value: 'm', configurable: true },
    );
  !(function () {
    Object.defineProperty(copyDocumentMarkdown, 'name', { value: 'e', configurable: true });

    function copyDocumentMarkdown() {
      File.option.copyMarkdownByDefault = true;
      window.ClientCommand.selectAll();
      setTimeout(function () {
        window.ClientCommand.copy();
        setTimeout(function () {
          File.editor.EditHelper.showNotification('Context copied to clipboard.');
        }, 500);
      }, 500);
    }
    $('#save-error-banner')
      .on('click', '.btn', copyDocumentMarkdown)
      .on('click', '#trigger-save-error-dialog', function () {
        let html = $.localize.getString(
          "Save content failed for some reason.<br/>You could copy the content into a new MarkLyra window, and then save it. <br/>Learn more about:<ul><li><a href='https://github.com/Refinex-Space/marklyra'>Report bugs to us</a></li><li><a href='https://github.com/Refinex-Space/marklyra'>Recover lost contents</a></li></ul>",
          'Panel',
        );
        if (File.option.useMirrorInCN) {
          html = html.replace(/\.io\//g, 'io.cn/');
        }
        dialogs.showDialog({
          title: $.localize.getString('Something is Wrong…', 'Panel'),
          html: html,
          buttons: [
            $.localize.getString('Copy Content', 'Panel'),
            $.localize.getString('Close', 'Panel'),
          ],
          callback: function (buttonIndex) {
            File._onFileSwitching = false;
            if (0 == buttonIndex) {
              copyDocumentMarkdown();
              $('#save-error-banner').show();
            }
          },
        });
        $('#save-error-banner').hide();
      });
  })();
  const loadNativeMainModule = Object.defineProperty(
    function () {
      return reqnode(
        window.debugMode
          ? '../../launch/app/main.node'
          : `${window.dirname}/node_modules/main.node`,
      );
    },
    'name',
    { value: 'g', configurable: true },
  );
  moduleExports.winShell = loadNativeMainModule;
  var element,
    isLinux = false,
    resizeSelection = [],
    timerId = null;
  function captureResizeSelection() {
    var range = document.caretRangeFromPoint(window.innerWidth / 2, 40);
    resizeSelection =
      range && range.startContainer.parentElement.closest('[cid]')
        ? [range, range ? range.getBoundingClientRect() : null]
        : [];
  }
  function restoreResizeSelection() {
    if (resizeSelection) {
      var selectionRange = resizeSelection[0],
        previousBounds = resizeSelection[1];
      if (selectionRange) {
        var scrollTop = selectionRange.getBoundingClientRect().top - previousBounds.top;
        element.scrollTop += scrollTop;
      }
    }
  }
  $(document).ready(function () {
    element = document.querySelector('content');
    var sourceEventName,
      coalescedEventName,
      eventTarget,
      framePending,
      scheduleResizeSelectionRelease = Object.defineProperty(
        function () {
          if (timerId) {
            clearTimeout(timerId);
          }
          timerId = setTimeout(function () {
            resizeSelection = null;
          }, 500);
        },
        'name',
        { value: 'r', configurable: true },
      );
    window.addEventListener('beforeResize', function () {
      if (File && File.editor && !File._onInitParse) {
        captureResizeSelection();
      }
    });
    window.addEventListener('resize', function () {
      if (File && File.editor && !File._onInitParse && !resizeSelection) {
        captureResizeSelection();
        scheduleResizeSelectionRelease();
      }
    });
    sourceEventName = 'resize';
    coalescedEventName = 'optimizedResize';
    framePending = false;
    (eventTarget = eventTarget || window).addEventListener(sourceEventName, function () {
      if (!framePending) {
        framePending = true;
        requestAnimationFrame(function () {
          eventTarget.dispatchEvent(new CustomEvent(coalescedEventName));
          framePending = false;
        });
      }
    });
    window.addEventListener('optimizedResize', function () {
      if (File && File.editor && !File._onInitParse && resizeSelection) {
        setTimeout(restoreResizeSelection, 0);
        scheduleResizeSelectionRelease();
      }
    });
  });
  moduleExports.setItemInDB = function (storageKey, storageValue) {
    try {
      localStorage.setItem(storageKey + '', storageValue + '');
    } catch (error) {
      localStorage.clear();
      localStorage.setItem(storageKey, storageValue);
    }
  };
  moduleExports.removeItemInDB = function (storageKey) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      localStorage.clear();
    }
  };
  moduleExports.getItemInDB = function (storageKey) {
    return localStorage.getItem(storageKey);
  };
  moduleExports.getColorBrightness = function (colorText) {
    var mappedItems = (colorText.match(/[\d.]+/gi) || []).map(function (item) {
      return item - 0;
    });
    if (!(void 0 !== mappedItems[3] && null !== mappedItems[3])) {
      mappedItems[3] = 1;
    }
    if (0 == mappedItems[3]) {
      return 1;
    } else {
      return (299 * mappedItems[0] + 587 * mappedItems[1] + 114 * mappedItems[2]) / 256e3;
    }
  };
  moduleExports.getFileNameFromPath = function (inputFilePath, stripUrlSuffix) {
    try {
      inputFilePath = inputFilePath && decodeURI(inputFilePath);
    } catch (error) {}
    if (inputFilePath) {
      inputFilePath = (inputFilePath = inputFilePath
        .replace(/\\/g, '/')
        .replace(/\/$/, '')).substring(inputFilePath.lastIndexOf('/') + 1);
      if (stripUrlSuffix) {
        inputFilePath = inputFilePath.replace(/#[^\/]+$/, '').replace(/\?[^\/]+$/, '');
      }
    }
    return inputFilePath;
  };
  moduleExports.normalizePath = function (pathOrUrl, normalizeUrl) {
    if (!normalizeUrl && /^([a-z][a-z0-9+\-]+):\/\//gi.exec(pathOrUrl)) {
      return pathOrUrl;
    } else {
      if (File.isNode) {
        return reqnode('path').normalize(pathOrUrl);
      } else {
        return (function (text) {
          for (
            var parts = text.split('/'), textParts = [], itemIndex = 0;
            itemIndex < parts.length;
            itemIndex++
          ) {
            if ('.' != parts[itemIndex]) {
              if ('..' == parts[itemIndex]) {
                textParts.pop();
              } else {
                textParts.push(parts[itemIndex]);
              }
            }
          }
          return textParts.join('/').replace(/[\/]{1,}/g, '/');
        })(pathOrUrl);
      }
    }
  };
  moduleExports.getCurrentFilePath = getCurrentFilePath;
  moduleExports.getCurrentFileFolderPath = getCurrentFileFolderPath;
  moduleExports.getExtension = getFileExtension;
  moduleExports.ChangeType = ChangeType;
  moduleExports.ChangeCounter = DocumentChangeCounter;
  moduleExports.refreshTitlebarText = scheduleAutoSave;
  moduleExports.isSupportedFile = isSupportedFile;
  moduleExports.detectEncodeByNode = function (fileBytes) {
    var hasUtf8Bom = false;
    if (
      fileBytes.length > 2 &&
      239 === fileBytes[0] &&
      187 === fileBytes[1] &&
      191 === fileBytes[2]
    ) {
      hasUtf8Bom = true;
    }
    if (utilities.isUTF8(fileBytes)) {
      if (hasUtf8Bom) {
        return 'utf8-bom';
      } else {
        return 'utf8';
      }
    }
    var encodingDetector = reqnode('jschardet'),
      encodingCodec = reqnode('iconv-lite'),
      text = encodingDetector.detect(fileBytes, { minimumThreshold: 0.6 }).encoding || 'utf8';
    if ('ascii' == text.toLowerCase()) {
      text = 'utf8';
    }
    if (!encodingCodec.encodingExists(text)) {
      text = text.replace(/-/g, '_');
    }
    return (text = encodingCodec.encodingExists(text) ? text : 'utf8');
  };
  moduleExports.getContentFromBuffer = function (fileBytes, encoding, stripBOM) {
    if ('utf8' == encoding || 'uft16le' == encoding) {
      if (239 != fileBytes[0]) {
        return fileBytes.toString(encoding);
      }
      if (
        239 == fileBytes[0] &&
        187 == fileBytes[1] &&
        191 == fileBytes[2] &&
        239 == fileBytes[0]
      ) {
        var decodedText = fileBytes.toString(encoding).replace(/^\uFEFF+/, '');
        if ('function' == typeof stripBOM) {
          stripBOM();
        }
        return decodedText;
      }
    }
    return reqnode('iconv-lite').decode(fileBytes, encoding, { stripBOM: stripBOM });
  };
  moduleExports.statWrapper = function (filePath, onStat) {
    (async function (filePath) {
      var fileMetadata = {},
        fileName = reqnode('path').basename(filePath),
        isMountRoot = filePath === File.getMountFolder();
      if (!isMountRoot && fileName && '.' == fileName[0]) {
        fileMetadata.shouldIgnore = !isMountRoot;
        return fileMetadata;
      }
      fileMetadata.name = fileName;
      if (File.isWin) {
        var windowsAttributes = await new Promise(function (resolvePromise) {
          reqnode('fswin').getAttributes(filePath, resolvePromise);
        });
        if (!windowsAttributes) {
          return null;
        }
        fileMetadata.shouldIgnore =
          windowsAttributes.IS_HIDDEN ||
          windowsAttributes.IS_SYSTEM ||
          windowsAttributes.IS_TEMPORARY;
        fileMetadata.isDir = windowsAttributes.IS_DIRECTORY;
        fileMetadata.isFile = !fileMetadata.isDir;
        fileMetadata.mtime = windowsAttributes.LAST_WRITE_TIME;
        fileMetadata.birthtime = windowsAttributes.CREATION_TIME;
        fileMetadata.size = windowsAttributes.SIZE / 1e3;
      } else {
        var nodeUtil = reqnode('util');
        try {
          var fileInfo = await reqnode('fs-extra').stat(filePath);
          fileMetadata.isDir = fileInfo.isDirectory();
          fileMetadata.isFile = fileInfo.isFile();
          fileMetadata.mtime = new Date(nodeUtil.inspect(fileInfo.mtime));
          fileMetadata.birthtime = new Date(nodeUtil.inspect(fileInfo.birthtime));
          fileMetadata.size = Number(fileInfo.size) / 1e3;
        } catch (error) {
          return null;
        }
      }
      if (fileMetadata.isDir) {
        fileMetadata.shouldIgnore = 'node_modules' == fileName;
      } else {
        if (fileMetadata.isFile) {
          fileMetadata.shouldIgnore = fileMetadata.shouldIgnore || !isSupportedFile(fileName);
          if (!File.isWin) {
            fileMetadata.shouldIgnore =
              fileMetadata.shouldIgnore || 1e3 * fileMetadata.size > 1e3 * File.MAX_FILE_SIZE;
          }
        }
      }
      if (isMountRoot) {
        fileMetadata.shouldIgnore = false;
      }
      if (
        !fileMetadata.shouldIgnore &&
        File.option.supportTextBundle &&
        /\.textbundle$/i.exec(fileName)
      ) {
        if (!fileMetadata.isDir) {
          fileMetadata.shouldIgnore = true;
        }
        fileMetadata.isBundle = true;
        fileMetadata.isDir = false;
        fileMetadata.isFile = true;
        fileMetadata.shouldIgnore = false;
        let textFileName = await assetStorage.findTextFile(filePath);
        if (textFileName) {
          fileMetadata.textFile = filePath + (File.isWin ? '\\' : '/') + textFileName;
        } else {
          fileMetadata.shouldIgnore = true;
        }
      }
      return fileMetadata;
    })(filePath).then(onStat);
  };
  moduleExports.bindOversizePlaceholder = function () {
    if (!(File.isLinux || isLinux)) {
      if (File.isMac) {
        $('#marklyra-oversize-file-quick-look')
          .css('display', 'inline-block')
          .on('click', function () {
            bridge.callHandler('window.previewFile', getCurrentFilePath());
          });
      } else {
        if (File.isWin) {
          $('#marklyra-oversize-file-open-in')
            .css('display', 'inline-block')
            .on('click', function () {
              loadNativeMainModule().openAs(File.bundle.filePath);
            });
        }
      }
      isLinux = true;
    }
  };
  moduleExports.getDefaultPathOrName = getDefaultExportPath;
}
