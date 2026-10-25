// host/file-integration.
// SystemJS module 33. Dependencies: 11, 34, 2a, 29.
$__System.registerDynamic(
  '33',
  ['11', '34', '2a', '29'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var utilities = requireModule('11'),
      assetStorage = requireModule('34'),
      mediaActions = requireModule('2a'),
      dialogs = requireModule('29'),
      ChangeType = {
        NSChangeDone: 0,
        NSChangeUndone: 1,
        NSChangeCleared: 2,
        NSChangeReadOtherContents: 3,
        NSChangeAutoSaved: 4,
        NSChangeRedone: 5,
        NodeSaveFailed: -1,
      },
      l = function () {
        (this.doneStack = []),
          (this.undoneStack = []),
          (this.curState = [ChangeType.NSChangeAutoSaved, new Date() - 0]),
          (this.lastSaved = this.curState[1]);
      };
    (l.prototype.isDocumentEdited = function () {
      return !this.curState;
    }),
      (l.prototype.withdrawAutoSaved = function () {
        if (this.curState) {
          if (this.curState[0] != ChangeType.NSChangeAutoSaved) return !0;
          this.curState = null;
        }
        return !1;
      }),
      (l.prototype.clone = function () {
        return {
          doneStack: this.doneStack.clone(),
          undoneStack: this.undoneStack.clone(),
          curState: this.curState,
          lastSaved: this.lastSaved,
        };
      }),
      (l.prototype.reset = function (previousCounter) {
        (this.doneStack = previousCounter ? previousCounter.doneStack : []),
          (this.undoneStack = previousCounter ? previousCounter.undoneStack : []),
          (this.curState = previousCounter
            ? previousCounter.curState
            : [ChangeType.NSChangeAutoSaved, new Date() - 0]);
        let lastSaved = this.lastSaved;
        (this.lastSaved = previousCounter ? previousCounter.lastSaved : this.curState[1]),
          lastSaved != this.lastSaved && c();
      }),
      (l.prototype.isDiscardableUntitled = function () {
        return !(File.isDocumentEdited() || File.bundle.filePath);
      }),
      (l.prototype.updateChangeCount = function (changeType) {
        var currentCurState,
          curState = this.curState;
        switch (((File.bundle.hasModified = File.bundle.filePath || !0), changeType)) {
          case ChangeType.NSChangeDone:
            this.curState &&
              this.curState[0] === ChangeType.NSChangeAutoSaved &&
              (this.doneStack.push(this.curState), (this.curState = null)),
              this.doneStack.push([changeType]),
              this.doneStack.length > 200 && this.doneStack.splice(0, this.doneStack.length - 200),
              (this.undoneStack = []);
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
            )
              this.doneStack.pop(),
                this.lastSaved === currentCurState[1] && (this.curState = currentCurState);
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
            )
              this.undoneStack.pop(),
                this.lastSaved === currentCurState[1] && (this.curState = currentCurState);
            break;
          case ChangeType.NSChangeCleared:
            (this.doneStack = []),
              (this.undoneStack = []),
              (this.curState = [ChangeType.NSChangeAutoSaved, new Date() - 0]),
              (this.lastSaved = this.curState[1]);
            break;
          case ChangeType.NodeSaveFailed:
            this.curState && ((this.lastSaved = null), (this.curState = null));
            break;
          case ChangeType.NSChangeAutoSaved:
            if (this.curState) return;
            (this.curState = [ChangeType.NSChangeAutoSaved, new Date() - 0]),
              (this.lastSaved = this.curState[1]);
            break;
          case ChangeType.NSChangeReadOtherContents:
            for (
              var doneStack = [], undoneStack = [], itemIndex = 0;
              itemIndex < this.doneStack.length;
              itemIndex++
            )
              this.doneStack[itemIndex][0] !== ChangeType.NSChangeAutoSaved &&
                doneStack.push(this.doneStack[itemIndex]);
            for (itemIndex = 0; itemIndex < this.undoneStack.length; itemIndex++)
              this.undoneStack[itemIndex][0] !== ChangeType.NSChangeAutoSaved &&
                undoneStack.push(this.undoneStack[itemIndex]);
            (this.doneStack = doneStack), (this.undoneStack = undoneStack), (this.curState = null);
        }
        curState !== this.curState && File.isNodeHtml && c();
      });
    var c = function () {
      const restoredUntitled =
        !File.bundle.filePath && (File.bundle.fileName || File.bundle.originalPath);
      File.changeCounter &&
        (restoredUntitled || !File.changeCounter.curState || File.inSavingProcess
          ? (File.bundle.filePath && File.option.enableAutoSave && File.changeCounter.lastSaved) ||
            (document.querySelector('#title-text').classList.add('title-modified'),
            File.isNode && JSBridge.invoke('window.setTitle', void 0, !0),
            document.querySelector('#m-saved').parentElement.classList.remove('saved'))
          : ((File.bundle.filePath || File.bundle.fileName) &&
              File.isNode &&
              JSBridge.invoke('window.setTitle', void 0, !1),
            document.querySelector('#title-text').classList.remove('title-modified'),
            document.querySelector('#m-saved').parentElement.classList.add('saved')));
    };
    moduleExports.showExportDialog = async function (exportFormat, exportOptions, customFilters) {
      if ((exportOptions = exportOptions || {}).path && exportOptions.overwrite) {
        if (File.option.noWarningForExportOverwrite) return exportOptions.path;
        var confirmation = await dialogs.showWarningDialog(
          $.localize
            .getString(
              '"Export and Overwrite with Previous" will overwrite file at %@, would you continue?',
              'Panel',
            )
            .replace('%@', exportOptions.path),
          !0,
        );
        return 0 != confirmation.response
          ? null
          : (confirmation.checkboxChecked &&
              (JSBridge.execForAll(
                'window.File && File.option && (File.option.noWarningForExportOverwrite = true)',
              ),
              JSBridge.putSetting('noWarningForExportOverwrite', !0)),
            exportOptions.path);
      }
      return await new Promise((resolvePromise) => {
        !(function (format, onSelected, dialogOptions, customFilters) {
          var defaultFileName,
            filters = [];
          (dialogOptions = dialogOptions || {}).selectFolder ||
            (filters = customFilters || [
              { name: format.toUpperCase(), extensions: [format] },
              { name: $.localize.getString('All Files', 'Panel'), extensions: ['*'] },
            ]);
          var defaultPath = File.isLinuxSnap
            ? ''
            : d(format, dialogOptions, (fileName) => {
                defaultFileName = fileName;
              });
          File.isNode &&
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
              selectedPath &&
                ((File.option.lastSaveLocation = reqnode('path').dirname(selectedPath)),
                Analytics.record('export', { format: format })),
                onSelected(selectedPath);
            }),
            File.isMac &&
              (dialogOptions.selectFolder
                ? bridge.callHandler(
                    'path.selectFolderOrFile',
                    { forExport: !0, dir: !0, defaultPath: defaultPath },
                    (selectedPath) => {
                      Analytics.record('export', { format: format }), onSelected(selectedPath);
                    },
                  )
                : bridge.callHandler(
                    'path.showSaveDialog',
                    {
                      defaultPath: defaultFileName ? '' : defaultPath,
                      filters: filters ? filters[0].extensions : null,
                    },
                    (selectedPath) => {
                      Analytics.record('export', { format: format }), onSelected(selectedPath);
                    },
                  ));
        })(exportFormat, resolvePromise, exportOptions, customFilters);
      });
    };
    var d = function (extension, exportOptions, onDefaultFileName) {
        var lastSaveLocation = File.isWin ? '\\' : '/',
          suggestedFileName = (extension =
            null === extension || void 0 === extension
              ? File.FileOption.getDefaultExtension()
              : extension)
            ? File.getSuggestedFileName() + '.' + extension
            : File.getSuggestedFileName();
        return (exportOptions = exportOptions || {}).path
          ? !File.option.lastExport || File.option.lastExportNoOverwrite
            ? utilities.pathByDeleteLastComponent(exportOptions.path) +
              lastSaveLocation +
              suggestedFileName
            : exportOptions.path
          : File.option.lastSaveLocation
            ? File.option.lastSaveLocation + lastSaveLocation + suggestedFileName
            : 'same' === exportOptions.exportFolder
              ? u() + lastSaveLocation + suggestedFileName
              : 'custom' === exportOptions.exportFolder
                ? ((exportOptions.customExportPath =
                    exportOptions.customExportPath || window._options.documentsPath),
                  exportOptions.customExportPath + lastSaveLocation + suggestedFileName)
                : File.mountFolder_
                  ? File.mountFolder_ + lastSaveLocation + suggestedFileName
                  : (onDefaultFileName && onDefaultFileName(suggestedFileName), suggestedFileName);
      },
      u = function () {
        return File.isMac
          ? File.bundle.currentFolderPath
          : File.isNode && File.bundle.filePath
            ? reqnode('path').dirname(File.bundle.filePath || File.bundle.originalPath)
            : '';
      },
      h = function () {
        return File.bundle.filePath || '';
      };
    var p = async (allowAutoSave, retryCount) => {
      if (File._onInitParse) return Promise.reject('init parse');
      if ((File.editor.searchPanel.closePanel(!0, !0), File.inSavingProcess))
        return (
          (retryCount = retryCount || 1),
          await ((delay) =>
            new Promise((resolvePromise) => {
              setTimeout(resolvePromise, delay);
            }))(100 * retryCount),
          File.inSavingProcess
            ? retryCount > 5
              ? ((File.inSavingProcess = !1),
                File.updateChangeCount(File.ChangeType.NodeSaveFailed),
                Promise.reject('save parse'))
              : await p(allowAutoSave, retryCount + 1)
            : await p(allowAutoSave)
        );
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
          if (!1 === (await File.saveUseNode(!1, !1, !0))) throw new Error('save failed');
          return;
        }
        return (
          await File.backupWindow(!0),
          new Promise((resolvePromise, rejectPromise) => {
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
              backdrop: !1,
              keyboard: !0,
              callback: async function (buttonIndex) {
                if (0 == buttonIndex) {
                  File._needsUpdateSnap = new Date();
                  var saved = await File.saveUseNode(!1, !1, !0);
                  if (saved)
                    try {
                      File.updateChangeCount(File.ChangeType.NSChangeAutoSaved),
                        await File.buildDocumentSnapForNode(!0);
                    } catch (error) {
                      console.sendError(error),
                        File.updateChangeCount(File.ChangeType.NodeSaveFailed),
                        (saved = !1);
                    }
                  saved ? resolvePromise() : rejectPromise(null);
                } else
                  1 == buttonIndex
                    ? (File.buildDocumentSnapForNode(),
                      JSBridge.invoke('document.setLastSync', -1),
                      await mediaActions.onSaveDiscard(),
                      resolvePromise(),
                      (File._needsUpdateSnap = !1))
                    : (JSBridge.invoke('app.cancelQuit'),
                      (File._onFileSwitching = !1),
                      rejectPromise(null));
              },
            });
          })
        );
      }
    };
    moduleExports.tryLeaveDocument = function (onComplete, allowAutoSave) {
      p(allowAutoSave)
        .then(onComplete)
        .catch((error) => {
          null != error && onComplete(error.message || error);
        });
    };
    var f = function (fileName, requireExtension) {
        if (fileName && '.' != fileName[0]) {
          var normalizedText = m(fileName).toLowerCase();
          return normalizedText ? ~File.SupportedFiles.indexOf(normalizedText) : !requireExtension;
        }
        return !1;
      },
      m = function (text) {
        return (
          (text
            .split(/[\/\\]/)
            .last()
            .match(/\.([^.]+)$/) || [])[1] || ''
        );
      };
    !(function () {
      function e() {
        (File.option.copyMarkdownByDefault = !0),
          window.ClientCommand.selectAll(),
          setTimeout(function () {
            window.ClientCommand.copy(),
              setTimeout(function () {
                File.editor.EditHelper.showNotification('Context copied to clipboard.');
              }, 500);
          }, 500);
      }
      $('#save-error-banner')
        .on('click', '.btn', e)
        .on('click', '#trigger-save-error-dialog', function () {
          let html = $.localize.getString(
            "Save content failed for some reason.<br/>You could copy the content into a new MarkLyra window, and then save it. <br/>Learn more about:<ul><li><a href='https://github.com/Refinex-Space/marklyra'>Report bugs to us</a></li><li><a href='https://github.com/Refinex-Space/marklyra'>Recover lost contents</a></li></ul>",
            'Panel',
          );
          File.option.useMirrorInCN && (html = html.replace(/\.io\//g, 'io.cn/')),
            dialogs.showDialog({
              title: $.localize.getString('Something is Wrong…', 'Panel'),
              html: html,
              buttons: [
                $.localize.getString('Copy Content', 'Panel'),
                $.localize.getString('Close', 'Panel'),
              ],
              callback: function (buttonIndex) {
                (File._onFileSwitching = !1),
                  0 == buttonIndex && (e(), $('#save-error-banner').show());
              },
            }),
            $('#save-error-banner').hide();
        });
    })();
    const g = function () {
      return reqnode(
        window.debugMode
          ? '../../launch/app/main.node'
          : `${window.dirname}/node_modules/main.node`,
      );
    };
    moduleExports.winShell = g;
    var element,
      isLinux = !1,
      resizeSelection = [],
      timerId = null;
    function x() {
      var range = document.caretRangeFromPoint(window.innerWidth / 2, 40);
      resizeSelection =
        range && range.startContainer.parentElement.closest('[cid]')
          ? [range, range ? range.getBoundingClientRect() : null]
          : [];
    }
    function C() {
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
        r = function () {
          timerId && clearTimeout(timerId),
            (timerId = setTimeout(function () {
              resizeSelection = null;
            }, 500));
        };
      window.addEventListener('beforeResize', function () {
        File && File.editor && !File._onInitParse && x();
      }),
        window.addEventListener('resize', function () {
          File && File.editor && !File._onInitParse && !resizeSelection && (x(), r());
        }),
        (sourceEventName = 'resize'),
        (coalescedEventName = 'optimizedResize'),
        (framePending = !1),
        (eventTarget = eventTarget || window).addEventListener(sourceEventName, function () {
          framePending ||
            ((framePending = !0),
            requestAnimationFrame(function () {
              eventTarget.dispatchEvent(new CustomEvent(coalescedEventName)), (framePending = !1);
            }));
        }),
        window.addEventListener('optimizedResize', function () {
          File && File.editor && !File._onInitParse && resizeSelection && (setTimeout(C, 0), r());
        });
    }),
      (moduleExports.setItemInDB = function (storageKey, storageValue) {
        try {
          localStorage.setItem(storageKey + '', storageValue + '');
        } catch (error) {
          localStorage.clear(), localStorage.setItem(storageKey, storageValue);
        }
      }),
      (moduleExports.removeItemInDB = function (storageKey) {
        try {
          localStorage.removeItem(storageKey);
        } catch (error) {
          localStorage.clear();
        }
      }),
      (moduleExports.getItemInDB = function (storageKey) {
        return localStorage.getItem(storageKey);
      }),
      (moduleExports.getColorBrightness = function (colorText) {
        var mappedItems = (colorText.match(/[\d.]+/gi) || []).map(function (item) {
          return item - 0;
        });
        return (
          (void 0 !== mappedItems[3] && null !== mappedItems[3]) || (mappedItems[3] = 1),
          0 == mappedItems[3]
            ? 1
            : (299 * mappedItems[0] + 587 * mappedItems[1] + 114 * mappedItems[2]) / 256e3
        );
      }),
      (moduleExports.getFileNameFromPath = function (inputFilePath, stripUrlSuffix) {
        try {
          inputFilePath = inputFilePath && decodeURI(inputFilePath);
        } catch (error) {}
        return (
          inputFilePath &&
            ((inputFilePath = (inputFilePath = inputFilePath
              .replace(/\\/g, '/')
              .replace(/\/$/, '')).substring(inputFilePath.lastIndexOf('/') + 1)),
            stripUrlSuffix &&
              (inputFilePath = inputFilePath.replace(/#[^\/]+$/, '').replace(/\?[^\/]+$/, ''))),
          inputFilePath
        );
      }),
      (moduleExports.normalizePath = function (pathOrUrl, normalizeUrl) {
        return !normalizeUrl && /^([a-z][a-z0-9+\-]+):\/\//gi.exec(pathOrUrl)
          ? pathOrUrl
          : File.isNode
            ? reqnode('path').normalize(pathOrUrl)
            : (function (text) {
                for (
                  var parts = text.split('/'), textParts = [], itemIndex = 0;
                  itemIndex < parts.length;
                  itemIndex++
                )
                  '.' != parts[itemIndex] &&
                    ('..' == parts[itemIndex] ? textParts.pop() : textParts.push(parts[itemIndex]));
                return textParts.join('/').replace(/[\/]{1,}/g, '/');
              })(pathOrUrl);
      }),
      (moduleExports.getCurrentFilePath = h),
      (moduleExports.getCurrentFileFolderPath = u),
      (moduleExports.getExtension = m),
      (moduleExports.ChangeType = ChangeType),
      (moduleExports.ChangeCounter = l),
      (moduleExports.refreshTitlebarText = c),
      (moduleExports.isSupportedFile = f),
      (moduleExports.detectEncodeByNode = function (fileBytes) {
        var hasUtf8Bom = !1;
        if (
          (fileBytes.length > 2 &&
            239 === fileBytes[0] &&
            187 === fileBytes[1] &&
            191 === fileBytes[2] &&
            (hasUtf8Bom = !0),
          utilities.isUTF8(fileBytes))
        )
          return hasUtf8Bom ? 'utf8-bom' : 'utf8';
        var encodingDetector = reqnode('jschardet'),
          encodingCodec = reqnode('iconv-lite'),
          text = encodingDetector.detect(fileBytes, { minimumThreshold: 0.6 }).encoding || 'utf8';
        return (
          'ascii' == text.toLowerCase() && (text = 'utf8'),
          encodingCodec.encodingExists(text) || (text = text.replace(/-/g, '_')),
          (text = encodingCodec.encodingExists(text) ? text : 'utf8')
        );
      }),
      (moduleExports.getContentFromBuffer = function (fileBytes, encoding, stripBOM) {
        if ('utf8' == encoding || 'uft16le' == encoding) {
          if (239 != fileBytes[0]) return fileBytes.toString(encoding);
          if (
            239 == fileBytes[0] &&
            187 == fileBytes[1] &&
            191 == fileBytes[2] &&
            239 == fileBytes[0]
          ) {
            var decodedText = fileBytes.toString(encoding).replace(/^\uFEFF+/, '');
            return 'function' == typeof stripBOM && stripBOM(), decodedText;
          }
        }
        return reqnode('iconv-lite').decode(fileBytes, encoding, { stripBOM: stripBOM });
      }),
      (moduleExports.statWrapper = function (filePath, onStat) {
        (async function (filePath) {
          var fileMetadata = {},
            fileName = reqnode('path').basename(filePath),
            isMountRoot = filePath === File.getMountFolder();
          if (!isMountRoot && fileName && '.' == fileName[0])
            return (fileMetadata.shouldIgnore = !isMountRoot), fileMetadata;
          if (((fileMetadata.name = fileName), File.isWin)) {
            var windowsAttributes = await new Promise(function (resolvePromise) {
              reqnode('fswin').getAttributes(filePath, resolvePromise);
            });
            if (!windowsAttributes) return null;
            (fileMetadata.shouldIgnore =
              windowsAttributes.IS_HIDDEN ||
              windowsAttributes.IS_SYSTEM ||
              windowsAttributes.IS_TEMPORARY),
              (fileMetadata.isDir = windowsAttributes.IS_DIRECTORY),
              (fileMetadata.isFile = !fileMetadata.isDir),
              (fileMetadata.mtime = windowsAttributes.LAST_WRITE_TIME),
              (fileMetadata.birthtime = windowsAttributes.CREATION_TIME),
              (fileMetadata.size = windowsAttributes.SIZE / 1e3);
          } else {
            var nodeUtil = reqnode('util');
            try {
              var fileInfo = await reqnode('fs-extra').stat(filePath);
              (fileMetadata.isDir = fileInfo.isDirectory()),
                (fileMetadata.isFile = fileInfo.isFile()),
                (fileMetadata.mtime = new Date(nodeUtil.inspect(fileInfo.mtime))),
                (fileMetadata.birthtime = new Date(nodeUtil.inspect(fileInfo.birthtime))),
                (fileMetadata.size = Number(fileInfo.size) / 1e3);
            } catch (error) {
              return null;
            }
          }
          if (
            (fileMetadata.isDir
              ? (fileMetadata.shouldIgnore = 'node_modules' == fileName)
              : fileMetadata.isFile &&
                ((fileMetadata.shouldIgnore = fileMetadata.shouldIgnore || !f(fileName)),
                File.isWin ||
                  (fileMetadata.shouldIgnore =
                    fileMetadata.shouldIgnore ||
                    1e3 * fileMetadata.size > 1e3 * File.MAX_FILE_SIZE)),
            isMountRoot && (fileMetadata.shouldIgnore = !1),
            !fileMetadata.shouldIgnore &&
              File.option.supportTextBundle &&
              /\.textbundle$/i.exec(fileName))
          ) {
            fileMetadata.isDir || (fileMetadata.shouldIgnore = !0),
              (fileMetadata.isBundle = !0),
              (fileMetadata.isDir = !1),
              (fileMetadata.isFile = !0),
              (fileMetadata.shouldIgnore = !1);
            let textFileName = await assetStorage.findTextFile(filePath);
            textFileName
              ? (fileMetadata.textFile = filePath + (File.isWin ? '\\' : '/') + textFileName)
              : (fileMetadata.shouldIgnore = !0);
          }
          return fileMetadata;
        })(filePath).then(onStat);
      }),
      (moduleExports.bindOversizePlaceholder = function () {
        File.isLinux ||
          isLinux ||
          (File.isMac
            ? $('#marklyra-oversize-file-quick-look')
                .css('display', 'inline-block')
                .on('click', function () {
                  bridge.callHandler('window.previewFile', h());
                })
            : File.isWin &&
              $('#marklyra-oversize-file-open-in')
                .css('display', 'inline-block')
                .on('click', function () {
                  g().openAs(File.bundle.filePath);
                }),
          (isLinux = !0));
      }),
      (moduleExports.getDefaultPathOrName = d);
  },
);
