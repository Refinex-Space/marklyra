// media/image-editor.
// SystemJS module 2f. Dependencies: e, 13, 30, 31, 32, 1b, 29, 11, 33, 2e, 34, 2a, 35, 17.
$__System.registerDynamic(
  '2f',
  ['e', '13', '30', '31', '32', '1b', '29', '11', '33', '2e', '34', '2a', '35', '17'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    var uploaderCommands,
      hostGlobal = this || self,
      jquery = requireModule('e'),
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      userOperations = requireModule('30'),
      inlineDecoration = requireModule('31'),
      rangy = requireModule('32').rangy,
      undoManager = requireModule('1b'),
      SnapFlag = undoManager.SnapFlag,
      dialogs = requireModule('29'),
      utilities = requireModule('11'),
      fileIntegration = requireModule('33'),
      imageScale = requireModule('2e'),
      assetStorage = requireModule('34'),
      mediaActions = requireModule('2a'),
      referenceUpdateStartedAt = (requireModule('35'), requireModule('17'), null),
      pendingReferences = {},
      timerId = null,
      copyImagesPreferenceKey = 'marklyra-copy-images-to';
    function S(filePath) {
      return /(^[\\\/])|(^[a-zA-Z]:)/.exec(filePath);
    }
    function k(text, inputSrc, imageElement) {
      if (imageElement && text && inputSrc) {
        var clientHeight = imageElement.clientHeight,
          clientWidth = imageElement.clientWidth;
        clientHeight &&
          clientWidth &&
          (imagePreLoadAfterMove['file://' + text.replace(/^file:\/\//, '').replace(/\\/g, '/')] = {
            src: inputSrc,
            size: 'height:' + clientHeight + 'px;width:' + clientWidth + 'px;',
          });
      }
    }
    function E(text, imageSource) {
      return text.replace(
        /(]\s*\(<?)((?:\([^)]*\)|[^()])*?)(>?[ \t]*((['"])(.*?)\5[ \t]*)?\))/,
        '$1' + imageSource + '$3',
      );
    }
    function T(text, imageSource) {
      return /src\s*=\s*['"]/.exec(text)
        ? text.replace(/(src\s*=\s*(["'])).+?(\2)/i, '$1' + imageSource + '$3')
        : text.replace(/(src\s*=\s*)([^\s'"]+)(\s|$)/i, '$1"' + imageSource + '"$3');
    }
    function _(element) {
      element.removeClass('md-on-uploading').removeClass('md-on-moving'),
        element.find('.md-image-uploading-mask-wrapper').remove(),
        element.removeAttr('data-origin-path');
    }
    function A(originalPath) {
      var imageElements = jquery('[data-origin-path=' + JSON.stringify(originalPath) + ']');
      return (
        uploadImageQueue.delete(originalPath),
        moveImageQueue.delete(originalPath),
        imageElements.length
          ? _(imageElements)
          : console.debug('no image for path ' + originalPath),
        imageElements
      );
    }
    function M(text) {
      var extension = reqnode('path').extname(text),
        filenameSeparator = '-';
      return (
        /[\/\\]$/.exec(text) && ((extension = ''), (filenameSeparator = '')),
        (
          text.replace(/(\.[^.\/\\]+?$)/, '') +
          filenameSeparator +
          utilities.tempString() +
          extension
        ).replace(/^\-/, '')
      );
    }
    async function L(from) {
      var temporaryName = utilities.tempString(),
        userDataPath = File.isWin ? '\\' : '/',
        backupPath =
          File.option.userDataPath +
          userDataPath +
          'runtime-storage' +
          userDataPath +
          temporaryName;
      if (!from || !File.option.userDataPath) return '';
      return File.isNode
        ? await (async function (sourcePath, destinationPath) {
            var fileSystem = reqnode('fs-extra');
            try {
              await fileSystem.copy(sourcePath, destinationPath);
            } catch (error) {
              return console.warn('failed to write temp image data', error), '';
            }
            return destinationPath;
          })(from, backupPath)
        : File.isMac && (await JSBridge.invoke('path.copyFile', { from: from, to: backupPath }))
          ? backupPath
          : void 0;
    }
    function N(imageElements, targetFolder, sourcePath, filenameDefined, ignoreAlert) {
      var applyUploadingStyle = inlineDecoration.applyUploadingStyle;
      if (imageElements.length) {
        var element = imageElements.find('img')[0];
        loadedImgCache.remove(utilities.wkfile2file(element.getAttribute('src') || '')),
          (element.onload = null);
      }
      return (
        this.editor.brush.clearAndPause(!0),
        window.moveImageQueue.add(sourcePath),
        applyUploadingStyle(imageElements, sourcePath, !0, !0),
        this.editor.brush.resume(),
        (File.isMac
          ? function (folder, inputSrc) {
              if (((inputSrc = inputSrc.replace(/^file:\/\//, '')), !/^\w+:/.exec(inputSrc)))
                try {
                  inputSrc = decodeURI(inputSrc);
                } catch (error) {}
              return 'textbundle' == folder
                ? new Promise(function (resolvePromise, rejectPromise) {
                    bridge.callHandler(
                      'images.addToBundle',
                      { src: inputSrc },
                      function (copyResult) {
                        copyResult.filename
                          ? resolvePromise('/textbundle/' + copyResult.filename)
                          : resolvePromise(inputSrc);
                      },
                    );
                  })
                : new Promise(function (resolvePromise, rejectPromise) {
                    bridge.callHandler(
                      'images.copyImage',
                      {
                        src: inputSrc,
                        folder: folder,
                        fileNameDefined: filenameDefined || !1,
                        ignoreAlert: ignoreAlert || !1,
                      },
                      function (copyResult) {
                        copyResult.success
                          ? resolvePromise(copyResult.msg)
                          : rejectPromise(copyResult.msg);
                      },
                    );
                  });
            }
          : function (targetFolder, sourcePath) {
              return (
                'textbundle' === targetFolder &&
                  (targetFolder =
                    File.editor.imgEdit.getRealTargetImageStorageFolder(targetFolder)),
                new Promise(function (resolvePromise, rejectPromise) {
                  var fileSystem = reqnode('fs-extra'),
                    destinationPath = null;
                  function s(text, destinationPath, overwrite) {
                    var match;
                    if (/^(http(s?))|(ftp):\/\//.exec(text))
                      !(function (sourceUrl, destinationPath, onComplete, onError, overwrite) {
                        var pathUtilities = reqnode('path'),
                          directoryPath = pathUtilities.dirname(destinationPath),
                          fileName = pathUtilities.basename(
                            overwrite ? destinationPath : M(destinationPath),
                          );
                        JSBridge.invoke('app.download', sourceUrl, directoryPath, fileName).then(
                          ({ path: downloadedPath, state: downloadState, type: currentText }) => {
                            var fileSystem = reqnode('fs'),
                              imageExtension = '';
                            function c() {
                              if (imageExtension) {
                                var currentPathUtilities = reqnode('path'),
                                  parsedPath = currentPathUtilities.parse(destinationPath);
                                '.jpg' != parsedPath.ext &&
                                  (destinationPath = currentPathUtilities.join(
                                    parsedPath.dir,
                                    parsedPath.name + '.' + imageExtension,
                                  ));
                              }
                              fileSystem.rename(downloadedPath, destinationPath, (renameError) => {
                                renameError
                                  ? console.sendError(renameError)
                                  : (downloadedPath = destinationPath),
                                  onComplete(downloadedPath);
                              });
                            }
                            currentText &&
                              currentText.indexOf('image/') > -1 &&
                              (imageExtension = currentText.substr('image/'.length)),
                              'completed' == downloadState
                                ? overwrite
                                  ? downloadedPath != destinationPath
                                    ? c()
                                    : onComplete(downloadedPath)
                                  : fileSystem.access(
                                      destinationPath,
                                      fileSystem.F_OK,
                                      function (accessError) {
                                        accessError ? c() : onComplete(downloadedPath);
                                      },
                                    )
                                : (console.error(downloadState),
                                  onError(
                                    downloadState
                                      ? 'Image download ' + downloadState
                                      : 'unknown error for image download',
                                  ));
                          },
                        );
                      })(text, destinationPath, resolvePromise, rejectPromise, overwrite);
                    else if ((match = /^data:image\/[^;]+;base64,/.exec(text))) {
                      var base64Data = decodeURI(text.substr(match[0].length));
                      try {
                        base64Data = decodeURI(base64Data);
                      } catch (error) {}
                      fileSystem.writeFile(
                        destinationPath,
                        base64Data,
                        'base64',
                        function (inputError) {
                          if (inputError)
                            return rejectPromise('Failed to copy image\n.' + inputError.message);
                          resolvePromise(destinationPath);
                        },
                      );
                    } else {
                      try {
                        text = decodeURI(text);
                      } catch (currentError) {}
                      fileSystem.copy(
                        text,
                        destinationPath,
                        { overwrite: overwrite },
                        function (message) {
                          if (message)
                            return rejectPromise(
                              'Failed to copy image\n.' + (message.message || message),
                            );
                          resolvePromise(destinationPath);
                        },
                      );
                    }
                  }
                  function l(sourcePath, destinationPath) {
                    fileSystem.access(destinationPath, fileSystem.F_OK, function (accessError) {
                      accessError || (destinationPath = M(destinationPath)),
                        s(sourcePath, destinationPath, !1);
                    });
                  }
                  var localText,
                    pathSeparator = File.isWin ? '\\' : '/';
                  if (filenameDefined) s(sourcePath, (destinationPath = targetFolder), !0);
                  else {
                    if (/^data:/.exec(sourcePath)) {
                      if (!(localText = (/^data:image\/([^;]+);base64,/.exec(sourcePath) || [])[1]))
                        return resolvePromise(sourcePath);
                      localText = utilities.removeInvalidPathCh(
                        (function () {
                          var dateInstance = new Date();
                          dateInstance.setHours(
                            dateInstance.getHours() - dateInstance.getTimezoneOffset() / 60,
                          );
                          var text = dateInstance.toUTCString();
                          return text.substr(0, text.length - 4);
                        })() +
                          '.' +
                          localText,
                      );
                    } else
                      (localText = fileIntegration.getFileNameFromPath(sourcePath)),
                        (localText = utilities.removeInvalidPathCh(
                          localText.replace(/\?([^./]*)$/, ''),
                        ));
                    (targetFolder = (targetFolder + pathSeparator).replace(
                      /[\/\\]{2}$/,
                      pathSeparator,
                    )),
                      (destinationPath = targetFolder + localText),
                      window.imageDownloadMap[destinationPath] &&
                      window.imageDownloadMap[destinationPath] != sourcePath
                        ? (destinationPath = M(destinationPath))
                        : (window.imageDownloadMap[destinationPath] = sourcePath),
                      /^(https?|ftp):/.exec(sourcePath)
                        ? l(sourcePath, destinationPath)
                        : fileSystem.stat(sourcePath, (error, fileInfo) => {
                            error
                              ? rejectPromise('Failed to copy image\n.' + (error.message || error))
                              : fileInfo && fileInfo.isFile()
                                ? l(sourcePath, destinationPath)
                                : rejectPromise('Failed to copy image\n. Image src is not a file');
                          });
                  }
                })
              );
            }
        )
          .call(this, targetFolder, sourcePath)
          .then(
            function (result) {
              return result
                ? (mediaActions.recordMediaMoves(result),
                  L(result).then((inputResult) => [result, inputResult]))
                : [];
            },
            function () {
              A(sourcePath);
            },
          )
      );
    }
    function D(outputText, uploaderType) {
      return 'picgo-app' == uploaderType || 'piclist-app' == uploaderType
        ? (function (responseText) {
            try {
              var response = JSON.parse(responseText);
              return response.success ? response.result : [];
            } catch (error) {
              return [];
            }
          })(outputText)
        : (function (text) {
            var parts = text.split(/\r?\n/);
            console.sendLog('[Upload Result] ' + text);
            for (var imageUrls = [], itemIndex = parts.length - 1; itemIndex >= 0; itemIndex--) {
              var trimmedText = parts[itemIndex].trim();
              if (trimmedText)
                if (/^(https?|ftp|file):\//.exec(trimmedText)) imageUrls.unshift(trimmedText);
                else if (/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}\/.*$/.exec(trimmedText))
                  imageUrls.unshift('http://' + trimmedText);
                else if (imageUrls.length) break;
            }
            return imageUrls;
          })(outputText);
    }
    function R(imageElements, sourcePath) {
      return (
        this.editor.brush.pause(),
        (sourcePath = utilities.absolutePathFrom(sourcePath)),
        window.uploadImageQueue.add(sourcePath),
        inlineDecoration.applyUploadingStyle(imageElements, sourcePath, !1),
        this.editor.brush.resume(),
        function (file) {
          var receiver = this;
          return new Promise(function (resolvePromise, rejectPromise) {
            if (File.isMac) {
              var uploaderType = receiver.getImageUploader();
              bridge.callHandler(
                'images.upload',
                { command: receiver.getImageUploaderCommand(uploaderType), file: file },
                function (uploadResult) {
                  var imageUrls;
                  uploadResult.success
                    ? 'ipic' == uploaderType
                      ? resolvePromise(uploadResult.msg)
                      : (imageUrls = D(uploadResult.msg, uploaderType))[imageUrls.length - 1]
                        ? resolvePromise(imageUrls[imageUrls.length - 1])
                        : rejectPromise(uploadResult.msg)
                    : rejectPromise(uploadResult.msg);
                },
              );
            } else
              File.isNode
                ? B.call(receiver, [file])
                    .then((result) => {
                      resolvePromise(result[0]);
                    })
                    .catch(rejectPromise)
                : rejectPromise();
          });
        }.call(this, sourcePath)
      );
    }
    function B(list) {
      var uploaderCommand = this.getImageUploaderCommand();
      if (!uploaderCommand) return Promise.reject('Upload command not found.');
      var usesAppServer = 'picgo-app' == uploaderCommand || 'piclist-app' == uploaderCommand;
      return (
        usesAppServer
          ? (function (uploaderType) {
              var picgoAppPath = File.option.picgoAppPath,
                piclistAppPath = File.option.piclistAppPath;
              return 'picgo-app' !== uploaderType || picgoAppPath
                ? 'piclist-app' !== uploaderType || piclistAppPath
                  ? (function r(retried) {
                      return window
                        .fetch('http://127.0.0.1:36677/upload', {
                          method: 'POST',
                          body: JSON.stringify({ list: list }),
                        })
                        .then(
                          function (result) {
                            return 200 === result.status
                              ? result
                                  .json()
                                  .then((inputResult) =>
                                    inputResult.success
                                      ? (console.sendLog(
                                          '[Upload Result] ' + JSON.stringify(inputResult.result),
                                        ),
                                        inputResult.result)
                                      : Promise.reject(JSON.stringify(inputResult)),
                                  )
                              : Promise.reject(result.text());
                          },
                          function (result) {
                            return retried
                              ? Promise.reject(result.message || 'failed')
                              : new Promise(function (resolvePromise, rejectPromise) {
                                  var currentTimerId = setTimeout(() => {
                                    (currentTimerId = null),
                                      r(!0).then(resolvePromise, rejectPromise);
                                  }, 5e3);
                                  window
                                    .reqnode('child_process')
                                    .exec(
                                      JSON.stringify(
                                        'piclist-app' === uploaderType
                                          ? piclistAppPath
                                          : picgoAppPath,
                                      ),
                                      (launchError, unusedParameter2, unusedParameter3) => {
                                        currentTimerId &&
                                          launchError &&
                                          (rejectPromise(
                                            'failed to launch PicGo app: ' + launchError.message,
                                          ),
                                          clearTimeout(currentTimerId));
                                      },
                                    );
                                });
                          },
                        );
                    })(!1)
                  : Promise.reject('请在偏好设置中配置 PicList (app) 的路径。')
                : Promise.reject('请在偏好设置中配置 PicGo (app) 的路径。');
            })(uploaderCommand)
          : new Promise((resolvePromise, rejectPromise) => {
              reqnode('child_process').exec(
                uploaderCommand + ' ' + utilities.escapeShell(list),
                { maxBuffer: 2097152 },
                (executionError, stdout, stderr) => {
                  if (executionError)
                    return (
                      console.warn('exec error: ' + executionError),
                      void rejectPromise(executionError)
                    );
                  stdout
                    ? resolvePromise(stdout)
                    : (console.warn('error: ' + stderr), rejectPromise(stderr));
                },
              );
            })
      ).then((result) => {
        var imageUrls = usesAppServer ? result : D(result, uploaderCommand);
        return imageUrls.length == list.length
          ? Promise.resolve(imageUrls)
          : (console.log(result),
            Promise.reject('fail to parse result image path from: ' + result));
      });
    }
    function P(imageElements, imageSource, deferRegistration) {
      var currentSrc = imageSource;
      imageSource = this.resolveImagePath(imageSource);
      var range,
        selectionSnapshot,
        updateCommand,
        editor = this.editor;
      if (
        (editor.undo.endSnap(!0),
        imageElements.each(function (unusedParameter1, element) {
          if (element) {
            var currentElement = element.querySelector('.md-content');
            if (currentElement) {
              updateCommand ||
                ((range = editor.selection.getRangy()),
                (selectionSnapshot = editor.selection.buildUndo(range)),
                (updateCommand = undoManager.makeEmptyCommand(selectionSnapshot)));
              var text = currentElement.textContent,
                currentText =
                  element.getAttribute('md-inline') == NodeType.imgtag
                    ? T(text, imageSource)
                    : E(text, imageSource),
                adjustedSelection = jquery.extend({}, selectionSnapshot),
                start = currentText.length - text.length,
                documentNode = editor.findNodeByElem(jquery(element).closest('[cid]'));
              editor.undo.endSnap(!0);
              var localElement = element.querySelector('.md-content');
              range &&
                localElement &&
                range.comparePoint &&
                range.comparePoint(localElement, 1) < 0 &&
                (adjustedSelection.start += start),
                range &&
                  localElement &&
                  range.comparePoint &&
                  range.comparePoint(localElement, 2) < 0 &&
                  (adjustedSelection.end += start),
                updateCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
                (currentElement.textContent = currentText),
                editor.store(documentNode, !0);
              var nodeElement = editor.findElemById(documentNode.cid);
              editor.brush.brushNode(documentNode.cid),
                nodeElement.removeClass('md-expand'),
                editor.undo.exeCommand(adjustedSelection),
                (range = editor.selection.getRangy()) &&
                  jquery(range.commonAncestorContainer).closest('.md-image').length &&
                  (adjustedSelection = editor.imgEdit.selectComponent('alt', !0)),
                updateCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
                updateCommand.redo.push(adjustedSelection);
            } else adjustedSelection = this.editor.selection.buildUndo();
          }
        }),
        updateCommand && !deferRegistration)
      ) {
        var previousCommand = editor.undo.lastRegisteredOperationCommand();
        previousCommand && previousCommand.src === currentSrc
          ? undoManager.append(previousCommand, updateCommand)
          : editor.undo.register(updateCommand);
      }
      return updateCommand;
    }
    async function I(updateCommand, originalPath, from, inputFrom, deleteOriginal) {
      updateCommand &&
        from &&
        originalPath != from &&
        (updateCommand.undo.push({ type: 'deleteMedia', from: from }),
        updateCommand.redo.unshift({ type: 'restoreMedia', from: inputFrom, to: from }),
        deleteOriginal &&
          S(originalPath) &&
          (await File.editor.imgEdit.deleteMedia(originalPath, !0, updateCommand, inputFrom)),
        File.isTextPack() && S(from));
    }
    function O(imageElements, targetFolder, inputSrc, filenameDefined, silent, deleteOriginal) {
      var receiver = this;
      imageElements &&
        imageElements.length &&
        inputSrc &&
        N.call(this, imageElements, targetFolder, inputSrc, filenameDefined, !1).then(
          function (result) {
            if (result) {
              var destinationPath = result[0],
                backupPath = result[1];
              if (void 0 !== destinationPath) {
                (imageElements = A(inputSrc)),
                  'textbundle' !== targetFolder &&
                    k(destinationPath, inputSrc, imageElements.find('img')[0]);
                var updateCommand = P.call(
                  receiver,
                  imageElements,
                  destinationPath,
                  File.isTextBundle() || File.isTextPack(),
                );
                if (File.isTextBundle() || File.isTextPack()) {
                  var previousCommand = receiver.editor.undo.lastRegisteredOperationCommand();
                  previousCommand && previousCommand.src === inputSrc
                    ? undoManager.append(previousCommand, updateCommand)
                    : receiver.editor.undo.register(updateCommand);
                }
                I(updateCommand, inputSrc, destinationPath, backupPath, deleteOriginal);
              }
            }
          },
          function (result) {
            (imageElements = A(inputSrc)),
              result && console.error(result),
              result &&
                !silent &&
                setTimeout(function () {
                  dialogs.showNotification(
                    jquery.localize.getString('Failed to Copy Image to Target Folder.') +
                      ' <code>' +
                      utilities.escape(result) +
                      '</code>',
                    !0,
                  );
                }, 500);
          },
        );
    }
    (window.imgLastModified = Math.floor((new Date() - 0) / 1e3)),
      (window.uploadImageQueue = new Set()),
      (window.moveImageQueue = new Set()),
      (window.imagePreLoadAfterMove = {}),
      (window.imageDownloadMap = {});
    function $(sourcePath) {
      return !/^\s*(https?):/.exec(sourcePath);
    }
    var imageMap = {};
    moduleRecord.exports = class {
      constructor(editor) {
        var receiver = this;
        function n() {
          File.editor.contextMenu.hide(), File.editor.contextMenu.restoreLastCursor();
        }
        (this.removeUploadingStyle = _),
          (this.editor = editor),
          (this.uniqueFilePathOnNode = M),
          jquery(editor.sessionStr)
            .on('mousemove', '.md-image>.md-meta', function (pointerEvent) {
              fastdom.measure(function () {
                pointerEvent.offsetX - pointerEvent.target.offsetLeft < 20 &&
                pointerEvent.offsetY < 30
                  ? this.nextElementSibling &&
                    this.nextElementSibling.getAttribute('src').trim().length &&
                    fastdom.mutate(function () {
                      this.classList.add('md-show-hint');
                    }, this)
                  : fastdom.mutate(function () {
                      this.classList.remove('md-show-hint');
                    }, this);
              }, this);
            })
            .on('mouseleave', '.md-image>.md-meta', function () {
              fastdom.mutate(function () {
                this.classList.remove('md-show-hint');
              }, this);
            })
            .on('click', 'img', function (pointerEvent) {
              var element = jquery(pointerEvent.target).closest('.md-image').addClass('md-expand');
              if (element.length) {
                var range = rangy.createRange();
                element.attr('md-inline') == NodeType.imgtag
                  ? range.selectNodeContents(element.find('.md-meta')[0])
                  : range.moveToBookmark({
                      containerNode: element.children('.md-meta')[0],
                      start: 2,
                      end: 2 + (pointerEvent.target.getAttribute('alt') || '').length,
                    }),
                  editor.selection.setRange(range, !0);
              }
            })
            .on('btn-action', '.md-image-input-src-btn', function (unusedParameter1) {
              jquery('#marklyra-tooltip').hide();
              var range = document.createRange();
              range.setStart(this.parentElement, 0),
                range.setEnd(this.parentElement, 0),
                jquery(this).remove(),
                editor.selection.setRange(range, !0);
            })
            .on('click btn-action', '.md-image-pick-file-btn', function (unusedParameter1) {
              return jquery('#marklyra-tooltip').hide(), receiver.insertLocalImage(), !1;
            })
            .on('cursorChange', function (unusedParameter1, styleBookmark) {
              (styleBookmark && -1 != styleBookmark.style.inline.indexOf('image')) ||
                !document.querySelector('#user-context-menu.show') ||
                editor.contextMenu.hide('#user-context-menu');
            }),
          jquery('.context-menu')
            .on('click', "[data-key='select-img-target'] a", function () {
              n(), receiver.copyToSelectedFolderAction();
            })
            .on('click', "[data-key='select-img-target-move'] a", function () {
              n(), receiver.copyToSelectedFolderAction(!0);
            })
            .on('click', "[data-key='delete-img'] a", function () {
              n(), receiver.deleteImageAction(!1);
            })
            .on('click', "[data-key='delete-img-file'] a", function () {
              n(), receiver.deleteImageAction(!0);
            })
            .on('click', "[data-key='upload-img'] a", function () {
              n(), receiver.uploadAction();
            })
            .on('click', "[data-key='copy-img-to-target'] a", function () {
              n(), receiver.copyToTargetFolderAction();
            })
            .on('click', "[data-key='move-img-to-target'] a", function () {
              n(), receiver.copyToTargetFolderAction(!0);
            })
            .on('click', "[data-key='copy-img'] a", function () {
              n(), receiver.copyImage();
            })
            .on('click', "[data-key='reveal-img-in-finder'] a", function () {
              n(), receiver.revealInFinder();
            })
            .on('click', "[data-key='reveal-img-in-browser'] a", function () {
              n(), receiver.revealInFinder();
            })
            .on('click', "[data-key='zoom-smart'] a", function () {
              n();
              var imageElements = jquery('.md-expand.md-img-loaded');
              imageElements &&
                receiver.zoomAction(imageElements, this.getAttribute('data-variable'));
            })
            .on('click', "[data-key='zoom-img'] a", function () {
              jquery(this.parentElement).trigger('mouseenter');
            }),
          this.registerBridge();
      }
      registerBridge() {
        if (File.isMac) {
          var receiver = this;
          bridge.registerHandler(
            'images.fetchImageLocalStorageFolder',
            function (unusedParameter1, respond) {
              respond(receiver.getTargetImageStorageFolder() || null);
            },
          ),
            bridge.registerHandler(
              'images.allImageUploadCallback',
              function (uploadResult, respond) {
                receiver.allImageUploadCallbackForMac(
                  uploadResult.command,
                  uploadResult.success,
                  uploadResult.message,
                  uploadResult.updateMap,
                  uploadResult.sources,
                ),
                  respond && respond();
              },
            ),
            bridge.registerHandler(
              'images.tagetImageStorageFolderExcludeSetting',
              function (unusedParameter1, respond) {
                respond && respond(receiver.getTargetImageStorageFolder(!0));
              },
            ),
            bridge.registerHandler('images.doSetImageCopyToFolder', function (folderPath, respond) {
              receiver.doSetImageCopyToFolder(folderPath), respond && respond();
            }),
            bridge.registerHandler(
              'images.doSetImageCopyToIPic',
              function (unusedParameter1, respond) {
                receiver.doSetImageCopyToFolder('upload', !0), respond && respond();
              },
            ),
            bridge.registerHandler(
              'images.doRemoveImageCopyToFolder',
              function (unusedParameter1, respond) {
                receiver.doRemoveImageCopyToFolder(), respond && respond();
              },
            ),
            bridge.registerHandler('images.doSetImageRootPath', function (rootPath, respond) {
              receiver.doSetImageRootPath(rootPath), respond && respond();
            }),
            bridge.registerHandler(
              'images.prepareUploadAllImagesOnMac',
              function (unusedParameter1, respond) {
                receiver.prepareUploadAllImagesOnMac(respond);
              },
            ),
            bridge.registerHandler('images.insertImage', function (imageUrl, respond) {
              var insertResult = mediaActions.insertURL(imageUrl);
              respond && respond(insertResult);
            }),
            bridge.registerHandler('images.zoomImage', function (zoomValue, respond) {
              var zoomResult = receiver.zoomAction(null, zoomValue);
              respond && respond(zoomResult);
            }),
            bridge.registerHandler('images.switchSyntax', function (pattern, unusedParameter2) {
              receiver.switchPattern(null, pattern);
            }),
            bridge.registerHandler(
              'images.updateLocalRootUrl',
              function (unusedParameter1, unusedParameter2) {
                receiver.updateLocalRootUrl(!0);
              },
            ),
            bridge.registerHandler(
              'images.copyAllImages',
              function ([targetFolder, deleteOriginal], respond) {
                receiver._copyAllImages(targetFolder, deleteOriginal), respond && respond();
              },
            );
        }
      }
      getLocalRootUrlForInsert() {
        return (
          this.editor.docMenu.getLocalRootUrl() ||
          (File.option.useRelativePathForImg && fileIntegration.getCurrentFileFolderPath()) ||
          ''
        );
      }
      getSrcFromDom(element, absoluteSource) {
        return element
          ? element.dataset.isDataSrc && element.querySelector('img')
            ? element.querySelector('img').getAttribute('src')
            : absoluteSource
              ? this.getAbsolutePath(element.dataset.src)
              : element.dataset.src
          : '';
      }
      getAbsolutePath(sourcePath, asFileUrl) {
        if (!sourcePath) return sourcePath;
        var absolutePath = utilities.absolutePathFrom(this.getRealSrc(sourcePath));
        if (asFileUrl) {
          if (!/^[a-z]+:/i.exec(absolutePath)) return 'file://' + absolutePath;
        } else
          (!/^https?:/.exec(absolutePath) ||
            /^data?:/.exec(absolutePath) ||
            /^file?:/.exec(absolutePath)) &&
            (absolutePath = utilities.decodeFromEscapedURL(absolutePath));
        return absolutePath;
      }
      getRealSrc(text, fileUrlsOnly, keepFragment, restoreDeletedAsset) {
        if (!text) return text;
        var fragment = (/#[^.\/\\]+$/.exec(text) || [])[0] || '';
        if (/^data:/.exec(text)) return text;
        if (/^\/\//.exec(text)) return 'http:' + text;
        if (/^https?:\/\//.exec(text)) return text;
        function o(sourcePath) {
          return (
            (sourcePath = (sourcePath = encodeURI(sourcePath).replace(/%5C/g, '\\'))
              .replace(/#[^.\/\\]+$/, '')
              .replace(/#/g, '%23')),
            keepFragment && (sourcePath += fragment),
            sourcePath
          );
        }
        function a(inputText) {
          if (!restoreDeletedAsset || !assetStorage.shouldManageResource(inputText))
            return inputText;
          var filePath = File.isWin ? '\\' : '/',
            assetsPrefix = File.bundle.filePath + filePath + 'assets' + filePath,
            assetName = utilities.trimPathParam(inputText.substring(assetsPrefix.length)),
            deletedAssets = assetStorage.deletedAssetsMap();
          return deletedAssets[assetName]
            ? (reqnode('fs-extra').copy(
                deletedAssets[assetName],
                inputText,
                { errorOnExist: !1 },
                () => {
                  var backupPath = deletedAssets[assetName];
                  delete deletedAssets[assetName],
                    document
                      .querySelectorAll(`[src^="file://${o(backupPath)}"]`)
                      .forEach((item) => {
                        item.src = o(inputText);
                      });
                },
              ),
              deletedAssets[assetName])
            : ((File.bundle.unusedAssets || []).remove(assetName), inputText);
        }
        text = utilities.decodeFromEscapedPath(text);
        try {
          if (/^(file|ftp|https?):(\/\/|\\\\)/gi.exec(text)) return text;
          if (File.isTextBundle() || File.isTextPack()) {
            if (!/^assets[\/\\]/.exec(text)) return '';
            if (File.isMac) return `textbundle://${o(text)}`;
          }
          if (fileUrlsOnly)
            return o(
              (function (sourcePath) {
                if (/^(wk)?file:/.exec(sourcePath))
                  return 'file://' + a(utilities.absolutePathFrom(sourcePath));
              })(text),
            );
          var absolutePathPattern = /^((\/)|(\/\/)|(\\\\)|([a-z]+\:[\\\/]))/i,
            localRootUrl = this.editor.docMenu.getLocalRootUrl();
          if (File.isNode) {
            var pathUtilities = reqnode('path');
            return (!localRootUrl || File.isTextBundle() || File.isTextPack()) &&
              absolutePathPattern.exec(text)
              ? o('file://' + a(text).replace(/^[\/\\]+/, '/'))
              : o(
                  'file://' +
                    a(
                      pathUtilities.resolve(
                        localRootUrl || fileIntegration.getCurrentFileFolderPath() || '',
                        text.replace(/^\s*(\\\\|\/)/, ''),
                      ),
                    ),
                );
          }
          return !localRootUrl && absolutePathPattern.exec(text)
            ? o(
                (function (sourcePath) {
                  return /[a-z]+:/.exec(sourcePath)
                    ? sourcePath
                    : 'file://' + fileIntegration.normalizePath(sourcePath);
                })(a(text || '')),
              )
            : o(
                a(
                  (function (inputText, callbackText) {
                    return (
                      'file://' +
                      fileIntegration.normalizePath(
                        inputText.replace(/^file:\/\//, '').replace(/\/$/, '') +
                          '/' +
                          callbackText.replace(/^\//gi, ''),
                      )
                    );
                  })(localRootUrl || fileIntegration.getCurrentFileFolderPath() || '', text || ''),
                ),
              );
        } catch (error) {}
        return text;
      }
      updateImgRef(referenceName) {
        var inline = this.editor.brush.inline;
        jquery("[data-ref='" + utilities.escapeSelector(referenceName) + "']").each(function () {
          var text = (this.querySelector('.md-content') || {}).textContent;
          void 0 !== text && jquery(this).replaceWith(inline.output(text));
        });
      }
      willUpdateImgRef(referenceName) {
        referenceName &&
          (timerId && clearTimeout(timerId),
          (pendingReferences[referenceName] = !0),
          (referenceUpdateStartedAt = referenceUpdateStartedAt || new Date()),
          new Date() - referenceUpdateStartedAt > 200
            ? setTimeout(
                function () {
                  Object.keys(pendingReferences).map(this.updateImgRef, this);
                }.bind(this),
                10,
              )
            : (timerId = setTimeout(
                function () {
                  Object.keys(pendingReferences).map(this.updateImgRef, this);
                }.bind(this),
                300,
              )));
      }
      startBusyImageLoader() {
        if (window.IntersectionObserver) {
          var items = [];
          this.intersectionObserver = new IntersectionObserver(function (inputItems) {
            (items = []),
              inputItems.forEach((item) => {
                item.intersectionRatio <= 0
                  ? (function (element) {
                      let {
                        naturalHeight: naturalHeight,
                        naturalWidth: naturalWidth,
                        height: renderedHeight,
                      } = element;
                      if (!element.dataset.realSrc) {
                        var currentItems = null;
                        if (naturalHeight * naturalWidth > 5e5 && renderedHeight > 0) {
                          let placeholderSvg = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${naturalWidth} ${naturalHeight}"%3E%3C/svg%3E`;
                          (currentItems = [element, element.src, placeholderSvg]),
                            a(element.style.height) ||
                            a(element.getAttribute('height')) ||
                            a(element.style.width) ||
                            a(element.getAttribute('width'))
                              ? ((element.dataset.fixedSize = !0), currentItems.push(0))
                              : currentItems.push(renderedHeight),
                            items.push(currentItems);
                        }
                      }
                      function a(dimensionValue) {
                        return dimensionValue && 'auto' != dimensionValue;
                      }
                    })(item.target)
                  : (function (element) {
                      if (element.dataset.realSrc) {
                        var currentElement,
                          zoom = '';
                        element.style.zoom &&
                          ((zoom = element.style.zoom),
                          ((currentElement = element.closest('.md-image')).height =
                            `${currentElement.clientHeight}px`),
                          (element.style.zoom = '')),
                          (element.src = element.dataset.realSrc),
                          (element.dataset.realSrc = ''),
                          element.dataset.fixedSize || element.removeAttribute('height'),
                          (element.dataset.fixedSize = ''),
                          currentElement &&
                            requestAnimationFrame(function () {
                              (currentElement.height = ''), (element.style.zoom = zoom);
                            });
                      }
                    })(item.target);
              }),
              items.forEach((item) => {
                (item[0].dataset.realSrc = item[1]),
                  (item[0].src = item[2]),
                  item[3] && item[0].setAttribute('height', item[3]);
              }),
              (items = []);
          });
        }
      }
      tryAddImageToBusyLoader(imageElement) {
        if (!File.isMac) return;
        if (imageElement.dataset.realSrc) return;
        const {
          src: imageSource,
          naturalHeight: naturalHeight,
          naturalWidth: naturalWidth,
        } = imageElement;
        this.intersectionObserver || this.startBusyImageLoader(),
          this.intersectionObserver &&
            (/^file:/.exec(imageSource) && naturalHeight * naturalWidth > 2e5
              ? this.intersectionObserver.observe(imageElement)
              : this.intersectionObserver.unobserve(imageElement));
      }
      async deleteMedia(from, useTrash, deleteCommand, backupPath) {
        var currentFrom = backupPath || (await L(from));
        if (!deleteCommand || currentFrom) {
          mediaActions.recordMediaMoves(null, [currentFrom, from]),
            deleteCommand &&
              (deleteCommand.redo.push({ type: 'deleteMedia', from: from }),
              deleteCommand.undo.unshift({ type: 'restoreMedia', from: currentFrom, to: from }));
          try {
            if (useTrash && (await JSBridge.invoke('shell.trashItem', from))) return;
            File.isNode && (await reqnode('node:fs/promises').unlink(from)),
              File.isMac && (await JSBridge.invoke('path.delete', from));
          } catch (error) {
            console.warn(error);
          }
        } else console.error('Failed to prepare undo / redo for image move / delete');
      }
      restoreMedia(from, destinationPath) {
        if (from)
          try {
            mediaActions.recordMediaMoves(destinationPath);
            var receiver = this;
            File.isNode
              ? reqnode('fs-extra').copySync(from, destinationPath)
              : JSBridge.invoke('path.copyFile', { from: from, to: destinationPath }).then(
                  function (result) {
                    if (result) {
                      var searchValue = receiver.getRealSrc(from, !0, !1);
                      jquery('.md-image.md-img-error img').each(function () {
                        0 == this.src.indexOf(searchValue) && receiver.refreshLocalImgDom(this);
                      });
                    }
                  },
                );
          } catch (error) {}
      }
      refreshLocalImgDom(domNode, cacheTimestamp, refreshErrorsOnly) {
        var i = function (loadEvent) {
          loadEvent.target.removeAttribute('width'),
            loadEvent.target.removeAttribute('height'),
            loadEvent.target.removeEventListener('load', i),
            loadEvent.target.removeEventListener('error', i);
        };
        cacheTimestamp = cacheTimestamp || Math.floor((new Date() - 0) / 1e3);
        var originalSource = (domNode.parentElement || domNode).dataset.src || domNode.dataset.src;
        if (!refreshErrorsOnly || domNode.parentElement.classList.contains('md-img-error')) {
          var attributeValue = this.getRealSrc(originalSource);
          if (attributeValue && /^file:/.exec(attributeValue)) {
            if (
              (failImgCache.remove(attributeValue),
              utilities.fromExternalPath(attributeValue) &&
                ((attributeValue = utilities.file2wkfile(attributeValue)),
                failImgCache.remove(attributeValue)),
              'SOURCE' === domNode.tagName)
            ) {
              this.editor.htmlBlock.resetVideoDom(domNode.parentElement),
                domNode.setAttribute('src', attributeValue);
              var parentElement = domNode.parentElement.parentElement;
              if (parentElement) {
                var previousSibling = domNode.parentElement.previousSibling,
                  outerHTML = domNode.parentElement.outerHTML;
                domNode.parentElement.remove(),
                  setTimeout(() => {
                    previousSibling
                      ? previousSibling.insertAdjacentHTML('afterend', outerHTML)
                      : parentElement.insertAdjacentHTML('afterbegin', outerHTML);
                  }, 0);
              }
              return;
            }
            !domNode.width &&
              !domNode.height &&
              ('VIDEO' === domNode.tagName ? domNode.readyState > 2 : domNode.complete) &&
              domNode.clientWidth &&
              ((domNode.width = domNode.clientWidth),
              (domNode.height = domNode.clientHeight),
              domNode.addEventListener('load', i),
              domNode.addEventListener('error', i)),
              domNode.setAttribute('src', attributeValue + '?lastModify=' + cacheTimestamp),
              'IMG' === domNode.tagName &&
                domNode.parentElement.dataset.src &&
                ((domNode.dataset.localRefresh = !0),
                (domNode.onload = onImageLoadedFunc),
                (domNode.onerror = onImageErrorFunc)),
              'VIDEO' === domNode.tagName && this.editor.htmlBlock.resetVideoDom(domNode);
          }
        }
      }
      refreshLocalImg(forceRefresh) {
        if (forceRefresh || !File.inBusyMode) {
          forceRefresh && ((window.failImgCache = []), (window.loadedImgCache = []));
          var cacheTimestamp = Math.floor((new Date() - 0) / 1e3),
            receiver = this,
            imageElements = jquery('.md-image img'),
            totalPixels = 0,
            refreshErrorsOnly = !1;
          if (!forceRefresh) {
            const pixelThreshold = 1e7;
            imageElements.each(function () {
              totalPixels > pixelThreshold ||
                (totalPixels += (this.naturalHeight || 0) * (this.naturalWidth || 0));
            }),
              (refreshErrorsOnly = totalPixels > pixelThreshold);
          }
          imageElements.each(function () {
            receiver.refreshLocalImgDom(this, cacheTimestamp, refreshErrorsOnly);
          }),
            (imgLastModified = cacheTimestamp),
            refreshErrorsOnly ||
              jquery(
                '.md-htmlblock-container video, .md-htmlblock-container img, .md-htmlblock-container source',
              ).each(function () {
                receiver.refreshLocalImgDom(this, cacheTimestamp, refreshErrorsOnly);
              });
        }
      }
      async reloadAllByNode() {
        await JSBridge.invoke('webContents.clearCache'), this.refreshLocalImg(!0);
      }
      updateLocalRootUrl(forceRefresh) {
        var localRootUrl = this.editor.docMenu.getLocalRootUrl() || '';
        if (forceRefresh || this.editor.localRootUrl != localRootUrl) {
          for (
            var elements = document.querySelectorAll("[md-inline='image']"), itemIndex = 0;
            itemIndex < elements.length;
            itemIndex++
          ) {
            var imageElement = (domNode = elements[itemIndex]).querySelector('img'),
              attributeValue = domNode.getAttribute('data-src');
            if (attributeValue && attributeValue != imageElement.getAttribute('src')) {
              var element = jquery.parseHTML(
                inlineDecoration.decorate({
                  type: documentModel.TYPE.image,
                  markdown: domNode.textContent,
                  alt: imageElement.getAttribute('alt'),
                  href: attributeValue,
                }),
              )[0];
              domNode.dataset.originPath &&
                (element.dataset.originPath = domNode.dataset.originPath),
                domNode.classList.contains('md-on-moving') && element.classList.add('md-on-moving'),
                domNode.classList.contains('md-on-uploading') &&
                  element.classList.add('md-on-uploading'),
                domNode.parentElement.replaceChild(element, domNode);
            }
          }
          var currentElements = document.querySelectorAll('[data-marklyra-watch-src]');
          for (itemIndex = 0; itemIndex < currentElements.length; itemIndex++) {
            var domNode,
              currentSrc = (domNode = currentElements[itemIndex]).dataset.src;
            domNode.getAttribute('src') != currentSrc &&
              ((domNode.src = this.getAbsolutePath(currentSrc, !0)),
              'VIDEO' == domNode.tagName && this.editor.htmlBlock.resetVideoDom(domNode));
          }
        }
      }
      selectComponent(component, deferRegistration) {
        this.editor.undo.endSnap(!0);
        var range = this.editor.selection.getRangy(),
          element = jquery(range.startContainer).closest("[md-inline='image']"),
          imageSyntax = element.text(),
          selectionBookmark = range.getBookmark(element[0]),
          end = imageSyntax.indexOf(']'),
          selectCommand = undoManager.makeEmptyCommand(this.editor.selection.buildUndo());
        if (!selectionBookmark.containerNode) return this.editor.selection.buildUndo();
        'alt' === component
          ? ((selectionBookmark.start = 2), (selectionBookmark.end = end))
          : component
            ? ((selectionBookmark.start = end + 2),
              (selectionBookmark.end = imageSyntax.length - 1))
            : ((selectionBookmark.start = 2), (selectionBookmark.end = end)),
          range.moveToBookmark(selectionBookmark),
          this.editor.selection.setRange(range, !0);
        var selectionSnapshot = this.editor.selection.buildUndo();
        return (
          selectCommand.redo.push(selectionSnapshot),
          !deferRegistration && this.editor.undo.register(selectCommand),
          selectionSnapshot
        );
      }
      prepareUploadAllImagesOnMac(respond) {
        var receiver = this;
        this.validateBeforeUpload().then((result) => {
          if (result) {
            var uploaderType = receiver.getImageUploader(),
              text = receiver.getImageUploaderCommand(uploaderType);
            if (text) {
              'upic' == uploaderType && text.replace('-u', '-s -u');
              var sourcePaths = receiver.buildImageMap();
              respond([!0, sourcePaths, text]),
                sourcePaths.length ||
                  dialogs.showNotification(
                    jquery.localize.getString('No local images found.', 'Panel'),
                    void 0,
                    void 0,
                    void 0,
                    !0,
                  );
            } else respond([!0, [], '']);
          } else respond([!1, [], '']);
        });
      }
      buildImageMap(includeImage, existenceOnly) {
        (imageMap = {}), (includeImage = includeImage || $);
        for (
          var currentImageElement,
            absolutePath,
            imageElement = document.querySelectorAll('.md-image.md-img-loaded'),
            imageElementLength = imageElement.length,
            itemIndex = 0;
          itemIndex < imageElementLength;
          itemIndex++
        )
          if (
            ((currentImageElement = imageElement[itemIndex]),
            (absolutePath = this.getRealSrc(currentImageElement.dataset.src)),
            includeImage(
              (absolutePath = (absolutePath = utilities.absolutePathFrom(absolutePath)).replace(
                /^file:\/\//,
                '',
              )),
            ))
          ) {
            if (existenceOnly) return !0;
            (imageMap[absolutePath] = imageMap[absolutePath] || []),
              imageMap[absolutePath].push(currentImageElement);
          }
        return !existenceOnly && Object.keys(imageMap);
      }
      allImageUploadCallbackForMac(uploaderType, success, message, replacementMap, items) {
        if ('ipic' == uploaderType)
          this.replaceImageMap(replacementMap, success, message, uploaderType);
        else {
          if (!success) return void this.showError(message, 'Failed to upload images:');
          var uploadedUrls = D(message, uploaderType);
          uploadedUrls.length == items.length
            ? ((replacementMap = {}),
              items.forEach((item, itemIndex) => {
                replacementMap[item] = uploadedUrls[itemIndex];
              }),
              this.replaceImageMap(replacementMap, !0, message, uploaderType))
            : this.showError(
                message,
                'Failed to fetch {0} images from: '.replace('{0}', items.length),
              );
        }
      }
      replaceImageMap(replacementMap, success, message, uploaderType) {
        var replaceCommand = undoManager.makeEmptyCommand(this.editor.selection.buildUndo()),
          editor = this.editor,
          set = new Set(),
          failedCount = 0,
          processedCount = 0;
        editor.undo.endSnap(!0),
          Object.keys(replacementMap).forEach(function (item) {
            if (imageMap[item]) {
              processedCount++;
              var currentSrc = replacementMap[item];
              currentSrc != item
                ? imageMap[item].forEach(function (element) {
                    (element.querySelector('img').src = currentSrc),
                      utilities.fromExternalPath(currentSrc) &&
                        (element.querySelector('img').src = utilities.file2wkfile(currentSrc)),
                      element.hasAttribute('data-src') &&
                        element.setAttribute('data-src', currentSrc);
                    var currentText,
                      text,
                      imageNode = editor.findNodeByElem(jquery(element).closest('[cid]')),
                      attributeValue = element.getAttribute('md-inline');
                    if (
                      (!set.has(imageNode) &&
                        DocumentNode.isType(attributeValue, NodeType.image, NodeType.imgtag) &&
                        (set.add(imageNode),
                        replaceCommand.undo.push(undoManager.buildReplaceUndo(imageNode))),
                      (currentText = element.querySelector('.md-content').textContent),
                      attributeValue == NodeType.image)
                    )
                      (text = E(currentText, currentSrc)),
                        (element.querySelector('.md-content').textContent = text);
                    else if (attributeValue == NodeType.imgtag)
                      (text = T(currentText, currentSrc)),
                        (element.querySelector('.md-content').textContent = text);
                    else if (attributeValue == NodeType.refimg) {
                      var match =
                          /^!\[((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*)\]\s*\[([^\]]*)\]/.exec(
                            currentText,
                          ),
                        referenceName = (match[2] || match[1]).replace(/\s+/g, ' '),
                        documentNode = editor.nodeMap.link_list.getNodeByRef(referenceName);
                      if (set.has(documentNode)) return;
                      set.add(documentNode),
                        replaceCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
                        documentNode.set('href', currentSrc),
                        editor.findElemById(documentNode.cid).replaceWith(documentNode.toHTML());
                    }
                  })
                : failedCount++;
            }
          }),
          set.forEach(function (documentNode) {
            documentNode.get('type') !== NodeType.def_link && editor.store(documentNode, !0),
              replaceCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
          }),
          replaceCommand.redo.push(editor.selection.buildUndo()),
          editor.undo.register(replaceCommand);
        var keysLength = Object.keys(imageMap).length;
        (imageMap = {}),
          success
            ? dialogs.showNotification(
                jquery.localize
                  .getString('Successfully uploaded {0} images.')
                  .format(processedCount),
                !1,
                jquery.localize.getString('Undo'),
                function () {
                  editor.undo.undo();
                },
              )
            : processedCount
              ? ('upic' == uploaderType && (processedCount -= failedCount),
                dialogs.showNotification(
                  jquery.localize
                    .getString('Successfully uploaded {0} images, {1} failed.')
                    .format(processedCount, keysLength - processedCount) +
                    ' ' +
                    utilities.truncate(message, 600),
                  !1,
                  jquery.localize.getString('Undo'),
                  function () {
                    editor.undo.undo();
                  },
                ))
              : this.showError(message, 'Failed to upload images:');
      }
      insertLocalImage() {
        function e(sourcePaths) {
          sourcePaths && 0 != sourcePaths.length && mediaActions.insertURLs(sourcePaths);
        }
        File.isLocked ||
          (File.isNode
            ? JSBridge.invoke('dialog.showOpenDialog', {
                filters: [
                  {
                    name: 'Images',
                    extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'svg', 'tiff', 'webp', 'gif'],
                  },
                ],
                properties: ['openFile', 'multiSelections'],
                buttonLabel: 'Select',
              }).then(({ filePaths: filePaths }) => {
                e(filePaths);
              })
            : File.isMac && window.bridge.callHandler('images.insertLocalImage', e));
      }
      shouldTriggerMove(text, searchValue) {
        return (
          void 0 === searchValue && (searchValue = this.getTargetImageStorageFolder(!1, !0)),
          !(
            'upload' == searchValue &&
            'upload' != this.getTargetImageStorageFolderFromSetting() &&
            !this.checkAutoUploadIsAllowed(!0, !0)
          ) &&
            !!text &&
            (/^\s*(https?|ftp):\/\//.exec(text)
              ? File.isTextBundle() || File.isTextPack() || File.option.applyImageMoveForWeb
              : !(
                  !(
                    File.isTextBundle() ||
                    File.isTextPack() ||
                    File.option.applyImageMoveForLocal
                  ) ||
                  /^data:/.exec(text) ||
                  (0 == text.indexOf(searchValue) &&
                    !text.substring(searchValue.length + 1).match(/[\\\/]/g))
                ))
        );
      }
      tryMoveImageDom(imageElement, targetFolder, silent) {
        this.tryMoveImageDoms([imageElement[0]], targetFolder, silent);
      }
      tryMoveImageDoms(imageElements, targetFolder, silent) {
        if (targetFolder && imageElements.length) {
          var imagesBySource = (function (items, getSource) {
            const groupedImages = {};
            return (
              items.forEach((item) => {
                const sourceKey = getSource(item),
                  currentItems = groupedImages[sourceKey];
                currentItems ? currentItems.push(item) : (groupedImages[sourceKey] = [item]);
              }),
              groupedImages
            );
          })(imageElements, (imageElement) => this.getSrcFromDom(imageElement, !0));
          for (var sourcePath in imagesBySource)
            if (this.shouldTriggerMove(sourcePath, targetFolder)) {
              var sourceImages = jquery(imagesBySource[sourcePath]);
              'ipic' == targetFolder || 'upload' == targetFolder
                ? this.uploadAction(sourceImages, !0)
                : O.call(this, sourceImages, targetFolder, sourcePath, void 0, silent);
            }
        }
      }
      prepImageMove(folder, skipPreparation, imageElements, skipConfirmation) {
        var receiver = this,
          lastCursor = File.editor.selection.buildUndo();
        return (
          lastCursor && (File.editor.lastCursor = lastCursor),
          new Promise(async function (resolvePromise, rejectPromise) {
            if (skipPreparation) return resolvePromise();
            function l(message) {
              message && alert(message.message || message), rejectPromise();
            }
            if (
              (void 0 === folder && (folder = receiver.getTargetImageStorageFolder()),
              'upload' == folder)
            )
              return resolvePromise();
            if (!folder) return resolvePromise();
            if (File.isMac)
              'textbundle' == folder && File.isTextBundle()
                ? resolvePromise()
                : bridge.callHandler(
                    'images.prepImageMove',
                    {
                      folder: folder,
                      silent: folder == receiver.getTargetImageStorageFolderFromSetting(),
                    },
                    function (preparationResult) {
                      'success' != preparationResult ? l(preparationResult) : resolvePromise();
                    },
                  );
            else {
              var fileSystem = reqnode('fs-extra'),
                confirmFolderCreation = !1;
              if (
                ('textbundle' === folder && (await File.TextBundle.convertToTextBundleIfNeeded()),
                receiver.getRealTargetImageStorageFolder(folder) &&
                  (confirmFolderCreation = !(File.isTextBundle() || File.isTextPack())),
                skipConfirmation && (confirmFolderCreation = !1),
                confirmFolderCreation &&
                  imageElements &&
                  !Array.from(imageElements)
                    .map((item) => receiver.getSrcFromDom(item, !0))
                    .find((item) => receiver.shouldTriggerMove(item, folder)))
              )
                return void rejectPromise();
              (function (folderPath, requireConfirmation) {
                var fileSystem = reqnode('fs-extra');
                return new Promise(function (inputResolvePromise, inputRejectPromise) {
                  if (!requireConfirmation) return inputResolvePromise();
                  fileSystem.stat(folderPath, function (error) {
                    if (!error) return inputResolvePromise();
                    if ('ENOENT' != error.code) return inputRejectPromise(error.message);
                    var confirmationDialog = jquery('#image-create-folder-confirm')
                      .find('#image-create-folder-target')
                      .text(folderPath)
                      .end()
                      .modal({ backdrop: 'static', keyboard: !1 });
                    (File.isLocked = !0),
                      confirmationDialog
                        .off(
                          'mousedown',
                          '.image-create-folder-dialog-yes, .image-create-folder-dialog-no, .image-create-folder-dialog-help, .close',
                        )
                        .one('mousedown', '.image-create-folder-dialog-yes', function () {
                          confirmationDialog.modal('hide'),
                            (File.isLocked = !1),
                            File.freshMenu(),
                            inputResolvePromise();
                        })
                        .one('mousedown', '.image-create-folder-dialog-no', function () {
                          confirmationDialog.modal('hide'),
                            (File.isLocked = !1),
                            File.freshMenu(),
                            inputRejectPromise(!1);
                        })
                        .one('mousedown', '.close', function () {
                          confirmationDialog.modal('hide'),
                            (File.isLocked = !1),
                            File.freshMenu(),
                            inputRejectPromise(!1);
                        })
                        .on('mousedown', '.image-create-folder-dialog-help', function () {
                          const supportDomain = File.option.useMirrorInCN
                            ? 'marklyraio.cn'
                            : 'marklyra.io';
                          JSBridge.showInBrowser(`https://support.${supportDomain}/Images/`);
                        });
                  });
                });
              })(folder, confirmFolderCreation).then(function () {
                fileSystem.ensureDir(folder, function (directoryError) {
                  File.editor.restoreLastCursor(),
                    directoryError ? l(directoryError) : resolvePromise();
                });
              }, l);
            }
          })
        );
      }
      tryMoveImageInRange(range, silent) {
        var editor = this.editor,
          targetFolder = this.getTargetImageStorageFolder();
        if (targetFolder) {
          this.editor.brush.clearAndPause();
          var imageElements = range.getNodes([document.ELEMENT_NODE], function (element) {
            return (
              'image' == element.getAttribute('md-inline') ||
              'imgtag' == element.getAttribute('md-inline')
            );
          });
          if (!imageElements.length && range) {
            var parentElement = range.commonAncestorContainer.parentElement;
            parentElement &&
              'image' == parentElement.getAttribute('md-inline') &&
              (imageElements = [range.commonAncestorContainer.parentElement]);
          }
          imageElements.length &&
            this.prepImageMove(targetFolder, void 0, imageElements).then(
              function () {
                editor.imgEdit.tryMoveImageDoms(imageElements, targetFolder, silent);
              },
              () => {},
            ),
            this.editor.brush.resume();
        }
      }
      generateAlt(sourcePath) {
        return (fileIntegration.getFileNameFromPath(sourcePath, !0) || '').replace(
          /(^\.)|(\.[^.]+$)/g,
          '',
        );
      }
      insertImageFromURL(sourcePath) {
        var localSrc = sourcePath;
        function n() {
          return File.editor.imgEdit.generateAlt(sourcePath);
        }
        function i() {
          var selection = window.getSelection(),
            leadingSpace = '';
          return (
            !File.editor.sourceView.inSourceMode &&
              selection.startOffset > 0 &&
              (leadingSpace = ' '),
            leadingSpace
          );
        }
        function r(inputSrc, isUpload) {
          var editor = this.editor,
            element = editor.getMarkElem();
          if (!element.length || !editor.stylize.canContainInline(element)) return !1;
          var currentElement,
            isBundleImage = File.isTextBundle() || File.isTextPack() || 'textbundle' == inputSrc,
            altText = n(),
            leadingSpace = i(),
            documentNode = editor.getNode(element.attr('cid')),
            resolvedSource = isBundleImage ? inputSrc : this.resolveImagePath(inputSrc),
            imageMarkdown = leadingSpace + '![' + altText + '](' + resolvedSource + ')',
            range = editor.selection.getRangy();
          if (!range) return null;
          if ((currentElement = jquery(range.startContainer).closest("[md-inline='image']")).length)
            return (
              (isUpload ? window.uploadImageQueue : window.moveImageQueue).add(inputSrc),
              !isBundleImage && P.call(this, currentElement, inputSrc),
              this.selectComponent('alt', isBundleImage),
              (range = editor.selection.getRangy()),
              (currentElement = jquery(range.startContainer).closest("[md-inline='image']")).attr(
                'data-src',
                resolvedSource,
              ),
              currentElement
            );
          var start = range.getBookmark(element[0]).start,
            insertCommand = undoManager.makeEmptyCommand();
          insertCommand.undo.push(editor.selection.buildUndo()),
            userOperations.insertInlineText(
              editor,
              documentNode,
              imageMarkdown,
              start,
              insertCommand,
              !0,
            ),
            (insertCommand.src = inputSrc);
          var nodeElement = editor.findElemById(documentNode.cid);
          return (
            editor.brush.brushNode(documentNode.cid),
            nodeElement.removeClass('md-expand'),
            range.moveToBookmark({
              containerNode: nodeElement[0],
              start: start + imageMarkdown.length,
              end: start + imageMarkdown.length,
            }),
            (currentElement = jquery(range.startContainer).closest('.md-image'))
              .find('img')
              .attr('src', 'file://' + inputSrc),
            editor.undo.register(insertCommand),
            console.debug(window.getSelection()),
            currentElement
          );
        }
        sourcePath =
          File.isTextBundle() || File.isTextPack() ? sourcePath : this.resolveImagePath(sourcePath);
        var insertedElement,
          currentSrc = localSrc,
          receiver = this,
          currentEditor = this.editor,
          targetFolder = this.getTargetImageStorageFolder(!1, !0);
        if (
          (function () {
            var element,
              altText = n(),
              leadingSpace = i(),
              range = currentEditor.selection.getRangy();
            if (
              range &&
              (element = jquery(range.startContainer).closest("[md-inline='image']")).length &&
              !(function (inputRange) {
                if (
                  inputRange.startContainer.parentElement.classList.contains(
                    'md-image-after-src',
                  ) &&
                  inputRange.startContainer.textContent.length == inputRange.startOffset
                )
                  return !0;
              })(range)
            )
              P.call(this, element, localSrc), this.selectComponent('alt');
            else {
              userOperations.pasteHandler(
                this.editor,
                leadingSpace + '![' + altText + '](' + sourcePath + ')',
                !0,
                !0,
              );
              var previousCommand = this.editor.undo.lastRegisteredOperationCommand();
              previousCommand && (previousCommand.src = localSrc);
            }
          }.call(this),
          this.shouldTriggerMove(currentSrc, targetFolder) && targetFolder)
        )
          if ('upload' == targetFolder)
            receiver.editor.brush.clearAndPause(),
              (insertedElement = r.call(receiver, currentSrc, !0)),
              receiver.uploadAction(insertedElement),
              receiver.editor.brush.resume();
          else if (targetFolder)
            return (
              (currentSrc = fileIntegration.normalizePath(currentSrc)),
              this.editor.brush.clearAndPause(),
              (insertedElement = r.call(this, currentSrc)),
              receiver.prepImageMove(targetFolder, File.isMac).then(
                function () {
                  O.call(receiver, insertedElement, targetFolder, currentSrc);
                },
                () => {
                  A(currentSrc);
                },
              ),
              void this.editor.brush.resume()
            );
      }
      doInsertVideoFromURL(videoUrl) {
        var videoHtml = '<video src="{url}"></video>'.replace('{url}', videoUrl);
        userOperations.pasteHandler(this.editor, videoHtml, !1);
      }
      doInsertAudioFromURL(audioUrl) {
        var audioHtml = '<audio src="{url}"></audio>'.replace('{url}', audioUrl);
        userOperations.pasteHandler(this.editor, audioHtml, !1);
      }
      resolveImagePath(textSlice) {
        if (/^\/\//.exec(textSlice)) return 'https://' + textSlice;
        if (/^data:/.exec(textSlice)) return textSlice;
        if (/^[^:]+:\/\//.exec(textSlice)) return textSlice;
        if (/^\/textbundle\//.exec(textSlice))
          return 'assets/' + textSlice.substring('/textbundle/'.length);
        if (!textSlice) return textSlice;
        function t(imageUrl) {
          return File.option.autoEscapeImageURL ? utilities.escapeURL(imageUrl) : imageUrl;
        }
        var localRootUrl = this.getLocalRootUrlForInsert(),
          searchValue = fileIntegration.getCurrentFileFolderPath();
        if (File.isTextBundle())
          (textSlice = utilities.getRelativePath(localRootUrl, textSlice, !1, !1)),
            !localRootUrl ||
              ('/' != textSlice[0] && '\\' != textSlice[0]) ||
              (textSlice = textSlice.substring(1));
        else if (File.isTextPack())
          (textSlice = utilities.getRelativePath(localRootUrl, textSlice, !1, !1)),
            !localRootUrl ||
              ('/' != textSlice[0] && '\\' != textSlice[0]) ||
              (textSlice = textSlice.substring(1));
        else if (localRootUrl && localRootUrl.length) {
          var text = utilities.getRelativePath(
            localRootUrl,
            textSlice,
            !1,
            File.option.relativePathWithDot,
          );
          localRootUrl == searchValue && (text = text.replace(/^\s*(\\\\|\/)/, '')),
            (textSlice =
              (!text.match(/^\.[\/\\]/) && this.editor.docMenu.getLocalRootUrl() ? '/' : '') +
              text);
        } else {
          if (
            !File.option.useRelativePathForImg ||
            !searchValue ||
            0 !== textSlice.indexOf(searchValue)
          )
            return t(textSlice);
          (textSlice = textSlice
            .substring(searchValue.length)
            .replace(/^\//, '')
            .replace(/\\/, '/')),
            File.option.relativePathWithDot && (textSlice = './' + textSlice);
        }
        return File.isWin && (textSlice = textSlice.replace(/[\/\\]{1,2}/g, '/')), t(textSlice);
      }
      getImageUploaderCommand(uploaderType) {
        var executableCommand,
          commandText = (uploaderCommands = uploaderCommands || {
            ipic: 'ipic',
            'picgo-app': 'picgo-app',
            'piclist-app': 'piclist-app',
            upic: '/Applications/uPic.app/Contents/MacOS/uPic -o url -u',
            picsee: '/Applications/Picsee.app/Contents/MacOS/Picsee -u',
            'picgo-cli': File.isNode
              ? ((executableCommand =
                  JSON.stringify(
                    _options.userDataPath +
                      '/picgo/' +
                      (File.isWin
                        ? 'x64' == hostGlobal.process.arch
                          ? 'win64'
                          : 'win32'
                        : 'linux') +
                      '/picgo' +
                      (File.isWin ? '.exe' : ''),
                  ) + ' u'),
                File.isWin && (executableCommand = 'chcp 65001| ' + executableCommand),
                executableCommand)
              : null,
          })[uploaderType || File.option.imageUploader || ''];
        return (
          commandText ||
            'custom' !== File.option.imageUploader ||
            (commandText = (File.option.customImageUploader || '')
              .replace('${filepath}', File.bundle.filePath || '')
              .replace('${filename}', (File.getFileName() || '').replace(/\.[^.\/\\]+$/, ''))),
          commandText || ''
        );
      }
      getImageUploader() {
        var text =
          this.editor.localSettingBridge &&
          this.editor.localSettingBridge.getSetting(copyImagesPreferenceKey);
        return text && !File.editor.sourceView.inSourceMode && 'ipic' == text.toLowerCase()
          ? 'ipic'
          : 'custom' == File.option.imageUploader
            ? this.getImageUploaderCommand(File.option.imageUploader)
            : File.option.imageUploader;
      }
      isFixedImageStorageFolder() {
        function e(folderPath) {
          if (folderPath) return utilities.isAbsolutePath(folderPath);
        }
        if (File.isTextBundle()) return !1;
        if (File.isTextPack()) return !1;
        var storageSetting =
          (this.editor.localSettingBridge &&
            this.editor.localSettingBridge.getSetting(copyImagesPreferenceKey)) ||
          '';
        return (
          'textbundle' !== storageSetting &&
          (storageSetting
            ? e(storageSetting)
            : File.option.defaultImageStorage
              ? e(File.option.defaultImageStorage)
              : void 0)
        );
      }
      assetsFolderForTextBundle() {
        var pathSeparator = File.isWin ? '\\' : '/';
        return this.editor.docMenu.getLocalRootUrl() + pathSeparator + 'assets';
      }
      getTargetImageStorageFolder(documentSettingOnly, allowImageUpload) {
        var text =
          this.editor.localSettingBridge &&
          this.editor.localSettingBridge.getSetting(copyImagesPreferenceKey);
        if (File.isTextBundle() || File.isTextPack()) return 'textbundle';
        if (text && !File.editor.sourceView.inSourceMode) {
          if (
            (File.option.allowImageUpload || allowImageUpload) &&
            ('ipic' == text.toLowerCase() || 'upload' == text.toLowerCase())
          )
            return 'upload';
          var documentFolder = fileIntegration.getCurrentFileFolderPath();
          if (documentFolder)
            return (
              /[\\/]$/.exec(documentFolder[documentFolder.length - 1]) || (documentFolder += '/'),
              fileIntegration.normalizePath(
                documentFolder +
                  text.replace(
                    /\${filename}/g,
                    (File.getFileName() || '').replace(/\.[^.\/\\]+$/, ''),
                  ),
                !0,
              )
            );
        }
        return documentSettingOnly ? null : this.getTargetImageStorageFolderFromSetting();
      }
      getRealTargetImageStorageFolder(targetFolder) {
        return 'textbundle' === targetFolder && File.isNode
          ? this.assetsFolderForTextBundle()
          : targetFolder;
      }
      getTargetImageStorageFolderFromSetting() {
        if (
          'ipic' == File.option.defaultImageStorage ||
          'upload' == File.option.defaultImageStorage
        )
          return 'upload';
        var text = fileIntegration.getCurrentFileFolderPath();
        if (this.cachedFileImageStorage) return this.cachedFileImageStorage;
        var defaultImageStorage = File.option.defaultImageStorage;
        if (
          (text && (/[\\/]$/.exec(text[text.length - 1]) || (text += '/')),
          'folder' == defaultImageStorage)
        ) {
          if (text)
            return (
              (this.cachedFileImageStorage = fileIntegration.normalizePath(
                text.replace(/[\\/]$/, ''),
                !0,
              )),
              this.cachedFileImageStorage
            );
        } else if ('assert' == defaultImageStorage) {
          if (text)
            return (
              (this.cachedFileImageStorage = fileIntegration.normalizePath(text + 'assets', !0)),
              this.cachedFileImageStorage
            );
        } else if ('per-file-assert' == defaultImageStorage) {
          if (text)
            return (
              (this.cachedFileImageStorage = fileIntegration.normalizePath(
                text + File.getFileName().replace(/\.[^.\/\\]+$/, '') + '.assets',
                !0,
              )),
              this.cachedFileImageStorage
            );
        } else {
          if ('textbundle' == defaultImageStorage) return defaultImageStorage;
          if (defaultImageStorage && !DocumentNode.isType(defaultImageStorage, 'upload')) {
            var currentText = File.getFileName();
            if (defaultImageStorage.indexOf('${filename}') > -1) {
              if (!currentText) return null;
              defaultImageStorage = defaultImageStorage.replace(
                /\${filename}/g,
                currentText.replace(/\.[^.\/\\]+$/, ''),
              );
            }
            (
              File.isWin
                ? /^[^\/\\]+:[\/\\]/.exec(defaultImageStorage)
                : /^[\\\/]/.exec(defaultImageStorage)
            )
              ? (this.cachedFileImageStorage = fileIntegration.normalizePath(
                  defaultImageStorage,
                  !0,
                ))
              : text &&
                (this.cachedFileImageStorage = fileIntegration.normalizePath(
                  text + defaultImageStorage,
                  !0,
                ));
          }
        }
        return this.cachedFileImageStorage || '';
      }
      async moveToTextbundleByNode(bundlePath, documentPath) {
        const pathSeparator = File.isWin ? '\\' : '/';
        var assetsFolder = bundlePath + pathSeparator + 'assets';
        const pathUtilities = reqnode('path'),
          fileSystem = reqnode('fs-extra'),
          documentBaseName = pathUtilities.basename(documentPath || '').replace(/^\..+$/, '');
        async function s(moveCommand, sourcePath) {
          await File.editor.imgEdit.deleteMedia(sourcePath, !0, moveCommand);
        }
        var items = this.buildImageMap(),
          moveCommand = await this._copyAllImages(assetsFolder, !0),
          singleDocumentFolder = await (async function () {
            for (
              var directoryPath = pathUtilities.dirname(documentPath),
                folderEntries = await fileSystem.readdir(directoryPath),
                documentCount = 0,
                entryIndex = 0;
              entryIndex < folderEntries.length;
              entryIndex++
            )
              if (
                (File.SupportedTextFiles.indexOf(fileIntegration.getExtension(folderEntries[1])) >
                  -1 && documentCount++,
                documentCount > 1)
              )
                return null;
            return directoryPath;
          })(),
          filteredItems = items.filter(
            (item) =>
              !(
                0 == item.indexOf(assetsFolder + File.isWin ? '\\' : '/') ||
                !S(item) ||
                (0 === pathUtilities.dirname(item).indexOf(pathSeparator + documentBaseName)
                  ? (s(moveCommand, item), 1)
                  : singleDocumentFolder &&
                    0 === item.indexOf(item + pathSeparator) &&
                    (s(moveCommand, item), 1))
              ),
          );
        filteredItems.length &&
          filteredItems.forEach(function (item) {
            s(moveCommand, item);
          });
      }
      async onFileMoved(oldDocumentPath, text) {
        if (((this.cachedFileImageStorage = void 0), this.editor.localSettingBridge)) {
          var receiver = this,
            currentText = this.getTargetImageStorageFolder();
          text !== currentText &&
            text &&
            currentText &&
            utilities.pathByDeleteLastComponent(text) ==
              utilities.pathByDeleteLastComponent(oldDocumentPath) &&
            receiver.buildImageMap(r, !0) &&
            (await (async function (folderPath) {
              try {
                if (File.isNode) {
                  var fileSystem = reqnode('node:fs/promises');
                  if (await fileSystem.stat(folderPath)) return !0;
                } else if (File.isMac) return await JSBridge.invoke('shell.isFolder', folderPath);
              } catch (error) {
                return !1;
              }
            })(text)) &&
            (await (async function () {
              var displayFolder = utilities.getFolder(currentText),
                mountFolder = File.getMountFolder();
              0 == currentText.lastIndexOf(mountFolder) &&
                (displayFolder = currentText.substr(mountFolder.length + 1));
              var confirmationMessage = jquery.localize
                .getString(
                  'Would you like to update image references and move image files to %@ ?',
                  'Panel',
                )
                .replace('%@', displayFolder);
              return await receiver.shouldContinue(
                confirmationMessage,
                'noWarningForUpdateImageReference',
              );
            })()) &&
            (await this._copyAllImages(currentText, !0, r, !0),
            (async function (folderPath) {
              if (File.isNode)
                try {
                  var fileSystem = reqnode('node:fs/promises');
                  await fileSystem.rmdir(folderPath, { recursive: !1, force: !1 });
                } catch (error) {
                  console.debug(error);
                }
              else File.isMac && (await JSBridge.invoke('shell.removeIfEmpty', folderPath));
            })(text));
        }
        function r(sourcePath) {
          return 0 == sourcePath.indexOf(text.replace(/[\\\/]$/, '') + (File.isWin ? '\\' : '/'));
        }
      }
      revealInFinder() {
        var imageSource = jquery('.md-expand img').attr('src') || '';
        if (/^(wk)?file:/.exec(imageSource)) {
          var absolutePath = utilities.absolutePathFrom(imageSource);
          JSBridge.showInFinder(absolutePath);
        } else /^https?:/.exec(imageSource) && JSBridge.showInBrowser(imageSource);
      }
      async copyImage() {
        var imageElement = jquery('.md-expand.md-img-loaded');
        if (imageElement) {
          var currentPath = this.getSrcFromDom(imageElement[0], !0);
          File.isNode &&
            (await (async function () {
              var clipboardImage,
                { clipboard: clipboard, nativeImage: nativeImage } = reqnode('electron');
              (clipboardImage = /^https?:/.exec(currentPath)
                ? nativeImage.createFromBuffer(
                    Buffer.from(await (await fetch(currentPath)).arrayBuffer()),
                  )
                : nativeImage.createFromPath(currentPath)),
                clipboard.writeText(currentPath);
              var outerHTML = (imageElement.find('img')[0] || {}).outerHTML;
              outerHTML && clipboard.writeHTML(outerHTML),
                /\.gif/.exec(currentPath)
                  ? clipboard.writeImage(nativeImage.createFromBuffer(clipboardImage.toBitmap()))
                  : clipboard.writeImage(clipboardImage);
            })()),
            File.isMac &&
              (await (async function () {
                var otherData = {};
                if (/\.svg$/.exec(currentPath)) {
                  var outerHTML = (imageElement.find('img')[0] || {}).outerHTML;
                  outerHTML && (otherData['text/html'] = outerHTML),
                    (otherData['image/svg+xml'] = await (await fetch(currentPath)).text());
                }
                bridge.callHandler('clipboard.writeImage', {
                  otherData: otherData,
                  path: currentPath,
                });
              })());
        }
      }
      moveImageTo_(imageElements, targetFolder, sourcePath, filenameDefined, deleteOriginal) {
        O.call(this, imageElements, targetFolder, sourcePath, filenameDefined, !1, deleteOriginal);
      }
      async deleteImageAction(deleteOriginal) {
        var imageElement = jquery('.md-expand.md-img-loaded');
        if (imageElement) {
          var editor = this.editor,
            sourcePath = this.getSrcFromDom(imageElement[0], !0);
          editor.selection.selectAllElem(imageElement);
          var deleteCommand = userOperations.backspaceHandler(editor, null, 'delSelection', !1, !1);
          if (deleteCommand && deleteCommand == editor.undo.lastRegisteredOperationCommand()) {
            if (deleteOriginal && S(sourcePath)) {
              if (
                !File.isTextBundle() &&
                !File.isTextPack() &&
                !(await this.shouldContinue(
                  'Delete original image file?',
                  'noWarningForDeleteImage',
                ))
              )
                return;
            } else deleteOriginal = !1;
            await this.deleteMedia(sourcePath, !0, deleteCommand);
          }
        }
      }
      async shouldContinue(message, suppressionSetting) {
        if (File.option[suppressionSetting]) return !0;
        var { response: buttonIndex, checkboxChecked: dontAskAgain } =
          await dialogs.showWarningDialog(jquery.localize.getString(message), !0);
        return (
          0 == buttonIndex &&
          (dontAskAgain &&
            (JSBridge.execForAll(
              'window.File && File.option && (File.option.' + suppressionSetting + ' = true)',
            ),
            JSBridge.putSetting(suppressionSetting, !0)),
          !0)
        );
      }
      async copyToSelectedFolderAction(deleteOriginal) {
        var imageElement = jquery('.md-expand.md-img-loaded');
        if (imageElement) {
          var destinationPath,
            sourcePath = this.getSrcFromDom(imageElement[0], !0),
            suggestedName = fileIntegration.getFileNameFromPath(sourcePath, !0);
          if (/^data:/.exec(sourcePath)) {
            var imageExtension = (/^data:[\\\/]*image\/([^;]+)/.exec(sourcePath) || [])[1];
            (suggestedName = imageElement.find('img').attr('alt') || new Date() + ''),
              imageExtension && (suggestedName = suggestedName + '.' + imageExtension);
          }
          if (deleteOriginal && S(sourcePath)) {
            if (
              !(await this.shouldContinue(
                'Move image will delete the image file at original path, are you sure to continue?',
                'noWarningForMoveImage',
              ))
            )
              return;
          } else deleteOriginal = !1;
          (destinationPath = File.isMac
            ? await JSBridge.invoke('images.selectImageSavePath', {
                defaultName: (deleteOriginal ? sourcePath : suggestedName) || '',
                absolutePath:
                  sourcePath ||
                  File.editor.imgEdit.cachedFileImageStorage ||
                  File.mountFolder_ ||
                  '',
              })
            : (
                await JSBridge.invoke('dialog.showSaveDialog', {
                  title: jquery.localize.getString('Copy and update image source to…', 'Panel'),
                  defaultPath:
                    (deleteOriginal || File.isLinuxSnap ? sourcePath : suggestedName) || '',
                  properties: ['showOverwriteConfirmation'],
                })
              ).filePath) &&
            destinationPath != sourcePath &&
            this.moveImageTo_(imageElement, destinationPath, sourcePath, !0, deleteOriginal);
        }
      }
      async copyToTargetFolderAction(deleteOriginal) {
        this.editor.brush.clearAndPause();
        var imageElement = jquery('.md-expand.md-img-loaded');
        if (imageElement) {
          var sourcePath = this.getSrcFromDom(imageElement[0], !0),
            targetFolder = this.getTargetImageStorageFolder(),
            receiver = this;
          if (deleteOriginal && S(sourcePath)) {
            if (
              !(await receiver.shouldContinue(
                'Move image will delete the image file at original path, are you sure to continue?',
                'noWarningForMoveImage',
              ))
            )
              return;
          } else deleteOriginal = !1;
          sourcePath &&
            this.prepImageMove(targetFolder, File.isMac).then(
              function () {
                receiver.moveImageTo_(
                  imageElement,
                  targetFolder,
                  sourcePath,
                  void 0,
                  deleteOriginal,
                );
              },
              () => {},
            ),
            this.editor.brush.resume();
        }
      }
      switchPattern(element, useHtmlTag, validateAttributes, recordHistory) {
        if (!(element = element || jquery('.md-expand.md-image')).length) return !1;
        var replacementElement,
          imageElement = element.find('img');
        if (recordHistory) {
          var nodeId = element.closest('[cid]').attr('cid');
          this.editor.undo.addSnap(nodeId, SnapFlag.NONE);
        }
        var renderedHtml,
          imageToken = {
            type: useHtmlTag ? NodeType.imgtag : NodeType.image,
            title: imageElement.attr('title'),
            alt: imageElement.attr('alt') || '',
            src: element.attr('data-src') || imageElement.attr('src'),
          },
          currentPattern = element.attr('md-inline');
        if (useHtmlTag) {
          if (currentPattern == NodeType.imgtag) return !1;
          var imgElement = document.createElement('img');
          return (
            imgElement.setAttribute('src', imageToken.src),
            imageToken.alt && imgElement.setAttribute('alt', imageToken.alt),
            imageToken.title && imgElement.setAttribute('title', imageToken.title),
            (imageToken.markdown = imgElement.outerHTML
              .replace(/<\/img>$/, '')
              .replace(/\s*>$/, ' />')
              .replace(/&amp;/g, '&')),
            (renderedHtml = inlineDecoration.decorateImage(
              imageToken,
              imageToken.markdown,
              imageToken.src,
            )),
            (replacementElement = jquery(renderedHtml)),
            element.replaceWith(replacementElement),
            recordHistory &&
              ((nodeId = element.closest('[cid]').attr('cid')),
              this.editor.undo.addSnap(nodeId, SnapFlag.NONE)),
            [imageToken, replacementElement]
          );
        }
        if (currentPattern == NodeType.image) return !1;
        if (currentPattern == NodeType.imgtag && validateAttributes)
          for (var attributePattern = /(\w+)\s*=\s*(["']).+?\2/g; attributePattern.exec(void 0); )
            if (!['src', 'title', 'alt'].exec((void 0)[1].toLowerCase())) return !1;
        var textParts = [
          '![' + imageToken.alt.replace(/]/g, '') + '](',
          imageToken.src,
          (imageToken.title ? JSON.stringify(title) : '') + ')',
        ];
        return (
          (imageToken.markdown = textParts.join('')),
          (renderedHtml = inlineDecoration.decorateImage(
            imageToken,
            imageToken.markdown,
            imageToken.src,
            textParts,
          )),
          (replacementElement = jquery(renderedHtml)),
          element.replaceWith(replacementElement),
          recordHistory && this.editor.undo.addSnap(nodeId, SnapFlag.REPLACE),
          [imageToken, replacementElement]
        );
      }
      ensureOneImg(imageElement) {
        if ((imageElement = imageElement || jquery('.md-expand.md-img-loaded')))
          return 1 == imageElement.length
            ? imageElement
            : (this.editor.brush.expand(!0, !0, !0), jquery('.md-expand.md-img-loaded'));
      }
      addStyle(element, styleProperty, styleValue) {
        if ((element = this.ensureOneImg(element))) {
          var nodeId = element.closest('[cid]').attr('cid');
          if (
            (this.editor.undo.addSnap(nodeId, SnapFlag.NONE),
            styleValue || element.attr('md-inline') == NodeType.imgtag)
          ) {
            var imageToken,
              imageElement = element.find('img');
            if (element.attr('md-inline') != NodeType.imgtag) {
              var conversionResult = this.switchPattern(element, !0, !1, !0);
              conversionResult &&
                ((imageToken = conversionResult[0]), (element = conversionResult[1]));
            } else
              imageToken = {
                type: NodeType.imgtag,
                title: imageElement.attr('title'),
                alt: imageElement.attr('alt'),
                src: element.attr('data-src') || imageElement.attr('src'),
                markdown: element.text(),
              };
            var imgElement = document.createElement('img'),
              hasStyleAttribute = !1;
            (imageToken.markdown = imageToken.markdown.replace(
              /(style\s*=\s*)(['"])(.*?)\2/,
              function (unusedParameter1, attributePrefix, unusedParameter3, styleText) {
                imgElement.setAttribute('style', styleText || ''),
                  (hasStyleAttribute = !0),
                  (imgElement.style[styleProperty] = styleValue);
                var attributeValue = imgElement.getAttribute('style');
                return attributeValue ? attributePrefix + JSON.stringify(attributeValue) : '';
              },
            )),
              hasStyleAttribute ||
                (imageToken.markdown = imageToken.markdown
                  .replace(/(\s*\/?>)/, ' style="' + styleProperty + ':' + styleValue + ';" $1')
                  .replace(/\s+\/>$/, ' />'));
            var renderedHtml = inlineDecoration.decorateImage(
                imageToken,
                imageToken.markdown,
                imageToken.src,
              ),
              replacementElement = jquery(renderedHtml);
            element.replaceWith(replacementElement),
              replacementElement.find('img').click(),
              this.editor.undo.addSnap(nodeId, SnapFlag.REPLACE);
          }
        }
      }
      zoomAction(imageElement, zoomValue) {
        (imageElement = imageElement || jquery('.md-expand.md-img-loaded')) &&
          this.addStyle(imageElement, 'zoom', '100%' == zoomValue ? '' : zoomValue);
      }
      quickUploadValidation(showWarning) {
        var uploaderType = this.getImageUploader();
        if (uploaderType) return uploaderType;
        if (showWarning) {
          var message = jquery.localize.getString(
            'Please set an image uploader in Preferences panel before using this function.',
            'Panel',
          );
          File.isMac
            ? bridge.callHandler('controller.showErrorDialog', message)
            : dialogs.showDialog({ message: message });
        }
        return !1;
      }
      validateBeforeUpload() {
        var receiver = this;
        return new Promise(function (resolvePromise) {
          var uploaderType = receiver.quickUploadValidation(!0);
          uploaderType
            ? File.isMac && 'ipic' == uploaderType
              ? bridge.callHandler('images.iPicValidateBeforeUpload', resolvePromise)
              : resolvePromise(!0)
            : resolvePromise(!1);
        });
      }
      uploadAction(element, skipDimensionCache) {
        if ((element = element || jquery('.md-expand.md-img-loaded'))) {
          var receiver = this;
          this.validateBeforeUpload().then((result) => {
            var sourcePath = utilities.absolutePathFrom(
              receiver.getRealSrc(element.attr('data-src')),
            );
            if (!result) return A(sourcePath), void _(element);
            R.call(receiver, element, sourcePath).then(
              function (inputResult) {
                skipDimensionCache || k(inputResult, sourcePath, element),
                  (element = A(sourcePath)),
                  P.call(receiver, element, inputResult);
              },
              function (inputResult) {
                (element = A(sourcePath)),
                  P.call(receiver, element, sourcePath),
                  inputResult &&
                    setTimeout(function () {
                      receiver.showError(inputResult);
                    }, 500);
              },
            );
          });
        }
      }
      showError(message, title) {
        message = message.message || message;
        var errorTitle = title || 'Failed to upload image. Error Message:';
        dialogs.showNotification(
          `${jquery.localize.getString(errorTitle)} <code style='font-size:0.8em'>${utilities.escape(utilities.truncate(message, 600))}</code>`,
          !0,
          jquery.localize.getString('Learn More', 'Panel'),
          function () {
            const supportDomain = File.option.useMirrorInCN ? 'marklyraio.cn' : 'marklyra.io';
            JSBridge.showInBrowser(`https://support.${supportDomain}/Upload-Image/`);
          },
        );
      }
      async _copyAllImages(
        targetFolder,
        deleteOriginal,
        includeImage,
        skipConfirmation,
        reuseImageMap,
        forTextBundle,
      ) {
        var receiver = this;
        if (
          targetFolder &&
          (!deleteOriginal ||
            skipConfirmation ||
            (await receiver.shouldContinue(
              'Move image will delete the image file at original path, are you sure to continue?',
              'noWarningForMoveImage',
            )))
        ) {
          var moveCommand,
            pendingMediaChanges,
            items = reuseImageMap
              ? Object.keys(imageMap)
              : this.buildImageMap(function (sourcePath) {
                  return (
                    0 != sourcePath.indexOf(targetFolder + File.isWin ? '\\' : '/') &&
                    (!includeImage || includeImage(sourcePath))
                  );
                }),
            currentItems = [],
            searchValue =
              _options.userDataPath + (File.iwWin ? '\\' : '/') + 'marklyra-user-images';
          dialogs.hideNotification();
          try {
            await Promise.all(
              items.map((item) =>
                N.call(receiver, jquery(imageMap[item]), targetFolder, item, !1, !0).then(
                  ([destinationPath, backupPath]) => {
                    currentItems.push([item, destinationPath, backupPath]);
                  },
                ),
              ),
            ),
              (pendingMediaChanges = Promise.all(
                currentItems.map((item) => {
                  var [sourcePath, destinationPath, backupPath] = item;
                  if (void 0 !== destinationPath) {
                    var imageElements = A(sourcePath);
                    k(destinationPath, sourcePath, imageElements.find('img')[0]);
                    var updateCommand = P.call(receiver, imageElements, destinationPath, !0);
                    moveCommand
                      ? undoManager.append(moveCommand, updateCommand)
                      : (moveCommand = updateCommand);
                    var deleteSource = deleteOriginal;
                    return (
                      forTextBundle &&
                        (deleteSource = deleteOriginal || 0 == sourcePath.indexOf(searchValue)),
                      I(moveCommand, sourcePath, destinationPath, backupPath, deleteSource)
                    );
                  }
                }),
              ).then(function () {
                return moveCommand;
              }));
          } catch (error) {
            console.error(error);
          }
          if (moveCommand) {
            this.editor.undo.register(moveCommand);
            var notificationTemplate = deleteOriginal
                ? 'Images moved to %@.'
                : 'Images copied to %@.',
              notificationMessage = jquery.localize
                .getString(notificationTemplate, 'Panel')
                .replace('%@', `<code>${utilities.getFolder(targetFolder)}</code>`);
            forTextBundle &&
              (notificationMessage = jquery.localize.getString('Images saved to TextBundle')),
              forTextBundle || dialogs.showNotification(notificationMessage, !0),
              await pendingMediaChanges;
          }
        }
      }
      moveAllImages() {
        return this.copyAllImages(!0);
      }
      async copyAllImages(deleteOriginal) {
        var defaultPath = this.getTargetImageStorageFolder();
        if (File.isNode) {
          var targetFolder = ((
            await JSBridge.invoke('dialog.showOpenDialog', {
              defaultPath: defaultPath,
              title: jquery.localize.getString('Select Container Folder'),
              properties: ['openDirectory', 'createDirectory'],
              buttonLabel: jquery.localize.getString('Select'),
            })
          ).filePaths || [])[0];
          this._copyAllImages(targetFolder, deleteOriginal);
        } else bridge.callHandler('images.startCopyAllImages', [defaultPath, deleteOriginal || !1]);
      }
      uploadAllImages() {
        if (this.quickUploadValidation(!0)) {
          var items = this.buildImageMap(),
            receiver = this;
          B.call(this, items)
            .then((result) => {
              dialogs.hideNotification();
              var replacementMap = {};
              items.forEach((item, itemIndex) => {
                replacementMap[item] = result[itemIndex];
              }),
                receiver.replaceImageMap(replacementMap, !0);
            })
            .catch((error) => {
              receiver.showError(error, 'Failed to upload images:');
            }),
            Object.keys(items).length
              ? (dialogs.hideNotification(),
                dialogs.showProcessingNotification(
                  jquery.localize.getString('Uploading in progress…', 'Panel'),
                ))
              : dialogs.showNotification(
                  jquery.localize.getString('No local images found.', 'Panel'),
                  void 0,
                  void 0,
                  void 0,
                  !0,
                );
        }
      }
      contextMenuItems(element) {
        var text = (element.getAttribute('src') || '').replace(/\?(.+)$/, ''),
          items = [],
          canCopyImage = !element.closest('.md-img-error'),
          currentText = this.getTargetImageStorageFolder();
        currentText &&
          'upload' != currentText &&
          (currentText = currentText.replace(/[\\\/]$/, '') + (File.isWin ? '\\' : '/'));
        var searchValue = utilities.escapeURL(currentText);
        if (
          currentText &&
          'upload' != currentText &&
          (0 != text.replace(/^file:\/\//, '').indexOf(searchValue) ||
            text
              .replace(/^file:\/\//, '')
              .substring(searchValue.length + 1)
              .match(/[\\\/]/g))
        ) {
          var localText = utilities.getFolder(currentText);
          localText && items.push('copyImgToTarget-' + localText.replace(/\|/g, ''));
        }
        var match = /^(wk)?file:\/\//.exec(text);
        canCopyImage &&
          (items.push('copyImgToSelect'),
          match &&
            (localText && items.push('moveImgToTarget-' + localText.replace(/\|/g, '')),
            items.push('moveImgToSelect')),
          'upload' == currentText ? items.unshift('uploadImg') : items.push('uploadImg'),
          items.push('copyImg')),
          match
            ? items.unshift('revealImgInFinder')
            : /^https?:\/\//.exec(text) && items.unshift('revealImgInBrowser');
        var attributeValue = element.getAttribute('data-pixel-ratio');
        return (
          attributeValue &&
            1 != (attributeValue -= 0) &&
            items.push('zoomImgTo-' + utilities.floatToPercent(1 / attributeValue)),
          items.push('zoomImg'),
          element.closest("[md-inline='image']") && items.push('imgSyntaxMarkdown'),
          element.closest("[md-inline='imgtag']") && items.push('imgSyntaxHTML'),
          match ? items.push('deleteImgFile') : items.push('deleteImg'),
          items
        );
      }
      afterUserInsertImage(domNode) {
        var lastUrl = (domNode.getAttribute('src') || '').replace(/\?(.+)$/, '');
        if (
          lastUrl != this.lastUrl &&
          domNode.parentElement &&
          domNode.parentElement.contains(window.getSelection().anchorNode)
        ) {
          var items = [],
            editor = this.editor,
            attributeValue = domNode.getAttribute('data-pixel-ratio'),
            a = (zoomValue) =>
              1 != (zoomValue = (zoomValue || 1) - 0) && zoomValue != 1 / 0 && !isNaN(zoomValue);
          if (
            (attributeValue
              ? a((attributeValue -= 0)) &&
                items.push({
                  label: 'Zoom Image to %@',
                  key: 'zoom-smart',
                  variable: utilities.floatToPercent(1 / attributeValue),
                })
              : File.isMac
                ? bridge.callHandler(
                    'images.getScale',
                    lastUrl.replace(/^wkfile:/, 'file:'),
                    function (inputAttributeValue) {
                      a(inputAttributeValue) &&
                        (domNode.setAttribute('data-pixel-ratio', inputAttributeValue),
                        items.splice(items.length - 1, 0, {
                          label: 'Zoom Image to %@',
                          key: 'zoom-smart',
                          variable: utilities.floatToPercent(1 / inputAttributeValue),
                        }),
                        d());
                    },
                  )
                : File.isNode &&
                  imageScale
                    .getImageScaleByElection(lastUrl, domNode.nativeHeight)
                    .then(function (inputAttributeValue) {
                      a(inputAttributeValue) &&
                        (domNode.setAttribute('data-pixel-ratio', inputAttributeValue),
                        items.splice(items.length - 1, 0, {
                          label: 'Zoom Image to %@',
                          key: 'zoom-smart',
                          variable: utilities.floatToPercent(1 / inputAttributeValue),
                        }),
                        d());
                    }),
            !File.isTextBundle() && !File.isTextPack())
          ) {
            var text = this.getTargetImageStorageFolder();
            if (text && 'upload' != text) {
              (text = text.replace(/[\\\/]$/, '') + (File.isWin ? '\\' : '/')),
                (lastUrl = utilities.absolutePathFrom(lastUrl));
              var variable,
                searchValue = utilities.escapeURL(text);
              0 != lastUrl.replace(/[\\]/g, '/').indexOf(searchValue) ||
              lastUrl.substring(searchValue.length + 1).match(/[\\\/]/g)
                ? (variable = utilities.getFolder(text)) &&
                  items.push({ label: 'Copy to %@', key: 'copy-img-to-target', variable: variable })
                : (this.lastUrl = lastUrl);
            }
            items.push({ label: 'Copy Image to…', key: 'select-img-target' }),
              variable &&
                items.push({ label: 'Move to %@', key: 'move-img-to-target', variable: variable }),
              items.push({ label: 'Rename or Move Image to…', key: 'select-img-target-move' }),
              File.isTextBundle() ||
                File.isTextPack() ||
                !this.quickUploadValidation() ||
                ('upload' == text
                  ? items.unshift({ label: 'Upload Image', key: 'upload-img' })
                  : items.push({ label: 'Upload Image', key: 'upload-img' }));
          }
          items.push({ label: 'Zoom Image', key: 'zoom-img', hasExtraMenu: !0 }),
            items.length && d();
        }
        function d() {
          var range = editor.selection.getRangy(),
            element = jquery(range.endContainer).closest("[md-inline='image']");
          range &&
            element.length &&
            !element.hasClass('md-on-moving') &&
            !element.hasClass('md-on-uploading') &&
            ((editor.lastCursor = editor.selection.buildUndo(range)),
            editor.contextMenu.showCustom(items, 'image'));
        }
      }
      toggleUploadForFile() {
        if ('upload' == this.getTargetImageStorageFolder(!0)) this.doRemoveImageCopyToFolder(!1);
        else if (this.quickUploadValidation(!0)) {
          if (File.isNode && !this.checkAutoUploadIsAllowed(!0)) return;
          this.doSetImageCopyToFolder('upload', !0);
        }
      }
      checkAutoUploadIsAllowed(showWarning, respectSuppression) {
        if (File.option.allowImageUpload) return !0;
        if (showWarning) {
          if (respectSuppression && File.option.noWarnigUploadDisabled) return !1;
          dialogs.showNativeDialog({
            message: jquery.localize
              .getString(
                'The option `%@` must be enabled first to automatically upload images.',
                'Panel',
              )
              .replace(
                '%@',
                jquery.localize.getString(
                  'Allow upload images automatically based on YAML settings',
                  'Panel',
                ),
              ),
            buttons: [
              jquery.localize.getString('Enable this feature on preferences panel', 'Panel'),
              jquery.localize.getString('Close'),
            ],
            checkbox: respectSuppression
              ? jquery.localize.getString('Do not show this again', 'Panel')
              : null,
            callback: function (buttonIndex, dontAskAgain) {
              0 === buttonIndex &&
                (File.isNode
                  ? File.megaMenu.highlight('image-setting-group')
                  : bridge.callHandler('setting.showAndHighlight', 'image-setting-group')),
                dontAskAgain &&
                  (JSBridge.putSetting('noWarnigUploadDisabled', !0),
                  JSBridge.execForAll('File.option.noWarnigUploadDisabled = true;'));
            },
          });
        }
        return !1;
      }
      toggleCopyToFolder() {
        var receiver = this,
          targetFolder = this.getTargetImageStorageFolder(!0),
          documentFolder = fileIntegration.getCurrentFileFolderPath();
        if (
          (File.refreshImageCopyStatus(!0), !File.isLocked && !File.editor.sourceView.inSourceMode)
        )
          if (targetFolder) this.doRemoveImageCopyToFolder(!1);
          else {
            if (!documentFolder)
              return void JSBridge.invoke('dialog.showMessageBox', {
                title: jquery.localize.getString('Document must be saved first.', 'Panel'),
                message: jquery.localize.getString(
                  'MarkLyra will copy newly inserted image to folder by selected relative path, so please save the file first.',
                  'Panel',
                ),
                defaultId: 0,
                cancelId: 0,
                buttons: [jquery.localize.getString('OK')],
              });
            JSBridge.invoke('dialog.showOpenDialog', {
              defaultPath: fileIntegration.getCurrentFileFolderPath(),
              title: jquery.localize.getString('Select Container Folder'),
              properties: ['openDirectory', 'createDirectory'],
              buttonLabel: jquery.localize.getString('Select'),
            }).then(({ filePaths: folderPaths }) => {
              folderPaths &&
                0 != folderPaths.length &&
                receiver.doSetImageCopyToFolder(folderPaths[0]);
            });
          }
      }
      toggleUseImageRootPath() {
        var localRootUrl = this.editor.docMenu.getLocalRootUrl(),
          editor = this.editor;
        localRootUrl
          ? this.editor.docMenu.removeProperty('marklyra-root-url')
          : JSBridge.invoke('dialog.showOpenDialog', {
              defaultPath: fileIntegration.getCurrentFileFolderPath(),
              title: jquery.localize.getString('Select Container Folder'),
              properties: ['openDirectory', 'createDirectory'],
              buttonLabel: jquery.localize.getString('Select'),
            }).then(({ filePaths: folderPaths }) => {
              folderPaths &&
                0 != folderPaths.length &&
                editor.imgEdit.doSetImageRootPath(folderPaths[0]);
            });
      }
      doSetImageCopyToFolder(folderPath, uploadImages) {
        (folderPath = uploadImages
          ? 'upload'
          : utilities.getRelativePath(fileIntegration.getCurrentFileFolderPath(), folderPath, !0)),
          this.editor.docMenu.writeProperty(copyImagesPreferenceKey, folderPath);
      }
      doSetImageRootPath(folderPath) {
        this.editor.docMenu.writeProperty(
          'marklyra-root-url',
          utilities.getRelativePath(fileIntegration.getCurrentFileFolderPath(), folderPath, !0),
        );
      }
      doRemoveImageCopyToFolder(deferRegistration) {
        return this.editor.docMenu.removeProperty(copyImagesPreferenceKey, deferRegistration);
      }
    };
  },
);
